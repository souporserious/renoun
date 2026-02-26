import { describe, expect, test } from 'vitest'

import { stableStringify } from './stable-serialization.ts'

describe('stableStringify', () => {
  test.concurrent(
    'distinguishes empty arrays, undefined elements, and sparse holes',
    () => {
      expect(stableStringify([])).toBe('[]')
      expect(stableStringify([undefined])).toBe('[undefined]')
      expect(stableStringify(Array(1))).toBe('[<hole>]')
      expect(stableStringify([null])).toBe('[null]')
    }
  )

  test.concurrent('returns deterministic object output by sorted keys', () => {
    expect(
      stableStringify({
        b: 2,
        a: [undefined, 1],
      })
    ).toBe('{"a":[undefined,1],"b":2}')
  })
})
