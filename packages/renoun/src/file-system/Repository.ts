import {
  coerceSemVer,
  compareSemVer,
  satisfiesRange,
  type SemVer,
} from './semver.js'

export type GitHostType = 'github' | 'gitlab' | 'bitbucket' | 'pierre'

export interface RepositoryConfig {
  /** The base URL of the repository host or full repository URL. */
  baseUrl: string

  /** The type of Git host. */
  host: GitHostType

  /** Optional owner and repository, overrides parsing from `baseUrl` when set. */
  owner?: string

  /** Optional repository name, overrides parsing from `baseUrl` when set. */
  repository?: string

  /** Optional default branch/ref, used for URLs. */
  branch?: string

  /** Optional default path prefix inside the repository. */
  path?: string
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

export type ReleaseSpecifier = 'latest' | 'next' | `v${string}` | string

export interface GetReleaseOptions {
  /** Which release to resolve. */
  release?: ReleaseSpecifier

  /** Force a refresh of the cached release metadata. */
  refresh?: boolean
}

export interface GetReleaseUrlOptions extends GetReleaseOptions {
  /** Select a downloadable asset by heuristic or matcher. */
  asset?: true | string | RegExp

  /** Link to the release source archive. */
  source?: 'zip' | 'tar'

  /** Link to a compare view from this ref to the resolved release. */
  compare?: string
}

export interface ReleaseAsset {
  /** Asset display name. */
  name: string

  /** Size of the asset in bytes, when provided. */
  size?: number

  /** MIME type of the asset, when provided. */
  contentType?: string

  /** Direct download URL for the asset. */
  downloadUrl: string
}

export interface Release {
  /** The release tag name. */
  tagName?: string

  /** The release title. */
  name?: string

  /** The HTML URL to the release or releases overview when unavailable. */
  htmlUrl: string

  /** ISO timestamp for when the release was published, if provided by the host. */
  publishedAt?: string

  /** Indicates whether the release is marked as a draft. */
  isDraft: boolean

  /** Indicates whether the release is marked as a prerelease. */
  isPrerelease: boolean

  /** True when the response falls back to a generic releases page. */
  isFallback: boolean

  /** Downloadable assets published alongside the release. */
  assets: ReleaseAsset[]

  /** Direct link to the tarball source archive, when available. */
  tarballUrl?: string

  /** Direct link to the zipball source archive, when available. */
  zipballUrl?: string
}

export interface GetIssueUrlOptions {
  /** The title of the issue. */
  title: string

  /** The description of the issue. */
  description?: string

