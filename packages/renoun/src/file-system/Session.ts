import { resolve } from 'node:path'
import { realpathSync } from 'node:fs'

import {
  isAbsolutePath,
  normalizePathKey,
} from '../utils/path.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import { CacheStore, hashString, stableStringify } from './CacheStore.ts'
import { getCacheStorePersistence } from './CacheStoreSqlite.ts'
import type { FileSystem } from './FileSystem.ts'
import { FileSystemSnapshot, type Snapshot } from './Snapshot.ts'
import type { DirectorySnapshot } from './directory-snapshot.ts'

const sessionsByFileSystem = new WeakMap<object, Map<string, Session>>()
const snapshotGenerationByFileSystem = new WeakMap<object, number>()
const snapshotParentByFileSystem = new WeakMap<object, Map<string, string>>()

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

interface DirectorySnapshotKeyMetrics {
  lookups: number
  memoryHits: number
  memoryMisses: number
  persistedHits: number
  persistedMisses: number
  rebuilds: number
}

const WORKSPACE_CHANGE_TOKEN_TTL_MS = getEnvInt(
  'RENOUN_FS_WORKSPACE_CHANGE_TOKEN_TTL_MS',
  250
)
const WORKSPACE_CHANGED_PATHS_TTL_MS = getEnvInt(
  'RENOUN_FS_WORKSPACE_CHANGED_PATHS_TTL_MS',
  250
)
const INVALIDATED_PATH_TTL_MS = getEnvInt(
  'RENOUN_FS_INVALIDATED_PATH_TTL_MS',
  1000
)
const CACHE_METRICS_TOP_KEYS_LIMIT = Math.max(
  1,
  getEnvInt('RENOUN_FS_CACHE_TOP_KEYS_LIMIT', 10)
)
const CACHE_METRICS_TOP_KEYS_TRACKING_LIMIT = Math.max(
  CACHE_METRICS_TOP_KEYS_LIMIT,
  getEnvInt('RENOUN_FS_CACHE_TOP_KEYS_TRACKING_LIMIT', 250)
)
const CACHE_METRICS_TOP_KEYS_LOG_INTERVAL = Math.max(
  1,
  getEnvInt('RENOUN_FS_CACHE_TOP_KEYS_LOG_INTERVAL', 25)
)

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
  readonly usesPersistentCache: boolean
  readonly inflight = new Map<string, Promise<unknown>>()
  readonly cache: CacheStore
  readonly directorySnapshots = new Map<string, DirectorySnapshot<any, any>>()
  readonly directorySnapshotBuilds = new Map<
    string,
    Promise<{
      snapshot: DirectorySnapshot<any, any>
      shouldIncludeSelf: boolean
      skipPersist?: boolean
    }>
  >()
  readonly #functionIds = new WeakMap<Function, string>()
  #nextFunctionId = 0
  readonly #invalidatedDirectorySnapshotKeys = new Set<string>()
  readonly #workspaceChangeTokenByRootPath = new Map<
    string,
    {
      token: string | null
      expiresAt: number
      promise?: Promise<string | null>
    }
  >()
  readonly #workspaceChangedPathsByToken = new Map<
    string,
    {
      paths: ReadonlySet<string> | null
      expiresAt: number
      promise?: Promise<ReadonlySet<string> | null>
    }
  >()
  readonly #recentlyInvalidatedPathTimestamps = new Map<string, number>()
  #persistedInvalidationQueue: Promise<void> = Promise.resolve()
  readonly #cacheMetricsEnabled =
    process.env['RENOUN_FS_CACHE_METRICS'] === '1'
  readonly #cacheMetricCounters: Record<CacheMetricCounter, number> = {
    memory_hit: 0,
    memory_miss: 0,
    persisted_hit: 0,
    persisted_miss: 0,
    rebuild_count: 0,
    invalidation_evictions_path: 0,
    invalidation_evictions_dep_index: 0,
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

  private constructor(fileSystem: FileSystem, snapshot: Snapshot) {
    this.#fileSystem = fileSystem
    this.snapshot = snapshot

    this.usesPersistentCache = shouldUseSessionCachePersistence(fileSystem)
    const projectRoot = this.usesPersistentCache
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
    if (!this.#cacheMetricsEnabled) {
      return
    }

    const metrics = this.#getDirectorySnapshotKeyMetrics(snapshotKey)
    metrics.rebuilds += 1

    this.#incrementMapCount(this.#directorySnapshotRebuildReasonTotals, reason)

    let reasonCounts = this.#directorySnapshotRebuildReasonByKey.get(snapshotKey)
    if (!reasonCounts) {
      reasonCounts = new Map<string, number>()
      this.#directorySnapshotRebuildReasonByKey.set(snapshotKey, reasonCounts)
    }
    this.#incrementMapCount(reasonCounts, reason)

    this.#directorySnapshotRebuildEventsSinceLog += 1
    this.#maybeEmitDirectorySnapshotMetrics()
  }

  async getWorkspaceChangeToken(rootPath: string): Promise<string | null> {
    const tokenGetter = this.#fileSystem.getWorkspaceChangeToken
    if (typeof tokenGetter !== 'function') {
      return null
    }

    const normalizedRootPath = normalizeSessionPath(this.#fileSystem, rootPath)
    const now = Date.now()
    const cached = this.#workspaceChangeTokenByRootPath.get(normalizedRootPath)

    if (cached && cached.expiresAt > now) {
      return cached.token
    }

    if (cached?.promise) {
      return cached.promise
    }

    const lookupPromise = (async () => {
      try {
        const token = await tokenGetter.call(this.#fileSystem, rootPath)
        return typeof token === 'string' ? token : null
      } catch {
        return null
      }
    })()

    this.#workspaceChangeTokenByRootPath.set(normalizedRootPath, {
      token: cached?.token ?? null,
      expiresAt: now,
      promise: lookupPromise,
    })

    try {
      const token = await lookupPromise
      this.#workspaceChangeTokenByRootPath.set(normalizedRootPath, {
        token,
        expiresAt: Date.now() + WORKSPACE_CHANGE_TOKEN_TTL_MS,
      })
      return token
    } finally {
      const latest = this.#workspaceChangeTokenByRootPath.get(normalizedRootPath)
      if (latest?.promise === lookupPromise) {
        this.#workspaceChangeTokenByRootPath.delete(normalizedRootPath)
      }
    }
  }

  async getWorkspaceChangedPathsSinceToken(
    rootPath: string,
    previousToken: string
  ): Promise<ReadonlySet<string> | null> {
    const changedPathsGetter = this.#fileSystem.getWorkspaceChangedPathsSinceToken
    if (typeof changedPathsGetter !== 'function') {
      return null
    }

    const normalizedRootPath = normalizeSessionPath(this.#fileSystem, rootPath)
    const cacheKey = createWorkspaceChangedPathsCacheKey(
      normalizedRootPath,
      previousToken
    )
    const now = Date.now()
    const cached = this.#workspaceChangedPathsByToken.get(cacheKey)

    if (cached && cached.expiresAt > now) {
      return cached.paths
    }

    if (cached?.promise) {
      return cached.promise
    }

    const lookupPromise = (async () => {
      try {
        const changedPaths = await changedPathsGetter.call(
          this.#fileSystem,
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

          const normalizedPath = isAbsolutePath(changedPath)
            ? normalizeSessionPath(this.#fileSystem, changedPath)
            : normalizePathKey(changedPath)
          normalizedPaths.add(normalizedPath)
        }

        return normalizedPaths
      } catch {
        return null
      }
    })()

    this.#workspaceChangedPathsByToken.set(cacheKey, {
      paths: cached?.paths ?? null,
      expiresAt: now,
      promise: lookupPromise,
    })

    try {
      const changedPaths = await lookupPromise
      this.#workspaceChangedPathsByToken.set(cacheKey, {
        paths: changedPaths,
        expiresAt: Date.now() + WORKSPACE_CHANGED_PATHS_TTL_MS,
      })
      return changedPaths
    } finally {
      const latest = this.#workspaceChangedPathsByToken.get(cacheKey)
      if (latest?.promise === lookupPromise) {
        this.#workspaceChangedPathsByToken.delete(cacheKey)
      }
    }
  }

  getRecentlyInvalidatedPaths():
    | ReadonlySet<string>
    | undefined {
    this.#cleanupExpiredInvalidatedPaths()

    if (this.#recentlyInvalidatedPathTimestamps.size === 0) {
      return undefined
    }

    return new Set(this.#recentlyInvalidatedPathTimestamps.keys())
  }

  invalidatePath(path: string): void {
    const normalizedPath = normalizeSessionPath(this.#fileSystem, path)
    this.#recentlyInvalidatedPathTimestamps.set(normalizedPath, Date.now())
    this.#cleanupExpiredInvalidatedPaths()

    this.snapshot.invalidatePath(path)

    const expiredKeys = new Set<string>()

    for (const key of this.directorySnapshots.keys()) {
      const directoryPath = extractDirectoryPathFromSnapshotKey(key)
      if (directoryPath === undefined) {
        continue
      }

      if (pathsIntersect(directoryPath, normalizedPath)) {
        this.directorySnapshots.delete(key)
        this.markInvalidatedDirectorySnapshotKey(key)
        expiredKeys.add(key)
      }
    }
    for (const key of this.directorySnapshotBuilds.keys()) {
      const directoryPath = extractDirectoryPathFromSnapshotKey(key)
      if (directoryPath === undefined) {
        continue
      }

      if (pathsIntersect(directoryPath, normalizedPath)) {
        this.directorySnapshotBuilds.delete(key)
        this.markInvalidatedDirectorySnapshotKey(key)
        expiredKeys.add(key)
      }
    }

    if (expiredKeys.size > 0) {
      this.recordCacheMetric('invalidation_evictions_path', expiredKeys.size)
    }

    for (const key of expiredKeys) {
      void this.cache.delete(key)
    }

    this.#queuePersistedDependencyInvalidation(normalizedPath)
  }

  reset(): void {
    this.#maybeEmitDirectorySnapshotMetrics(true, 'reset')
    this.inflight.clear()
    this.directorySnapshots.clear()
    this.directorySnapshotBuilds.clear()
    this.#invalidatedDirectorySnapshotKeys.clear()
    this.#workspaceChangeTokenByRootPath.clear()
    this.#workspaceChangedPathsByToken.clear()
    this.#recentlyInvalidatedPathTimestamps.clear()
    this.#persistedInvalidationQueue = Promise.resolve()
    this.#directorySnapshotMetricsByKey.clear()
    this.#directorySnapshotRebuildReasonTotals.clear()
    this.#directorySnapshotRebuildReasonByKey.clear()
    this.#directorySnapshotRebuildEventsSinceLog = 0
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

  #queuePersistedDependencyInvalidation(normalizedPath: string): void {
    this.#persistedInvalidationQueue = this.#persistedInvalidationQueue
      .catch(() => {})
      .then(async () => {
        const dependencyEviction = await this.cache.deleteByDependencyPath(
          normalizedPath
        )

        if (dependencyEviction.deletedNodeKeys.length > 0) {
          this.recordCacheMetric(
            'invalidation_evictions_dep_index',
            dependencyEviction.deletedNodeKeys.length
          )
        }

        if (
          !dependencyEviction.usedDependencyIndex ||
          dependencyEviction.hasMissingDependencyMetadata
        ) {
          await this.#runBroadPersistedInvalidationFallback(normalizedPath)
        }
      })
  }

  async #runBroadPersistedInvalidationFallback(
    normalizedPath: string
  ): Promise<void> {
    const candidateKeys = await this.cache.listNodeKeysByPrefix('dir:')
    if (candidateKeys.length === 0) {
      return
    }

    const fallbackKeysToDelete: string[] = []

    for (const key of candidateKeys) {
      const directoryPath = extractDirectoryPathFromSnapshotKey(key)
      if (!directoryPath) {
        continue
      }

      if (pathsIntersect(directoryPath, normalizedPath)) {
        fallbackKeysToDelete.push(key)
      }
    }

    if (fallbackKeysToDelete.length === 0) {
      return
    }

    await Promise.all(
      fallbackKeysToDelete.map((key) => this.cache.delete(key))
    )
    this.recordCacheMetric(
      'invalidation_evictions_path',
      fallbackKeysToDelete.length
    )
  }

  #cleanupExpiredInvalidatedPaths(now = Date.now()): void {
    const expiresBefore = now - INVALIDATED_PATH_TTL_MS
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
      CACHE_METRICS_TOP_KEYS_TRACKING_LIMIT
    ) {
      return
    }

    const removeKeys: string[] = []
    for (const key of this.#directorySnapshotMetricsByKey.keys()) {
      removeKeys.push(key)
      if (
        this.#directorySnapshotMetricsByKey.size - removeKeys.length <=
        CACHE_METRICS_TOP_KEYS_TRACKING_LIMIT
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
        CACHE_METRICS_TOP_KEYS_LOG_INTERVAL
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
      .slice(0, CACHE_METRICS_TOP_KEYS_LIMIT)

    for (let index = 0; index < entries.length; index += 1) {
      const [snapshotKey, metrics] = entries[index]!
      const path = extractDirectoryPathFromSnapshotKey(snapshotKey) ?? snapshotKey
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

    const reasons = Array.from(this.#directorySnapshotRebuildReasonTotals.entries())
      .sort((first, second) => {
        if (second[1] !== first[1]) {
          return second[1] - first[1]
        }
        return first[0].localeCompare(second[0])
      })
      .slice(0, CACHE_METRICS_TOP_KEYS_LIMIT)

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

function createWorkspaceChangedPathsCacheKey(
  normalizedRootPath: string,
  previousToken: string
): string {
  return JSON.stringify([normalizedRootPath, previousToken])
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

function shouldUseSessionCachePersistence(fileSystem: FileSystem): boolean {
  const explicit = process.env['RENOUN_FS_CACHE']
  const constructorName = fileSystem.constructor?.name ?? ''
  const isInMemoryFileSystem =
    constructorName === 'InMemoryFileSystem' ||
    constructorName === 'MutableTimestampFileSystem'
  const hasExplicitCacheDbPath =
    typeof process.env['RENOUN_FS_CACHE_DB_PATH'] === 'string' &&
    process.env['RENOUN_FS_CACHE_DB_PATH'].trim().length > 0

  if (explicit === '1' || explicit?.toLowerCase() === 'true') {
    return true
  }

  if (explicit === '0' || explicit?.toLowerCase() === 'false') {
    return false
  }

  if (hasExplicitCacheDbPath && !isInMemoryFileSystem) {
    return true
  }

  if (process.env['VITEST'] === 'true') {
    if (isInMemoryFileSystem) {
      return false
    }

    if (process.env['NODE_ENV'] === 'production') {
      return true
    }

    const repoRoot = (fileSystem as { repoRoot?: unknown }).repoRoot
    return typeof repoRoot === 'string' && repoRoot.length > 0
  }

  return process.env['NODE_ENV'] === 'production'
}

function getEnvInt(envVarName: string, fallback: number): number {
  const value = process.env[envVarName]
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}
