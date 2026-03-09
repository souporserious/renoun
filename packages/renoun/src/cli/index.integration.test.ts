import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  createFileSystemCacheToken,
  getFileSystemCacheTokenParts,
} from '../file-system/cache-token.ts'

const getPortMock = vi.fn(async () => 4321)
const getIdMock = vi.fn(() => 'integration-test-server')
const serverCleanupMock = vi.fn()

const createServerMock = vi.fn(async () => ({
  getPort: getPortMock,
  getId: getIdMock,
  cleanup: serverCleanupMock,
}))

vi.mock('../analysis/server.ts', () => ({
  createServer: createServerMock,
}))

const prewarmRenounRpcServerCacheMock = vi.fn(async () => undefined)

vi.mock('./prewarm.ts', () => ({
  prewarmRenounRpcServerCache: prewarmRenounRpcServerCacheMock,
}))

let originalArgv: string[] = []
let originalCwd: string = process.cwd()

async function waitForAssertion(
  assertion: () => void,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 2_000
  const intervalMs = options.intervalMs ?? 20
  const deadline = Date.now() + timeoutMs

  while (true) {
    try {
      assertion()
      return
    } catch (error) {
      if (Date.now() >= deadline) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }
}

beforeEach(() => {
  originalArgv = process.argv.slice()
  originalCwd = process.cwd()
  vi.resetModules()
  vi.clearAllMocks()
  process.chdir(originalCwd)
})

afterEach(() => {
  vi.restoreAllMocks()
  process.argv = originalArgv
  process.chdir(originalCwd)
})

describe('renoun CLI index integration', () => {
  test('runs cache-token command through CLI entrypoint', async () => {
    process.argv = ['node', 'renoun', 'cache-token']

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined as never) as typeof process.exit)

    await import('./index.ts')

    expect(logSpy).toHaveBeenCalledWith(createFileSystemCacheToken())
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  test('runs cache-token --json through CLI entrypoint', async () => {
    process.argv = ['node', 'renoun', 'cache-token', '--json']

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined as never) as typeof process.exit)

    await import('./index.ts')

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      token: string
      parts: ReturnType<typeof getFileSystemCacheTokenParts>
    }

    expect(payload).toEqual({
      token: createFileSystemCacheToken(),
      parts: getFileSystemCacheTokenParts(),
    })
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  test('runs cache-maintenance --help through CLI entrypoint', async () => {
    process.argv = ['node', 'renoun', 'cache-maintenance', '--help']

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined as never) as typeof process.exit)

    await import('./index.ts')

    expect(String(logSpy.mock.calls[0]?.[0])).toContain(
      'Usage: renoun cache-maintenance'
    )
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  test('exits with usage when command is unknown', async () => {
    process.argv = ['node', 'renoun', 'definitely-unknown-command']

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined as never) as typeof process.exit)

    await import('./index.ts')

    const message = String(errorSpy.mock.calls[0]?.[0])
    expect(message).toContain(
      '[renoun] Unknown command "definitely-unknown-command".'
    )
    expect(message).toContain('Usage:')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  test('passes project tsconfig path to prewarm in watch mode', async () => {
    process.argv = ['node', 'renoun', 'watch']

    await import('./index.ts')

    expect(createServerMock).toHaveBeenCalledTimes(1)
    await waitForAssertion(() => {
      expect(prewarmRenounRpcServerCacheMock).toHaveBeenCalledTimes(1)
    })
    expect(prewarmRenounRpcServerCacheMock).toHaveBeenCalledWith({
      analysisOptions: {
        tsConfigFilePath: join(process.cwd(), 'tsconfig.json'),
      },
    })
  })
})
