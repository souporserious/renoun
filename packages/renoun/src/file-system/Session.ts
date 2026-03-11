import { resolve } from 'node:path'
import { realpathSync } from 'node:fs'

import { collapseInvalidationPaths } from '../utils/collapse-invalidation-paths.ts'
import {
  isDevelopmentEnvironment,
  isTestEnvironment,
} from '../utils/env.ts'
import { getDebugLogger } from '../utils/debug.ts'
import {
  normalizeNonNegativeInteger,
  normalizePositiveInteger,
} from '../utils/normalize-number.ts'
import {
  DEFAULT_CACHE_METRICS_TOP_KEYS_LIMIT,
  DEFAULT_CACHE_METRICS_TOP_KEYS_LOG_INTERVAL,
  DEFAULT_CACHE_METRICS_TOP_KEYS_TRACKING_LIMIT,
  DEFAULT_INVALIDATED_PATH_TTL_MS,
  DEFAULT_WORKSPACE_CHANGE_TOKEN_TTL_MS,
  DEFAULT_WORKSPACE_CHANGED_PATHS_TTL_MS,
} from '../utils/cache-constants.ts'
import { isAbsolutePath, normalizePathKey } from '../utils/path.ts'
import { hashString, stableStringify } from '../utils/stable-serialization.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import { emitTelemetryEvent } from '../utils/telemetry.ts'
import type { Telemetry } from '../utils/telemetry.ts'
import { Cache, CacheStore } from './Cache.ts'
import { getCacheStorePersistence } from './CacheSqlite.ts'
import type { FileSystem } from './FileSystem.ts'
import {
  DirectorySnapshotPathIndex,
  IndexedStringKeyMap,
  extractDirectoryPathFromSnapshotKey,
  getPathAncestors,
  pathsIntersect,
} from './directory-snapshot-path-index.ts'
import {
  SessionRegistry,
  getCacheIdentity,
} from './session-registry.ts'
import {
  FileSystemSnapshot,
  type Snapshot,
} from './Snapshot.ts'
import type { DirectorySnapshot } from './directory-snapshot.ts'
import { WorkspaceChangeLookupCache } from './workspace-change-lookup-cache.ts'

const sessionRegistry = new SessionRegistry<Session>()

type PersistedStaleReason =
  | 'token_changed'
  | 'dep_changed'
  | 'shape_mismatch'
  | 'policy_nonpersistable'

type DirectorySnapshotHitSource = 'memory' | 'persisted'
type PersistedInvalidationPriority = 'immediate' | 'background'

type CacheMetricCounter =
  | 'memory_hit'
  | 'memory_miss'
  | 'persisted_hit'
  | 'persisted_miss'
  | 'rebuild_count'
  | 'invalidation_evictions_path'
  | 'invalidation_evictions_dep_index'
  | 'invalidation_fallback_runs'
  | 'invalidation_fallback_due_to_missing_dependency_metadata'
  | 'invalidation_fallback_due_to_dependency_index_unavailable'
  | 'invalidation_fallback_targeted_missing_dependency_nodes'

interface DirectorySnapshotKeyMetrics {
  lookups: number
  memoryHits: number
  memoryMisses: number
  persistedHits: number
  persistedMisses: number
  rebuilds: number
}

const SESSION_CACHE_DEFAULTS = {
  persistentWorkspaceChangeTokenTtlMs: 0,
  persistentWorkspaceChangedPathsTtlMs: 0,
  workspaceChangedPathsCleanupIntervalMs: 1_000,
  workspaceChangedPathsMaxEntries: 512,
  directorySnapshotPrefixIndexMaxKeys: 50_000,
  directorySnapshotPrefixIndexReenableRatio: 0.5,
} as const

function getDefaultPersistentWorkspaceChangeTokenTtlMs(): number {
  if (isDevelopmentEnvironment()) {
    return DEFAULT_WORKSPACE_CHANGE_TOKEN_TTL_MS
  }

  return SESSION_CACHE_DEFAULTS.persistentWorkspaceChangeTokenTtlMs
}

function getDefaultPersistentWorkspaceChangedPathsTtlMs(): number {
  if (isDevelopmentEnvironment()) {
    return DEFAULT_WORKSPACE_CHANGED_PATHS_TTL_MS
  }

  return SESSION_CACHE_DEFAULTS.persistentWorkspaceChangedPathsTtlMs
}

export class Session {
  static for(
    fileSystem: FileSystem,
    snapshot?: Snapshot,
    cache?: Cache
  ): Session {
    return sessionRegistry.getOrCreate(fileSystem, {
      snapshot,
      cacheId: getCacheIdentity(cache),
      createBaseSnapshot: () => new FileSystemSnapshot(fileSystem),
      createSession: (targetSnapshot) =>
        new Session(fileSystem, targetSnapshot, cache),
    })
  }

  static reset(fileSystem: FileSystem, snapshotId?: string): void {
    sessionRegistry.reset(fileSystem, {
      snapshotId,
      resetSession: (session) => {
        session.reset()
      },
      onMissingSnapshotFamily: (missingSnapshotId) => {
        if (!isTestEnvironment()) {
          console.warn(
            `[renoun] Session.reset(${String(missingSnapshotId)}) did not match any active session family. No caches were invalidated.`
          )
        }
      },
    })
  }

