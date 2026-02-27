import { describe, expect, test } from 'vitest'

import {
  HASH_STRING_ALGORITHM,
  HASH_STRING_HEX_LENGTH,
  hashString,
  stableStringify,
} from './stable-serialization.ts'

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

describe('hashString', () => {
  test.concurrent('returns deterministic sha256 digests', () => {
    expect(hashString('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
    expect(hashString('abc')).toBe(hashString('abc'))
    expect(hashString('abc')).not.toBe(hashString('abcd'))
  })

  test.concurrent('uses expected algorithm and digest length', () => {
    expect(HASH_STRING_ALGORITHM).toBe('sha256')
    expect(hashString('renoun')).toMatch(
      new RegExp(`^[0-9a-f]{${HASH_STRING_HEX_LENGTH}}$`)
    )
  })
})
