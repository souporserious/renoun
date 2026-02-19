import { mkdir } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { deserialize, serialize } from 'node:v8'

import { getRootDirectory } from '../utils/get-root-directory.ts'
import { CACHE_SCHEMA_VERSION } from './cache-key.ts'
import { loadSqliteModule } from './sqlite.ts'
import {
  createFingerprint,
  type CacheDependencyEvictionResult,
  type CacheEntry,
  type CacheStorePersistence,
} from './CacheStore.ts'

const SQLITE_BUSY_RETRIES = 5
const SQLITE_BUSY_RETRY_DELAY_MS = 25
const SQLITE_DEFAULT_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14
const SQLITE_DEFAULT_MAX_ROWS = 200_000
const SQLITE_PRUNE_WRITE_INTERVAL = 32
const SQLITE_PRUNE_MAX_INTERVAL_MS = 1000 * 60 * 5
const SQLITE_DELETE_BATCH_SIZE = 500
const SQLITE_INFLIGHT_TTL_MS = 20_000
const SQLITE_INFLIGHT_CLEANUP_INTERVAL_MS = 10_000
const DIRECTORY_SNAPSHOT_DEP_INDEX_PREFIX = 'const:dir-snapshot-path:'

let warnedAboutSqliteFallback = false
const persistenceByDbPath = new Map<string, SqliteCacheStorePersistence>()
const persistenceOptionsByDbPath = new Map<string, ResolvedSqlitePersistenceOptions>()

export interface CacheStoreSqliteOptions {
  dbPath?: string
  projectRoot?: string
  schemaVersion?: number
  maxAgeMs?: number
  maxRows?: number
}

interface ResolvedSqlitePersistenceOptions {
  dbPath: string
  schemaVersion: number
  maxAgeMs: number
  maxRows: number
}

function resolveDbPath(options: { dbPath?: string; projectRoot?: string }): string {
  if (typeof options.dbPath === 'string' && options.dbPath.trim()) {
    return resolve(options.dbPath)
  }
  if (
    typeof process.env['RENOUN_FS_CACHE_DB_PATH'] === 'string' &&
    process.env['RENOUN_FS_CACHE_DB_PATH'].trim()
  ) {
    return resolve(process.env['RENOUN_FS_CACHE_DB_PATH'])
  }

  if (process.env['RENOUN_DEBUG_SESSION_ROOT'] === '1') {
    // eslint-disable-next-line no-console
    console.log('[renoun-debug] resolveDbPath', { projectRoot: options.projectRoot })
  }
  return getDefaultCacheDatabasePath(
    options.projectRoot
      ? resolveCanonicalProjectRootPath(options.projectRoot)
      : undefined
  )
}

