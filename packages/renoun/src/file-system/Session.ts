import { resolve } from 'node:path'
import { realpathSync } from 'node:fs'

import { isAbsolutePath, normalizePathKey } from '../utils/path.ts'
import { hashString, stableStringify } from '../utils/stable-serialization.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import { emitTelemetryEvent } from '../utils/telemetry.ts'
import type { Telemetry } from '../utils/telemetry.ts'
import { Cache, CacheStore } from './Cache.ts'
import { getCacheStorePersistence } from './CacheSqlite.ts'
import type { FileSystem } from './FileSystem.ts'
import {
  FileSystemSnapshot,
  type Snapshot,
  type SnapshotContentIdOptions,
} from './Snapshot.ts'
import type { DirectorySnapshot } from './directory-snapshot.ts'
import { WorkspaceChangeLookupCache } from './workspace-change-lookup-cache.ts'

const sessionsByFileSystem = new WeakMap<
  object,
  Map<string, Map<string, Session>>
>()
const cacheIdentityByCache = new WeakMap<object, string>()
const snapshotGenerationByFileSystem = new WeakMap<object, number>()
const snapshotParentByFileSystem = new WeakMap<object, Map<string, string>>()
let cacheIdentity = 0

type PersistedStaleReason =
  | 'token_changed'
  | 'dep_changed'
  | 'shape_mismatch'
  | 'policy_nonpersistable'

type DirectorySnapshotHitSource = 'memory' | 'persisted'

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

const DEFAULT_WORKSPACE_CHANGE_TOKEN_TTL_MS = 250
const DEFAULT_WORKSPACE_CHANGED_PATHS_TTL_MS = 250
const DEFAULT_PERSISTENT_WORKSPACE_CHANGE_TOKEN_TTL_MS = 0
const DEFAULT_PERSISTENT_WORKSPACE_CHANGED_PATHS_TTL_MS = 0
const DEFAULT_INVALIDATED_PATH_TTL_MS = 1000
const WORKSPACE_CHANGED_PATHS_CLEANUP_INTERVAL_MS = 1000
const WORKSPACE_CHANGED_PATHS_MAX_ENTRIES = 512
const DEFAULT_CACHE_METRICS_TOP_KEYS_LIMIT = 10
const DEFAULT_CACHE_METRICS_TOP_KEYS_TRACKING_LIMIT = 250
const DEFAULT_CACHE_METRICS_TOP_KEYS_LOG_INTERVAL = 25
const DEFAULT_DIRECTORY_SNAPSHOT_PREFIX_INDEX_MAX_KEYS = 50_000
const DIRECTORY_SNAPSHOT_PREFIX_INDEX_REENABLE_RATIO = 0.5

function getDefaultPersistentWorkspaceChangeTokenTtlMs(): number {
  if (process.env['NODE_ENV'] === 'development') {
    return DEFAULT_WORKSPACE_CHANGE_TOKEN_TTL_MS
  }

  return DEFAULT_PERSISTENT_WORKSPACE_CHANGE_TOKEN_TTL_MS
}

function getDefaultPersistentWorkspaceChangedPathsTtlMs(): number {
  if (process.env['NODE_ENV'] === 'development') {
    return DEFAULT_WORKSPACE_CHANGED_PATHS_TTL_MS
  }

  return DEFAULT_PERSISTENT_WORKSPACE_CHANGED_PATHS_TTL_MS
}

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

class IndexedStringKeyMap<Value> extends Map<string, Value> {
  readonly #onAdd: (key: string) => void
  readonly #onDelete: (key: string) => void
  readonly #onClear: () => void

  constructor(options: {
    onAdd: (key: string) => void
    onDelete: (key: string) => void
    onClear: () => void
  }) {
    super()
    this.#onAdd = options.onAdd
    this.#onDelete = options.onDelete
    this.#onClear = options.onClear
  }

  override set(key: string, value: Value): this {
    const existed = super.has(key)
    super.set(key, value)
    if (!existed) {
      this.#onAdd(key)
    }
    return this
  }

  override delete(key: string): boolean {
    const deleted = super.delete(key)
    if (deleted) {
      this.#onDelete(key)
    }
    return deleted
  }

