import { createHash } from 'node:crypto'

import { normalizeSlashes } from '../utils/path.ts'
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
  load(nodeKey: string): Promise<CacheEntry | undefined>
  save(nodeKey: string, entry: CacheEntry): Promise<void>
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

export class CacheStore {
  readonly #snapshot: Snapshot
  readonly #persistence?: CacheStorePersistence
  readonly #entries = new Map<string, CacheEntry>()
  readonly #inflight: Map<string, Promise<unknown>>
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

    this.#entries.set(nodeKey, entry)
    await this.#savePersistedEntry(nodeKey, entry)
  }

  async delete(nodeKey: string): Promise<void> {
    this.#entries.delete(nodeKey)
    if (!this.#persistence) {
      return
    }

    await this.#syncPersistenceIntent(nodeKey, false, `delete(${nodeKey})`)
  }

  async #syncPersistenceIntent(
    nodeKey: string,
    shouldPersist: boolean,
    operation: string
  ): Promise<boolean> {
    if (!this.#persistence || shouldPersist) {
      return false
    }

    try {
      await this.#persistence.delete(nodeKey)
      return false
    } catch (error) {
      this.#warnPersistenceFailure(operation, error)
      return true
    }
  }

  clearMemory(): void {
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
        const depVersion = (await this.getFingerprint(childNodeKey)) ?? 'missing'
        deps.set(`node:${childNodeKey}`, depVersion)
        return depVersion
      },
    }

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

    this.#entries.set(nodeKey, entry)
    await this.#savePersistedEntry(nodeKey, entry)

    return value
  }

  async #getEntry(nodeKey: string): Promise<CacheEntry | undefined> {
    const memoryEntry = this.#entries.get(nodeKey)
    if (memoryEntry) {
      return memoryEntry
    }

    return this.#loadPersistedEntry(nodeKey)
  }

  async #loadPersistedEntry(nodeKey: string): Promise<CacheEntry | undefined> {
    if (!this.#persistence) {
      return undefined
    }

    let persistedEntry: CacheEntry | undefined
    try {
      persistedEntry = await this.#persistence.load(nodeKey)
    } catch (error) {
      this.#warnPersistenceFailure(`load(${nodeKey})`, error)
      return undefined
    }

    if (persistedEntry && !persistedEntry.persist) {
      await this.#syncPersistenceIntent(nodeKey, false, `cleanup(${nodeKey})`)
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
        return memoryEntry
      }

      this.#entries.delete(nodeKey)
    }

    if (!this.#persistence) {
      return undefined
    }

    const persistedEntry = await this.#loadPersistedEntry(nodeKey)
    if (!persistedEntry) {
      return undefined
    }

    const persistedIsFresh = await this.#isEntryFresh(
      nodeKey,
      persistedEntry,
      new Set()
    )

    if (persistedIsFresh) {
      return persistedEntry
    }

    await this.delete(nodeKey)
    return undefined
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
    await this.#syncPersistenceIntent(
      nodeKey,
      entry.persist,
      `cleanup(${nodeKey})`
    )

    if (!this.#persistence || !entry.persist) {
      return
    }

    try {
      await this.#persistence.save(nodeKey, entry)
    } catch (error) {
      // Keep the computed value in memory when persistence rejects this value.
      entry.persist = false

      const cleanupFailed = await this.#syncPersistenceIntent(
        nodeKey,
        false,
        `cleanup(${nodeKey})`
      )

      if (cleanupFailed) {
        if (isUnserializablePersistenceValueError(error)) {
          this.#warnUnserializableValue(nodeKey, error)

          const serializableValue = toPersistenceSafeValue(entry.value)
          if (serializableValue !== undefined) {
            try {
              await this.#persistence.save(nodeKey, {
                ...entry,
                persist: true,
                value: serializableValue,
              })
            } catch (fallbackError) {
              if (isUnserializablePersistenceValueError(fallbackError)) {
                return
              }
            }
          }
          return
        }

        return
      }

      if (isUnserializablePersistenceValueError(error)) {
        this.#warnUnserializableValue(nodeKey, error)

        const serializableValue = toPersistenceSafeValue(entry.value)
        if (serializableValue !== undefined) {
          try {
            await this.#persistence.save(nodeKey, {
              ...entry,
              persist: true,
              value: serializableValue,
            })
            return
          } catch (fallbackError) {
            if (isUnserializablePersistenceValueError(fallbackError)) {
              return
            }
            this.#warnPersistenceFailure(`save(${nodeKey})`, fallbackError)
            return
          }
        }

        return
      }
      this.#warnPersistenceFailure(`save(${nodeKey})`, error)
    }
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

function toPersistenceSafeValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): unknown | undefined {
  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined
  }

  if (value === null || typeof value !== 'object') {
    return value
  }

  if (value instanceof Date) {
    return new Date(value.getTime())
  }

  if (seen.has(value)) {
    return undefined
  }

  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => toPersistenceSafeValue(item, seen))
  }

  const result: Record<string, unknown> = {}
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    const sanitized = toPersistenceSafeValue(entryValue, seen)
    if (sanitized !== undefined) {
      result[key] = sanitized
    }
  }

  return result
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
