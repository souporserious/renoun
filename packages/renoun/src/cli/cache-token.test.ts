import { afterEach, describe, expect, test, vi } from 'vitest'

import { createFileSystemCacheToken } from '../file-system/cache-token.ts'
import { runCacheTokenCommand } from './cache-token.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runCacheTokenCommand', () => {
  test('prints the default cache token', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runCacheTokenCommand()

    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith(createFileSystemCacheToken())
  })

  test('prints usage with --help', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runCacheTokenCommand(['--help'])

    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy.mock.calls[0]?.[0]).toBe('Usage: renoun cache-token [--json]')
  })

  test('prints json payload with --json', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runCacheTokenCommand(['--json'])

    expect(logSpy).toHaveBeenCalledTimes(1)

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      token: string
    }

    expect(payload.token).toBe(createFileSystemCacheToken())
  })

  test('throws on unknown options', async () => {
    await expect(runCacheTokenCommand(['--wat'])).rejects.toThrow(
      'Unknown option "--wat"'
    )
  })
})
