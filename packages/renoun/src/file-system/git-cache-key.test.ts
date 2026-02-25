import { describe, expect, test } from 'vitest'

import {
  createGitFileSystemPersistentCacheNodeKey,
  createGitVirtualPersistentCacheNodeKey,
} from './git-cache-key.ts'

describe('git cache key sanitization', () => {
  test('redacts credentials and URL params for git file-system cache keys', () => {
    const withSensitiveUrl = createGitFileSystemPersistentCacheNodeKey({
      domainVersion: '1',
      repository: 'https://alice:super-secret@example.com/org/repo.git?token=1',
      repoRoot: 'https://alice:super-secret@example.com/cache/repo?token=2',
      namespace: 'file-meta',
      payload: {
        path: 'README.md',
      },
    })

    const withRedactedUrl = createGitFileSystemPersistentCacheNodeKey({
      domainVersion: '1',
      repository: 'https://example.com/org/repo.git',
      repoRoot: 'https://example.com/cache/repo',
      namespace: 'file-meta',
      payload: {
        path: 'README.md',
      },
    })

    expect(withSensitiveUrl).toBe(withRedactedUrl)
  })

  test('redacts credentials and URL params for git virtual cache keys', () => {
    const withSensitiveUrl = createGitVirtualPersistentCacheNodeKey({
      domainVersion: '1',
      host: 'gitlab',
      apiBaseUrl: 'https://alice:super-secret@example.com/api/v4?token=1',
      repository: 'https://alice:super-secret@example.com/org/repo',
      namespace: 'commit-history',
      payload: {
        ref: 'main',
      },
    })

    const withRedactedUrl = createGitVirtualPersistentCacheNodeKey({
      domainVersion: '1',
      host: 'gitlab',
      apiBaseUrl: 'https://example.com/api/v4',
      repository: 'https://example.com/org/repo',
      namespace: 'commit-history',
      payload: {
        ref: 'main',
      },
    })

    expect(withSensitiveUrl).toBe(withRedactedUrl)
  })
})
