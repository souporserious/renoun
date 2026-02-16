import { createHash } from 'node:crypto'

import { normalizeSlashes } from '../utils/path.ts'
import { getDebugLogger } from '../utils/debug.ts'
import type { Snapshot } from './Snapshot.ts'

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

export interface CacheStorePersistence {
  load(
    nodeKey: string,
    options?: {
      skipFingerprintCheck?: boolean
    }
  ): Promise<CacheEntry | undefined>
  save(nodeKey: string, entry: CacheEntry): Promise<void>
  saveWithRevision?(nodeKey: string, entry: CacheEntry): Promise<number>
  delete(nodeKey: string): Promise<void>
}

export interface CacheStoreGetOrComputeOptions {
  persist?: boolean
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

export interface CacheStoreOptions {
  snapshot: Snapshot
  persistence?: CacheStorePersistence
  inflight?: Map<string, Promise<unknown>>
}

const failedPersistenceEntries = new WeakMap<
  CacheStorePersistence,
  Set<string>
>()
const COMPUTE_SLOT_TTL_MS = getEnvInt(
  'RENOUN_FS_CACHE_COMPUTE_SLOT_TTL_MS',
  20_000
)
const COMPUTE_SLOT_POLL_MS = getEnvInt(
  'RENOUN_FS_CACHE_COMPUTE_SLOT_POLL_MS',
  25
)

interface CacheStorePersistenceComputeSlot {
  acquireComputeSlot(
    nodeKey: string,
    owner: string,
    ttlMs: number
  ): Promise<boolean>
  refreshComputeSlot?(nodeKey: string, owner: string, ttlMs: number): Promise<void>
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

export class CacheStore {
  readonly #snapshot: Snapshot
  readonly #persistence?: CacheStorePersistence
  readonly #entries = new Map<string, CacheEntry>()
  readonly #inflight: Map<string, Promise<unknown>>
  readonly #persistenceOperationByKey = new Map<string, Promise<void>>()
  readonly #persistenceIntentVersionByKey = new Map<string, number>()
  #warnedAboutPersistenceFailure = false
  #warnedAboutUnserializableValue = false

  constructor(options: CacheStoreOptions) {
    this.#snapshot = options.snapshot
    this.#persistence = options.persistence
    this.#inflight = options.inflight ?? new Map<string, Promise<unknown>>()
  }

  async getOrCompute<Value>(
    nodeKey: string,
    options: CacheStoreGetOrComputeOptions,
    compute: (context: CacheStoreComputeContext) => Promise<Value> | Value
  ): Promise<Value> {
    const inFlight = this.#inflight.get(nodeKey)
    if (inFlight) {
      this.#logCacheOperation('hit', nodeKey, {
        source: 'inflight',
      })
      return inFlight as Promise<Value>
    }

    const operation = this.#getOrCompute(nodeKey, options, compute)
    this.#inflight.set(nodeKey, operation as Promise<unknown>)

    try {
      return await operation
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
    return entry?.value as Value | undefined
  }

  async getWithFreshness<Value>(
    nodeKey: string
  ): Promise<{ value: Value | undefined; fresh: boolean }> {
    const memoryEntry = this.#entries.get(nodeKey)
    if (memoryEntry) {
      const fresh = await this.#isEntryFresh(nodeKey, memoryEntry, new Set())
      return { value: memoryEntry.value as Value, fresh }
    }

    const persistedEntry = await this.#loadPersistedEntry(nodeKey)
    if (!persistedEntry) {
      return { value: undefined, fresh: false }
    }

    const fresh = await this.#isEntryFresh(nodeKey, persistedEntry, new Set())
    return { value: persistedEntry.value as Value, fresh }
  }

  async put<Value>(
    nodeKey: string,
    value: Value,
    options: CacheStorePutOptions = {}
  ): Promise<void> {
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
    await this.#savePersistedEntry(nodeKey, entry)
  }

  async delete(nodeKey: string): Promise<void> {
    this.#logCacheOperation('clear', nodeKey, {
      source: 'explicit',
    })

    this.#entries.delete(nodeKey)
    if (!this.#persistence) {
      return
    }

    clearPersistedEntryInvalidation(this.#persistence, nodeKey)
    await this.#withPersistenceIntent(nodeKey, () =>
      this.#clearPersistedCacheEntry(nodeKey)
    )
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

    clearPersistedEntryInvalidation(this.#persistence, nodeKey)
  }

