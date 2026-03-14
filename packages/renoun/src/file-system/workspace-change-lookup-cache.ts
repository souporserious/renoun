import type { FileSystem } from './FileSystem.ts'
import { createWorkspaceChangedPathsCacheKey } from './workspace-cache-key.ts'

interface CachedWorkspaceChangeToken {
  token: string | null
  expiresAt: number
  promise?: Promise<string | null>
}

interface CachedWorkspaceChangedPaths {
  paths: ReadonlySet<string> | null
  expiresAt: number
  promise?: Promise<ReadonlySet<string> | null>
}

export interface WorkspaceChangeLookupCacheOptions {
  getWorkspaceTokenTtlMs: () => number
  getWorkspaceChangedPathsTtlMs: () => number
  normalizeRootPath: (rootPath: string) => string
  normalizeChangedPath: (changedPath: string) => string | null | undefined
  lookupWorkspaceToken: (rootPath: string) => Promise<string | null>
  lookupWorkspaceChangedPaths: (
    rootPath: string,
    previousToken: string
  ) => Promise<readonly string[] | null>
  serveStaleWhileRevalidate?: boolean
  changedPathsCleanupIntervalMs?: number
  changedPathsMaxEntries?: number
  clearChangedPathsWhenTtlDisabled?: boolean
}

export interface FileSystemWorkspaceChangeLookupCacheOptions {
  fileSystem: Pick<
    FileSystem,
    'getWorkspaceChangeToken' | 'getWorkspaceChangedPathsSinceToken'
  >
  getWorkspaceTokenTtlMs: () => number
  getWorkspaceChangedPathsTtlMs: () => number
  normalizeRootPath: (rootPath: string) => string
  normalizeChangedPath: (changedPath: string) => string | null | undefined
  serveStaleWhileRevalidate?: boolean
  changedPathsCleanupIntervalMs?: number
  changedPathsMaxEntries?: number
  clearChangedPathsWhenTtlDisabled?: boolean
}

export function createFileSystemWorkspaceChangeLookupCache(
  options: FileSystemWorkspaceChangeLookupCacheOptions
): WorkspaceChangeLookupCache {
  const {
    fileSystem,
    getWorkspaceTokenTtlMs,
    getWorkspaceChangedPathsTtlMs,
    normalizeRootPath,
    normalizeChangedPath,
    serveStaleWhileRevalidate,
    changedPathsCleanupIntervalMs,
    changedPathsMaxEntries,
    clearChangedPathsWhenTtlDisabled,
  } = options

  return new WorkspaceChangeLookupCache({
    getWorkspaceTokenTtlMs,
    getWorkspaceChangedPathsTtlMs,
    normalizeRootPath,
    normalizeChangedPath,
    lookupWorkspaceToken: async (rootPath) => {
      const tokenGetter = fileSystem.getWorkspaceChangeToken
      if (typeof tokenGetter !== 'function') {
        return null
      }

      try {
        const token = await tokenGetter.call(fileSystem, rootPath)
        return typeof token === 'string' ? token : null
      } catch {
        return null
      }
    },
    lookupWorkspaceChangedPaths: async (rootPath, previousToken) => {
      const changedPathsGetter = fileSystem.getWorkspaceChangedPathsSinceToken
      if (typeof changedPathsGetter !== 'function') {
        return null
      }

      try {
        const changedPaths = await changedPathsGetter.call(
          fileSystem,
          rootPath,
          previousToken
        )
        return Array.isArray(changedPaths) ? changedPaths : null
      } catch {
        return null
      }
    },
    serveStaleWhileRevalidate,
    changedPathsCleanupIntervalMs,
    changedPathsMaxEntries,
    clearChangedPathsWhenTtlDisabled,
  })
}

