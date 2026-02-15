import { createPersistentCacheNodeKey } from './cache-key.ts'

export function createGitFileSystemPersistentCacheNodeKey(options: {
  domainVersion: string
  repository: string
  repoRoot: string
  namespace: string
  payload: unknown
}): string {
  return createPersistentCacheNodeKey({
    domain: 'git-file-system',
    domainVersion: options.domainVersion,
    namespace: options.namespace,
    payload: {
      repository: options.repository,
      repoRoot: options.repoRoot,
      payload: options.payload,
    },
  })
}

export function createGitVirtualPersistentCacheNodeKey(options: {
  domainVersion: string
  host: string
  apiBaseUrl?: string
  repository: string
  namespace: string
  payload: unknown
}): string {
  return createPersistentCacheNodeKey({
    domain: 'git-virtual',
    domainVersion: options.domainVersion,
    namespace: options.namespace,
    payload: {
      host: options.host,
      apiBaseUrl: options.apiBaseUrl ?? null,
      repository: options.repository,
      payload: options.payload,
    },
  })
}

export function createGitRemoteRefCacheKey(options: {
  repoRoot: string
  remote: string
  ref: string
}): string {
  return `${options.repoRoot}\x00${options.remote}\x00${options.ref}`
}
