import { describe, expect, test } from 'vitest'

import {
  getContext,
  runWithContext,
  throwIfAborted,
} from './operation-context.ts'

describe('operation context', () => {
  test('propagates context values through async boundaries', async () => {
    const result = await runWithContext(
      {
        operation: 'unit-test',
        tags: { scope: 'utils' },
      },
      async () => {
        await Promise.resolve()
        return getContext()
      }
    )

    expect(result?.operation).toBe('unit-test')
    expect(result?.tags).toEqual({ scope: 'utils' })
  })

  test('throwIfAborted throws abort errors', () => {
    const controller = new AbortController()
    controller.abort()

    expect(() => throwIfAborted(controller.signal)).toThrowError(/abort/i)
  })
})
