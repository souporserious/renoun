import { createPersistentCacheNodeKey } from './cache-key.ts'

const SCP_REMOTE_RE = /^(?<user>[A-Za-z0-9._-]+)@(?<host>[A-Za-z0-9.-]+):(?<path>.+)$/
const GIT_HUB_SHORTHAND_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const COMMON_HOST_SUFFIXES = new Set([
  'app',
  'co',
  'com',
  'dev',
  'io',
  'net',
  'org',
])
const MAX_GIT_CLONE_DIRECTORY_NAME_LENGTH = 72

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

function hasUrlSchemePrefix(value: string): boolean {
  return /^[A-Za-z][A-Za-z\d+.-]*:/.test(value)
}

function isLiteralLocalRepositoryPath(value: string): boolean {
  return (
    !hasUrlSchemePrefix(value) ||
    /^[A-Za-z]:(?:[\\/]|$)/.test(value)
  )
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

function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/i, '')
}

function normalizeStorageToken(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .toLowerCase()
}

function normalizeHostTokens(host: string): string[] {
  const parts = host
    .toLowerCase()
    .split('.')
    .map((part) => normalizeStorageToken(part))
    .filter(Boolean)

  while (
    parts.length > 1 &&
    COMMON_HOST_SUFFIXES.has(parts[parts.length - 1]!)
  ) {
    parts.pop()
  }

  return parts.length > 0 ? parts : ['remote']
}

function normalizePathTokens(path: string): string[] {
  return path
    .split('/')
    .flatMap((part) => stripGitSuffix(part).split(/[-_]+/))
    .map((part) => normalizeStorageToken(part))
    .filter(Boolean)
}

function truncateDirectoryName(value: string): string {
  if (value.length <= MAX_GIT_CLONE_DIRECTORY_NAME_LENGTH) {
    return value
  }

  return value
    .slice(0, MAX_GIT_CLONE_DIRECTORY_NAME_LENGTH)
    .replace(/_+$/g, '')
}

function extractRepositoryStorageTokens(value: string): string[] {
  const input = sanitizeCredentialedGitRemote(value)
  if (!input) {
    return ['repo']
  }

  if (GIT_HUB_SHORTHAND_RE.test(input)) {
    return ['github', ...normalizePathTokens(input)]
  }

  try {
    const url = new URL(input)
    if (url.protocol === 'file:') {
      return ['file', ...normalizePathTokens(decodeURIComponent(url.pathname))]
    }

    return [
      ...normalizeHostTokens(url.hostname),
      ...normalizePathTokens(decodeURIComponent(url.pathname)),
    ]
  } catch {
    const sanitizedScpRemote = sanitizeScpLikeRemote(input)
    if (sanitizedScpRemote) {
      const match = SCP_REMOTE_RE.exec(sanitizedScpRemote)
      if (match?.groups) {
        return [
          ...normalizeHostTokens(match.groups['host'] ?? ''),
          ...normalizePathTokens(match.groups['path'] ?? ''),
        ]
      }
    }
  }

  const fallbackTokens = input
    .split(/[/:@._-]+/)
    .map((part) => normalizeStorageToken(part))
    .filter(Boolean)

  return fallbackTokens.length > 0 ? fallbackTokens : ['repo']
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

    return isLiteralLocalRepositoryPath(input)
      ? input
      : stripSensitiveSuffix(input)
  }

  const sanitizedScpRemote = sanitizeScpLikeRemote(input)
  if (sanitizedScpRemote) {
    return sanitizedScpRemote
  }

  return isLiteralLocalRepositoryPath(input)
    ? input
    : stripSensitiveSuffix(input)
}

export function createGitCloneDirectoryName(value: string): string {
  const tokens = extractRepositoryStorageTokens(value)
  const joined = tokens.join('_').replace(/_+/g, '_').replace(/^_|_$/g, '')

  return truncateDirectoryName(joined || 'repo')
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
