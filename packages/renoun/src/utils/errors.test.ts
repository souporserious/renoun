import { describe, expect, test } from 'vitest'

import { isRetryableNetworkTypeError } from './errors.ts'

describe('isRetryableNetworkTypeError', () => {
  test('returns true for network-like messages', () => {
    expect(isRetryableNetworkTypeError(new TypeError('fetch failed'))).toBe(true)
  })

  test('returns true for known network cause codes', () => {
    const error = new TypeError('request failed', {
      cause: { code: 'ECONNRESET' },
    })
    expect(isRetryableNetworkTypeError(error)).toBe(true)
  })

  test('returns false for non-network TypeError messages', () => {
    expect(
      isRetryableNetworkTypeError(new TypeError('invalid invocation'))
    ).toBe(false)
  })

  test('returns false for non-TypeError values', () => {
    expect(isRetryableNetworkTypeError(new Error('fetch failed'))).toBe(false)
  })
})
