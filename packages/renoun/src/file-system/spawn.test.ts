import { describe, expect, test } from 'vitest'

import { spawnWithBuffer, spawnWithResult } from './spawn.ts'

describe('spawnWithBuffer', () => {
  test('returns stdout as a buffer for successful commands', async () => {
    const output = await spawnWithBuffer(
      process.execPath,
      ['-e', "process.stdout.write('hello')"],
      {
        cwd: process.cwd(),
      }
    )

    expect(output.toString()).toBe('hello')
  })

  test('rejects when command exceeds timeoutMs', async () => {
    await expect(
      spawnWithBuffer(process.execPath, ['-e', 'setTimeout(() => {}, 1000)'], {
        cwd: process.cwd(),
        timeoutMs: 25,
      })
    ).rejects.toThrow('Command timed out after 25ms')
  })

  test('counts stderr bytes against maxBuffer', async () => {
    await expect(
      spawnWithBuffer(
        process.execPath,
        [
          '-e',
          "process.stderr.write('x'.repeat(128)); process.stdout.write('ok')",
        ],
        {
          cwd: process.cwd(),
          maxBuffer: 64,
        }
      )
    ).rejects.toThrow(/maxBuffer exceeded \(64 bytes\)/)
  })
})

describe('spawnWithResult', () => {
  test('rejects when output exceeds maxBuffer', async () => {
    await expect(
      spawnWithResult(
        process.execPath,
        ['-e', "process.stdout.write('x'.repeat(128)); process.stdout.write('ok')"],
        {
          cwd: process.cwd(),
          maxBuffer: 64,
        }
      )
    ).rejects.toThrow(/maxBuffer exceeded \(64 bytes\)/)
  })
})
