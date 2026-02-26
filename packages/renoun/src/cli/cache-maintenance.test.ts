import { afterEach, describe, expect, test, vi } from 'vitest'

const { runSqliteCacheMaintenanceMock } = vi.hoisted(() => ({
  runSqliteCacheMaintenanceMock: vi.fn(async () => ({
    dbPath: '/tmp/fs-cache.sqlite',
    available: true,
    checkpoint: {
      executed: true,
      mode: 'PASSIVE',
      busy: 0,
      logFrames: 0,
      checkpointedFrames: 0,
      durationMs: 1,
    },
    vacuum: {
      executed: false,
      durationMs: 0,
    },
  })),
}))

vi.mock('../file-system/CacheSqlite.ts', () => ({
  runSqliteCacheMaintenance: runSqliteCacheMaintenanceMock,
}))

import { runCacheMaintenanceCommand } from './cache-maintenance.ts'

afterEach(() => {
  vi.restoreAllMocks()
  runSqliteCacheMaintenanceMock.mockClear()
})

describe('runCacheMaintenanceCommand', () => {
  test('runs checkpoint maintenance by default', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runCacheMaintenanceCommand()

    expect(runSqliteCacheMaintenanceMock).toHaveBeenCalledTimes(1)
    expect(runSqliteCacheMaintenanceMock).toHaveBeenCalledWith({
      dbPath: undefined,
      checkpoint: true,
      vacuum: false,
      checkpointMode: undefined,
    })
    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  test('supports json output with explicit flags', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    runSqliteCacheMaintenanceMock.mockResolvedValueOnce({
      dbPath: '/tmp/custom.sqlite',
      available: true,
      checkpoint: {
        executed: true,
        mode: 'TRUNCATE',
        busy: 0,
        logFrames: 3,
        checkpointedFrames: 3,
        durationMs: 12,
      },
      vacuum: {
        executed: true,
        durationMs: 45,
      },
    })

    await runCacheMaintenanceCommand([
      '--db-path',
      '/tmp/custom.sqlite',
      '--checkpoint-mode',
      'truncate',
      '--vacuum',
      '--json',
    ])

    expect(runSqliteCacheMaintenanceMock).toHaveBeenCalledWith({
      dbPath: '/tmp/custom.sqlite',
      checkpoint: true,
      vacuum: true,
      checkpointMode: 'TRUNCATE',
    })
    expect(logSpy).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      dbPath: string
      vacuum: {
        executed: boolean
      }
    }
    expect(payload.dbPath).toBe('/tmp/custom.sqlite')
    expect(payload.vacuum.executed).toBe(true)
  })

  test('prints usage with --help', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runCacheMaintenanceCommand(['--help'])

    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(String(logSpy.mock.calls[0]?.[0])).toContain(
      'Usage: renoun cache-maintenance'
    )
    expect(runSqliteCacheMaintenanceMock).not.toHaveBeenCalled()
  })

  test('throws on unknown options', async () => {
    await expect(runCacheMaintenanceCommand(['--wat'])).rejects.toThrow(
      'Unknown option "--wat"'
    )
  })
})
