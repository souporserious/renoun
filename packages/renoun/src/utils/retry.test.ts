import { describe, expect, test } from 'vitest'

import { RenounNetworkError } from './errors.ts'
import { retry } from './retry.ts'

describe('retry', () => {
  test('retries retryable failures until success', async () => {
    let attempts = 0
    const value = await retry(
      async () => {
        attempts += 1
        if (attempts < 3) {
          throw new RenounNetworkError('temporary failure', {
            status: 503,
          })
        }
        return 'ok'
      },
      {
        retries: 5,
        minDelayMs: 1,
        maxDelayMs: 1,
        jitter: 0,
      }
    )

    expect(value).toBe('ok')
    expect(attempts).toBe(3)
  })

  test('aborts immediately when signal is aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      retry(
        async () => {
          return 'ok'
        },
        { signal: controller.signal }
      )
    ).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