  #cleanupPersistedEntry(nodeKey: string, entry: CacheEntry): Promise<void> {
    markPersistedEntryInvalid(this.#persistence, nodeKey)
    if (!this.#persistence) {
      return Promise.resolve()
    }

    return this.#clearPersistedCacheEntry(nodeKey).then(() => {
      if (!this.#entries.get(nodeKey)) {
        this.#entries.set(nodeKey, entry)
      }
    })
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
  ): Promise<Value | undefined> {
    const persistence = this.#getComputeSlotPersistence()
    if (!persistence) {
      return undefined
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
        return undefined
      }

      if (!inFlightOwner) {
        return undefined
      }

      const sleep = Math.max(0, COMPUTE_SLOT_POLL_MS) || 0
      if (sleep > 0) {
        await delay(sleep)
      }
      continue
    }

    return undefined
  }

  #createComputeSlotOwner(): string {
    const randomSuffix = Math.random().toString(36).slice(2)
    return `${process.pid}:${Date.now()}:${randomSuffix}`
  }

  clearMemory(): void {
    this.#logCacheOperation('clear', '__cache_memory__', {
      source: 'memory',
      size: this.#entries.size,
    })

    this.#entries.clear()
    this.#inflight.clear()
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

    const deps = new Map<string, string>()
    const context: CacheStoreComputeContext = {
      snapshot: this.#snapshot,
      recordDep(depKey, depVersion) {
        deps.set(depKey, depVersion)
      },
      recordConstDep(name, version) {
        deps.set(`const:${name}:${version}`, version)
      },
      recordFileDep: async (path: string) => {
        const normalizedPath = normalizeDepPath(path)
        const depVersion = await this.#snapshot.contentId(normalizedPath)
        deps.set(`file:${normalizedPath}`, depVersion)
        return depVersion
      },
      recordDirectoryDep: async (path: string) => {
        const normalizedPath = normalizeDepPath(path)
        const depVersion = await this.#snapshot.contentId(normalizedPath)
        deps.set(`dir:${normalizedPath}`, depVersion)
        return depVersion
      },
      recordNodeDep: async (childNodeKey: string) => {
        const depVersion =
          (await this.getFingerprint(childNodeKey)) ?? 'missing'
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
      COMPUTE_SLOT_TTL_MS
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
        if (sharedValue !== undefined) {
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
      const value = await compute(context)

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
      await this.#savePersistedEntry(nodeKey, entry)

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

  async #loadPersistedEntry(
    nodeKey: string
  ): Promise<CacheEntry | undefined> {
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
    }

    return persistedEntry
  }

  async #getFreshEntry(nodeKey: string): Promise<CacheEntry | undefined> {
    const memoryEntry = this.#entries.get(nodeKey)
    if (memoryEntry) {
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
      this.#logCacheOperation('clear', nodeKey, {
        source: 'memory',
        reason: 'stale',
      })
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

  async #isEntryFresh(
    nodeKey: string,
    entry: CacheEntry,
    visitedNodeKeys: Set<string>
  ): Promise<boolean> {
    if (visitedNodeKeys.has(nodeKey)) {
      return true
    }

    visitedNodeKeys.add(nodeKey)

    for (const dependency of entry.deps) {
      const currentVersion = await this.#resolveDepVersion(
        dependency.depKey,
        visitedNodeKeys
      )

      if (currentVersion !== dependency.depVersion) {
        return false
      }
    }

    return true
  }

  async #resolveDepVersion(
    depKey: string,
    visitedNodeKeys: Set<string>
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
        return 'missing'
      }

      const childIsFresh = await this.#isEntryFresh(
        nodeKey,
        childEntry,
        visitedNodeKeys
      )

      if (!childIsFresh) {
        return 'stale'
      }

      return childEntry.fingerprint
    }

    if (depKey.startsWith('const:')) {
      const separatorIndex = depKey.lastIndexOf(':')
      return separatorIndex === -1
        ? undefined
        : depKey.slice(separatorIndex + 1)
    }

    return undefined
  }

  async #savePersistedEntry(nodeKey: string, entry: CacheEntry): Promise<void> {
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

    await this.#withPersistenceIntent(nodeKey, async () => {
      const shouldDebugPersistenceFailure =
        this.#shouldDebugCachePersistenceFailure(nodeKey)
      const maxVerificationAttempts = 3

      const attempt = async (
        value: unknown
      ): Promise<'verified' | 'superseded'> => {
        const persistenceWithRevision = this.#persistence as CacheStorePersistence & {
          saveWithRevision?(
            nodeKey: string,
            entry: CacheEntry
          ): Promise<number>
        }
        const persisted = {
          ...entry,
          value,
          persist: true,
        }
        const expectedRevision = persistenceWithRevision.saveWithRevision
          ? await persistenceWithRevision.saveWithRevision(nodeKey, persisted)
          : undefined

        if (!persistenceWithRevision.saveWithRevision) {
          await this.#persistence!.save(nodeKey, persisted)
        }

        for (
          let verifyAttempt = 0;
          verifyAttempt < maxVerificationAttempts;
          verifyAttempt += 1
        ) {
          const verified = (await this.#persistence!.load(nodeKey, {
            skipFingerprintCheck: true,
          })) as PersistedCacheEntry | undefined

        if (!verified) {
            if (shouldDebugPersistenceFailure) {
              this.#logPersistenceDebug(nodeKey, {
                phase: 'save-verify',
                details: `verification-load-miss attempt=${verifyAttempt + 1} of ${maxVerificationAttempts} expectedFingerprint=${entry.fingerprint}`,
                entry,
                expectedRevision,
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
                expectedRevision,
              })
            }

            return 'superseded'
          }

          if (!verified.persist) {
            throw new Error(
              'cache persistence verification failed: load returned non-persistent entry'
            )
          }

          if (verified.fingerprint === entry.fingerprint) {
            if (shouldDebugPersistenceFailure) {
              this.#logPersistenceDebug(nodeKey, {
                phase: 'save-verify',
                details: 'verification-match',
                entry,
                verified,
                expectedRevision,
                actualRevision: verified.revision,
              })
            }

            return 'verified'
          }

          const isRevisionSuperseding =
            typeof expectedRevision === 'number' &&
            typeof verified.revision === 'number' &&
            verified.revision > expectedRevision

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
                  : `${supersedeReason} expectedRevision=${expectedRevision} actualRevision=${verified.revision} expectedFingerprint=${entry.fingerprint} actualFingerprint=${verified.fingerprint} expectedUpdatedAt=${entry.updatedAt} actualUpdatedAt=${verified.updatedAt}`,
              expectedRevision,
              actualRevision: verified.revision,
            })
          }

          if (isSuperseded) {
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

        entry.persist = false
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

        await this.#cleanupPersistedEntry(nodeKey, {
          ...entry,
          value: entry.value,
        })
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
      expectedRevision?: number
      actualRevision?: number
    }
  ) {
    const debugEnvValue = process.env['RENOUN_DEBUG_CACHE_PERSISTENCE']
    if (debugEnvValue !== '1' && debugEnvValue !== 'true') {
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
    const debugEnvValue = process.env['RENOUN_DEBUG_CACHE_PERSISTENCE']
    if (debugEnvValue !== '1' && debugEnvValue !== 'true') {
      return false
    }

    return (
      nodeKey.startsWith('js.exports:') ||
      nodeKey.startsWith('mdx.sections:')
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

export function stableStringify(value: unknown): string {
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

export function hashString(input: string): string {
  return createHash('sha1').update(input).digest('hex')
}

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
  const normalized = normalizeSlashes(path).replace(/^\.\/+/, '')
  return normalized === '' ? '.' : normalized
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

function summarizePersistedValue(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${typeof value}:${value}`
  }

  if (typeof value === 'undefined') {
    return 'undefined'
  }

  if (typeof value === 'symbol') {
    return `symbol:${value.description ?? value.toString()}`
  }

  if (value instanceof RegExp) {
    return `regexp:${value.toString()}`
  }

  if (Array.isArray(value)) {
    const length = value.length
    const first = summarizePersistedValue(value[0])
    return `array(length=${length}, first=${first})`
  }

  if (typeof value === 'function') {
    return `function:${value.name || 'anonymous'}`
  }

  if (typeof value === 'bigint') {
    return `bigint:${value.toString()}`
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>)
    const previewKeys = keys.slice(0, 10).join(',')
    const hasSymbols = Object.getOwnPropertySymbols(value as object).length > 0
    const symbolsPart = hasSymbols ? ' symbols=true' : ''
    return `object(keys=[${previewKeys}]${symbolsPart})`
  }

  return `unsupported:${typeof value}`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