  readonly #fileSystem: FileSystem
  readonly snapshot: Snapshot
  readonly inflight = new Map<string, Promise<unknown>>()
  readonly cache: CacheStore
  readonly #directorySnapshotPathIndex: DirectorySnapshotPathIndex
  readonly #directorySnapshotBuildPathIndex: DirectorySnapshotPathIndex
  readonly directorySnapshots: IndexedStringKeyMap<
    DirectorySnapshot<any, any>
  >
  readonly directorySnapshotBuilds: IndexedStringKeyMap<
    Promise<{
      snapshot: DirectorySnapshot<any, any>
      shouldIncludeSelf: boolean
      skipPersist?: boolean
    }>
  >
  readonly #functionIds = new WeakMap<Function, string>()
  #nextFunctionId = 0
  readonly #invalidatedDirectorySnapshotKeys = new Set<string>()
  readonly #workspaceChangeLookupCache: WorkspaceChangeLookupCache
  readonly #recentlyInvalidatedPathTimestamps = new Map<string, number>()
  readonly #pendingPersistedInvalidationPathsImmediate = new Set<string>()
  readonly #pendingPersistedInvalidationPathsBackground = new Set<string>()
  #persistedInvalidationQueue: Promise<void> = Promise.resolve()
  #persistedInvalidationDrainScheduled = false
  #cacheDisposeScheduled = false
  #warnedAboutPersistedInvalidationFailure = false
  readonly #cacheMetricsEnabled: boolean
  readonly #cacheMetricsTopKeysLimit: number
  readonly #cacheMetricsTopKeysTrackingLimit: number
  readonly #cacheMetricsTopKeysLogInterval: number
  readonly #workspaceChangeTokenTtlMs: number
  readonly #workspaceChangedPathsTtlMs: number
  readonly #workspaceChangeTokenTtlConfigured: boolean
  readonly #workspaceChangedPathsTtlConfigured: boolean
  readonly #invalidatedPathTtlMs: number
  readonly #cacheDebugPersistence: boolean
  readonly #targetedMissingDependencyFallbackEnabled: boolean
  readonly #telemetry?: Telemetry
  readonly #cacheMetricCounters: Record<CacheMetricCounter, number> = {
    memory_hit: 0,
    memory_miss: 0,
    persisted_hit: 0,
    persisted_miss: 0,
    rebuild_count: 0,
    invalidation_evictions_path: 0,
    invalidation_evictions_dep_index: 0,
    invalidation_fallback_runs: 0,
    invalidation_fallback_due_to_missing_dependency_metadata: 0,
    invalidation_fallback_due_to_dependency_index_unavailable: 0,
    invalidation_fallback_targeted_missing_dependency_nodes: 0,
  }
  readonly #persistedStaleReasonCounters: Record<PersistedStaleReason, number> =
    {
      token_changed: 0,
      dep_changed: 0,
      shape_mismatch: 0,
      policy_nonpersistable: 0,
    }
  readonly #directorySnapshotMetricsByKey = new Map<
    string,
    DirectorySnapshotKeyMetrics
  >()
  readonly #directorySnapshotRebuildReasonTotals = new Map<string, number>()
  readonly #directorySnapshotRebuildReasonByKey = new Map<
    string,
    Map<string, number>
  >()
  #directorySnapshotRebuildEventsSinceLog = 0

  private constructor(
    fileSystem: FileSystem,
    snapshot: Snapshot,
    cache?: Cache
  ) {
    this.#fileSystem = fileSystem
    this.snapshot = snapshot
    const directorySnapshotPrefixIndexMaxKeys =
      resolveDirectorySnapshotPrefixIndexMaxKeys(
        cache?.directorySnapshotPrefixIndexMaxKeys
      )
    this.#directorySnapshotPathIndex = new DirectorySnapshotPathIndex({
      maxPrefixKeys: directorySnapshotPrefixIndexMaxKeys,
      prefixIndexReenableRatio:
        SESSION_CACHE_DEFAULTS.directorySnapshotPrefixIndexReenableRatio,
    })
    this.#directorySnapshotBuildPathIndex = new DirectorySnapshotPathIndex({
      maxPrefixKeys: directorySnapshotPrefixIndexMaxKeys,
      prefixIndexReenableRatio:
        SESSION_CACHE_DEFAULTS.directorySnapshotPrefixIndexReenableRatio,
    })
    this.directorySnapshots = new IndexedStringKeyMap<
      DirectorySnapshot<any, any>
    >({
      onAdd: (snapshotKey) => {
        this.#directorySnapshotPathIndex.add(snapshotKey)
      },
      onDelete: (snapshotKey) => {
        this.#directorySnapshotPathIndex.remove(snapshotKey)
      },
      onClear: () => {
        this.#directorySnapshotPathIndex.clear()
      },
    })
    this.directorySnapshotBuilds = new IndexedStringKeyMap<
      Promise<{
        snapshot: DirectorySnapshot<any, any>
        shouldIncludeSelf: boolean
        skipPersist?: boolean
      }>
    >({
      onAdd: (snapshotKey) => {
        this.#directorySnapshotBuildPathIndex.add(snapshotKey)
      },
      onDelete: (snapshotKey) => {
        this.#directorySnapshotBuildPathIndex.remove(snapshotKey)
      },
      onClear: () => {
        this.#directorySnapshotBuildPathIndex.clear()
      },
    })
    const prefersPersistentCache = cache
      ? cache.usesPersistentCache
      : shouldUseSessionCachePersistence(fileSystem)
    this.#cacheMetricsEnabled = cache?.cacheMetricsEnabled === true
    this.#cacheMetricsTopKeysLimit = normalizePositiveInteger(
      cache?.cacheMetricsTopKeysLimit,
      DEFAULT_CACHE_METRICS_TOP_KEYS_LIMIT
    )
    this.#cacheMetricsTopKeysTrackingLimit = Math.max(
      this.#cacheMetricsTopKeysLimit,
      normalizePositiveInteger(
        cache?.cacheMetricsTopKeysTrackingLimit,
        DEFAULT_CACHE_METRICS_TOP_KEYS_TRACKING_LIMIT
      )
    )
    this.#cacheMetricsTopKeysLogInterval = normalizePositiveInteger(
      cache?.cacheMetricsTopKeysLogInterval,
      DEFAULT_CACHE_METRICS_TOP_KEYS_LOG_INTERVAL
    )
    this.#workspaceChangeTokenTtlConfigured =
      cache?.workspaceChangeTokenTtlMs !== undefined
    this.#workspaceChangedPathsTtlConfigured =
      cache?.workspaceChangedPathsTtlMs !== undefined
    this.#workspaceChangeTokenTtlMs = normalizeNonNegativeInteger(
      cache?.workspaceChangeTokenTtlMs,
      prefersPersistentCache
        ? getDefaultPersistentWorkspaceChangeTokenTtlMs()
        : DEFAULT_WORKSPACE_CHANGE_TOKEN_TTL_MS
    )
    this.#workspaceChangedPathsTtlMs = normalizeNonNegativeInteger(
      cache?.workspaceChangedPathsTtlMs,
      prefersPersistentCache
        ? getDefaultPersistentWorkspaceChangedPathsTtlMs()
        : DEFAULT_WORKSPACE_CHANGED_PATHS_TTL_MS
    )
    this.#invalidatedPathTtlMs = normalizePositiveInteger(
      cache?.invalidatedPathTtlMs,
      DEFAULT_INVALIDATED_PATH_TTL_MS
    )
    this.#cacheDebugPersistence = cache?.debugCachePersistence === true
    this.#targetedMissingDependencyFallbackEnabled =
      resolveTargetedMissingDependencyFallback(
        cache?.targetedMissingDependencyFallback
      )
    this.#telemetry = cache?.telemetry
    this.#workspaceChangeLookupCache = new WorkspaceChangeLookupCache({
      getWorkspaceTokenTtlMs: () => this.#resolveWorkspaceChangeTokenTtlMs(),
      getWorkspaceChangedPathsTtlMs: () =>
        this.#resolveWorkspaceChangedPathsTtlMs(),
      serveStaleWhileRevalidate: isDevelopmentEnvironment(),
      normalizeRootPath: (rootPath) =>
        normalizeSessionPath(this.#fileSystem, rootPath),
      normalizeChangedPath: (changedPath) => {
        return isAbsolutePath(changedPath)
          ? normalizeSessionPath(this.#fileSystem, changedPath)
          : normalizePathKey(changedPath)
      },
      lookupWorkspaceToken: async (rootPath) => {
        const tokenGetter = this.#fileSystem.getWorkspaceChangeToken
        if (typeof tokenGetter !== 'function') {
          return null
        }

        try {
          const token = await tokenGetter.call(this.#fileSystem, rootPath)
          return typeof token === 'string' ? token : null
        } catch {
          return null
        }
      },
      lookupWorkspaceChangedPaths: async (rootPath, previousToken) => {
        const changedPathsGetter =
          this.#fileSystem.getWorkspaceChangedPathsSinceToken
        if (typeof changedPathsGetter !== 'function') {
          return null
        }

        try {
          const changedPaths = await changedPathsGetter.call(
            this.#fileSystem,
            rootPath,
            previousToken
          )
          return Array.isArray(changedPaths) ? changedPaths : null
        } catch {
          return null
        }
      },
      changedPathsCleanupIntervalMs:
        SESSION_CACHE_DEFAULTS.workspaceChangedPathsCleanupIntervalMs,
      changedPathsMaxEntries: SESSION_CACHE_DEFAULTS.workspaceChangedPathsMaxEntries,
    })

    const persistence =
      cache?.persistence ??
      (prefersPersistentCache
        ? getCacheStorePersistence({
            projectRoot: resolveSessionProjectRoot(
              fileSystem,
              cache?.debugSessionRoot
            ),
            debugSessionRoot: cache?.debugSessionRoot === true,
            debugCachePersistence: cache?.debugCachePersistence === true,
          })
        : undefined)

    this.cache =
      cache?.createStore({
        snapshot: this.snapshot,
        inflight: this.inflight,
        telemetry: this.#telemetry,
        debugPersistenceFailure: this.#cacheDebugPersistence,
      }) ??
      new CacheStore({
        snapshot: this.snapshot,
        persistence,
        inflight: this.inflight,
        telemetry: this.#telemetry,
        debugPersistenceFailure: this.#cacheDebugPersistence,
      })
  }

  get usesPersistentCache(): boolean {
    return this.cache.usesPersistentCache
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
      rootPath: options.rootPath
        ? normalizeSessionPath(this.#fileSystem, options.rootPath)
        : '',
    })
    return `dir:${directoryPath}|${digest}`
  }

  markInvalidatedDirectorySnapshotKey(snapshotKey: string): void {
    this.#invalidatedDirectorySnapshotKeys.add(snapshotKey)
  }

  isDirectorySnapshotKeyInvalidated(snapshotKey: string): boolean {
    return this.#invalidatedDirectorySnapshotKeys.has(snapshotKey)
  }

  clearDirectorySnapshotKeyInvalidation(snapshotKey: string): void {
    this.#invalidatedDirectorySnapshotKeys.delete(snapshotKey)
  }

  hasInvalidatedDirectorySnapshotKeys(): boolean {
    return this.#invalidatedDirectorySnapshotKeys.size > 0
  }

  recordCacheMetric(counter: CacheMetricCounter, increment = 1): void {
    if (increment <= 0) {
      return
    }

    this.#cacheMetricCounters[counter] += increment
    this.#emitCacheMetricLog({
      metric: counter,
      increment,
      total: this.#cacheMetricCounters[counter],
    })
  }

  recordPersistedStaleReason(reason: PersistedStaleReason): void {
    this.#persistedStaleReasonCounters[reason] += 1
    this.#emitCacheMetricLog({
      metric: 'persisted_stale_reason',
      reason,
      total: this.#persistedStaleReasonCounters[reason],
    })
  }

  recordDirectorySnapshotLookup(snapshotKey: string): void {
    if (!this.#cacheMetricsEnabled) {
      return
    }

    const metrics = this.#getDirectorySnapshotKeyMetrics(snapshotKey)
    metrics.lookups += 1
  }

  recordDirectorySnapshotHit(
    snapshotKey: string,
    source: DirectorySnapshotHitSource
  ): void {
    if (!this.#cacheMetricsEnabled) {
      return
    }

    const metrics = this.#getDirectorySnapshotKeyMetrics(snapshotKey)
    if (source === 'memory') {
      metrics.memoryHits += 1
      return
    }

    metrics.persistedHits += 1
  }

  recordDirectorySnapshotMiss(
    snapshotKey: string,
    source: DirectorySnapshotHitSource
  ): void {
    if (!this.#cacheMetricsEnabled) {
      return
    }

    const metrics = this.#getDirectorySnapshotKeyMetrics(snapshotKey)
    if (source === 'memory') {
      metrics.memoryMisses += 1
      return
    }

    metrics.persistedMisses += 1
  }

  recordDirectorySnapshotRebuild(snapshotKey: string, reason: string): void {
    const snapshotPath =
      extractDirectoryPathFromSnapshotKey(snapshotKey) ?? snapshotKey
    emitTelemetryEvent({
      name: 'renoun.cache.directory_snapshot_rebuild',
      tags: {
        reason,
      },
      fields: {
        snapshotKeyHash: toTelemetryHash(snapshotKey),
        pathHash: toTelemetryHash(snapshotPath),
        pathDepth: getTelemetryPathDepth(snapshotPath),
      },
      telemetry: this.#telemetry,
    })

    if (!this.#cacheMetricsEnabled) {
      return
    }

    const metrics = this.#getDirectorySnapshotKeyMetrics(snapshotKey)
    metrics.rebuilds += 1

    this.#incrementMapCount(this.#directorySnapshotRebuildReasonTotals, reason)

    let reasonCounts =
      this.#directorySnapshotRebuildReasonByKey.get(snapshotKey)
    if (!reasonCounts) {
      reasonCounts = new Map<string, number>()
      this.#directorySnapshotRebuildReasonByKey.set(snapshotKey, reasonCounts)
    }
    this.#incrementMapCount(reasonCounts, reason)

    this.#directorySnapshotRebuildEventsSinceLog += 1
    this.#maybeEmitDirectorySnapshotMetrics()
  }

  #resolveWorkspaceChangeTokenTtlMs(): number {
    if (
      !this.#workspaceChangeTokenTtlConfigured &&
      !this.cache.usesPersistentCache
    ) {
      return DEFAULT_WORKSPACE_CHANGE_TOKEN_TTL_MS
    }

    return this.#workspaceChangeTokenTtlMs
  }

  #resolveWorkspaceChangedPathsTtlMs(): number {
    if (
      !this.#workspaceChangedPathsTtlConfigured &&
      !this.cache.usesPersistentCache
    ) {
      return DEFAULT_WORKSPACE_CHANGED_PATHS_TTL_MS
    }

    return this.#workspaceChangedPathsTtlMs
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

  getRecentlyInvalidatedPaths(): ReadonlySet<string> | undefined {
    this.#cleanupExpiredInvalidatedPaths()

    if (this.#recentlyInvalidatedPathTimestamps.size === 0) {
      return undefined
    }

    return new Set(this.#recentlyInvalidatedPathTimestamps.keys())
  }

  async waitForPendingInvalidations(): Promise<void> {
    while (true) {
      const queue = this.#persistedInvalidationQueue
      await queue.catch(() => {})

      if (this.#persistedInvalidationQueue === queue) {
        return
      }
    }
  }

  invalidatePath(
    path: string,
    options?: {
      priority?: PersistedInvalidationPriority
    }
  ): void {
    this.invalidatePaths([path], options)
  }

  invalidatePaths(
    paths: Iterable<string>,
    options: {
      priority?: PersistedInvalidationPriority
    } = {}
  ): void {
    const snapshotPathByNormalizedPath = new Map<string, string>()
    for (const path of paths) {
      if (typeof path !== 'string' || path.length === 0) {
        continue
      }

      const normalizedPath = normalizeSessionPath(this.#fileSystem, path)
      if (!snapshotPathByNormalizedPath.has(normalizedPath)) {
        snapshotPathByNormalizedPath.set(normalizedPath, path)
      }
    }

    const normalizedPaths = collapseInvalidationPaths(
      snapshotPathByNormalizedPath.keys()
    )

    if (normalizedPaths.length === 0) {
      return
    }

    const now = Date.now()
    for (const normalizedPath of normalizedPaths) {
      this.#recentlyInvalidatedPathTimestamps.set(normalizedPath, now)
    }
    this.#cleanupExpiredInvalidatedPaths(now)

    const snapshotPathsToInvalidate = normalizedPaths.map((normalizedPath) => {
      return snapshotPathByNormalizedPath.get(normalizedPath) ?? normalizedPath
    })
    this.cache.invalidateDependencyPaths(normalizedPaths)
    if (typeof this.snapshot.invalidatePaths === 'function') {
      this.snapshot.invalidatePaths(snapshotPathsToInvalidate)
    } else {
      for (const snapshotPath of snapshotPathsToInvalidate) {
        this.snapshot.invalidatePath(snapshotPath)
      }
    }

    const invalidatedEntriesByPath = new Map<string, number>()
    const expiredKeys = new Set<string>()

    for (const normalizedPath of normalizedPaths) {
      let invalidatedEntries = 0
      for (const snapshotKey of this.#collectIntersectingDirectorySnapshotKeys(
        normalizedPath
      )) {
        const deletedSnapshot = this.directorySnapshots.delete(snapshotKey)
        const deletedBuild = this.directorySnapshotBuilds.delete(snapshotKey)
        if (!deletedSnapshot && !deletedBuild) {
          continue
        }

        this.markInvalidatedDirectorySnapshotKey(snapshotKey)

        if (!expiredKeys.has(snapshotKey)) {
          expiredKeys.add(snapshotKey)
          invalidatedEntries += 1
        }
      }

      invalidatedEntriesByPath.set(normalizedPath, invalidatedEntries)
    }

    if (expiredKeys.size > 0) {
      this.recordCacheMetric('invalidation_evictions_path', expiredKeys.size)
      this.#enqueuePersistedNodeKeyDeletion(expiredKeys)
    }

    for (const normalizedPath of normalizedPaths) {
      emitTelemetryEvent({
        name: 'renoun.cache.invalidate_path',
        fields: {
          pathHash: toTelemetryHash(normalizedPath),
          pathDepth: getTelemetryPathDepth(normalizedPath),
          invalidatedEntries: invalidatedEntriesByPath.get(normalizedPath) ?? 0,
        },
        telemetry: this.#telemetry,
      })
    }

    if (this.usesPersistentCache) {
      this.#queuePersistedDependencyInvalidations(
        normalizedPaths,
        options.priority ?? 'immediate'
      )
    }
  }

  #collectIntersectingDirectorySnapshotKeys(path: string): Set<string> {
    const intersectingKeys = this.#directorySnapshotPathIndex.getIntersectingKeys(
      path
    )
    for (const buildKey of this.#directorySnapshotBuildPathIndex.getIntersectingKeys(
      path
    )) {
      intersectingKeys.add(buildKey)
    }
    return intersectingKeys
  }

  reset(): void {
    this.#maybeEmitDirectorySnapshotMetrics(true, 'reset')
    this.inflight.clear()
    this.directorySnapshots.clear()
    this.directorySnapshotBuilds.clear()
    this.#invalidatedDirectorySnapshotKeys.clear()
    this.#workspaceChangeLookupCache.clear()
    this.#recentlyInvalidatedPathTimestamps.clear()
    this.#directorySnapshotMetricsByKey.clear()
    this.#directorySnapshotRebuildReasonTotals.clear()
    this.#directorySnapshotRebuildReasonByKey.clear()
    this.#directorySnapshotRebuildEventsSinceLog = 0
    this.#scheduleCacheDispose()
    if (typeof this.snapshot.invalidateAll === 'function') {
      this.snapshot.invalidateAll()
      return
    }

    this.snapshot.invalidatePath('.')
  }

  #enqueuePersistedInvalidationTask(task: () => Promise<void>): void {
    this.#persistedInvalidationQueue = this.#persistedInvalidationQueue
      .catch(() => {})
      .then(() => task())
  }

  #enqueuePersistedNodeKeyDeletion(nodeKeys: Iterable<string>): void {
    const uniqueNodeKeys = Array.from(new Set(nodeKeys))
    if (uniqueNodeKeys.length === 0) {
      return
    }

    this.#enqueuePersistedInvalidationTask(async () => {
      await this.cache.deleteMany(uniqueNodeKeys)
    })
  }

  #scheduleCacheDispose(): void {
    if (this.#cacheDisposeScheduled) {
      return
    }

    this.#cacheDisposeScheduled = true
    void this.waitForPendingInvalidations().finally(() => {
      this.cache.dispose()
    })
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

  #queuePersistedDependencyInvalidations(
    normalizedPaths: ReadonlyArray<string>,
    priority: PersistedInvalidationPriority
  ): void {
    const immediateQueue = this.#pendingPersistedInvalidationPathsImmediate
    const backgroundQueue = this.#pendingPersistedInvalidationPathsBackground
    let hasQueuedPath = false

    for (const normalizedPath of normalizedPaths) {
      if (normalizedPath.length === 0) {
        continue
      }

      if (priority === 'immediate') {
        if (immediateQueue.has(normalizedPath)) {
          continue
        }

        immediateQueue.add(normalizedPath)
        backgroundQueue.delete(normalizedPath)
        hasQueuedPath = true
        continue
      }

      if (
        immediateQueue.has(normalizedPath) ||
        backgroundQueue.has(normalizedPath)
      ) {
        continue
      }

      backgroundQueue.add(normalizedPath)
      hasQueuedPath = true
    }

    if (!hasQueuedPath) {
      return
    }

    this.#schedulePersistedDependencyInvalidationDrain()
  }

  #schedulePersistedDependencyInvalidationDrain(): void {
    if (this.#persistedInvalidationDrainScheduled) {
      return
    }

    this.#persistedInvalidationDrainScheduled = true
    this.#enqueuePersistedInvalidationTask(() =>
      this.#drainPersistedDependencyInvalidations()
    )
  }

  async #drainPersistedDependencyInvalidations(): Promise<void> {
    try {
      while (
        this.#pendingPersistedInvalidationPathsImmediate.size > 0 ||
        this.#pendingPersistedInvalidationPathsBackground.size > 0
      ) {
        const pendingQueue =
          this.#pendingPersistedInvalidationPathsImmediate.size > 0
            ? this.#pendingPersistedInvalidationPathsImmediate
            : this.#pendingPersistedInvalidationPathsBackground
        const normalizedPaths = collapseInvalidationPaths(
          pendingQueue
        )
        pendingQueue.clear()

        await this.#runPersistedDependencyInvalidationsBatch(normalizedPaths)
      }
    } finally {
      this.#persistedInvalidationDrainScheduled = false
      if (
        this.#pendingPersistedInvalidationPathsImmediate.size > 0 ||
        this.#pendingPersistedInvalidationPathsBackground.size > 0
      ) {
        this.#schedulePersistedDependencyInvalidationDrain()
      }
    }
  }

  async #runPersistedDependencyInvalidationsBatch(
    normalizedPaths: ReadonlyArray<string>
  ): Promise<void> {
    if (normalizedPaths.length === 0) {
      return
    }

    try {
      const dependencyEviction = await this.cache.deleteByDependencyPaths(
        normalizedPaths
      )

      if (dependencyEviction.deletedNodeKeys.length > 0) {
        this.recordCacheMetric(
          'invalidation_evictions_dep_index',
          dependencyEviction.deletedNodeKeys.length
        )
        emitTelemetryEvent({
          name: 'renoun.cache.invalidate_dependency_index_batch',
          fields: {
            pathCount: normalizedPaths.length,
            invalidatedEntries: dependencyEviction.deletedNodeKeys.length,
            invalidationSeq: dependencyEviction.invalidationSeq,
            invalidationMode: dependencyEviction.invalidationMode,
          },
          telemetry: this.#telemetry,
        })
      }

      if (
        !dependencyEviction.usedDependencyIndex ||
        dependencyEviction.hasMissingDependencyMetadata
      ) {
        this.#recordPersistedFallbackTrigger({
          pathCount: normalizedPaths.length,
          dependencyIndexUnavailable: !dependencyEviction.usedDependencyIndex,
          hasMissingDependencyMetadata:
            dependencyEviction.hasMissingDependencyMetadata,
          missingDependencyNodeKeyCount:
            dependencyEviction.missingDependencyNodeKeys?.length ?? 0,
        })
        await this.#runBroadPersistedInvalidationFallbackBatch(
          normalizedPaths,
          {
            includeNonDirectoryKeys:
              !dependencyEviction.usedDependencyIndex ||
              dependencyEviction.hasMissingDependencyMetadata,
            missingDependencyNodeKeys:
              dependencyEviction.missingDependencyNodeKeys,
            forceFullScan: !dependencyEviction.usedDependencyIndex,
          }
        )
      }
    } catch {
      for (const normalizedPath of normalizedPaths) {
        await this.#runPersistedDependencyInvalidation(normalizedPath)
      }
    }
  }

  async #runPersistedDependencyInvalidation(
    normalizedPath: string
  ): Promise<void> {
    try {
      const dependencyEviction =
        await this.cache.deleteByDependencyPath(normalizedPath)

      if (dependencyEviction.deletedNodeKeys.length > 0) {
        this.recordCacheMetric(
          'invalidation_evictions_dep_index',
          dependencyEviction.deletedNodeKeys.length
        )
        emitTelemetryEvent({
          name: 'renoun.cache.invalidate_dependency_index',
          fields: {
            pathHash: toTelemetryHash(normalizedPath),
            pathDepth: getTelemetryPathDepth(normalizedPath),
            invalidatedEntries: dependencyEviction.deletedNodeKeys.length,
            invalidationSeq: dependencyEviction.invalidationSeq,
            invalidationMode: dependencyEviction.invalidationMode,
          },
          telemetry: this.#telemetry,
        })
      }

      if (
        !dependencyEviction.usedDependencyIndex ||
        dependencyEviction.hasMissingDependencyMetadata
      ) {
        this.#recordPersistedFallbackTrigger({
          pathCount: 1,
          dependencyIndexUnavailable: !dependencyEviction.usedDependencyIndex,
          hasMissingDependencyMetadata:
            dependencyEviction.hasMissingDependencyMetadata,
          missingDependencyNodeKeyCount:
            dependencyEviction.missingDependencyNodeKeys?.length ?? 0,
        })
        await this.#runBroadPersistedInvalidationFallback(normalizedPath, {
          includeNonDirectoryKeys:
            !dependencyEviction.usedDependencyIndex ||
            dependencyEviction.hasMissingDependencyMetadata,
          missingDependencyNodeKeys:
            dependencyEviction.missingDependencyNodeKeys,
          forceFullScan: !dependencyEviction.usedDependencyIndex,
        })
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error && error.message.length > 0
          ? error.message
          : String(error ?? 'unknown error')
      emitTelemetryEvent({
        name: 'renoun.cache.invalidate_error',
        fields: {
          pathHash: toTelemetryHash(normalizedPath),
          pathDepth: getTelemetryPathDepth(normalizedPath),
          message: errorMessage,
        },
        telemetry: this.#telemetry,
      })

      if (
        !this.#warnedAboutPersistedInvalidationFailure &&
        !isTestEnvironment()
      ) {
        this.#warnedAboutPersistedInvalidationFailure = true
        console.warn(
          `[renoun] Persisted cache invalidation failed; continuing with best-effort invalidation only: ${errorMessage}`
        )
      }
    }
  }

  async #runBroadPersistedInvalidationFallback(
    normalizedPath: string,
    options: {
      includeNonDirectoryKeys?: boolean
      missingDependencyNodeKeys?: ReadonlyArray<string>
      forceFullScan?: boolean
    } = {}
  ): Promise<void> {
    const includeNonDirectoryKeys = options.includeNonDirectoryKeys === true
    const forceFullScan = options.forceFullScan === true
    const missingDependencyNodeKeys =
      options.missingDependencyNodeKeys &&
      options.missingDependencyNodeKeys.length > 0
        ? Array.from(new Set(options.missingDependencyNodeKeys))
        : undefined
    const useTargetedMissingDependencyNodes =
      this.#targetedMissingDependencyFallbackEnabled &&
      includeNonDirectoryKeys &&
      !forceFullScan &&
      !!missingDependencyNodeKeys &&
      missingDependencyNodeKeys.length > 0

    const candidateKeys = includeNonDirectoryKeys
      ? useTargetedMissingDependencyNodes
        ? missingDependencyNodeKeys
        : await this.cache.listNodeKeysByPrefix('')
      : await this.#listDirectorySnapshotFallbackCandidates(normalizedPath)
    if (candidateKeys.length === 0) {
      return
    }

    const fallbackKeysToDelete: string[] = []

    for (const key of candidateKeys) {
      const directoryPath = extractDirectoryPathFromSnapshotKey(key)
      if (!directoryPath) {
        if (!includeNonDirectoryKeys) {
          continue
        }
        fallbackKeysToDelete.push(key)
        continue
      }

      if (pathsIntersect(directoryPath, normalizedPath)) {
        fallbackKeysToDelete.push(key)
      }
    }

    if (fallbackKeysToDelete.length === 0) {
      return
    }

    await this.cache.deleteMany(fallbackKeysToDelete)
    this.recordCacheMetric(
      'invalidation_evictions_path',
      fallbackKeysToDelete.length
    )
    emitTelemetryEvent({
      name: 'renoun.cache.invalidate_fallback',
      fields: {
        pathHash: toTelemetryHash(normalizedPath),
        pathDepth: getTelemetryPathDepth(normalizedPath),
        mode: useTargetedMissingDependencyNodes
          ? 'targeted_missing_dependency_nodes'
          : includeNonDirectoryKeys
            ? 'full_key_scan'
            : 'directory_prefix_scan',
        candidateEntries: candidateKeys.length,
        invalidatedEntries: fallbackKeysToDelete.length,
      },
      telemetry: this.#telemetry,
    })
  }

  async #runBroadPersistedInvalidationFallbackBatch(
    normalizedPaths: ReadonlyArray<string>,
    options: {
      includeNonDirectoryKeys?: boolean
      missingDependencyNodeKeys?: ReadonlyArray<string>
      forceFullScan?: boolean
    } = {}
  ): Promise<void> {
    if (normalizedPaths.length === 0) {
      return
    }

    const includeNonDirectoryKeys = options.includeNonDirectoryKeys === true
    const forceFullScan = options.forceFullScan === true
    const collapsedPaths = collapseInvalidationPaths(normalizedPaths)
    if (collapsedPaths.length === 0) {
      return
    }

    const missingDependencyNodeKeys =
      options.missingDependencyNodeKeys &&
      options.missingDependencyNodeKeys.length > 0
        ? Array.from(new Set(options.missingDependencyNodeKeys))
        : undefined
    const useTargetedMissingDependencyNodes =
      this.#targetedMissingDependencyFallbackEnabled &&
      includeNonDirectoryKeys &&
      !forceFullScan &&
      !!missingDependencyNodeKeys &&
      missingDependencyNodeKeys.length > 0

    const candidateKeys = includeNonDirectoryKeys
      ? useTargetedMissingDependencyNodes
        ? missingDependencyNodeKeys
        : await this.cache.listNodeKeysByPrefix('')
      : await this.#listDirectorySnapshotFallbackCandidatesForMany(
          collapsedPaths
        )
    if (candidateKeys.length === 0) {
      return
    }

    const fallbackKeysToDelete: string[] = []
    for (const key of candidateKeys) {
      const directoryPath = extractDirectoryPathFromSnapshotKey(key)
      if (!directoryPath) {
        if (!includeNonDirectoryKeys) {
          continue
        }
        fallbackKeysToDelete.push(key)
        continue
      }

      const intersectsAnyPath = collapsedPaths.some((normalizedPath) => {
        return pathsIntersect(directoryPath, normalizedPath)
      })
      if (intersectsAnyPath) {
        fallbackKeysToDelete.push(key)
      }
    }

    if (fallbackKeysToDelete.length === 0) {
      return
    }

    await this.cache.deleteMany(fallbackKeysToDelete)
    this.recordCacheMetric(
      'invalidation_evictions_path',
      fallbackKeysToDelete.length
    )
    emitTelemetryEvent({
      name: 'renoun.cache.invalidate_fallback_batch',
      fields: {
        pathCount: collapsedPaths.length,
        mode: useTargetedMissingDependencyNodes
          ? 'targeted_missing_dependency_nodes'
          : includeNonDirectoryKeys
            ? 'full_key_scan'
            : 'directory_prefix_scan',
        candidateEntries: candidateKeys.length,
        invalidatedEntries: fallbackKeysToDelete.length,
      },
      telemetry: this.#telemetry,
    })
  }

  #recordPersistedFallbackTrigger(options: {
    pathCount: number
    dependencyIndexUnavailable: boolean
    hasMissingDependencyMetadata: boolean
    missingDependencyNodeKeyCount: number
  }): void {
    this.recordCacheMetric('invalidation_fallback_runs')

    if (options.dependencyIndexUnavailable) {
      this.recordCacheMetric(
        'invalidation_fallback_due_to_dependency_index_unavailable'
      )
    }
    if (options.hasMissingDependencyMetadata) {
      this.recordCacheMetric(
        'invalidation_fallback_due_to_missing_dependency_metadata'
      )
      if (options.missingDependencyNodeKeyCount > 0) {
        this.recordCacheMetric(
          'invalidation_fallback_targeted_missing_dependency_nodes',
          options.missingDependencyNodeKeyCount
        )
      }
    }

    emitTelemetryEvent({
      name: 'renoun.cache.invalidate_fallback_trigger',
      fields: {
        pathCount: options.pathCount,
        dependencyIndexUnavailable: options.dependencyIndexUnavailable,
        hasMissingDependencyMetadata: options.hasMissingDependencyMetadata,
        missingDependencyNodeKeyCount: options.missingDependencyNodeKeyCount,
      },
      telemetry: this.#telemetry,
    })
  }

  async #listDirectorySnapshotFallbackCandidates(
    normalizedPath: string
  ): Promise<string[]> {
    const prefixes = getPersistedFallbackDirectorySnapshotPrefixes(
      normalizedPath
    )
    if (prefixes.length === 0) {
      return []
    }

    const batches = await Promise.all(
      prefixes.map((prefix) => this.cache.listNodeKeysByPrefix(prefix))
    )
    const keys = new Set<string>()
    for (const batch of batches) {
      for (const key of batch) {
        keys.add(key)
      }
    }
    return Array.from(keys)
  }

  async #listDirectorySnapshotFallbackCandidatesForMany(
    normalizedPaths: ReadonlyArray<string>
  ): Promise<string[]> {
    if (normalizedPaths.length === 0) {
      return []
    }

    const prefixSet = new Set<string>()
    for (const normalizedPath of normalizedPaths) {
      const pathPrefixes = getPersistedFallbackDirectorySnapshotPrefixes(
        normalizedPath
      )
      for (const prefix of pathPrefixes) {
        prefixSet.add(prefix)
      }
    }

    if (prefixSet.size === 0) {
      return []
    }

    const batches = await Promise.all(
      Array.from(prefixSet)
        .sort()
        .map((prefix) => this.cache.listNodeKeysByPrefix(prefix))
    )
    const keys = new Set<string>()
    for (const batch of batches) {
      for (const key of batch) {
        keys.add(key)
      }
    }
    return Array.from(keys)
  }

  #cleanupExpiredInvalidatedPaths(now = Date.now()): void {
    const expiresBefore = now - this.#invalidatedPathTtlMs
    for (const [path, timestamp] of this.#recentlyInvalidatedPathTimestamps) {
      if (timestamp <= expiresBefore) {
        this.#recentlyInvalidatedPathTimestamps.delete(path)
      }
    }
  }

  #emitCacheMetricLog(fields: Record<string, string | number>): void {
    if (!this.#cacheMetricsEnabled) {
      return
    }

    const metricName =
      typeof fields['metric'] === 'string' ? fields['metric'] : 'unknown'
    const tags: Record<string, string> = {
      metric: metricName,
    }
    const metricFields: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(fields)) {
      if (key === 'metric') {
        continue
      }

      if (
        (key === 'reason' || key === 'trigger') &&
        typeof value === 'string'
      ) {
        tags[key] = value
        continue
      }

      if (key === 'path' && typeof value === 'string') {
        metricFields['pathHash'] = toTelemetryHash(value)
        metricFields['pathDepth'] = getTelemetryPathDepth(value)
        continue
      }

      if (key === 'snapshotKey' && typeof value === 'string') {
        metricFields['snapshotKeyHash'] = toTelemetryHash(value)
        continue
      }

      metricFields[key] = value
    }

    emitTelemetryEvent({
      name: 'renoun.fs.cache.metric',
      tags,
      fields: metricFields,
      telemetry: this.#telemetry,
    })

    const debugLogger = getDebugLogger()
    if (debugLogger.isEnabled('info')) {
      debugLogger.info('File-system cache metric', () => ({
        data: fields,
      }))
    }
  }

  #getDirectorySnapshotKeyMetrics(
    snapshotKey: string
  ): DirectorySnapshotKeyMetrics {
    const existing = this.#directorySnapshotMetricsByKey.get(snapshotKey)
    if (existing) {
      this.#directorySnapshotMetricsByKey.delete(snapshotKey)
      this.#directorySnapshotMetricsByKey.set(snapshotKey, existing)
      return existing
    }

    const created: DirectorySnapshotKeyMetrics = {
      lookups: 0,
      memoryHits: 0,
      memoryMisses: 0,
      persistedHits: 0,
      persistedMisses: 0,
      rebuilds: 0,
    }
    this.#directorySnapshotMetricsByKey.set(snapshotKey, created)
    this.#trimDirectorySnapshotMetrics()
    return created
  }

  #incrementMapCount(map: Map<string, number>, key: string, by = 1): void {
    map.set(key, (map.get(key) ?? 0) + by)
  }

  #trimDirectorySnapshotMetrics(): void {
    if (
      this.#directorySnapshotMetricsByKey.size <=
      this.#cacheMetricsTopKeysTrackingLimit
    ) {
      return
    }

    const removeKeys: string[] = []
    for (const key of this.#directorySnapshotMetricsByKey.keys()) {
      removeKeys.push(key)
      if (
        this.#directorySnapshotMetricsByKey.size - removeKeys.length <=
        this.#cacheMetricsTopKeysTrackingLimit
      ) {
        break
      }
    }

    for (const key of removeKeys) {
      this.#directorySnapshotMetricsByKey.delete(key)
      this.#directorySnapshotRebuildReasonByKey.delete(key)
    }
  }

  #maybeEmitDirectorySnapshotMetrics(
    force = false,
    trigger = 'interval'
  ): void {
    if (!this.#cacheMetricsEnabled) {
      return
    }

    if (
      !force &&
      this.#directorySnapshotRebuildEventsSinceLog <
        this.#cacheMetricsTopKeysLogInterval
    ) {
      return
    }

    this.#directorySnapshotRebuildEventsSinceLog = 0

    const entries = Array.from(this.#directorySnapshotMetricsByKey.entries())
      .filter(([, metrics]) => metrics.lookups > 0)
      .sort((first, second) => {
        const firstMetrics = first[1]
        const secondMetrics = second[1]
        if (secondMetrics.rebuilds !== firstMetrics.rebuilds) {
          return secondMetrics.rebuilds - firstMetrics.rebuilds
        }
        if (secondMetrics.lookups !== firstMetrics.lookups) {
          return secondMetrics.lookups - firstMetrics.lookups
        }
        if (secondMetrics.persistedHits !== firstMetrics.persistedHits) {
          return secondMetrics.persistedHits - firstMetrics.persistedHits
        }
        return first[0].localeCompare(second[0])
      })
      .slice(0, this.#cacheMetricsTopKeysLimit)

    for (let index = 0; index < entries.length; index += 1) {
      const [snapshotKey, metrics] = entries[index]!
      const path =
        extractDirectoryPathFromSnapshotKey(snapshotKey) ?? snapshotKey
      this.#emitCacheMetricLog({
        metric: 'snapshot_hot_key',
        trigger,
        rank: index + 1,
        path,
        key_hash: hashString(snapshotKey).slice(0, 8),
        lookups: metrics.lookups,
        rebuilds: metrics.rebuilds,
        memory_hits: metrics.memoryHits,
        memory_misses: metrics.memoryMisses,
        persisted_hits: metrics.persistedHits,
        persisted_misses: metrics.persistedMisses,
      })
    }

    const reasons = Array.from(
      this.#directorySnapshotRebuildReasonTotals.entries()
    )
      .sort((first, second) => {
        if (second[1] !== first[1]) {
          return second[1] - first[1]
        }
        return first[0].localeCompare(second[0])
      })
      .slice(0, this.#cacheMetricsTopKeysLimit)

    for (const [reason, total] of reasons) {
      this.#emitCacheMetricLog({
        metric: 'snapshot_rebuild_reason',
        trigger,
        reason,
        total,
      })
    }
  }
}

