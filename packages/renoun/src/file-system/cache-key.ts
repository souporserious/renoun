import { normalizeSlashes } from '../utils/path.ts'
import { hashString, stableStringify } from './CacheStore.ts'

export const CACHE_SCHEMA_VERSION = 2

export const FS_ANALYSIS_CACHE_VERSION = '2'
export const FS_STRUCTURE_CACHE_VERSION = '2'
export const GIT_HISTORY_CACHE_VERSION = '3'
export const GIT_VIRTUAL_HISTORY_CACHE_VERSION = '3'

export function normalizeCachePath(path: string): string {
  const normalized = normalizeSlashes(path)
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')

  return normalized === '' ? '.' : normalized
}

export function createCacheNodeKey(namespace: string, payload: unknown): string {
  return `${namespace}:${hashString(stableStringify(payload))}`
}

export function createScopedCacheNodeKey(
  scope: string,
  scopeVersion: string,
  namespace: string,
  payload: unknown
): string {
  return createCacheNodeKey(`${scope}:${namespace}`, {
    version: scopeVersion,
    payload,
  })
}

export function createPersistentCacheNodeKey(options: {
  domain: string
  domainVersion: string
  namespace: string
  payload: unknown
}): string {
  return `${options.domain}:${options.domainVersion}:${options.namespace}:${hashString(
    stableStringify(options.payload)
  )}`
}
