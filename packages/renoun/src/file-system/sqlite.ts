const SQLITE_EXPERIMENTAL_WARNING = `SQLite is an experimental feature and might change at any time`

type SqliteModule = typeof import('node:sqlite')

let sqliteModulePromise: Promise<SqliteModule> | null = null
let warningFilterInstalled = false

function installSqliteExperimentalWarningFilter() {
  if (
    warningFilterInstalled ||
    typeof process === 'undefined' ||
    typeof process.emitWarning !== 'function'
  ) {
    return
  }

  warningFilterInstalled = true

  const originalEmitWarning = process.emitWarning.bind(process)

  process.emitWarning = ((...args: Parameters<typeof process.emitWarning>) => {
    const [warning] = args

    const message =
      typeof warning === 'string'
        ? warning
        : typeof warning?.message === 'string'
          ? warning.message
          : undefined

    if (
      typeof message === 'string' &&
      message.includes(SQLITE_EXPERIMENTAL_WARNING)
    ) {
      return
    }

    return originalEmitWarning(...args)
  }) as typeof process.emitWarning
}

export async function loadSqliteModule(): Promise<SqliteModule> {
  installSqliteExperimentalWarningFilter()

  if (!sqliteModulePromise) {
    sqliteModulePromise = import('node:sqlite')
  }

  return sqliteModulePromise
}
