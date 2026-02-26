export type ProcessEnvSnapshot = Record<string, string | undefined>

export function captureProcessEnv(keys: readonly string[]): ProcessEnvSnapshot {
  const snapshot: ProcessEnvSnapshot = {}
  for (const key of keys) {
    snapshot[key] = process.env[key]
  }

  return snapshot
}

export function restoreProcessEnv(snapshot: ProcessEnvSnapshot): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

export async function withProcessEnv<T>(
  overrides: ProcessEnvSnapshot,
  run: () => Promise<T> | T
): Promise<T> {
  const snapshot = captureProcessEnv(Object.keys(overrides))
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return await run()
  } finally {
    restoreProcessEnv(snapshot)
  }
}