export class WorkspaceChangeLookupCache {
  readonly #getWorkspaceTokenTtlMs: () => number
  readonly #getWorkspaceChangedPathsTtlMs: () => number
  readonly #normalizeRootPath: (rootPath: string) => string
  readonly #normalizeChangedPath: (
    changedPath: string
  ) => string | null | undefined
  readonly #lookupWorkspaceToken: (
    rootPath: string
  ) => Promise<string | null>
  readonly #lookupWorkspaceChangedPaths: (
    rootPath: string,
    previousToken: string
  ) => Promise<readonly string[] | null>
  readonly #serveStaleWhileRevalidate: boolean
  readonly #changedPathsCleanupIntervalMs: number
  readonly #changedPathsMaxEntries?: number
  readonly #clearChangedPathsWhenTtlDisabled: boolean
  readonly #workspaceChangeTokenByRootPath = new Map<
    string,
    CachedWorkspaceChangeToken
  >()
  readonly #workspaceChangedPathsByToken = new Map<
    string,
    CachedWorkspaceChangedPaths
  >()
  #lastWorkspaceChangedPathsCleanupAt = 0

  constructor(options: WorkspaceChangeLookupCacheOptions) {
    this.#getWorkspaceTokenTtlMs = options.getWorkspaceTokenTtlMs
    this.#getWorkspaceChangedPathsTtlMs = options.getWorkspaceChangedPathsTtlMs
    this.#normalizeRootPath = options.normalizeRootPath
    this.#normalizeChangedPath = options.normalizeChangedPath
    this.#lookupWorkspaceToken = options.lookupWorkspaceToken
    this.#lookupWorkspaceChangedPaths = options.lookupWorkspaceChangedPaths
    this.#serveStaleWhileRevalidate =
      options.serveStaleWhileRevalidate === true
    this.#changedPathsCleanupIntervalMs = Math.max(
      0,
      Math.floor(options.changedPathsCleanupIntervalMs ?? 0)
    )
    this.#changedPathsMaxEntries =
      typeof options.changedPathsMaxEntries === 'number' &&
      Number.isFinite(options.changedPathsMaxEntries) &&
      options.changedPathsMaxEntries > 0
        ? Math.floor(options.changedPathsMaxEntries)
        : undefined
    this.#clearChangedPathsWhenTtlDisabled =
      options.clearChangedPathsWhenTtlDisabled === true
  }

  clear(): void {
    this.#workspaceChangeTokenByRootPath.clear()
    this.#workspaceChangedPathsByToken.clear()
    this.#lastWorkspaceChangedPathsCleanupAt = 0
  }

  async getWorkspaceChangeToken(rootPath: string): Promise<string | null> {
    const normalizedRootPath = this.#normalizeRootPath(rootPath)
    const now = Date.now()
    const ttlMs = this.#getWorkspaceTokenTtlMs()
    const cached = this.#workspaceChangeTokenByRootPath.get(normalizedRootPath)

    if (ttlMs > 0 && cached && cached.expiresAt > now) {
      return cached.token
    }

    if (cached?.promise) {
      return cached.promise
    }

    const lookupPromise = this.#startWorkspaceTokenLookup({
      rootPath,
      normalizedRootPath,
      cachedToken: cached?.token ?? null,
      startedAt: now,
      ttlMs,
    })

    return lookupPromise
  }

  #startWorkspaceTokenLookup(options: {
    rootPath: string
    normalizedRootPath: string
    cachedToken: string | null
    startedAt: number
    ttlMs: number
  }): Promise<string | null> {
    const { rootPath, normalizedRootPath, cachedToken, startedAt, ttlMs } =
      options
    const lookupPromise = this.#lookupWorkspaceToken(rootPath).catch(
      () => null
    )

    this.#workspaceChangeTokenByRootPath.set(normalizedRootPath, {
      token: cachedToken,
      expiresAt: startedAt,
      promise: lookupPromise,
    })

    void lookupPromise.then((token) => {
      const latest =
        this.#workspaceChangeTokenByRootPath.get(normalizedRootPath)
      if (latest?.promise !== lookupPromise) {
        return
      }

      if (ttlMs > 0) {
        this.#workspaceChangeTokenByRootPath.set(normalizedRootPath, {
          token,
          expiresAt: Date.now() + ttlMs,
        })
      } else {
        this.#workspaceChangeTokenByRootPath.delete(normalizedRootPath)
      }
    })

    return lookupPromise
  }

  async #lookupAndNormalizeWorkspaceChangedPaths(
    rootPath: string,
    previousToken: string
  ): Promise<ReadonlySet<string> | null> {
    const changedPaths = await this.#lookupWorkspaceChangedPaths(
      rootPath,
      previousToken
    )
    if (!Array.isArray(changedPaths)) {
      return null
    }

    const normalizedPaths = new Set<string>()
    for (const changedPath of changedPaths) {
      if (typeof changedPath !== 'string') {
        continue
      }

      const normalizedPath = this.#normalizeChangedPath(changedPath)
      if (typeof normalizedPath === 'string' && normalizedPath.length > 0) {
        normalizedPaths.add(normalizedPath)
      }
    }

    return normalizedPaths
  }
  #startWorkspaceChangedPathsLookup(options: {
    cacheKey: string
    rootPath: string
    previousToken: string
    cachedPaths: ReadonlySet<string> | null
    startedAt: number
    ttlMs: number
  }): Promise<ReadonlySet<string> | null> {
    const { cacheKey, rootPath, previousToken, cachedPaths, startedAt, ttlMs } =
      options
    const lookupPromise = this.#lookupAndNormalizeWorkspaceChangedPaths(
      rootPath,
      previousToken
    ).catch(() => null)

    this.#workspaceChangedPathsByToken.set(cacheKey, {
      paths: cachedPaths,
      expiresAt: startedAt,
      promise: lookupPromise,
    })

    void lookupPromise.then((paths) => {
      const latest = this.#workspaceChangedPathsByToken.get(cacheKey)
      if (latest?.promise !== lookupPromise) {
        return
      }

      if (ttlMs > 0) {
        this.#workspaceChangedPathsByToken.set(cacheKey, {
          paths,
          expiresAt: Date.now() + ttlMs,
        })
      } else {
        this.#workspaceChangedPathsByToken.delete(cacheKey)
      }
    })

    return lookupPromise
  }

  async getWorkspaceChangedPathsSinceToken(
    rootPath: string,
    previousToken: string
  ): Promise<ReadonlySet<string> | null> {
    const normalizedRootPath = this.#normalizeRootPath(rootPath)
    const cacheKey = createWorkspaceChangedPathsCacheKey(
      normalizedRootPath,
      previousToken
    )
    const now = Date.now()
    const ttlMs = this.#getWorkspaceChangedPathsTtlMs()
    this.#cleanupWorkspaceChangedPathsCache(now, ttlMs, cacheKey)
    const cached = this.#workspaceChangedPathsByToken.get(cacheKey)

    if (ttlMs > 0 && cached && cached.expiresAt > now) {
      return cached.paths
    }

    if (cached?.promise) {
      return cached.promise
    }

    if (ttlMs > 0 && cached && this.#serveStaleWhileRevalidate) {
      // Changed-path freshness is used as a correctness guard for cache reuse.
      // Once the entry expires, await the refresh instead of serving stale data.
      return this.#startWorkspaceChangedPathsLookup({
        cacheKey,
        rootPath,
        previousToken,
        cachedPaths: cached.paths,
        startedAt: now,
        ttlMs,
      })
    }

    return this.#startWorkspaceChangedPathsLookup({
      cacheKey,
      rootPath,
      previousToken,
      cachedPaths: cached?.paths ?? null,
      startedAt: now,
      ttlMs,
    })
  }

  #cleanupWorkspaceChangedPathsCache(
    now: number,
    ttlMs: number,
    preserveCacheKey?: string
  ): void {
    if (this.#workspaceChangedPathsByToken.size === 0) {
      return
    }

    if (ttlMs <= 0 && this.#clearChangedPathsWhenTtlDisabled) {
      this.#workspaceChangedPathsByToken.clear()
      return
    }

    const shouldCleanupByInterval =
      this.#changedPathsCleanupIntervalMs <= 0 ||
      now - this.#lastWorkspaceChangedPathsCleanupAt >=
        this.#changedPathsCleanupIntervalMs
    const shouldCleanupBySize =
      this.#changedPathsMaxEntries !== undefined &&
      this.#workspaceChangedPathsByToken.size > this.#changedPathsMaxEntries

    if (!shouldCleanupByInterval && !shouldCleanupBySize) {
      return
    }

    this.#lastWorkspaceChangedPathsCleanupAt = now

    for (const [entryCacheKey, cached] of this.#workspaceChangedPathsByToken) {
      if (cached.promise) {
        continue
      }

      if (
        cached.expiresAt <= now &&
        (preserveCacheKey === undefined || entryCacheKey !== preserveCacheKey)
      ) {
        this.#workspaceChangedPathsByToken.delete(entryCacheKey)
      }
    }

    if (
      this.#changedPathsMaxEntries === undefined ||
      this.#workspaceChangedPathsByToken.size <= this.#changedPathsMaxEntries
    ) {
      return
    }

    let overflow =
      this.#workspaceChangedPathsByToken.size - this.#changedPathsMaxEntries
    for (const [cacheKey, cached] of this.#workspaceChangedPathsByToken) {
      if (overflow <= 0) {
        break
      }

      if (cached.promise) {
        continue
      }

      this.#workspaceChangedPathsByToken.delete(cacheKey)
      overflow -= 1
    }
  }
}
