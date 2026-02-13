import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { deserialize, serialize } from 'node:v8'

import { getRootDirectory } from '../utils/get-root-directory.ts'
import { CACHE_SCHEMA_VERSION } from './cache-key.ts'
import { loadSqliteModule } from './sqlite.ts'
import {
  createFingerprint,
  type CacheEntry,
  type CacheStorePersistence,
} from './CacheStore.ts'

const SQLITE_BUSY_RETRIES = 5
const SQLITE_BUSY_RETRY_DELAY_MS = 25
const CACHE_DB_PATH_ENV = 'RENOUN_FS_CACHE_DB_PATH'
const SQLITE_DEFAULT_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14
const SQLITE_DEFAULT_MAX_ROWS = 200_000
const SQLITE_PRUNE_WRITE_INTERVAL = 32
const SQLITE_PRUNE_MAX_INTERVAL_MS = 1000 * 60 * 5
const SQLITE_DELETE_BATCH_SIZE = 500

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

  return getDefaultCacheDatabasePath(options.projectRoot)
}

export function getDefaultCacheDatabasePath(projectRoot?: string): string {
  const overridePath = process.env[CACHE_DB_PATH_ENV]
  if (typeof overridePath === 'string' && overridePath.trim()) {
    return resolve(overridePath)
  }

  const root = projectRoot ? resolve(projectRoot) : resolve(getRootDirectory())
  return resolve(root, '.cache', 'renoun', 'fs-cache.sqlite')
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

  async load(nodeKey: string): Promise<CacheEntry | undefined> {
    await this.#readyPromise

    if (!this.#db) {
      return undefined
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
      dep_key?: string | null
      dep_version?: string | null
    }>

    if (rows.length === 0) {
      return undefined
    }

    const row = rows[0]!
    const valueBuffer = toUint8Array(row.value_blob)

    if (!valueBuffer) {
      await this.delete(nodeKey)
      return undefined
    }

    let value: unknown

    try {
      value = deserialize(valueBuffer)
    } catch {
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
    const storedFingerprint = String(row.fingerprint ?? '')

    if (storedFingerprint !== createFingerprint(deps)) {
      await this.delete(nodeKey)
      return undefined
    }

    return {
      value,
      deps,
      fingerprint: storedFingerprint,
      persist: Number(row.persist) === 1,
      updatedAt: Number(row.updated_at) || Date.now(),
    }
  }

  async save(nodeKey: string, entry: CacheEntry): Promise<void> {
    await this.#readyPromise

    if (!this.#db) {
      return
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
                persist
              )
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(node_key) DO UPDATE SET
                fingerprint = excluded.fingerprint,
                value_blob = excluded.value_blob,
                updated_at = excluded.updated_at,
                last_accessed_at = excluded.last_accessed_at,
                persist = excluded.persist
            `
          )
          .run(
            nodeKey,
            entry.fingerprint,
            serializedValue,
            entry.updatedAt,
            now,
            persist
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

        this.#db.exec('COMMIT')
        try {
          await this.#maybePruneAfterWrite(now)
        } catch {
          // Ignore prune errors so cache writes keep succeeding.
        }
        return
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
          persist INTEGER NOT NULL DEFAULT 0
        )
      `
    )
    db.exec(
      `
        CREATE TABLE IF NOT EXISTS cache_deps (
          node_key TEXT NOT NULL,
          dep_key TEXT NOT NULL,
          dep_version TEXT NOT NULL,
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
  }

  async #maybePruneAfterWrite(now: number): Promise<void> {
    if (!this.#db) {
      return
    }

    this.#writesSincePrune += 1
    const shouldCheckOverflow =
      this.#writesSincePrune >= this.#overflowCheckInterval
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

  async #pruneStaleEntries() {
    if (!this.#db) {
      return
    }

    const staleBefore = Date.now() - this.#maxAgeMs

    this.#db.exec('BEGIN IMMEDIATE')
    try {
      this.#db
        .prepare(
          `
            DELETE FROM cache_deps
            WHERE node_key IN (
              SELECT node_key
              FROM cache_entries
              WHERE updated_at < ?
            )
          `
        )
        .run(staleBefore)

      this.#db
        .prepare(`DELETE FROM cache_entries WHERE updated_at < ?`)
        .run(staleBefore)

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
          .filter((nodeKey): nodeKey is string => typeof nodeKey === 'string')

        this.#deleteRowsForNodeKeys(victimNodeKeys)
      }

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

    for (
      let offset = 0;
      offset < nodeKeys.length;
      offset += SQLITE_DELETE_BATCH_SIZE
    ) {
      const batch = nodeKeys.slice(offset, offset + SQLITE_DELETE_BATCH_SIZE)
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

function isSqliteBusyOrLockedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return /database is locked|SQLITE_BUSY/i.test(error.message)
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
