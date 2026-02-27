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

// TODO: Remove this skip flag when Vitest detectAsyncLeaks no longer flags closed WritableStream internals as promise leaks.
// https://main.vitest.dev/config/detectasyncleaks
export const isDetectAsyncLeaksEnabled =
  (
    globalThis as {
      __vitest_worker__?: { config?: { detectAsyncLeaks?: boolean } }
    }
  ).__vitest_worker__?.config?.detectAsyncLeaks === true
