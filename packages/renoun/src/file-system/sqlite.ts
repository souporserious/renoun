const SQLITE_EXPERIMENTAL_WARNING = `SQLite is an experimental feature and might change at any time`

type SqliteModule = typeof import('node:sqlite')

let sqliteModulePromise: Promise<SqliteModule> | null = null

function loadSqliteModuleWithoutWarningNoise(): Promise<SqliteModule> {
  if (
    typeof process === 'undefined' ||
    typeof process.emitWarning !== 'function'
  ) {
    return import('node:sqlite')
  }

  const originalEmitWarning = process.emitWarning
  const filteredEmitWarning = ((...args: Parameters<typeof process.emitWarning>) => {
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

    return originalEmitWarning.apply(process, args)
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
    sqliteModulePromise = loadSqliteModuleWithoutWarningNoise().catch((error) => {
      sqliteModulePromise = null
      throw error
    })
  }

  return sqliteModulePromise
}
