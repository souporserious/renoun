import { resolve } from 'node:path'
import { realpathSync } from 'node:fs'

import { isAbsolutePath, normalizePathKey } from '../utils/path.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import { CacheStore, hashString, stableStringify } from './CacheStore.ts'
import { getCacheStorePersistence } from './CacheStoreSqlite.ts'
import type { FileSystem } from './FileSystem.ts'
import { FileSystemSnapshot, type Snapshot } from './Snapshot.ts'
import type { DirectorySnapshot } from './directory-snapshot.ts'

const sessionsByFileSystem = new WeakMap<object, Map<string, Session>>()
const snapshotGenerationByFileSystem = new WeakMap<object, number>()
const snapshotParentByFileSystem = new WeakMap<object, Map<string, string>>()

function collectSnapshotFamily(
  snapshotId: string,
  parentMap: Map<string, string>
): Set<string> {
  const family = new Set<string>()
  const queue: string[] = [snapshotId]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || family.has(current)) {
      continue
    }

    family.add(current)

    const parent = parentMap.get(current)
    if (parent) {
      queue.push(parent)
    }

    for (const [childId, childParentId] of parentMap) {
      if (childParentId === current) {
        queue.push(childId)
      }
    }
  }

  return family
}

export class Session {
  static for(fileSystem: FileSystem, snapshot?: Snapshot): Session {
    const generation = snapshotGenerationByFileSystem.get(fileSystem) ?? 0
    const baseSnapshot = snapshot ?? new FileSystemSnapshot(fileSystem)
    const targetSnapshot =
      generation > 0
        ? new GeneratedSnapshot(baseSnapshot, generation)
        : baseSnapshot
    const sessionMap =
      sessionsByFileSystem.get(fileSystem) ?? new Map<string, Session>()
    const parentMap =
      snapshotParentByFileSystem.get(fileSystem) ?? new Map<string, string>()

    if (!sessionsByFileSystem.has(fileSystem)) {
      sessionsByFileSystem.set(fileSystem, sessionMap)
    }
    if (!snapshotParentByFileSystem.has(fileSystem)) {
      snapshotParentByFileSystem.set(fileSystem, parentMap)
    }

    if (targetSnapshot instanceof GeneratedSnapshot) {
      parentMap.set(targetSnapshot.id, targetSnapshot.baseSnapshotId)
    }

    const existing = sessionMap.get(targetSnapshot.id)
    if (existing) {
      return existing
    }

    const created = new Session(fileSystem, targetSnapshot)
    sessionMap.set(targetSnapshot.id, created)
    return created
  }

  static reset(fileSystem: FileSystem, snapshotId?: string): void {
    const sessionMap = sessionsByFileSystem.get(fileSystem)
    const parentMap = snapshotParentByFileSystem.get(fileSystem)

    if (snapshotId) {
      if (!sessionMap) {
        return
      }
      if (!parentMap) {
        return
      }

      const family = collectSnapshotFamily(snapshotId, parentMap)
      const familySessions = Array.from(sessionMap.entries()).filter(
        ([id]) => family.has(id)
      )

      if (familySessions.length === 0) {
        if (process.env['NODE_ENV'] !== 'test') {
          console.warn(
            `[renoun] Session.reset(${String(snapshotId)}) did not match any active session family. No caches were invalidated.`
          )
        }
        return
      }

      const currentGeneration =
        snapshotGenerationByFileSystem.get(fileSystem) ?? 0
      snapshotGenerationByFileSystem.set(fileSystem, currentGeneration + 1)

      for (const [id, session] of familySessions) {
        session.reset()
        sessionMap.delete(id)
        parentMap.delete(id)
      }

      if (sessionMap.size === 0) {
        sessionsByFileSystem.delete(fileSystem)
        snapshotParentByFileSystem.delete(fileSystem)
      }

      return
    }

    const currentGeneration =
      snapshotGenerationByFileSystem.get(fileSystem) ?? 0
    snapshotGenerationByFileSystem.set(fileSystem, currentGeneration + 1)

    if (!sessionMap) {
      return
    }

    for (const session of sessionMap.values()) {
      session.reset()
    }

    sessionMap.clear()
    sessionsByFileSystem.delete(fileSystem)
    snapshotParentByFileSystem.delete(fileSystem)
  }

