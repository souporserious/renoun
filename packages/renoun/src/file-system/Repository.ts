export type GitProviderType = 'github' | 'gitlab' | 'bitbucket' | 'pierre'

export interface RepositoryConfig {
  /** The base URL of the repository. */
  baseUrl: string

  /** The type of Git provider. */
  provider: GitProviderType
}

export interface GetFileUrlOptions {
  /** The path to the file within the repository. */
  path: string

  /** The file URL type. */
  type?: 'source' | 'edit' | 'raw' | 'blame' | 'history'

  /** A reference to a branch, tag, or commit. */
  ref?: string

  /** Single line or range of start and end lines to link to. */
  line?: number | [number, number]
}

export interface GetDirectoryUrlOptions {
  /** The path to the directory within the repository. */
  path: string

  /** The directory URL type. */
  type?: 'source' | 'history'

  /** A reference to a branch, tag, or commit. */
  ref?: string
}

export interface GetIssueUrlOptions {
  /** The title of the issue. */
  title: string

  /** The description of the issue. */
  description?: string

  /** The labels to assign to the issue. */
  labels?: string[]
}

/** Mapping of providers to their canonical hosts. */
const HOSTS: Record<GitProviderType, string> = {
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org',
  pierre: 'pierre.co',
} as const

/** GitLab path stop-tokens that indicate content views after owner/repo. */
const GITLAB_STOP_TOKENS: ReadonlySet<string> = new Set<string>([
  '-',
  'tree',
  'blob',
  'raw',
  'commit',
  'commits',
  'issues',
  'merge_requests',
  'w',
])

/** Parsed git specifier. */
export interface ParsedGitSpecifier {
  /** The provider of the repository. */
  provider: GitProviderType

  /** The owner of the repository. */
  owner: string

  /** The repository name. */
  repo: string

  /** Optional ref (branch/tag/sha). */
  ref?: string

  /** Optional default path after the ref (e.g. "@main/docs"). */
  path?: string
}

/** Join two path segments without producing duplicate slashes. */
function joinPaths(a?: string, b?: string): string {
  if (!a && !b) {
    return ''
  }
  if (!a) {
    return b as string
  }
  if (!b) {
    return a
  }

  const aEndsWithSlash = a.endsWith('/')
  const bStartsWithSlash = b.startsWith('/')

  if (aEndsWithSlash && bStartsWithSlash) {
    return a + b.slice(1) // remove duplicate slash
  }
  if (!aEndsWithSlash && !bStartsWithSlash) {
    return a + '/' + b // add missing slash
  }
  return a + b // already correct
}

/** Trim leading and trailing slashes. */
function trimEdgeSlashes(value: string): string {
  let startIndex = 0
  let endIndex = value.length - 1

  while (startIndex <= endIndex && value.charCodeAt(startIndex) === 47) {
    startIndex++
  }
  while (endIndex >= startIndex && value.charCodeAt(endIndex) === 47) {
    endIndex--
  }

  if (endIndex < startIndex) {
    return ''
  }
  if (startIndex === 0 && endIndex === value.length - 1) {
    return value
  }
  return value.slice(startIndex, endIndex + 1)
}

/** Remove a trailing ".git" suffix. */
function stripGitSuffix(value: string): string {
  const lower = value.toLowerCase()
  if (lower.endsWith('.git')) {
    return value.slice(0, value.length - 4)
  }
  return value
}

/** Try to parse a string as a URL, adding "https://" if no scheme is present. */
function tryGetUrl(input: string): URL | null {
  let value = input.trim()

  const schemeMarkerIndex = value.indexOf('://')
  if (schemeMarkerIndex <= 0) {
    value = 'https://' + value
  }

  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** Normalize and return a hostname from a possibly scheme-less URL string. */
function getNormalizedHostnameFromUrlString(value: string): string | null {
  let candidate = value.trim()
  const schemeMarkerIndex = candidate.indexOf('://')
  if (schemeMarkerIndex <= 0) {
    candidate = 'https://' + candidate
  }

  try {
    let hostname = new URL(candidate).hostname.toLowerCase()
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4)
    }
    return hostname
  } catch {
    return null
  }
}

/** Split a URL pathname into clean segments. */
function getCleanPathSegments(urlObject: URL): string[] {
  let pathname = urlObject.pathname
  pathname = trimEdgeSlashes(pathname)
  pathname = stripGitSuffix(pathname)

  if (pathname.length === 0) {
    return []
  }

  const segments = pathname.split('/')
  return segments
}

/**
 * Extract owner and repo from a repository base URL, per provider.
 * - GitHub/Bitbucket/Pierre: first two segments are owner/repo.
 * - GitLab: supports nested groups; owner is everything before the last segment.
 */