  /** The labels to assign to the issue. */
  labels?: string[]
}

/** Mapping of hosts to their canonical domains. */
const HOSTS: Record<GitHostType, string> = {
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
  /** The host of the repository. */
  host: GitHostType

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
 * Extract owner and repo from a repository base URL, per host.
 * - GitHub/Bitbucket/Pierre: first two segments are owner/repo.
 * - GitLab: supports nested groups; owner is everything before the last segment.
 */
function extractOwnerAndRepositoryFromBaseUrl(
  host: GitHostType,
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

  if (host === 'gitlab') {
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
 * - Default host for bare "owner/repo" is "github".
 *
 * Examples:
 *   - "owner/repo"
 *   - "github:owner/repo"
 *   - "owner/repo@ref"
 *   - "owner/repo#ref"
 *   - "gitlab:group/subgroup/repo@ref/docs"
 */
export function parseGitSpecifier(input: string): ParsedGitSpecifier {
  let host: GitHostType = 'github'
  let rest = input.trim()

  // Optional "<host>:"
  const colonIndex = rest.indexOf(':')
  if (colonIndex >= 0) {
    const potentialHost = rest.slice(0, colonIndex)
    if (
      potentialHost === 'github' ||
      potentialHost === 'gitlab' ||
      potentialHost === 'bitbucket' ||
      potentialHost === 'pierre'
    ) {
      host = potentialHost as GitHostType
      rest = rest.slice(colonIndex + 1)
    } else {
      throw new Error(
        `Invalid host "${potentialHost}". Must be one of: github, gitlab, bitbucket, pierre`
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
      `Invalid git specifier "${input}". Must be in the form "owner/repo" (optionally with host and ref).`
    )
  }

  const repo = parts.pop()!
  const owner = parts.join('/')

  return { host, owner, repo, ref, path: afterRef }
}

export class Repository {
  #baseUrl: string
  #host: GitHostType
  #owner?: string
  #repo?: string
  #defaultRef: string = 'main'
  #defaultPath?: string
  #isDefaultRefExplicit: boolean = false
  #releasePromises: Map<string, Promise<Release>> = new Map()
  #githubReleasesPromise?: Promise<any[]>

  constructor(repository: RepositoryConfig | string) {
    if (typeof repository === 'string') {
      const specifier = parseGitSpecifier(repository)

      this.#host = specifier.host
      this.#owner = specifier.owner
      this.#repo = specifier.repo
      if (specifier.ref) {
        this.#defaultRef = specifier.ref
        this.#isDefaultRefExplicit = true
      }
      this.#defaultPath = specifier.path
      this.#baseUrl = `https://${HOSTS[this.#host]}/${this.#owner}/${this.#repo}`
    } else {
      const { baseUrl, host } = repository

      if (baseUrl === undefined) {
        throw new Error(
          `Missing 'baseUrl' in 'git' repository config. Provide this on the \`RootProvider\` via the \`git\` option.`
        )
      }

      this.#baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl

      if (host === undefined) {
        throw new Error(
          `Missing 'host' in 'git' repository config. Provide this on the \`RootProvider\` via the \`git\` option.`
        )
      }

      if (!['github', 'gitlab', 'bitbucket', 'pierre'].includes(host)) {
        throw new Error(
          `Invalid host "${host}". Must be one of: github, gitlab, bitbucket, pierre`
        )
      }

      this.#host = host as GitHostType

      if (typeof repository === 'object') {
        // Prefer explicit owner/repository from config when provided
        if (repository.owner && repository.repository) {
          this.#owner = repository.owner
          this.#repo = repository.repository
        } else {
          const extracted = extractOwnerAndRepositoryFromBaseUrl(
            this.#host,
            this.#baseUrl
          )
          if (extracted) {
            this.#owner = extracted.owner
            this.#repo = extracted.repo
          }
        }

        // Respect default branch if provided
        if (repository.branch) {
          this.#defaultRef = repository.branch
          this.#isDefaultRefExplicit = true
        }

        // Optional default path inside repository
        if (repository.path) {
          this.#defaultPath = repository.path
        }
      }
    }

    if (!['github', 'gitlab', 'bitbucket', 'pierre'].includes(this.#host)) {
      throw new Error(`Unsupported host: ${this.#host}`)
    }
  }

  /** Returns the string representation of the repository. */
  toString(): string {
    const ref = this.#isDefaultRefExplicit ? `@${this.#defaultRef}` : ''
    const path = this.#defaultPath ? `/${this.#defaultPath}` : ''
    return `${this.#host}:${this.#owner}/${this.#repo}${ref}${path}`
  }

  /** Constructs a new issue URL for the repository. */
  getIssueUrl(options: GetIssueUrlOptions): string {
    if (!this.#owner || !this.#repo) {
      throw new Error('Cannot determine owner/repo for this repository.')
    }

    const title = options.title
    const description = options.description || ''
    const labels = options.labels || []

    switch (this.#host) {
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
        throw new Error(`Unsupported host: ${this.#host}`)
    }
  }

  /** Constructs a URL for a file in the repository. */
  getFileUrl(options: GetFileUrlOptions): string {
    const { type = 'source', path, line } = options
    const ref = options.ref ?? this.#defaultRef
    const fullPath = this.#defaultPath
      ? joinPaths(this.#defaultPath, path)
      : path

    switch (this.#host) {
      case 'github':
        return this.#getGitHubUrl(type, ref, fullPath, line)
      case 'gitlab':
        return this.#getGitLabUrl(type, ref, fullPath, line)
      case 'bitbucket':
        return this.#getBitbucketUrl(type, ref, fullPath, line)
      case 'pierre':
        return this.#getPierreUrl(type, ref, fullPath)
      default:
        throw new Error(`Unsupported host: ${this.#host}`)
    }
  }

  /** Constructs a URL for a directory in the repository. */
  getDirectoryUrl(options: GetDirectoryUrlOptions): string {
    const { type = 'source', path } = options
    const ref = options.ref ?? this.#defaultRef ?? 'main'
    const fullPath = this.#defaultPath
      ? joinPaths(this.#defaultPath, path)
      : path

    switch (this.#host) {
      case 'github':
        return this.#getGitHubDirectoryUrl(type, ref, fullPath)
      case 'gitlab':
        return this.#getGitLabDirectoryUrl(type, ref, fullPath)
      case 'bitbucket':
        return this.#getBitbucketDirectoryUrl(type, ref, fullPath)
      case 'pierre':
        return this.#getPierreDirectoryUrl(type, ref, fullPath)
      default:
        throw new Error(`Unsupported host: ${this.#host}`)
    }
  }

  /** Retrieve metadata about a release for the repository. */
  async getRelease(options?: GetReleaseOptions): Promise<Release> {
    const releaseSpecifier = options?.release ?? 'latest'
    const cacheKey = JSON.stringify({ release: releaseSpecifier })

    if (options?.refresh) {
      this.#releasePromises.delete(cacheKey)
      if (this.#host === 'github') {
        this.#githubReleasesPromise = undefined
      }
    }

    let promise = this.#releasePromises.get(cacheKey)
    if (!promise) {
      promise = this.#resolveRelease(releaseSpecifier)
      this.#releasePromises.set(cacheKey, promise)
    }

    return promise
  }

  /** Retrieve a URL associated with a release (asset, archive, compare, or HTML). */
  async getReleaseUrl(options?: GetReleaseUrlOptions): Promise<string> {
    const release = await this.getRelease(options)

    if (options?.asset !== undefined) {
      const asset = this.#selectReleaseAsset(release.assets, options.asset)
      if (!asset) {
        throw new Error(
          `[renoun] No release asset matched the provided criteria for ${
            release.tagName ?? release.name ?? 'the requested release'
          }.`
        )
      }
      return asset.downloadUrl
    }

    if (options?.source) {
      const archiveUrl =
        options.source === 'zip' ? release.zipballUrl : release.tarballUrl
      if (!archiveUrl) {
        throw new Error(
          `[renoun] Source archive "${options.source}" is not available for ${
            release.tagName ?? release.name ?? 'the requested release'
          }.`
        )
      }
      return archiveUrl
    }

    if (options?.compare) {
      if (!this.#owner || !this.#repo) {
        throw new Error(
          '[renoun] Cannot construct compare URL without repository owner and name.'
        )
      }
      const targetTag = release.tagName
      if (!targetTag) {
        throw new Error(
          '[renoun] Cannot create compare link because the release does not expose a tag name.'
        )
      }

      switch (this.#host) {
        case 'github':
          return `https://github.com/${this.#owner}/${this.#repo}/compare/${encodeURIComponent(
            options.compare
          )}...${encodeURIComponent(targetTag)}`
        case 'gitlab':
          return `${this.#getRepositoryBaseUrl()}/-/compare/${encodeURIComponent(
            options.compare
          )}...${encodeURIComponent(targetTag)}`
        default:
          throw new Error(
            `[renoun] Compare URLs are not supported for ${this.#host} releases.`
          )
      }
    }

    return release.htmlUrl
  }

  async #resolveRelease(specifier: ReleaseSpecifier): Promise<Release> {
    if (!this.#owner || !this.#repo) {
      throw new Error(
        '[renoun] Cannot determine owner/repository while resolving a release.'
      )
    }

    try {
      switch (this.#host) {
        case 'github':
          return await this.#resolveGitHubRelease(specifier)
        case 'gitlab':
        case 'bitbucket':
        case 'pierre':
        default:
          return {
            htmlUrl: this.#getReleasesPageUrl(),
            isDraft: false,
            isPrerelease: false,
            isFallback: true,
            assets: [],
          }
      }
    } catch {
      return {
        htmlUrl: this.#getReleasesPageUrl(),
        isDraft: false,
        isPrerelease: false,
        isFallback: true,
        assets: [],
      }
    }
  }

  async #resolveGitHubRelease(specifier: ReleaseSpecifier): Promise<Release> {
    const releases = await this.#fetchGitHubReleases()

    if (!Array.isArray(releases) || releases.length === 0) {
      return {
        htmlUrl: this.#getReleasesPageUrl(),
        isDraft: false,
        isPrerelease: false,
        isFallback: true,
        assets: [],
      }
    }

    const normalized = specifier ?? 'latest'

    const findFirst = (predicate: (release: any) => boolean) =>
      releases.find((release) => predicate(release))

    const format = (release: any): Release => this.#formatGitHubRelease(release)

    if (normalized === 'latest') {
      const stable = findFirst(
        (release) => !release.draft && !release.prerelease
      )
      if (stable) {
        return format(stable)
      }
    } else if (normalized === 'next') {
      const candidate = findFirst((release) => !release.draft)
      if (candidate) {
        return format(candidate)
      }
    } else {
      const normalizedLower = normalized.toLowerCase()
      const exactTag = releases.find(
        (release) =>
          typeof release?.tag_name === 'string' &&
          release.tag_name.toLowerCase() === normalizedLower
      )
      if (exactTag) {
        return format(exactTag)
      }

      const exactName = releases.find(
        (release) =>
          typeof release?.name === 'string' &&
          release.name.toLowerCase() === normalizedLower
      )
      if (exactName) {
        return format(exactName)
      }

      const coercedSpecifier = coerceSemVer(normalized)
      if (coercedSpecifier) {
        const matchingVersion = releases.find((release) => {
          const version = this.#coerceGitHubReleaseVersion(release)
          return version && compareSemVer(version, coercedSpecifier) === 0
        })
        if (matchingVersion) {
          return format(matchingVersion)
        }
      }

      const matching = releases
        .map((release) => ({
          release,
          version: this.#coerceGitHubReleaseVersion(release),
        }))
        .filter((entry): entry is { release: any; version: SemVer } =>
          Boolean(
            entry.version &&
              satisfiesRange(entry.version, normalized, {
                includePrerelease: true,
              })
          )
        )
        .sort((a, b) => compareSemVer(b.version, a.version))
        .map((entry) => entry.release)

      if (matching.length > 0) {
        return format(matching[0])
      }
    }

    const fallback = findFirst(
      (release) => !release.draft && !release.prerelease
    )
    if (fallback) {
      return format(fallback)
    }

    throw new Error(
      `[renoun] Unable to locate a GitHub release matching "${normalized}".`
    )
  }

  async #fetchGitHubReleases(): Promise<any[]> {
    if (this.#githubReleasesPromise) {
      return this.#githubReleasesPromise
    }

    const fetchImpl = globalThis.fetch

    if (typeof fetchImpl !== 'function') {
      throw new Error(
        '[renoun] Global fetch is required to resolve GitHub releases.'
      )
    }

    this.#githubReleasesPromise = (async () => {
      const response = await fetchImpl(
        `https://api.github.com/repos/${this.#owner}/${this.#repo}/releases?per_page=100`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'renoun',
          },
        }
      )

      if (!response.ok) {
        throw new Error(
          `[renoun] Failed to fetch releases for ${this.#owner}/${this.#repo}. Received status ${response.status}.`
        )
      }

      const payload = await response.json()
      return Array.isArray(payload) ? payload : []
    })()

    return this.#githubReleasesPromise
  }

  #formatGitHubRelease(release: any): Release {
    const tagName =
      typeof release?.tag_name === 'string' &&
      release.tag_name.trim().length > 0
        ? release.tag_name
        : undefined
    const name =
      typeof release?.name === 'string' && release.name.trim().length > 0
        ? release.name
        : undefined
    const htmlUrl =
      typeof release?.html_url === 'string' && release.html_url.length > 0
        ? release.html_url
        : this.#getReleasesPageUrl()
    const publishedAt =
      typeof release?.published_at === 'string' &&
      release.published_at.length > 0
        ? release.published_at
        : undefined

    const assets: ReleaseAsset[] = Array.isArray(release?.assets)
      ? (release.assets as any[])
          .map((asset): ReleaseAsset | null => {
            if (
              asset &&
              typeof asset.browser_download_url === 'string' &&
              asset.browser_download_url.length > 0 &&
              typeof asset.name === 'string'
            ) {
              return {
                name: asset.name,
                size: typeof asset.size === 'number' ? asset.size : undefined,
                contentType:
                  typeof asset.content_type === 'string'
                    ? asset.content_type
                    : undefined,
                downloadUrl: asset.browser_download_url,
              } satisfies ReleaseAsset
            }
            return null
          })
          .filter((asset): asset is ReleaseAsset => asset !== null)
      : []

    const tarballUrl =
      typeof release?.tarball_url === 'string' && release.tarball_url.length > 0
        ? release.tarball_url
        : undefined
    const zipballUrl =
      typeof release?.zipball_url === 'string' && release.zipball_url.length > 0
        ? release.zipball_url
        : undefined

    return {
      tagName,
      name,
      htmlUrl,
      publishedAt,
      isDraft: Boolean(release?.draft),
      isPrerelease: Boolean(release?.prerelease),
      isFallback: false,
      assets,
      tarballUrl,
      zipballUrl,
    }
  }

