import { afterEach, describe, expect, test } from 'vitest'

import {
  clearClientRpcCacheStateForTests,
  invalidateClientRpcCacheByNormalizedPaths,
  normalizeInvalidationPaths,
  readClientRpcCacheEntry,
  rememberWorkspaceRootCandidates,
  setClientRpcCacheEntry,
  toClientRpcCacheKey,
} from './client.cache.ts'

afterEach(() => {
  clearClientRpcCacheStateForTests()
})

describe('toClientRpcCacheKey', () => {
  test('hashes inline source payloads instead of embedding them in cache keys', () => {
    const value = `const snippet = ${JSON.stringify('x'.repeat(4_096))}`
    const key = toClientRpcCacheKey('getSourceTextMetadata', {
      value,
      language: 'tsx',
      analysisOptions: {
        tsConfigFilePath: '/project/tsconfig.json',
      },
    })

    expect(key).toMatch(/^getSourceTextMetadata\|[a-f0-9]{64}$/)
    expect(key).not.toContain(value)
    expect(key).not.toContain('/project/tsconfig.json')
  })

  test('preserves stable cache keys for equivalent payloads', () => {
    const firstKey = toClientRpcCacheKey('getTokens', {
      filePath: '/project/src/example.ts',
      language: 'ts',
      value: 'const answer = 42',
    })
    const secondKey = toClientRpcCacheKey('getTokens', {
      value: 'const answer = 42',
      language: 'ts',
      filePath: '/project/src/example.ts',
    })

    expect(firstKey).toBe(secondKey)
  })

  test('keeps distinct source payloads in separate cache entries', () => {
    const firstKey = toClientRpcCacheKey('getSourceTextMetadata', {
      value: 'export const first = 1',
      language: 'ts',
    })
    const secondKey = toClientRpcCacheKey('getSourceTextMetadata', {
      value: 'export const second = 2',
      language: 'ts',
    })

    expect(firstKey).not.toBe(secondKey)
  })

  test('keeps repo-root-relative invalidations comparable in browser-only app runtimes', () => {
    rememberWorkspaceRootCandidates({
      analysisOptions: {
        tsConfigFilePath: '/repo/apps/site/tsconfig.json',
      },
    })

    setClientRpcCacheEntry('quick-info', {
      value: { displayText: 'History', documentationText: '' },
      expiresAt: Date.now() + 60_000,
      dependencyPaths: ['/repo/packages/renoun/src/components/History.tsx'],
    })

    const { comparablePaths } = normalizeInvalidationPaths([
      'packages/renoun/src/components/History.tsx',
    ])

    invalidateClientRpcCacheByNormalizedPaths(comparablePaths)

    expect(readClientRpcCacheEntry('quick-info')).toBeUndefined()
  })
})
