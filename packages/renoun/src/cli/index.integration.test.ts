import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  createFileSystemCacheToken,
  getFileSystemCacheTokenParts,
} from '../file-system/cache-token.ts'
import { PROCESS_ENV_KEYS } from '../utils/env-keys.ts'
import { captureProcessEnv, restoreProcessEnv } from '../utils/test.ts'

const spawnMock = vi.fn(
  (command: string, args: string[], options?: Record<string, unknown>) => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number
      kill: ReturnType<typeof vi.fn>
      stderr: EventEmitter
    }

    child.pid = 1234
    child.kill = vi.fn()
    child.stderr = new EventEmitter()

    setTimeout(() => {
      child.emit('close', 0)
    }, 0)

    return child
  }
)

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

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

vi.mock('./prewarm-runner.ts', () => ({
  createDefaultPrewarmOptions: (rootPath = process.cwd()) => ({
    analysisOptions: {
      tsConfigFilePath: join(rootPath, 'tsconfig.json'),
    },
  }),
  runPrewarmSafely: prewarmRenounRpcServerCacheMock,
}))

const runCacheMaintenanceCommandMock = vi.fn(async (args: string[]) => {
  if (args.includes('--help')) {
    console.log('Usage: renoun cache-maintenance')
  }
})

vi.mock('./cache-maintenance.ts', () => ({
  runCacheMaintenanceCommand: runCacheMaintenanceCommandMock,
}))

const resolveFrameworkBinFileMock = vi.fn(() => '/fake/framework-bin.ts')

vi.mock('./framework.ts', () => ({
  resolveFrameworkBinFile: resolveFrameworkBinFileMock,
}))

let originalArgv: string[] = []
let originalCwd: string = process.cwd()
const originalEnvironment = captureProcessEnv([
  PROCESS_ENV_KEYS.nodeEnv,
  PROCESS_ENV_KEYS.renounServerPort,
  PROCESS_ENV_KEYS.renounServerId,
  PROCESS_ENV_KEYS.renounServerHost,
  PROCESS_ENV_KEYS.renounServerRefreshNotificationsEffective,
])

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
  restoreProcessEnv(originalEnvironment)
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
    expect(runCacheMaintenanceCommandMock).toHaveBeenCalledWith(['--help'])
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
    expect(prewarmRenounRpcServerCacheMock).toHaveBeenCalledWith(
      {
        analysisOptions: {
          tsConfigFilePath: join(process.cwd(), 'tsconfig.json'),
        },
      },
      {
        allowInlineFallback: false,
      }
    )
  })

  test('exits through the normal command-error path when watch startup fails', async () => {
    process.argv = ['node', 'renoun', 'watch']

    createServerMock.mockRejectedValueOnce(new Error('watch boot failed'))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined as never) as typeof process.exit)

    await import('./index.ts')

    expect(errorSpy).toHaveBeenCalledWith('watch boot failed')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  test('forwards the effective refresh env to direct framework subprocesses', async () => {
    process.argv = ['node', 'renoun', 'next', 'dev']

    createServerMock.mockImplementationOnce(async () => {
      process.env[PROCESS_ENV_KEYS.renounServerHost] = '127.0.0.1'
      process.env[PROCESS_ENV_KEYS.renounServerRefreshNotificationsEffective] =
        '0'

      return {
        getPort: vi.fn(async () => {
          delete process.env[PROCESS_ENV_KEYS.renounServerHost]
          delete process.env[
            PROCESS_ENV_KEYS.renounServerRefreshNotificationsEffective
          ]
          return 4321
        }),
        getId: getIdMock,
        cleanup: serverCleanupMock,
      }
    })

    let resolveExit!: (code: number) => void
    let exitResolved = false
    const exitPromise = new Promise<number>((resolve) => {
      resolveExit = resolve
    })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      if (!exitResolved) {
        exitResolved = true
        resolveExit(code ?? 0)
      }
      return undefined as never
    }) as unknown as typeof process.exit)

    const originalProcessOn = process.on.bind(process)
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      listener: (...args: unknown[]) => void
    ) => {
      if (
        event === 'uncaughtException' ||
        event === 'unhandledRejection' ||
        event === 'SIGINT' ||
        event === 'SIGTERM'
      ) {
        return process
      }

      return originalProcessOn(
        event as Parameters<typeof originalProcessOn>[0],
        listener as Parameters<typeof originalProcessOn>[1]
      )
    }) as unknown as typeof process.on)

    try {
      await import('./index.ts')
      const exitCode = await exitPromise
      expect(exitCode).toBe(0)

      expect(resolveFrameworkBinFileMock).toHaveBeenCalledWith('next')
      expect(spawnMock).toHaveBeenCalledTimes(1)

      const [command, spawnArgs, spawnOptions] = spawnMock.mock.calls[0]
      expect(command).toBe(process.execPath)
      expect(spawnArgs).toEqual(['/fake/framework-bin.ts', 'dev'])
      expect(spawnOptions?.env).toMatchObject({
        [PROCESS_ENV_KEYS.renounServerPort]: '4321',
        [PROCESS_ENV_KEYS.renounServerId]: 'integration-test-server',
        [PROCESS_ENV_KEYS.renounServerHost]: '127.0.0.1',
        [PROCESS_ENV_KEYS.renounServerRefreshNotificationsEffective]: '0',
      })
      expect(serverCleanupMock).toHaveBeenCalledTimes(1)
    } finally {
      exitSpy.mockRestore()
      processOnSpy.mockRestore()
    }
  })
})
