import { AsyncLocalStorage } from 'node:async_hooks'

import { delay } from '../utils/delay.ts'
import { ReactiveDependencyGraph } from '../utils/reactive-dependency-graph.ts'
import { getDebugLogger } from '../utils/debug.ts'
import { hashString } from '../utils/stable-serialization.ts'
import type { Snapshot } from './Snapshot.ts'
import { summarizePersistedValue } from './cache-persistence-debug.ts'

export interface CacheDependency {
  depKey: string
  depVersion: string
}

export interface CacheEntry<Value = unknown> {
  value: Value
  deps: CacheDependency[]
  fingerprint: string
  persist: boolean
  updatedAt: number
}

export interface CacheDependencyEvictionResult {
  deletedNodeKeys: string[]
  usedDependencyIndex: boolean
  hasMissingDependencyMetadata: boolean
}

export interface CacheStorePersistence {
  load(
    nodeKey: string,
    options?: {
      skipFingerprintCheck?: boolean
      skipLastAccessedUpdate?: boolean
    }
  ): Promise<CacheEntry | undefined>
  save(nodeKey: string, entry: CacheEntry): Promise<void>
  saveWithRevision?(nodeKey: string, entry: CacheEntry): Promise<number>
  saveWithRevisionGuarded?(
    nodeKey: string,
    entry: CacheEntry,
    options: {
      expectedRevision: number | 'missing'
    }
  ): Promise<{ applied: boolean; revision: number }>
  delete(nodeKey: string): Promise<void>
  deleteByDependencyPath?(
    dependencyPathKey: string
  ): Promise<CacheDependencyEvictionResult>
  listNodeKeysByPrefix?(prefix: string): Promise<string[]>
}

export interface CacheStoreGetOrComputeOptions {
  persist?: boolean
  constDeps?: CacheStoreConstDependency[]
}

export interface CacheStorePutOptions {
  persist?: boolean
  deps?: CacheDependency[]
}

export interface CacheStoreComputeContext {
  readonly snapshot: Snapshot
  recordDep(depKey: string, depVersion: string): void
  recordConstDep(name: string, version: string): void
  recordFileDep(path: string): Promise<string>
  recordDirectoryDep(path: string): Promise<string>
  recordNodeDep(nodeKey: string): Promise<string>
}

export interface CacheStoreConstDependency {
  name: string
  version: string
}

export interface CacheStoreOptions {
  snapshot: Snapshot
  persistence?: CacheStorePersistence
  inflight?: Map<string, Promise<unknown>>
  computeSlotTtlMs?: number
  computeSlotPollMs?: number
  persistedVerificationAttempts?: number
  debugPersistenceFailure?: boolean
}

export interface CacheOptions {
  persistence?: CacheStorePersistence
  /** Enable cache metric collection for directory snapshots. */
  cacheMetricsEnabled?: boolean
  /** Maximum number of hot paths tracked when logging cache metrics. */
  cacheMetricsTopKeysLimit?: number
  /** Soft cap for hot-key tracking set size before trimming. */
  cacheMetricsTopKeysTrackingLimit?: number
  /** Number of events before emitting hot-key metrics. */
  cacheMetricsTopKeysLogInterval?: number
  /** TTL for cached workspace change tokens in milliseconds. */
  workspaceChangeTokenTtlMs?: number
  /** TTL for cached changed-path lookups in milliseconds. */
  workspaceChangedPathsTtlMs?: number
  /** TTL for recently invalidated paths cache in milliseconds. */
  invalidatedPathTtlMs?: number
  /** TTL for persisted compute slots in milliseconds. */
  computeSlotTtlMs?: number
  /** Poll interval for waiting on persisted compute slots in milliseconds. */
  computeSlotPollMs?: number
  /** Number of persisted read-back attempts after a write. Set to 0 to skip verification. */
  persistedVerificationAttempts?: number
  /** Log detailed cache persistence failures during debugging. */
  debugCachePersistence?: boolean
  /** Enable debug logging related to cache root/path resolution. */
  debugSessionRoot?: boolean
}

const DEFAULT_CACHE_STORE_COMPUTE_SLOT_TTL_MS = 20_000
const DEFAULT_CACHE_STORE_COMPUTE_SLOT_POLL_MS = 25
const DEFAULT_CACHE_STORE_PERSISTED_VERIFICATION_ATTEMPTS = 3
const NO_COMPUTE_SLOT_SHARED_VALUE = Symbol(
  'renoun.fs.cache.no-compute-slot-shared-value'
)

const DEFAULT_WORKSPACE_CHANGE_TOKEN_TTL_MS = 250
const DEFAULT_WORKSPACE_CHANGED_PATHS_TTL_MS = 250
const DEFAULT_INVALIDATED_PATH_TTL_MS = 1_000
const DEFAULT_CACHE_METRICS_TOP_KEYS_LIMIT = 10
const DEFAULT_CACHE_METRICS_TOP_KEYS_TRACKING_LIMIT = 250
const DEFAULT_CACHE_METRICS_TOP_KEYS_LOG_INTERVAL = 25
const DEFAULT_MEMORY_ONLY_CACHE_STORE_ID = 'memory-only-cache-store'

interface CacheStoreFactoryOptions {
  snapshot: Snapshot
  inflight?: Map<string, Promise<unknown>>
  computeSlotTtlMs?: number
  computeSlotPollMs?: number
  persistedVerificationAttempts?: number
  debugPersistenceFailure?: boolean
}

function createUnsupportedMemoryOnlySnapshotReadError(method: string): never {
  throw new Error(
    `[renoun] Memory-only cache snapshots do not support ${method}.`
  )
}

function createMemoryOnlySnapshot(id: string): Snapshot {
  const invalidateListeners = new Set<(path: string) => void>()

  return {
    id,
    async readDirectory() {
      return createUnsupportedMemoryOnlySnapshotReadError('readDirectory')
    },
    async readFile() {
      return createUnsupportedMemoryOnlySnapshotReadError('readFile')
    },
    async readFileBinary() {
      return createUnsupportedMemoryOnlySnapshotReadError('readFileBinary')
    },
    readFileStream() {
      return createUnsupportedMemoryOnlySnapshotReadError('readFileStream')
    },
    async fileExists() {
      return createUnsupportedMemoryOnlySnapshotReadError('fileExists')
    },
    async getFileLastModifiedMs() {
      return createUnsupportedMemoryOnlySnapshotReadError(
        'getFileLastModifiedMs'
      )
    },
    async getFileByteLength() {
      return createUnsupportedMemoryOnlySnapshotReadError('getFileByteLength')
    },
    isFilePathGitIgnored() {
      return false
    },
    async isFilePathExcludedFromTsConfigAsync() {
      return false
    },
    getRelativePathToWorkspace(path: string) {
      return normalizeCachePathKey(path)
    },
    async contentId(path: string) {
      return `memory:${normalizeCachePathKey(path)}`
    },
    invalidatePath(path: string) {
      for (const listener of invalidateListeners) {
        listener(path)
      }
    },
    invalidateAll() {
      for (const listener of invalidateListeners) {
        listener('.')
      }
    },
    onInvalidate(listener: (path: string) => void) {
      invalidateListeners.add(listener)
      return () => {
        invalidateListeners.delete(listener)
      }
    },
  }
}

export function createMemoryOnlyCacheStore(options: { id?: string } = {}) {
  return new CacheStore({
    snapshot: createMemoryOnlySnapshot(
      options.id ?? DEFAULT_MEMORY_ONLY_CACHE_STORE_ID
    ),
  })
}

export class Cache {
  readonly cacheMetricsEnabled: boolean
  readonly cacheMetricsTopKeysLimit: number
  readonly cacheMetricsTopKeysTrackingLimit: number
  readonly cacheMetricsTopKeysLogInterval: number
  readonly workspaceChangeTokenTtlMs: number
  readonly workspaceChangedPathsTtlMs: number
  readonly invalidatedPathTtlMs: number
  readonly computeSlotTtlMs: number
  readonly computeSlotPollMs: number
  readonly persistedVerificationAttempts: number
  readonly persistence?: CacheStorePersistence
  readonly usesPersistentCache: boolean
  readonly debugCachePersistence: boolean
  readonly debugSessionRoot: boolean