  readonly #fileSystem: FileSystem
  readonly snapshot: Snapshot
  readonly inflight = new Map<string, Promise<unknown>>()
  readonly cache: CacheStore
  readonly directorySnapshots = new Map<string, DirectorySnapshot<any, any>>()
  readonly directorySnapshotBuilds = new Map<
    string,
    Promise<{
      snapshot: DirectorySnapshot<any, any>
      shouldIncludeSelf: boolean
    }>
  >()

  readonly #functionIds = new WeakMap<Function, string>()
  #nextFunctionId = 0

  private constructor(fileSystem: FileSystem, snapshot: Snapshot) {
    this.#fileSystem = fileSystem
    this.snapshot = snapshot

    const projectRoot = shouldUseSessionCachePersistence()
      ? resolveSessionProjectRoot(fileSystem)
      : undefined
    const persistence = projectRoot
      ? getCacheStorePersistence({ projectRoot })
      : undefined

    this.cache = new CacheStore({
      snapshot: this.snapshot,
      persistence,
      inflight: this.inflight,
    })
  }

  getFunctionId(value: unknown, prefix = 'fn'): string {
    if (typeof value !== 'function') {
      return `${prefix}:none`
    }

    const existing = this.#functionIds.get(value)
    if (existing) {
      return existing
    }

    this.#nextFunctionId += 1
    const generated = `${prefix}:${this.#nextFunctionId}`
    this.#functionIds.set(value, generated)
    return generated
  }

  createValueSignature(value: unknown, prefix = 'value'): string {
    const normalized = this.#normalizeSignatureValue(
      value,
      prefix,
      new WeakSet()
    )
    return hashString(stableStringify(normalized)).slice(0, 16)
  }

  createDirectorySnapshotKey(options: {
    directoryPath: string
    mask: number
    filterSignature: string
    sortSignature: string
    basePathname?: string | null
    rootPath?: string
  }): string {
    const directoryPath = normalizeSessionPath(
      this.#fileSystem,
      options.directoryPath
    )
    const digest = this.createValueSignature({
      mask: options.mask,
      filterSignature: options.filterSignature,
      sortSignature: options.sortSignature,
      basePathname: options.basePathname ?? null,
      rootPath: options.rootPath ?? '',
    })
    return `dir:${directoryPath}|${digest}`
  }

  invalidatePath(path: string): void {
    const normalizedPath = normalizeSessionPath(this.#fileSystem, path)

    this.snapshot.invalidatePath(path)

    const expiredKeys = new Set<string>()

    for (const key of this.directorySnapshots.keys()) {
      const delimiterIndex = key.indexOf('|')
      const directoryPrefix =
        delimiterIndex === -1 ? key : key.slice(0, delimiterIndex)

      if (!directoryPrefix.startsWith('dir:')) {
        continue
      }

      const directoryPath = directoryPrefix.slice('dir:'.length)
      if (pathsIntersect(directoryPath, normalizedPath)) {
        this.directorySnapshots.delete(key)
        expiredKeys.add(key)
      }
    }

    for (const key of this.directorySnapshotBuilds.keys()) {
      const delimiterIndex = key.indexOf('|')
      const directoryPrefix =
        delimiterIndex === -1 ? key : key.slice(0, delimiterIndex)

      if (!directoryPrefix.startsWith('dir:')) {
        continue
      }

      const directoryPath = directoryPrefix.slice('dir:'.length)
      if (pathsIntersect(directoryPath, normalizedPath)) {
        this.directorySnapshotBuilds.delete(key)
        expiredKeys.add(key)
      }
    }

    for (const key of expiredKeys) {
      void this.cache.delete(key)
    }
  }

  reset(): void {
    this.inflight.clear()
    this.directorySnapshots.clear()
    this.directorySnapshotBuilds.clear()
    this.cache.clearMemory()
    if (typeof this.snapshot.invalidateAll === 'function') {
      this.snapshot.invalidateAll()
      return
    }

    this.snapshot.invalidatePath('.')
  }

  #normalizeSignatureValue(
    value: unknown,
    prefix: string,
    visited: WeakSet<object>
  ): unknown {
    if (typeof value === 'function') {
      return this.getFunctionId(value, prefix)
    }

    if (value === null || typeof value !== 'object') {
      return value
    }

    if (visited.has(value)) {
      return '[Circular]'
    }

    visited.add(value)

    if (Array.isArray(value)) {
      return value.map((entry) =>
        this.#normalizeSignatureValue(entry, prefix, visited)
      )
    }

    const object = value as Record<string, unknown>
    const normalizedObject: Record<string, unknown> = {}
    const keys = Object.keys(object).sort()

    for (const key of keys) {
      normalizedObject[key] = this.#normalizeSignatureValue(
        object[key],
        prefix,
        visited
      )
    }

    return normalizedObject
  }
}

