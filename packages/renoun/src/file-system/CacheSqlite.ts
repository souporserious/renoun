import { mkdir } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { deserialize, serialize } from 'node:v8'

import { delay } from '../utils/delay.ts'
import {
  resolveBooleanProcessEnv,
  resolvePositiveIntegerProcessEnv,
} from '../utils/env.ts'
import { DIRECTORY_SNAPSHOT_DEP_INDEX_PREFIX } from '../utils/cache-constants.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import { normalizePathKey } from '../utils/path.ts'
import { CACHE_SCHEMA_VERSION } from './cache-key.ts'
import { summarizePersistedValue } from './cache-persistence-debug.ts'
import { loadSqliteModule } from './sqlite.ts'
import {
  createFingerprint,
  type CacheDependencyEvictionResult,
  type CacheEntry,
  type CacheStorePersistence,
} from './Cache.ts'

const SQLITE_BUSY_RETRIES = 5
const SQLITE_BUSY_RETRY_DELAY_MS = 25
const SQLITE_INIT_BUSY_RETRIES = 30
const SQLITE_INIT_BUSY_RETRY_DELAY_MS = 25
const SQLITE_INIT_BUSY_RETRY_MAX_DELAY_MS = 250
const SQLITE_DEFAULT_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14
const SQLITE_DEFAULT_MAX_ROWS = 200_000
const SQLITE_PRUNE_WRITE_INTERVAL = 32
const SQLITE_PRUNE_MAX_INTERVAL_MS = 1000 * 60 * 5
const SQLITE_DELETE_BATCH_SIZE = 500
const SQLITE_DEFAULT_PREPARED_STATEMENT_CACHE_MAX = 128
const SQLITE_INFLIGHT_TTL_MS = 20_000
const SQLITE_INFLIGHT_CLEANUP_INTERVAL_MS = 10_000
const SQLITE_LAST_ACCESSED_TOUCH_MIN_INTERVAL_MS = 30_000
const SQLITE_LAST_ACCESSED_TOUCH_CACHE_MAX_SIZE = 50_000
const SQLITE_STRUCTURED_PATH_ID_CACHE_MAX_SIZE = 100_000
const SQLITE_STRUCTURED_DEP_TERM_ID_CACHE_MAX_SIZE = 100_000
const SQLITE_STRUCTURED_PATH_CLOSURE_SEEDED_CACHE_MAX_SIZE = 100_000
const MISSING_DEPENDENCY_ENTRY_COUNT_META_KEY = 'missing_dependency_entry_count'
const INVALIDATION_SEQUENCE_META_KEY = 'invalidation_seq'

const STRUCTURED_DEP_KIND_FILE = 1
const STRUCTURED_DEP_KIND_DIR = 2
const STRUCTURED_DEP_KIND_DIR_MTIME = 3

interface StructuredPathDependencyTerm {
  kind:
    | typeof STRUCTURED_DEP_KIND_FILE
    | typeof STRUCTURED_DEP_KIND_DIR
    | typeof STRUCTURED_DEP_KIND_DIR_MTIME
  pathKey: string
}

let warnedAboutSqliteFallback = false
const persistenceByDbPath = new Map<string, SqliteCacheStorePersistence>()
const persistenceOptionsByDbPath = new Map<
  string,
  ResolvedSqlitePersistenceOptions
>()

export interface CacheStoreSqliteOptions {
  dbPath?: string
  projectRoot?: string
  schemaVersion?: number
  maxAgeMs?: number
  maxRows?: number
  preparedStatementCacheMax?: number
  structuredIdCacheEnabled?: boolean
  debugSessionRoot?: boolean
  debugCachePersistence?: boolean
}

interface ResolvedSqlitePersistenceOptions {
  dbPath: string
  schemaVersion: number
  maxAgeMs: number
  maxRows: number
  debugSessionRoot?: boolean
  debugCachePersistence?: boolean
}

function resolveDbPath(options: {
  dbPath?: string
  projectRoot?: string
  debugSessionRoot?: boolean
}): string {
  if (typeof options.dbPath === 'string' && options.dbPath.trim()) {
    return resolve(options.dbPath)
  }

  if (options.debugSessionRoot === true) {
    // eslint-disable-next-line no-console
    console.log('[renoun-debug] resolveDbPath', {
      projectRoot: options.projectRoot,
    })
  }
  return getDefaultCacheDatabasePath(
    options.projectRoot
      ? resolveCanonicalProjectRootPath(options.projectRoot)
      : undefined,
    options.debugSessionRoot
  )
}

export function getDefaultCacheDatabasePath(
  projectRoot?: string,
  debugSessionRoot?: boolean
): string {
  let root = projectRoot
    ? resolveCanonicalProjectRootPath(projectRoot)
    : resolve(getRootDirectory())
  if (root === resolve('/')) {
    throw new Error(
      '[renoun] Refusing to write cache database at filesystem root "/". Run from a workspace directory or pass `dbPath`/`projectRoot` explicitly.'
    )
  }
  const path = resolve(root, '.renoun', 'cache', 'fs-cache.sqlite')
  if (debugSessionRoot === true) {
    // eslint-disable-next-line no-console
    console.log('[renoun-debug] getDefaultCacheDatabasePath', {
      projectRoot,
      resolved: path,
    })
  }
  return path
}

function resolveCanonicalProjectRootPath(pathToResolve: string): string {
  try {
    return realpathSync(pathToResolve)
  } catch {
    return resolve(pathToResolve)
  }
}

export function getCacheStorePersistence(
  options: CacheStoreSqliteOptions = {}
) {
  const resolvedOptions = resolveSqlitePersistenceOptions(options)
  const existing = persistenceByDbPath.get(resolvedOptions.dbPath)
  if (existing) {
    existing.setDebugCachePersistence(
      resolvedOptions.debugCachePersistence === true
    )
    const existingOptions = persistenceOptionsByDbPath.get(
      resolvedOptions.dbPath
    )

    if (
      existingOptions &&
      !areSqlitePersistenceOptionsEqual(existingOptions, resolvedOptions)
    ) {
      throw new Error(
        `[renoun] Cache persistence for "${resolvedOptions.dbPath}" is already initialized with different options. Call disposeCacheStorePersistence() before reconfiguring it.`
      )
    }

    return existing
  }

  const created = new SqliteCacheStorePersistence({
    dbPath: resolvedOptions.dbPath,
    schemaVersion: resolvedOptions.schemaVersion,
    maxAgeMs: resolvedOptions.maxAgeMs,
    maxRows: resolvedOptions.maxRows,
    debugSessionRoot: resolvedOptions.debugSessionRoot,
    debugCachePersistence: resolvedOptions.debugCachePersistence,
  })
  persistenceByDbPath.set(resolvedOptions.dbPath, created)
  persistenceOptionsByDbPath.set(resolvedOptions.dbPath, resolvedOptions)
  return created
}

export function getDefaultCacheStorePersistence() {
  return getCacheStorePersistence()
}

export function disposeCacheStorePersistence(
  options: {
    dbPath?: string
    projectRoot?: string
  } = {}
) {
  if (!options.dbPath && !options.projectRoot) {
    for (const [dbPath, persistence] of persistenceByDbPath) {
      persistence.close()
      persistenceByDbPath.delete(dbPath)
      persistenceOptionsByDbPath.delete(dbPath)
    }
    return
  }

  const dbPath = resolveDbPath(options)
  const persistence = persistenceByDbPath.get(dbPath)
  if (!persistence) {
    return
  }

  persistence.close()
  persistenceByDbPath.delete(dbPath)
  persistenceOptionsByDbPath.delete(dbPath)
}

export function disposeDefaultCacheStorePersistence() {
  disposeCacheStorePersistence()
}

export class SqliteCacheStorePersistence implements CacheStorePersistence {
  readonly #dbPath: string
  readonly #schemaVersion: number
  readonly #maxAgeMs: number
  readonly #maxRows: number
  readonly #overflowCheckInterval: number
  readonly #preparedStatementCacheMax: number
  readonly #structuredIdCacheEnabled: boolean
  readonly #readyPromise: Promise<void>
  #debugCachePersistence: boolean
  #availability: 'initializing' | 'available' | 'unavailable' = 'initializing'
  #writesSincePrune = 0
  #lastPrunedAt = 0
  #lastInflightCleanupAt = 0
  #lastAccessTouchAtByNodeKey = new Map<string, number>()
  #pathIdByPathKey = new Map<string, number>()
  #depTermIdByTermKey = new Map<string, number>()
  #seededPathClosureByPathKey = new Set<string>()
  #preparedStatements = new Map<string, any>()
  #pruneInFlight?: Promise<void>
  #db: any

