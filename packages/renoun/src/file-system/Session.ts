import { normalizeSlashes } from '../utils/path.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import { CacheStore, hashString, stableStringify } from './CacheStore.ts'
import { getCacheStorePersistence } from './CacheStoreSqlite.ts'
import type { FileSystem } from './FileSystem.ts'
import { FileSystemSnapshot, type Snapshot } from './Snapshot.ts'
import type { DirectorySnapshot } from './directory-snapshot.ts'

const sessionsByFileSystem = new WeakMap<object, Map<string, Session>>()
const snapshotGenerationByFileSystem = new WeakMap<object, number>()
const snapshotFamilyByFileSystem = new WeakMap<object, Map<string, string>>()

function getSessionFamilyId(
  snapshotId: string,
  familyMap: Map<string, string>,
): string {
  return familyMap.get(snapshotId) ?? snapshotId
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
    const familyMap =
      snapshotFamilyByFileSystem.get(fileSystem) ?? new Map<string, string>()

    if (!sessionsByFileSystem.has(fileSystem)) {
      sessionsByFileSystem.set(fileSystem, sessionMap)
    }
    if (!snapshotFamilyByFileSystem.has(fileSystem)) {
      snapshotFamilyByFileSystem.set(fileSystem, familyMap)
    }

    const targetFamilyId =
      targetSnapshot instanceof GeneratedSnapshot
        ? targetSnapshot.baseSnapshotId
        : getSessionFamilyId(targetSnapshot.id, familyMap)

    familyMap.set(targetSnapshot.id, targetFamilyId)

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
    const familyMap = snapshotFamilyByFileSystem.get(fileSystem)

    if (snapshotId) {
      if (!sessionMap) {
        return
      }
      if (!familyMap || familyMap.size === 0) {
        return
      }

      const snapshotFamilyId = getSessionFamilyId(snapshotId, familyMap)
      const familySessions = Array.from(sessionMap.entries()).filter(
        ([id]) =>
          getSessionFamilyId(id, familyMap) === snapshotFamilyId
      )

      if (familySessions.length === 0) {
        return
      }

      const currentGeneration =
        snapshotGenerationByFileSystem.get(fileSystem) ?? 0
      snapshotGenerationByFileSystem.set(fileSystem, currentGeneration + 1)

      for (const [id, session] of familySessions) {
        session.reset()
        sessionMap.delete(id)
        familyMap?.delete(id)
      }

      if (sessionMap.size === 0) {
        sessionsByFileSystem.delete(fileSystem)
        snapshotFamilyByFileSystem.delete(fileSystem)
      }

      return
    }

    const currentGeneration = snapshotGenerationByFileSystem.get(fileSystem) ?? 0
    snapshotGenerationByFileSystem.set(fileSystem, currentGeneration + 1)

    if (!sessionMap) {
      return
    }

    for (const session of sessionMap.values()) {
      session.reset()
    }

    sessionMap.clear()
    sessionsByFileSystem.delete(fileSystem)
    snapshotFamilyByFileSystem.delete(fileSystem)
  }

  readonly #fileSystem: FileSystem
  readonly snapshot: Snapshot
  readonly inflight = new Map<string, Promise<unknown>>()
  readonly cache: CacheStore
  readonly directorySnapshots = new Map<
    string,
    DirectorySnapshot<any, any>
  >()

  readonly #functionIds = new WeakMap<Function, string>()
  #nextFunctionId = 0

  private constructor(fileSystem: FileSystem, snapshot: Snapshot) {
    this.#fileSystem = fileSystem
    this.snapshot = snapshot

    const projectRoot = resolveSessionProjectRoot(fileSystem)
    this.cache = new CacheStore({
      snapshot: this.snapshot,
      persistence: getCacheStorePersistence({ projectRoot }),
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
    const normalized = this.#normalizeSignatureValue(value, prefix, new WeakSet())
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

    for (const key of this.directorySnapshots.keys()) {
      const delimiterIndex = key.indexOf('|')
      const directoryPrefix = delimiterIndex === -1 ? key : key.slice(0, delimiterIndex)

      if (!directoryPrefix.startsWith('dir:')) {
        continue
      }

      const directoryPath = directoryPrefix.slice('dir:'.length)
      if (pathsIntersect(directoryPath, normalizedPath)) {
        this.directorySnapshots.delete(key)
      }
    }
  }

  reset(): void {
    this.inflight.clear()
    this.directorySnapshots.clear()
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
  const normalized = normalizeSlashes(relativePath)
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')

  return normalized === '' ? '.' : normalized
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
  if (typeof repoRoot === 'string' && repoRoot.startsWith('/')) {
    try {
      return getRootDirectory(repoRoot)
    } catch {
      return repoRoot
    }
  }

  try {
    const absoluteRoot = fileSystem.getAbsolutePath('.')
    return getRootDirectory(absoluteRoot)
  } catch {
    try {
      return getRootDirectory()
    } catch {
      return process.cwd()
    }
  }
}