export function getDefaultCacheDatabasePath(projectRoot?: string): string {
  const overridePath = process.env['RENOUN_FS_CACHE_DB_PATH']
  if (typeof overridePath === 'string' && overridePath.trim()) {
    return resolve(overridePath)
  }

  let root = projectRoot
    ? resolveCanonicalProjectRootPath(projectRoot)
    : resolve(getRootDirectory())
  if (root === resolve('/')) {
    root = tmpdir()
  }
  const path = resolve(root, '.cache', 'renoun', 'fs-cache.sqlite')
  if (process.env['RENOUN_DEBUG_SESSION_ROOT'] === '1') {
    // eslint-disable-next-line no-console
    console.log('[renoun-debug] getDefaultCacheDatabasePath', {
      projectRoot,
      resolved: path,
      overridePath,
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

export function getCacheStorePersistence(options: CacheStoreSqliteOptions = {}) {
  const resolvedOptions = resolveSqlitePersistenceOptions(options)
  const existing = persistenceByDbPath.get(resolvedOptions.dbPath)
  if (existing) {
    const existingOptions = persistenceOptionsByDbPath.get(resolvedOptions.dbPath)

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
  })
  persistenceByDbPath.set(resolvedOptions.dbPath, created)
  persistenceOptionsByDbPath.set(resolvedOptions.dbPath, resolvedOptions)
  return created
}

export function getDefaultCacheStorePersistence() {
  return getCacheStorePersistence()
}

export function disposeCacheStorePersistence(options: {
  dbPath?: string
  projectRoot?: string
} = {}) {
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
  readonly #readyPromise: Promise<void>
  #writesSincePrune = 0
  #lastPrunedAt = 0
  #lastInflightCleanupAt = 0
  #pruneInFlight?: Promise<void>
  #db: any

  constructor(options: CacheStoreSqliteOptions = {}) {
    this.#dbPath = resolveDbPath(options)
    this.#schemaVersion = options.schemaVersion ?? CACHE_SCHEMA_VERSION
    this.#maxAgeMs = options.maxAgeMs ?? SQLITE_DEFAULT_CACHE_MAX_AGE_MS
    this.#maxRows = options.maxRows ?? SQLITE_DEFAULT_MAX_ROWS
    this.#overflowCheckInterval = Math.max(
      1,
      Math.min(
        SQLITE_PRUNE_WRITE_INTERVAL,
        Math.floor(this.#maxRows / 100)
      )
    )
    this.#readyPromise = this.#initialize()
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

      const result = this.#db
        .prepare(
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
      this.#db
        .prepare(
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
      this.#db
        .prepare(
          `DELETE FROM cache_inflight WHERE node_key = ? AND owner = ?`
        )
        .run(nodeKey, owner)
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

      const row = this.#db
        .prepare(
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
        this.#db
          .prepare(`DELETE FROM cache_inflight WHERE node_key = ?`)
          .run(nodeKey)
        return undefined
      }

      return row.owner
    })

    return maybeOwner
  }

  async load(
    nodeKey: string,
    options: { skipFingerprintCheck?: boolean } = {}
  ): Promise<CacheEntry | undefined> {
    await this.#readyPromise

    if (!this.#db) {
      return undefined
    }
    const shouldDebug = shouldDebugCachePersistenceLoadFailure(nodeKey)
    const skipFingerprintCheck = options.skipFingerprintCheck ?? false
    const now = Date.now()
    try {
      await this.#runWithBusyRetries(() => {
        this.#cleanupExpiredComputeSlots(now)
      })
    } catch {
      // Ignore stale slot cleanup errors during reads.
      // Cache reads should still work if cleanup temporarily fails.
    }

    const rows = (await this.#runWithBusyRetries(() =>
      this.#db
        .prepare(
          `
            SELECT
              e.fingerprint as fingerprint,
              e.value_blob as value_blob,
              e.updated_at as updated_at,
              e.persist as persist,
              e.revision as revision,
              d.dep_key as dep_key,
              d.dep_version as dep_version
            FROM cache_entries e
            LEFT JOIN cache_deps d ON d.node_key = e.node_key
            WHERE e.node_key = ?
            ORDER BY d.dep_key
          `
      )
        .all(nodeKey)
    )) as Array<{
      fingerprint?: string
      value_blob?: unknown
      updated_at?: number
      persist?: number
      revision?: unknown
      dep_key?: string | null
      dep_version?: string | null
    }>

    if (rows.length === 0) {
      if (shouldDebug) {
        logCachePersistenceLoadFailure(nodeKey, 'no-rows')
      }
      return undefined
    }

    const row = rows[0]!
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

    const deps = rows
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
    if (!skipFingerprintCheck && storedFingerprint !== recalculatedFingerprint) {
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

    try {
      await this.#touchLastAccessed(nodeKey)
    } catch {
      // Ignore access-time update failures so reads can still return cached data.
    }

    const loadedEntry: CacheEntry & { revision: number } = {
      value,
      deps,
      fingerprint: storedFingerprint,
      persist: Number(row.persist) === 1,
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

        this.#db
          .prepare(
          `
              INSERT INTO cache_entries (
                node_key,
                fingerprint,
                value_blob,
                updated_at,
                last_accessed_at,
                persist,
                revision
              )
              VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT revision FROM cache_entries WHERE node_key = ?), 0) + 1)
              ON CONFLICT(node_key) DO UPDATE SET
                fingerprint = excluded.fingerprint,
                value_blob = excluded.value_blob,
                updated_at = excluded.updated_at,
                last_accessed_at = excluded.last_accessed_at,
                persist = excluded.persist,
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
            nodeKey
          )

        this.#db
          .prepare(`DELETE FROM cache_deps WHERE node_key = ?`)
          .run(nodeKey)

        if (entry.deps.length > 0) {
          const insertDepStatement = this.#db.prepare(
            `
              INSERT INTO cache_deps (node_key, dep_key, dep_version)
              VALUES (?, ?, ?)
            `
          )

          for (const dependency of entry.deps) {
            insertDepStatement.run(
              nodeKey,
              dependency.depKey,
              dependency.depVersion
            )
          }
        }

        const revisionRow = this.#db
          .prepare(`SELECT revision FROM cache_entries WHERE node_key = ?`)
          .get(nodeKey) as { revision?: unknown } | undefined
        const revision = getPersistedRevision(revisionRow?.revision)

        this.#db.exec('COMMIT')
        try {
          await this.#maybePruneAfterWrite(now)
        } catch {
          // Ignore prune errors so cache writes keep succeeding.
        }
        return Number.isFinite(revision) ? revision : 0
      } catch (error) {
        if (transactionStarted) {
          try {
            this.#db.exec('ROLLBACK')
          } catch {
            // Ignore rollback errors; we'll rethrow the original write error below.
          }
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

    throw new Error('[renoun] Exhausted SQLITE busy retries for cache revision write.')
  }

  async save(nodeKey: string, entry: CacheEntry): Promise<void> {
    await this.saveWithRevision(nodeKey, entry)
  }

  async delete(nodeKey: string): Promise<void> {
    await this.#readyPromise

    if (!this.#db) {
      return
    }

    await this.#runWithBusyRetries(() => {
      this.#db.exec('BEGIN IMMEDIATE')
      try {
        this.#db.prepare(`DELETE FROM cache_deps WHERE node_key = ?`).run(nodeKey)
        this.#db
          .prepare(`DELETE FROM cache_entries WHERE node_key = ?`)
          .run(nodeKey)
        this.#db.exec('COMMIT')
      } catch (error) {
        try {
          this.#db.exec('ROLLBACK')
        } catch {
          // Ignore rollback errors and rethrow the original delete error.
        }
        throw error
      }
    })
  }

  async deleteByDependencyPath(
    dependencyPathKey: string
  ): Promise<CacheDependencyEvictionResult> {
    await this.#readyPromise

    if (!this.#db) {
      return {
        deletedNodeKeys: [],
        usedDependencyIndex: false,
        hasMissingDependencyMetadata: false,
      }
    }

    const normalizedPathKey = normalizeDependencyPathKey(dependencyPathKey)
    const dependencyPrefixes = ['file:', 'dir:', 'dir-mtime:'] as const
    const exactDependencyKeys = new Set<string>()
    const descendantDependencyPatterns: string[] = []
    const toDirectorySnapshotDepIndexKey = (depKey: string) =>
      `${DIRECTORY_SNAPSHOT_DEP_INDEX_PREFIX}${depKey}:1`

    for (const prefix of dependencyPrefixes) {
      const exactDependencyKey = `${prefix}${normalizedPathKey}`
      exactDependencyKeys.add(exactDependencyKey)
      exactDependencyKeys.add(toDirectorySnapshotDepIndexKey(exactDependencyKey))

      if (normalizedPathKey === '.') {
        descendantDependencyPatterns.push(
          `${escapeSqlLikePattern(prefix)}%`
        )
        descendantDependencyPatterns.push(
          `${escapeSqlLikePattern(DIRECTORY_SNAPSHOT_DEP_INDEX_PREFIX + prefix)}%:1`
        )
      } else {
        descendantDependencyPatterns.push(
          `${escapeSqlLikePattern(`${prefix}${normalizedPathKey}`)}/%`
        )
        descendantDependencyPatterns.push(
          `${escapeSqlLikePattern(
            `${DIRECTORY_SNAPSHOT_DEP_INDEX_PREFIX}${prefix}${normalizedPathKey}`
          )}/%:1`
        )
      }
    }

    for (const ancestorPath of getAncestorPathKeys(normalizedPathKey)) {
      const directoryDependencyKey = `dir:${ancestorPath}`
      const directoryMtimeDependencyKey = `dir-mtime:${ancestorPath}`
      exactDependencyKeys.add(directoryDependencyKey)
      exactDependencyKeys.add(directoryMtimeDependencyKey)
      exactDependencyKeys.add(
        toDirectorySnapshotDepIndexKey(directoryDependencyKey)
      )
      exactDependencyKeys.add(
        toDirectorySnapshotDepIndexKey(directoryMtimeDependencyKey)
      )
    }

    const exactDependencyList = Array.from(exactDependencyKeys).sort()
    const whereClauses: string[] = []
    const whereParameters: string[] = []

    if (exactDependencyList.length > 0) {
      whereClauses.push(
        `dependency.dep_key IN (${exactDependencyList.map(() => '?').join(',')})`
      )
      whereParameters.push(...exactDependencyList)
    }

    if (descendantDependencyPatterns.length > 0) {
      whereClauses.push(
        descendantDependencyPatterns
          .map(() => `dependency.dep_key LIKE ? ESCAPE '\\'`)
          .join(' OR ')
      )
      whereParameters.push(...descendantDependencyPatterns)
    }

    const deletedNodeKeys = await this.#runWithBusyRetries(() => {
      const rows = this.#db
        .prepare(
          `
            SELECT DISTINCT entry.node_key as node_key
            FROM cache_entries AS entry
            JOIN cache_deps AS dependency
              ON dependency.node_key = entry.node_key
            WHERE entry.node_key LIKE 'dir:%'
              AND (${whereClauses.join(' OR ')})
            ORDER BY entry.node_key
          `
        )
        .all(...whereParameters) as Array<{ node_key?: string }>

      return rows
        .map((row) => row.node_key)
        .filter((nodeKey: string | undefined): nodeKey is string => {
          return typeof nodeKey === 'string'
        })
    })

    if (deletedNodeKeys.length > 0) {
      await this.#runWithBusyRetries(() => {
        this.#db.exec('BEGIN IMMEDIATE')
        try {
          this.#deleteRowsForNodeKeys(deletedNodeKeys)
          this.#db.exec('COMMIT')
        } catch (error) {
          try {
            this.#db.exec('ROLLBACK')
          } catch {
            // Ignore rollback errors and rethrow the original delete error.
          }
          throw error
        }
      })
    }

    const hasMissingDependencyMetadata = await this.#runWithBusyRetries(() => {
      const row = this.#db
        .prepare(
          `
            SELECT EXISTS(
              SELECT 1
              FROM cache_entries AS entry
              WHERE entry.node_key LIKE 'dir:%'
                AND NOT EXISTS (
                  SELECT 1
                  FROM cache_deps AS dependency
                  WHERE dependency.node_key = entry.node_key
                )
            ) as has_missing
          `
        )
        .get() as { has_missing?: number | string | bigint } | undefined

      return Number(row?.has_missing ?? 0) > 0
    })

    return {
      deletedNodeKeys,
      usedDependencyIndex: true,
      hasMissingDependencyMetadata,
    }
  }

  async listNodeKeysByPrefix(prefix: string): Promise<string[]> {
    await this.#readyPromise

    if (!this.#db) {
      return []
    }

    const normalizedPrefix = String(prefix)
    const likePattern = `${escapeSqlLikePattern(normalizedPrefix)}%`

    const rows = (await this.#runWithBusyRetries(() =>
      this.#db
        .prepare(
          `
            SELECT node_key
            FROM cache_entries
            WHERE node_key LIKE ? ESCAPE '\\'
            ORDER BY node_key
          `
        )
        .all(likePattern)
    )) as Array<{ node_key?: string }>

    return rows
      .map((row) => row.node_key)
      .filter((nodeKey: string | undefined): nodeKey is string => {
        return typeof nodeKey === 'string'
      })
  }

  async #initialize(): Promise<void> {
    for (let attempt = 0; attempt <= SQLITE_BUSY_RETRIES; attempt += 1) {
      let db: any

      try {
        await mkdir(dirname(this.#dbPath), { recursive: true })

        const sqliteModule = (await loadSqliteModule()) as {
          DatabaseSync?: new (path: string) => any
        }
        const DatabaseSync = sqliteModule.DatabaseSync

        if (!DatabaseSync) {
          throw new Error('node:sqlite DatabaseSync is unavailable')
        }

        db = new DatabaseSync(this.#dbPath)
        db.exec(`PRAGMA journal_mode = WAL`)
        db.exec(`PRAGMA synchronous = NORMAL`)
        db.exec(`PRAGMA busy_timeout = 5000`)
        db.exec(`PRAGMA foreign_keys = ON`)
        db.exec(
          `
            CREATE TABLE IF NOT EXISTS meta (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            )
          `
        )

        const schemaRow = db
          .prepare(`SELECT value FROM meta WHERE key = ?`)
          .get('cache_schema_version') as { value?: string } | undefined
        const currentSchemaVersion = schemaRow?.value
          ? Number(schemaRow.value)
          : undefined

        if (currentSchemaVersion !== this.#schemaVersion) {
          db.exec(`DROP TABLE IF EXISTS cache_deps`)
          db.exec(`DROP TABLE IF EXISTS cache_entries`)
          db.exec(`DROP TABLE IF EXISTS cache_inflight`)
        }

        this.#createCacheTables(db)

        if (currentSchemaVersion !== this.#schemaVersion) {
          db.prepare(
            `
              INSERT INTO meta(key, value)
              VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `
          ).run('cache_schema_version', String(this.#schemaVersion))
        }

        this.#db = db
        await this.#runPruneWithRetries()
        return
      } catch (error) {
        this.#db = undefined

        if (db && typeof db.close === 'function') {
          try {
            db.close()
          } catch {
            // Ignore close failures while handling initialization errors.
          }
        }

        if (
          attempt < SQLITE_BUSY_RETRIES &&
          isSqliteBusyOrLockedError(error)
        ) {
          await delay((attempt + 1) * SQLITE_BUSY_RETRY_DELAY_MS)
          continue
        }

        if (!warnedAboutSqliteFallback) {
          warnedAboutSqliteFallback = true
          // eslint-disable-next-line no-console
          console.error(
            '[renoun-debug] failed to initialize sqlite cache',
            this.#dbPath,
            error instanceof Error ? error.message : String(error)
          )
          console.warn(
            `[renoun] Falling back to in-memory FileSystem cache because SQLite initialization failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        }

        return
      }
    }
  }

  #createCacheTables(db: any) {
    // NOTE: this timestamp is write-time only and is used as "last updated" for eviction ordering.
    db.exec(
      `
        CREATE TABLE IF NOT EXISTS cache_entries (
          node_key TEXT PRIMARY KEY,
          fingerprint TEXT NOT NULL,
          value_blob BLOB NOT NULL,
          updated_at INTEGER NOT NULL,
          last_accessed_at INTEGER NOT NULL,
          persist INTEGER NOT NULL DEFAULT 0,
          revision INTEGER NOT NULL DEFAULT 0
        )
      `
    )
    db.exec(
      `
        CREATE TABLE IF NOT EXISTS cache_deps (
          node_key TEXT NOT NULL,
          dep_key TEXT NOT NULL,
          dep_version TEXT NOT NULL,
          FOREIGN KEY (node_key) REFERENCES cache_entries(node_key) ON DELETE CASCADE,
          PRIMARY KEY (node_key, dep_key)
        )
      `
    )
    db.exec(
      `CREATE INDEX IF NOT EXISTS cache_entries_updated_at_idx ON cache_entries(updated_at)`
    )
    db.exec(
      `CREATE INDEX IF NOT EXISTS cache_entries_last_accessed_at_idx ON cache_entries(last_accessed_at)`
    )
    db.exec(
      `CREATE INDEX IF NOT EXISTS cache_deps_dep_key_idx ON cache_deps(dep_key)`
    )
    db.exec(
      `
        CREATE TABLE IF NOT EXISTS cache_inflight (
          node_key TEXT PRIMARY KEY,
          owner TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `
    )
    db.exec(
      `CREATE INDEX IF NOT EXISTS cache_inflight_expires_at_idx ON cache_inflight(expires_at)`
    )
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
      const countRow = this.#db
        .prepare(`SELECT COUNT(*) as total FROM cache_entries`)
        .get() as { total?: number }
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

    await this.#runWithBusyRetries(() => {
      this.#db
        .prepare(
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

    this.#db
      .prepare(`DELETE FROM cache_inflight WHERE expires_at <= ?`)
      .run(now)
    this.#lastInflightCleanupAt = now
  }

  async #pruneStaleEntries() {
    if (!this.#db) {
      return
    }

    const staleBefore = Date.now() - this.#maxAgeMs
    const staleNodes = this.#db
      .prepare(
        `
          SELECT node_key
          FROM cache_entries
          WHERE updated_at < ?
        `
      )
      .all(staleBefore) as Array<{ node_key?: string }>
    const staleNodeKeys = staleNodes
      .map((row) => row.node_key)
      .filter((nodeKey: string | undefined): nodeKey is string => {
        return typeof nodeKey === 'string'
      })
    const staleCount = staleNodeKeys.length

    this.#db.exec('BEGIN IMMEDIATE')
    try {
      if (staleCount > 0) {
        this.#deleteRowsForNodeKeys(staleNodeKeys)
      }

      const countRow = this.#db
        .prepare(`SELECT COUNT(*) as total FROM cache_entries`)
        .get() as { total?: number }
      const totalRows = Number(countRow?.total ?? 0)
      const overflow = totalRows - this.#maxRows

      if (overflow > 0) {
        const overflowRows = this.#db
          .prepare(
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
        this.#db
          .prepare(
            `
              SELECT node_key
              FROM cache_inflight
              WHERE expires_at <= ?
            `
          )
          .all(Date.now())
          .map((row: { node_key?: string }) => row.node_key)
          .filter((nodeKey: string | undefined): nodeKey is string => {
            return typeof nodeKey === 'string'
          })
      )

      this.#db.exec('COMMIT')
    } catch (error) {
      try {
        this.#db.exec('ROLLBACK')
      } catch {
        // Ignore rollback errors and continue.
      }
      throw error
    }
  }

  close() {
    const db = this.#db
    this.#pruneInFlight = undefined
    this.#db = undefined

    if (db && typeof db.close === 'function') {
      db.close()
    }
  }

  #deleteRowsForNodeKeys(nodeKeys: string[]) {
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
      this.#db
        .prepare(`DELETE FROM cache_deps WHERE node_key IN (${placeholders})`)
        .run(...batch)
      this.#db
        .prepare(`DELETE FROM cache_entries WHERE node_key IN (${placeholders})`)
        .run(...batch)
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
      this.#db
        .prepare(`DELETE FROM cache_inflight WHERE node_key IN (${placeholders})`)
        .run(...batch)
    }
  }
}

