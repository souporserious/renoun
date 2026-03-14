import {
  runSqliteCacheMaintenance,
  type SqliteCheckpointMode,
} from '../file-system/CacheSqlite.ts'

const CACHE_MAINTENANCE_USAGE =
  `Usage: renoun cache-maintenance [--checkpoint] [--quick-check] [--integrity-check] [--vacuum] [--db-path <path>] [--json]\n` +
  `       renoun cache-maintenance [--checkpoint-mode <mode>] [--db-path <path>] [--json]\n` +
  `Modes: passive | full | restart | truncate`

const ALLOWED_CHECKPOINT_MODES = new Set<SqliteCheckpointMode>([
  'PASSIVE',
  'FULL',
  'RESTART',
  'TRUNCATE',
])

function readRequiredOptionValue(
  arguments_: string[],
  index: number,
  option: '--db-path' | '--checkpoint-mode'
): string {
  const value = arguments_[index + 1]
  if (!value || value.startsWith('-')) {
    throw new Error(
      `[renoun] Missing value for ${option}.\n${CACHE_MAINTENANCE_USAGE}`
    )
  }
  return value
}

function parseCheckpointMode(value: string): SqliteCheckpointMode {
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

  return normalizedMode
}

export async function runCacheMaintenanceCommand(
  arguments_: string[] = []
): Promise<void> {
  let shouldOutputJson = false
  let checkpoint: boolean | undefined
  let vacuum: boolean | undefined
  let quickCheck: boolean | undefined
  let integrityCheck: boolean | undefined
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
    if (argument === '--quick-check') {
      quickCheck = true
      continue
    }
    if (argument === '--integrity-check') {
      integrityCheck = true
      continue
    }
    if (argument === '--db-path') {
      dbPath = readRequiredOptionValue(arguments_, index, '--db-path')
      index += 1
      continue
    }
    if (argument.startsWith('--db-path=')) {
      const value = argument.slice('--db-path='.length)
      if (!value) {
        throw new Error(
          `[renoun] Missing value for --db-path.\n${CACHE_MAINTENANCE_USAGE}`
        )
      }
      dbPath = value
      continue
    }
    if (argument === '--checkpoint-mode') {
      checkpointMode = parseCheckpointMode(
        readRequiredOptionValue(arguments_, index, '--checkpoint-mode')
      )
      index += 1
      continue
    }
    if (argument.startsWith('--checkpoint-mode=')) {
      checkpointMode = parseCheckpointMode(
        argument.slice('--checkpoint-mode='.length)
      )
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
    quickCheck: quickCheck ?? false,
    integrityCheck: integrityCheck ?? false,
  })

  if (!result.available) {
    if (shouldOutputJson) {
      console.log(JSON.stringify(result, null, 2))
    }
    throw new Error(
      `[renoun] SQLite cache maintenance is unavailable at ${result.dbPath}.`
    )
  }

  const failedHealthChecks = [
    result.quickCheck.executed && !result.quickCheck.ok
      ? {
          name: 'quick_check',
          errors: result.quickCheck.errors,
        }
      : null,
    result.integrityCheck.executed && !result.integrityCheck.ok
      ? {
          name: 'integrity_check',
          errors: result.integrityCheck.errors,
        }
      : null,
  ].filter(
    (
      value
    ): value is {
      name: string
      errors: string[]
    } => value !== null
  )

  if (shouldOutputJson) {
    console.log(JSON.stringify(result, null, 2))
    if (failedHealthChecks.length > 0) {
      throw new Error(
        `[renoun] SQLite health check failed at ${result.dbPath}: ${failedHealthChecks
          .map((check) => `${check.name}=${check.errors.join(' | ')}`)
          .join('; ')}`
      )
    }
    return
  }

  const operations: string[] = []
  if (result.checkpoint.executed) {
    operations.push(`checkpoint:${result.checkpoint.mode.toLowerCase()}`)
  }
  if (result.quickCheck.executed) {
    operations.push(`quick-check:${result.quickCheck.ok ? 'ok' : 'failed'}`)
  }
  if (result.integrityCheck.executed) {
    operations.push(
      `integrity-check:${result.integrityCheck.ok ? 'ok' : 'failed'}`
    )
  }
  if (result.vacuum.executed) {
    operations.push('vacuum')
  }

  if (failedHealthChecks.length > 0) {
    throw new Error(
      `[renoun] SQLite health check failed at ${result.dbPath}: ${failedHealthChecks
        .map((check) => `${check.name}=${check.errors.join(' | ')}`)
        .join('; ')}`
    )
  }

  console.log(
    `[renoun] SQLite cache maintenance completed (${operations.join(', ') || 'no-op'}) at ${result.dbPath}`
  )
}
