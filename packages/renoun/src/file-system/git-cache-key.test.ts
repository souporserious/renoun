import { describe, expect, test } from 'vitest'

import {
  createGitFileSystemPersistentCacheNodeKey,
  createGitVirtualPersistentCacheNodeKey,
  sanitizeCredentialedGitRemote,
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

  test('redacts scp-style suffixes from cache keys', () => {
    const withSuffix = createGitFileSystemPersistentCacheNodeKey({
      domainVersion: '1',
      repository: 'git@github.com:org/repo.git?token=secret#fragment',
      namespace: 'file-meta',
      payload: {
        path: 'README.md',
      },
    })

    const withoutSuffix = createGitFileSystemPersistentCacheNodeKey({
      domainVersion: '1',
      repository: 'git@github.com:org/repo.git',
      namespace: 'file-meta',
      payload: {
        path: 'README.md',
      },
    })

    expect(withSuffix).toBe(withoutSuffix)

    const virtualWithSuffix = createGitVirtualPersistentCacheNodeKey({
      domainVersion: '1',
      host: 'gitlab',
      repository: 'git@gitlab.com:group/repo.git?private_token=secret',
      namespace: 'commit-history',
      payload: {
        ref: 'main',
      },
    })

    const virtualWithoutSuffix = createGitVirtualPersistentCacheNodeKey({
      domainVersion: '1',
      host: 'gitlab',
      repository: 'git@gitlab.com:group/repo.git',
      namespace: 'commit-history',
      payload: {
        ref: 'main',
      },
    })

    expect(virtualWithSuffix).toBe(virtualWithoutSuffix)
  })

  test('preserves literal local repository paths that contain # or ?', () => {
    expect(sanitizeCredentialedGitRemote('/tmp/repo#1')).toBe('/tmp/repo#1')
    expect(sanitizeCredentialedGitRemote('/tmp/repo?2')).toBe('/tmp/repo?2')

    const firstKey = createGitFileSystemPersistentCacheNodeKey({
      domainVersion: '1',
      repository: '/tmp/repo#1',
      repoRoot: '/tmp/cache?1',
      namespace: 'file-meta',
      payload: {
        path: 'README.md',
      },
    })

    const secondKey = createGitFileSystemPersistentCacheNodeKey({
      domainVersion: '1',
      repository: '/tmp/repo#2',
      repoRoot: '/tmp/cache?2',
      namespace: 'file-meta',
      payload: {
        path: 'README.md',
      },
    })

    expect(firstKey).not.toBe(secondKey)
  })
})
