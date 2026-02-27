import { createPersistentCacheNodeKey } from './cache-key.ts'

const SCP_REMOTE_RE = /^(?<user>[A-Za-z0-9._-]+)@(?<host>[A-Za-z0-9.-]+):(?<path>.+)$/

function stripSensitiveSuffix(value: string): string {
  const queryIndex = value.indexOf('?')
  const hashIndex = value.indexOf('#')
  let cutIndex = -1

  if (queryIndex !== -1 && hashIndex !== -1) {
    cutIndex = Math.min(queryIndex, hashIndex)
  } else if (queryIndex !== -1) {
    cutIndex = queryIndex
  } else if (hashIndex !== -1) {
    cutIndex = hashIndex
  }

  return cutIndex === -1 ? value : value.slice(0, cutIndex)
}

function sanitizeScpLikeRemote(value: string): string | undefined {
  const match = SCP_REMOTE_RE.exec(value)
  if (!match?.groups) {
    return undefined
  }

  const user = match.groups['user']
  const host = match.groups['host']
  const path = stripSensitiveSuffix(match.groups['path'] ?? '')
  if (!user || !host || !path) {
    return undefined
  }

  return `${user}@${host}:${path}`
}

export function sanitizeCredentialedGitRemote(value: string): string {
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
    const sanitizedScpRemote = sanitizeScpLikeRemote(input)
    if (sanitizedScpRemote) {
      return sanitizedScpRemote
    }

    return stripSensitiveSuffix(input)
  }

  const sanitizedScpRemote = sanitizeScpLikeRemote(input)
  if (sanitizedScpRemote) {
    return sanitizedScpRemote
  }

  return stripSensitiveSuffix(input)
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
      repository: sanitizeCredentialedGitRemote(options.repository),
      repoRoot:
        typeof options.repoRoot === 'string'
          ? sanitizeCredentialedGitRemote(options.repoRoot)
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
        ? sanitizeCredentialedGitRemote(options.apiBaseUrl)
        : null,
      repository: sanitizeCredentialedGitRemote(options.repository),
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
