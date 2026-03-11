import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'

import {
  isDevelopmentEnvironment,
  isCiEnvironment,
  isStrictHermeticFileSystemModeFromEnv,
} from '../utils/env.ts'
import {
  isAbsolutePath,
  normalizePathKey,
  normalizeSlashes,
} from '../utils/path.ts'
import { reportBestEffortError } from '../utils/best-effort.ts'
import { hashString, stableStringify } from '../utils/stable-serialization.ts'
import type { FileReadableStream, FileSystem } from './FileSystem.ts'
import type { DirectoryEntry } from './types.ts'
import {
  WorkspaceChangeLookupCache,
  createFileSystemWorkspaceChangeLookupCache,
} from './workspace-change-lookup-cache.ts'

const SNAPSHOT_VERSION = 1
const METADATA_CONTENT_ID_MAX_AGE_MS = 250
const METADATA_COLLISION_GUARD_WINDOW_MS = 1_000
const MISSING_CONTENT_ID_MAX_AGE_MS = 100
const WORKSPACE_TOKEN_LOOKUP_CACHE_TTL_MS = 250
const WORKSPACE_CHANGED_PATHS_LOOKUP_CACHE_TTL_MS = 250

type ContentIdStrategy =
  | 'file-system-content-id'
  | 'metadata'
  | 'metadata-guarded'
  | 'file-content'
  | 'directory-content'
  | 'missing'

export interface SnapshotContentIdOptions {
  fresh?: boolean
  kind?: 'any' | 'file'
  strictHermetic?: boolean
}

interface CachedContentId {
  promise: Promise<string>
  strategy?: ContentIdStrategy
  id?: string
  strictHermetic?: boolean
  updatedAt: number
}

function sanitizeAnalysisOptions(analysisOptions: unknown): unknown {
  if (
    !analysisOptions ||
    typeof analysisOptions !== 'object' ||
    Array.isArray(analysisOptions)
  ) {
    return analysisOptions
  }

  const options = analysisOptions as Record<string, unknown>
  if (
    options['useInMemoryFileSystem'] !== true ||
    typeof options['analysisScopeId'] !== 'string'
  ) {
    return analysisOptions
  }

  const { analysisScopeId: _analysisScopeId, ...stableOptions } = options
  return stableOptions
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
  getRelativePathToWorkspace(path: string): string
  contentId(path: string, options?: SnapshotContentIdOptions): Promise<string>
  getWorkspaceChangeToken?(rootPath: string): Promise<string | null>
  getWorkspaceChangedPathsSinceToken?(
    rootPath: string,
    previousToken: string
  ): Promise<ReadonlySet<string> | null>
  getRecentlyInvalidatedPaths?(): ReadonlySet<string> | undefined
  invalidatePath(path: string): void
  invalidatePaths?(paths: Iterable<string>): void
  invalidateAll?(): void
  onInvalidate(listener: (path: string) => void): () => void
}

export class FileSystemSnapshot implements Snapshot {
  readonly #fileSystem: FileSystem
  readonly #contentIds = new Map<string, CachedContentId>()
  readonly #workspaceChangeLookupCache: WorkspaceChangeLookupCache
  readonly #invalidateListeners = new Set<(path: string) => void>()

  readonly id: string

