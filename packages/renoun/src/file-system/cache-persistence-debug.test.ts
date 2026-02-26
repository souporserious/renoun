import { describe, expect, test } from 'vitest'

import { summarizePersistedValue } from './cache-persistence-debug.ts'

describe('summarizePersistedValue', () => {
  test('hashes primitive string values instead of logging raw content', () => {
    const secret = 'secret-token-123'
    const summary = summarizePersistedValue(secret)

    expect(summary).toMatch(/^string\(length=16 sha1=[0-9a-f]{40}\)$/)
    expect(summary).not.toContain(secret)
  })

  test('hashes nested string values', () => {
    const summary = summarizePersistedValue(['nested-secret'])

    expect(summary).toMatch(
      /^array\(length=1, first=string\(length=13 sha1=[0-9a-f]{40}\)\)$/
    )
    expect(summary).not.toContain('nested-secret')
  })
})
