import { existsSync } from 'node:fs'

import { directoryName, normalizeSlashes } from '../utils/path.ts'
import { GitFileSystem } from './GitFileSystem.ts'
import { GitVirtualFileSystem } from './GitVirtualFileSystem.ts'
import { Directory, File } from './entries.tsx'
import {
  coerceSemVer,
  compareSemVer,
  satisfiesRange,
  type SemVer,
} from './semver.ts'
import type {
  ExportHistoryOptions,
  ExportHistoryReport,
  ExportHistoryGenerator,
  GitAuthor,
} from './types.ts'

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

export interface BaseRepositoryOptions {
  /** Local path or remote repository URL/specifier. */
  path: string

  /** Git reference to use for git operations and default URLs. */
  ref?: string

  /**
   * When true (default for remote repositories), use git clone operations.
   * When false, use the host API (virtual).
   */
  clone?: boolean
}

export interface CloneRepositoryOptions extends BaseRepositoryOptions {
  /** Clone remote repositories into a local cache. */
  clone?: true

  /** Shallow clone depth (undefined = full history). */
  depth?: number

  /** Sparse checkout paths for large repositories. */
  sparse?: string[]
}

export interface VirtualRepositoryOptions extends BaseRepositoryOptions {
  /** Disable cloning and use the host API. */
  clone: false

  /** Access token for remote API requests. */
  token?: string
}

export type RepositoryOptions =
  | CloneRepositoryOptions
  | VirtualRepositoryOptions

export type RepositoryInput =
  | Repository
  | RepositoryConfig
  | RepositoryOptions
  | string

export type RepositoryExportHistoryOptions = ExportHistoryOptions & {
  /** Filter the report to only include changes for this export name. */
  exportName?: string
}

type RepositoryFileSystemConfig =
  | {
      kind: 'git'
      repository: string
      ref?: string
      depth?: number
      sparse?: string[]
    }
  | {
      kind: 'virtual'
      repository: string
      host: 'github' | 'gitlab' | 'bitbucket'
      ref?: string
      token?: string
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

  /**
   * Filter releases by a specific package name.
   *
   * When provided, only releases whose tag or name start with `${packageName}@`
   * will be considered. This is useful for repositories that publish multiple
   * packages (e.g. `renoun`, `@renoun/mdx`) from a single Git releases feed.
   */
  packageName?: string

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

export interface GetCommitUrlOptions {
  /** The full or abbreviated commit SHA to link to. */
  sha: string
}

export interface GetReleaseTagUrlOptions {
  /** The tag name of the release (e.g. "v1.2.3" or "r123"). */
  tag: string
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

function isRepositoryConfig(value: unknown): value is RepositoryConfig {
  return Boolean(value && typeof value === 'object' && 'baseUrl' in value)
}

function looksLikeRemoteUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase()
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('git@') ||
    trimmed.startsWith('ssh://')
  )
}

function looksLikeLocalPath(value: string): boolean {
  const trimmed = value.trim()
  return (
    trimmed.startsWith('.') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('~')
  )
}

function looksLikeWindowsDrivePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value)
}

function normalizeSparsePath(path: string): string | null {
  let normalized = normalizeSlashes(path).trim()

  if (!normalized) return null
  if (looksLikeWindowsDrivePath(normalized)) return null

  if (normalized === '.' || normalized === './' || normalized === '/') {
    return null
  }

  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2)
  }

  while (normalized.startsWith('/')) {
    normalized = normalized.slice(1)
  }

  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }

  if (!normalized || normalized === '.') {
    return null
  }

  return normalized
}

function mergeSparsePaths(
  base: string[] | undefined,
  pending: Set<string>
): string[] | undefined {
  const merged = new Set<string>()

  if (base) {
    for (const entry of base) {
      const normalized = normalizeSparsePath(entry)
      if (normalized) {
        merged.add(normalized)
      }
    }
  }

  for (const entry of pending) {
    const normalized = normalizeSparsePath(entry)
    if (normalized) {
      merged.add(normalized)
    }
  }

  if (merged.size === 0) {
    return undefined
  }

  return Array.from(merged)
}

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