  constructor(fileSystem: FileSystem, providedId?: string) {
    this.#fileSystem = fileSystem
    this.#workspaceChangeLookupCache = createFileSystemWorkspaceChangeLookupCache({
      fileSystem: this.#fileSystem,
      getWorkspaceTokenTtlMs: () => resolveWorkspaceTokenLookupCacheTtlMs(),
      getWorkspaceChangedPathsTtlMs: () =>
        resolveWorkspaceChangedPathsLookupCacheTtlMs(),
      serveStaleWhileRevalidate: isDevelopmentEnvironment(),
      normalizeRootPath: (rootPath) => this.#normalizeSnapshotPath(rootPath),
      normalizeChangedPath: (changedPath) => {
        return isAbsolutePath(changedPath)
          ? this.#normalizeSnapshotPath(changedPath)
          : normalizePathKey(changedPath)
      },
      clearChangedPathsWhenTtlDisabled: true,
    })

    if (providedId) {
      this.id = providedId
      return
    }

    const descriptor = {
      version: SNAPSHOT_VERSION,
      fileSystem: fileSystem.constructor?.name ?? 'UnknownFileSystem',
      analysisOptions: safeGetAnalysisOptions(fileSystem),
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

  getRelativePathToWorkspace(path: string): string {
    return this.#fileSystem.getRelativePathToWorkspace(path)
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

  async contentId(
    path: string,
    options: SnapshotContentIdOptions = {}
  ): Promise<string> {
    const normalizedPath = this.#normalizeSnapshotPath(path)
    const forceFresh = options.fresh === true
    const strictHermetic = resolveStrictHermeticMode(options.strictHermetic)
    const cached = this.#contentIds.get(normalizedPath)
    let previousMetadataId: string | undefined

    if (cached && !forceFresh) {
      if (cached.strictHermetic !== strictHermetic) {
        this.#contentIds.delete(normalizedPath)
      } else if (
        cached.strategy === 'metadata' ||
        cached.strategy === 'metadata-guarded'
      ) {
        const age = Date.now() - cached.updatedAt
        if (age <= METADATA_CONTENT_ID_MAX_AGE_MS) {
          return cached.promise
        }
        previousMetadataId =
          typeof cached.id === 'string' && cached.id.startsWith('mtime:')
            ? cached.id
            : undefined
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
    } else if (
      cached &&
      cached.strictHermetic === strictHermetic &&
      (cached.strategy === 'metadata' || cached.strategy === 'metadata-guarded')
    ) {
      previousMetadataId =
        typeof cached.id === 'string' && cached.id.startsWith('mtime:')
          ? cached.id
          : undefined
    }

    const cachedEntry: CachedContentId = {
      promise: Promise.resolve('missing'),
      strictHermetic,
      updatedAt: Date.now(),
    }
    const promise = this.#createContentId(
      this.#getContentIdLookupPaths(path, normalizedPath),
      {
        previousMetadataId,
        kind: options.kind,
        strictHermetic,
      }
    ).then((result) => {
      cachedEntry.strategy = result.strategy
      cachedEntry.id = result.id
      cachedEntry.updatedAt = Date.now()
      return result.id
    })
    cachedEntry.promise = promise
    this.#contentIds.set(normalizedPath, cachedEntry)

    return promise
  }

  async getWorkspaceChangeToken(rootPath: string): Promise<string | null> {
    return this.#workspaceChangeLookupCache.getWorkspaceChangeToken(rootPath)
  }

  async getWorkspaceChangedPathsSinceToken(
    rootPath: string,
    previousToken: string
  ): Promise<ReadonlySet<string> | null> {
    return this.#workspaceChangeLookupCache.getWorkspaceChangedPathsSinceToken(
      rootPath,
      previousToken
    )
  }

  invalidatePath(path: string): void {
    this.invalidatePaths([path])
  }

  invalidatePaths(paths: Iterable<string>): void {
    const snapshotPathByNormalizedPath = new Map<string, string>()

    for (const path of paths) {
      if (typeof path !== 'string' || path.length === 0) {
        continue
      }

      const normalizedPath = this.#normalizeSnapshotPath(path)
      if (!snapshotPathByNormalizedPath.has(normalizedPath)) {
        snapshotPathByNormalizedPath.set(normalizedPath, path)
      }
    }

    const normalizedPaths = collapseSnapshotInvalidationPaths(
      snapshotPathByNormalizedPath.keys()
    )
    if (normalizedPaths.length === 0) {
      return
    }

    this.#workspaceChangeLookupCache.clear()

    if (normalizedPaths.includes('.')) {
      this.#contentIds.clear()
      this.#emitInvalidate(snapshotPathByNormalizedPath.get('.') ?? '.')
      return
    }

    for (const cachedPath of Array.from(this.#contentIds.keys())) {
      for (const normalizedPath of normalizedPaths) {
        if (!pathsIntersect(cachedPath, normalizedPath)) {
          continue
        }

        this.#contentIds.delete(cachedPath)
        break
      }
    }

    for (const normalizedPath of normalizedPaths) {
      this.#emitInvalidate(
        snapshotPathByNormalizedPath.get(normalizedPath) ?? normalizedPath
      )
    }
  }

  invalidateAll(): void {
    this.#contentIds.clear()
    this.#workspaceChangeLookupCache.clear()
    this.#emitInvalidate('.')
  }

  onInvalidate(listener: (path: string) => void): () => void {
    this.#invalidateListeners.add(listener)
    return () => {
      this.#invalidateListeners.delete(listener)
    }
  }

  async #createContentId(
    pathCandidates: string[],
    options: {
      previousMetadataId?: string
      kind?: 'any' | 'file'
      strictHermetic?: boolean
    } = {}
  ): Promise<{
    id: string
    strategy: ContentIdStrategy
  }> {
    const strictHermetic = resolveStrictHermeticMode(options.strictHermetic)
    const expectedFile = options.kind === 'file'

    for (const path of pathCandidates) {
      const fileSystemContentId = await this.#getFileSystemContentId(path)

      if (typeof fileSystemContentId === 'string' && fileSystemContentId) {
        return {
          id: fileSystemContentId,
          strategy: 'file-system-content-id',
        }
      }

      if (strictHermetic) {
        const hashId = await this.#createFileContentHashId(path)
        if (hashId) {
          return {
            id: hashId,
            strategy: 'file-content',
          }
        }
      } else {
        const metadata = await this.#getFileMetadata(path)
        const lastModifiedMs = metadata.lastModifiedMs
        const byteLength = metadata.byteLength

        if (lastModifiedMs !== undefined && byteLength !== undefined) {
          const metadataId = `mtime:${lastModifiedMs};size:${byteLength}`
          const shouldGuardMetadataCollision =
            options.previousMetadataId === metadataId &&
            this.#shouldGuardMetadataCollision(lastModifiedMs)
          if (shouldGuardMetadataCollision) {
            const guardedHashId = await this.#createFileContentHashId(path)
            if (guardedHashId) {
              return {
                id: guardedHashId,
                strategy: 'metadata-guarded',
              }
            }
          }

          return {
            id: metadataId,
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
        } catch (error) {
          reportBestEffortError('file-system/snapshot', error)
        }
      }

      if (expectedFile) {
        continue
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
      } catch (error) {
        reportBestEffortError('file-system/snapshot', error)
      }
    }

    return {
      id: 'missing',
      strategy: 'missing',
    }
  }

  #shouldGuardMetadataCollision(lastModifiedMs: number): boolean {
    const now = Date.now()
    return now - lastModifiedMs <= METADATA_COLLISION_GUARD_WINDOW_MS
  }

  async #createFileContentHashId(path: string): Promise<string | undefined> {
    try {
      const bytes = await this.readFileBinary(path)
      const hash = createHash('sha1').update(bytes).digest('hex')
      return `sha1:${hash}`
    } catch {
      return undefined
    }
  }

  async #getFileSystemContentId(path: string): Promise<string | undefined> {
    const candidate = (
      this.#fileSystem as FileSystem & {
        getContentId?: (
          path: string
        ) => Promise<string | undefined> | string | undefined
      }
    ).getContentId

    if (typeof candidate !== 'function') {
      return undefined
    }

    try {
      const contentId = await candidate.call(this.#fileSystem, path)

      if (typeof contentId !== 'string' || contentId.length === 0) {
        return undefined
      }

      return contentId
    } catch {
      return undefined
    }
  }

  async #getFileMetadata(path: string): Promise<{
    lastModifiedMs: number | undefined
    byteLength: number | undefined
  }> {
    const metadataProvider = this.#fileSystem as FileSystem & {
      getFileDependencyMetadata?: (
        path: string
      ) => Promise<
        | {
            lastModifiedMs?: number
            byteLength?: number
          }
        | undefined
      >
    }

    if (typeof metadataProvider.getFileDependencyMetadata === 'function') {
      try {
        const metadata = await metadataProvider.getFileDependencyMetadata(path)
        if (metadata) {
          const lastModifiedMs =
            typeof metadata.lastModifiedMs === 'number' &&
            Number.isFinite(metadata.lastModifiedMs)
              ? metadata.lastModifiedMs
              : undefined
          const byteLength =
            typeof metadata.byteLength === 'number' &&
            Number.isFinite(metadata.byteLength)
              ? metadata.byteLength
              : undefined

          return {
            lastModifiedMs,
            byteLength,
          }
        }
      } catch {}
    }

    const [lastModifiedMs, byteLength] = await Promise.all([
      this.getFileLastModifiedMs(path).catch(() => undefined),
      this.getFileByteLength(path).catch(() => undefined),
    ])

    return {
      lastModifiedMs,
      byteLength,
    }
  }

  #normalizeSnapshotPath(path: string): string {
    const relativePath = this.#fileSystem.getRelativePathToWorkspace(path)
    return normalizePathKey(relativePath)
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

    addCandidate(normalizedPath)
    const normalizedAbsolutePath =
      this.#resolveWorkspaceAbsolutePath(normalizedPath)
    if (normalizedAbsolutePath) {
      addCandidate(normalizedAbsolutePath)
    }

    addCandidate(path)
    const absolutePath = this.#resolveWorkspaceAbsolutePath(path)
    if (absolutePath) {
      addCandidate(absolutePath)
    }

    return candidates
  }

  #resolveWorkspaceAbsolutePath(path: string): string | undefined {
    try {
      const normalizedInputPath = normalizeSlashes(path)
      if (!normalizedInputPath || normalizedInputPath === '.') {
        return this.#fileSystem.getAbsolutePath('.')
      }

      if (
        normalizedInputPath.startsWith('/') ||
        /^[A-Za-z]:\//.test(normalizedInputPath)
      ) {
        return this.#fileSystem.getAbsolutePath(normalizedInputPath)
      }

      const absoluteCwdPath = this.#fileSystem.getAbsolutePath('.')
      const relativeCwdPath = normalizePathKey(
        this.#fileSystem.getRelativePathToWorkspace(absoluteCwdPath)
      )

      let workspaceRootPath = absoluteCwdPath
      if (relativeCwdPath !== '.') {
        for (const segment of relativeCwdPath.split('/')) {
          if (segment.length > 0) {
            workspaceRootPath = dirname(workspaceRootPath)
          }
        }
      }

      return resolve(workspaceRootPath, normalizedInputPath)
    } catch {
      return undefined
    }
  }

  #emitInvalidate(path: string): void {
    for (const listener of this.#invalidateListeners) {
      try {
        listener(path)
      } catch (error) {
        reportBestEffortError('file-system/snapshot', error)
      }
    }
  }

}

