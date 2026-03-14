import { mkdir, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { deserialize, serialize } from 'node:v8'

import { delay } from '../utils/delay.ts'
import { reportBestEffortError } from '../utils/best-effort.ts'
import { getDebugLogger } from '../utils/debug.ts'
import {
  resolveBooleanProcessEnv,
  resolvePositiveIntegerProcessEnv,
} from '../utils/env.ts'
import { HASH_STRING_HEX_LENGTH } from '../utils/stable-serialization.ts'
import { DIRECTORY_SNAPSHOT_DEP_INDEX_PREFIX } from '../utils/cache-constants.ts'
import {
  resolvePersistentProjectRootDirectory,
} from '../utils/get-root-directory.ts'
import { normalizePathKey } from '../utils/path.ts'
import {
  emitTelemetryCounter,
  emitTelemetryHistogram,
} from '../utils/telemetry.ts'
import { CACHE_SCHEMA_VERSION } from './cache-key.ts'
import { resolveCacheRootDirectory } from './cache-directory.ts'
import { summarizePersistedValue } from './cache-persistence-debug.ts'
import { loadSqliteModule } from './sqlite.ts'
import {
  createFingerprint,
  type CacheDependencyEvictionResult,
  type CacheEntry,
  type CacheStorePersistence,
} from './Cache.ts'

const SQLITE_DEFAULTS = {
  busyRetries: 5,
  busyRetryDelayMs: 25,
  initBusyRetries: 30,
  initBusyRetryDelayMs: 25,
  initBusyRetryMaxDelayMs: 250,
  cacheMaxAgeMs: 1000 * 60 * 60 * 24 * 14,
  maxRows: 200_000,
  pruneWriteInterval: 32,
  pruneMaxIntervalMs: 1000 * 60 * 5,
  deleteBatchSize: 500,
  preparedStatementCacheMax: 128,
  inflightTtlMs: 20_000,
  inflightCleanupIntervalMs: 10_000,
  lastAccessedTouchMinIntervalMs: 30_000,
  lastAccessedTouchCacheMaxSize: 50_000,
  structuredPathIdCacheMaxSize: 100_000,
  structuredDepTermIdCacheMaxSize: 100_000,
  structuredPathClosureSeededCacheMaxSize: 100_000,
} as const

const SQLITE_DATABASE_FILE_SUFFIXES = ['', '-shm', '-wal'] as const

const SQLITE_META_KEYS = {
  missingDependencyEntryCount: 'missing_dependency_entry_count',
  invalidationSequence: 'invalidation_seq',
} as const

const STRUCTURED_DEP_KIND = {
  file: 1,
  dir: 2,
  dirMtime: 3,
} as const

interface StructuredPathDependencyTerm {
  kind:
    | typeof STRUCTURED_DEP_KIND.file
    | typeof STRUCTURED_DEP_KIND.dir
    | typeof STRUCTURED_DEP_KIND.dirMtime
  pathKey: string
}

interface SqlitePruneMetrics {
  staleRowsDeleted: number
  overflowRowsDeleted: number
  inflightRowsDeleted: number
  compactionTriggered: boolean
}

let warnedAboutSqliteFallback = false
const persistenceByDbPath = new Map<string, SqliteCacheStorePersistence>()
const persistenceOptionsByDbPath = new Map<
  string,
  ResolvedSqlitePersistenceOptions
>()

export interface CacheStoreSqliteOptions {
  dbPath?: string
  cacheDirectory?: string
  projectRoot?: string
  startDirectory?: string
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
  preparedStatementCacheMax?: number
  structuredIdCacheEnabled?: boolean
  debugSessionRoot?: boolean
  debugCachePersistence?: boolean
}

export type SqliteCheckpointMode = 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE'

export interface SqliteCacheMaintenanceOptions {
  checkpoint?: boolean
  vacuum?: boolean
  checkpointMode?: SqliteCheckpointMode
  quickCheck?: boolean
  integrityCheck?: boolean
}

export interface SqliteHealthCheckResult {
  executed: boolean
  ok: boolean
  errors: string[]
  durationMs: number
}

export interface SqliteCacheMaintenanceResult {
  dbPath: string
  available: boolean
  checkpoint: {
    executed: boolean
    mode: SqliteCheckpointMode
    busy: number
    logFrames: number
    checkpointedFrames: number
    durationMs: number
  }
  quickCheck: SqliteHealthCheckResult
  integrityCheck: SqliteHealthCheckResult
  vacuum: {
    executed: boolean
    durationMs: number
  }
}

function resolveDbPath(options: {
  dbPath?: string
  cacheDirectory?: string
  projectRoot?: string
  startDirectory?: string
  debugSessionRoot?: boolean
}): string {
  if (typeof options.dbPath === 'string' && options.dbPath.trim()) {
    return resolve(options.dbPath)
  }

  if (options.debugSessionRoot === true) {
    logSessionRootDebug('resolveDbPath', {
      projectRoot: options.projectRoot,
    })
  }
  return getDefaultCacheDatabasePath(
    options.projectRoot,
    options.debugSessionRoot,
    options.cacheDirectory,
    options.startDirectory
  )
}

export function getDefaultCacheDatabasePath(
  projectRoot?: string,
  debugSessionRoot?: boolean,
  cacheDirectory?: string,
  startDirectory?: string
): string {
  if (
    !cacheDirectory &&
    projectRoot &&
    resolvePersistentProjectRootDirectory(projectRoot) === resolve('/')
  ) {
    throw new Error(
      '[renoun] Refusing to write cache database at filesystem root "/". Run from a workspace directory or pass `dbPath`/`cacheDirectory`/`projectRoot` explicitly.'
    )
  }

  let path: string
  if (typeof cacheDirectory === 'string' && cacheDirectory.trim() !== '') {
    path = join(resolve(cacheDirectory), 'fs-cache.sqlite')
  } else if (projectRoot) {
    path = join(
      resolvePersistentProjectRootDirectory(projectRoot),
      '.renoun',
      'cache',
      'fs-cache.sqlite'
    )
  } else {
    try {
        path = join(
        resolveCacheRootDirectory({
          startDirectory,
          fallbackToStartDirectory: startDirectory !== undefined,
        }),
        'fs-cache.sqlite'
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('filesystem root "/"')
      ) {
        throw new Error(
          '[renoun] Refusing to write cache database at filesystem root "/". Run from a workspace directory or pass `dbPath`/`cacheDirectory`/`projectRoot` explicitly.'
        )
      }
      throw error
    }
  }
  if (debugSessionRoot === true) {
    logSessionRootDebug('getDefaultCacheDatabasePath', {
      projectRoot,
      cacheDirectory,
      startDirectory,
      resolved: path,
    })
  }
  return path
}

function logSessionRootDebug(
  operation: 'resolveDbPath' | 'getDefaultCacheDatabasePath',
  data: Record<string, unknown>
): void {
  const debugLogger = getDebugLogger()
  debugLogger.debug(`[renoun-debug] ${operation}`, () => ({ data }))
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
    preparedStatementCacheMax: resolvedOptions.preparedStatementCacheMax,
    structuredIdCacheEnabled: resolvedOptions.structuredIdCacheEnabled,
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
    cacheDirectory?: string
    projectRoot?: string
  } = {}
) {
  if (!options.dbPath && !options.cacheDirectory && !options.projectRoot) {
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

export async function runSqliteCacheMaintenance(
  options: {
    dbPath?: string
    cacheDirectory?: string
    projectRoot?: string
    checkpoint?: boolean
    vacuum?: boolean
    checkpointMode?: SqliteCheckpointMode
    quickCheck?: boolean
    integrityCheck?: boolean
  } = {}
): Promise<SqliteCacheMaintenanceResult> {
  const persistence = new SqliteCacheStorePersistence({
    dbPath: options.dbPath,
    cacheDirectory: options.cacheDirectory,
    projectRoot: options.projectRoot,
  })

  try {
    return await persistence.runMaintenance({
      checkpoint: options.checkpoint,
      vacuum: options.vacuum,
      checkpointMode: options.checkpointMode,
      quickCheck: options.quickCheck,
      integrityCheck: options.integrityCheck,
    })
  } finally {
    persistence.close()
  }
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
  #lifecycleGeneration = 0
  #isClosed = false
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
    this.#maxAgeMs = options.maxAgeMs ?? SQLITE_DEFAULTS.cacheMaxAgeMs
    this.#maxRows = options.maxRows ?? SQLITE_DEFAULTS.maxRows
    this.#debugCachePersistence = options.debugCachePersistence === true
    this.#overflowCheckInterval = Math.max(
      1,
      Math.min(
        SQLITE_DEFAULTS.pruneWriteInterval,
        Math.floor(this.#maxRows / 100)
      )
    )
    this.#preparedStatementCacheMax = resolvePreparedStatementCacheMax(
      options.preparedStatementCacheMax
    )
    this.#structuredIdCacheEnabled = resolveStructuredIdCacheEnabled(
      options.structuredIdCacheEnabled
    )
    this.#readyPromise = this.#initialize(++this.#lifecycleGeneration)
  }

  setDebugCachePersistence(enabled: boolean): void {
    this.#debugCachePersistence = enabled === true
  }

  isAvailable(): boolean {
    return this.#availability !== 'unavailable'
  }

  async runMaintenance(
    options: SqliteCacheMaintenanceOptions = {}
  ): Promise<SqliteCacheMaintenanceResult> {
    await this.#readyPromise

    const resolvedOptions = resolveSqliteMaintenanceOptions(options)
    const checkpointMode = resolvedOptions.checkpointMode

    const result: SqliteCacheMaintenanceResult = {
      dbPath: this.#dbPath,
      available: !!this.#db,
      checkpoint: {
        executed: false,
        mode: checkpointMode,
        busy: 0,
        logFrames: 0,
        checkpointedFrames: 0,
        durationMs: 0,
      },
      quickCheck: {
        executed: false,
        ok: true,
        errors: [],
        durationMs: 0,
      },
      integrityCheck: {
        executed: false,
        ok: true,
        errors: [],
        durationMs: 0,
      },
      vacuum: {
        executed: false,
        durationMs: 0,
      },
    }

    if (!this.#db) {
      return result
    }

    if (resolvedOptions.checkpoint) {
      const startedAt = Date.now()
      const checkpointRow = (await this.#runWithBusyRetries(
        () =>
          this.#prepareStatement(
            `PRAGMA wal_checkpoint(${checkpointMode})`
          ).get(),
        {
          operationName: 'maintenance_checkpoint',
        }
      )) as
        | {
            busy?: unknown
            log?: unknown
            checkpointed?: unknown
          }
        | undefined
      const durationMs = Date.now() - startedAt
      const busy = Number(checkpointRow?.busy ?? 0)
      const logFrames = Number(checkpointRow?.log ?? 0)
      const checkpointedFrames = Number(checkpointRow?.checkpointed ?? 0)

      result.checkpoint = {
        executed: true,
        mode: checkpointMode,
        busy: Number.isFinite(busy) ? busy : 0,
        logFrames: Number.isFinite(logFrames) ? logFrames : 0,
        checkpointedFrames: Number.isFinite(checkpointedFrames)
          ? checkpointedFrames
          : 0,
        durationMs,
      }

      emitTelemetryCounter({
        name: 'renoun.cache.sqlite.maintenance_checkpoint_count',
        tags: {
          mode: checkpointMode.toLowerCase(),
        },
      })
      emitTelemetryHistogram({
        name: 'renoun.cache.sqlite.maintenance_checkpoint_ms',
        value: durationMs,
        tags: {
          mode: checkpointMode.toLowerCase(),
        },
      })
    }

    if (resolvedOptions.quickCheck) {
      result.quickCheck = await this.#runHealthCheck('QUICK')
    }

    if (resolvedOptions.integrityCheck) {
      result.integrityCheck = await this.#runHealthCheck('INTEGRITY')
    }

    if (resolvedOptions.vacuum) {
      const startedAt = Date.now()
      await this.#runWithBusyRetries(
        () => {
          this.#db.exec('VACUUM')
        },
        {
          operationName: 'maintenance_vacuum',
        }
      )
      const durationMs = Date.now() - startedAt

      result.vacuum = {
        executed: true,
        durationMs,
      }

      emitTelemetryCounter({
        name: 'renoun.cache.sqlite.maintenance_vacuum_count',
      })
      emitTelemetryHistogram({
        name: 'renoun.cache.sqlite.maintenance_vacuum_ms',
        value: durationMs,
      })
    }

    return result
  }

  #runHealthCheck(
    mode: 'QUICK' | 'INTEGRITY'
  ): Promise<SqliteHealthCheckResult> {
    const pragma =
      mode === 'QUICK' ? 'PRAGMA quick_check' : 'PRAGMA integrity_check'
    const startedAt = Date.now()

    return this.#runWithBusyRetries(
      () => {
        const rows = this.#prepareStatement(pragma).all() as Array<{
          quick_check?: unknown
          integrity_check?: unknown
        }>
        const messages = rows
          .map((row) =>
            mode === 'QUICK' ? row.quick_check : row.integrity_check
          )
          .filter((value): value is string => typeof value === 'string')
        const ok =
          messages.length === 1 && messages[0]?.trim().toLowerCase() === 'ok'
        const durationMs = Date.now() - startedAt

        emitTelemetryCounter({
          name: 'renoun.cache.sqlite.maintenance_health_check_count',
          tags: {
            mode: mode.toLowerCase(),
            ok: String(ok),
          },
        })
        emitTelemetryHistogram({
          name: 'renoun.cache.sqlite.maintenance_health_check_ms',
          value: durationMs,
          tags: {
            mode: mode.toLowerCase(),
            ok: String(ok),
          },
        })

        return {
          executed: true,
          ok,
          errors: ok ? [] : messages,
          durationMs,
        }
      },
      {
        operationName: `maintenance_${mode.toLowerCase()}_check`,
      }
    )
  }

  async acquireComputeSlot(
    nodeKey: string,
    owner: string,
    ttlMs: number = SQLITE_DEFAULTS.inflightTtlMs
  ): Promise<boolean> {
    await this.#readyPromise

    if (!this.#db) {
      return false
    }

    const now = Date.now()
    const expiresAt = now + ttlMs

    return this.#runWithBusyRetries(() => {
      this.#cleanupExpiredComputeSlots(now)

      const result = this.#prepareStatement(
        `
            INSERT INTO cache_inflight (node_key, owner, started_at, expires_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(node_key) DO UPDATE SET
              owner = excluded.owner,
              started_at = excluded.started_at,
              expires_at = excluded.expires_at
            WHERE cache_inflight.expires_at < ?
          `
      ).run(nodeKey, owner, now, expiresAt, now)

      const changes = Number((result as { changes?: number }).changes ?? 0)
      return changes > 0
    })
  }

  async refreshComputeSlot(
    nodeKey: string,
    owner: string,
    ttlMs: number = SQLITE_DEFAULTS.inflightTtlMs
  ): Promise<boolean> {
    await this.#readyPromise

    if (!this.#db) {
      return true
    }

    const now = Date.now()
    const expiresAt = now + ttlMs

    return this.#runWithBusyRetries(() => {
      const result = this.#prepareStatement(
        `
            UPDATE cache_inflight
            SET expires_at = ?
            WHERE node_key = ? AND owner = ?
          `
      ).run(expiresAt, nodeKey, owner)

      return Number((result as { changes?: number }).changes ?? 0) > 0
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

      const row = this.#prepareStatement(
        `
            SELECT owner, expires_at
            FROM cache_inflight
            WHERE node_key = ?
          `
      ).get(nodeKey) as { owner?: string; expires_at?: number } | undefined

      if (!row?.owner) {
        return undefined
      }

      const expiresAt = Number(row.expires_at)
      if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        this.#prepareStatement(
          `DELETE FROM cache_inflight WHERE node_key = ?`
        ).run(nodeKey)
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
      includeValue?: boolean
      includeDeps?: boolean
    } = {}
  ): Promise<CacheEntry | undefined> {
    await this.#readyPromise

    if (!this.#db) {
      return undefined
    }
    const shouldDebug = this.#shouldDebugCachePersistenceLoadFailure(nodeKey)
    const skipFingerprintCheck = options.skipFingerprintCheck ?? false
    const includeValue = options.includeValue ?? true
    const includeDeps = options.includeDeps ?? true
    const shouldSkipFingerprintCheck = skipFingerprintCheck || !includeDeps
    const now = Date.now()
    try {
      await this.#runWithBusyRetries(() => {
        this.#cleanupExpiredComputeSlots(now)
      })
    } catch (error) {
      reportBestEffortError('file-system/cache-sqlite', error)
    }

    const loadedRowData = (await this.#runWithBusyRetries(() => {
      this.#db.exec('BEGIN')
      let transactionStarted = true
      try {
        const loadEntrySql = includeValue
          ? `
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
          : `
              SELECT
                fingerprint as fingerprint,
                updated_at as updated_at,
                persist as persist,
                workspace_change_token as workspace_change_token,
                revision as revision
              FROM cache_entries
              WHERE node_key = ?
            `
        const row = this.#prepareStatement(loadEntrySql).get(nodeKey) as
          | {
              fingerprint?: string
              value_blob?: unknown
              updated_at?: number
              persist?: number
              workspace_change_token?: unknown
              revision?: unknown
            }
          | undefined

        let dependencyRows: Array<{
          dep_key?: string | null
          dep_version?: string | null
        }> = []
        if (row && includeDeps) {
          dependencyRows = this.#prepareStatement(
            `
                SELECT dep_key as dep_key, dep_version as dep_version
                FROM cache_entry_deps_v2
                WHERE node_key = ?
                ORDER BY dep_key
              `
          ).all(nodeKey) as Array<{
            dep_key?: string | null
            dep_version?: string | null
          }>
        }

        this.#db.exec('COMMIT')
        transactionStarted = false
        return {
          row,
          dependencyRows,
        }
      } catch (error) {
        if (transactionStarted) {
          try {
            this.#db.exec('ROLLBACK')
          } catch (error) {
            reportBestEffortError('file-system/cache-sqlite', error)
          }
        }
        throw error
      }
    })) as {
      row:
        | {
            fingerprint?: string
            value_blob?: unknown
            updated_at?: number
            persist?: number
            workspace_change_token?: unknown
            revision?: unknown
          }
        | undefined
      dependencyRows: Array<{
        dep_key?: string | null
        dep_version?: string | null
      }>
    }

    const row = loadedRowData.row

    if (!row) {
      if (shouldDebug) {
        logCachePersistenceLoadFailure(nodeKey, 'no-rows')
      }
      return undefined
    }

    const dependencyRows = loadedRowData.dependencyRows
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

    let value: unknown

    if (includeValue) {
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
    }

    const deps = includeDeps
      ? dependencyRows
          .filter((dependencyRow) => typeof dependencyRow.dep_key === 'string')
          .map((dependencyRow) => ({
            depKey: dependencyRow.dep_key!,
            depVersion:
              typeof dependencyRow.dep_version === 'string'
                ? dependencyRow.dep_version
                : '',
          }))
          .sort((first, second) => first.depKey.localeCompare(second.depKey))
      : []

    const recalculatedFingerprint = createFingerprint(deps)
    if (
      !shouldSkipFingerprintCheck &&
      storedFingerprint !== recalculatedFingerprint
    ) {
      emitTelemetryCounter({
        name: 'renoun.cache.sqlite.fingerprint_mismatch_cleanup_count',
        tags: {
          namespace: getCacheNodeNamespace(nodeKey),
        },
      })
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
      } catch (error) {
        reportBestEffortError('file-system/cache-sqlite', error)
      }
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

    for (
      let attempt = 0;
      attempt <= SQLITE_DEFAULTS.busyRetries;
      attempt += 1
    ) {
      let transactionStarted = false

      try {
        this.#db.exec('BEGIN IMMEDIATE')
        transactionStarted = true

        const previousMissingDependencyMetadata =
          this.#isNodeKeyMissingDependencyMetadata(nodeKey)

        this.#prepareStatement(
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
        ).run(
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
        } catch (error) {
          reportBestEffortError('file-system/cache-sqlite', error)
        }
        return Number.isFinite(revision) ? revision : 0
      } catch (error) {
        if (transactionStarted) {
          try {
            this.#db.exec('ROLLBACK')
          } catch (error) {
            reportBestEffortError('file-system/cache-sqlite', error)
          }
        }

        const busyOrLocked = isSqliteBusyOrLockedError(error)
        if (!busyOrLocked) {
          throw error
        }
        if (attempt >= SQLITE_DEFAULTS.busyRetries) {
          this.#emitBusyRetriesExhaustedTelemetry(
            'save_with_revision',
            attempt + 1,
            error
          )
          throw error
        }

        this.#emitBusyRetryTelemetry('save_with_revision', attempt + 1, error)
        await delay((attempt + 1) * SQLITE_DEFAULTS.busyRetryDelayMs)
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

    for (
      let attempt = 0;
      attempt <= SQLITE_DEFAULTS.busyRetries;
      attempt += 1
    ) {
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

          this.#prepareStatement(
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
          ).run(
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
          const updateResult = this.#prepareStatement(
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
          ).run(
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
        } catch (error) {
          reportBestEffortError('file-system/cache-sqlite', error)
        }
        return {
          applied: true,
          revision: Number.isFinite(revision) ? revision : 0,
        }
      } catch (error) {
        if (transactionStarted) {
          try {
            this.#db.exec('ROLLBACK')
          } catch (error) {
            reportBestEffortError('file-system/cache-sqlite', error)
          }
        }

        const busyOrLocked = isSqliteBusyOrLockedError(error)
        if (!busyOrLocked) {
          throw error
        }
        if (attempt >= SQLITE_DEFAULTS.busyRetries) {
          this.#emitBusyRetriesExhaustedTelemetry(
            'save_with_revision_guarded',
            attempt + 1,
            error
          )
          throw error
        }

        this.#emitBusyRetryTelemetry(
          'save_with_revision_guarded',
          attempt + 1,
          error
        )
        await delay((attempt + 1) * SQLITE_DEFAULTS.busyRetryDelayMs)
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
        } catch (error) {
          reportBestEffortError('file-system/cache-sqlite', error)
        }
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
        } catch (error) {
          reportBestEffortError('file-system/cache-sqlite', error)
        }
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
      if (
        typeof dependencyPathKey !== 'string' ||
        dependencyPathKey.length === 0
      ) {
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

    const deletedNodeKeys =
      await this.#selectNodeKeysByStructuredDependencyPaths(dependencyPathKeys)

    if (deletedNodeKeys.length > 0) {
      await this.#runWithBusyRetries(() => {
        this.#db.exec('BEGIN IMMEDIATE')
        try {
          this.#deleteRowsForNodeKeys(deletedNodeKeys)
          this.#db.exec('COMMIT')
        } catch (error) {
          try {
            this.#db.exec('ROLLBACK')
          } catch (error) {
            reportBestEffortError('file-system/cache-sqlite', error)
          }
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
    const invalidationSeq =
      deletedNodeKeys.length > 0
        ? await this.#runWithBusyRetries(() => this.#nextInvalidationSequence())
        : undefined

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

    const lookupPathKeys = this.#expandStructuredDependencyLookupPathKeys(
      normalizedChangedPathKeys
    )
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
              term.dep_kind = ${STRUCTURED_DEP_KIND.file}
              AND term.path_id IN (SELECT path_id FROM descendant_paths)
            )
            OR (
              term.dep_kind IN (${STRUCTURED_DEP_KIND.dir}, ${STRUCTURED_DEP_KIND.dirMtime})
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
    ).run(SQLITE_META_KEYS.invalidationSequence)
    this.#prepareStatement(
      `
        UPDATE meta
        SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)
        WHERE key = ?
      `
    ).run(SQLITE_META_KEYS.invalidationSequence)
    const row = this.#prepareStatement(
      `SELECT value FROM meta WHERE key = ?`
    ).get(SQLITE_META_KEYS.invalidationSequence) as
      | { value?: unknown }
      | undefined
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

    this.#prepareStatement(
      `DELETE FROM cache_entry_deps_v2 WHERE node_key = ?`
    ).run(nodeKey)

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
          kind: STRUCTURED_DEP_KIND.file,
          pathKey: normalizeAbsolutePathKey(
            pathDependency.slice('file:'.length)
          ),
        }
      }

      if (pathDependency.startsWith('dir:')) {
        return {
          kind: STRUCTURED_DEP_KIND.dir,
          pathKey: normalizeAbsolutePathKey(
            pathDependency.slice('dir:'.length)
          ),
        }
      }

      if (pathDependency.startsWith('dir-mtime:')) {
        return {
          kind: STRUCTURED_DEP_KIND.dirMtime,
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

    for (
      let descendantIndex = 0;
      descendantIndex < uniqueLineage.length;
      descendantIndex += 1
    ) {
      const descendantPathKey = uniqueLineage[descendantIndex]
      const descendantPathId = pathIdByPathKey.get(descendantPathKey)
      if (!descendantPathId) {
        continue
      }

      for (
        let ancestorIndex = 0;
        ancestorIndex <= descendantIndex;
        ancestorIndex += 1
      ) {
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

  #shouldAbortInitialization(generation: number): boolean {
    return this.#isClosed || generation !== this.#lifecycleGeneration
  }

  #closeDatabase(database: any): void {
    if (!database || typeof database.close !== 'function') {
      return
    }

    try {
      database.close()
    } catch (error) {
      reportBestEffortError('file-system/cache-sqlite', error)
    }
  }

  async #initialize(generation: number): Promise<void> {
    let didResetCorruptDatabase = false

    for (
      let attempt = 0;
      attempt <= SQLITE_DEFAULTS.initBusyRetries;
      attempt += 1
    ) {
      let database: any

      try {
        await mkdir(dirname(this.#dbPath), { recursive: true })
        if (this.#shouldAbortInitialization(generation)) {
          return
        }

        const sqliteModule = (await loadSqliteModule()) as {
          DatabaseSync?: new (path: string) => any
        }
        if (this.#shouldAbortInitialization(generation)) {
          return
        }
        const DatabaseSync = sqliteModule.DatabaseSync

        if (!DatabaseSync) {
          throw new Error('node:sqlite DatabaseSync is unavailable')
        }

        database = new DatabaseSync(this.#dbPath)
        if (this.#shouldAbortInitialization(generation)) {
          this.#closeDatabase(database)
          return
        }
        this.#clearPreparedStatements()
        this.#clearStructuredDependencyCaches()
        this.#db = database
        database.exec(`PRAGMA busy_timeout = 5000`)
        database.exec(`PRAGMA foreign_keys = ON`)
        database.exec(`PRAGMA journal_mode = WAL`)
        database.exec(`PRAGMA synchronous = NORMAL`)
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

        this.#createCacheTables(database)
        this.#migrateCacheSchema(database, currentSchemaVersion)

        if (currentSchemaVersion !== this.#schemaVersion) {
          database
            .prepare(
              `
              INSERT INTO meta(key, value)
              VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `
            )
            .run('cache_schema_version', String(this.#schemaVersion))
        }
        this.#initializeMissingDependencyMetadata(database)

        await this.#runPruneWithRetries()
        if (this.#shouldAbortInitialization(generation)) {
          if (this.#db === database) {
            this.#db = undefined
          }
          this.#clearPreparedStatements()
          this.#clearStructuredDependencyCaches()
          this.#closeDatabase(database)
          return
        }
        this.#availability = 'available'
        return
      } catch (error) {
        const shouldAbort = this.#shouldAbortInitialization(generation)
        this.#clearPreparedStatements()
        this.#clearStructuredDependencyCaches()
        if (this.#db === database) {
          this.#db = undefined
        }
        this.#closeDatabase(database)

        if (shouldAbort) {
          return
        }

        if (
          attempt < SQLITE_DEFAULTS.initBusyRetries &&
          isSqliteBusyOrLockedError(error)
        ) {
          this.#emitBusyRetryTelemetry('initialize', attempt + 1, error)
          const retryDelay = Math.min(
            SQLITE_DEFAULTS.initBusyRetryMaxDelayMs,
            (attempt + 1) * SQLITE_DEFAULTS.initBusyRetryDelayMs
          )
          await delay(retryDelay)
          continue
        }

        if (!didResetCorruptDatabase && isSqliteCorruptionError(error)) {
          didResetCorruptDatabase = true

          try {
            await resetSqliteDatabaseFiles(this.#dbPath)
            emitTelemetryCounter({
              name: 'renoun.cache.sqlite.auto_reset_count',
              tags: {
                reason: getSqliteErrorCategory(error),
              },
            })
            continue
          } catch (resetError) {
            reportBestEffortError('file-system/cache-sqlite-reset', resetError)
          }
        }

        this.#availability = 'unavailable'
        emitTelemetryCounter({
          name: 'renoun.cache.sqlite.fallback_to_memory_count',
          tags: {
            reason: getSqliteErrorCategory(error),
          },
        })
        if (!warnedAboutSqliteFallback) {
          warnedAboutSqliteFallback = true
          if (this.#debugCachePersistence) {
            // eslint-disable-next-line no-console
            console.error(
              '[renoun-debug] failed to initialize sqlite cache',
              this.#dbPath,
              error instanceof Error ? error.message : String(error)
            )
          }
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
    this.#ensureCacheEntriesColumns(database)
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

  #migrateCacheSchema(
    database: any,
    currentSchemaVersion: number | undefined
  ): void {
    const migrationStartedAt = Date.now()
    this.#ensureCacheEntriesColumns(database)

    const copiedLegacyDependencyRows =
      this.#copyLegacyDependenciesIntoV2(database)
    const hasNullStructuredDependencyTermIds =
      this.#hasNullStructuredDependencyTermIds()
    const backfilledStructuredDependencyRows =
      copiedLegacyDependencyRows > 0 ||
      hasNullStructuredDependencyTermIds ||
      currentSchemaVersion !== this.#schemaVersion
        ? this.#backfillStructuredDependencyTermIds()
        : 0

    const migrated =
      copiedLegacyDependencyRows > 0 ||
      backfilledStructuredDependencyRows > 0 ||
      currentSchemaVersion !== this.#schemaVersion

    if (!migrated) {
      return
    }

    const migrationDurationMs = Date.now() - migrationStartedAt
    emitTelemetryCounter({
      name: 'renoun.cache.sqlite.schema_migration_count',
      tags: {
        from:
          typeof currentSchemaVersion === 'number' &&
          Number.isFinite(currentSchemaVersion)
            ? String(currentSchemaVersion)
            : 'unset',
        to: String(this.#schemaVersion),
      },
    })
    emitTelemetryHistogram({
      name: 'renoun.cache.sqlite.schema_migration_ms',
      value: migrationDurationMs,
      tags: {
        from:
          typeof currentSchemaVersion === 'number' &&
          Number.isFinite(currentSchemaVersion)
            ? String(currentSchemaVersion)
            : 'unset',
        to: String(this.#schemaVersion),
      },
    })
  }

  #tableExists(database: any, tableName: string): boolean {
    const row = database
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table' AND name = ?
        `
      )
      .get(tableName) as { name?: unknown } | undefined
    return typeof row?.name === 'string'
  }

  #getTableColumnNames(database: any, tableName: string): Set<string> {
    if (!isSafeSqliteIdentifier(tableName)) {
      return new Set()
    }

    const rows = database
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{
      name?: unknown
    }>
    const columnNames = new Set<string>()
    for (const row of rows) {
      if (typeof row.name === 'string') {
        columnNames.add(row.name)
      }
    }
    return columnNames
  }

  #ensureCacheEntriesColumns(database: any): void {
    if (!this.#tableExists(database, 'cache_entries')) {
      return
    }

    const columnNames = this.#getTableColumnNames(database, 'cache_entries')
    const shouldBackfillLegacyPersist = !columnNames.has('persist')
    if (!columnNames.has('persist')) {
      database.exec(
        `ALTER TABLE cache_entries ADD COLUMN persist INTEGER NOT NULL DEFAULT 1`
      )
    }
    if (!columnNames.has('workspace_change_token')) {
      database.exec(
        `ALTER TABLE cache_entries ADD COLUMN workspace_change_token TEXT`
      )
    }
    if (!columnNames.has('revision')) {
      database.exec(
        `ALTER TABLE cache_entries ADD COLUMN revision INTEGER NOT NULL DEFAULT 0`
      )
    }
    if (!columnNames.has('last_accessed_at')) {
      database.exec(
        `ALTER TABLE cache_entries ADD COLUMN last_accessed_at INTEGER NOT NULL DEFAULT 0`
      )
    }

    database
      .prepare(
        `
          UPDATE cache_entries
          SET last_accessed_at = updated_at
          WHERE last_accessed_at IS NULL OR last_accessed_at <= 0
        `
      )
      .run()

    if (shouldBackfillLegacyPersist) {
      database
        .prepare(
          `
            UPDATE cache_entries
            SET persist = 1
            WHERE persist IS NULL OR persist = 0
          `
        )
        .run()
    }
  }

  #copyLegacyDependenciesIntoV2(database: any): number {
    if (!this.#tableExists(database, 'cache_deps')) {
      return 0
    }

    const rows = database
      .prepare(
        `
          SELECT
            deps.node_key as node_key,
            deps.dep_key as dep_key,
            deps.dep_version as dep_version
          FROM cache_deps AS deps
          JOIN cache_entries AS entry
            ON entry.node_key = deps.node_key
          ORDER BY deps.node_key, deps.dep_key
        `
      )
      .all() as Array<{
      node_key?: unknown
      dep_key?: unknown
      dep_version?: unknown
    }>
    if (rows.length === 0) {
      database.exec(`DROP TABLE IF EXISTS cache_deps`)
      return 0
    }

    const insertDependency = this.#prepareStatement(
      `
        INSERT INTO cache_entry_deps_v2 (node_key, dep_key, dep_term_id, dep_version)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(node_key, dep_key) DO UPDATE SET
          dep_term_id = excluded.dep_term_id,
          dep_version = excluded.dep_version
      `
    )

    let copiedRowCount = 0
    for (const row of rows) {
      if (typeof row.node_key !== 'string' || typeof row.dep_key !== 'string') {
        continue
      }

      const depVersion =
        typeof row.dep_version === 'string'
          ? row.dep_version
          : String(row.dep_version ?? '')
      const parsedDependency = this.#parseStructuredPathDependencyTerm(
        row.dep_key
      )
      let depTermId: number | null = null

      if (parsedDependency) {
        const pathId = this.#ensurePathClosureForPath(parsedDependency.pathKey)
        if (Number.isFinite(pathId) && pathId > 0) {
          const resolvedDepTermId = this.#getOrCreateDepTermId(
            parsedDependency.kind,
            pathId,
            parsedDependency.pathKey
          )
          if (Number.isFinite(resolvedDepTermId) && resolvedDepTermId > 0) {
            depTermId = resolvedDepTermId
          }
        }
      }

      insertDependency.run(row.node_key, row.dep_key, depTermId, depVersion)
      copiedRowCount += 1
    }

    database.exec(`DROP TABLE IF EXISTS cache_deps`)
    return copiedRowCount
  }

  #hasNullStructuredDependencyTermIds(): boolean {
    if (!this.#db) {
      return false
    }

    const row = this.#prepareStatement(
      `
          SELECT 1 as has_row
          FROM cache_entry_deps_v2
          WHERE dep_term_id IS NULL
          LIMIT 1
        `
    ).get() as { has_row?: unknown } | undefined

    return Number(row?.has_row ?? 0) === 1
  }

  #backfillStructuredDependencyTermIds(): number {
    if (!this.#db) {
      return 0
    }

    const rows = this.#prepareStatement(
      `
          SELECT node_key as node_key, dep_key as dep_key
          FROM cache_entry_deps_v2
          WHERE dep_term_id IS NULL
          ORDER BY node_key, dep_key
        `
    ).all() as Array<{ node_key?: unknown; dep_key?: unknown }>
    if (rows.length === 0) {
      return 0
    }

    const updateDepTermId = this.#prepareStatement(
      `
        UPDATE cache_entry_deps_v2
        SET dep_term_id = ?
        WHERE node_key = ? AND dep_key = ?
      `
    )

    let backfilledRowCount = 0
    for (const row of rows) {
      if (typeof row.node_key !== 'string' || typeof row.dep_key !== 'string') {
        continue
      }

      const parsedDependency = this.#parseStructuredPathDependencyTerm(
        row.dep_key
      )
      if (!parsedDependency) {
        continue
      }

      const pathId = this.#ensurePathClosureForPath(parsedDependency.pathKey)
      if (!Number.isFinite(pathId) || pathId <= 0) {
        continue
      }

      const depTermId = this.#getOrCreateDepTermId(
        parsedDependency.kind,
        pathId,
        parsedDependency.pathKey
      )
      if (!Number.isFinite(depTermId) || depTermId <= 0) {
        continue
      }

      const updateResult = updateDepTermId.run(
        depTermId,
        row.node_key,
        row.dep_key
      ) as { changes?: unknown }
      const changes = Number(updateResult?.changes ?? 0)
      if (Number.isFinite(changes) && changes > 0) {
        backfilledRowCount += 1
      }
    }

    return backfilledRowCount
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
        SQLITE_META_KEYS.missingDependencyEntryCount,
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
      .run(SQLITE_META_KEYS.invalidationSequence)
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
      now - this.#lastPrunedAt >= SQLITE_DEFAULTS.pruneMaxIntervalMs

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
    const pruneStartedAt = Date.now()
    for (
      let attempt = 0;
      attempt <= SQLITE_DEFAULTS.busyRetries;
      attempt += 1
    ) {
      try {
        const pruneMetrics = await this.#pruneStaleEntries()
        const pruneDurationMs = Date.now() - pruneStartedAt
        const retryCount = attempt
        const deletedEntryRows =
          pruneMetrics.staleRowsDeleted + pruneMetrics.overflowRowsDeleted

        emitTelemetryCounter({
          name: 'renoun.cache.sqlite.prune_count',
          tags: {
            retries: String(retryCount),
            compaction: pruneMetrics.compactionTriggered ? 'true' : 'false',
          },
        })
        emitTelemetryHistogram({
          name: 'renoun.cache.sqlite.prune_ms',
          value: pruneDurationMs,
          tags: {
            retries: String(retryCount),
            compaction: pruneMetrics.compactionTriggered ? 'true' : 'false',
          },
        })
        if (deletedEntryRows > 0) {
          emitTelemetryCounter({
            name: 'renoun.cache.sqlite.prune_deleted_rows',
            value: deletedEntryRows,
            tags: {
              table: 'cache_entries',
            },
          })
        }
        if (pruneMetrics.inflightRowsDeleted > 0) {
          emitTelemetryCounter({
            name: 'renoun.cache.sqlite.prune_deleted_rows',
            value: pruneMetrics.inflightRowsDeleted,
            tags: {
              table: 'cache_inflight',
            },
          })
        }

        this.#lastPrunedAt = Date.now()
        return
      } catch (error) {
        const busyOrLocked = isSqliteBusyOrLockedError(error)
        if (!busyOrLocked) {
          throw error
        }
        if (attempt >= SQLITE_DEFAULTS.busyRetries) {
          this.#emitBusyRetriesExhaustedTelemetry('prune', attempt + 1, error)
          throw error
        }

        this.#emitBusyRetryTelemetry('prune', attempt + 1, error)
        await delay((attempt + 1) * SQLITE_DEFAULTS.busyRetryDelayMs)
      }
    }

    throw new Error('[renoun] Exhausted SQLITE busy retries for cache pruning.')
  }

  async #touchLastAccessed(nodeKey: string): Promise<void> {
    if (!this.#db) {
      return
    }

    const now = Date.now()
    const lastTouchedAt = this.#lastAccessTouchAtByNodeKey.get(nodeKey)
    if (
      typeof lastTouchedAt === 'number' &&
      now - lastTouchedAt < SQLITE_DEFAULTS.lastAccessedTouchMinIntervalMs
    ) {
      return
    }

    await this.#runWithBusyRetries(() => {
      this.#prepareStatement(
        `
            UPDATE cache_entries
            SET last_accessed_at = CASE
              WHEN last_accessed_at >= ? THEN last_accessed_at + 1
              ELSE ?
            END
            WHERE node_key = ?
          `
      ).run(now, now, nodeKey)
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
      SQLITE_DEFAULTS.lastAccessedTouchCacheMaxSize
    ) {
      return
    }

    const staleBefore = now - SQLITE_DEFAULTS.lastAccessedTouchMinIntervalMs * 4
    for (const [nodeKey, touchedAt] of this.#lastAccessTouchAtByNodeKey) {
      if (
        this.#lastAccessTouchAtByNodeKey.size <=
        SQLITE_DEFAULTS.lastAccessedTouchCacheMaxSize
      ) {
        break
      }

      if (touchedAt < staleBefore) {
        this.#lastAccessTouchAtByNodeKey.delete(nodeKey)
      }
    }

    while (
      this.#lastAccessTouchAtByNodeKey.size >
      SQLITE_DEFAULTS.lastAccessedTouchCacheMaxSize
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
      this.#pathIdByPathKey.size > SQLITE_DEFAULTS.structuredPathIdCacheMaxSize
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
      SQLITE_DEFAULTS.structuredDepTermIdCacheMaxSize
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
      SQLITE_DEFAULTS.structuredPathClosureSeededCacheMaxSize
    ) {
      const oldestPathKey = this.#seededPathClosureByPathKey.values().next()
      if (typeof oldestPathKey.value !== 'string') {
        break
      }
      this.#seededPathClosureByPathKey.delete(oldestPathKey.value)
    }
  }

  #emitBusyRetryTelemetry(
    operationName: string,
    retryIndex: number,
    error: unknown
  ): void {
    emitTelemetryCounter({
      name: 'renoun.cache.sqlite.busy_retry_count',
      tags: {
        operation: operationName,
        retry: String(Math.max(1, Math.floor(retryIndex))),
        reason: getSqliteErrorCategory(error),
      },
    })
  }

  #emitBusyRetriesExhaustedTelemetry(
    operationName: string,
    attempts: number,
    error: unknown
  ): void {
    emitTelemetryCounter({
      name: 'renoun.cache.sqlite.busy_retry_exhausted_count',
      tags: {
        operation: operationName,
        reason: getSqliteErrorCategory(error),
      },
    })
    emitTelemetryHistogram({
      name: 'renoun.cache.sqlite.busy_retry_attempts',
      value: Math.max(1, Math.floor(attempts)),
      tags: {
        operation: operationName,
      },
    })
  }

  async #runWithBusyRetries<T>(
    operation: () => T,
    options: { operationName?: string } = {}
  ): Promise<T> {
    const operationName = options.operationName ?? 'sqlite_operation'
    for (
      let attempt = 0;
      attempt <= SQLITE_DEFAULTS.busyRetries;
      attempt += 1
    ) {
      try {
        return operation()
      } catch (error) {
        const busyOrLocked = isSqliteBusyOrLockedError(error)
        if (!busyOrLocked) {
          throw error
        }
        if (attempt >= SQLITE_DEFAULTS.busyRetries) {
          this.#emitBusyRetriesExhaustedTelemetry(
            operationName,
            attempt + 1,
            error
          )
          throw error
        }

        this.#emitBusyRetryTelemetry(operationName, attempt + 1, error)
        await delay((attempt + 1) * SQLITE_DEFAULTS.busyRetryDelayMs)
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
      now - this.#lastInflightCleanupAt <
        SQLITE_DEFAULTS.inflightCleanupIntervalMs
    ) {
      return
    }

    this.#prepareStatement(
      `DELETE FROM cache_inflight WHERE expires_at <= ?`
    ).run(now)
    this.#lastInflightCleanupAt = now
  }

  async #pruneStaleEntries(): Promise<SqlitePruneMetrics> {
    if (!this.#db) {
      return {
        staleRowsDeleted: 0,
        overflowRowsDeleted: 0,
        inflightRowsDeleted: 0,
        compactionTriggered: false,
      }
    }

    const pruneStartedAt = Date.now()
    const staleBefore = pruneStartedAt - this.#maxAgeMs
    let shouldCompactStructuredDependencyTables = false
    let staleRowsDeleted = 0
    let overflowRowsDeleted = 0
    let inflightRowsDeleted = 0

    this.#db.exec('BEGIN IMMEDIATE')
    try {
      const staleNodes = this.#prepareStatement(
        `
            SELECT node_key
            FROM cache_entries
            WHERE last_accessed_at < ?
          `
      ).all(staleBefore) as Array<{ node_key?: string }>
      const staleNodeKeys = staleNodes
        .map((row) => row.node_key)
        .filter((nodeKey: string | undefined): nodeKey is string => {
          return typeof nodeKey === 'string'
        })
      const staleCount = staleNodeKeys.length

      if (staleCount > 0) {
        this.#deleteRowsForNodeKeys(staleNodeKeys)
        shouldCompactStructuredDependencyTables = true
        staleRowsDeleted = staleCount
      }

      const countRow = this.#prepareStatement(
        `SELECT COUNT(*) as total FROM cache_entries`
      ).get() as { total?: number }
      const totalRows = Number(countRow?.total ?? 0)
      const overflow = totalRows - this.#maxRows

      if (overflow > 0) {
        const overflowRows = this.#prepareStatement(
          `
              SELECT node_key
              FROM cache_entries
              ORDER BY last_accessed_at ASC, updated_at ASC, node_key ASC
              LIMIT ?
            `
        ).all(overflow) as Array<{ node_key?: string }>

        const victimNodeKeys = overflowRows
          .map((row) => row.node_key)
          .filter((nodeKey: string | undefined): nodeKey is string => {
            return typeof nodeKey === 'string'
          })

        this.#deleteRowsForNodeKeys(victimNodeKeys)
        shouldCompactStructuredDependencyTables = true
        overflowRowsDeleted = victimNodeKeys.length
      }

      const expiredInflightNodeKeys = this.#prepareStatement(
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
      inflightRowsDeleted = expiredInflightNodeKeys.length
      this.#deleteInflightRowsForNodeKeys(expiredInflightNodeKeys)

      this.#db.exec('COMMIT')
    } catch (error) {
      try {
        this.#db.exec('ROLLBACK')
      } catch (error) {
        reportBestEffortError('file-system/cache-sqlite', error)
      }
      throw error
    }

    if (shouldCompactStructuredDependencyTables) {
      await this.#runStructuredDependencyCompactionWithRetries()
    }

    return {
      staleRowsDeleted,
      overflowRowsDeleted,
      inflightRowsDeleted,
      compactionTriggered: shouldCompactStructuredDependencyTables,
    }
  }

  async #runStructuredDependencyCompactionWithRetries(): Promise<void> {
    if (!this.#db) {
      return
    }

    const compactionStartedAt = Date.now()
    for (
      let attempt = 0;
      attempt <= SQLITE_DEFAULTS.busyRetries;
      attempt += 1
    ) {
      try {
        this.#db.exec('BEGIN IMMEDIATE')
        try {
          this.#compactStructuredDependencyTables()
          this.#db.exec('COMMIT')
          const compactionDurationMs = Date.now() - compactionStartedAt
          emitTelemetryCounter({
            name: 'renoun.cache.sqlite.compaction_count',
            tags: {
              retries: String(attempt),
            },
          })
          emitTelemetryHistogram({
            name: 'renoun.cache.sqlite.compaction_ms',
            value: compactionDurationMs,
            tags: {
              retries: String(attempt),
            },
          })
          return
        } catch (error) {
          try {
            this.#db.exec('ROLLBACK')
          } catch (error) {
            reportBestEffortError('file-system/cache-sqlite', error)
          }
          throw error
        }
      } catch (error) {
        const busyOrLocked = isSqliteBusyOrLockedError(error)
        if (!busyOrLocked) {
          throw error
        }
        if (attempt >= SQLITE_DEFAULTS.busyRetries) {
          this.#emitBusyRetriesExhaustedTelemetry(
            'compaction',
            attempt + 1,
            error
          )
          throw error
        }

        this.#emitBusyRetryTelemetry('compaction', attempt + 1, error)
        await delay((attempt + 1) * SQLITE_DEFAULTS.busyRetryDelayMs)
      }
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
    this.#isClosed = true
    this.#lifecycleGeneration += 1
    this.#pruneInFlight = undefined
    this.#lastAccessTouchAtByNodeKey.clear()
    this.#clearStructuredDependencyCaches()
    this.#clearPreparedStatements()
    this.#db = undefined
    this.#availability = 'unavailable'

    this.#closeDatabase(database)
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
    if (preparedStatement && typeof preparedStatement.finalize === 'function') {
      try {
        preparedStatement.finalize()
      } catch (error) {
        reportBestEffortError('file-system/cache-sqlite', error)
      }
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

    const row = this.#prepareStatement(
      `SELECT value FROM meta WHERE key = ?`
    ).get(SQLITE_META_KEYS.missingDependencyEntryCount) as
      | { value?: unknown }
      | undefined
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
    ).run(SQLITE_META_KEYS.missingDependencyEntryCount)
    this.#prepareStatement(
      `
        UPDATE meta
        SET value = CAST(MAX(0, CAST(value AS INTEGER) + ?) AS TEXT)
        WHERE key = ?
      `
    ).run(delta, SQLITE_META_KEYS.missingDependencyEntryCount)
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
      offset += SQLITE_DEFAULTS.deleteBatchSize
    ) {
      const batch = uniqueNodeKeys.slice(
        offset,
        offset + SQLITE_DEFAULTS.deleteBatchSize
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
      this.#adjustMissingDependencyMetadataCount(
        -missingDependencyCountForBatch
      )
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
      offset += SQLITE_DEFAULTS.deleteBatchSize
    ) {
      const batch = uniqueNodeKeys.slice(
        offset,
        offset + SQLITE_DEFAULTS.deleteBatchSize
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
    SQLITE_DEFAULTS.preparedStatementCacheMax
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

  if (value.length !== HASH_STRING_HEX_LENGTH) {
    return undefined
  }

  if (!/^[0-9a-f]+$/.test(value)) {
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

function isSqliteCorruptionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const candidateError = error as {
    code?: number | string
    errno?: number | string
    resultCode?: number | string
    extendedResultCode?: number | string
  }

  const isCorruptSqliteCode = (code: unknown): boolean => {
    if (typeof code === 'number') {
      return code === 11 || code === 26
    }

    if (typeof code !== 'string') {
      return false
    }

    const normalizedCode = code.toUpperCase()
    if (
      normalizedCode.includes('SQLITE_CORRUPT') ||
      normalizedCode.includes('SQLITE_NOTADB')
    ) {
      return true
    }

    const parsedCode = Number.parseInt(normalizedCode, 10)
    return parsedCode === 11 || parsedCode === 26
  }

  if (
    isCorruptSqliteCode(candidateError.code) ||
    isCorruptSqliteCode(candidateError.errno) ||
    isCorruptSqliteCode(candidateError.resultCode) ||
    isCorruptSqliteCode(candidateError.extendedResultCode)
  ) {
    return true
  }

  const normalizedMessage = error.message.toLowerCase()
  return (
    normalizedMessage.includes('malformed') ||
    normalizedMessage.includes('not a database') ||
    normalizedMessage.includes('file is not a database') ||
    normalizedMessage.includes('database disk image is malformed')
  )
}

async function resetSqliteDatabaseFiles(dbPath: string): Promise<void> {
  for (const suffix of SQLITE_DATABASE_FILE_SUFFIXES) {
    await rm(`${dbPath}${suffix}`, { force: true })
  }
}

const SQLITE_CHECKPOINT_MODES: SqliteCheckpointMode[] = [
  'PASSIVE',
  'FULL',
  'RESTART',
  'TRUNCATE',
]

interface ResolvedSqliteMaintenanceOptions {
  checkpoint: boolean
  vacuum: boolean
  checkpointMode: SqliteCheckpointMode
  quickCheck: boolean
  integrityCheck: boolean
}

function resolveSqliteMaintenanceOptions(
  options: SqliteCacheMaintenanceOptions
): ResolvedSqliteMaintenanceOptions {
  const checkpoint =
    typeof options.checkpoint === 'boolean' ? options.checkpoint : true
  const vacuum = typeof options.vacuum === 'boolean' ? options.vacuum : false
  const quickCheck =
    typeof options.quickCheck === 'boolean' ? options.quickCheck : false
  const integrityCheck =
    typeof options.integrityCheck === 'boolean' ? options.integrityCheck : false

  return {
    checkpoint,
    vacuum,
    checkpointMode: resolveSqliteCheckpointMode(options.checkpointMode),
    quickCheck,
    integrityCheck,
  }
}

function resolveSqliteCheckpointMode(
  mode: SqliteCheckpointMode | undefined
): SqliteCheckpointMode {
  if (typeof mode !== 'string') {
    return 'PASSIVE'
  }

  const normalizedMode = mode.toUpperCase() as SqliteCheckpointMode
  if (SQLITE_CHECKPOINT_MODES.includes(normalizedMode)) {
    return normalizedMode
  }

  return 'PASSIVE'
}

function getSqliteErrorCategory(error: unknown): string {
  if (isSqliteBusyOrLockedError(error)) {
    return 'busy_or_locked'
  }

  if (isSqliteCorruptionError(error)) {
    return 'corrupt_or_notadb'
  }

  if (error instanceof Error) {
    const candidateError = error as {
      code?: unknown
      errno?: unknown
      resultCode?: unknown
      extendedResultCode?: unknown
    }
    const rawCode =
      candidateError.code ??
      candidateError.errno ??
      candidateError.resultCode ??
      candidateError.extendedResultCode
    if (typeof rawCode === 'number' && Number.isFinite(rawCode)) {
      return String(Math.floor(rawCode))
    }

    if (typeof rawCode === 'string') {
      const normalizedCode = rawCode.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
      if (normalizedCode.length > 0) {
        return normalizedCode.slice(0, 64)
      }
    }

    const normalizedMessage = error.message.toLowerCase()
    if (normalizedMessage.includes('readonly')) {
      return 'readonly'
    }
    if (normalizedMessage.includes('syntax')) {
      return 'syntax'
    }
  }

  return 'unknown'
}

function isSafeSqliteIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
}

function getCacheNodeNamespace(nodeKey: string): string {
  const separatorIndex = nodeKey.indexOf(':')
  if (separatorIndex <= 0) {
    return 'unknown'
  }

  return nodeKey.slice(0, separatorIndex)
}

function resolveSqlitePersistenceOptions(
  options: CacheStoreSqliteOptions
): ResolvedSqlitePersistenceOptions {
  return {
    dbPath: resolveDbPath(options),
    schemaVersion: options.schemaVersion ?? CACHE_SCHEMA_VERSION,
    maxAgeMs: options.maxAgeMs ?? SQLITE_DEFAULTS.cacheMaxAgeMs,
    maxRows: options.maxRows ?? SQLITE_DEFAULTS.maxRows,
    preparedStatementCacheMax: options.preparedStatementCacheMax,
    structuredIdCacheEnabled: options.structuredIdCacheEnabled,
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
    first.maxRows === second.maxRows &&
    first.preparedStatementCacheMax === second.preparedStatementCacheMax &&
    first.structuredIdCacheEnabled === second.structuredIdCacheEnabled
  )
}
