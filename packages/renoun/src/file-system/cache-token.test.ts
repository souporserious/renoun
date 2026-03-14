import { describe, expect, test } from 'vitest'

import {
  CACHE_SCHEMA_VERSION,
  FS_ANALYSIS_CACHE_VERSION,
  FS_STRUCTURE_CACHE_VERSION,
  GIT_HISTORY_CACHE_VERSION,
  GIT_VIRTUAL_HISTORY_CACHE_VERSION,
} from './cache-key.ts'
import {
  createFileSystemCacheToken,
  FILE_SYSTEM_CACHE_TOKEN_FORMAT_VERSION,
  getFileSystemCacheTokenParts,
} from './cache-token.ts'

describe('createFileSystemCacheToken', () => {
  test('creates a deterministic token from cache versions', () => {
    expect(createFileSystemCacheToken()).toBe(
      [
        `v${FILE_SYSTEM_CACHE_TOKEN_FORMAT_VERSION}`,
        `schema${CACHE_SCHEMA_VERSION}`,
        `analysis${FS_ANALYSIS_CACHE_VERSION}`,
        `structure${FS_STRUCTURE_CACHE_VERSION}`,
        `git${GIT_HISTORY_CACHE_VERSION}`,
        `gitvirtual${GIT_VIRTUAL_HISTORY_CACHE_VERSION}`,
      ].join('-')
    )
  })
})

describe('getFileSystemCacheTokenParts', () => {
  test('returns the cache-version parts used by the token', () => {
    expect(getFileSystemCacheTokenParts()).toEqual({
      formatVersion: FILE_SYSTEM_CACHE_TOKEN_FORMAT_VERSION,
      cacheSchemaVersion: CACHE_SCHEMA_VERSION,
      fsAnalysisVersion: FS_ANALYSIS_CACHE_VERSION,
      fsStructureVersion: FS_STRUCTURE_CACHE_VERSION,
      gitHistoryVersion: GIT_HISTORY_CACHE_VERSION,
      gitVirtualHistoryVersion: GIT_VIRTUAL_HISTORY_CACHE_VERSION,
    })
  })
})