function resolveStrictHermeticMode(override?: boolean): boolean {
  if (typeof override === 'boolean') {
    return override
  }

  return isStrictHermeticFileSystemModeFromEnv()
}

function resolveWorkspaceTokenLookupCacheTtlMs(): number {
  if (isCiEnvironment()) {
    return 0
  }

  return WORKSPACE_TOKEN_LOOKUP_CACHE_TTL_MS
}

function resolveWorkspaceChangedPathsLookupCacheTtlMs(): number {
  if (isCiEnvironment()) {
    return 0
  }

  return WORKSPACE_CHANGED_PATHS_LOOKUP_CACHE_TTL_MS
}

function safeGetAnalysisOptions(fileSystem: FileSystem): unknown {
  try {
    return sanitizeAnalysisOptions(fileSystem.getAnalysisOptions())
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

function safeGetStringField(value: object, key: string): string | undefined {
  const candidate = (value as any)[key]
  return typeof candidate === 'string' ? candidate : undefined
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

function collapseSnapshotInvalidationPaths(paths: Iterable<string>): string[] {
  const deduped = Array.from(
    new Set(
      Array.from(paths).filter((path) => {
        return typeof path === 'string' && path.length > 0
      })
    )
  ).map((path) => normalizePathKey(path))

  if (deduped.length === 0) {
    return []
  }

  if (deduped.includes('.')) {
    return ['.']
  }

  deduped.sort((firstPath, secondPath) => {
    if (firstPath.length !== secondPath.length) {
      return firstPath.length - secondPath.length
    }

    return firstPath.localeCompare(secondPath)
  })

  const collapsedPaths: string[] = []
  for (const path of deduped) {
    const redundant = collapsedPaths.some((existingPath) => {
      return path === existingPath || path.startsWith(`${existingPath}/`)
    })

    if (!redundant) {
      collapsedPaths.push(path)
    }
  }

  return collapsedPaths
}