function extractOwnerAndRepositoryFromBaseUrl(
  provider: GitProviderType,
  baseUrl: string
): { owner: string; repo: string } | null {
  const urlObject = tryGetUrl(baseUrl)
  if (urlObject === null) {
    return null
  }

  let hostname = urlObject.hostname.toLowerCase()
  if (hostname.startsWith('www.')) {
    hostname = hostname.slice(4)
  }

  let segments = getCleanPathSegments(urlObject)

  if (provider === 'gitlab') {
    let stopIndex = -1
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      if (GITLAB_STOP_TOKENS.has(segment)) {
        stopIndex = i
        break
      }
    }
    if (stopIndex >= 0) {
      segments = segments.slice(0, stopIndex)
    }

    if (segments.length >= 2) {
      const repositoryName = segments[segments.length - 1]
      const ownerPath = segments.slice(0, segments.length - 1).join('/')
      return { owner: ownerPath, repo: repositoryName }
    } else {
      return null
    }
  } else {
    if (segments.length >= 2) {
      const [owner, repo] = segments
      return { owner, repo }
    } else {
      return null
    }
  }
}

/**
 * Parse a git specifier string into a `ParsedGitSpecifier` object.
 *
 * - If both '@' and '#' appear, the earliest is used as the ref separator.
 * - A trailing path is only allowed AFTER a ref (i.e. "@ref/path").
 * - Default provider for bare "owner/repo" is "github".
 *
 * Examples:
 *   - "owner/repo"
 *   - "github:owner/repo"
 *   - "owner/repo@ref"
 *   - "owner/repo#ref"
 *   - "gitlab:group/subgroup/repo@ref/docs"
 */
export function parseGitSpecifier(input: string): ParsedGitSpecifier {
  let provider: GitProviderType = 'github'
  let rest = input.trim()

  // Optional "<provider>:"
  const colonIndex = rest.indexOf(':')
  if (colonIndex >= 0) {
    const potentialProvider = rest.slice(0, colonIndex)
    if (
      potentialProvider === 'github' ||
      potentialProvider === 'gitlab' ||
      potentialProvider === 'bitbucket' ||
      potentialProvider === 'pierre'
    ) {
      provider = potentialProvider as GitProviderType
      rest = rest.slice(colonIndex + 1)
    } else {
      throw new Error(
        `Invalid provider "${potentialProvider}". Must be one of: github, gitlab, bitbucket, pierre`
      )
    }
  }

  // Prefer the earliest of '@' or '#'
  const atIndex = rest.indexOf('@')
  const hashIndex = rest.indexOf('#')
  const separatorIndex =
    atIndex >= 0 && hashIndex >= 0
      ? Math.min(atIndex, hashIndex)
      : Math.max(atIndex, hashIndex)

  let ref: string | undefined
  let afterRef: string | undefined

  if (separatorIndex >= 0) {
    const refAndMaybePath = rest.slice(separatorIndex + 1)
    rest = rest.slice(0, separatorIndex)

    const slashAfterRef = refAndMaybePath.indexOf('/')
    if (slashAfterRef >= 0) {
      ref = refAndMaybePath.slice(0, slashAfterRef)
      afterRef = refAndMaybePath.slice(slashAfterRef + 1)
    } else {
      ref = refAndMaybePath
    }
  }

  // Strip optional .git suffix
  rest = stripGitSuffix(rest)

  const parts = rest.split('/').filter(Boolean)
  if (parts.length < 2) {
    throw new Error(
      `Invalid git specifier "${input}". Must be in the form "owner/repo" (optionally with provider and ref).`
    )
  }

  const repo = parts.pop()!
  const owner = parts.join('/')

  return { provider, owner, repo, ref, path: afterRef }
}

export class Repository {
  #baseUrl: string
  #provider: GitProviderType
  #owner?: string
  #repo?: string
  #defaultRef: string = 'main'
  #defaultPath?: string
  #isDefaultRefExplicit: boolean = false