  constructor(options: CacheOptions = {}) {
    this.persistence = options.persistence
    this.usesPersistentCache = this.persistence !== undefined
    this.cacheMetricsEnabled = options.cacheMetricsEnabled === true
    this.cacheMetricsTopKeysLimit = normalizePositiveInteger(
      options.cacheMetricsTopKeysLimit,
      DEFAULT_CACHE_METRICS_TOP_KEYS_LIMIT
    )
    this.cacheMetricsTopKeysTrackingLimit = Math.max(
      this.cacheMetricsTopKeysLimit,
      normalizePositiveInteger(
        options.cacheMetricsTopKeysTrackingLimit,
        DEFAULT_CACHE_METRICS_TOP_KEYS_TRACKING_LIMIT
      )
    )
    this.cacheMetricsTopKeysLogInterval = normalizePositiveInteger(
      options.cacheMetricsTopKeysLogInterval,
      DEFAULT_CACHE_METRICS_TOP_KEYS_LOG_INTERVAL
    )
    this.workspaceChangeTokenTtlMs = normalizePositiveInteger(
      options.workspaceChangeTokenTtlMs,
      DEFAULT_WORKSPACE_CHANGE_TOKEN_TTL_MS
    )
    this.workspaceChangedPathsTtlMs = normalizePositiveInteger(
      options.workspaceChangedPathsTtlMs,
      DEFAULT_WORKSPACE_CHANGED_PATHS_TTL_MS
    )
    this.invalidatedPathTtlMs = normalizePositiveInteger(
      options.invalidatedPathTtlMs,
      DEFAULT_INVALIDATED_PATH_TTL_MS
    )
    this.computeSlotTtlMs = normalizePositiveInteger(
      options.computeSlotTtlMs,
      DEFAULT_CACHE_STORE_COMPUTE_SLOT_TTL_MS
    )
    this.computeSlotPollMs = normalizePositiveInteger(
      options.computeSlotPollMs,
      DEFAULT_CACHE_STORE_COMPUTE_SLOT_POLL_MS
    )
    this.persistedVerificationAttempts = normalizeNonNegativeInteger(
      options.persistedVerificationAttempts,
      DEFAULT_CACHE_STORE_PERSISTED_VERIFICATION_ATTEMPTS
    )
    this.debugCachePersistence = options.debugCachePersistence === true
    this.debugSessionRoot = options.debugSessionRoot === true
  }

  createStore(options: CacheStoreFactoryOptions): CacheStore {
    return new CacheStore({
      snapshot: options.snapshot,
      persistence: this.persistence,
      inflight: options.inflight,
      computeSlotTtlMs: options.computeSlotTtlMs ?? this.computeSlotTtlMs,
      computeSlotPollMs: options.computeSlotPollMs ?? this.computeSlotPollMs,
      persistedVerificationAttempts:
        options.persistedVerificationAttempts ??
        this.persistedVerificationAttempts,
      debugPersistenceFailure: this.debugCachePersistence,
    })
  }
}

const failedPersistenceEntries = new WeakMap<
  CacheStorePersistence,
  Set<string>
>()
const snapshotDependencyPathWatchers = new WeakMap<
  Snapshot,
  Set<{
    invalidateDependencyPath(dependencyPathKey: string): void
  }>
>()
const snapshotInvalidationUnsubscribeBySnapshot = new WeakMap<
  Snapshot,
  () => void
>()
const CONST_DEPENDENCY_PREFIX = 'const:'

interface CacheStorePersistenceComputeSlot {
  acquireComputeSlot(
    nodeKey: string,
    owner: string,
    ttlMs: number
  ): Promise<boolean>
  refreshComputeSlot?(
    nodeKey: string,
    owner: string,
    ttlMs: number
  ): Promise<void>
  releaseComputeSlot(nodeKey: string, owner: string): Promise<void>
  getComputeSlotOwner(nodeKey: string): Promise<string | undefined>
  /**
   * Optional per-instance compute-slot lease duration override used by custom
   * persistence implementations.
   */
  computeSlotTtlMs?: number
}

interface PersistedCacheEntry<Value = unknown> extends CacheEntry<Value> {
  revision?: number
}

type PersistedRevisionPrecondition = number | 'missing' | undefined

function getComputeSlotTtlMs(
  persistence: CacheStorePersistenceComputeSlot | undefined,
  fallbackMs: number
): number {
  const configured = persistence?.computeSlotTtlMs
  if (typeof configured !== 'number' || !Number.isFinite(configured)) {
    return fallbackMs
  }

  return Math.max(1, Math.floor(configured))
}

function getComputeSlotHeartbeatMs(slotTtlMs: number): number {
  return Math.min(1000, Math.max(1, Math.floor(slotTtlMs / 2)))
}

function isCacheStorePersistenceComputeSlot(
  persistence: CacheStorePersistence | undefined
): persistence is CacheStorePersistence & CacheStorePersistenceComputeSlot {
  if (!persistence) {
    return false
  }

  const candidate = persistence as Partial<CacheStorePersistenceComputeSlot>
  return (
    typeof candidate.acquireComputeSlot === 'function' &&
    typeof candidate.releaseComputeSlot === 'function' &&
    typeof candidate.getComputeSlotOwner === 'function'
  )
}

function getFailedPersistenceEntries(
  persistence: CacheStorePersistence
): Set<string> {
  let failedEntries = failedPersistenceEntries.get(persistence)
  if (!failedEntries) {
    failedEntries = new Set()
    failedPersistenceEntries.set(persistence, failedEntries)
  }
  return failedEntries
}

function markPersistedEntryInvalid(
  persistence: CacheStorePersistence | undefined,
  nodeKey: string
): void {
  if (!persistence) {
    return
  }
  getFailedPersistenceEntries(persistence).add(nodeKey)
}

function isPersistedEntryInvalid(
  persistence: CacheStorePersistence | undefined,
  nodeKey: string
): boolean {
  if (!persistence) {
    return false
  }

  const failedEntries = failedPersistenceEntries.get(persistence)
  return failedEntries?.has(nodeKey) ?? false
}

function clearPersistedEntryInvalidation(
  persistence: CacheStorePersistence | undefined,
  nodeKey: string
): void {
  if (!persistence) {
    return
  }

  const failedEntries = failedPersistenceEntries.get(persistence)
  failedEntries?.delete(nodeKey)
}

function toConstDependencyKey(name: string): string {
  return `${CONST_DEPENDENCY_PREFIX}${encodeURIComponent(name)}`
}

function parseConstDependencyKey(
  depKey: string
): { name: string; legacyVersion?: string } | undefined {
  if (!depKey.startsWith(CONST_DEPENDENCY_PREFIX)) {
    return undefined
  }

  const payload = depKey.slice(CONST_DEPENDENCY_PREFIX.length)
  if (!payload) {
    return undefined
  }

  const separatorIndex = payload.lastIndexOf(':')
  if (separatorIndex > 0) {
    const legacyName = payload.slice(0, separatorIndex)
    const legacyVersion = payload.slice(separatorIndex + 1)
    return {
      name: legacyName,
      legacyVersion,
    }
  }

  try {
    return {
      name: decodeURIComponent(payload),
    }
  } catch {
    return {
      name: payload,
    }
  }
}

