import { afterEach, describe, expect, test, vi } from 'vitest'

const { createMaintenanceResult, runSqliteCacheMaintenanceMock } = vi.hoisted(
  () => {
    const createMaintenanceResult = (
      overrides: Record<string, unknown> = {}
    ) => ({
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
      quickCheck: {
        executed: false,
        ok: true,
        errors: [],
        durationMs: 0,
      },
      integrityCheck: {
        executed: false,
        ok: true,
        errors: [],
        durationMs: 0,
      },
      vacuum: {
        executed: false,
        durationMs: 0,
      },
      ...overrides,
    })

    return {
      createMaintenanceResult,
      runSqliteCacheMaintenanceMock: vi.fn(async () =>
        createMaintenanceResult()
      ),
    }
  }
)

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
      quickCheck: false,
      integrityCheck: false,
    })
    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  test('supports json output with explicit flags', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    runSqliteCacheMaintenanceMock.mockResolvedValueOnce(
      createMaintenanceResult({
        dbPath: '/tmp/custom.sqlite',
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
    )

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
      quickCheck: false,
      integrityCheck: false,
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

  test('accepts equals-delimited option values', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runCacheMaintenanceCommand([
      '--db-path=/tmp/custom.sqlite',
      '--checkpoint-mode=truncate',
    ])

    expect(runSqliteCacheMaintenanceMock).toHaveBeenCalledWith({
      dbPath: '/tmp/custom.sqlite',
      checkpoint: true,
      vacuum: false,
      checkpointMode: 'TRUNCATE',
      quickCheck: false,
      integrityCheck: false,
    })
    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  test('passes explicit health check flags through to maintenance', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    runSqliteCacheMaintenanceMock.mockResolvedValueOnce(
      createMaintenanceResult({
        quickCheck: {
          executed: true,
          ok: true,
          errors: [],
          durationMs: 3,
        },
        integrityCheck: {
          executed: true,
          ok: true,
          errors: [],
          durationMs: 8,
        },
      })
    )

    await runCacheMaintenanceCommand([
      '--quick-check',
      '--integrity-check',
      '--no-checkpoint',
    ])

    expect(runSqliteCacheMaintenanceMock).toHaveBeenCalledWith({
      dbPath: undefined,
      checkpoint: false,
      vacuum: false,
      checkpointMode: undefined,
      quickCheck: true,
      integrityCheck: true,
    })
    expect(String(logSpy.mock.calls[0]?.[0])).toContain('quick-check:ok')
    expect(String(logSpy.mock.calls[0]?.[0])).toContain('integrity-check:ok')
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

  test('throws when --db-path value is missing', async () => {
    await expect(
      runCacheMaintenanceCommand(['--db-path', '--vacuum'])
    ).rejects.toThrow('Missing value for --db-path')
    expect(runSqliteCacheMaintenanceMock).not.toHaveBeenCalled()
  })

  test('throws when --checkpoint-mode value is missing', async () => {
    await expect(
      runCacheMaintenanceCommand(['--checkpoint-mode', '--vacuum'])
    ).rejects.toThrow('Missing value for --checkpoint-mode')
    expect(runSqliteCacheMaintenanceMock).not.toHaveBeenCalled()
  })

  test('throws when sqlite maintenance is unavailable', async () => {
    runSqliteCacheMaintenanceMock.mockResolvedValueOnce(
      createMaintenanceResult({
        dbPath: '/tmp/unavailable.sqlite',
        available: false,
        checkpoint: {
          executed: false,
          mode: 'PASSIVE',
          busy: 0,
          logFrames: 0,
          checkpointedFrames: 0,
          durationMs: 0,
        },
        vacuum: {
          executed: false,
          durationMs: 0,
        },
      })
    )

    await expect(runCacheMaintenanceCommand()).rejects.toThrow(
      'SQLite cache maintenance is unavailable'
    )
  })

  test('throws when a health check reports corruption', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    runSqliteCacheMaintenanceMock.mockResolvedValueOnce(
      createMaintenanceResult({
        checkpoint: {
          executed: false,
          mode: 'PASSIVE',
          busy: 0,
          logFrames: 0,
          checkpointedFrames: 0,
          durationMs: 0,
        },
        quickCheck: {
          executed: true,
          ok: false,
          errors: ['row 12 missing from index idx_cache_entries_updated_at'],
          durationMs: 4,
        },
      })
    )

    await expect(
      runCacheMaintenanceCommand(['--quick-check', '--no-checkpoint'])
    ).rejects.toThrow('SQLite health check failed')
    expect(logSpy).not.toHaveBeenCalled()
  })

  test('prints failed health checks in json mode before exiting non-zero', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    runSqliteCacheMaintenanceMock.mockResolvedValueOnce(
      createMaintenanceResult({
        integrityCheck: {
          executed: true,
          ok: false,
          errors: ['database disk image is malformed'],
          durationMs: 6,
        },
      })
    )

    await expect(
      runCacheMaintenanceCommand(['--integrity-check', '--json'])
    ).rejects.toThrow('SQLite health check failed')
    expect(logSpy).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      integrityCheck: {
        ok: boolean
        errors: string[]
      }
    }
    expect(payload.integrityCheck.ok).toBe(false)
    expect(payload.integrityCheck.errors).toContain(
      'database disk image is malformed'
    )
  })

  test('throws on unknown options', async () => {
    await expect(runCacheMaintenanceCommand(['--wat'])).rejects.toThrow(
      'Unknown option "--wat"'
    )
  })
})