  constructor(repository: RepositoryConfig | string) {
    if (typeof repository === 'string') {
      const specifier = parseGitSpecifier(repository)

      this.#provider = specifier.provider
      this.#owner = specifier.owner
      this.#repo = specifier.repo
      if (specifier.ref) {
        this.#defaultRef = specifier.ref
        this.#isDefaultRefExplicit = true
      }
      this.#defaultPath = specifier.path
      this.#baseUrl = `https://${HOSTS[this.#provider]}/${this.#owner}/${this.#repo}`
    } else {
      const { baseUrl, provider } = repository

      if (baseUrl === undefined) {
        throw new Error(
          `Missing 'baseUrl' in 'git' repository config in 'renoun.json' file.`
        )
      }

      this.#baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl

      if (provider === undefined) {
        throw new Error(
          `Missing 'provider' in 'git' repository config in 'renoun.json' file.`
        )
      }

      if (!['github', 'gitlab', 'bitbucket', 'pierre'].includes(provider)) {
        throw new Error(
          `Invalid provider "${provider}". Must be one of: github, gitlab, bitbucket, pierre`
        )
      }

      this.#provider = provider as GitProviderType

      const extracted = extractOwnerAndRepositoryFromBaseUrl(
        this.#provider,
        this.#baseUrl
      )
      if (extracted) {
        this.#owner = extracted.owner
        this.#repo = extracted.repo
      }
    }

    if (!['github', 'gitlab', 'bitbucket', 'pierre'].includes(this.#provider)) {
      throw new Error(`Unsupported provider: ${this.#provider}`)
    }
  }

  /** Returns the string representation of the repository. */
  toString(): string {
    const ref = this.#isDefaultRefExplicit ? `@${this.#defaultRef}` : ''
    const path = this.#defaultPath ? `/${this.#defaultPath}` : ''
    return `${this.#provider}:${this.#owner}/${this.#repo}${ref}${path}`
  }

  /** Constructs a new issue URL for the repository. */
  getIssueUrl(options: GetIssueUrlOptions): string {
    if (!this.#owner || !this.#repo) {
      throw new Error('Cannot determine owner/repo for this repository.')
    }

    const title = options.title
    const description = options.description || ''
    const labels = options.labels || []

    switch (this.#provider) {
      case 'github': {
        const params = new URLSearchParams({
          title,
          body: description,
        })
        if (labels.length > 0) {
          params.set('labels', labels.join(','))
        }
        return `https://github.com/${this.#owner}/${this.#repo}/issues/new?${params.toString()}`
      }

      case 'gitlab': {
        const params = new URLSearchParams()
        params.set('issue[title]', title)
        params.set('issue[description]', description)
        for (const label of labels) {
          params.append('issue[label_names][]', label)
        }
        return `https://gitlab.com/${this.#owner}/${this.#repo}/-/issues/new?${params.toString()}`
      }

      case 'bitbucket': {
        const params = new URLSearchParams({
          title,
          content: description,
        })

        return `https://bitbucket.org/${this.#owner}/${this.#repo}/issues/new?${params.toString()}`
      }

      default:
        throw new Error(`Unsupported provider: ${this.#provider}`)
    }
  }

  /** Constructs a URL for a file in the repository. */
  getFileUrl(options: GetFileUrlOptions): string {
    const { type = 'source', path, line } = options
    const ref = options.ref ?? this.#defaultRef
    const fullPath = this.#defaultPath
      ? joinPaths(this.#defaultPath, path)
      : path

    switch (this.#provider) {
      case 'github':
        return this.#getGitHubUrl(type, ref, fullPath, line)
      case 'gitlab':
        return this.#getGitLabUrl(type, ref, fullPath, line)
      case 'bitbucket':
        return this.#getBitbucketUrl(type, ref, fullPath, line)
      case 'pierre':
        return this.#getPierreUrl(type, ref, fullPath)
      default:
        throw new Error(`Unsupported provider: ${this.#provider}`)
    }
  }

  /** Constructs a URL for a directory in the repository. */
  getDirectoryUrl(options: GetDirectoryUrlOptions): string {
    const { type = 'source', path } = options
    const ref = options.ref ?? this.#defaultRef ?? 'main'
    const fullPath = this.#defaultPath
      ? joinPaths(this.#defaultPath, path)
      : path

    switch (this.#provider) {
      case 'github':
        return this.#getGitHubDirectoryUrl(type, ref, fullPath)
      case 'gitlab':
        return this.#getGitLabDirectoryUrl(type, ref, fullPath)
      case 'bitbucket':
        return this.#getBitbucketDirectoryUrl(type, ref, fullPath)
      case 'pierre':
        return this.#getPierreDirectoryUrl(type, ref, fullPath)
      default:
        throw new Error(`Unsupported provider: ${this.#provider}`)
    }
  }

  #getGitHubUrl(
    type: string,
    ref: string,
    path: string,
    line?: number | [number, number]
  ): string {
    const lineFragment = this.#formatLineFragment(line, {
      rangeDelimiter: '-L',
    })

    switch (type) {
      case 'edit':
        return `${this.#baseUrl}/edit/${ref}/${path}`
      case 'raw': {
        const host = getNormalizedHostnameFromUrlString(this.#baseUrl)

        // Public GitHub: use raw.githubusercontent.com
        if (host === HOSTS.github) {
          if (this.#owner && this.#repo) {
            return `https://raw.githubusercontent.com/${this.#owner}/${this.#repo}/${ref}/${path}`
          }
          throw new Error('Cannot generate raw URL without owner/repo')
        }

        // GitHub Enterprise: the instance serves raw at "/raw/<ref>/<path>"
        return `${this.#baseUrl}/raw/${ref}/${path}`
      }
      case 'blame':
        return `${this.#baseUrl}/blame/${ref}/${path}${lineFragment}`
      case 'history':
        return `${this.#baseUrl}/commits/${ref}/${path}`
      case 'source':
      default:
        return `${this.#baseUrl}/blob/${ref}/${path}${lineFragment}`
    }
  }

  #getGitHubDirectoryUrl(
    type: 'source' | 'history',
    ref: string,
    path: string
  ): string {
    switch (type) {
      case 'history':
        return `${this.#baseUrl}/commits/${ref}/${path}`
      case 'source':
      default:
        return `${this.#baseUrl}/tree/${ref}/${path}`
    }
  }

