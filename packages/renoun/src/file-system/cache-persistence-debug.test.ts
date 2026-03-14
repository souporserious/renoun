import { describe, expect, test } from 'vitest'

import {
  CACHE_PERSISTENCE_DEBUG_REDACTION_ALGORITHM,
  CACHE_PERSISTENCE_DEBUG_REDACTION_HEX_LENGTH,
  summarizePersistedValue,
} from './cache-persistence-debug.ts'

describe('summarizePersistedValue', () => {
  test('hashes primitive string values instead of logging raw content', () => {
    const secret = 'secret-token-123'
    const summary = summarizePersistedValue(secret)

    expect(summary).toMatch(
      new RegExp(
        `^string\\(length=16 ${CACHE_PERSISTENCE_DEBUG_REDACTION_ALGORITHM}=[0-9a-f]{${CACHE_PERSISTENCE_DEBUG_REDACTION_HEX_LENGTH}}\\)$`
      )
    )
    expect(summary).not.toContain(secret)
  })

  test('hashes nested string values', () => {
    const summary = summarizePersistedValue(['nested-secret'])

    expect(summary).toMatch(
      new RegExp(
        `^array\\(length=1, first=string\\(length=13 ${CACHE_PERSISTENCE_DEBUG_REDACTION_ALGORITHM}=[0-9a-f]{${CACHE_PERSISTENCE_DEBUG_REDACTION_HEX_LENGTH}}\\)\\)$`
      )
    )
    expect(summary).not.toContain('nested-secret')
  })

  test('is deterministic within a process and changes for different values', () => {
    const firstSecret = 'secret-token-123'
    const secondSecret = 'secret-token-124'

    const firstSummary = summarizePersistedValue(firstSecret)
    const firstSummaryRepeat = summarizePersistedValue(firstSecret)
    const secondSummary = summarizePersistedValue(secondSecret)

    expect(firstSummary).toBe(firstSummaryRepeat)
    expect(firstSummary).not.toBe(secondSummary)
  })

  test('does not expose object key names', () => {
    const summary = summarizePersistedValue({
      apiKey: 'token',
      password: 'secret',
    })

    expect(summary).toMatch(
      new RegExp(
        `^object\\(key-count=2 key-preview-count=2 key-preview-${CACHE_PERSISTENCE_DEBUG_REDACTION_ALGORITHM}=[0-9a-f]{${CACHE_PERSISTENCE_DEBUG_REDACTION_HEX_LENGTH}}\\)$`
      )
    )
    expect(summary).not.toContain('apiKey')
    expect(summary).not.toContain('password')
  })

  test('does not expose regexp source text', () => {
    const summary = summarizePersistedValue(/secret-token-\d+/gi)

    expect(summary).toMatch(
      new RegExp(
        `^regexp\\(flags=gi source-length=16 ${CACHE_PERSISTENCE_DEBUG_REDACTION_ALGORITHM}=[0-9a-f]{${CACHE_PERSISTENCE_DEBUG_REDACTION_HEX_LENGTH}}\\)$`
      )
    )
    expect(summary).not.toContain('secret-token')
  })
})