function normalizeDependencyPathKey(path: string): string {
  const normalized = path.replace(/\\+/g, '/').replace(/^\.\/+/, '')
  const trimmed = normalized.replace(/^\/+/, '').replace(/\/+$/, '')
  return trimmed === '' ? '.' : trimmed
}

function escapeSqlLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

function getAncestorPathKeys(path: string): string[] {
  const normalized = normalizeDependencyPathKey(path)
  if (normalized === '.') {
    return ['.']
  }

  const segments = normalized.split('/')
  const ancestors = ['.']

  for (let index = 0; index < segments.length - 1; index += 1) {
    const ancestor = segments.slice(0, index + 1).join('/')
    ancestors.push(ancestor)
  }

  return ancestors
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

function shouldDebugCachePersistenceLoadFailure(nodeKey: string): boolean {
  const debugEnvValue = process.env['RENOUN_DEBUG_CACHE_PERSISTENCE']
  if (debugEnvValue !== '1' && debugEnvValue !== 'true') {
    return false
  }

  return (
    nodeKey.startsWith('js.exports:') ||
    nodeKey.startsWith('mdx.sections:')
  )
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

function summarizePersistedValue(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${typeof value}:${value}`
  }

  if (value === undefined) {
    return 'undefined'
  }

  if (typeof value === 'symbol') {
    return `symbol:${value.description ?? value.toString()}`
  }

  if (value instanceof RegExp) {
    return `regexp:${value.toString()}`
  }

  if (Array.isArray(value)) {
    return `array(length=${value.length})`
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
    return `object(keys=[${previewKeys}])`
  }

  return `unsupported:${typeof value}`
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

  if (!('key' in candidate) || !('ref' in candidate) || !('props' in candidate)) {
    return false
  }

  const keys = Object.keys(candidate)
  if (keys.length < 3 || keys.length > 4) {
    return false
  }

  if (
    keys.some(
      (key) => key !== 'key' && key !== 'ref' && key !== 'props' && key !== 'type'
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
    if (normalizedCode.includes('SQLITE_BUSY') || normalizedCode.includes('SQLITE_LOCKED')) {
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

function resolveSqlitePersistenceOptions(
  options: CacheStoreSqliteOptions
): ResolvedSqlitePersistenceOptions {
  return {
    dbPath: resolveDbPath(options),
    schemaVersion: options.schemaVersion ?? CACHE_SCHEMA_VERSION,
    maxAgeMs: options.maxAgeMs ?? SQLITE_DEFAULT_CACHE_MAX_AGE_MS,
    maxRows: options.maxRows ?? SQLITE_DEFAULT_MAX_ROWS,
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
