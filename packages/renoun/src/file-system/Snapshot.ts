import { createHash } from 'node:crypto'

import { normalizeSlashes } from '../utils/path.ts'
import type { FileReadableStream, FileSystem } from './FileSystem.ts'
import type { DirectoryEntry } from './types.ts'

const SNAPSHOT_VERSION = 1
// Paths resolved via metadata/missing IDs are revalidated on a short interval.
// Explicit Session.invalidatePath() calls still invalidate immediately.
const METADATA_CONTENT_ID_MAX_AGE_MS = 250
const MISSING_CONTENT_ID_MAX_AGE_MS = 100

type ContentIdStrategy = 'metadata' | 'file-content' | 'directory-content' | 'missing'

interface CachedContentId {
  promise: Promise<string>
  strategy?: ContentIdStrategy
  updatedAt: number
}

export interface Snapshot {
  readonly id: string
  readDirectory(path?: string): Promise<DirectoryEntry[]>
  readFile(path: string): Promise<string>
  readFileBinary(path: string): Promise<Uint8Array>
  readFileStream(path: string): FileReadableStream
  fileExists(path: string): Promise<boolean>
  getFileLastModifiedMs(path: string): Promise<number | undefined>
  getFileByteLength(path: string): Promise<number | undefined>
  isFilePathGitIgnored(path: string): boolean
  isFilePathExcludedFromTsConfigAsync(
    path: string,
    isDirectory?: boolean
  ): Promise<boolean>
  contentId(path: string): Promise<string>
  invalidatePath(path: string): void
  invalidateAll?(): void
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  const object = value as Record<string, unknown>
  const keys = Object.keys(object).sort()
  const entries: string[] = []

  for (const key of keys) {
    entries.push(`${JSON.stringify(key)}:${stableStringify(object[key])}`)
  }

  return `{${entries.join(',')}}`
}

function hashString(input: string): string {
  return createHash('sha1').update(input).digest('hex')
}

export class FileSystemSnapshot implements Snapshot {
  readonly #fileSystem: FileSystem
  readonly #contentIds = new Map<string, CachedContentId>()

  readonly id: string

  constructor(fileSystem: FileSystem, providedId?: string) {
    this.#fileSystem = fileSystem

    if (providedId) {
      this.id = providedId
      return
    }

    const descriptor = {
      version: SNAPSHOT_VERSION,
      fileSystem: fileSystem.constructor?.name ?? 'UnknownFileSystem',
      projectOptions: safeGetProjectOptions(fileSystem),
      cacheIdentity: safeGetCacheIdentity(fileSystem),
      ref: safeGetStringField(fileSystem, 'ref'),
      repository: safeGetStringField(fileSystem, 'repository'),
      repoRoot: safeGetStringField(fileSystem, 'repoRoot'),
    }

    this.id = `fs:${hashString(stableStringify(descriptor)).slice(0, 16)}`
  }

  readDirectory(path?: string): Promise<DirectoryEntry[]> {
    return this.#fileSystem.readDirectory(path)
  }

  readFile(path: string): Promise<string> {
    return this.#fileSystem.readFile(path)
  }

  readFileBinary(path: string): Promise<Uint8Array> {
    return this.#fileSystem.readFileBinary(path)
  }

  readFileStream(path: string): FileReadableStream {
    return this.#fileSystem.readFileStream(path)
  }

  fileExists(path: string): Promise<boolean> {
    return this.#fileSystem.fileExists(path)
  }

  getFileLastModifiedMs(path: string): Promise<number | undefined> {
    return this.#fileSystem.getFileLastModifiedMs(path)
  }

  getFileByteLength(path: string): Promise<number | undefined> {
    return this.#fileSystem.getFileByteLength(path)
  }

  isFilePathGitIgnored(path: string): boolean {
    return this.#fileSystem.isFilePathGitIgnored(path)
  }