function resolveHostFromUrl(value: string): GitHostType | undefined {
  const hostname = getNormalizedHostnameFromUrlString(value)
  if (!hostname) {
    return undefined
  }

  const entries = Object.entries(HOSTS) as [GitHostType, string][]
  for (const [hostType, domain] of entries) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return hostType
    }
  }

  return undefined
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

function buildRepositoryBaseUrl(
  input: string,
  host: GitHostType,
  owner: string,
  repo: string
): string {
  const urlObject = tryGetUrl(input)
  if (urlObject) {
    const origin = `${urlObject.protocol}//${urlObject.host}`
    return joinPaths(joinPaths(origin, owner), repo)
  }

  return `https://${HOSTS[host]}/${owner}/${repo}`
}

function resolveRemoteRepositoryInfo(input: string): {
  host: GitHostType
  owner: string
  repo: string
  ref?: string
  defaultPath?: string
  baseUrl: string
} | null {
  if (looksLikeRemoteUrl(input) && input.startsWith('http')) {
    const host = resolveHostFromUrl(input)
    if (!host) {
      return null
    }
    const extracted = extractOwnerAndRepositoryFromBaseUrl(host, input)
    if (!extracted) {
      return null
    }
    const baseUrl = buildRepositoryBaseUrl(
      input,
      host,
      extracted.owner,
      extracted.repo
    )
    return {
      host,
      owner: extracted.owner,
      repo: extracted.repo,
      baseUrl,
    }
  }

  try {
    const specifier = parseGitSpecifier(input)
    return {
      host: specifier.host,
      owner: specifier.owner,
      repo: specifier.repo,
      ref: specifier.ref,
      defaultPath: specifier.path,
      baseUrl: `https://${HOSTS[specifier.host]}/${specifier.owner}/${specifier.repo}`,
    }
  } catch {
    return null
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
  #baseUrl?: string
  #host?: GitHostType
  #owner?: string
  #repo?: string
  #defaultRef: string = 'main'
  #defaultPath?: string
  #isDefaultRefExplicit: boolean = false
  #path: string
  #fileSystem?: GitFileSystem | GitVirtualFileSystem
  #fileSystemConfig?: RepositoryFileSystemConfig
  #pendingSparsePaths: Set<string> = new Set()
  #releasePromises: Map<string, Promise<Release>> = new Map()
  #githubReleasesPromise?: Promise<any[]>

  constructor(repository?: RepositoryOptions | RepositoryConfig | string) {
    const options =
      repository === undefined
        ? { path: '.' }
        : typeof repository === 'string'
          ? { path: repository }
          : repository

    if (isRepositoryConfig(options)) {
      const { baseUrl, host } = options

      if (baseUrl === undefined) {
        throw new Error(
          `Missing 'baseUrl' in 'git' repository config. Provide this on the \`RootProvider\` via the \`git\` option.`
        )
      }

      this.#path = baseUrl
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

      // Prefer explicit owner/repository from config when provided
      if (options.owner && options.repository) {
        this.#owner = options.owner
        this.#repo = options.repository
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
      if (options.branch) {
        this.#defaultRef = options.branch
        this.#isDefaultRefExplicit = true
      }

      // Optional default path inside repository
      if (options.path) {
        this.#defaultPath = options.path
      }

      const fileSystemRef = options.branch
      if (this.#host && this.#owner && this.#repo && this.#host !== 'pierre') {
        this.#fileSystemConfig = {
          kind: 'virtual',
          repository: `${this.#owner}/${this.#repo}`,
          host: this.#host as 'github' | 'gitlab' | 'bitbucket',
          ref: fileSystemRef,
        }
        return
      }

      this.#fileSystemConfig = {
        kind: 'git',
        repository: this.#path,
        ref: fileSystemRef,
      }
      return
    }

    const normalizedPath = String(options.path ?? '.')
    this.#path = normalizedPath

    const isLocal =
      looksLikeLocalPath(normalizedPath) || existsSync(normalizedPath)
    const isRemote = !isLocal && looksLikeRemoteUrl(normalizedPath)
    let remoteInfo: {
      host: GitHostType
      owner: string
      repo: string
      ref?: string
      defaultPath?: string
      baseUrl: string
    } | null = null

    if (!isLocal) {
      if (isRemote && normalizedPath.startsWith('http')) {
        remoteInfo = resolveRemoteRepositoryInfo(normalizedPath)
      } else if (
        !isRemote &&
        normalizedPath.includes(':') &&
        !looksLikeWindowsDrivePath(normalizedPath)
      ) {
        const specifier = parseGitSpecifier(normalizedPath)
        remoteInfo = {
          host: specifier.host,
          owner: specifier.owner,
          repo: specifier.repo,
          ref: specifier.ref,
          defaultPath: specifier.path,
          baseUrl: `https://${HOSTS[specifier.host]}/${specifier.owner}/${specifier.repo}`,
        }
      } else if (!isRemote) {
        remoteInfo = resolveRemoteRepositoryInfo(normalizedPath)
      } else {
        remoteInfo = resolveRemoteRepositoryInfo(normalizedPath)
      }
    }

    if (remoteInfo) {
      this.#host = remoteInfo.host
      this.#owner = remoteInfo.owner
      this.#repo = remoteInfo.repo
      if (remoteInfo.ref) {
        this.#defaultRef = remoteInfo.ref
        this.#isDefaultRefExplicit = true
      }
      if (remoteInfo.defaultPath) {
        this.#defaultPath = remoteInfo.defaultPath
      }
      this.#baseUrl = remoteInfo.baseUrl
    }

    if (options.ref) {
      this.#defaultRef = options.ref
      this.#isDefaultRefExplicit = true
    }

    const fileSystemRef = options.ref ?? remoteInfo?.ref
    const depth = 'depth' in options ? options.depth : undefined
    const sparse = 'sparse' in options ? options.sparse : undefined
    const wantsVirtual = !isLocal && options.clone === false

    if ((isRemote || remoteInfo) && wantsVirtual) {
      if (!this.#host || !this.#owner || !this.#repo) {
        throw new Error(
          `[renoun] Unable to resolve remote repository "${normalizedPath}". Provide a valid URL/specifier or use a RepositoryConfig with explicit host information.`
        )
      }

      if (this.#host === 'pierre') {
        throw new Error(
          '[renoun] Pierre repositories are not supported for virtual git access. Use { clone: true } to access the repository via git.'
        )
      }

      this.#fileSystemConfig = {
        kind: 'virtual',
        repository: `${this.#owner}/${this.#repo}`,
        host: this.#host as 'github' | 'gitlab' | 'bitbucket',
        ref: fileSystemRef,
        token: 'token' in options ? options.token : undefined,
      }
      return
    }

    this.#fileSystemConfig = {
      kind: 'git',
      repository: normalizedPath,
      ref: fileSystemRef,
      depth,
      sparse,
    }
  }

  /** Returns a directory scoped to this repository. */
  getDirectory(path?: string): Directory {
    return new Directory({
      path: path ?? '.',
      repository: this,
    })
  }

  /** Returns a file scoped to this repository. */
  getFile<Path extends string>(path: Path): File<Record<string, any>, Path> {
    this.registerSparsePath(directoryName(path))
    return new File({
      path,
      repository: this,
    })
  }

  /** Get the first git commit date of a path in this repository. */
  async getFirstCommitDate(path: string): Promise<Date | undefined> {
    const metadata = await this.getFileSystem().getGitFileMetadata(path)
    return metadata.firstCommitDate
  }

  /** Get the last git commit date of a path in this repository. */
  async getLastCommitDate(path: string): Promise<Date | undefined> {
    const metadata = await this.getFileSystem().getGitFileMetadata(path)
    return metadata.lastCommitDate
  }

  /** Get the git authors for a path in this repository. */
  async getAuthors(path: string): Promise<GitAuthor[]> {
    const metadata = await this.getFileSystem().getGitFileMetadata(path)
    return metadata.authors
  }

  /** Get export history for this repository. */
  async *getExportHistory(
    options?: RepositoryExportHistoryOptions
  ): ExportHistoryGenerator {
    const { exportName, ...rest } = options ?? {}

    // When no entry is provided, default to the registered scope paths
    // (e.g. the directory path that created this repository).
    if (!rest.entry && this.#pendingSparsePaths.size > 0) {
      rest.entry = Array.from(this.#pendingSparsePaths)
    }

    const report: ExportHistoryReport =
      yield* this.getFileSystem().getExportHistory(rest)

    if (!exportName) {
      return report
    }

    const ids = report.nameToId[exportName] ?? []
    const filteredExports: ExportHistoryReport['exports'] = {}

    for (const id of ids) {
      const changes = report.exports[id]
      if (changes) {
        filteredExports[id] = changes
      }
    }

    return {
      ...report,
      exports: filteredExports,
      nameToId: ids.length ? { [exportName]: ids } : {},
    }
  }

  /** @internal */
  registerSparsePath(path?: string) {
    if (!path) return

    const normalized = normalizeSparsePath(String(path))
    if (!normalized) return
    this.#pendingSparsePaths.add(normalized)
  }

  /** @internal */
  getFileSystem(): GitFileSystem | GitVirtualFileSystem {
    if (this.#fileSystem) {
      return this.#fileSystem
    }

    if (!this.#fileSystemConfig) {
      this.#fileSystem = new GitFileSystem({
        repository: this.#path,
      })
      return this.#fileSystem
    }

    if (this.#fileSystemConfig.kind === 'virtual') {
      this.#fileSystem = new GitVirtualFileSystem({
        repository: this.#fileSystemConfig.repository,
        host: this.#fileSystemConfig.host,
        ref: this.#fileSystemConfig.ref,
        token: this.#fileSystemConfig.token,
      })
      return this.#fileSystem
    }

    const sparse = mergeSparsePaths(
      this.#fileSystemConfig.sparse,
      this.#pendingSparsePaths
    )

    this.#fileSystem = new GitFileSystem({
      repository: this.#fileSystemConfig.repository,
      ref: this.#fileSystemConfig.ref,
      depth: this.#fileSystemConfig.depth,
      sparse,
    })

    return this.#fileSystem
  }

  /** Returns the string representation of the repository. */
  toString(): string {
    if (!this.#host || !this.#owner || !this.#repo) {
      return this.#path
    }

    const ref = this.#isDefaultRefExplicit ? `@${this.#defaultRef}` : ''
    const path = this.#defaultPath ? `/${this.#defaultPath}` : ''
    return `${this.#host}:${this.#owner}/${this.#repo}${ref}${path}`
  }

  /** Constructs a URL pointing to a specific commit in the repository. */
  getCommitUrl(options: GetCommitUrlOptions): string {
    if (!this.#host || !this.#owner || !this.#repo) {
      throw new Error('Cannot determine owner/repo for this repository.')
    }

    const base = this.#getRepositoryBaseUrl()
    const { sha } = options

    switch (this.#host) {
      case 'github':
        return `${base}/commit/${sha}`
      case 'gitlab':
      case 'pierre':
        return `${base}/-/commit/${sha}`
      case 'bitbucket':
        return `${base}/commits/${sha}`
      default:
        throw new Error(`Unsupported host: ${this.#host}`)
    }
  }

  /** Constructs a URL pointing to a specific release tag in the repository. */
  getReleaseTagUrl(options: GetReleaseTagUrlOptions): string {
    if (!this.#host || !this.#owner || !this.#repo) {
      throw new Error('Cannot determine owner/repo for this repository.')
    }

    const base = this.#getRepositoryBaseUrl()
    const { tag } = options

    switch (this.#host) {
      case 'github':
        return `${base}/releases/tag/${tag}`
      case 'gitlab':
      case 'pierre':
        return `${base}/-/releases/${tag}`
      case 'bitbucket':
        return `${base}/downloads/?tab=tags&query=${encodeURIComponent(tag)}`
      default:
        throw new Error(`Unsupported host: ${this.#host}`)
    }
  }

  /** Constructs a new issue URL for the repository. */
  getIssueUrl(options: GetIssueUrlOptions): string {
    if (!this.#host || !this.#owner || !this.#repo) {
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
    if (!this.#host || !this.#owner || !this.#repo) {
      throw new Error(
        '[renoun] Repository remote information is not configured. Provide a remote repository URL or RepositoryConfig to construct file URLs.'
      )
    }

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
    if (!this.#host || !this.#owner || !this.#repo) {
      throw new Error(
        '[renoun] Repository remote information is not configured. Provide a remote repository URL or RepositoryConfig to construct directory URLs.'
      )
    }

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
    const cacheKey = JSON.stringify({
      release: releaseSpecifier,
      packageName: options?.packageName,
    })

    if (options?.refresh) {
      this.#releasePromises.delete(cacheKey)
      if (this.#host === 'github') {
        this.#githubReleasesPromise = undefined
      }
    }

    let promise = this.#releasePromises.get(cacheKey)
    if (!promise) {
      promise = this.#resolveRelease(releaseSpecifier, options)
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

  async #resolveRelease(
    specifier: ReleaseSpecifier,
    options?: GetReleaseOptions
  ): Promise<Release> {
    if (!this.#owner || !this.#repo) {
      throw new Error(
        '[renoun] Cannot determine owner/repository while resolving a release.'
      )
    }

    try {
      switch (this.#host) {
        case 'github':
          return await this.#resolveGitHubRelease(specifier, options)
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

  async #resolveGitHubRelease(
    specifier: ReleaseSpecifier,
    options?: GetReleaseOptions
  ): Promise<Release> {
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
    const packageName = options?.packageName

    const matchesPackage = (release: any): boolean => {
      if (!packageName) {
        return true
      }

      const tagName =
        typeof release?.tag_name === 'string' ? release.tag_name : ''
      const name = typeof release?.name === 'string' ? release.name : ''
      const prefix = `${packageName}@`

      return tagName.startsWith(prefix) || name.startsWith(prefix)
    }

    const findFirst = (predicate: (release: any) => boolean) =>
      releases.find((release) => matchesPackage(release) && predicate(release))

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
      const exactTag = releases.find((release) => {
        if (!matchesPackage(release)) return false
        return (
          typeof release?.tag_name === 'string' &&
          release.tag_name.toLowerCase() === normalizedLower
        )
      })
      if (exactTag) {
        return format(exactTag)
      }

      const exactName = releases.find((release) => {
        if (!matchesPackage(release)) return false
        return (
          typeof release?.name === 'string' &&
          release.name.toLowerCase() === normalizedLower
        )
      })
      if (exactName) {
        return format(exactName)
      }

      const coercedSpecifier = coerceSemVer(normalized)
      if (coercedSpecifier) {
        const matchingVersion = releases.find((release) => {
          if (!matchesPackage(release)) return false
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
            matchesPackage(entry.release) &&
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
    if (!this.#baseUrl || !this.#host) {
      throw new Error(
        '[renoun] Repository remote information is not configured.'
      )
    }

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
    if (!this.#baseUrl || !this.#host) {
      throw new Error(
        '[renoun] Repository remote information is not configured.'
      )
    }

    const baseUrl = this.#baseUrl
    const host = this.#host
    const lineFragment = this.#formatLineFragment(line, {
      rangeDelimiter: '-L',
    })

    // Compute a repository-aware base URL. If owner/repo are known but not
    // present in `baseUrl` then synthesize "<origin>/<owner>/<repo>"
    const urlObject = tryGetUrl(baseUrl)
    const extracted = extractOwnerAndRepositoryFromBaseUrl(host, baseUrl)
    const hasOwnerRepoInBase = Boolean(extracted)
    const repoBaseUrl =
      this.#owner && this.#repo && urlObject && !hasOwnerRepoInBase
        ? `${urlObject.origin}/${this.#owner}/${this.#repo}`
        : baseUrl

    switch (type) {
      case 'edit':
        if (!hasOwnerRepoInBase && (!this.#owner || !this.#repo)) {
          throw new Error(
            '[renoun] Cannot construct GitHub edit URL without owner/repository. Ensure `RootProvider` is configured with a full git config or provide a `repository` on the Directory.'
          )
        }
        return `${repoBaseUrl}/edit/${ref}/${path}`
      case 'raw': {
        const host = getNormalizedHostnameFromUrlString(baseUrl)

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
    if (!this.#baseUrl || !this.#host) {
      throw new Error(
        '[renoun] Repository remote information is not configured.'
      )
    }

    const baseUrl = this.#baseUrl
    const host = this.#host
    const urlObject = tryGetUrl(baseUrl)
    const extracted = extractOwnerAndRepositoryFromBaseUrl(host, baseUrl)
    const hasOwnerRepoInBase = Boolean(extracted)
    const repoBaseUrl =
      this.#owner && this.#repo && urlObject && !hasOwnerRepoInBase
        ? `${urlObject.origin}/${this.#owner}/${this.#repo}`
        : baseUrl

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