  override clear(): void {
    if (this.size === 0) {
      return
    }
    super.clear()
    this.#onClear()
  }
}

class DirectorySnapshotPathIndex {
  readonly #maxPrefixKeys: number
  readonly #snapshotPathByKey = new Map<string, string>()
  readonly #keysByExactPath = new Map<string, Set<string>>()
  readonly #keysByPrefixPath = new Map<string, Set<string>>()
  #prefixIndexEnabled = true

  constructor() {
    this.#maxPrefixKeys = resolveDirectorySnapshotPrefixIndexMaxKeys()
  }

  add(snapshotKey: string): void {
    const snapshotPath = extractDirectoryPathFromSnapshotKey(snapshotKey)
    if (!snapshotPath) {
      return
    }

    const existingPath = this.#snapshotPathByKey.get(snapshotKey)
    if (existingPath === snapshotPath) {
      return
    }
    if (existingPath) {
      this.remove(snapshotKey)
    }

    this.#snapshotPathByKey.set(snapshotKey, snapshotPath)
    addToSetMap(this.#keysByExactPath, snapshotPath, snapshotKey)

    if (snapshotPath === '.') {
      return
    }

    if (!this.#prefixIndexEnabled) {
      this.#maybeRebuildPrefixIndex()
      return
    }

    for (const prefix of getPathPrefixes(snapshotPath)) {
      addToSetMap(this.#keysByPrefixPath, prefix, snapshotKey)
    }

    this.#disablePrefixIndexIfOversized()
  }

  remove(snapshotKey: string): void {
    const snapshotPath = this.#snapshotPathByKey.get(snapshotKey)
    if (!snapshotPath) {
      return
    }

    this.#snapshotPathByKey.delete(snapshotKey)
    deleteFromSetMap(this.#keysByExactPath, snapshotPath, snapshotKey)

    if (snapshotPath === '.') {
      return
    }

    if (!this.#prefixIndexEnabled) {
      this.#maybeRebuildPrefixIndex()
      return
    }

    for (const prefix of getPathPrefixes(snapshotPath)) {
      deleteFromSetMap(this.#keysByPrefixPath, prefix, snapshotKey)
    }
  }

  clear(): void {
    this.#snapshotPathByKey.clear()
    this.#keysByExactPath.clear()
    this.#keysByPrefixPath.clear()
    this.#prefixIndexEnabled = true
  }

  getIntersectingKeys(path: string): Set<string> {
    if (path === '.') {
      return new Set(this.#snapshotPathByKey.keys())
    }

    if (!this.#prefixIndexEnabled) {
      this.#maybeRebuildPrefixIndex()
      if (!this.#prefixIndexEnabled) {
        return this.#scanIntersectingKeys(path)
      }
    }

    const intersectingKeys = new Set<string>()

    const descendantKeys = this.#keysByPrefixPath.get(path)
    if (descendantKeys) {
      for (const key of descendantKeys) {
        intersectingKeys.add(key)
      }
    }

    for (const ancestorPath of getPathAncestors(path)) {
      const ancestorKeys = this.#keysByExactPath.get(ancestorPath)
      if (!ancestorKeys) {
        continue
      }
      for (const key of ancestorKeys) {
        intersectingKeys.add(key)
      }
    }

    return intersectingKeys
  }

  #scanIntersectingKeys(path: string): Set<string> {
    const intersectingKeys = new Set<string>()
    for (const [snapshotKey, snapshotPath] of this.#snapshotPathByKey) {
      if (pathsIntersect(snapshotPath, path)) {
        intersectingKeys.add(snapshotKey)
      }
    }

    return intersectingKeys
  }

  #disablePrefixIndexIfOversized(): void {
    if (this.#keysByPrefixPath.size <= this.#maxPrefixKeys) {
      return
    }

    this.#keysByPrefixPath.clear()
    this.#prefixIndexEnabled = false
  }

  #maybeRebuildPrefixIndex(): void {
    if (this.#prefixIndexEnabled) {
      return
    }

    const rebuildThreshold = Math.floor(
      this.#maxPrefixKeys * DIRECTORY_SNAPSHOT_PREFIX_INDEX_REENABLE_RATIO
    )
    if (this.#snapshotPathByKey.size > rebuildThreshold) {
      return
    }

    this.#keysByPrefixPath.clear()
    for (const [snapshotKey, snapshotPath] of this.#snapshotPathByKey) {
      if (snapshotPath === '.') {
        continue
      }

      for (const prefix of getPathPrefixes(snapshotPath)) {
        addToSetMap(this.#keysByPrefixPath, prefix, snapshotKey)
      }

      if (this.#keysByPrefixPath.size > this.#maxPrefixKeys) {
        this.#keysByPrefixPath.clear()
        this.#prefixIndexEnabled = false
        return
      }
    }

    this.#prefixIndexEnabled = true
  }
}

function addToSetMap(
  map: Map<string, Set<string>>,
  key: string,
  value: string
): void {
  let entries = map.get(key)
  if (!entries) {
    entries = new Set<string>()
    map.set(key, entries)
  }
  entries.add(value)
}

function deleteFromSetMap(
  map: Map<string, Set<string>>,
  key: string,
  value: string
): void {
  const entries = map.get(key)
  if (!entries) {
    return
  }

  entries.delete(value)
  if (entries.size === 0) {
    map.delete(key)
  }
}

export class Session {
  static for(
    fileSystem: FileSystem,
    snapshot?: Snapshot,
    cache?: Cache
  ): Session {
    const generation = snapshotGenerationByFileSystem.get(fileSystem) ?? 0
    const baseSnapshot = snapshot ?? new FileSystemSnapshot(fileSystem)
    const targetSnapshot =
      generation > 0
        ? new GeneratedSnapshot(baseSnapshot, generation)
        : baseSnapshot
    const cacheId = getCacheIdentity(cache)
    const sessionMap =
      sessionsByFileSystem.get(fileSystem) ??
      new Map<string, Map<string, Session>>()
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

    const cacheSessions =
      sessionMap.get(targetSnapshot.id) ?? new Map<string, Session>()
    const existing = cacheSessions.get(cacheId)
    if (existing) {
      return existing
    }

    const created = new Session(fileSystem, targetSnapshot, cache)
    cacheSessions.set(cacheId, created)
    sessionMap.set(targetSnapshot.id, cacheSessions)
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
      const familyEntries = Array.from(sessionMap.entries()).filter(([id]) =>
        family.has(id)
      )

      if (familyEntries.length === 0) {
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

      for (const [id, cacheSessions] of familyEntries) {
        for (const session of cacheSessions.values()) {
          session.reset()
        }
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

    for (const cacheSessions of sessionMap.values()) {
      for (const session of cacheSessions.values()) {
        session.reset()
      }
    }

    sessionMap.clear()
    sessionsByFileSystem.delete(fileSystem)
    snapshotParentByFileSystem.delete(fileSystem)
  }

  readonly #fileSystem: FileSystem
  readonly snapshot: Snapshot
  readonly inflight = new Map<string, Promise<unknown>>()
  readonly cache: CacheStore
  readonly #directorySnapshotPathIndex = new DirectorySnapshotPathIndex()
  readonly #directorySnapshotBuildPathIndex = new DirectorySnapshotPathIndex()
  readonly directorySnapshots = new IndexedStringKeyMap<
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
  readonly directorySnapshotBuilds = new IndexedStringKeyMap<
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
  readonly #functionIds = new WeakMap<Function, string>()
  #nextFunctionId = 0
  readonly #invalidatedDirectorySnapshotKeys = new Set<string>()
  readonly #workspaceChangeLookupCache: WorkspaceChangeLookupCache
  readonly #recentlyInvalidatedPathTimestamps = new Map<string, number>()
  readonly #pendingPersistedInvalidationPaths = new Set<string>()
  #persistedInvalidationQueue: Promise<void> = Promise.resolve()
  #persistedInvalidationDrainScheduled = false
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
    this.#targetedMissingDependencyFallbackEnabled = resolveBooleanEnv(
      process.env['RENOUN_TARGETED_MISSING_DEP_FALLBACK'],
      true
    )
    this.#telemetry = cache?.telemetry
    this.#workspaceChangeLookupCache = new WorkspaceChangeLookupCache({
      getWorkspaceTokenTtlMs: () => this.#resolveWorkspaceChangeTokenTtlMs(),
      getWorkspaceChangedPathsTtlMs: () =>
        this.#resolveWorkspaceChangedPathsTtlMs(),
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
      changedPathsCleanupIntervalMs: WORKSPACE_CHANGED_PATHS_CLEANUP_INTERVAL_MS,
      changedPathsMaxEntries: WORKSPACE_CHANGED_PATHS_MAX_ENTRIES,
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
    await this.#persistedInvalidationQueue.catch(() => {})
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
      void this.cache.deleteMany(expiredKeys)
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
      this.#queuePersistedDependencyInvalidations(normalizedPaths)
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
    this.#pendingPersistedInvalidationPaths.clear()
    this.#persistedInvalidationQueue = Promise.resolve()
    this.#persistedInvalidationDrainScheduled = false
    this.#directorySnapshotMetricsByKey.clear()
    this.#directorySnapshotRebuildReasonTotals.clear()
    this.#directorySnapshotRebuildReasonByKey.clear()
    this.#directorySnapshotRebuildEventsSinceLog = 0
    this.cache.dispose()
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

  #queuePersistedDependencyInvalidations(
    normalizedPaths: ReadonlyArray<string>
  ): void {
    let hasQueuedPath = false
    for (const normalizedPath of normalizedPaths) {
      if (normalizedPath.length === 0) {
        continue
      }

      if (this.#pendingPersistedInvalidationPaths.has(normalizedPath)) {
        continue
      }

      this.#pendingPersistedInvalidationPaths.add(normalizedPath)
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
    this.#persistedInvalidationQueue = this.#persistedInvalidationQueue
      .catch(() => {})
      .then(() => this.#drainPersistedDependencyInvalidations())
  }

  async #drainPersistedDependencyInvalidations(): Promise<void> {
    try {
      while (this.#pendingPersistedInvalidationPaths.size > 0) {
        const normalizedPaths = collapseInvalidationPaths(
          this.#pendingPersistedInvalidationPaths
        )
        this.#pendingPersistedInvalidationPaths.clear()

        await this.#runPersistedDependencyInvalidationsBatch(normalizedPaths)
      }
    } finally {
      this.#persistedInvalidationDrainScheduled = false
      if (this.#pendingPersistedInvalidationPaths.size > 0) {
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
        process.env['NODE_ENV'] !== 'test'
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

    const orderedEntries = Object.entries(fields).sort(([first], [second]) =>
      first.localeCompare(second)
    )
    const message = orderedEntries
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(' ')
    console.log(`[renoun-fs-cache-metrics] ${message}`)
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

function getCacheIdentity(cache?: Cache): string {
  if (!cache) {
    return 'default'
  }

  const cached = cacheIdentityByCache.get(cache)
  if (cached) {
    return cached
  }

  const identity = `cache-${cacheIdentity + 1}`
  cacheIdentityByCache.set(cache, identity)
  cacheIdentity += 1

  return identity
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

  getRelativePathToWorkspace(path: string): string {
    return this.#base.getRelativePathToWorkspace(path)
  }

  contentId(path: string, options?: SnapshotContentIdOptions) {
    return this.#base.contentId(path, options)
  }

  getWorkspaceChangeToken(rootPath: string): Promise<string | null> {
    const getter = this.#base.getWorkspaceChangeToken
    if (typeof getter !== 'function') {
      return Promise.resolve(null)
    }

    return getter.call(this.#base, rootPath)
  }

  getWorkspaceChangedPathsSinceToken(
    rootPath: string,
    previousToken: string
  ): Promise<ReadonlySet<string> | null> {
    const getter = this.#base.getWorkspaceChangedPathsSinceToken
    if (typeof getter !== 'function') {
      return Promise.resolve(null)
    }

    return getter.call(this.#base, rootPath, previousToken)
  }

  getRecentlyInvalidatedPaths(): ReadonlySet<string> | undefined {
    const getter = this.#base.getRecentlyInvalidatedPaths
    if (typeof getter !== 'function') {
      return undefined
    }

    return getter.call(this.#base)
  }

  invalidatePath(path: string) {
    this.#base.invalidatePath(path)
  }

  invalidatePaths(paths: Iterable<string>) {
    if (typeof this.#base.invalidatePaths === 'function') {
      this.#base.invalidatePaths(paths)
      return
    }

    for (const path of paths) {
      this.#base.invalidatePath(path)
    }
  }

  invalidateAll() {
    if (typeof this.#base.invalidateAll === 'function') {
      this.#base.invalidateAll()
      return
    }

    this.#base.invalidatePath('.')
  }

  onInvalidate(listener: (path: string) => void): () => void {
    return this.#base.onInvalidate(listener)
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

function extractDirectoryPathFromSnapshotKey(key: string): string | undefined {
  if (!key.startsWith('dir:')) {
    return undefined
  }

  const delimiterIndex = key.indexOf('|')
  const rawPath =
    delimiterIndex === -1
      ? key.slice('dir:'.length)
      : key.slice('dir:'.length, delimiterIndex)
  if (!rawPath) {
    return undefined
  }

  return normalizePathKey(rawPath)
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

function getPathPrefixes(path: string): string[] {
  if (path === '.' || path.length === 0) {
    return []
  }

  const segments = path.split('/').filter((segment) => segment.length > 0)
  if (segments.length === 0) {
    return []
  }

  const prefixes: string[] = []
  let current = ''
  for (const segment of segments) {
    current = current.length > 0 ? `${current}/${segment}` : segment
    prefixes.push(current)
  }

  return prefixes
}

function getPathAncestors(path: string): string[] {
  if (path === '.' || path.length === 0) {
    return ['.']
  }

  const ancestors: string[] = []
  let current = path

  while (true) {
    ancestors.push(current)
    if (current === '.') {
      break
    }

    const separatorIndex = current.lastIndexOf('/')
    if (separatorIndex <= 0) {
      current = '.'
      continue
    }

    current = current.slice(0, separatorIndex)
  }

  return ancestors
}

function collapseInvalidationPaths(paths: Iterable<string>): string[] {
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
    const isRedundant = collapsedPaths.some((existingPath) => {
      return path === existingPath || path.startsWith(`${existingPath}/`)
    })

    if (!isRedundant) {
      collapsedPaths.push(path)
    }
  }

  return collapsedPaths
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

function resolveDirectorySnapshotPrefixIndexMaxKeys(): number {
  const configured = process.env['RENOUN_DIRECTORY_SNAPSHOT_PREFIX_INDEX_MAX_KEYS']
  if (!configured) {
    return DEFAULT_DIRECTORY_SNAPSHOT_PREFIX_INDEX_MAX_KEYS
  }

  const parsed = Number.parseInt(configured, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_DIRECTORY_SNAPSHOT_PREFIX_INDEX_MAX_KEYS
  }

  return parsed
}

function resolveCanonicalPath(pathToResolve: string): string {
  try {
    return realpathSync(pathToResolve)
  } catch {
    return resolve(pathToResolve)
  }
}

function shouldUseSessionCachePersistence(fileSystem: FileSystem): boolean {
  const constructorName = fileSystem.constructor?.name ?? ''
  const isNodeBasedFileSystem =
    constructorName === 'NodeFileSystem' ||
    constructorName === 'NestedCwdNodeFileSystem' ||
    constructorName.endsWith('NodeFileSystem')
  const isGitBasedFileSystem =
    constructorName === 'GitFileSystem' ||
    constructorName === 'GitVirtualFileSystem' ||
    constructorName.endsWith('GitFileSystem')
  const isInMemoryFileSystem =
    constructorName === 'InMemoryFileSystem' ||
    constructorName === 'MutableTimestampFileSystem'

  if (isInMemoryFileSystem) {
    return false
  }

  return isNodeBasedFileSystem || isGitBasedFileSystem
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number
): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }
  const parsed = Math.floor(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeNonNegativeInteger(
  value: number | undefined,
  fallback: number
): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }
  const parsed = Math.floor(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function resolveBooleanEnv(
  value: string | undefined,
  fallback: boolean
): boolean {
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false
  }

  return fallback
}