  #getGitLabUrl(
    type: string,
    ref: string,
    path: string,
    line?: number | [number, number]
  ): string {
    const lineFragment = this.#formatLineFragment(line, {
      rangeDelimiter: '-',
    })

    switch (type) {
      case 'edit':
        return `${this.#baseUrl}/-/edit/${ref}/${path}`
      case 'raw':
        return `${this.#baseUrl}/-/raw/${ref}/${path}`
      case 'blame':
        return `${this.#baseUrl}/-/blame/${ref}/${path}${lineFragment}`
      case 'history':
        return `${this.#baseUrl}/-/commits/${ref}/${path}`
      case 'source':
      default:
        return `${this.#baseUrl}/-/blob/${ref}/${path}${lineFragment}`
    }
  }

  #getGitLabDirectoryUrl(
    type: 'source' | 'history',
    ref: string,
    path: string
  ): string {
    switch (type) {
      case 'history':
        return `${this.#baseUrl}/-/commits/${ref}/${path}`
      case 'source':
      default:
        return `${this.#baseUrl}/-/tree/${ref}/${path}`
    }
  }

  #getBitbucketUrl(
    type: string,
    ref: string,
    path: string,
    line?: number | [number, number]
  ): string {
    const lineFragment = this.#formatLineFragment(line)

    switch (type) {
      case 'edit':
        return `${this.#baseUrl}/src/${ref}/${path}?mode=edit`
      case 'raw':
        return `${this.#baseUrl}/raw/${ref}/${path}`
      case 'blame':
        return `${this.#baseUrl}/annotate/${ref}/${path}${lineFragment}`
      case 'history':
        return `${this.#baseUrl}/history/${ref}/${path}`
      case 'source':
      default:
        return `${this.#baseUrl}/src/${ref}/${path}${lineFragment}`
    }
  }

  #getBitbucketDirectoryUrl(
    type: 'source' | 'history',
    ref: string,
    path: string
  ): string {
    switch (type) {
      case 'history':
        return `${this.#baseUrl}/history/${ref}/${path}`
      case 'source':
      default:
        return `${this.#baseUrl}/src/${ref}/${path}`
    }
  }

  #getPierreUrl(type: string, ref: string, path: string): string {
    switch (type) {
      case 'edit':
      case 'raw':
      case 'blame':
        throw new Error(
          `[renoun] getFileUrl "${type}" type is not supported for Pierre repositories. Use "history" or "source" type instead.`
        )
    }
    if (type === 'history') {
      return `${this.#baseUrl}/history?commit=${ref}`
    }
    return `${this.#baseUrl}/files?path=${encodeURIComponent(path)}`
  }

  #getPierreDirectoryUrl(
    type: 'source' | 'history',
    ref: string,
    path: string
  ): string {
    switch (type) {
      case 'history':
        return `${this.#baseUrl}/history?commit=${ref}`
      case 'source':
      default:
        return `${this.#baseUrl}/files?path=${encodeURIComponent(path)}`
    }
  }

  #formatLineFragment(
    line: number | [number, number] | undefined,
    { rangeDelimiter = '-' }: { rangeDelimiter?: string } = {}
  ): string {
    if (!line) {
      return ''
    }

    if (this.#provider === 'bitbucket') {
      if (Array.isArray(line) && line.length === 2) {
        const [start, end] = line
        return `#lines-${start}:${end}`
      } else if (typeof line === 'number') {
        return `#lines-${line}`
      }
      return ''
    }

    if (Array.isArray(line) && line.length === 2) {
      const [start, end] = line
      return `#L${start}${rangeDelimiter}${end}`
    }

    if (typeof line === 'number') {
      return `#L${line}`
    }

    return ''
  }
}
