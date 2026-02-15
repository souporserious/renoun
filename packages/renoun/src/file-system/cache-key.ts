import { normalizePathKey } from '../utils/path.ts'
import type { TypeFilter } from '../utils/resolve-type.ts'
import { hashString, stableStringify } from './CacheStore.ts'

export const CACHE_SCHEMA_VERSION = 4

export const FS_ANALYSIS_CACHE_VERSION = '2'
export const FS_STRUCTURE_CACHE_VERSION = '2'
export const GIT_HISTORY_CACHE_VERSION = '3'
export const GIT_VIRTUAL_HISTORY_CACHE_VERSION = '3'

export function normalizeCachePath(path: string): string {
  return normalizePathKey(path)
}

export function createCacheNodeKey(
  namespace: string,
  payload: unknown
): string {
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

export function serializeTypeFilterForCache(
  filter: TypeFilter | null | undefined
): string {
  if (!filter) {
    return 'null'
  }

  const normalizedDescriptors = (Array.isArray(filter) ? filter : [filter]).map(
    (descriptor) => {
      const types = [...descriptor.types]
        .map((entry) => ({
          name: entry.name,
          properties: entry.properties
            ? [...entry.properties].sort()
            : undefined,
        }))
        .sort((left, right) => left.name.localeCompare(right.name))

      return {
        moduleSpecifier: descriptor.moduleSpecifier,
        types,
      }
    }
  )

  normalizedDescriptors.sort((left, right) => {
    if (left.moduleSpecifier === right.moduleSpecifier) {
      return JSON.stringify(left.types).localeCompare(
        JSON.stringify(right.types)
      )
    }

    return (left.moduleSpecifier ?? '').localeCompare(
      right.moduleSpecifier ?? ''
    )
  })

  return stableStringify(normalizedDescriptors)
}
