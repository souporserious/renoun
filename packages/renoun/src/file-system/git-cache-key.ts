import { createPersistentCacheNodeKey } from './cache-key.ts'

function sanitizePotentialCredentialedUrl(value: string): string {
  const input = String(value)
  if (input.length === 0) {
    return input
  }

  try {
    const url = new URL(input)
    if (
      url.protocol === 'http:' ||
      url.protocol === 'https:' ||
      url.protocol === 'ssh:' ||
      url.protocol === 'git:' ||
      url.protocol === 'file:'
    ) {
      url.username = ''
      url.password = ''
      url.search = ''
      url.hash = ''
      return url.toString()
    }
  } catch {
    return input
  }

  return input
}

export function createGitFileSystemPersistentCacheNodeKey(options: {
  domainVersion: string
  repository: string
  repoRoot?: string
  namespace: string
  payload: unknown
}): string {
  return createPersistentCacheNodeKey({
    domain: 'git-file-system',
    domainVersion: options.domainVersion,
    namespace: options.namespace,
    payload: {
      repository: sanitizePotentialCredentialedUrl(options.repository),
      repoRoot:
        typeof options.repoRoot === 'string'
          ? sanitizePotentialCredentialedUrl(options.repoRoot)
          : null,
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
      apiBaseUrl: options.apiBaseUrl
        ? sanitizePotentialCredentialedUrl(options.apiBaseUrl)
        : null,
      repository: sanitizePotentialCredentialedUrl(options.repository),
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