class GeneratedSnapshot implements Snapshot {
  readonly #base: Snapshot
  readonly id: string

  constructor(base: Snapshot, generation: number) {
    this.#base = base
    this.id = `${base.id}:g${generation}`
  }

  get baseSnapshotId(): string {
    return this.#base.id
  }

  readDirectory(path?: string) {
    return this.#base.readDirectory(path)
  }

  readFile(path: string) {
    return this.#base.readFile(path)
  }

  readFileBinary(path: string) {
    return this.#base.readFileBinary(path)
  }

  readFileStream(path: string) {
    return this.#base.readFileStream(path)
  }

  fileExists(path: string) {
    return this.#base.fileExists(path)
  }

  getFileLastModifiedMs(path: string) {
    return this.#base.getFileLastModifiedMs(path)
  }

  getFileByteLength(path: string) {
    return this.#base.getFileByteLength(path)
  }

  isFilePathGitIgnored(path: string) {
    return this.#base.isFilePathGitIgnored(path)
  }

  isFilePathExcludedFromTsConfigAsync(path: string, isDirectory?: boolean) {
    return this.#base.isFilePathExcludedFromTsConfigAsync(path, isDirectory)
  }

  contentId(path: string) {
    return this.#base.contentId(path)
  }

  invalidatePath(path: string) {
    this.#base.invalidatePath(path)
  }

  invalidateAll() {
    if (typeof this.#base.invalidateAll === 'function') {
      this.#base.invalidateAll()
      return
    }

    this.#base.invalidatePath('.')
  }
}

function normalizeSessionPath(fileSystem: FileSystem, path: string): string {
  const relativePath = fileSystem.getRelativePathToWorkspace(path)
  return normalizePathKey(relativePath)
}

function pathsIntersect(firstPath: string, secondPath: string): boolean {
  if (firstPath === '.' || secondPath === '.') {
    return true
  }

  return (
    firstPath === secondPath ||
    firstPath.startsWith(`${secondPath}/`) ||
    secondPath.startsWith(`${firstPath}/`)
  )
}

function resolveSessionProjectRoot(fileSystem: FileSystem): string {
  const repoRoot = (fileSystem as any).repoRoot
  if (typeof repoRoot === 'string' && isAbsolutePath(repoRoot)) {
    const resolvedRoot = resolveCanonicalPath(repoRoot)
    if (process.env['RENOUN_DEBUG_SESSION_ROOT'] === '1') {
      // eslint-disable-next-line no-console
      console.log('[renoun-debug] resolveSessionProjectRoot(repoRoot)', {
        repoRoot,
        resolved: resolvedRoot,
      })
    }
    return resolvedRoot
  }

  let absoluteRoot: string | undefined
  try {
    absoluteRoot = fileSystem.getAbsolutePath('.')
  } catch (error) {
    if (process.env['RENOUN_DEBUG_SESSION_ROOT'] === '1') {
      // eslint-disable-next-line no-console
      console.log('[renoun-debug] resolveSessionProjectRoot(getAbsolutePath failed)', {
        repoRoot: typeof repoRoot === 'string' ? repoRoot : undefined,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (!absoluteRoot) {
    absoluteRoot = typeof repoRoot === 'string' ? resolve(repoRoot) : resolve('.')
  }

  try {
    const rootDirectory = getRootDirectory(absoluteRoot)
    return resolveCanonicalPath(rootDirectory)
  } catch (error) {
    if (process.env['RENOUN_DEBUG_SESSION_ROOT'] === '1') {
      // eslint-disable-next-line no-console
      console.log('[renoun-debug] resolveSessionProjectRoot(fallback)', {
        error: error instanceof Error ? error.message : String(error),
        absoluteRoot,
      })
    }
    return resolveCanonicalPath(absoluteRoot)
  }
}

function resolveCanonicalPath(pathToResolve: string): string {
  try {
    return realpathSync(pathToResolve)
  } catch {
    return resolve(pathToResolve)
  }
}

function shouldUseSessionCachePersistence(): boolean {
  const explicit = process.env['RENOUN_FS_CACHE']

  if (explicit === '1' || explicit?.toLowerCase() === 'true') {
    return true
  }

  if (explicit === '0' || explicit?.toLowerCase() === 'false') {
    return false
  }

  return true
}