  #coerceGitHubReleaseVersion(release: any): SemVer | undefined {
    if (typeof release?.tag_name === 'string') {
      const tagVersion = coerceSemVer(release.tag_name)
      if (tagVersion) {
        return tagVersion
      }
    }

    if (typeof release?.name === 'string') {
      const nameVersion = coerceSemVer(release.name)
      if (nameVersion) {
        return nameVersion
      }
    }

    return undefined
  }

  #selectReleaseAsset(
    assets: ReleaseAsset[],
    matcher: true | string | RegExp
  ): ReleaseAsset | undefined {
    if (!Array.isArray(assets) || assets.length === 0) {
      return undefined
    }

    if (matcher === true) {
      return this.#pickAssetForPlatform(assets) ?? assets[0]
    }

    if (typeof matcher === 'string') {
      const needle = matcher.toLowerCase()
      return assets.find((asset) => asset.name.toLowerCase().includes(needle))
    }

    return assets.find((asset) => matcher.test(asset.name))
  }

  #pickAssetForPlatform(assets: ReleaseAsset[]): ReleaseAsset | undefined {
    const platform = this.#detectPlatform()
    const platformMatchers: Record<'windows' | 'mac' | 'linux', RegExp[]> = {
      windows: [/\bwindows\b/i, /\bwin(?:32|64)?\b/i, /\.exe$/i, /\.msi$/i],
      mac: [/\bmac\b/i, /\bosx\b/i, /\bdarwin\b/i, /\.dmg$/i, /\.pkg$/i],
      linux: [
        /\blinux\b/i,
        /\bubuntu\b/i,
        /\bamd64\b/i,
        /\bx86_64\b/i,
        /\.appimage$/i,
        /\.deb$/i,
        /\.rpm$/i,
        /\.tar\.(gz|xz)$/i,
      ],
    }

    const matchers = platformMatchers[platform as keyof typeof platformMatchers]
    if (!matchers) {
      return undefined
    }

    return assets.find((asset) =>
      matchers.some((matcher) => matcher.test(asset.name))
    )
  }

  #detectPlatform(): 'windows' | 'mac' | 'linux' | 'unknown' {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined
    const userAgent =
      nav && typeof nav.userAgent === 'string' ? nav.userAgent : undefined
    const identifier = `${userAgent ?? ''}`.toLowerCase()

    if (identifier.includes('win')) {
      return 'windows'
    }
    if (identifier.includes('mac') || identifier.includes('os x')) {
      return 'mac'
    }
    if (identifier.includes('linux') || identifier.includes('x11')) {
      return 'linux'
    }

    if (
      typeof process !== 'undefined' &&
      typeof process.platform === 'string'
    ) {
      switch (process.platform) {
        case 'win32':
          return 'windows'
        case 'darwin':
          return 'mac'
        case 'linux':
          return 'linux'
      }
    }

    return 'unknown'
  }

  #getRepositoryBaseUrl(): string {
    const urlObject = tryGetUrl(this.#baseUrl)
    const extracted = extractOwnerAndRepositoryFromBaseUrl(
      this.#host,
      this.#baseUrl
    )
    const hasOwnerRepoInBase = Boolean(extracted)

    if (this.#owner && this.#repo && urlObject && !hasOwnerRepoInBase) {
      return `${urlObject.origin}/${this.#owner}/${this.#repo}`
    }

    return this.#baseUrl
  }

  #getReleasesPageUrl(): string {
    const base = this.#getRepositoryBaseUrl()

    switch (this.#host) {
      case 'github':
        return `${base}/releases`
      case 'gitlab':
      case 'pierre':
        return `${base}/-/releases`
      case 'bitbucket':
        return `${base}/downloads/?tab=tags`
      default:
        return `${base}/releases`
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

    // Compute a repository-aware base URL. If owner/repo are known but not
    // present in `baseUrl` then synthesize "<origin>/<owner>/<repo>"
    const urlObject = tryGetUrl(this.#baseUrl)
    const extracted = extractOwnerAndRepositoryFromBaseUrl(
      this.#host,
      this.#baseUrl
    )
    const hasOwnerRepoInBase = Boolean(extracted)
    const repoBaseUrl =
      this.#owner && this.#repo && urlObject && !hasOwnerRepoInBase
        ? `${urlObject.origin}/${this.#owner}/${this.#repo}`
        : this.#baseUrl

    switch (type) {
      case 'edit':
        if (!hasOwnerRepoInBase && (!this.#owner || !this.#repo)) {
          throw new Error(
            '[renoun] Cannot construct GitHub edit URL without owner/repository. Ensure `RootProvider` is configured with a full git config or provide a `repository` on the Directory.'
          )
        }
        return `${repoBaseUrl}/edit/${ref}/${path}`
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
        return `${repoBaseUrl}/raw/${ref}/${path}`
      }
      case 'blame':
        if (!hasOwnerRepoInBase && (!this.#owner || !this.#repo)) {
          throw new Error(
            '[renoun] Cannot construct GitHub blame URL without owner/repository. Ensure git configuration includes owner and repository.'
          )
        }
        return `${repoBaseUrl}/blame/${ref}/${path}${lineFragment}`
      case 'history':
        if (!hasOwnerRepoInBase && (!this.#owner || !this.#repo)) {
          throw new Error(
            '[renoun] Cannot construct GitHub history URL without owner/repository. Ensure git configuration includes owner and repository.'
          )
        }
        return `${repoBaseUrl}/commits/${ref}/${path}`
      case 'source':
      default:
        if (!hasOwnerRepoInBase && (!this.#owner || !this.#repo)) {
          throw new Error(
            '[renoun] Cannot construct GitHub source URL without owner/repository. Ensure git configuration includes owner and repository.'
          )
        }
        return `${repoBaseUrl}/blob/${ref}/${path}${lineFragment}`
    }
  }

  #getGitHubDirectoryUrl(
    type: 'source' | 'history',
    ref: string,
    path: string
  ): string {
    const urlObject = tryGetUrl(this.#baseUrl)
    const extracted = extractOwnerAndRepositoryFromBaseUrl(
      this.#host,
      this.#baseUrl
    )
    const hasOwnerRepoInBase = Boolean(extracted)
    const repoBaseUrl =
      this.#owner && this.#repo && urlObject && !hasOwnerRepoInBase
        ? `${urlObject.origin}/${this.#owner}/${this.#repo}`
        : this.#baseUrl

    switch (type) {
      case 'history':
        if (!hasOwnerRepoInBase && (!this.#owner || !this.#repo)) {
          throw new Error(
            '[renoun] Cannot construct GitHub directory history URL without owner/repository. Ensure git configuration includes owner and repository.'
          )
        }
        return `${repoBaseUrl}/commits/${ref}/${path}`
      case 'source':
      default:
        if (!hasOwnerRepoInBase && (!this.#owner || !this.#repo)) {
          throw new Error(
            '[renoun] Cannot construct GitHub directory source URL without owner/repository. Ensure git configuration includes owner and repository.'
          )
        }
        return `${repoBaseUrl}/tree/${ref}/${path}`
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

    if (this.#host === 'bitbucket') {
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
