const SQLITE_EXPERIMENTAL_WARNING = `SQLite is an experimental feature and might change at any time`

type SqliteModule = typeof import('node:sqlite')
type EmitWarningArguments = Parameters<typeof process.emitWarning>

let sqliteModulePromise: Promise<SqliteModule> | null = null

function getWarningMessage(
  warning: EmitWarningArguments[0]
): string | undefined {
  if (typeof warning === 'string') {
    return warning
  }

  if (typeof warning?.message === 'string') {
    return warning.message
  }

  return undefined
}

function getWarningType(args: EmitWarningArguments): string | undefined {
  const [warning, type] = args

  if (typeof type === 'string') {
    return type
  }

  if (typeof warning === 'object' && warning !== null) {
    if (typeof warning.name === 'string') {
      return warning.name
    }
  }

  return undefined
}

export function shouldSuppressSqliteExperimentalWarning(
  args: EmitWarningArguments,
  options: {
    alreadySuppressed?: boolean
  } = {}
): boolean {
  if (options.alreadySuppressed === true) {
    return false
  }

  return (
    getWarningMessage(args[0]) === SQLITE_EXPERIMENTAL_WARNING &&
    getWarningType(args) === 'ExperimentalWarning'
  )
}

function loadSqliteModuleWithoutWarningNoise(): Promise<SqliteModule> {
  if (
    typeof process === 'undefined' ||
    typeof process.emitWarning !== 'function'
  ) {
    return import('node:sqlite')
  }

  const originalEmitWarning = process.emitWarning
  let didSuppressSqliteExperimentalWarning = false
  const filteredEmitWarning = ((
    ...args: Parameters<typeof process.emitWarning>
  ) => {
    if (
      shouldSuppressSqliteExperimentalWarning(args, {
        alreadySuppressed: didSuppressSqliteExperimentalWarning,
      })
    ) {
      didSuppressSqliteExperimentalWarning = true
      return
    }

    return Reflect.apply(originalEmitWarning, process, args)
  }) as typeof process.emitWarning
  process.emitWarning = filteredEmitWarning

  return import('node:sqlite').finally(() => {
    if (process.emitWarning === filteredEmitWarning) {
      process.emitWarning = originalEmitWarning
    }
  })
}

export async function loadSqliteModule(): Promise<SqliteModule> {
  if (!sqliteModulePromise) {
    sqliteModulePromise = loadSqliteModuleWithoutWarningNoise().catch(
      (error) => {
        sqliteModulePromise = null
        throw error
      }
    )
  }

  return sqliteModulePromise
}