function normalizeSessionPath(fileSystem: FileSystem, path: string): string {
  const relativePath = fileSystem.getRelativePathToWorkspace(path)
  return normalizePathKey(relativePath)
}

function toTelemetryHash(value: string): string {
  return hashString(value).slice(0, 12)
}

function getTelemetryPathDepth(path: string): number {
  if (path === '.') {
    return 0
  }

  return path.split('/').filter((segment) => segment.length > 0).length
}

function getPersistedFallbackDirectorySnapshotPrefixes(path: string): string[] {
  if (path === '.') {
    return ['dir:']
  }

  const prefixes = new Set<string>()
  prefixes.add(`dir:${path}`)

  for (const ancestorPath of getPathAncestors(path)) {
    prefixes.add(`dir:${ancestorPath}`)
  }

  return Array.from(prefixes).sort()
}

function resolveSessionProjectRoot(
  fileSystem: FileSystem,
  debug: boolean = false
): string {
  const repoRoot = (fileSystem as any).repoRoot
  if (typeof repoRoot === 'string' && isAbsolutePath(repoRoot)) {
    const resolvedRoot = resolveCanonicalPath(repoRoot)
    if (debug) {
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
    if (debug) {
      // eslint-disable-next-line no-console
      console.log(
        '[renoun-debug] resolveSessionProjectRoot(getAbsolutePath failed)',
        {
          repoRoot: typeof repoRoot === 'string' ? repoRoot : undefined,
          error: error instanceof Error ? error.message : String(error),
        }
      )
    }
  }

  if (absoluteRoot && resolve(absoluteRoot) === resolve('/')) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log('[renoun-debug] resolveSessionProjectRoot(rootless)', {
        absoluteRoot,
      })
    }
    absoluteRoot = undefined
  }

  if (!absoluteRoot) {
    absoluteRoot =
      typeof repoRoot === 'string' ? resolve(repoRoot) : resolve('.')
  }

  try {
    const rootDirectory = getRootDirectory(absoluteRoot)
    return resolveCanonicalPath(rootDirectory)
  } catch (error) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log('[renoun-debug] resolveSessionProjectRoot(fallback)', {
        error: error instanceof Error ? error.message : String(error),
        absoluteRoot,
      })
    }
    return resolveCanonicalPath(absoluteRoot)
  }
}

function resolveDirectorySnapshotPrefixIndexMaxKeys(
  configuredMaxKeys?: number
): number {
  if (
    typeof configuredMaxKeys === 'number' &&
    Number.isFinite(configuredMaxKeys) &&
    configuredMaxKeys > 0
  ) {
    return Math.floor(configuredMaxKeys)
  }

  return SESSION_CACHE_DEFAULTS.directorySnapshotPrefixIndexMaxKeys
}

function resolveTargetedMissingDependencyFallback(
  configuredValue?: boolean
): boolean {
  if (typeof configuredValue === 'boolean') {
    return configuredValue
  }

  return true
}

function resolveCanonicalPath(pathToResolve: string): string {
  try {
    return realpathSync(pathToResolve)
  } catch {
    return resolve(pathToResolve)
  }
}

function shouldUseSessionCachePersistence(fileSystem: FileSystem): boolean {
  try {
    return fileSystem.usesPersistentCacheByDefault()
  } catch {
    return false
  }
}