export class CacheStore {
  readonly #snapshot: Snapshot
  readonly #persistence?: CacheStorePersistence
  readonly #entries = new Map<string, CacheEntry>()
  readonly #inflight: Map<string, Promise<unknown>>
  readonly #dependencyGraph = new ReactiveDependencyGraph()
  readonly #constDepVersionByName = new Map<string, string>()
  readonly #activeComputeScope = new AsyncLocalStorage<{
    nodeKey: string
    deps: Map<string, string>
  }>()
  readonly #persistenceOperationByKey = new Map<string, Promise<void>>()
  readonly #persistenceIntentVersionByKey = new Map<string, number>()
  readonly #persistedRevisionPreconditionByKey = new Map<
    string,
    number | 'missing'
  >()
  readonly #computeSlotTtlMs: number
  readonly #computeSlotPollMs: number
  readonly #persistedVerificationAttempts: number
  readonly #debugPersistenceFailure: boolean
  #warnedAboutPersistenceFailure = false
  #warnedAboutUnserializableValue = false

  constructor(options: CacheStoreOptions) {
    this.#snapshot = options.snapshot
    this.#persistence = options.persistence
    this.#inflight = options.inflight ?? new Map<string, Promise<unknown>>()
    this.#computeSlotTtlMs = normalizePositiveInteger(
      options.computeSlotTtlMs,
      DEFAULT_CACHE_STORE_COMPUTE_SLOT_TTL_MS
    )
    this.#computeSlotPollMs = normalizePositiveInteger(
      options.computeSlotPollMs,
      DEFAULT_CACHE_STORE_COMPUTE_SLOT_POLL_MS
    )
    this.#persistedVerificationAttempts = normalizeNonNegativeInteger(
      options.persistedVerificationAttempts,
      DEFAULT_CACHE_STORE_PERSISTED_VERIFICATION_ATTEMPTS
    )
    this.#debugPersistenceFailure = options.debugPersistenceFailure === true

    const stores =
      snapshotDependencyPathWatchers.get(this.#snapshot) ?? new Set()
    stores.add(this)
    snapshotDependencyPathWatchers.set(this.#snapshot, stores)

    if (snapshotInvalidationUnsubscribeBySnapshot.has(this.#snapshot)) {
      return
    }

    const snapshot = this.#snapshot
    const unsubscribe = snapshot.onInvalidate((path: string) => {
      const linkedStores = snapshotDependencyPathWatchers.get(snapshot)
      if (!linkedStores) {
        return
      }

      for (const store of linkedStores) {
        store.invalidateDependencyPath(path)
      }
    })
    snapshotInvalidationUnsubscribeBySnapshot.set(this.#snapshot, unsubscribe)
  }

  async getOrCompute<Value>(
    nodeKey: string,
    options: CacheStoreGetOrComputeOptions,
    compute: (context: CacheStoreComputeContext) => Promise<Value> | Value
  ): Promise<Value> {
    this.#registerConstDependencies(options.constDeps)

    const inFlight = this.#inflight.get(nodeKey)
    if (inFlight) {
      this.#logCacheOperation('hit', nodeKey, {
        source: 'inflight',
      })
      const value = await (inFlight as Promise<Value>)
      await this.#recordAutomaticNodeDependency(nodeKey)
      return value
    }

    const operation = this.#getOrCompute(nodeKey, options, compute)
    this.#inflight.set(nodeKey, operation as Promise<unknown>)

    try {
      const value = await operation
      await this.#recordAutomaticNodeDependency(nodeKey)
      return value
    } finally {
      if (this.#inflight.get(nodeKey) === operation) {
        this.#inflight.delete(nodeKey)
      }
    }
  }

  async getFingerprint(nodeKey: string): Promise<string | undefined> {
    const entry = await this.#getFreshEntry(nodeKey)
    return entry?.fingerprint
  }

  async get<Value>(nodeKey: string): Promise<Value | undefined> {
    const entry = await this.#getFreshEntry(nodeKey)
    await this.#recordAutomaticNodeDependency(nodeKey, entry?.fingerprint)
    return entry?.value as Value | undefined
  }

  async getWithFreshness<Value>(
    nodeKey: string
  ): Promise<{ value: Value | undefined; fresh: boolean }> {
    const memoryEntry = this.#entries.get(nodeKey)
    if (memoryEntry) {
      const fresh = await this.#isEntryFresh(nodeKey, memoryEntry, new Set())
      await this.#recordAutomaticNodeDependency(
        nodeKey,
        memoryEntry.fingerprint
      )
      return { value: memoryEntry.value as Value, fresh }
    }

    const persistedEntry = await this.#loadPersistedEntry(nodeKey)
    if (!persistedEntry) {
      await this.#recordAutomaticNodeDependency(nodeKey, undefined)
      return { value: undefined, fresh: false }
    }

    const fresh = await this.#isEntryFresh(nodeKey, persistedEntry, new Set())
    await this.#recordAutomaticNodeDependency(
      nodeKey,
      persistedEntry.fingerprint
    )
    return { value: persistedEntry.value as Value, fresh }
  }

  #registerConstDependencies(
    constDeps: CacheStoreConstDependency[] | undefined
  ): void {
    if (!constDeps || constDeps.length === 0) {
      return
    }

    for (const constDep of constDeps) {
      this.#constDepVersionByName.set(constDep.name, constDep.version)
    }
  }

  #registerConstDependencyRecords(
    dependencies: CacheDependency[] | undefined
  ): void {
    if (!dependencies || dependencies.length === 0) {
      return
    }

    for (const dependency of dependencies) {
      const parsed = parseConstDependencyKey(dependency.depKey)
      if (!parsed) {
        continue
      }
      this.#constDepVersionByName.set(parsed.name, dependency.depVersion)
    }
  }

  async #capturePersistedRevisionPrecondition(
    nodeKey: string,
    options: {
      allowLoad?: boolean
    } = {}
  ): Promise<PersistedRevisionPrecondition> {
    const cachedPrecondition =
      this.#persistedRevisionPreconditionByKey.get(nodeKey)
    if (cachedPrecondition !== undefined) {
      return cachedPrecondition
    }

    if (options.allowLoad === false) {
      return undefined
    }

    if (!this.#persistence) {
      return undefined
    }

    try {
      const persistedEntry = (await this.#persistence.load(nodeKey, {
        skipFingerprintCheck: true,
        skipLastAccessedUpdate: true,
      })) as PersistedCacheEntry | undefined
      if (!persistedEntry) {
        this.#persistedRevisionPreconditionByKey.set(nodeKey, 'missing')
        return 'missing'
      }

      const revision =
        typeof persistedEntry.revision === 'number' &&
        Number.isFinite(persistedEntry.revision)
          ? persistedEntry.revision
          : undefined
      if (typeof revision === 'number') {
        this.#persistedRevisionPreconditionByKey.set(nodeKey, revision)
      }
      return revision
    } catch {
      return undefined
    }
  }

  async put<Value>(
    nodeKey: string,
    value: Value,
    options: CacheStorePutOptions = {}
  ): Promise<void> {
    this.#registerConstDependencyRecords(options.deps)
    const expectedPersistedRevision =
      options.persist === true
        ? await this.#capturePersistedRevisionPrecondition(nodeKey)
        : undefined
    const dependencyEntries = (options.deps ?? [])
      .map((dependency) => ({
        depKey: dependency.depKey,
        depVersion: dependency.depVersion,
      }))
      .sort((first, second) => first.depKey.localeCompare(second.depKey))
    const entry: CacheEntry<Value> = {
      value,
      deps: dependencyEntries,
      fingerprint: createFingerprint(dependencyEntries),
      persist: options.persist ?? false,
      updatedAt: Date.now(),
    }

    this.#logCacheOperation('set', nodeKey, {
      source: 'manual-put',
      persist: entry.persist,
      dependencies: dependencyEntries.length,
    })

    this.#entries.set(nodeKey, entry)
    this.#registerEntryInGraph(nodeKey, entry)
    await this.#savePersistedEntry(nodeKey, entry, {
      expectedRevision: expectedPersistedRevision,
    })
  }

  async delete(nodeKey: string): Promise<void> {
    this.#logCacheOperation('clear', nodeKey, {
      source: 'explicit',
    })

    this.#dependencyGraph.markNodeDirty(nodeKey)
    this.#dependencyGraph.unregisterNode(nodeKey)
    this.#entries.delete(nodeKey)
    if (!this.#persistence) {
      return
    }

    markPersistedEntryInvalid(this.#persistence, nodeKey)
    await this.#withPersistenceIntent(nodeKey, () =>
      this.#clearPersistedCacheEntry(nodeKey)
    )
  }

  async deleteByDependencyPath(
    dependencyPathKey: string
  ): Promise<CacheDependencyEvictionResult> {
    const persistence = this.#persistence
    const defaultResult: CacheDependencyEvictionResult = {
      deletedNodeKeys: [],
      usedDependencyIndex: false,
      hasMissingDependencyMetadata: false,
    }

    if (!persistence?.deleteByDependencyPath) {
      return defaultResult
    }

    const dependencyPathCandidates =
      this.#getDependencyPathCandidates(dependencyPathKey)
    const deletedNodeKeys = new Set<string>()
    let usedDependencyIndex = false
    let hasMissingDependencyMetadata = false

    if (dependencyPathCandidates.size === 0) {
      return defaultResult
    }

    for (const normalizedPath of dependencyPathCandidates) {
      let result: CacheDependencyEvictionResult
      try {
        result = await persistence.deleteByDependencyPath(normalizedPath)
      } catch (error) {
        this.#warnPersistenceFailure(
          `deleteByDependencyPath(${normalizedPath})`,
          error
        )
        continue
      }

      for (const nodeKey of result.deletedNodeKeys) {
        deletedNodeKeys.add(nodeKey)
      }
      usedDependencyIndex ||= result.usedDependencyIndex
      hasMissingDependencyMetadata ||= result.hasMissingDependencyMetadata
    }

    if (deletedNodeKeys.size === 0) {
      return {
        ...defaultResult,
        usedDependencyIndex,
        hasMissingDependencyMetadata,
      }
    }

    for (const nodeKey of deletedNodeKeys) {
      this.#dependencyGraph.markNodeDirty(nodeKey)
      this.#dependencyGraph.unregisterNode(nodeKey)
      this.#entries.delete(nodeKey)
      this.#inflight.delete(nodeKey)
      this.#persistenceOperationByKey.delete(nodeKey)
      this.#persistenceIntentVersionByKey.delete(nodeKey)
      clearPersistedEntryInvalidation(this.#persistence, nodeKey)
    }

    return {
      deletedNodeKeys: Array.from(deletedNodeKeys),
      usedDependencyIndex,
      hasMissingDependencyMetadata,
    }
  }

  #getDependencyPathCandidates(dependencyPathKey: string): Set<string> {
    const candidates = new Set<string>()

    const addPathCandidate = (path: string) => {
      const normalizedPath = normalizeDepPath(path)
      candidates.add(normalizedPath)
    }

    addPathCandidate(dependencyPathKey)

    let relativePath = dependencyPathKey
    try {
      relativePath =
        this.#snapshot.getRelativePathToWorkspace(dependencyPathKey)
    } catch {
      return candidates
    }

    addPathCandidate(relativePath)

    return candidates
  }

  invalidateDependencyPath(dependencyPathKey: string): void {
    const dependencyPathCandidates =
      this.#getDependencyPathCandidates(dependencyPathKey)
    const affectedNodeKeys = new Set<string>()

    for (const normalizedPath of dependencyPathCandidates) {
      for (const nodeKey of this.#dependencyGraph.touchPathDependencies(
        normalizedPath
      )) {
        affectedNodeKeys.add(nodeKey)
      }
    }

    for (const nodeKey of affectedNodeKeys) {
      this.#dependencyGraph.markNodeDirty(nodeKey)
      this.#dependencyGraph.unregisterNode(nodeKey)
      this.#entries.delete(nodeKey)
      this.#inflight.delete(nodeKey)
      this.#persistenceOperationByKey.delete(nodeKey)
      this.#persistenceIntentVersionByKey.delete(nodeKey)
      markPersistedEntryInvalid(this.#persistence, nodeKey)
    }
  }

  async listNodeKeysByPrefix(prefix: string): Promise<string[]> {
    const normalizedPrefix = normalizeCacheSlashes(prefix)
    const memoryKeys = Array.from(this.#entries.keys()).filter((nodeKey) =>
      nodeKey.startsWith(normalizedPrefix)
    )

    const persistence = this.#persistence
    if (!persistence?.listNodeKeysByPrefix) {
      return Array.from(new Set(memoryKeys)).sort()
    }

    try {
      const persistedKeys =
        await persistence.listNodeKeysByPrefix(normalizedPrefix)
      return Array.from(new Set([...memoryKeys, ...persistedKeys])).sort()
    } catch (error) {
      this.#warnPersistenceFailure(
        `listNodeKeysByPrefix(${normalizedPrefix})`,
        error
      )
      return Array.from(new Set(memoryKeys)).sort()
    }
  }

  async withComputeSlot(
    nodeKey: string,
    options: {
      leader: () => Promise<void>
      follower?: () => Promise<void>
      ttlMs?: number
    }
  ): Promise<'leader' | 'follower'> {
    const persistence = this.#getComputeSlotPersistence()
    if (!persistence) {
      await options.leader()
      return 'leader'
    }

    const slotTtlMs = getComputeSlotTtlMs(
      persistence,
      options.ttlMs ?? this.#computeSlotTtlMs
    )
    const owner = this.#createComputeSlotOwner()
    const acquired = await this.#acquireComputeSlot(nodeKey, owner, slotTtlMs)

    if (!acquired) {
      await this.#waitForComputeSlotRelease(nodeKey)
      if (options.follower) {
        await options.follower()
      }
      return 'follower'
    }

    const stopHeartbeat = this.#startComputeSlotHeartbeat(
      nodeKey,
      owner,
      slotTtlMs
    )

    try {
      await options.leader()
    } finally {
      stopHeartbeat()
      await this.#releaseComputeSlot(nodeKey, owner)
    }

    return 'leader'
  }

  async #withPersistenceIntent(
    nodeKey: string,
    task: () => Promise<void>
  ): Promise<void> {
    const previous =
      this.#persistenceOperationByKey.get(nodeKey) ?? Promise.resolve()
    const currentVersion =
      (this.#persistenceIntentVersionByKey.get(nodeKey) ?? 0) + 1
    this.#persistenceIntentVersionByKey.set(nodeKey, currentVersion)

    const operation = previous
      .catch(() => {})
      .then(() => {
        if (
          this.#persistenceIntentVersionByKey.get(nodeKey) !== currentVersion
        ) {
          return
        }

        return task()
      })

    this.#persistenceOperationByKey.set(nodeKey, operation)

    try {
      await operation
    } finally {
      if (this.#persistenceOperationByKey.get(nodeKey) === operation) {
        this.#persistenceOperationByKey.delete(nodeKey)
        this.#persistenceIntentVersionByKey.delete(nodeKey)
      }
    }
  }

  async #clearPersistedCacheEntry(nodeKey: string): Promise<void> {
    if (!this.#persistence) {
      return
    }

    try {
      await this.#persistence.delete(nodeKey)
    } catch (error) {
      this.#warnPersistenceFailure(`cleanup(${nodeKey})`, error)
      markPersistedEntryInvalid(this.#persistence, nodeKey)
      return
    }

    this.#persistedRevisionPreconditionByKey.set(nodeKey, 'missing')
    clearPersistedEntryInvalidation(this.#persistence, nodeKey)
  }

  #cleanupPersistedEntry(nodeKey: string): Promise<void> {
    markPersistedEntryInvalid(this.#persistence, nodeKey)
    if (!this.#persistence) {
      return Promise.resolve()
    }

    return this.#clearPersistedCacheEntry(nodeKey)
  }

  #getComputeSlotPersistence(): CacheStorePersistenceComputeSlot | undefined {
    const persistence = this.#persistence
    if (!isCacheStorePersistenceComputeSlot(persistence)) {
      return undefined
    }

    return persistence
  }

  async #acquireComputeSlot(
    nodeKey: string,
    owner: string,
    slotTtlMs: number
  ): Promise<boolean> {
    const persistence = this.#getComputeSlotPersistence()
    if (!persistence) {
      return true
    }

    try {
      return await persistence.acquireComputeSlot(nodeKey, owner, slotTtlMs)
    } catch (error) {
      if (isComputeSlotTransientError(error)) {
        return false
      }

      throw error
    }
  }

  #startComputeSlotHeartbeat(
    nodeKey: string,
    owner: string,
    slotTtlMs: number
  ): () => void {
    const persistence = this.#getComputeSlotPersistence()
    const heartbeatMs = getComputeSlotHeartbeatMs(slotTtlMs)
    if (!persistence?.refreshComputeSlot || heartbeatMs <= 0) {
      return () => {}
    }

    const heartbeat = setInterval(() => {
      void this.#refreshComputeSlot(nodeKey, owner, slotTtlMs)
    }, heartbeatMs)

    return () => {
      clearInterval(heartbeat)
    }
  }

  async #refreshComputeSlot(
    nodeKey: string,
    owner: string,
    slotTtlMs: number
  ): Promise<void> {
    const persistence = this.#getComputeSlotPersistence()
    if (!persistence?.refreshComputeSlot) {
      return
    }

    try {
      await persistence.refreshComputeSlot(nodeKey, owner, slotTtlMs)
    } catch {
      // Ignore heartbeat refresh failures.
      // The slot may expire naturally and should be discovered by waiters.
    }
  }

  async #releaseComputeSlot(nodeKey: string, owner: string): Promise<void> {
    const persistence = this.#getComputeSlotPersistence()
    if (!persistence) {
      return
    }

    try {
      await persistence.releaseComputeSlot(nodeKey, owner)
    } catch {
      return
    }
  }

  async #waitForInFlightValue<Value>(
    nodeKey: string
  ): Promise<Value | typeof NO_COMPUTE_SLOT_SHARED_VALUE> {
    const persistence = this.#getComputeSlotPersistence()
    if (!persistence) {
      return NO_COMPUTE_SLOT_SHARED_VALUE
    }

    while (true) {
      const freshEntry = await this.#getFreshEntry(nodeKey)
      if (freshEntry) {
        return freshEntry.value as Value
      }

      let inFlightOwner: string | undefined
      try {
        inFlightOwner = await persistence.getComputeSlotOwner(nodeKey)
      } catch {
        return NO_COMPUTE_SLOT_SHARED_VALUE
      }

      if (!inFlightOwner) {
        return NO_COMPUTE_SLOT_SHARED_VALUE
      }

      const sleep = Math.max(0, this.#computeSlotPollMs) || 0
      if (sleep > 0) {
        await delay(sleep)
      }
      continue
    }
  }

  async #waitForComputeSlotRelease(nodeKey: string): Promise<void> {
    const persistence = this.#getComputeSlotPersistence()
    if (!persistence) {
      return
    }

    while (true) {
      let inFlightOwner: string | undefined
      try {
        inFlightOwner = await persistence.getComputeSlotOwner(nodeKey)
      } catch {
        return
      }

      if (!inFlightOwner) {
        return
      }

      const sleep = Math.max(0, this.#computeSlotPollMs) || 0
      if (sleep > 0) {
        await delay(sleep)
      }
    }
  }

  #createComputeSlotOwner(): string {
    const randomSuffix = Math.random().toString(36).slice(2)
    return `${process.pid}:${Date.now()}:${randomSuffix}`
  }

  hasSync(nodeKey: string): boolean {
    return this.#entries.has(nodeKey)
  }

  getSync<Value>(nodeKey: string): Value | undefined {
    const entry = this.#entries.get(nodeKey)
    if (!entry) {
      this.#logCacheOperation('miss', nodeKey, {
        source: 'memory-sync',
      })
      return undefined
    }

    this.#logCacheOperation('hit', nodeKey, {
      source: 'memory-sync',
      persist: entry.persist,
    })
    return entry.value as Value
  }

  setSync<Value>(nodeKey: string, value: Value): void {
    const entry: CacheEntry<Value> = {
      value,
      deps: [],
      fingerprint: createFingerprint([]),
      persist: false,
      updatedAt: Date.now(),
    }

    this.#logCacheOperation('set', nodeKey, {
      source: 'manual-put-sync',
      persist: false,
      dependencies: 0,
    })

    this.#entries.set(nodeKey, entry)
    this.#registerEntryInGraph(nodeKey, entry)
  }

  getOrComputeSync<Value>(nodeKey: string, compute: () => Value): Value {
    if (this.#entries.has(nodeKey)) {
      return this.getSync<Value>(nodeKey)!
    }

    const value = compute()
    this.setSync(nodeKey, value)
    return value
  }

  deleteSync(nodeKey: string): void {
    this.#logCacheOperation('clear', nodeKey, {
      source: 'explicit-sync',
    })

    this.#dependencyGraph.markNodeDirty(nodeKey)
    this.#dependencyGraph.unregisterNode(nodeKey)
    this.#entries.delete(nodeKey)
    this.#inflight.delete(nodeKey)
    this.#persistenceOperationByKey.delete(nodeKey)
    this.#persistenceIntentVersionByKey.delete(nodeKey)
    this.#persistedRevisionPreconditionByKey.delete(nodeKey)
  }

  clearMemory(): void {
    this.#logCacheOperation('clear', '__cache_memory__', {
      source: 'memory',
      size: this.#entries.size,
    })

    this.#entries.clear()
    this.#inflight.clear()
    this.#dependencyGraph.clear()
  }

  async #getOrCompute<Value>(
    nodeKey: string,
    options: CacheStoreGetOrComputeOptions,
    compute: (context: CacheStoreComputeContext) => Promise<Value> | Value
  ): Promise<Value> {
    const cachedEntry = await this.#getFreshEntry(nodeKey)
    if (cachedEntry) {
      return cachedEntry.value as Value
    }

    const expectedPersistedRevision =
      options.persist === true
        ? await this.#capturePersistedRevisionPrecondition(nodeKey, {
            allowLoad: false,
          })
        : undefined

    const deps = new Map<string, string>()
    const context: CacheStoreComputeContext = {
      snapshot: this.#snapshot,
      recordDep(depKey, depVersion) {
        deps.set(depKey, depVersion)
      },
      recordConstDep: (name, version) => {
        this.#constDepVersionByName.set(name, version)
        deps.set(toConstDependencyKey(name), version)
      },
      recordFileDep: async (path: string) => {
        const relativePath = this.#snapshot.getRelativePathToWorkspace(path)
        const normalizedPath = normalizeDepPath(relativePath)
        const depVersion = await this.#snapshot.contentId(normalizedPath)
        deps.set(`file:${normalizedPath}`, depVersion)
        return depVersion
      },
      recordDirectoryDep: async (path: string) => {
        const relativePath = this.#snapshot.getRelativePathToWorkspace(path)
        const normalizedPath = normalizeDepPath(relativePath)
        const depVersion = await this.#snapshot.contentId(normalizedPath)
        deps.set(`dir:${normalizedPath}`, depVersion)
        return depVersion
      },
      recordNodeDep: async (childNodeKey: string) => {
        const depVersion =
          await this.#resolveNodeDependencyVersion(childNodeKey)
        deps.set(`node:${childNodeKey}`, depVersion)
        return depVersion
      },
    }

    const shouldCoordinate =
      options.persist === true &&
      !!this.#persistence &&
      !isPersistedEntryInvalid(this.#persistence, nodeKey)
    const computeSlotTtlMs = getComputeSlotTtlMs(
      this.#getComputeSlotPersistence(),
      this.#computeSlotTtlMs
    )
    let computeSlotOwner: string | undefined
    let stopComputeSlotHeartbeat: (() => void) | undefined
    if (shouldCoordinate) {
      const candidateOwner = this.#createComputeSlotOwner()

      const acquired = await this.#acquireComputeSlot(
        nodeKey,
        candidateOwner,
        computeSlotTtlMs
      )
      if (!acquired) {
        const sharedValue = await this.#waitForInFlightValue<Value>(nodeKey)
        if (sharedValue !== NO_COMPUTE_SLOT_SHARED_VALUE) {
          return sharedValue
        }
      } else {
        computeSlotOwner = candidateOwner
        stopComputeSlotHeartbeat = this.#startComputeSlotHeartbeat(
          nodeKey,
          computeSlotOwner,
          computeSlotTtlMs
        )
      }
    }

    try {
      const value = await this.#activeComputeScope.run(
        { nodeKey, deps },
        async () => compute(context)
      )

      const dependencyEntries = Array.from(deps.entries())
        .map(([depKey, depVersion]) => ({ depKey, depVersion }))
        .sort((first, second) => first.depKey.localeCompare(second.depKey))
      const fingerprint = createFingerprint(dependencyEntries)

      const entry: CacheEntry<Value> = {
        value,
        deps: dependencyEntries,
        fingerprint,
        persist: options.persist ?? false,
        updatedAt: Date.now(),
      }

      this.#logCacheOperation('set', nodeKey, {
        source: 'compute',
        persist: entry.persist,
        dependencies: dependencyEntries.length,
      })

      this.#entries.set(nodeKey, entry)
      this.#registerEntryInGraph(nodeKey, entry)
      await this.#savePersistedEntry(nodeKey, entry, {
        expectedRevision: expectedPersistedRevision,
      })

      return value
    } finally {
      if (computeSlotOwner) {
        stopComputeSlotHeartbeat?.()
        await this.#releaseComputeSlot(nodeKey, computeSlotOwner)
      }
    }
  }

  async #getEntry(nodeKey: string): Promise<CacheEntry | undefined> {
    const memoryEntry = this.#entries.get(nodeKey)
    if (memoryEntry) {
      this.#logCacheOperation('hit', nodeKey, {
        source: 'memory',
        persist: memoryEntry.persist,
      })
      return memoryEntry
    }

    return this.#loadPersistedEntry(nodeKey)
  }

  async #loadPersistedEntry(nodeKey: string): Promise<CacheEntry | undefined> {
    if (!this.#persistence) {
      return undefined
    }

    if (isPersistedEntryInvalid(this.#persistence, nodeKey)) {
      this.#logCacheOperation('clear', nodeKey, {
        source: 'persisted-entry',
        reason: 'in-process-invalid',
      })
      return undefined
    }

    let persistedEntry: PersistedCacheEntry | undefined
    try {
      persistedEntry = await this.#persistence.load(nodeKey)
    } catch (error) {
      this.#warnPersistenceFailure(`load(${nodeKey})`, error)
      return undefined
    }

    if (!persistedEntry) {
      this.#persistedRevisionPreconditionByKey.set(nodeKey, 'missing')
    } else if (
      typeof persistedEntry.revision === 'number' &&
      Number.isFinite(persistedEntry.revision)
    ) {
      this.#persistedRevisionPreconditionByKey.set(
        nodeKey,
        persistedEntry.revision
      )
    } else {
      this.#persistedRevisionPreconditionByKey.delete(nodeKey)
    }

    if (persistedEntry && !persistedEntry.persist) {
      await this.#withPersistenceIntent(nodeKey, () =>
        this.#clearPersistedCacheEntry(nodeKey)
      )
      this.#logCacheOperation('clear', nodeKey, {
        source: 'persisted-entry',
        reason: 'not-persist-flag',
      })
      return undefined
    }

    if (persistedEntry) {
      this.#entries.set(nodeKey, persistedEntry)
      this.#registerEntryInGraph(nodeKey, persistedEntry)
    }

    return persistedEntry
  }

  async #getFreshEntry(nodeKey: string): Promise<CacheEntry | undefined> {
    const memoryEntry = this.#entries.get(nodeKey)
    if (memoryEntry) {
      if (this.#dependencyGraph.isNodeDirty(nodeKey)) {
        this.#entries.delete(nodeKey)
        this.#dependencyGraph.unregisterNode(nodeKey)
        this.#logCacheOperation('clear', nodeKey, {
          source: 'memory',
          reason: 'graph-dirty',
        })
      } else {
        const memoryIsFresh = await this.#isEntryFresh(
          nodeKey,
          memoryEntry,
          new Set()
        )

        if (memoryIsFresh) {
          this.#logCacheOperation('hit', nodeKey, {
            source: 'memory',
            persist: memoryEntry.persist,
          })
          return memoryEntry
        }

        this.#entries.delete(nodeKey)
        this.#dependencyGraph.unregisterNode(nodeKey)
        this.#logCacheOperation('clear', nodeKey, {
          source: 'memory',
          reason: 'stale',
        })
      }
    }

    if (!this.#persistence) {
      this.#logCacheOperation('miss', nodeKey, {
        source: 'memory',
      })
      return undefined
    }

    const persistedEntry = await this.#loadPersistedEntry(nodeKey)
    if (!persistedEntry) {
      this.#logCacheOperation('miss', nodeKey, {
        source: 'persisted',
      })
      return undefined
    }

    if (this.#dependencyGraph.isNodeDirty(nodeKey)) {
      await this.delete(nodeKey)
      this.#logCacheOperation('clear', nodeKey, {
        source: 'persisted',
        reason: 'graph-dirty',
      })
      return undefined
    }

    const persistedIsFresh = await this.#isEntryFresh(
      nodeKey,
      persistedEntry,
      new Set()
    )

    if (persistedIsFresh) {
      this.#logCacheOperation('hit', nodeKey, {
        source: 'persisted',
        persist: persistedEntry.persist,
      })
      return persistedEntry
    }

    await this.delete(nodeKey)
    this.#logCacheOperation('clear', nodeKey, {
      source: 'persisted',
      reason: 'stale',
    })
    return undefined
  }

  #logCacheOperation(
    operation: 'hit' | 'miss' | 'set' | 'clear',
    nodeKey: string,
    data?: Record<string, unknown>
  ): void {
    if (!getDebugLogger().isEnabled('debug')) {
      return
    }

    getDebugLogger().logCacheOperation(operation, nodeKey, data)
  }

  async #resolveNodeDependencyVersion(nodeKey: string): Promise<string> {
    const entry = await this.#getFreshEntry(nodeKey)
    return entry?.fingerprint ?? 'missing'
  }

  async #recordAutomaticNodeDependency(
    childNodeKey: string,
    fingerprint?: string
  ): Promise<void> {
    const computeScope = this.#activeComputeScope.getStore()
    if (!computeScope || computeScope.nodeKey === childNodeKey) {
      return
    }

    const depVersion =
      fingerprint ?? (await this.#resolveNodeDependencyVersion(childNodeKey))
    computeScope.deps.set(`node:${childNodeKey}`, depVersion)
  }

  #registerEntryInGraph(nodeKey: string, entry: CacheEntry): void {
    for (const dependency of entry.deps) {
      if (dependency.depKey.startsWith('node:')) {
        continue
      }

      this.#dependencyGraph.setDependencyVersion(
        dependency.depKey,
        dependency.depVersion
      )
    }

    this.#dependencyGraph.registerNode(
      nodeKey,
      entry.deps.map((dependency) => dependency.depKey)
    )
    this.#dependencyGraph.markNodeVersion(nodeKey, entry.fingerprint)
  }

  async #isEntryFresh(
    nodeKey: string,
    entry: CacheEntry,
    visitedNodeKeys: Set<string>
  ): Promise<boolean> {
    if (this.#dependencyGraph.isNodeDirty(nodeKey)) {
      return false
    }

    if (visitedNodeKeys.has(nodeKey)) {
      return true
    }

    visitedNodeKeys.add(nodeKey)

    for (const dependency of entry.deps) {
      const currentVersion = await this.#resolveDepVersion(
        dependency.depKey,
        visitedNodeKeys,
        dependency.depVersion
      )

      if (currentVersion !== dependency.depVersion) {
        this.#dependencyGraph.markNodeDirty(nodeKey)
        this.#dependencyGraph.touchDependency(dependency.depKey)
        if (currentVersion !== undefined) {
          this.#dependencyGraph.setDependencyVersion(
            dependency.depKey,
            currentVersion
          )
        }
        return false
      }

      if (
        currentVersion !== undefined &&
        !dependency.depKey.startsWith('node:')
      ) {
        this.#dependencyGraph.setDependencyVersion(
          dependency.depKey,
          currentVersion
        )
      }
    }

    // The node may subscribe to child-node version signals while we lazily load
    // dependencies during this freshness pass. As long as every dependency
    // version matches, this entry is fresh.
    return true
  }

  async #resolveDepVersion(
    depKey: string,
    visitedNodeKeys: Set<string>,
    fallbackVersion?: string
  ): Promise<string | undefined> {
    if (depKey.startsWith('file:')) {
      const filePath = depKey.slice('file:'.length)
      if (!filePath) {
        return undefined
      }

      return this.#snapshot.contentId(filePath)
    }

    if (depKey.startsWith('dir:')) {
      const directoryPath = depKey.slice('dir:'.length)
      if (!directoryPath) {
        return undefined
      }

      return this.#snapshot.contentId(directoryPath)
    }

    if (depKey.startsWith('node:')) {
      const nodeKey = depKey.slice('node:'.length)
      const childEntry = await this.#getEntry(nodeKey)

      if (!childEntry) {
        this.#dependencyGraph.markNodeDirty(nodeKey)
        return 'missing'
      }

      const childIsFresh = await this.#isEntryFresh(
        nodeKey,
        childEntry,
        visitedNodeKeys
      )

      if (!childIsFresh) {
        this.#dependencyGraph.markNodeDirty(nodeKey)
        return 'stale'
      }

      return childEntry.fingerprint
    }

    if (depKey.startsWith('const:')) {
      const parsedConstDependency = parseConstDependencyKey(depKey)
      if (!parsedConstDependency) {
        return undefined
      }

      const currentVersion = this.#constDepVersionByName.get(
        parsedConstDependency.name
      )
      if (currentVersion !== undefined) {
        return currentVersion
      }

      return parsedConstDependency.legacyVersion ?? fallbackVersion
    }

    return undefined
  }

  async #savePersistedEntry(
    nodeKey: string,
    entry: CacheEntry,
    options: {
      expectedRevision?: PersistedRevisionPrecondition
    } = {}
  ): Promise<void> {
    clearPersistedEntryInvalidation(this.#persistence, nodeKey)
    if (!this.#persistence) {
      return
    }

    if (!entry.persist) {
      await this.#withPersistenceIntent(nodeKey, () =>
        this.#clearPersistedCacheEntry(nodeKey)
      )
      return
    }

    const expectedPersistedRevision = options.expectedRevision

    await this.#withPersistenceIntent(nodeKey, async () => {
      const shouldDebugPersistenceFailure =
        this.#shouldDebugCachePersistenceFailure(nodeKey)

      const attempt = async (
        value: unknown
      ): Promise<'verified' | 'superseded'> => {
        const persistenceWithRevision = this
          .#persistence as CacheStorePersistence & {
          saveWithRevision?(nodeKey: string, entry: CacheEntry): Promise<number>
          saveWithRevisionGuarded?(
            nodeKey: string,
            entry: CacheEntry,
            options: {
              expectedRevision: number | 'missing'
            }
          ): Promise<{ applied: boolean; revision: number }>
        }
        const persisted = {
          ...entry,
          value,
          persist: true,
        }
        let persistedRevision: number | undefined
        if (
          (expectedPersistedRevision === 'missing' ||
            typeof expectedPersistedRevision === 'number') &&
          persistenceWithRevision.saveWithRevisionGuarded
        ) {
          const guardedResult =
            await persistenceWithRevision.saveWithRevisionGuarded(
              nodeKey,
              persisted,
              {
                expectedRevision: expectedPersistedRevision,
              }
            )
          persistedRevision = guardedResult.revision
          this.#persistedRevisionPreconditionByKey.set(
            nodeKey,
            guardedResult.revision > 0 ? guardedResult.revision : 'missing'
          )
          if (!guardedResult.applied) {
            if (shouldDebugPersistenceFailure) {
              this.#logPersistenceDebug(nodeKey, {
                phase: 'save-verify',
                details: `guarded-write-not-applied expectedRevision=${String(expectedPersistedRevision)} currentRevision=${String(guardedResult.revision)}`,
                entry,
                expectedRevision: expectedPersistedRevision,
                actualRevision: guardedResult.revision,
              })
            }
            return 'superseded'
          }
        } else if (persistenceWithRevision.saveWithRevision) {
          persistedRevision = await persistenceWithRevision.saveWithRevision(
            nodeKey,
            persisted
          )
          this.#persistedRevisionPreconditionByKey.set(
            nodeKey,
            persistedRevision
          )
        } else {
          await this.#persistence!.save(nodeKey, persisted)
          this.#persistedRevisionPreconditionByKey.delete(nodeKey)
        }

        const maxVerificationAttempts = this.#persistedVerificationAttempts
        if (maxVerificationAttempts === 0) {
          if (shouldDebugPersistenceFailure) {
            this.#logPersistenceDebug(nodeKey, {
              phase: 'save-verify',
              details: 'verification-skipped',
              entry,
              expectedRevision: expectedPersistedRevision,
            })
          }
          return 'verified'
        }

        for (
          let verifyAttempt = 0;
          verifyAttempt < maxVerificationAttempts;
          verifyAttempt += 1
        ) {
          const verified = (await this.#persistence!.load(nodeKey, {
            skipFingerprintCheck: true,
            skipLastAccessedUpdate: true,
          })) as PersistedCacheEntry | undefined

          if (!verified) {
            if (shouldDebugPersistenceFailure) {
              this.#logPersistenceDebug(nodeKey, {
                phase: 'save-verify',
                details: `verification-load-miss attempt=${verifyAttempt + 1} of ${maxVerificationAttempts} expectedFingerprint=${entry.fingerprint}`,
                entry,
                expectedRevision: expectedPersistedRevision,
              })
            }

            if (verifyAttempt + 1 < maxVerificationAttempts) {
              await delay(Math.pow(2, verifyAttempt) * 25)
              continue
            }

            if (shouldDebugPersistenceFailure) {
              this.#logPersistenceDebug(nodeKey, {
                phase: 'save-verify',
                details: 'superseded-by-load-miss',
                entry,
                expectedRevision: expectedPersistedRevision,
              })
            }

            this.#persistedRevisionPreconditionByKey.set(nodeKey, 'missing')
            return 'superseded'
          }

          if (!verified.persist) {
            throw new Error(
              'cache persistence verification failed: load returned non-persistent entry'
            )
          }

          const setVerifiedRevisionPrecondition = () => {
            if (
              typeof verified.revision === 'number' &&
              Number.isFinite(verified.revision)
            ) {
              this.#persistedRevisionPreconditionByKey.set(
                nodeKey,
                verified.revision
              )
            } else {
              this.#persistedRevisionPreconditionByKey.delete(nodeKey)
            }
          }

          const isRevisionSuperseding =
            typeof persistedRevision === 'number' &&
            typeof verified.revision === 'number' &&
            verified.revision > persistedRevision

          if (verified.fingerprint === entry.fingerprint) {
            if (isRevisionSuperseding) {
              if (shouldDebugPersistenceFailure) {
                this.#logPersistenceDebug(nodeKey, {
                  phase: 'save-verify',
                  details:
                    `superseded-by-revision-fingerprint-match expectedRevision=${persistedRevision} actualRevision=${verified.revision} expectedFingerprint=${entry.fingerprint}`,
                  entry,
                  verified,
                  expectedRevision: expectedPersistedRevision,
                  actualRevision: verified.revision,
                })
              }
              setVerifiedRevisionPrecondition()
              return 'superseded'
            }

            if (shouldDebugPersistenceFailure) {
              this.#logPersistenceDebug(nodeKey, {
                phase: 'save-verify',
                details: 'verification-match',
                entry,
                verified,
                expectedRevision: expectedPersistedRevision,
                actualRevision: verified.revision,
              })
            }
            setVerifiedRevisionPrecondition()
            return 'verified'
          }

          const hasWinnerTimestamp = verified.updatedAt >= entry.updatedAt
          const isSuperseded = isRevisionSuperseding || hasWinnerTimestamp
          const supersedeReason = isRevisionSuperseding
            ? 'superseded-by-revision'
            : hasWinnerTimestamp
              ? 'superseded-by-updated-at'
              : 'fingerprint-drift'

          if (shouldDebugPersistenceFailure) {
            this.#logPersistenceDebug(nodeKey, {
              phase: 'save-verify',
              entry,
              verified,
              details:
                supersedeReason === 'fingerprint-drift'
                  ? `fingerprint-drift expected=${entry.fingerprint} actual=${verified.fingerprint} expectedUpdatedAt=${entry.updatedAt} actualUpdatedAt=${verified.updatedAt}`
                  : `${supersedeReason} expectedRevision=${persistedRevision} actualRevision=${verified.revision} expectedFingerprint=${entry.fingerprint} actualFingerprint=${verified.fingerprint} expectedUpdatedAt=${entry.updatedAt} actualUpdatedAt=${verified.updatedAt}`,
              expectedRevision: expectedPersistedRevision,
              actualRevision: verified.revision,
            })
          }

          if (isSuperseded) {
            setVerifiedRevisionPrecondition()
            return 'superseded'
          }

          throw new Error(
            `cache persistence fingerprint drift: expected=${
              entry.fingerprint
            } actual=${verified.fingerprint}`
          )
        }

        return 'superseded'
      }

      try {
        const result = await attempt(entry.value)

        if (result === 'verified') {
          clearPersistedEntryInvalidation(this.#persistence, nodeKey)
          return
        }

        const persistedWinner = await this.#loadPersistedEntry(nodeKey)
        if (!persistedWinner) {
          entry.persist = false
        }
        clearPersistedEntryInvalidation(this.#persistence, nodeKey)
        return
      } catch (error) {
        if (shouldDebugPersistenceFailure) {
          this.#logPersistenceDebug(nodeKey, {
            phase: 'save-verify',
            error,
            entry,
          })
        }

        if (isUnserializablePersistenceValueError(error)) {
          this.#warnUnserializableValue(nodeKey, error)
          await this.#clearPersistedCacheEntry(nodeKey)
          entry.persist = false
          markPersistedEntryInvalid(this.#persistence, nodeKey)
          return
        }

        const cleanupError =
          error instanceof Error ? error : new Error(String(error))

        await this.#cleanupPersistedEntry(nodeKey)
        entry.persist = false
        markPersistedEntryInvalid(this.#persistence, nodeKey)
        if (
          cleanupError &&
          !isUnserializablePersistenceValueError(cleanupError)
        ) {
          this.#warnPersistenceFailure(`save(${nodeKey})`, cleanupError)
        }
      }
    })
  }

  #logPersistenceDebug(
    nodeKey: string,
    payload: {
      phase: 'save-verify' | 'load'
      error?: unknown
      entry?: CacheEntry
      verified?: CacheEntry
      details?: string
      expectedRevision?: number | 'missing'
      actualRevision?: number
    }
  ) {
    if (!this.#debugPersistenceFailure) {
      return
    }

    const lines: string[] = []
    lines.push(`phase=${payload.phase}`)

    if (payload.error instanceof Error) {
      lines.push(`error=${payload.error.message}`)
    } else if (payload.error !== undefined) {
      lines.push(`error=${String(payload.error)}`)
    }

    if (payload.details) {
      lines.push(`details=${payload.details}`)
    }

    if (payload.entry) {
      lines.push(
        `deps=${payload.entry.deps.length} fingerprint=${payload.entry.fingerprint}`
      )
      lines.push(`value=${summarizePersistedValue(payload.entry.value)}`)
    }

    if (payload.verified) {
      lines.push(
        `verifiedDeps=${payload.verified.deps.length} verifiedFingerprint=${payload.verified.fingerprint} verifiedUpdatedAt=${payload.verified.updatedAt}`
      )
    }

    if (payload.expectedRevision !== undefined) {
      lines.push(`expectedRevision=${payload.expectedRevision}`)
    }
    if (payload.actualRevision !== undefined) {
      lines.push(`actualRevision=${payload.actualRevision}`)
    }

    console.warn(
      `[renoun-debug] cache persistence failure for ${nodeKey} ${lines.join(' ')}`
    )
  }

  #shouldDebugCachePersistenceFailure(nodeKey: string): boolean {
    if (!this.#debugPersistenceFailure) {
      return false
    }

    return (
      nodeKey.startsWith('js.exports:') || nodeKey.startsWith('mdx.sections:')
    )
  }

  #warnPersistenceFailure(operation: string, error: unknown) {
    if (this.#warnedAboutPersistenceFailure) {
      return
    }

    this.#warnedAboutPersistenceFailure = true
    console.warn(
      `[renoun] Cache persistence failed during ${operation}. Continuing with in-memory cache and retrying persistence: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  #warnUnserializableValue(nodeKey: string, error: unknown) {
    if (this.#warnedAboutUnserializableValue) {
      return
    }

    this.#warnedAboutUnserializableValue = true
    console.warn(
      `[renoun] Cache persistence skipped for ${nodeKey} because the value is not serializable: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

export { hashString, stableStringify } from '../utils/stable-serialization.ts'

export function createFingerprint(dependencies: CacheDependency[]): string {
  if (dependencies.length === 0) {
    return hashString('empty')
  }

  const lines = dependencies.map((dependency) => {
    return `${dependency.depKey}=${dependency.depVersion}`
  })

  return hashString(lines.join('\n'))
}

function normalizeDepPath(path: string): string {
  return normalizeCachePathKey(path)
}

function normalizeCacheSlashes(path: string): string {
  return path.replaceAll('\\', '/')
}

function trimLeadingDotSlashForCache(path: string): string {
  const normalized = normalizeCacheSlashes(path)
  if (
    normalized.length >= 2 &&
    normalized.charCodeAt(0) === 46 &&
    normalized.charCodeAt(1) === 47
  ) {
    let start = 2
    while (start < normalized.length && normalized.charCodeAt(start) === 47) {
      start++
    }
    return normalized.slice(start)
  }

  return normalized
}

function trimLeadingSlashesForCache(value: string): string {
  let start = 0
  while (start < value.length && value.charCodeAt(start) === 47) {
    start++
  }
  return value.slice(start)
}

function trimTrailingSlashesForCache(value: string): string {
  let end = value.length
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end--
  }
  return value.slice(0, end)
}

