import {
  runSqliteCacheMaintenance,
  type SqliteCheckpointMode,
} from '../file-system/CacheSqlite.ts'

const CACHE_MAINTENANCE_USAGE =
  `Usage: renoun cache-maintenance [--checkpoint] [--vacuum] [--db-path <path>] [--json]\n` +
  `       renoun cache-maintenance [--checkpoint-mode <mode>] [--db-path <path>] [--json]\n` +
  `Modes: passive | full | restart | truncate`

const ALLOWED_CHECKPOINT_MODES = new Set<SqliteCheckpointMode>([
  'PASSIVE',
  'FULL',
  'RESTART',
  'TRUNCATE',
])

export async function runCacheMaintenanceCommand(
  arguments_: string[] = []
): Promise<void> {
  let shouldOutputJson = false
  let checkpoint: boolean | undefined
  let vacuum: boolean | undefined
  let dbPath: string | undefined
  let checkpointMode: SqliteCheckpointMode | undefined

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]

    if (argument === '--json') {
      shouldOutputJson = true
      continue
    }
    if (argument === '--checkpoint') {
      checkpoint = true
      continue
    }
    if (argument === '--no-checkpoint') {
      checkpoint = false
      continue
    }
    if (argument === '--vacuum') {
      vacuum = true
      continue
    }
    if (argument === '--no-vacuum') {
      vacuum = false
      continue
    }
    if (argument === '--db-path') {
      const value = arguments_[index + 1]
      if (!value) {
        throw new Error(
          `[renoun] Missing value for --db-path.\n${CACHE_MAINTENANCE_USAGE}`
        )
      }
      dbPath = value
      index += 1
      continue
    }
    if (argument === '--checkpoint-mode') {
      const value = arguments_[index + 1]
      if (!value) {
        throw new Error(
          `[renoun] Missing value for --checkpoint-mode.\n${CACHE_MAINTENANCE_USAGE}`
        )
      }

      const normalizedMode = value.toUpperCase() as SqliteCheckpointMode
      if (!ALLOWED_CHECKPOINT_MODES.has(normalizedMode)) {
        throw new Error(
          `[renoun] Unsupported checkpoint mode "${value}".\n${CACHE_MAINTENANCE_USAGE}`
        )
      }

      checkpointMode = normalizedMode
      index += 1
      continue
    }
    if (argument === '--help' || argument === '-h') {
      console.log(CACHE_MAINTENANCE_USAGE)
      return
    }

    throw new Error(
      `[renoun] Unknown option "${argument}".\n${CACHE_MAINTENANCE_USAGE}`
    )
  }

  const result = await runSqliteCacheMaintenance({
    dbPath,
    checkpoint: checkpoint ?? true,
    vacuum: vacuum ?? false,
    checkpointMode,
  })

  if (shouldOutputJson) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  const operations: string[] = []
  if (result.checkpoint.executed) {
    operations.push(`checkpoint:${result.checkpoint.mode.toLowerCase()}`)
  }
  if (result.vacuum.executed) {
    operations.push('vacuum')
  }

  console.log(
    `[renoun] SQLite cache maintenance completed (${operations.join(', ') || 'no-op'}) at ${result.dbPath}`
  )
}
