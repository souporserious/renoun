import { afterEach, describe, expect, test, vi } from 'vitest'

async function withProcessEnv(
  env: Record<string, string | undefined>,
  callback: () => Promise<void> | void
): Promise<void> {
  const previousEnv = { ...process.env }

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key]
      continue
    }

    process.env[key] = value
  }

  try {
    await callback()
  } finally {
    process.env = previousEnv
  }
}

describe('isCiEnvironment', () => {
  afterEach(() => {
    vi.resetModules()
  })

  test('treats CI=false as false', async () => {
    await withProcessEnv({ CI: 'false' }, async () => {
      const { isCiEnvironment } = await import('./env.ts')

      expect(isCiEnvironment()).toBe(false)
    })
  })

  test('treats CI=true as true', async () => {
    await withProcessEnv({ CI: 'true' }, async () => {
      const { isCiEnvironment } = await import('./env.ts')

      expect(isCiEnvironment()).toBe(true)
    })
  })
})
