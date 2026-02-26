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
  changedPathsCleanupIntervalMs?: number
  changedPathsMaxEntries?: number
  clearChangedPathsWhenTtlDisabled?: boolean
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

    const lookupPromise = this.#lookupWorkspaceToken(rootPath)

    this.#workspaceChangeTokenByRootPath.set(normalizedRootPath, {
      token: cached?.token ?? null,
      expiresAt: now,
      promise: lookupPromise,
    })

    try {
      const token = await lookupPromise
      if (ttlMs > 0) {
        this.#workspaceChangeTokenByRootPath.set(normalizedRootPath, {
          token,
          expiresAt: Date.now() + ttlMs,
        })
      }
      return token
    } finally {
      const latest =
        this.#workspaceChangeTokenByRootPath.get(normalizedRootPath)
      if (latest?.promise === lookupPromise) {
        this.#workspaceChangeTokenByRootPath.delete(normalizedRootPath)
      }
    }
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
    this.#cleanupWorkspaceChangedPathsCache(now, ttlMs)
    const cached = this.#workspaceChangedPathsByToken.get(cacheKey)

    if (ttlMs > 0 && cached && cached.expiresAt > now) {
      return cached.paths
    }

    if (cached?.promise) {
      return cached.promise
    }

    const lookupPromise = (async () => {
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
    })().catch(() => null)

    this.#workspaceChangedPathsByToken.set(cacheKey, {
      paths: cached?.paths ?? null,
      expiresAt: now,
      promise: lookupPromise,
    })

    try {
      const changedPaths = await lookupPromise
      if (ttlMs > 0) {
        this.#workspaceChangedPathsByToken.set(cacheKey, {
          paths: changedPaths,
          expiresAt: Date.now() + ttlMs,
        })
      }
      return changedPaths
    } finally {
      const latest = this.#workspaceChangedPathsByToken.get(cacheKey)
      if (latest?.promise === lookupPromise) {
        this.#workspaceChangedPathsByToken.delete(cacheKey)
      }
    }
  }

  #cleanupWorkspaceChangedPathsCache(now: number, ttlMs: number): void {
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

    for (const [cacheKey, cached] of this.#workspaceChangedPathsByToken) {
      if (cached.promise) {
        continue
      }

      if (cached.expiresAt <= now) {
        this.#workspaceChangedPathsByToken.delete(cacheKey)
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
