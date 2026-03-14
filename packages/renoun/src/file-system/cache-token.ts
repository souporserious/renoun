import {
  CACHE_SCHEMA_VERSION,
  FS_ANALYSIS_CACHE_VERSION,
  FS_STRUCTURE_CACHE_VERSION,
  GIT_HISTORY_CACHE_VERSION,
  GIT_VIRTUAL_HISTORY_CACHE_VERSION,
} from './cache-key.ts'

export const FILE_SYSTEM_CACHE_TOKEN_FORMAT_VERSION = 1

export interface FileSystemCacheTokenParts {
  formatVersion: number
  cacheSchemaVersion: number
  fsAnalysisVersion: string
  fsStructureVersion: string
  gitHistoryVersion: string
  gitVirtualHistoryVersion: string
}

export function getFileSystemCacheTokenParts(): FileSystemCacheTokenParts {
  return {
    formatVersion: FILE_SYSTEM_CACHE_TOKEN_FORMAT_VERSION,
    cacheSchemaVersion: CACHE_SCHEMA_VERSION,
    fsAnalysisVersion: FS_ANALYSIS_CACHE_VERSION,
    fsStructureVersion: FS_STRUCTURE_CACHE_VERSION,
    gitHistoryVersion: GIT_HISTORY_CACHE_VERSION,
    gitVirtualHistoryVersion: GIT_VIRTUAL_HISTORY_CACHE_VERSION,
  }
}

export function createFileSystemCacheToken(): string {
  const parts = getFileSystemCacheTokenParts()

  return [
    `v${parts.formatVersion}`,
    `schema${parts.cacheSchemaVersion}`,
    `analysis${parts.fsAnalysisVersion}`,
    `structure${parts.fsStructureVersion}`,
    `git${parts.gitHistoryVersion}`,
    `gitvirtual${parts.gitVirtualHistoryVersion}`,
  ].join('-')
}