  constructor(options: CacheStoreSqliteOptions = {}) {
    this.#dbPath = resolveDbPath(options)
    this.#schemaVersion = options.schemaVersion ?? CACHE_SCHEMA_VERSION
    this.#maxAgeMs = options.maxAgeMs ?? SQLITE_DEFAULT_CACHE_MAX_AGE_MS
    this.#maxRows = options.maxRows ?? SQLITE_DEFAULT_MAX_ROWS
    this.#debugCachePersistence = options.debugCachePersistence === true
    this.#overflowCheckInterval = Math.max(
      1,
      Math.min(SQLITE_PRUNE_WRITE_INTERVAL, Math.floor(this.#maxRows / 100))
    )
    this.#preparedStatementCacheMax = resolvePreparedStatementCacheMax(
      options.preparedStatementCacheMax
    )
    this.#structuredIdCacheEnabled = resolveStructuredIdCacheEnabled(
      options.structuredIdCacheEnabled
    )
    this.#readyPromise = this.#initialize()
  }

  setDebugCachePersistence(enabled: boolean): void {
    this.#debugCachePersistence = enabled === true
  }

  isAvailable(): boolean {
    return this.#availability !== 'unavailable'
  }

  async acquireComputeSlot(
    nodeKey: string,
    owner: string,
    ttlMs: number = SQLITE_INFLIGHT_TTL_MS
  ): Promise<boolean> {
    await this.#readyPromise

    if (!this.#db) {
      return false
    }

    const now = Date.now()
    const expiresAt = now + ttlMs

    return this.#runWithBusyRetries(() => {
      this.#cleanupExpiredComputeSlots(now)

      const result = this
        .#prepareStatement(
          `
            INSERT INTO cache_inflight (node_key, owner, started_at, expires_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(node_key) DO UPDATE SET
              owner = excluded.owner,
              started_at = excluded.started_at,
              expires_at = excluded.expires_at
            WHERE cache_inflight.expires_at < ?
          `
        )
        .run(nodeKey, owner, now, expiresAt, now)

      const changes = Number((result as { changes?: number }).changes ?? 0)
      return changes > 0
    })
  }

  async refreshComputeSlot(
    nodeKey: string,
    owner: string,
    ttlMs: number = SQLITE_INFLIGHT_TTL_MS
  ): Promise<void> {
    await this.#readyPromise

    if (!this.#db) {
      return
    }

    const now = Date.now()
    const expiresAt = now + ttlMs

    await this.#runWithBusyRetries(() => {
      this
        .#prepareStatement(
          `
            UPDATE cache_inflight
            SET expires_at = ?
            WHERE node_key = ? AND owner = ?
          `
        )
        .run(expiresAt, nodeKey, owner)
    })
  }

  async releaseComputeSlot(nodeKey: string, owner: string): Promise<void> {
    await this.#readyPromise

    if (!this.#db) {
      return
    }

    await this.#runWithBusyRetries(() => {
      this.#prepareStatement(
        `DELETE FROM cache_inflight WHERE node_key = ? AND owner = ?`
      ).run(nodeKey, owner)
    })
  }

  async getComputeSlotOwner(nodeKey: string): Promise<string | undefined> {
    await this.#readyPromise

    if (!this.#db) {
      return undefined
    }

    const maybeOwner = this.#runWithBusyRetries(() => {
      const now = Date.now()

      this.#cleanupExpiredComputeSlots(now)

      const row = this
        .#prepareStatement(
          `
            SELECT owner, expires_at
            FROM cache_inflight
            WHERE node_key = ?
          `
        )
        .get(nodeKey) as { owner?: string; expires_at?: number } | undefined

      if (!row?.owner) {
        return undefined
      }

      const expiresAt = Number(row.expires_at)
      if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        this.#prepareStatement(`DELETE FROM cache_inflight WHERE node_key = ?`).run(
          nodeKey
        )
        return undefined
      }

      return row.owner
    })

    return maybeOwner
  }

  async load(
    nodeKey: string,
    options: {
      skipFingerprintCheck?: boolean
      skipLastAccessedUpdate?: boolean
    } = {}
  ): Promise<CacheEntry | undefined> {
    await this.#readyPromise

    if (!this.#db) {
      return undefined
    }
    const shouldDebug = this.#shouldDebugCachePersistenceLoadFailure(nodeKey)
    const skipFingerprintCheck = options.skipFingerprintCheck ?? false
    const now = Date.now()
    try {
      await this.#runWithBusyRetries(() => {
        this.#cleanupExpiredComputeSlots(now)
      })
    } catch {}

    const row = (await this.#runWithBusyRetries(() =>
      this
        .#prepareStatement(
          `
            SELECT
              fingerprint as fingerprint,
              value_blob as value_blob,
              updated_at as updated_at,
              persist as persist,
              workspace_change_token as workspace_change_token,
              revision as revision
            FROM cache_entries
            WHERE node_key = ?
          `
        )
        .get(nodeKey)
    )) as
      | {
          fingerprint?: string
          value_blob?: unknown
          updated_at?: number
          persist?: number
          workspace_change_token?: unknown
          revision?: unknown
        }
      | undefined

    if (!row) {
      if (shouldDebug) {
        logCachePersistenceLoadFailure(nodeKey, 'no-rows')
      }
      return undefined
    }

    const dependencyRows = (await this.#runWithBusyRetries(() =>
      this
        .#prepareStatement(
          `
            SELECT dep_key as dep_key, dep_version as dep_version
            FROM cache_entry_deps_v2
            WHERE node_key = ?
            ORDER BY dep_key
          `
        )
        .all(nodeKey)
    )) as Array<{
      dep_key?: string | null
      dep_version?: string | null
    }>
    const storedFingerprint = getPersistedFingerprint(row.fingerprint)
    const revision = getPersistedRevision(row.revision)
    if (!storedFingerprint) {
      if (shouldDebug) {
        logCachePersistenceLoadFailure(
          nodeKey,
          'invalid-fingerprint',
          `raw=${String(row.fingerprint)} revision=${String(revision)}`
        )
      }
      await this.delete(nodeKey)
      return undefined
    }

    const updatedAt = getPersistedTimestamp(row.updated_at)
    if (!Number.isFinite(updatedAt)) {
      if (shouldDebug) {
        logCachePersistenceLoadFailure(
          nodeKey,
          'invalid-updated-at',
          `raw=${String(row.updated_at)} revision=${String(revision)}`
        )
      }
      await this.delete(nodeKey)
      return undefined
    }

    const valueBuffer = toUint8Array(row.value_blob)

    if (!valueBuffer) {
      if (shouldDebug) {
        logCachePersistenceLoadFailure(
          nodeKey,
          'missing-value-blob',
          `type=${typeof row.value_blob} revision=${String(revision)}`
        )
      }
      await this.delete(nodeKey)
      return undefined
    }

    let value: unknown

    try {
      value = deserialize(valueBuffer)
    } catch (error) {
      if (shouldDebug) {
        logCachePersistenceLoadFailure(
          nodeKey,
          'deserialize-failed',
          `error=${error instanceof Error ? error.message : String(error)} revision=${String(revision)}`
        )
      }
      await this.delete(nodeKey)
      return undefined
    }

    if (containsStrippedReactElementPayload(value)) {
      if (shouldDebug) {
        logCachePersistenceLoadFailure(
          nodeKey,
          'contains-stripped-react',
          `value=${summarizePersistedValue(value)} revision=${String(revision)}`
        )
      }
      await this.delete(nodeKey)
      return undefined
    }

    const deps = dependencyRows
      .filter((dependencyRow) => typeof dependencyRow.dep_key === 'string')
      .map((dependencyRow) => ({
        depKey: dependencyRow.dep_key!,
        depVersion:
          typeof dependencyRow.dep_version === 'string'
            ? dependencyRow.dep_version
            : '',
      }))
      .sort((first, second) => first.depKey.localeCompare(second.depKey))

    const recalculatedFingerprint = createFingerprint(deps)
    if (
      !skipFingerprintCheck &&
      storedFingerprint !== recalculatedFingerprint
    ) {
      if (shouldDebug) {
        logCachePersistenceLoadFailure(
          nodeKey,
          'fingerprint-mismatch',
          `stored=${storedFingerprint} recalculated=${recalculatedFingerprint} deps=${deps.length} revision=${String(revision)}`
        )
      }
      await this.delete(nodeKey)
      return undefined
    }

    if (!options.skipLastAccessedUpdate) {
      try {
        await this.#touchLastAccessed(nodeKey)
      } catch {}
    }

    const loadedEntry: CacheEntry & { revision: number } = {
      value,
      deps,
      fingerprint: storedFingerprint,
      persist: Number(row.persist) === 1,
      workspaceChangeToken:
        typeof row.workspace_change_token === 'string'
          ? row.workspace_change_token
          : null,
      revision,
      updatedAt,
    }

    return loadedEntry
  }

  async saveWithRevision(nodeKey: string, entry: CacheEntry): Promise<number> {
    await this.#readyPromise

    if (!this.#db) {
      return 0
    }

    const serializedValue = serialize(entry.value)
    const persist = entry.persist ? 1 : 0
    const now = Date.now()

    for (let attempt = 0; attempt <= SQLITE_BUSY_RETRIES; attempt += 1) {
      let transactionStarted = false

      try {
        this.#db.exec('BEGIN IMMEDIATE')
        transactionStarted = true

        const previousMissingDependencyMetadata =
          this.#isNodeKeyMissingDependencyMetadata(nodeKey)

        this
          .#prepareStatement(
            `
              INSERT INTO cache_entries (
                node_key,
                fingerprint,
                value_blob,
                updated_at,
                last_accessed_at,
                persist,
                workspace_change_token,
                revision
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT revision FROM cache_entries WHERE node_key = ?), 0) + 1)
              ON CONFLICT(node_key) DO UPDATE SET
                fingerprint = excluded.fingerprint,
                value_blob = excluded.value_blob,
                updated_at = excluded.updated_at,
                last_accessed_at = excluded.last_accessed_at,
                persist = excluded.persist,
                workspace_change_token = excluded.workspace_change_token,
                revision = excluded.revision
            `
          )
          .run(
            nodeKey,
            entry.fingerprint,
            serializedValue,
            entry.updatedAt,
            now,
            persist,
            entry.workspaceChangeToken ?? null,
            nodeKey
          )

        this.#replaceDependenciesForNodeKey(nodeKey, entry.deps)

        this.#applyMissingDependencyMetadataTransition(
          previousMissingDependencyMetadata,
          entry.deps.length === 0
        )

        const revisionRow = this.#prepareStatement(
          `SELECT revision FROM cache_entries WHERE node_key = ?`
        ).get(nodeKey) as { revision?: unknown } | undefined
        const revision = getPersistedRevision(revisionRow?.revision)

        this.#db.exec('COMMIT')
        try {
          await this.#maybePruneAfterWrite(now)
        } catch {}
        return Number.isFinite(revision) ? revision : 0
      } catch (error) {
        if (transactionStarted) {
          try {
            this.#db.exec('ROLLBACK')
          } catch {}
        }

        if (
          attempt >= SQLITE_BUSY_RETRIES ||
          !isSqliteBusyOrLockedError(error)
        ) {
          throw error
        }

        await delay((attempt + 1) * SQLITE_BUSY_RETRY_DELAY_MS)
      }
    }

    throw new Error(
      '[renoun] Exhausted SQLITE busy retries for cache revision write.'
    )
  }

  async save(nodeKey: string, entry: CacheEntry): Promise<void> {
    await this.saveWithRevision(nodeKey, entry)
  }

  async saveWithRevisionGuarded(
    nodeKey: string,
    entry: CacheEntry,
    options: {
      expectedRevision: number | 'missing'
    }
  ): Promise<{ applied: boolean; revision: number }> {
    await this.#readyPromise

    if (!this.#db) {
      return { applied: false, revision: 0 }
    }

    const serializedValue = serialize(entry.value)
    const persist = entry.persist ? 1 : 0
    const now = Date.now()

    for (let attempt = 0; attempt <= SQLITE_BUSY_RETRIES; attempt += 1) {
      let transactionStarted = false

      try {
        this.#db.exec('BEGIN IMMEDIATE')
        transactionStarted = true

        const currentRevisionRow = this.#prepareStatement(
          `SELECT revision FROM cache_entries WHERE node_key = ?`
        ).get(nodeKey) as { revision?: unknown } | undefined
        const currentRevision = getPersistedRevision(
          currentRevisionRow?.revision
        )
        let previousMissingDependencyMetadata = false

        if (options.expectedRevision === 'missing') {
          if (Number.isFinite(currentRevision)) {
            this.#db.exec('COMMIT')
            return { applied: false, revision: currentRevision }
          }

          this
            .#prepareStatement(
              `
                INSERT INTO cache_entries (
                  node_key,
                  fingerprint,
                  value_blob,
                  updated_at,
                  last_accessed_at,
                  persist,
                  workspace_change_token,
                  revision
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
              `
            )
            .run(
              nodeKey,
              entry.fingerprint,
              serializedValue,
              entry.updatedAt,
              now,
              persist,
              entry.workspaceChangeToken ?? null
            )
        } else {
          if (
            !Number.isFinite(currentRevision) ||
            currentRevision !== options.expectedRevision
          ) {
            this.#db.exec('COMMIT')
            return {
              applied: false,
              revision: Number.isFinite(currentRevision) ? currentRevision : 0,
            }
          }

          const nextRevision = options.expectedRevision + 1
          previousMissingDependencyMetadata =
            this.#isNodeKeyMissingDependencyMetadata(nodeKey)
          const updateResult = this
            .#prepareStatement(
              `
                UPDATE cache_entries
                SET
                  fingerprint = ?,
                  value_blob = ?,
                  updated_at = ?,
                  last_accessed_at = ?,
                  persist = ?,
                  workspace_change_token = ?,
                  revision = ?
                WHERE node_key = ? AND revision = ?
              `
            )
            .run(
              entry.fingerprint,
              serializedValue,
              entry.updatedAt,
              now,
              persist,
              entry.workspaceChangeToken ?? null,
              nextRevision,
              nodeKey,
              options.expectedRevision
            ) as { changes?: number }

          const changes = Number(updateResult.changes ?? 0)
          if (changes === 0) {
            const latestRevisionRow = this.#prepareStatement(
              `SELECT revision FROM cache_entries WHERE node_key = ?`
            ).get(nodeKey) as { revision?: unknown } | undefined
            const latestRevision = getPersistedRevision(
              latestRevisionRow?.revision
            )
            this.#db.exec('COMMIT')
            return {
              applied: false,
              revision: Number.isFinite(latestRevision) ? latestRevision : 0,
            }
          }
        }

        this.#replaceDependenciesForNodeKey(nodeKey, entry.deps)

        this.#applyMissingDependencyMetadataTransition(
          previousMissingDependencyMetadata,
          entry.deps.length === 0
        )

        const revisionRow = this.#prepareStatement(
          `SELECT revision FROM cache_entries WHERE node_key = ?`
        ).get(nodeKey) as { revision?: unknown } | undefined
        const revision = getPersistedRevision(revisionRow?.revision)

        this.#db.exec('COMMIT')
        try {
          await this.#maybePruneAfterWrite(now)
        } catch {}
        return {
          applied: true,
          revision: Number.isFinite(revision) ? revision : 0,
        }
      } catch (error) {
        if (transactionStarted) {
          try {
            this.#db.exec('ROLLBACK')
          } catch {}
        }

        if (
          attempt >= SQLITE_BUSY_RETRIES ||
          !isSqliteBusyOrLockedError(error)
        ) {
          throw error
        }

        await delay((attempt + 1) * SQLITE_BUSY_RETRY_DELAY_MS)
      }
    }

    throw new Error(
      '[renoun] Exhausted SQLITE busy retries for guarded cache write.'
    )
  }

  async delete(nodeKey: string): Promise<void> {
    await this.#readyPromise

    if (!this.#db) {
      return
    }

    this.#lastAccessTouchAtByNodeKey.delete(nodeKey)
    await this.#runWithBusyRetries(() => {
      this.#db.exec('BEGIN IMMEDIATE')
      try {
        this.#deleteRowsForNodeKeys([nodeKey])
        this.#db.exec('COMMIT')
      } catch (error) {
        try {
          this.#db.exec('ROLLBACK')
        } catch {}
        throw error
      }
    })
  }

  async deleteMany(nodeKeys: string[]): Promise<void> {
    await this.#readyPromise

    if (!this.#db || nodeKeys.length === 0) {
      return
    }

    const uniqueNodeKeys = Array.from(
      new Set(
        nodeKeys.filter((nodeKey): nodeKey is string => {
          return typeof nodeKey === 'string' && nodeKey.length > 0
        })
      )
    )

    if (uniqueNodeKeys.length === 0) {
      return
    }

    await this.#runWithBusyRetries(() => {
      this.#db.exec('BEGIN IMMEDIATE')
      try {
        this.#deleteRowsForNodeKeys(uniqueNodeKeys)
        this.#db.exec('COMMIT')
      } catch (error) {
        try {
          this.#db.exec('ROLLBACK')
        } catch {}
        throw error
      }
    })
  }

  async deleteByDependencyPath(
    dependencyPathKey: string
  ): Promise<CacheDependencyEvictionResult> {
    return this.deleteByDependencyPaths([dependencyPathKey])
  }

  async deleteByDependencyPaths(
    dependencyPathKeys: string[]
  ): Promise<CacheDependencyEvictionResult> {
    await this.#readyPromise

    if (!this.#db) {
      return {
        deletedNodeKeys: [],
        usedDependencyIndex: false,
        hasMissingDependencyMetadata: false,
        missingDependencyNodeKeys: [],
      }
    }

    const dependencyPathKeyVariants = new Set<string>()
    for (const dependencyPathKey of dependencyPathKeys) {
      if (typeof dependencyPathKey !== 'string' || dependencyPathKey.length === 0) {
        continue
      }

      for (const variantPathKey of getDependencyPathKeyVariants(
        dependencyPathKey
      )) {
        dependencyPathKeyVariants.add(variantPathKey)
      }
    }

    if (dependencyPathKeyVariants.size === 0) {
      return {
        deletedNodeKeys: [],
        usedDependencyIndex: false,
        hasMissingDependencyMetadata: false,
        missingDependencyNodeKeys: [],
      }
    }

    return this.#deleteByDependencyPathsUsingStructuredIndex(
      Array.from(dependencyPathKeyVariants).sort()
    )
  }

  async listNodeKeysByPrefix(prefix: string): Promise<string[]> {
    await this.#readyPromise

    if (!this.#db) {
      return []
    }

    const normalizedPrefix = String(prefix)
    const likePattern = `${escapeSqlLikePattern(normalizedPrefix)}%`
    const listNodeKeysByPrefixSql = `
      SELECT node_key
      FROM cache_entries
      WHERE node_key LIKE ? ESCAPE '\\'
      ORDER BY node_key
    `

    const rows = (await this.#runWithBusyRetries(() =>
      this.#prepareStatement(listNodeKeysByPrefixSql).all(likePattern)
    )) as Array<{ node_key?: string }>

    return rows
      .map((row) => row.node_key)
      .filter((nodeKey: string | undefined): nodeKey is string => {
        return typeof nodeKey === 'string'
      })
  }

  async #deleteByDependencyPathsUsingStructuredIndex(
    dependencyPathKeys: string[]
  ): Promise<CacheDependencyEvictionResult> {
    if (!this.#db || dependencyPathKeys.length === 0) {
      return {
        deletedNodeKeys: [],
        usedDependencyIndex: false,
        hasMissingDependencyMetadata: false,
        missingDependencyNodeKeys: [],
      }
    }

    const deletedNodeKeys = await this.#selectNodeKeysByStructuredDependencyPaths(
      dependencyPathKeys
    )

    if (deletedNodeKeys.length > 0) {
      await this.#runWithBusyRetries(() => {
        this.#db.exec('BEGIN IMMEDIATE')
        try {
          this.#deleteRowsForNodeKeys(deletedNodeKeys)
          this.#db.exec('COMMIT')
        } catch (error) {
          try {
            this.#db.exec('ROLLBACK')
          } catch {}
          throw error
        }
      })
    }

    const hasMissingDependencyMetadata = await this.#runWithBusyRetries(() => {
      return this.#getMissingDependencyMetadataCount() > 0
    })
    const missingDependencyNodeKeys = hasMissingDependencyMetadata
      ? await this.#listMissingDependencyNodeKeys()
      : []
    const invalidationSeq = await this.#runWithBusyRetries(() =>
      this.#nextInvalidationSequence()
    )

    return {
      deletedNodeKeys,
      usedDependencyIndex: true,
      hasMissingDependencyMetadata,
      missingDependencyNodeKeys,
      invalidationSeq,
      invalidationMode: 'structured',
    }
  }

  async #selectNodeKeysByStructuredDependencyPaths(
    dependencyPathKeys: string[]
  ): Promise<string[]> {
    if (!this.#db || dependencyPathKeys.length === 0) {
      return []
    }

    const normalizedChangedPathKeys = Array.from(
      new Set(
        dependencyPathKeys
          .map((pathKey) => normalizeAbsolutePathKey(pathKey))
          .filter((pathKey) => pathKey.length > 0)
      )
    ).sort()
    if (normalizedChangedPathKeys.length === 0) {
      return []
    }

    const lookupPathKeys =
      this.#expandStructuredDependencyLookupPathKeys(normalizedChangedPathKeys)
    if (lookupPathKeys.length === 0) {
      return []
    }

    const changedPathPlaceholders = normalizedChangedPathKeys
      .map(() => '?')
      .join(',')
    const lookupPathPlaceholders = lookupPathKeys.map(() => '?').join(',')
    const selectNodeKeysSql = `
      WITH changed_paths AS (
        SELECT path.path_id as path_id
        FROM dep_paths AS path
        WHERE path.path_key IN (${changedPathPlaceholders})
      ),
      expanded_changed_paths AS (
        SELECT path.path_id as path_id
        FROM dep_paths AS path
        WHERE path.path_key IN (${lookupPathPlaceholders})
      ),
      descendant_paths AS (
        SELECT DISTINCT closure.descendant_path_id as path_id
        FROM dep_path_closure AS closure
        JOIN changed_paths AS changed
          ON changed.path_id = closure.ancestor_path_id
      ),
      ancestor_paths AS (
        SELECT DISTINCT closure.ancestor_path_id as path_id
        FROM dep_path_closure AS closure
        JOIN expanded_changed_paths AS changed
          ON changed.path_id = closure.descendant_path_id
      ),
      matched_terms AS (
        SELECT term.dep_term_id as dep_term_id
        FROM dep_terms AS term
        WHERE term.path_id IS NOT NULL
          AND (
            (
              term.dep_kind = ${STRUCTURED_DEP_KIND_FILE}
              AND term.path_id IN (SELECT path_id FROM descendant_paths)
            )
            OR (
              term.dep_kind IN (${STRUCTURED_DEP_KIND_DIR}, ${STRUCTURED_DEP_KIND_DIR_MTIME})
              AND (
                term.path_id IN (SELECT path_id FROM descendant_paths)
                OR term.path_id IN (SELECT path_id FROM ancestor_paths)
              )
            )
          )
      )
      SELECT DISTINCT deps.node_key as node_key
      FROM cache_entry_deps_v2 AS deps
      JOIN matched_terms AS term
        ON term.dep_term_id = deps.dep_term_id
      ORDER BY deps.node_key
    `

    const rows = (await this.#runWithBusyRetries(() =>
      this.#prepareStatement(selectNodeKeysSql).all(
        ...normalizedChangedPathKeys,
        ...lookupPathKeys
      )
    )) as Array<{ node_key?: string }>

    return rows
      .map((row) => row.node_key)
      .filter((nodeKey: string | undefined): nodeKey is string => {
        return typeof nodeKey === 'string'
      })
  }

  #expandStructuredDependencyLookupPathKeys(pathKeys: string[]): string[] {
    const lookupPathKeys = new Set<string>()

    for (const pathKey of pathKeys) {
      if (pathKey.length === 0) {
        continue
      }

      lookupPathKeys.add(pathKey)

      if (pathKey === '.' || pathKey === '/') {
        continue
      }

      for (const ancestorPathKey of getAncestorPathKeys(pathKey)) {
        if (ancestorPathKey === '.' || ancestorPathKey === '/') {
          continue
        }
        lookupPathKeys.add(ancestorPathKey)
      }
    }

    return Array.from(lookupPathKeys).sort()
  }

  #nextInvalidationSequence(): number {
    if (!this.#db) {
      return 0
    }

    this.#prepareStatement(
      `
        INSERT INTO meta(key, value)
        VALUES (?, '0')
        ON CONFLICT(key) DO NOTHING
      `
    ).run(INVALIDATION_SEQUENCE_META_KEY)
    this.#prepareStatement(
      `
        UPDATE meta
        SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)
        WHERE key = ?
      `
    ).run(INVALIDATION_SEQUENCE_META_KEY)
    const row = this.#prepareStatement(
      `SELECT value FROM meta WHERE key = ?`
    ).get(INVALIDATION_SEQUENCE_META_KEY) as { value?: unknown } | undefined
    const sequence = Number.parseInt(String(row?.value ?? '0'), 10)
    if (!Number.isFinite(sequence) || sequence <= 0) {
      return 0
    }

    return sequence
  }

  #replaceDependenciesForNodeKey(
    nodeKey: string,
    dependencies: CacheEntry['deps']
  ): void {
    if (!this.#db) {
      return
    }

    this.#replaceStructuredDependenciesForNodeKey(nodeKey, dependencies)
  }

  #replaceStructuredDependenciesForNodeKey(
    nodeKey: string,
    dependencies: CacheEntry['deps']
  ): void {
    if (!this.#db) {
      return
    }

    this.#prepareStatement(`DELETE FROM cache_entry_deps_v2 WHERE node_key = ?`).run(
      nodeKey
    )

    if (dependencies.length === 0) {
      return
    }

    const dedupedDependencies = new Map<string, string>()
    for (const dependency of dependencies) {
      if (
        typeof dependency.depKey !== 'string' ||
        dependency.depKey.length === 0
      ) {
        continue
      }
      dedupedDependencies.set(
        dependency.depKey,
        typeof dependency.depVersion === 'string' ? dependency.depVersion : ''
      )
    }

    if (dedupedDependencies.size === 0) {
      return
    }

    const insertStructuredDependency = this.#prepareStatement(
      `
        INSERT INTO cache_entry_deps_v2 (node_key, dep_key, dep_term_id, dep_version)
        VALUES (?, ?, ?, ?)
      `
    )

    for (const [depKey, depVersion] of dedupedDependencies) {
      const parsedPathTerm = this.#parseStructuredPathDependencyTerm(depKey)
      let depTermId: number | null = null

      if (parsedPathTerm) {
        const pathId = this.#ensurePathClosureForPath(parsedPathTerm.pathKey)
        if (Number.isFinite(pathId) && pathId > 0) {
          const resolvedDepTermId = this.#getOrCreateDepTermId(
            parsedPathTerm.kind,
            pathId,
            parsedPathTerm.pathKey
          )
          if (Number.isFinite(resolvedDepTermId) && resolvedDepTermId > 0) {
            depTermId = resolvedDepTermId
          }
        }
      }

      insertStructuredDependency.run(nodeKey, depKey, depTermId, depVersion)
    }
  }

  #parseStructuredPathDependencyTerm(
    depKey: string
  ): StructuredPathDependencyTerm | undefined {
    const parsePathDependency = (
      pathDependency: string
    ): StructuredPathDependencyTerm | undefined => {
      if (pathDependency.startsWith('file:')) {
        return {
          kind: STRUCTURED_DEP_KIND_FILE,
          pathKey: normalizeAbsolutePathKey(pathDependency.slice('file:'.length)),
        }
      }

      if (pathDependency.startsWith('dir:')) {
        return {
          kind: STRUCTURED_DEP_KIND_DIR,
          pathKey: normalizeAbsolutePathKey(pathDependency.slice('dir:'.length)),
        }
      }

      if (pathDependency.startsWith('dir-mtime:')) {
        return {
          kind: STRUCTURED_DEP_KIND_DIR_MTIME,
          pathKey: normalizeAbsolutePathKey(
            pathDependency.slice('dir-mtime:'.length)
          ),
        }
      }

      return undefined
    }

    if (depKey.startsWith(DIRECTORY_SNAPSHOT_DEP_INDEX_PREFIX)) {
      const payload = depKey.slice(DIRECTORY_SNAPSHOT_DEP_INDEX_PREFIX.length)
      const versionSeparatorIndex = payload.lastIndexOf(':')
      if (versionSeparatorIndex <= 0) {
        return undefined
      }
      return parsePathDependency(payload.slice(0, versionSeparatorIndex))
    }

    return parsePathDependency(depKey)
  }

  #ensurePathClosureForPath(pathKey: string): number {
    if (!this.#db) {
      return 0
    }

    const normalizedPath = normalizeAbsolutePathKey(pathKey)
    const normalizedPathId = this.#getOrCreatePathId(normalizedPath)
    if (!Number.isFinite(normalizedPathId) || normalizedPathId <= 0) {
      return 0
    }

    if (
      this.#structuredIdCacheEnabled &&
      this.#seededPathClosureByPathKey.has(normalizedPath)
    ) {
      return normalizedPathId
    }

    const lineage = [...getAncestorPathKeys(normalizedPath), normalizedPath]
    const uniqueLineage = Array.from(new Set(lineage))
    const pathIdByPathKey = new Map<string, number>()

    for (const lineagePathKey of uniqueLineage) {
      const lineagePathId = this.#getOrCreatePathId(lineagePathKey)
      pathIdByPathKey.set(lineagePathKey, lineagePathId)
    }

    const upsertClosure = this.#prepareStatement(
      `
        INSERT INTO dep_path_closure (descendant_path_id, ancestor_path_id, depth)
        VALUES (?, ?, ?)
        ON CONFLICT(descendant_path_id, ancestor_path_id) DO UPDATE
        SET depth = excluded.depth
      `
    )

    for (let descendantIndex = 0; descendantIndex < uniqueLineage.length; descendantIndex += 1) {
      const descendantPathKey = uniqueLineage[descendantIndex]
      const descendantPathId = pathIdByPathKey.get(descendantPathKey)
      if (!descendantPathId) {
        continue
      }

      for (let ancestorIndex = 0; ancestorIndex <= descendantIndex; ancestorIndex += 1) {
        const ancestorPathKey = uniqueLineage[ancestorIndex]
        const ancestorPathId = pathIdByPathKey.get(ancestorPathKey)
        if (!ancestorPathId) {
          continue
        }

        upsertClosure.run(
          descendantPathId,
          ancestorPathId,
          descendantIndex - ancestorIndex
        )
      }
    }

    if (this.#structuredIdCacheEnabled) {
      for (const lineagePathKey of uniqueLineage) {
        this.#markPathClosureSeeded(lineagePathKey)
      }
    }

    return pathIdByPathKey.get(normalizedPath) ?? normalizedPathId
  }

  #getOrCreatePathId(pathKey: string): number {
    if (!this.#db) {
      return 0
    }

    const normalizedPathKey = normalizeAbsolutePathKey(pathKey)
    if (this.#structuredIdCacheEnabled) {
      const cachedPathId = this.#pathIdByPathKey.get(normalizedPathKey)
      if (typeof cachedPathId === 'number' && Number.isFinite(cachedPathId)) {
        return cachedPathId
      }
    }

    this.#prepareStatement(
      `
        INSERT INTO dep_paths (path_key)
        VALUES (?)
        ON CONFLICT(path_key) DO NOTHING
      `
    ).run(normalizedPathKey)
    const row = this.#prepareStatement(
      `SELECT path_id FROM dep_paths WHERE path_key = ?`
    ).get(normalizedPathKey) as { path_id?: unknown } | undefined
    const pathId = Number(row?.path_id ?? 0)
    if (!Number.isFinite(pathId) || pathId <= 0) {
      return 0
    }

    if (this.#structuredIdCacheEnabled) {
      this.#setCachedPathId(normalizedPathKey, pathId)
    }
    return pathId
  }

  #getOrCreateDepTermId(
    depKind: StructuredPathDependencyTerm['kind'],
    pathId: number,
    pathKey: string
  ): number {
    if (!this.#db) {
      return 0
    }

    const termKey = `${depKind}:${pathKey}`
    if (this.#structuredIdCacheEnabled) {
      const cachedDepTermId = this.#depTermIdByTermKey.get(termKey)
      if (
        typeof cachedDepTermId === 'number' &&
        Number.isFinite(cachedDepTermId) &&
        cachedDepTermId > 0
      ) {
        return cachedDepTermId
      }
    }

    this.#prepareStatement(
      `
        INSERT INTO dep_terms (dep_kind, path_id, term_key)
        VALUES (?, ?, ?)
        ON CONFLICT(term_key) DO UPDATE SET
          dep_kind = excluded.dep_kind,
          path_id = excluded.path_id
      `
    ).run(depKind, pathId, termKey)
    const row = this.#prepareStatement(
      `SELECT dep_term_id FROM dep_terms WHERE term_key = ?`
    ).get(termKey) as { dep_term_id?: unknown } | undefined
    const depTermId = Number(row?.dep_term_id ?? 0)
    if (!Number.isFinite(depTermId) || depTermId <= 0) {
      return 0
    }

    if (this.#structuredIdCacheEnabled) {
      this.#setCachedDepTermId(termKey, depTermId)
    }
    return depTermId
  }

  async #listMissingDependencyNodeKeys(): Promise<string[]> {
    if (!this.#db) {
      return []
    }

    const listMissingDependencyNodeKeysSql = `
      SELECT entry.node_key as node_key
      FROM cache_entries AS entry
      WHERE NOT EXISTS (
        SELECT 1
        FROM cache_entry_deps_v2 AS dependency
        WHERE dependency.node_key = entry.node_key
      )
      ORDER BY entry.node_key
    `

    const rows = (await this.#runWithBusyRetries(() =>
      this.#prepareStatement(listMissingDependencyNodeKeysSql).all()
    )) as Array<{ node_key?: string }>

    return rows
      .map((row) => row.node_key)
      .filter((nodeKey: string | undefined): nodeKey is string => {
        return typeof nodeKey === 'string'
      })
  }

  async #initialize(): Promise<void> {
    for (let attempt = 0; attempt <= SQLITE_INIT_BUSY_RETRIES; attempt += 1) {
      let database: any

      try {
        await mkdir(dirname(this.#dbPath), { recursive: true })

        const sqliteModule = (await loadSqliteModule()) as {
          DatabaseSync?: new (path: string) => any
        }
        const DatabaseSync = sqliteModule.DatabaseSync

        if (!DatabaseSync) {
          throw new Error('node:sqlite DatabaseSync is unavailable')
        }

        database = new DatabaseSync(this.#dbPath)
        database.exec(`PRAGMA journal_mode = WAL`)
        database.exec(`PRAGMA synchronous = NORMAL`)
        database.exec(`PRAGMA busy_timeout = 5000`)
        database.exec(`PRAGMA foreign_keys = ON`)
        database.exec(
          `
            CREATE TABLE IF NOT EXISTS meta (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            )
          `
        )

        const schemaRow = database
          .prepare(`SELECT value FROM meta WHERE key = ?`)
          .get('cache_schema_version') as { value?: string } | undefined
        const currentSchemaVersion = schemaRow?.value
          ? Number(schemaRow.value)
          : undefined

        if (currentSchemaVersion !== this.#schemaVersion) {
          database.exec(`DROP TABLE IF EXISTS cache_entry_deps_v2`)
          database.exec(`DROP TABLE IF EXISTS dep_terms`)
          database.exec(`DROP TABLE IF EXISTS dep_path_closure`)
          database.exec(`DROP TABLE IF EXISTS dep_paths`)
          database.exec(`DROP TABLE IF EXISTS cache_deps`)
          database.exec(`DROP TABLE IF EXISTS cache_entries`)
          database.exec(`DROP TABLE IF EXISTS cache_inflight`)
        }

        this.#createCacheTables(database)

        if (currentSchemaVersion !== this.#schemaVersion) {
          database.prepare(
            `
              INSERT INTO meta(key, value)
              VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `
          ).run('cache_schema_version', String(this.#schemaVersion))
        }
        this.#initializeMissingDependencyMetadata(database)

        this.#clearPreparedStatements()
        this.#clearStructuredDependencyCaches()
        this.#db = database
        this.#availability = 'available'
        await this.#runPruneWithRetries()
        return
      } catch (error) {
        this.#clearPreparedStatements()
        this.#clearStructuredDependencyCaches()
        this.#db = undefined

        if (database && typeof database.close === 'function') {
          try {
            database.close()
          } catch {}
        }

        if (
          attempt < SQLITE_INIT_BUSY_RETRIES &&
          isSqliteBusyOrLockedError(error)
        ) {
          const retryDelay = Math.min(
            SQLITE_INIT_BUSY_RETRY_MAX_DELAY_MS,
            (attempt + 1) * SQLITE_INIT_BUSY_RETRY_DELAY_MS
          )
          await delay(retryDelay)
          continue
        }

        this.#availability = 'unavailable'
        if (!warnedAboutSqliteFallback) {
          warnedAboutSqliteFallback = true
          // eslint-disable-next-line no-console
          console.error(
            '[renoun-debug] failed to initialize sqlite cache',
            this.#dbPath,
            error instanceof Error ? error.message : String(error)
          )
          console.warn(
            `[renoun] SQLite persistence is unavailable; renoun will continue with in-memory FileSystem cache only (persistent cache reuse and cross-worker cache coordination are disabled): ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        }

        return
      }
    }
  }

  #createCacheTables(database: any) {
    database.exec(
      `
        CREATE TABLE IF NOT EXISTS cache_entries (
          node_key TEXT PRIMARY KEY,
          fingerprint TEXT NOT NULL,
          value_blob BLOB NOT NULL,
          updated_at INTEGER NOT NULL,
          last_accessed_at INTEGER NOT NULL,
          persist INTEGER NOT NULL DEFAULT 0,
          workspace_change_token TEXT,
          revision INTEGER NOT NULL DEFAULT 0
        )
      `
    )
    database.exec(
      `CREATE INDEX IF NOT EXISTS cache_entries_updated_at_idx ON cache_entries(updated_at)`
    )
    database.exec(
      `CREATE INDEX IF NOT EXISTS cache_entries_last_accessed_at_idx ON cache_entries(last_accessed_at)`
    )
    database.exec(
      `
        CREATE TABLE IF NOT EXISTS dep_paths (
          path_id INTEGER PRIMARY KEY,
          path_key TEXT NOT NULL UNIQUE
        )
      `
    )
    database.exec(
      `
        CREATE TABLE IF NOT EXISTS dep_path_closure (
          descendant_path_id INTEGER NOT NULL,
          ancestor_path_id INTEGER NOT NULL,
          depth INTEGER NOT NULL,
          PRIMARY KEY (descendant_path_id, ancestor_path_id),
          FOREIGN KEY (descendant_path_id) REFERENCES dep_paths(path_id) ON DELETE CASCADE,
          FOREIGN KEY (ancestor_path_id) REFERENCES dep_paths(path_id) ON DELETE CASCADE
        )
      `
    )
    database.exec(
      `
        CREATE INDEX IF NOT EXISTS dep_path_closure_ancestor_idx
        ON dep_path_closure(ancestor_path_id, descendant_path_id)
      `
    )
    database.exec(
      `
        CREATE TABLE IF NOT EXISTS dep_terms (
          dep_term_id INTEGER PRIMARY KEY,
          dep_kind INTEGER NOT NULL,
          path_id INTEGER,
          term_key TEXT NOT NULL UNIQUE,
          FOREIGN KEY (path_id) REFERENCES dep_paths(path_id) ON DELETE CASCADE
        )
      `
    )
    database.exec(
      `
        CREATE INDEX IF NOT EXISTS dep_terms_kind_path_idx
        ON dep_terms(dep_kind, path_id)
      `
    )
    database.exec(
      `
        CREATE TABLE IF NOT EXISTS cache_entry_deps_v2 (
          node_key TEXT NOT NULL,
          dep_key TEXT NOT NULL,
          dep_term_id INTEGER,
          dep_version TEXT NOT NULL,
          PRIMARY KEY (node_key, dep_key),
          FOREIGN KEY (node_key) REFERENCES cache_entries(node_key) ON DELETE CASCADE,
          FOREIGN KEY (dep_term_id) REFERENCES dep_terms(dep_term_id) ON DELETE CASCADE
        )
      `
    )
    database.exec(
      `
        CREATE INDEX IF NOT EXISTS cache_entry_deps_v2_dep_term_node_key_idx
        ON cache_entry_deps_v2(dep_term_id, node_key)
      `
    )
    database.exec(
      `
        CREATE TABLE IF NOT EXISTS cache_inflight (
          node_key TEXT PRIMARY KEY,
          owner TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `
    )
    database.exec(
      `CREATE INDEX IF NOT EXISTS cache_inflight_expires_at_idx ON cache_inflight(expires_at)`
    )
  }

  #initializeMissingDependencyMetadata(database: any): void {
    const missingDependencyCountRow = database
      .prepare(
        `
          SELECT COUNT(*) as total
          FROM cache_entries AS entry
          WHERE NOT EXISTS (
            SELECT 1
            FROM cache_entry_deps_v2 AS dependency
            WHERE dependency.node_key = entry.node_key
          )
        `
      )
      .get() as { total?: unknown } | undefined
    const missingDependencyCount = Number(missingDependencyCountRow?.total ?? 0)
    const normalizedMissingDependencyCount = Number.isFinite(
      missingDependencyCount
    )
      ? Math.max(0, Math.floor(missingDependencyCount))
      : 0

    database
      .prepare(
        `
          INSERT INTO meta(key, value)
          VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `
      )
      .run(
        MISSING_DEPENDENCY_ENTRY_COUNT_META_KEY,
        String(normalizedMissingDependencyCount)
      )

    database
      .prepare(
        `
          INSERT INTO meta(key, value)
          VALUES (?, '0')
          ON CONFLICT(key) DO NOTHING
        `
      )
      .run(INVALIDATION_SEQUENCE_META_KEY)
  }

  async #maybePruneAfterWrite(
    now: number,
    options: { skipWriteCount?: boolean; force?: boolean } = {}
  ): Promise<void> {
    if (!this.#db) {
      return
    }

    if (!options.skipWriteCount) {
      this.#writesSincePrune += 1
    }
    const shouldCheckOverflow =
      options.force || this.#writesSincePrune >= this.#overflowCheckInterval
    const shouldPruneForAgeWindow =
      now - this.#lastPrunedAt >= SQLITE_PRUNE_MAX_INTERVAL_MS

    if (!shouldCheckOverflow && !shouldPruneForAgeWindow) {
      return
    }

    this.#writesSincePrune = 0

    let shouldPrune = shouldPruneForAgeWindow

    if (!shouldPrune) {
      const countRow = this.#prepareStatement(
        `SELECT COUNT(*) as total FROM cache_entries`
      ).get() as { total?: number }
      const totalRows = Number(countRow?.total ?? 0)
      shouldPrune = totalRows > this.#maxRows
    }

    if (!shouldPrune) {
      return
    }

    if (this.#pruneInFlight) {
      await this.#pruneInFlight
      await this.#maybePruneAfterWrite(Date.now(), {
        skipWriteCount: true,
        force: true,
      })
      return
    }

    const pruneOperation = this.#runPruneWithRetries()
    this.#pruneInFlight = pruneOperation

    try {
      await pruneOperation
    } finally {
      if (this.#pruneInFlight === pruneOperation) {
        this.#pruneInFlight = undefined
      }
    }
  }

  async #runPruneWithRetries() {
    for (let attempt = 0; attempt <= SQLITE_BUSY_RETRIES; attempt += 1) {
      try {
        await this.#pruneStaleEntries()
        this.#lastPrunedAt = Date.now()
        return
      } catch (error) {
        if (
          attempt >= SQLITE_BUSY_RETRIES ||
          !isSqliteBusyOrLockedError(error)
        ) {
          throw error
        }

        await delay((attempt + 1) * SQLITE_BUSY_RETRY_DELAY_MS)
      }
    }
  }

  async #touchLastAccessed(nodeKey: string): Promise<void> {
    if (!this.#db) {
      return
    }

    const now = Date.now()
    const lastTouchedAt = this.#lastAccessTouchAtByNodeKey.get(nodeKey)
    if (
      typeof lastTouchedAt === 'number' &&
      now - lastTouchedAt < SQLITE_LAST_ACCESSED_TOUCH_MIN_INTERVAL_MS
    ) {
      return
    }

    await this.#runWithBusyRetries(() => {
      this
        .#prepareStatement(
          `
            UPDATE cache_entries
            SET last_accessed_at = CASE
              WHEN last_accessed_at >= ? THEN last_accessed_at + 1
              ELSE ?
            END
            WHERE node_key = ?
          `
        )
        .run(now, now, nodeKey)
    })
    this.#recordLastAccessTouch(nodeKey, now)
  }

  #recordLastAccessTouch(nodeKey: string, touchedAt: number): void {
    if (this.#lastAccessTouchAtByNodeKey.has(nodeKey)) {
      this.#lastAccessTouchAtByNodeKey.delete(nodeKey)
    }
    this.#lastAccessTouchAtByNodeKey.set(nodeKey, touchedAt)
    this.#pruneLastAccessTouchCache(touchedAt)
  }

  #pruneLastAccessTouchCache(now: number): void {
    if (
      this.#lastAccessTouchAtByNodeKey.size <=
      SQLITE_LAST_ACCESSED_TOUCH_CACHE_MAX_SIZE
    ) {
      return
    }

    const staleBefore = now - SQLITE_LAST_ACCESSED_TOUCH_MIN_INTERVAL_MS * 4
    for (const [nodeKey, touchedAt] of this.#lastAccessTouchAtByNodeKey) {
      if (
        this.#lastAccessTouchAtByNodeKey.size <=
        SQLITE_LAST_ACCESSED_TOUCH_CACHE_MAX_SIZE
      ) {
        break
      }

      if (touchedAt < staleBefore) {
        this.#lastAccessTouchAtByNodeKey.delete(nodeKey)
      }
    }

    while (
      this.#lastAccessTouchAtByNodeKey.size >
      SQLITE_LAST_ACCESSED_TOUCH_CACHE_MAX_SIZE
    ) {
      const oldestKey = this.#lastAccessTouchAtByNodeKey.keys().next().value
      if (typeof oldestKey !== 'string') {
        break
      }
      this.#lastAccessTouchAtByNodeKey.delete(oldestKey)
    }
  }

  #clearStructuredDependencyCaches(): void {
    this.#pathIdByPathKey.clear()
    this.#depTermIdByTermKey.clear()
    this.#seededPathClosureByPathKey.clear()
  }

  #setCachedPathId(pathKey: string, pathId: number): void {
    if (!Number.isFinite(pathId) || pathId <= 0) {
      return
    }

    if (this.#pathIdByPathKey.has(pathKey)) {
      this.#pathIdByPathKey.delete(pathKey)
    }
    this.#pathIdByPathKey.set(pathKey, pathId)

    while (
      this.#pathIdByPathKey.size > SQLITE_STRUCTURED_PATH_ID_CACHE_MAX_SIZE
    ) {
      const oldestPathKey = this.#pathIdByPathKey.keys().next().value
      if (typeof oldestPathKey !== 'string') {
        break
      }
      this.#pathIdByPathKey.delete(oldestPathKey)
    }
  }

  #setCachedDepTermId(termKey: string, depTermId: number): void {
    if (!Number.isFinite(depTermId) || depTermId <= 0) {
      return
    }

    if (this.#depTermIdByTermKey.has(termKey)) {
      this.#depTermIdByTermKey.delete(termKey)
    }
    this.#depTermIdByTermKey.set(termKey, depTermId)

    while (
      this.#depTermIdByTermKey.size >
      SQLITE_STRUCTURED_DEP_TERM_ID_CACHE_MAX_SIZE
    ) {
      const oldestTermKey = this.#depTermIdByTermKey.keys().next().value
      if (typeof oldestTermKey !== 'string') {
        break
      }
      this.#depTermIdByTermKey.delete(oldestTermKey)
    }
  }

  #markPathClosureSeeded(pathKey: string): void {
    this.#seededPathClosureByPathKey.add(pathKey)
    while (
      this.#seededPathClosureByPathKey.size >
      SQLITE_STRUCTURED_PATH_CLOSURE_SEEDED_CACHE_MAX_SIZE
    ) {
      const oldestPathKey = this.#seededPathClosureByPathKey.values().next()
      if (typeof oldestPathKey.value !== 'string') {
        break
      }
      this.#seededPathClosureByPathKey.delete(oldestPathKey.value)
    }
  }

  async #runWithBusyRetries<T>(operation: () => T): Promise<T> {
    for (let attempt = 0; attempt <= SQLITE_BUSY_RETRIES; attempt += 1) {
      try {
        return operation()
      } catch (error) {
        if (
          attempt >= SQLITE_BUSY_RETRIES ||
          !isSqliteBusyOrLockedError(error)
        ) {
          throw error
        }

        await delay((attempt + 1) * SQLITE_BUSY_RETRY_DELAY_MS)
      }
    }

    throw new Error('[renoun] Exhausted SQLite busy retries.')
  }

  #cleanupExpiredComputeSlots(
    now: number,
    options: { force?: boolean } = {}
  ): void {
    if (!this.#db) {
      return
    }

    if (
      !options.force &&
      now - this.#lastInflightCleanupAt < SQLITE_INFLIGHT_CLEANUP_INTERVAL_MS
    ) {
      return
    }

    this.#prepareStatement(`DELETE FROM cache_inflight WHERE expires_at <= ?`).run(
      now
    )
    this.#lastInflightCleanupAt = now
  }

  async #pruneStaleEntries() {
    if (!this.#db) {
      return
    }

    const pruneStartedAt = Date.now()
    const staleBefore = pruneStartedAt - this.#maxAgeMs

    this.#db.exec('BEGIN IMMEDIATE')
    try {
      const staleNodes = this
        .#prepareStatement(
          `
            SELECT node_key
            FROM cache_entries
            WHERE last_accessed_at < ?
          `
        )
        .all(staleBefore) as Array<{ node_key?: string }>
      const staleNodeKeys = staleNodes
        .map((row) => row.node_key)
        .filter((nodeKey: string | undefined): nodeKey is string => {
          return typeof nodeKey === 'string'
        })
      const staleCount = staleNodeKeys.length

      if (staleCount > 0) {
        this.#deleteRowsForNodeKeys(staleNodeKeys)
      }

      const countRow = this.#prepareStatement(
        `SELECT COUNT(*) as total FROM cache_entries`
      ).get() as { total?: number }
      const totalRows = Number(countRow?.total ?? 0)
      const overflow = totalRows - this.#maxRows

      if (overflow > 0) {
        const overflowRows = this
          .#prepareStatement(
            `
              SELECT node_key
              FROM cache_entries
              ORDER BY last_accessed_at ASC, updated_at ASC, node_key ASC
              LIMIT ?
            `
          )
          .all(overflow) as Array<{ node_key?: string }>

        const victimNodeKeys = overflowRows
          .map((row) => row.node_key)
          .filter((nodeKey: string | undefined): nodeKey is string => {
            return typeof nodeKey === 'string'
          })

        this.#deleteRowsForNodeKeys(victimNodeKeys)
      }

      this.#deleteInflightRowsForNodeKeys(
        this
          .#prepareStatement(
            `
              SELECT node_key
              FROM cache_inflight
              WHERE expires_at <= ?
            `
          )
          .all(pruneStartedAt)
          .map((row: { node_key?: string }) => row.node_key)
          .filter((nodeKey: string | undefined): nodeKey is string => {
            return typeof nodeKey === 'string'
          })
      )

      this.#compactStructuredDependencyTables()

      this.#db.exec('COMMIT')
    } catch (error) {
      try {
        this.#db.exec('ROLLBACK')
      } catch {}
      throw error
    }
  }

  #compactStructuredDependencyTables(): void {
    if (!this.#db) {
      return
    }

    this.#prepareStatement(
      `
        DELETE FROM dep_terms
        WHERE dep_term_id NOT IN (
          SELECT DISTINCT dep_term_id
          FROM cache_entry_deps_v2
          WHERE dep_term_id IS NOT NULL
        )
      `
    ).run()

    this.#prepareStatement(
      `
        WITH active_term_paths AS (
          SELECT DISTINCT path_id
          FROM dep_terms
          WHERE path_id IS NOT NULL
        ),
        live_paths AS (
          SELECT path_id
          FROM active_term_paths
          UNION
          SELECT closure.ancestor_path_id as path_id
          FROM dep_path_closure AS closure
          JOIN active_term_paths AS term_path
            ON term_path.path_id = closure.descendant_path_id
          UNION
          SELECT closure.descendant_path_id as path_id
          FROM dep_path_closure AS closure
          JOIN active_term_paths AS term_path
            ON term_path.path_id = closure.ancestor_path_id
        )
        DELETE FROM dep_path_closure
        WHERE descendant_path_id NOT IN (SELECT path_id FROM live_paths)
          OR ancestor_path_id NOT IN (SELECT path_id FROM live_paths)
      `
    ).run()

    this.#prepareStatement(
      `
        WITH active_term_paths AS (
          SELECT DISTINCT path_id
          FROM dep_terms
          WHERE path_id IS NOT NULL
        ),
        live_paths AS (
          SELECT path_id
          FROM active_term_paths
          UNION
          SELECT closure.ancestor_path_id as path_id
          FROM dep_path_closure AS closure
          JOIN active_term_paths AS term_path
            ON term_path.path_id = closure.descendant_path_id
          UNION
          SELECT closure.descendant_path_id as path_id
          FROM dep_path_closure AS closure
          JOIN active_term_paths AS term_path
            ON term_path.path_id = closure.ancestor_path_id
        )
        DELETE FROM dep_paths
        WHERE path_id NOT IN (SELECT path_id FROM live_paths)
      `
    ).run()

    this.#clearStructuredDependencyCaches()
  }

  close() {
    const database = this.#db
    this.#pruneInFlight = undefined
    this.#lastAccessTouchAtByNodeKey.clear()
    this.#clearStructuredDependencyCaches()
    this.#clearPreparedStatements()
    this.#db = undefined
    this.#availability = 'unavailable'

    if (database && typeof database.close === 'function') {
      database.close()
    }
  }

  #shouldDebugCachePersistenceLoadFailure(nodeKey: string): boolean {
    if (!this.#debugCachePersistence) {
      return false
    }

    return (
      nodeKey.startsWith('js.exports:') || nodeKey.startsWith('mdx.sections:')
    )
  }

  #prepareStatement(sql: string): any {
    if (!this.#db) {
      throw new Error(
        '[renoun] SQLite prepare attempted after database initialization failed.'
      )
    }

    const cached = this.#preparedStatements.get(sql)
    if (cached) {
      this.#preparedStatements.delete(sql)
      this.#preparedStatements.set(sql, cached)
      return cached
    }

    const prepared = this.#db.prepare(sql)
    this.#preparedStatements.set(sql, prepared)
    while (this.#preparedStatements.size > this.#preparedStatementCacheMax) {
      const oldestSql = this.#preparedStatements.keys().next().value
      if (typeof oldestSql !== 'string') {
        break
      }
      const evicted = this.#preparedStatements.get(oldestSql)
      this.#preparedStatements.delete(oldestSql)
      this.#disposePreparedStatement(evicted)
    }
    return prepared
  }

  #clearPreparedStatements(): void {
    for (const preparedStatement of this.#preparedStatements.values()) {
      this.#disposePreparedStatement(preparedStatement)
    }
    this.#preparedStatements.clear()
  }

  #disposePreparedStatement(preparedStatement: any): void {
    if (
      preparedStatement &&
      typeof preparedStatement.finalize === 'function'
    ) {
      try {
        preparedStatement.finalize()
      } catch {}
    }
  }

  #isNodeKeyMissingDependencyMetadata(nodeKey: string): boolean {
    if (!this.#db) {
      return false
    }

    const row = this.#prepareStatement(
      `
        SELECT EXISTS(
          SELECT 1
          FROM cache_entries AS entry
          WHERE entry.node_key = ?
            AND NOT EXISTS (
              SELECT 1
              FROM cache_entry_deps_v2 AS dependency
              WHERE dependency.node_key = entry.node_key
            )
        ) as is_missing
      `
    ).get(nodeKey) as { is_missing?: unknown } | undefined

    return Number(row?.is_missing ?? 0) > 0
  }

  #getMissingDependencyMetadataCount(): number {
    if (!this.#db) {
      return 0
    }

    const row = this.#prepareStatement(`SELECT value FROM meta WHERE key = ?`).get(
      MISSING_DEPENDENCY_ENTRY_COUNT_META_KEY
    ) as { value?: unknown } | undefined
    const numericValue = Number.parseInt(String(row?.value ?? '0'), 10)
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return 0
    }

    return numericValue
  }

  #applyMissingDependencyMetadataTransition(
    previousMissingMetadata: boolean,
    nextMissingMetadata: boolean
  ): void {
    if (previousMissingMetadata === nextMissingMetadata) {
      return
    }

    this.#adjustMissingDependencyMetadataCount(nextMissingMetadata ? 1 : -1)
  }

  #adjustMissingDependencyMetadataCount(delta: number): void {
    if (!this.#db || delta === 0) {
      return
    }

    this.#prepareStatement(
      `
        INSERT INTO meta(key, value)
        VALUES (?, '0')
        ON CONFLICT(key) DO NOTHING
      `
    ).run(MISSING_DEPENDENCY_ENTRY_COUNT_META_KEY)
    this.#prepareStatement(
      `
        UPDATE meta
        SET value = CAST(MAX(0, CAST(value AS INTEGER) + ?) AS TEXT)
        WHERE key = ?
      `
    ).run(delta, MISSING_DEPENDENCY_ENTRY_COUNT_META_KEY)
  }

  #countMissingDependencyEntriesForNodeKeys(nodeKeys: string[]): number {
    if (!this.#db || nodeKeys.length === 0) {
      return 0
    }

    const placeholders = nodeKeys.map(() => '?').join(',')
    const row = this.#prepareStatement(
      `
        SELECT COUNT(*) as total
        FROM cache_entries AS entry
        WHERE entry.node_key IN (${placeholders})
          AND NOT EXISTS (
            SELECT 1
            FROM cache_entry_deps_v2 AS dependency
            WHERE dependency.node_key = entry.node_key
          )
      `
    ).get(...nodeKeys) as { total?: unknown } | undefined
    const count = Number(row?.total ?? 0)
    if (!Number.isFinite(count) || count <= 0) {
      return 0
    }

    return Math.floor(count)
  }

  #deleteRowsForNodeKeys(nodeKeys: string[]) {
    if (!this.#db || nodeKeys.length === 0) {
      return
    }

    const uniqueNodeKeys = Array.from(new Set(nodeKeys)).sort()
    for (const nodeKey of uniqueNodeKeys) {
      this.#lastAccessTouchAtByNodeKey.delete(nodeKey)
    }

    for (
      let offset = 0;
      offset < uniqueNodeKeys.length;
      offset += SQLITE_DELETE_BATCH_SIZE
    ) {
      const batch = uniqueNodeKeys.slice(
        offset,
        offset + SQLITE_DELETE_BATCH_SIZE
      )
      if (batch.length === 0) {
        continue
      }

      const placeholders = batch.map(() => '?').join(',')
      const missingDependencyCountForBatch =
        this.#countMissingDependencyEntriesForNodeKeys(batch)
      const deleteStructuredDepsSql = `DELETE FROM cache_entry_deps_v2 WHERE node_key IN (${placeholders})`
      const deleteEntriesSql = `DELETE FROM cache_entries WHERE node_key IN (${placeholders})`
      this.#prepareStatement(deleteStructuredDepsSql).run(...batch)
      this.#prepareStatement(deleteEntriesSql).run(...batch)
      this.#adjustMissingDependencyMetadataCount(-missingDependencyCountForBatch)
    }
  }

  #deleteInflightRowsForNodeKeys(nodeKeys: string[]) {
    if (!this.#db || nodeKeys.length === 0) {
      return
    }

    const uniqueNodeKeys = Array.from(new Set(nodeKeys)).sort()

    for (
      let offset = 0;
      offset < uniqueNodeKeys.length;
      offset += SQLITE_DELETE_BATCH_SIZE
    ) {
      const batch = uniqueNodeKeys.slice(
        offset,
        offset + SQLITE_DELETE_BATCH_SIZE
      )
      if (batch.length === 0) {
        continue
      }

      const placeholders = batch.map(() => '?').join(',')
      const deleteInflightSql = `DELETE FROM cache_inflight WHERE node_key IN (${placeholders})`
      this.#prepareStatement(deleteInflightSql).run(...batch)
    }
  }
}

function escapeSqlLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

function normalizeAbsolutePathKey(path: string): string {
  const normalizedPath = path.replaceAll('\\', '/')
  if (normalizedPath === '') {
    return '.'
  }

  if (
    normalizedPath.length >= 2 &&
    normalizedPath.charCodeAt(0) === 46 &&
    normalizedPath.charCodeAt(1) === 47
  ) {
    let start = 2
    while (
      start < normalizedPath.length &&
      normalizedPath.charCodeAt(start) === 47
    ) {
      start += 1
    }
    return trimTrailingSlashes(normalizedPath.slice(start))
  }

  return trimTrailingSlashes(normalizedPath)
}

function trimTrailingSlashes(path: string): string {
  let end = path.length
  while (end > 1 && path.charCodeAt(end - 1) === 47) {
    end -= 1
  }
  const trimmed = path.slice(0, end)
  return trimmed === '' ? '.' : trimmed
}

function getDependencyPathKeyVariants(path: string): string[] {
  const keyVariants = new Set<string>()
  keyVariants.add(normalizePathKey(path))
  keyVariants.add(normalizeAbsolutePathKey(path))
  return Array.from(keyVariants).filter((value) => value.length > 0)
}

function getAncestorPathKeys(path: string): string[] {
  const normalizedPath = normalizeAbsolutePathKey(path)
  if (normalizedPath === '.') {
    return ['.']
  }

  const hasLeadingSlash = normalizedPath.startsWith('/')
  const withoutRoot = hasLeadingSlash ? normalizedPath.slice(1) : normalizedPath
  if (withoutRoot.length === 0) {
    return ['.']
  }

  const segments = withoutRoot.split('/')
  const ancestors = ['.']
  if (hasLeadingSlash) {
    ancestors.push('/')
  }

  for (let index = 0; index < segments.length - 1; index += 1) {
    const relativeAncestor = segments.slice(0, index + 1).join('/')
    const ancestor = hasLeadingSlash ? `/${relativeAncestor}` : relativeAncestor
    ancestors.push(ancestor)
  }

  return ancestors
}

function resolvePreparedStatementCacheMax(configuredValue?: number): number {
  if (
    typeof configuredValue === 'number' &&
    Number.isFinite(configuredValue) &&
    configuredValue > 0
  ) {
    return Math.floor(configuredValue)
  }

  return resolvePositiveIntegerProcessEnv(
    'RENOUN_SQLITE_PREPARED_STATEMENT_CACHE_MAX',
    SQLITE_DEFAULT_PREPARED_STATEMENT_CACHE_MAX
  )
}

function resolveStructuredIdCacheEnabled(configuredValue?: boolean): boolean {
  if (typeof configuredValue === 'boolean') {
    return configuredValue
  }

  return resolveBooleanProcessEnv('RENOUN_SQLITE_STRUCTURED_ID_CACHE', true, {
    allowYesNo: true,
  })
}

function toUint8Array(value: unknown): Uint8Array | undefined {
  if (!value) {
    return undefined
  }

  if (value instanceof Uint8Array) {
    return value
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }

  return undefined
}

function getPersistedFingerprint(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  if (value.length !== 40) {
    return undefined
  }

  if (!/^[0-9a-f]{40}$/.test(value)) {
    return undefined
  }

  return value
}

function getPersistedTimestamp(value: unknown): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : Number.NaN
}

function getPersistedRevision(value: unknown): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : Number.NaN
}

function logCachePersistenceLoadFailure(
  nodeKey: string,
  reason: string,
  details?: string
): void {
  const lines = [`reason=${reason}`]
  if (details) {
    lines.push(`details=${details}`)
  }

  // eslint-disable-next-line no-console
  console.warn(
    `[renoun-debug] cache persistence load failure for ${nodeKey} ${lines.join(' ')}`
  )
}

function containsStrippedReactElementPayload(
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): boolean {
  if (value === null || typeof value !== 'object') {
    return false
  }

  if (seen.has(value)) {
    return false
  }
  seen.add(value)

  if (looksLikeStrippedReactElement(value)) {
    return true
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsStrippedReactElementPayload(item, seen))
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    if (containsStrippedReactElementPayload(child, seen)) {
      return true
    }
  }

  return false
}

function looksLikeStrippedReactElement(value: object): boolean {
  const candidate = value as Record<string, unknown>

  const reactType = candidate['$$typeof']
  if (typeof reactType === 'symbol') {
    const reactTypeName = reactType.description ?? ''
    if (
      !(
        reactTypeName.endsWith('.element') ||
        reactTypeName === 'react.element' ||
        reactTypeName === 'react.portal'
      )
    ) {
      return false
    }
  } else if ('$$typeof' in candidate) {
    return false
  }

  if (
    !('key' in candidate) ||
    !('ref' in candidate) ||
    !('props' in candidate)
  ) {
    return false
  }

  const keys = Object.keys(candidate)
  if (keys.length < 3 || keys.length > 4) {
    return false
  }

  if (
    keys.some(
      (key) =>
        key !== 'key' && key !== 'ref' && key !== 'props' && key !== 'type'
    )
  ) {
    return false
  }

  const props = candidate['props']
  if (props === null || typeof props !== 'object' || Array.isArray(props)) {
    return false
  }

  if ('type' in candidate && typeof candidate['type'] !== 'string') {
    return false
  }

  return true
}

function isSqliteBusyOrLockedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const candidateError = error as {
    code?: number | string
    errno?: number | string
    resultCode?: number | string
    extendedResultCode?: number | string
  }

  const isBusyOrLockedSqliteCode = (code: unknown): boolean => {
    if (typeof code === 'number') {
      return code === 5 || code === 6
    }

    if (typeof code !== 'string') {
      return false
    }

    const normalizedCode = code.toUpperCase()
    if (
      normalizedCode.includes('SQLITE_BUSY') ||
      normalizedCode.includes('SQLITE_LOCKED')
    ) {
      return true
    }

    const parsedCode = Number.parseInt(normalizedCode, 10)
    return parsedCode === 5 || parsedCode === 6
  }

  if (
    isBusyOrLockedSqliteCode(candidateError.code) ||
    isBusyOrLockedSqliteCode(candidateError.errno) ||
    isBusyOrLockedSqliteCode(candidateError.resultCode) ||
    isBusyOrLockedSqliteCode(candidateError.extendedResultCode)
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

function resolveSqlitePersistenceOptions(
  options: CacheStoreSqliteOptions
): ResolvedSqlitePersistenceOptions {
  return {
    dbPath: resolveDbPath(options),
    schemaVersion: options.schemaVersion ?? CACHE_SCHEMA_VERSION,
    maxAgeMs: options.maxAgeMs ?? SQLITE_DEFAULT_CACHE_MAX_AGE_MS,
    maxRows: options.maxRows ?? SQLITE_DEFAULT_MAX_ROWS,
    debugSessionRoot: options.debugSessionRoot === true,
    debugCachePersistence: options.debugCachePersistence === true,
  }
}

function areSqlitePersistenceOptionsEqual(
  first: ResolvedSqlitePersistenceOptions,
  second: ResolvedSqlitePersistenceOptions
): boolean {
  return (
    first.schemaVersion === second.schemaVersion &&
    first.maxAgeMs === second.maxAgeMs &&
    first.maxRows === second.maxRows
  )
}