function normalizeCachePathKey(path: string): string {
  const key = trimTrailingSlashesForCache(
    trimLeadingSlashesForCache(trimLeadingDotSlashForCache(path))
  )
  return key === '' ? '.' : key
}

function isUnserializablePersistenceValueError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return /could not be cloned|cannot be serialized|datacloneerror/i.test(
    error.message
  )
}

function isComputeSlotTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const candidateError = error as {
    code?: number | string
    errno?: number | string
    resultCode?: number | string
    extendedResultCode?: number | string
  }

  const isCodeMatched = (code: unknown): boolean => {
    if (typeof code === 'number') {
      return code === 5 || code === 6
    }

    if (typeof code === 'string') {
      const normalizedCode = code.toUpperCase()
      if (
        normalizedCode.includes('SQLITE_BUSY') ||
        normalizedCode.includes('SQLITE_LOCKED')
      ) {
        return true
      }

      const codeNumber = Number.parseInt(code, 10)
      if (codeNumber === 5 || codeNumber === 6) {
        return true
      }
    }

    return false
  }

  if (
    isCodeMatched(candidateError.code) ||
    isCodeMatched(candidateError.errno) ||
    isCodeMatched(candidateError.resultCode) ||
    isCodeMatched(candidateError.extendedResultCode)
  ) {
    return true
  }

  const normalizedMessage = error.message.toLowerCase()
  return (
    normalizedMessage.includes('database is locked') ||
    normalizedMessage.includes('database table is locked') ||
    normalizedMessage.includes('database is busy')
  )
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number
): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }

  const parsed = Math.floor(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function normalizeNonNegativeInteger(
  value: number | undefined,
  fallback: number
): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }

  const parsed = Math.floor(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }

  return parsed
}