  isFilePathExcludedFromTsConfigAsync(
    path: string,
    isDirectory = false
  ): Promise<boolean> {
    return this.#fileSystem.isFilePathExcludedFromTsConfigAsync(
      path,
      isDirectory
    )
  }

  async contentId(path: string): Promise<string> {
    const normalizedPath = this.#normalizeSnapshotPath(path)
    const cached = this.#contentIds.get(normalizedPath)

    if (cached) {
      if (cached.strategy === 'metadata') {
        const age = Date.now() - cached.updatedAt
        if (age <= METADATA_CONTENT_ID_MAX_AGE_MS) {
          return cached.promise
        }
        this.#contentIds.delete(normalizedPath)
      } else if (cached.strategy === 'missing') {
        const age = Date.now() - cached.updatedAt
        if (age <= MISSING_CONTENT_ID_MAX_AGE_MS) {
          return cached.promise
        }
        this.#contentIds.delete(normalizedPath)
      } else {
        return cached.promise
      }
    }

    const cachedEntry: CachedContentId = {
      promise: Promise.resolve('missing'),
      updatedAt: Date.now(),
    }
    const promise = this.#createContentId(
      this.#getContentIdLookupPaths(path, normalizedPath)
    ).then((result) => {
      cachedEntry.strategy = result.strategy
      cachedEntry.updatedAt = Date.now()
      return result.id
    })
    cachedEntry.promise = promise
    this.#contentIds.set(normalizedPath, cachedEntry)

    return promise
  }

  invalidatePath(path: string): void {
    const normalizedPath = this.#normalizeSnapshotPath(path)
    if (normalizedPath === '.') {
      this.#contentIds.clear()
      return
    }

    for (const cachedPath of this.#contentIds.keys()) {
      if (
        cachedPath === normalizedPath ||
        cachedPath.startsWith(`${normalizedPath}/`) ||
        normalizedPath.startsWith(`${cachedPath}/`)
      ) {
        this.#contentIds.delete(cachedPath)
      }
    }
  }

  invalidateAll(): void {
    this.#contentIds.clear()
  }

  async #createContentId(pathCandidates: string[]): Promise<{
    id: string
    strategy: ContentIdStrategy
  }> {
    for (const path of pathCandidates) {
      const [lastModifiedMs, byteLength] = await Promise.all([
        this.getFileLastModifiedMs(path).catch(() => undefined),
        this.getFileByteLength(path).catch(() => undefined),
      ])

      if (lastModifiedMs !== undefined && byteLength !== undefined) {
        return {
          id: `mtime:${lastModifiedMs};size:${byteLength}`,
          strategy: 'metadata',
        }
      }

      try {
        const bytes = await this.readFileBinary(path)
        const hash = createHash('sha1').update(bytes).digest('hex')
        return {
          id: `sha1:${hash}`,
          strategy: 'file-content',
        }
      } catch {
        // Continue and treat the path as a potential directory.
      }

      try {
        const entries = await this.readDirectory(path)
        const listingHash = createHash('sha1')

        const normalizedEntries = entries
          .map((entry) => ({
            path: this.#normalizeSnapshotPath(entry.path),
            isDirectory: Boolean(entry.isDirectory),
            isFile: Boolean(entry.isFile),
          }))
          .sort((first, second) => first.path.localeCompare(second.path))

        for (const entry of normalizedEntries) {
          listingHash.update(
            `${entry.path}|${entry.isDirectory ? 1 : 0}|${entry.isFile ? 1 : 0}\n`
          )
        }

        return {
          id: `dir:${listingHash.digest('hex')}`,
          strategy: 'directory-content',
        }
      } catch {
        // Continue with the next path candidate.
      }
    }

    return {
      id: 'missing',
      strategy: 'missing',
    }
  }

  #normalizeSnapshotPath(path: string): string {
    const relativePath = this.#fileSystem.getRelativePathToWorkspace(path)
    const normalized = normalizeSlashes(relativePath)
      .replace(/^\.\/+/, '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')

    return normalized === '' ? '.' : normalized
  }

  #getContentIdLookupPaths(path: string, normalizedPath: string): string[] {
    const candidates: string[] = []
    const seen = new Set<string>()

    const addCandidate = (candidate: string) => {
      const normalizedCandidate = normalizeSlashes(candidate)
      if (!normalizedCandidate || seen.has(normalizedCandidate)) {
        return
      }
      seen.add(normalizedCandidate)
      candidates.push(normalizedCandidate)
    }

    // Prefer workspace-relative paths for file systems like git/in-memory.
    addCandidate(normalizedPath)
    // Fall back to the original input path for Node-style absolute paths.
    addCandidate(path)

    return candidates
  }
}

function safeGetProjectOptions(fileSystem: FileSystem): unknown {
  try {
    return fileSystem.getProjectOptions()
  } catch {
    return undefined
  }
}

function safeGetCacheIdentity(fileSystem: FileSystem): unknown {
  const candidate = (fileSystem as any).getCacheIdentity

  if (typeof candidate !== 'function') {
    return undefined
  }

  try {
    return candidate.call(fileSystem)
  } catch {
    return undefined
  }
}

function safeGetStringField(
  value: object,
  key: string
): string | undefined {
  const candidate = (value as any)[key]
  return typeof candidate === 'string' ? candidate : undefined
}
