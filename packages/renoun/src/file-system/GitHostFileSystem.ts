import { createHash } from 'node:crypto'

import {
  directoryName,
  joinPaths,
  normalizePath,
  normalizeSlashes,
} from '../utils/path.ts'
import type { GitMetadata } from '../utils/get-local-git-file-metadata.ts'
import { Semaphore } from '../utils/Semaphore.ts'
import {
  hasJavaScriptLikeExtension,
  type JavaScriptLikeExtension,
} from '../utils/is-javascript-like-extension.ts'
import {
  InMemoryFileSystem,
  type InMemoryFileContent,
} from './InMemoryFileSystem.ts'
import type { AsyncFileSystem, WritableFileSystem } from './FileSystem.ts'
import type {
  DirectoryEntry,
  ExportHistoryOptions,
  ExportHistoryReport,
  ExportChange,
  GitFileMetadata,
  GitModuleMetadata,
  GitPathMetadata,
  GitAuthor,
  GitExportMetadata,
} from './types.ts'
import {
  type ExportItem,
  EXTENSION_PRIORITY,
  INDEX_FILE_CANDIDATES,
  parseExportId,
  formatExportId,
  scanModuleExports,
  isUnderScope,
  looksLikeFilePath,
  LRUMap,
  mapWithLimit,
  buildExportComparisonMaps,
  detectSameFileRenames,
  detectCrossFileRenames,
  mergeRenameHistory,
  checkAndCollapseOscillation,
} from './export-analysis.ts'

type GitHost = 'github' | 'gitlab' | 'bitbucket'

type MetadataForPath<Path extends string> = string extends Path
  ? GitPathMetadata
  : Path extends `${string}.${JavaScriptLikeExtension}`
    ? GitModuleMetadata
    : GitFileMetadata

interface GitHostFileSystemOptions {
  /** Repository in the format "owner/repo". */
  repository: string

  /** Branch, tag, or commit reference. Defaults to 'main'. */
  ref?: string

  /** Git host */
  host?: GitHost

  /** Custom API base URL for self-hosted GitLab instances (https://host[:port]). */
  baseUrl?: string

  /** Personal access / OAuth token for private repositories or higher rate limits. */
  token?: string

  /** Request timeout in milliseconds. Defaults to 30 seconds. */
  timeoutMs?: number

  /** Optional extraction/resource limits overrides. */
  limits?: {
    /** Max total archive bytes processed during extraction (default 100 MiB). */
    maxArchiveBytes?: number

    /** Max raw bytes read from the tar stream (default 150 MiB). */
    maxTarStreamBytes?: number

    /** Max number of files stored (default 50,000). */
    maxFileCount?: number

    /** Max bytes per single file; larger files are skipped (default 8 MiB). */
    maxFileBytes?: number
  }

  include?: string[]

  exclude?: string[]
}

const repoPattern = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/
const gitlabRepoPattern = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+$/

const MAX_ARCHIVE_SIZE_BYTES = 100 * 1024 * 1024 // 100 MiB
const MAX_TAR_STREAM_BYTES = 150 * 1024 * 1024 // 150 MiB

const MAX_RELATIVE_PATH_LENGTH = 4_096
const MAX_PATH_SEGMENT_LENGTH = 512
const MAX_PATH_SEGMENTS = 256
const MAX_FILE_COUNT = 50_000
const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_GITHUB_BLAME_LINE = 1_000_000

const MAX_GITHUB_BLAME_BATCH = 20
const GITHUB_BLAME_BATCH_DELAY_MS = 15

const TAR_TYPE_FLAGS = {
  NormalFile: 0x00,
  NormalFileAlternative: 0x30, // '0'
  NormalFileSpace: 0x20, // ' '
  NormalFileSeven: 0x37, // '7'
  Directory: 0x35, // '5'
  HardLink: 0x31, // '1'
  SymLink: 0x32, // '2'
  PaxExtendedHeader: 0x78, // 'x'
  PaxGlobalExtendedHeader: 0x67, // 'g'
  GnuLongPath: 0x4c, // 'L'
  GnuLongLink: 0x4b, // 'K'
} as const

type GitMetadataState = {
  authors: Map<
    string,
    {
      name: string
      commitCount: number
      firstCommitDate: Date
      lastCommitDate: Date
    }
  >
  firstCommitDate?: Date
  lastCommitDate?: Date
  firstCommitHash?: string
  lastCommitHash?: string
}

type GitHubBlameRange = {
  startingLine?: number
  endingLine?: number
  commit?: { committedDate?: string }
}

const defaultOrigins = {
  github: {
    fetch: new Set([
      'https://api.github.com',
      'https://codeload.github.com',
      'https://raw.githubusercontent.com',
    ]),
    auth: new Set(['https://api.github.com', 'https://codeload.github.com']),
  },
  gitlab: {
    fetch: new Set(['https://gitlab.com']),
    auth: new Set(['https://gitlab.com']),
  },
  bitbucket: {
    fetch: new Set(['https://api.bitbucket.org', 'https://bitbucket.org']),
    auth: new Set(['https://api.bitbucket.org', 'https://bitbucket.org']),
  },
} as const

function buildOriginPolicy(
  host: GitHost,
  apiBaseUrl: string
): { fetch: Set<string>; auth: Set<string> } {
  const api = new URL(apiBaseUrl)
  const apiOrigin = `${api.protocol}//${api.host}`

  if (host === 'gitlab') {
    return {
      fetch: new Set([apiOrigin]),
      auth: new Set([apiOrigin]),
    }
  }
  return {
    fetch: new Set(defaultOrigins[host].fetch),
    auth: new Set(defaultOrigins[host].auth),
  }
}

const clamp = (ms: number, max = 60_000) => Math.min(Math.max(ms, 0), max)

const RATE_LIMIT_GUIDANCE =
  'Try providing a personal access token or retry later.'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getResetDelayMs(
  response: Response,
  host: GitHost
): number | undefined {
  const retryAfter = response.headers.get('Retry-After')

  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (!Number.isNaN(seconds)) {
      return seconds * 1_000 + 100
    }
    const date = Date.parse(retryAfter)
    if (!Number.isNaN(date)) {
      return Math.max(date - Date.now(), 0) + 100
    }
  }

  const now = Date.now()
  let reset: number | undefined

  switch (host) {
    case 'github':
      reset = Number(response.headers.get('X-RateLimit-Reset'))
      break
    case 'gitlab':
      reset = Number(response.headers.get('RateLimit-Reset'))
      break
    case 'bitbucket':
      reset = Number(response.headers.get('X-RateLimit-Reset'))
      break
  }

  if (reset) {
    return Math.max(reset * 1_000 - now, 0) + 100
  }
}

export class GitHostFileSystem
  extends InMemoryFileSystem
  implements AsyncFileSystem, WritableFileSystem
{
  #repository: string
  #ref: string
  #host: GitHost
  #token?: string
  #timeoutMs: number
  #apiBaseUrl: string
  #apiHeaders: Record<string, string>
  #noAuthHeaders: Record<string, string>
  #originPolicy: { fetch: Set<string>; auth: Set<string> }
  #ownerEncoded?: string
  #repoEncoded?: string
  #currentFetch?: AbortController
  #initId = 0
  #initialized = false
  #initPromise?: Promise<void>
  #userProvidedRef: boolean
  #maxArchiveBytes: number
  #maxTarStreamBytes: number
  #maxFileCount: number
  #maxFileBytes: number
  #symlinkMap: Map<string, string>
  #include?: string[]
  #exclude?: string[]
  #gitMetadataCache: Map<string, GitMetadata>
  #gitFileMetadataCache: Map<
    string,
    { firstCommitHash?: string; lastCommitHash?: string }
  >
  #gitBlameCache: Map<string, Promise<GitHubBlameRange[] | null>>
  #ghBlameBatchQueue?: {
    path: string
    startLine?: number
    endLine?: number
    resolve: (ranges: any[] | null) => void
    reject: (error: unknown) => void
  }[]
  #ghBlameBatchTimer?: any

  constructor(options: GitHostFileSystemOptions) {
    if (!options.host) {
      options.host = 'github'
    }

    if (
      (options.host === 'gitlab' &&
        !gitlabRepoPattern.test(options.repository)) ||
      ((options.host === 'github' || options.host === 'bitbucket') &&
        !repoPattern.test(options.repository))
    ) {
      throw new Error('[renoun] Repository must be in "owner/repo" format')
    }
    if (!['github', 'gitlab', 'bitbucket'].includes(options.host)) {
      throw new Error('[renoun] Unsupported git host')
    }

    super({})

    this.#repository = options.repository
    this.#userProvidedRef = options.ref !== undefined
    this.#ref = options.ref ?? 'main'
    this.#host = options.host
    this.#token = options.token

    if (this.#token && /[\r\n]/.test(this.#token)) {
      throw new Error('[renoun] Invalid token')
    }
    const requestedTimeout = options.timeoutMs ?? 30_000
    this.#timeoutMs = Math.min(Math.max(requestedTimeout, 0), 300_000)
    this.#maxArchiveBytes =
      options.limits?.maxArchiveBytes ?? MAX_ARCHIVE_SIZE_BYTES
    this.#maxTarStreamBytes =
      options.limits?.maxTarStreamBytes ?? MAX_TAR_STREAM_BYTES
    this.#maxFileCount = options.limits?.maxFileCount ?? MAX_FILE_COUNT
    this.#maxFileBytes = options.limits?.maxFileBytes ?? MAX_FILE_BYTES
    // Split and encode owner/repo for GitHub/Bitbucket
    if (this.#host === 'github' || this.#host === 'bitbucket') {
      const parts = options.repository.split('/')
      if (parts.length !== 2) {
        throw new Error('[renoun] Repository must be in "owner/repo" format')
      }
      const [owner, repo] = parts
      this.#ownerEncoded = encodeURIComponent(owner)
      this.#repoEncoded = encodeURIComponent(repo)
    }

    this.#apiBaseUrl = this.#resolveApiBaseUrl(options)
    this.#validateRef(this.#ref)
    this.#originPolicy = buildOriginPolicy(this.#host, this.#apiBaseUrl)

    this.#apiHeaders = Object.freeze(this.#getApiHeaders())
    this.#noAuthHeaders = Object.freeze(this.#getNoAuthHeaders())

    this.#include = options.include
    this.#exclude = options.exclude

    this.#symlinkMap = new Map()
    this.#gitMetadataCache = new Map()
    this.#gitFileMetadataCache = new Map()
    this.#gitBlameCache = new Map()
    this.#initPromise = this.#loadArchive().catch((error) => {
      this.#initPromise = undefined
      throw error
    })
  }

  async #extractTarFromStream(
    stream: ReadableStream<Uint8Array>
  ): Promise<void> {
    const files = this.getFiles()
    files.clear()
    this.#symlinkMap.clear()

    let totalBytes = 0
    let fileCount = 0
    const seen = new Set<string>()
    let rootPrefix: string | undefined
    let paxHeader: Record<string, string> | null = null
    let longPath: string | null = null
    let stripFirstSegment: boolean | undefined

    for await (const entry of this.#tarStreamEntries(stream)) {
      const { size, typeFlag, name, prefix, readData, discard } = entry
      totalBytes += size
      if (totalBytes > this.#maxArchiveBytes) {
        throw new Error(
          '[renoun] Repository archive exceeds allowed size during extraction. Increase the `maxArchiveBytes` limit in the `GitHostFileSystem` constructor or filter the repository using the `include` and `exclude` options to reduce the size of the extracted repository entries.'
        )
      }

      const resolvedPath =
        this.#sanitizeTarPath(paxHeader?.['path']) ??
        longPath ??
        this.#sanitizeTarPath(prefix ? `${prefix}/${name}` : name)

      let fullPath = resolvedPath ?? ''
      const paxLinkPath = paxHeader?.['linkpath'] || null
      paxHeader = null
      longPath = null
      if (!fullPath) {
        await discard()
        continue
      }

      fullPath = fullPath.replace(/\\+/g, '/').replace(/^\.\/+/, '')
      if (!rootPrefix) {
        rootPrefix = fullPath.split('/')[0]
      }
      if (rootPrefix && fullPath.startsWith(`${rootPrefix}/`)) {
        fullPath = fullPath.slice(rootPrefix.length + 1)
      }
      fullPath = fullPath.replace(/^\/+/, '')
      if (!fullPath || fullPath.endsWith('/')) {
        await discard()
        continue
      }

      const safeSegments: string[] = []
      let isUnsafe = false
      const parts = fullPath.split('/')
      for (let index = 0; index < parts.length; index++) {
        const segment = parts[index]!
        const trimmedSegment = segment.trim()
        if (!trimmedSegment || trimmedSegment === '.') continue
        if (trimmedSegment === '..') {
          isUnsafe = true
          break
        }
        if (index === 0 && /^[A-Za-z]:$/.test(trimmedSegment)) {
          isUnsafe = true
          break
        }
        if (
          segment.length > MAX_PATH_SEGMENT_LENGTH ||
          trimmedSegment.length > MAX_PATH_SEGMENT_LENGTH
        ) {
          isUnsafe = true
          break
        }
        safeSegments.push(trimmedSegment)
      }
      if (isUnsafe || safeSegments.length === 0) {
        await discard()
        continue
      }

      if (stripFirstSegment === undefined) {
        stripFirstSegment = safeSegments.length > 1
      }
      const effectiveSegments = stripFirstSegment
        ? safeSegments.slice(1)
        : safeSegments
      const relativePath = effectiveSegments.join('/')
      if (relativePath.length > MAX_RELATIVE_PATH_LENGTH) {
        await discard()
        continue
      }
      if (safeSegments.length > MAX_PATH_SEGMENTS) {
        await discard()
        continue
      }

      // Handle special types
      if (typeFlag === TAR_TYPE_FLAGS.PaxExtendedHeader) {
        const buf = await readData(this.#maxFileBytes)
        paxHeader = this.#parsePaxRecords(buf)
        continue
      }
      if (typeFlag === TAR_TYPE_FLAGS.PaxGlobalExtendedHeader) {
        await discard()
        continue
      }
      if (typeFlag === TAR_TYPE_FLAGS.GnuLongPath) {
        const buf = await readData(this.#maxFileBytes)
        longPath = this.#sanitizeTarPath(new TextDecoder('utf-8').decode(buf))
        continue
      }
      if (typeFlag === TAR_TYPE_FLAGS.GnuLongLink) {
        await discard()
        continue
      }

      const isDirectory = typeFlag === TAR_TYPE_FLAGS.Directory
      const isFile =
        typeFlag === TAR_TYPE_FLAGS.NormalFile ||
        typeFlag === TAR_TYPE_FLAGS.NormalFileSpace ||
        typeFlag === TAR_TYPE_FLAGS.NormalFileAlternative ||
        typeFlag === TAR_TYPE_FLAGS.NormalFileSeven
      const isSymLink =
        typeFlag === TAR_TYPE_FLAGS.SymLink ||
        typeFlag === TAR_TYPE_FLAGS.HardLink

      if (isSymLink) {
        const rawTarget = this.#sanitizeTarPath(paxLinkPath) || ''
        const target = normalizeSlashes(rawTarget).replace(/^\/+/, '')
        const directory = effectiveSegments.slice(0, -1).join('/') || '.'
        const resolvedTarget = normalizeSlashes(
          joinPaths(directory, target)
        ).replace(/^\/+/, '')
        const key = normalizePath(relativePath)
        const value = normalizePath(resolvedTarget)
        this.#symlinkMap.set(key, value)

        await discard()
        continue
      }

      if (!isFile || isDirectory) {
        await discard()
        continue
      }

      // discard any unhandled entry types
      if (
        typeFlag !== TAR_TYPE_FLAGS.NormalFile &&
        typeFlag !== TAR_TYPE_FLAGS.NormalFileSpace &&
        typeFlag !== TAR_TYPE_FLAGS.NormalFileAlternative &&
        typeFlag !== TAR_TYPE_FLAGS.NormalFileSeven
      ) {
        await discard()
        continue
      }

      fileCount++
      if (fileCount > this.#maxFileCount) {
        throw new Error('[renoun] Repository contains too many files')
      }
      if (seen.has(relativePath.toLowerCase())) {
        throw new Error('[renoun] Duplicate path in archive')
      }

      // Hard cap: skip overlarge files entirely
      if (size > this.#maxFileBytes) {
        await discard()
        continue
      }

      let received = 0
      const chunks: Uint8Array[] = []
      while (true) {
        const chunk = await readData(
          Math.min(64 * 1024, this.#maxFileBytes - received)
        )
        if (chunk.length === 0) break
        received += chunk.length
        if (received > this.#maxFileBytes) {
          await discard()
          chunks.length = 0
          received = 0
          break
        }
        chunks.push(chunk)
        if (received >= size) break
      }
      if (received === 0 && chunks.length === 0) {
        continue
      }

      let buf: Uint8Array
      if (chunks.length === 1) {
        buf = chunks[0]!
      } else {
        const total = chunks.reduce(
          (totalLength, chunk) => totalLength + chunk.length,
          0
        )
        buf = new Uint8Array(total)
        let offset = 0
        for (const chunk of chunks) {
          buf.set(chunk, offset)
          offset += chunk.length
        }
      }

      const content: InMemoryFileContent = this.#isBinaryBuffer(buf)
        ? { kind: 'Binary', content: buf, encoding: 'binary' }
        : new TextDecoder('utf-8').decode(buf)

      this.createFile(relativePath, content)
      seen.add(relativePath.toLowerCase())
    }
  }

  clearCache() {
    if (this.#currentFetch) {
      this.#currentFetch.abort()
      this.#currentFetch = undefined
    }
    this.#initId++
    const files = this.getFiles()
    files.clear()
    this.#gitMetadataCache.clear()
    this.#initialized = false
    this.#initPromise = undefined
  }

  #resolveApiBaseUrl(options: GitHostFileSystemOptions) {
    if (this.#host === 'gitlab') {
      if (options.baseUrl) {
        const urlObject = new URL(options.baseUrl)
        if (urlObject.protocol !== 'https:') {
          throw new Error('[renoun] HTTPS required')
        }
        return `${urlObject.origin}/api/v4`
      }
      return 'https://gitlab.com/api/v4'
    }
    if (this.#host === 'github') {
      return 'https://api.github.com'
    }
    return 'https://api.bitbucket.org/2.0'
  }

  #getApiHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}
    headers['User-Agent'] = 'renoun'
    if (this.#host === 'github') {
      headers['Accept'] = 'application/vnd.github.v3+json'
      headers['X-GitHub-Api-Version'] = '2022-11-28'
    }
    if (this.#token) {
      switch (this.#host) {
        case 'github':
          headers['Authorization'] = `Bearer ${this.#token}`
          break
        case 'gitlab':
          headers['PRIVATE-TOKEN'] = this.#token
          break
        case 'bitbucket':
          headers['Authorization'] = `Bearer ${this.#token}`
          break
      }
    }
    return headers
  }

  #getNoAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}
    headers['User-Agent'] = 'renoun'
    return headers
  }

  async getGitFileMetadata(path: string): Promise<GitMetadata> {
    await this.#ensureInitialized()

    const normalizedPath = this.#normalizeGitMetadataPath(path)
    const cacheKey = `${this.#ref}::${normalizedPath}`

    if (this.#gitMetadataCache.has(cacheKey)) {
      return this.#gitMetadataCache.get(cacheKey)!
    }

    let metadata: GitMetadata
    let commitHashes: { firstCommitHash?: string; lastCommitHash?: string } = {}
    try {
      const result =
        await this.#fetchGitMetadataForHostWithHashes(normalizedPath)
      metadata = result.metadata
      commitHashes = {
        firstCommitHash: result.firstCommitHash,
        lastCommitHash: result.lastCommitHash,
      }
    } catch {
      metadata = this.#createEmptyGitMetadata()
    }

    this.#gitMetadataCache.set(cacheKey, metadata)
    this.#gitFileMetadataCache.set(cacheKey, commitHashes)
    return metadata
  }

  async getGitExportMetadata(
    path: string,
    startLine: number,
    endLine: number
  ): Promise<GitExportMetadata> {
    await this.#ensureInitialized()

    const normalizedStart = Math.max(1, Math.min(startLine, endLine))
    const normalizedEnd = Math.max(
      normalizedStart,
      Math.max(startLine, endLine)
    )
    const normalizedPath = this.#normalizeGitMetadataPath(path)

    // Fast path: if the file was introduced and last touched in the same
    // commit, every export in the file shares that creation date and we can
    // avoid any more granular blame lookups.
    const fileMetadata = await this.getGitFileMetadata(path)
    const fileFirstCommit = fileMetadata.firstCommitDate
    const fileLastCommit = fileMetadata.lastCommitDate

    if (
      fileFirstCommit &&
      fileLastCommit &&
      fileFirstCommit.getTime() === fileLastCommit.getTime()
    ) {
      return {
        firstCommitDate: fileFirstCommit,
        lastCommitDate: fileLastCommit,
      }
    }

    if (this.#host === 'github' && this.#token) {
      const ranges = await this.#getGitHubBlameRanges(
        normalizedPath,
        normalizedStart,
        normalizedEnd
      )
      if (ranges && ranges.length > 0) {
        return this.#summarizeGitHubBlameRanges(
          ranges,
          normalizedStart,
          normalizedEnd
        )
      }
    }

    return {
      firstCommitDate: fileFirstCommit,
      lastCommitDate: fileLastCommit,
    }
  }

  /** Get metadata for a file or module. */
  async getMetadata<const Path extends string>(
    /** The path to the file or module. */
    filePath: Path
  ): Promise<MetadataForPath<Path>> {
    await this.#ensureInitialized()

    const path = this.#normalizeGitMetadataPath(filePath)
    const result = hasJavaScriptLikeExtension(path)
      ? await this.getModuleMetadata(path)
      : await this.getFileMetadata(path)

    return result as MetadataForPath<Path>
  }

  /** Get metadata for a file. */
  async getFileMetadata(filePath: string): Promise<GitFileMetadata> {
    await this.#ensureInitialized()

    const normalizedPath = this.#normalizeGitMetadataPath(filePath)
    const gitMetadata = await this.getGitFileMetadata(normalizedPath)
    const cacheKey = `${this.#ref}::${normalizedPath}`
    const commitHashes = this.#gitFileMetadataCache.get(cacheKey)

    // Convert authors from GitMetadata format to GitAuthor format
    // GitMetadata.authors has: { name, commitCount, firstCommitDate, lastCommitDate }
    // GitAuthor needs: { name, email, commitCount, firstCommitDate?, lastCommitDate? }
    const authors: GitAuthor[] = gitMetadata.authors.map((author) => ({
      name: author.name,
      email: '', // Not available from the host API author data
      commitCount: author.commitCount,
      firstCommitDate: author.firstCommitDate,
      lastCommitDate: author.lastCommitDate,
    }))

    return {
      kind: 'file',
      path: normalizedPath,
      ref: this.#ref,
      refCommit: this.#ref, // For remote hosts, we use ref as refCommit
      firstCommitDate: gitMetadata.firstCommitDate?.toISOString(),
      lastCommitDate: gitMetadata.lastCommitDate?.toISOString(),
      firstCommitHash: commitHashes?.firstCommitHash,
      lastCommitHash: commitHashes?.lastCommitHash,
      authors,
    }
  }

  /** Get metadata for a JavaScript module file (exports at current ref only). */
  async getModuleMetadata(filePath: string): Promise<GitModuleMetadata> {
    await this.#ensureInitialized()

    const base = await this.getFileMetadata(filePath)
    if (!hasJavaScriptLikeExtension(base.path)) {
      return { ...base, kind: 'module', exports: {} }
    }

    // Read the file content to parse exports
    let content: string
    try {
      content = await this.readFile(base.path)
    } catch {
      return { ...base, kind: 'module', exports: {} }
    }

    // Parse exports from the file
    const rawExports = scanModuleExports(base.path, content)

    // Filter out internal export markers and collect exports with line numbers
    const exportItems: Array<{
      name: string
      startLine?: number
      endLine?: number
    }> = []
    for (const [name, item] of rawExports) {
      if (
        name.startsWith('__STAR__') ||
        name.startsWith('__FROM__') ||
        name.startsWith('__NAMESPACE__')
      ) {
        continue
      }
      exportItems.push({
        name,
        startLine: item.startLine,
        endLine: item.endLine,
      })
    }

    // Batch fetch export metadata using blame API
    // For GitHub with a token, we use the batched GraphQL blame API
    const exports: Record<
      string,
      { firstCommitDate?: Date; lastCommitDate?: Date }
    > = {}

    // Group exports that have line numbers for batch processing
    const exportsWithLines = exportItems.filter(
      (e) => e.startLine !== undefined && e.endLine !== undefined
    )
    const exportsWithoutLines = exportItems.filter(
      (e) => e.startLine === undefined || e.endLine === undefined
    )

    // Process exports with line numbers in parallel (batched blame)
    if (exportsWithLines.length > 0) {
      const blameResults = await Promise.all(
        exportsWithLines.map(async (exportItem) => {
          const metadata = await this.getGitExportMetadata(
            base.path,
            exportItem.startLine!,
            exportItem.endLine!
          )
          return { name: exportItem.name, metadata }
        })
      )

      for (const { name, metadata } of blameResults) {
        exports[name] = metadata
      }
    }

    // For exports without line numbers, use file-level metadata
    const fileFirstCommitDate = base.firstCommitDate
      ? new Date(base.firstCommitDate)
      : undefined
    const fileLastCommitDate = base.lastCommitDate
      ? new Date(base.lastCommitDate)
      : undefined

    for (const exportItem of exportsWithoutLines) {
      exports[exportItem.name] = {
        firstCommitDate: fileFirstCommitDate,
        lastCommitDate: fileLastCommitDate,
      }
    }

    return { ...base, kind: 'module', exports }
  }

  #createEmptyGitMetadata(): GitMetadata {
    return {
      authors: [],
      firstCommitDate: undefined,
      lastCommitDate: undefined,
    }
  }

  #normalizeGitMetadataPath(path: string): string {
    const relative = normalizeSlashes(this.getRelativePathToWorkspace(path))
    if (!relative || relative === '.' || relative === './') {
      return ''
    }
    // Trim leading "./" segments
    let normalized = relative
    while (normalized.startsWith('./')) {
      normalized = normalized.slice(2)
    }
    // Trim leading slashes
    let start = 0
    while (start < normalized.length && normalized.charCodeAt(start) === 47) {
      start++
    }
    if (start > 0) {
      normalized = normalized.slice(start)
    }
    // Trim trailing slashes
    let end = normalized.length
    while (end > 0 && normalized.charCodeAt(end - 1) === 47) {
      end--
    }
    if (end < normalized.length) {
      normalized = normalized.slice(0, end)
    }
    return normalized
  }

  #createGitMetadataState(): GitMetadataState {
    return {
      authors: new Map(),
      firstCommitDate: undefined,
      lastCommitDate: undefined,
      firstCommitHash: undefined,
      lastCommitHash: undefined,
    }
  }

  async #getGitHubBlameRanges(
    path: string,
    startLine?: number,
    endLine?: number
  ): Promise<GitHubBlameRange[] | null> {
    if (!this.#token || !this.#ownerEncoded || !this.#repoEncoded) {
      return null
    }

    let normalizedStart =
      Number.isFinite(startLine) && typeof startLine === 'number'
        ? Math.max(1, Math.min(Math.floor(startLine), MAX_GITHUB_BLAME_LINE))
        : undefined
    let normalizedEnd =
      Number.isFinite(endLine) && typeof endLine === 'number'
        ? Math.max(1, Math.min(Math.floor(endLine), MAX_GITHUB_BLAME_LINE))
        : undefined

    if (
      normalizedStart !== undefined &&
      normalizedEnd !== undefined &&
      normalizedEnd < normalizedStart
    ) {
      ;[normalizedStart, normalizedEnd] = [normalizedEnd, normalizedStart]
    }

    startLine = normalizedStart

    const cacheKey = `${this.#ref}::${path}::${startLine ?? ''}-${
      normalizedEnd ?? ''
    }`

    const rangePrefix = `${this.#ref}::${path}::`
    for (const [key, promise] of this.#gitBlameCache) {
      if (!key.startsWith(rangePrefix)) continue
      const [, , range] = key.split('::')
      const [cachedStartStr, cachedEndStr] = range.split('-')
      const cachedStart = cachedStartStr ? Number(cachedStartStr) : undefined
      const cachedEnd = cachedEndStr ? Number(cachedEndStr) : undefined

      const coversRequestedStart =
        startLine === undefined
          ? cachedStart === undefined
          : cachedStart === undefined || cachedStart <= startLine
      const coversRequestedEnd =
        normalizedEnd === undefined
          ? cachedEnd === undefined
          : cachedEnd === undefined || cachedEnd >= normalizedEnd

      if (coversRequestedStart && coversRequestedEnd) {
        this.#gitBlameCache.set(cacheKey, promise)
        const cached = await promise
        return cached ?? null
      }
    }

    if (!this.#gitBlameCache.has(cacheKey)) {
      this.#gitBlameCache.set(
        cacheKey,
        this.#enqueueGitHubBlameRequest(path, startLine, normalizedEnd).catch(
          () => null
        )
      )
    }

    const cached = this.#gitBlameCache.get(cacheKey)
    if (!cached) {
      return null
    }
    return (await cached) ?? null
  }

  #summarizeGitHubBlameRanges(
    ranges: GitHubBlameRange[],
    normalizedStart: number,
    normalizedEnd: number
  ): GitExportMetadata {
    let firstCommitDate: Date | undefined
    let lastCommitDate: Date | undefined

    for (const range of ranges) {
      const rangeStart = Number(range?.startingLine)
      const rangeEnd = Number(range?.endingLine)

      if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) {
        continue
      }

      if (rangeEnd < normalizedStart) {
        continue
      }

      if (rangeStart > normalizedEnd) {
        break
      }

      const dateString = range?.commit?.committedDate
      if (typeof dateString !== 'string') {
        continue
      }

      const date = new Date(dateString)
      if (Number.isNaN(date.getTime())) {
        continue
      }

      if (firstCommitDate === undefined || date < firstCommitDate) {
        firstCommitDate = date
      }
      if (lastCommitDate === undefined || date > lastCommitDate) {
        lastCommitDate = date
      }
    }

    return { firstCommitDate, lastCommitDate }
  }

  #updateGitMetadataState(
    state: GitMetadataState,
    name: string | undefined,
    email: string | undefined,
    date: Date,
    commitHash?: string
  ) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return
    }

    const normalizedEmail =
      typeof email === 'string' && email.trim()
        ? email.trim().toLowerCase()
        : undefined
    const normalizedName =
      typeof name === 'string' && name.trim()
        ? name.trim()
        : normalizedEmail
          ? normalizedEmail
          : 'Unknown'

    const key = normalizedEmail ?? normalizedName.toLowerCase() ?? 'unknown'
    const author = state.authors.get(key)

    if (!author) {
      state.authors.set(key, {
        name: normalizedName,
        commitCount: 1,
        firstCommitDate: date,
        lastCommitDate: date,
      })
    } else {
      author.commitCount += 1
      if (date < author.firstCommitDate) {
        author.firstCommitDate = date
      }
      if (date > author.lastCommitDate) {
        author.lastCommitDate = date
      }
      if (!author.name && normalizedName) {
        author.name = normalizedName
      }
    }

    if (!state.firstCommitDate || date < state.firstCommitDate) {
      state.firstCommitDate = date
      if (commitHash) {
        state.firstCommitHash = commitHash
      }
    }
    if (!state.lastCommitDate || date > state.lastCommitDate) {
      state.lastCommitDate = date
      if (commitHash) {
        state.lastCommitHash = commitHash
      }
    }
  }

  #finalizeGitMetadataState(state: GitMetadataState): GitMetadata {
    const authors = Array.from(state.authors.values()).sort(
      (a, b) =>
        b.commitCount - a.commitCount ||
        b.lastCommitDate.getTime() - a.lastCommitDate.getTime()
    )

    return {
      authors,
      firstCommitDate: state.firstCommitDate,
      lastCommitDate: state.lastCommitDate,
    }
  }

  async #fetchGitMetadataForHostWithHashes(path: string): Promise<{
    metadata: GitMetadata
    firstCommitHash?: string
    lastCommitHash?: string
  }> {
    const state = this.#createGitMetadataState()

    switch (this.#host) {
      case 'github':
        await this.#collectGitHubGitMetadata(path, state)
        break
      case 'gitlab':
        await this.#collectGitLabGitMetadata(path, state)
        break
      case 'bitbucket':
        await this.#collectBitbucketGitMetadata(path, state)
        break
      default:
        return {
          metadata: this.#createEmptyGitMetadata(),
          firstCommitHash: undefined,
          lastCommitHash: undefined,
        }
    }

    if (state.authors.size === 0 && state.firstCommitDate === undefined) {
      return {
        metadata: this.#createEmptyGitMetadata(),
        firstCommitHash: undefined,
        lastCommitHash: undefined,
      }
    }

    return {
      metadata: this.#finalizeGitMetadataState(state),
      firstCommitHash: state.firstCommitHash,
      lastCommitHash: state.lastCommitHash,
    }
  }

  async #collectGitHubGitMetadata(
    path: string,
    state: GitMetadataState
  ): Promise<void> {
    // Try a cheap, single-request GraphQL blame if we have a token.
    // Falls back to REST sampling if GraphQL is unavailable or fails.
    const blameOk = await this.#collectGitHubBlameGitMetadata(
      path,
      state
    ).catch(() => false)
    if (blameOk) {
      return
    }

    if (!this.#ownerEncoded || !this.#repoEncoded) {
      return
    }

    // REST sampling strategy: fetch the first page, then (if available) the last page.
    // This yields recent authors and the earliest known date with just 1-2 requests.
    const base = `${this.#apiBaseUrl}/repos/${this.#ownerEncoded}/${this.#repoEncoded}/commits?sha=${encodeURIComponent(this.#ref)}&per_page=100`
    const url = path ? `${base}&path=${encodeURIComponent(path)}` : base

    const firstResponse = await this.#fetchWithRetry(url)
    if (!firstResponse.ok) {
      return
    }
    await this.#accumulateGitHubCommitsIntoState(firstResponse, state)

    const linkHeader = firstResponse.headers.get('link')
    const lastLink = this.#getLastLink(linkHeader, firstResponse.url)
    if (!lastLink || lastLink === firstResponse.url) {
      return
    }
    const lastResp = await this.#fetchWithRetry(lastLink)
    if (!lastResp.ok) {
      return
    }
    await this.#accumulateGitHubCommitsIntoState(lastResp, state)
  }

  async #collectGitHubBlameGitMetadata(
    path: string,
    state: GitMetadataState
  ): Promise<boolean> {
    if (!this.#token || !this.#ownerEncoded || !this.#repoEncoded) {
      return false
    }
    const ranges = await this.#enqueueGitHubBlameRequest(path).catch(() => null)
    if (!Array.isArray(ranges) || ranges.length === 0) {
      return false
    }
    const seenCommitOids = new Set<string>()
    for (const range of ranges) {
      const commit = range?.commit
      if (!commit) {
        continue
      }
      const oid = typeof commit?.oid === 'string' ? commit.oid : undefined
      const dateString =
        typeof commit?.committedDate === 'string'
          ? commit.committedDate
          : undefined
      if (!dateString) {
        continue
      }
      const date = new Date(dateString)
      if (Number.isNaN(date.getTime())) {
        continue
      }
      const author = commit?.author
      const email = typeof author?.email === 'string' ? author.email : undefined
      const name =
        (typeof author?.name === 'string' ? author.name : undefined) ??
        (typeof author?.user?.login === 'string'
          ? author.user.login
          : undefined)
      // Only count each commit once to approximate commit counts.
      if (oid && seenCommitOids.has(oid)) {
        // Update last/first dates even if we do not increment count again.
        this.#updateGitMetadataState(state, name, email, date, oid)
        continue
      }
      if (oid) {
        seenCommitOids.add(oid)
      }
      this.#updateGitMetadataState(state, name, email, date, oid)
    }
    return state.authors.size > 0
  }

  async #accumulateGitHubCommitsIntoState(
    response: Response,
    state: GitMetadataState
  ) {
    const commits = await response.json().catch(() => undefined)
    if (!Array.isArray(commits) || commits.length === 0) {
      return
    }
    for (const commit of commits) {
      const commitData = commit?.commit
      const authorInfo = commitData?.author ?? commitData?.committer
      const dateString = authorInfo?.date
      if (typeof dateString !== 'string') {
        continue
      }
      const date = new Date(dateString)
      if (Number.isNaN(date.getTime())) {
        continue
      }

      // Extract commit SHA from REST API response
      const commitSha = typeof commit?.sha === 'string' ? commit.sha : undefined

      const emailCandidate =
        (typeof commitData?.author?.email === 'string'
          ? commitData.author.email
          : undefined) ??
        (typeof commit?.author?.email === 'string'
          ? commit.author.email
          : undefined) ??
        (typeof commitData?.committer?.email === 'string'
          ? commitData.committer.email
          : undefined)

      const nameCandidate =
        (typeof commitData?.author?.name === 'string'
          ? commitData.author.name
          : undefined) ??
        (typeof commit?.author?.login === 'string'
          ? commit.author.login
          : undefined) ??
        (typeof commitData?.committer?.name === 'string'
          ? commitData.committer.name
          : undefined)

      this.#updateGitMetadataState(
        state,
        nameCandidate,
        emailCandidate,
        date,
        commitSha
      )
    }
  }

  async #enqueueGitHubBlameRequest(
    path: string,
    startLine?: number,
    endLine?: number
  ): Promise<any[] | null> {
    if (!this.#ghBlameBatchQueue) {
      this.#ghBlameBatchQueue = []
    }
    return await new Promise<any[] | null>((resolve, reject) => {
      this.#ghBlameBatchQueue!.push({
        path,
        startLine,
        endLine,
        resolve,
        reject,
      })
      if (!this.#ghBlameBatchTimer) {
        this.#ghBlameBatchTimer = setTimeout(() => {
          this.#ghBlameBatchTimer = undefined
          this.#flushGitHubBlameBatch().catch((error) => {
            // Reject all pending in case of a top-level failure
            const pending = this.#ghBlameBatchQueue ?? []
            this.#ghBlameBatchQueue = []
            for (const item of pending) {
              item.reject(error)
            }
          })
        }, GITHUB_BLAME_BATCH_DELAY_MS)
      }
      if (this.#ghBlameBatchQueue!.length >= MAX_GITHUB_BLAME_BATCH) {
        clearTimeout(this.#ghBlameBatchTimer)
        this.#ghBlameBatchTimer = undefined
        // Flush immediately
        this.#flushGitHubBlameBatch().catch((error) => {
          const pending = this.#ghBlameBatchQueue ?? []
          this.#ghBlameBatchQueue = []
          for (const item of pending) {
            item.reject(error)
          }
        })
      }
    })
  }

  async #flushGitHubBlameBatch(): Promise<void> {
    const queue = this.#ghBlameBatchQueue ?? []
    if (queue.length === 0) {
      return
    }
    // Take up to batch size
    const batch = queue.splice(0, MAX_GITHUB_BLAME_BATCH)
    // If more remain, schedule another flush
    if (queue.length > 0 && !this.#ghBlameBatchTimer) {
      this.#ghBlameBatchTimer = setTimeout(() => {
        this.#ghBlameBatchTimer = undefined
        this.#flushGitHubBlameBatch().catch((error) => {
          const pending = this.#ghBlameBatchQueue ?? []
          this.#ghBlameBatchQueue = []
          for (const item of pending) {
            item.reject(error)
          }
        })
      }, GITHUB_BLAME_BATCH_DELAY_MS)
    }

    // Construct GraphQL query with aliases and variables
    const owner = decodeURIComponent(this.#ownerEncoded!)
    const name = decodeURIComponent(this.#repoEncoded!)
    const varDefinitions: string[] = [`$owner: String!`, `$name: String!`]
    const fields: string[] = []
    const variables: Record<string, any> = { owner, name }
    batch.forEach((item, index) => {
      const varName = `expr${index}`
      varDefinitions.push(`$${varName}: String!`)
      variables[varName] = `${this.#ref}:${item.path}`
      const alias = `f${index}`

      const blameArgDefs: string[] = []
      const blameArgValues: string[] = []
      if (typeof item.startLine === 'number') {
        const startName = `start${index}`
        blameArgDefs.push(`$${startName}: Int!`)
        blameArgValues.push(`startLine: $${startName}`)
        variables[startName] = item.startLine
      }
      if (typeof item.endLine === 'number') {
        const endName = `end${index}`
        blameArgDefs.push(`$${endName}: Int!`)
        blameArgValues.push(`endLine: $${endName}`)
        variables[endName] = item.endLine
      }
      varDefinitions.push(...blameArgDefs)

      const blameArgs = blameArgValues.length
        ? `(${blameArgValues.join(', ')})`
        : ''

      fields.push(
        `${alias}: object(expression: $${varName}) { ... on Blob { blame${blameArgs} { ranges { commit { oid committedDate author { name email user { login } } } } } } }`
      )
    })
    const query = `
      query FileBlameBatch(${varDefinitions.join(', ')}) {
        repository(owner: $owner, name: $name) {
          ${fields.join('\n')}
        }
      }`

    const graphqlUrl = 'https://api.github.com/graphql'
    this.#assertAllowed(graphqlUrl)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs)
    try {
      const response = await fetch(graphqlUrl, {
        method: 'POST',
        headers: {
          ...this.#apiHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
        referrerPolicy: 'no-referrer',
      })
      if (!response.ok) {
        for (const item of batch) {
          item.resolve(null)
        }
        return
      }
      const payload = await response.json().catch(() => undefined as any)
      const repo = payload?.data?.repository
      batch.forEach((item, index) => {
        const alias = `f${index}`
        const ranges = repo?.[alias]?.blame?.ranges ?? null
        if (Array.isArray(ranges)) {
          item.resolve(ranges)
        } else {
          item.resolve(null)
        }
      })
    } catch (error) {
      for (const item of batch) {
        item.resolve(null)
      }
    } finally {
      clearTimeout(timer)
    }
  }

  async #collectGitLabGitMetadata(
    path: string,
    state: GitMetadataState
  ): Promise<void> {
    const project = encodeURIComponent(this.#repository)
    let page = 1
    const visitedPages = new Set<number>()

    while (!visitedPages.has(page)) {
      visitedPages.add(page)
      let url = `${this.#apiBaseUrl}/projects/${project}/repository/commits?ref_name=${encodeURIComponent(this.#ref)}&per_page=100&page=${page}`
      if (path) {
        url += `&path=${encodeURIComponent(path)}`
      }

      const response = await this.#fetchWithRetry(url)
      if (!response.ok) {
        return
      }

      const commits = await response.json().catch(() => undefined)
      if (!Array.isArray(commits) || commits.length === 0) {
        return
      }

      for (const commit of commits) {
        const dateString =
          (typeof commit?.committed_date === 'string'
            ? commit.committed_date
            : undefined) ??
          (typeof commit?.created_at === 'string'
            ? commit.created_at
            : undefined)
        if (!dateString) {
          continue
        }
        const date = new Date(dateString)
        if (Number.isNaN(date.getTime())) {
          continue
        }

        // Extract commit SHA from GitLab response
        const commitSha = typeof commit?.id === 'string' ? commit.id : undefined

        const email =
          typeof commit?.author_email === 'string'
            ? commit.author_email
            : undefined
        const name =
          (typeof commit?.author_name === 'string'
            ? commit.author_name
            : undefined) ?? email

        this.#updateGitMetadataState(state, name, email, date, commitSha)
      }

      const nextPage = response.headers.get('x-next-page')
      if (!nextPage) {
        return
      }
      const next = Number(nextPage)
      if (!Number.isFinite(next) || next <= page) {
        return
      }
      page = next
    }
  }

  async #collectBitbucketGitMetadata(
    path: string,
    state: GitMetadataState
  ): Promise<void> {
    if (!this.#ownerEncoded || !this.#repoEncoded) {
      return
    }

    let url = `${this.#apiBaseUrl}/repositories/${this.#ownerEncoded}/${this.#repoEncoded}/commits/${encodeURIComponent(this.#ref)}?pagelen=100`
    if (path) {
      url += `&path=${encodeURIComponent(path)}`
    }

    const visited = new Set<string>()

    while (url && !visited.has(url)) {
      visited.add(url)
      const response = await this.#fetchWithRetry(url)
      if (!response.ok) {
        return
      }

      const data = await response.json().catch(() => undefined)
      const commits = Array.isArray(data?.values) ? data.values : undefined
      if (!commits || commits.length === 0) {
        return
      }

      for (const commit of commits) {
        const dateString =
          typeof commit?.date === 'string' ? commit.date : undefined
        if (!dateString) {
          continue
        }
        const date = new Date(dateString)
        if (Number.isNaN(date.getTime())) {
          continue
        }

        // Extract commit hash from Bitbucket response
        const commitHash =
          typeof commit?.hash === 'string' ? commit.hash : undefined

        const { name, email } = this.#parseBitbucketAuthor(commit?.author)
        this.#updateGitMetadataState(state, name, email, date, commitHash)
      }

      url = typeof data?.next === 'string' && data.next ? data.next : ''
    }
  }

  #parseBitbucketAuthor(author: any): {
    name?: string
    email?: string
  } {
    if (!author || typeof author !== 'object') {
      return {}
    }

    let name: string | undefined
    let email: string | undefined

    const user = author.user
    if (user && typeof user === 'object') {
      const displayName =
        typeof user.display_name === 'string' ? user.display_name.trim() : ''
      const nickname =
        typeof user.nickname === 'string' ? user.nickname.trim() : ''
      name = displayName || nickname || undefined
    }

    if (typeof author.raw === 'string') {
      const raw = author.raw.trim()
      const match = raw.match(/<([^>]+)>/)
      if (match && match[1]) {
        email = match[1].trim()
      }
      if (!name) {
        let previous = ''
        let text = raw
        while (text !== previous) {
          previous = text
          text = text.replace(/<[^>]*>/g, '')
        }
        const withoutEmail = text.trim()
        if (withoutEmail) {
          name = withoutEmail
        }
      }
    }

    return { name, email }
  }

  #getLastLink(header: string | null, responseUrl: string): string | undefined {
    if (!header) {
      return undefined
    }
    const parts = header.split(',')
    for (const part of parts) {
      const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/)
      if (match && match[2] === 'last') {
        const target = match[1]
        try {
          return new URL(target, responseUrl).toString()
        } catch {
          return undefined
        }
      }
    }
    return undefined
  }

  #assertAllowed(urlStr: string) {
    const urlObject = new URL(urlStr)
    if (urlObject.protocol !== 'https:') {
      throw new Error('[renoun] HTTPS required')
    }
    const origin = `${urlObject.protocol}//${urlObject.host}`
    if (!this.#originPolicy.fetch.has(origin)) {
      throw new Error('[renoun] Redirected to disallowed origin')
    }
  }

  #isIgnorableNetworkAbortError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false
    }

    const name = (error as { name?: string }).name
    const code = (error as { code?: string }).code

    // Standard AbortError (browser + Node fetch)
    if (name === 'AbortError') {
      return true
    }

    // Older DOMException cases
    if (
      typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError'
    ) {
      return true
    }

    // Node.js / undici / node-fetch abort codes
    if (code === 'ABORT_ERR') {
      return true
    }

    // Some environments may surface TypeError on aborted fetch
    if (error instanceof TypeError && /abort/i.test(error.message)) {
      return true
    }

    return false
  }

  #isRateLimited(response: Response): boolean {
    if (response.status === 429) {
      return true
    }

    if (response.status !== 403) {
      return false
    }

    switch (this.#host) {
      case 'github':
      case 'bitbucket':
        return response.headers.get('X-RateLimit-Remaining') === '0'
      case 'gitlab':
        return response.headers.get('RateLimit-Remaining') === '0'
      default:
        return false
    }
  }

  /** Fetch with retry and rate-limit handling. */
  async #fetchWithRetry(url: string, maxAttempts = 3): Promise<Response> {
    type FetchFailure =
      | { type: 'rateLimit'; status: number; retryAfterMs?: number }
      | { type: 'response'; status: number; url: string }
      | { type: 'error'; error: unknown }

    let lastFailure: FetchFailure | undefined
    let notifiedFirstRetryFailure = false
    let notifiedRateLimit = false

    for (let attempt = 0; attempt < Math.max(1, maxAttempts); attempt++) {
      let skipBackoff = false
      const controller = new AbortController()
      this.#currentFetch = controller
      const timer = setTimeout(() => controller.abort(), this.#timeoutMs)

      try {
        this.#assertAllowed(url)
        let currentUrl = url
        let redirects = 0
        while (true) {
          const origin = new URL(currentUrl).origin
          const useAuth = this.#originPolicy.auth.has(origin)
          const response = await fetch(currentUrl, {
            headers: useAuth ? this.#apiHeaders : this.#noAuthHeaders,
            signal: controller.signal,
            referrerPolicy: 'no-referrer',
            redirect: 'manual',
          })

          if (!response) {
            throw new Error('[renoun] Too many redirects')
          }

          if (response.status >= 300 && response.status < 400) {
            const loc = response.headers.get('Location')
            if (!loc) {
              throw new Error('[renoun] Missing redirect location')
            }
            const nextUrl = new URL(loc, currentUrl).toString()
            this.#assertAllowed(nextUrl)
            currentUrl = nextUrl
            redirects++
            if (redirects > 2) {
              throw new Error('[renoun] Too many redirects')
            }
            continue
          }

          // If we already followed too many redirects and still didn't land, fail
          if (redirects >= 2) {
            throw new Error('[renoun] Too many redirects')
          }

          if (this.#isRateLimited(response)) {
            let rawMs: number | undefined
            const retryAfterHeader = response.headers.get('Retry-After')
            if (retryAfterHeader) {
              const seconds = Number(retryAfterHeader)
              if (!Number.isNaN(seconds)) {
                rawMs = seconds * 1_000
              } else {
                const date = Date.parse(retryAfterHeader)
                if (!Number.isNaN(date)) {
                  rawMs = Math.max(date - Date.now(), 0)
                }
              }
            }
            if (rawMs === undefined) {
              const resetMs = getResetDelayMs(response, this.#host)
              if (resetMs !== undefined) {
                rawMs = resetMs
              }
            }
            const retryAfter = rawMs !== undefined ? clamp(rawMs) : undefined

            if (retryAfter !== undefined) {
              lastFailure = {
                type: 'rateLimit',
                status: response.status,
                retryAfterMs: retryAfter,
              }
              if (!notifiedRateLimit) {
                const hostName = this.#formatHostName()
                const waitSeconds = Math.ceil(retryAfter / 1_000)
                const waitMessage = waitSeconds
                  ? ` Waiting about ${waitSeconds} seconds before trying again.`
                  : ''
                console.warn(
                  `[renoun] ${hostName} is rate limiting this request.${waitMessage} ${RATE_LIMIT_GUIDANCE}`
                )
                notifiedRateLimit = true
              }
              await sleep(retryAfter)
              // Honor server-advised delay exactly; skip client-side backoff
              skipBackoff = true
              break
            }
          }

          if (response.status >= 500 && response.status !== 501) {
            lastFailure = {
              type: 'response',
              status: response.status,
              url: response.url,
            }
            if (attempt === maxAttempts - 1) {
              return response
            }
          } else {
            return response
          }
          break
        }
      } catch (error) {
        // Non-retriable redirect/auth errors should surface immediately
        if (
          error instanceof Error &&
          (error.message.includes('Too many redirects') ||
            error.message.includes('Missing redirect location') ||
            error.message.includes('Redirected to disallowed origin'))
        ) {
          throw error
        }
        lastFailure = { type: 'error', error }
        if (attempt === maxAttempts - 1) {
          throw error
        }
      } finally {
        clearTimeout(timer)
        if (this.#currentFetch === controller) {
          this.#currentFetch = undefined
        }
      }

      if (
        attempt === 1 &&
        !notifiedFirstRetryFailure &&
        lastFailure &&
        !(lastFailure.type === 'rateLimit' && notifiedRateLimit)
      ) {
        const hostName = this.#formatHostName()
        let details: string
        if (lastFailure.type === 'rateLimit') {
          const waitSeconds =
            lastFailure.retryAfterMs !== undefined
              ? Math.ceil(lastFailure.retryAfterMs / 1_000)
              : undefined
          const waitMessage = waitSeconds
            ? ` Waiting about ${waitSeconds} seconds before trying again.`
            : ''
          details = `We're still being rate limited by ${hostName}.${waitMessage} ${RATE_LIMIT_GUIDANCE}`
        } else if (lastFailure.type === 'response') {
          details = `The host responded with status ${lastFailure.status}.`
        } else {
          const message =
            lastFailure.error instanceof Error
              ? lastFailure.error.message
              : 'an unknown error'
          details = `Encountered ${message} while contacting ${hostName}.`
        }
        console.warn(`[renoun] Fetch retry is still failing. ${details}`)
        notifiedFirstRetryFailure = true
      }

      if (skipBackoff) {
        continue
      }
      const backoff = 2 ** attempt * 200 + Math.random() * 100
      await sleep(backoff)
    }

    const hostName = this.#formatHostName()
    if (lastFailure?.type === 'rateLimit') {
      const waitMessage =
        lastFailure.retryAfterMs !== undefined
          ? ` after waiting about ${Math.ceil(lastFailure.retryAfterMs / 1_000)} seconds`
          : ''
      throw new Error(
        `[renoun] Fetch failed because ${hostName} rate limited the request${waitMessage}. ${RATE_LIMIT_GUIDANCE}`
      )
    }
    if (lastFailure?.type === 'response') {
      const host = (() => {
        try {
          return new URL(lastFailure.url).host
        } catch {
          return this.#formatHostName()
        }
      })()
      throw new Error(
        `[renoun] Fetch failed with status ${lastFailure.status} from ${host}.`
      )
    }
    if (lastFailure?.type === 'error') {
      if (lastFailure.error instanceof Error) {
        throw new Error(
          `[renoun] Failed to fetch after ${maxAttempts} attempts: ${lastFailure.error.message}`
        )
      }
      throw new Error(
        `[renoun] Failed to fetch after ${maxAttempts} attempts due to an unknown error`
      )
    }

    throw new Error(`[renoun] Failed to fetch after ${maxAttempts} attempts`)
  }

  async #ensureInitialized() {
    if (this.#initialized) {
      return
    }

    const currentInit = ++this.#initId
    if (!this.#initPromise) {
      this.#initPromise = this.#loadArchive().catch((error) => {
        this.#initPromise = undefined
        throw error
      })
    }

    await this.#initPromise
    // If a clearCache occurred during load, restart init
    if (!this.#initialized || currentInit !== this.#initId) {
      this.#initPromise = undefined
      await this.#ensureInitialized()
    }
  }

  #formatHostName() {
    switch (this.#host) {
      case 'github':
        return 'GitHub'
      case 'gitlab':
        return 'GitLab'
      case 'bitbucket':
        return 'Bitbucket'
    }
    return 'Git host'
  }

  #getArchiveUrl(ref?: string) {
    const useRef = ref ?? this.#ref
    switch (this.#host) {
      case 'github':
        return `${this.#apiBaseUrl}/repos/${this.#ownerEncoded}/${this.#repoEncoded}/tarball/${encodeURIComponent(useRef)}`
      case 'gitlab': {
        const repo = encodeURIComponent(this.#repository)
        const params = new URLSearchParams({ sha: useRef })
        return `${this.#apiBaseUrl}/projects/${repo}/repository/archive.tar.gz?${params}`
      }
      case 'bitbucket':
        return `${this.#apiBaseUrl}/repositories/${this.#ownerEncoded}/${this.#repoEncoded}/src/${encodeURIComponent(useRef)}?format=tar.gz`
    }
  }

  async #getDefaultRefFromApi(): Promise<string | undefined> {
    try {
      switch (this.#host) {
        case 'github': {
          const url = `${this.#apiBaseUrl}/repos/${this.#ownerEncoded}/${this.#repoEncoded}`
          const response = await this.#fetchWithRetry(url, 1)
          if (!response.ok) return
          const data = await response.json()
          return typeof data?.default_branch === 'string'
            ? data.default_branch
            : undefined
        }
        case 'gitlab': {
          const repo = encodeURIComponent(this.#repository)
          const url = `${this.#apiBaseUrl}/projects/${repo}`
          const response = await this.#fetchWithRetry(url, 1)
          if (!response.ok) return
          const data = await response.json()
          return typeof data?.default_branch === 'string'
            ? data.default_branch
            : undefined
        }
        case 'bitbucket': {
          const url = `${this.#apiBaseUrl}/repositories/${this.#ownerEncoded}/${this.#repoEncoded}`
          const response = await this.#fetchWithRetry(url, 1)
          if (!response.ok) return
          const data = await response.json()
          return typeof data?.mainbranch?.name === 'string'
            ? data.mainbranch.name
            : typeof data?.default_branch === 'string'
              ? data.default_branch
              : undefined
        }
      }
    } catch (error) {
      if (!this.#isIgnorableNetworkAbortError(error)) {
        throw error
      }
    }
  }

  async #loadArchive() {
    // If include/exclude filters are present, attempt subset mode first
    if (this.#include?.length || this.#exclude?.length) {
      const ok = await this.#loadSubsetIfSupported().catch(() => false)
      if (ok) {
        this.#initialized = true
        return
      }
    }

    let tried = new Set<string>()
    let startRef = this.#ref
    // If user did not provide a ref, prefer the repository's default branch
    if (!this.#userProvidedRef) {
      const discovered = await this.#getDefaultRefFromApi()
      if (discovered) {
        startRef = discovered
        this.#ref = discovered
      }
    }

    let response = await this.#fetchWithRetry(this.#getArchiveUrl(startRef))
    if (!response.ok && response.status === 404) {
      // Try strict fallback order: discovered default (if not already), then main, then master
      const discovered = await this.#getDefaultRefFromApi()
      const fallbacks: (string | undefined)[] = this.#userProvidedRef
        ? [discovered, 'main', 'master']
        : ['main', 'master']
      for (const candidate of fallbacks) {
        if (!candidate) continue
        if (tried.has(candidate)) continue
        tried.add(candidate)

        const retryResponse = await this.#fetchWithRetry(
          this.#getArchiveUrl(candidate)
        )
        if (retryResponse.ok) {
          response = retryResponse
          // Update ref so subsequent operations use the working branch
          this.#ref = candidate
          break
        }
      }
    }

    if (!response.ok) {
      throw new Error(
        `[renoun] Failed to fetch repository archive: ${response.status} ${response.statusText}`
      )
    }

    const contentLengthHeader = response.headers.get('content-length')
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader)
      if (Number.isNaN(contentLength) || contentLength < 0) {
        throw new Error('[renoun] Invalid content-length received for archive')
      }
      if (contentLength > MAX_ARCHIVE_SIZE_BYTES) {
        throw new Error('[renoun] Repository archive exceeds allowed size')
      }
    }

    const contentType = (
      response.headers.get('content-type') || ''
    ).toLowerCase()
    const allowedContentTypes =
      /(application\/(x-)?(tar|gtar|gzip)|application\/octet-stream)/i
    if (contentType && !allowedContentTypes.test(contentType)) {
      throw new Error('[renoun] Unexpected content-type for repository archive')
    }

    // Prefer Web Streams API, fall back to ArrayBuffer if body is not available
    if (response.body) {
      let stream = response.body as ReadableStream<Uint8Array>
      if (/gzip/.test(contentType)) {
        if (typeof DecompressionStream === 'function') {
          stream = stream.pipeThrough(
            new DecompressionStream('gzip') as unknown as ReadableWritablePair<
              Uint8Array,
              Uint8Array
            >
          )
        } else {
          throw new Error(
            '[renoun] Gzip decompression not supported in this environment'
          )
        }
      }
      await this.#extractTarFromStream(stream)
      this.#initialized = true
      return
    }

    let arrayBuffer: ArrayBuffer
    try {
      arrayBuffer = await response.arrayBuffer()
    } catch {
      throw new Error('[renoun] Failed to read repository archive response')
    }
    const raw = new Uint8Array(arrayBuffer)
    const isGzip = raw.length > 2 && raw[0] === 0x1f && raw[1] === 0x8b
    let source: ReadableStream<Uint8Array> = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(raw)
        controller.close()
      },
    })
    if (isGzip || /gzip/.test(contentType)) {
      if (typeof DecompressionStream === 'function') {
        source = source.pipeThrough(
          new DecompressionStream('gzip') as unknown as ReadableWritablePair<
            Uint8Array,
            Uint8Array
          >
        )
      } else {
        throw new Error(
          '[renoun] Gzip decompression not supported in this environment'
        )
      }
    }
    await this.#extractTarFromStream(source)
    this.#initialized = true
  }

  #pathMatchesFilters(path: string): boolean {
    const normalizedPath = path.replace(/^\.\/+/, '')
    if (this.#include && this.#include.length > 0) {
      const includeHit = this.#include.some((inc) =>
        normalizedPath.startsWith(inc.replace(/^\/+/, ''))
      )
      if (!includeHit) return false
    }
    if (this.#exclude && this.#exclude.length > 0) {
      const excludeHit = this.#exclude.some((exc) =>
        normalizedPath.startsWith(exc.replace(/^\/+/, ''))
      )
      if (excludeHit) return false
    }
    return true
  }

  async #loadSubsetIfSupported(): Promise<boolean> {
    // Resolve ref (prefer default if not user-provided)
    let useRef = this.#ref
    if (!this.#userProvidedRef) {
      const discovered = await this.#getDefaultRefFromApi()
      if (discovered) {
        useRef = discovered
        this.#ref = discovered
      }
    }

    switch (this.#host) {
      case 'github': {
        const treeUrl = `${this.#apiBaseUrl}/repos/${this.#ownerEncoded}/${this.#repoEncoded}/git/trees/${encodeURIComponent(useRef)}?recursive=1`
        const treeResp = await this.#fetchWithRetry(treeUrl)
        if (!treeResp.ok) return false
        const treeData = await treeResp.json().catch(() => undefined)
        if (!treeData || !Array.isArray(treeData.tree)) return false
        type Entry = { path: string; type: string; size?: number }
        const entries: Entry[] = treeData.tree
          .filter(
            (entry: any) =>
              entry && typeof entry.path === 'string' && entry.type === 'blob'
          )
          .map((entry: any) => ({
            path: entry.path as string,
            type: 'blob',
            size: typeof entry.size === 'number' ? entry.size : undefined,
          }))
        return await this.#fetchSubsetRaw(
          entries,
          (path) =>
            `https://raw.githubusercontent.com/${this.#ownerEncoded}/${this.#repoEncoded}/${encodeURIComponent(useRef)}/${path}`
        )
      }
      case 'gitlab': {
        const project = encodeURIComponent(this.#repository)
        let page = 1
        const perPage = 100
        type Entry = { path: string; type: string; size?: number }
        const entries: Entry[] = []
        while (true) {
          const treeUrl = `${this.#apiBaseUrl}/projects/${project}/repository/tree?ref=${encodeURIComponent(useRef)}&recursive=true&per_page=${perPage}&page=${page}`
          const response = await this.#fetchWithRetry(treeUrl)
          if (!response.ok) break
          const list = await response.json().catch(() => undefined)
          if (!Array.isArray(list) || list.length === 0) break
          for (const entry of list) {
            if (
              entry &&
              entry.type === 'blob' &&
              typeof entry.path === 'string'
            ) {
              entries.push({ path: entry.path, type: 'blob' })
            }
          }
          const nextPage = response.headers.get('x-next-page')
          if (!nextPage) break
          const next = Number(nextPage)
          if (!Number.isFinite(next) || next <= page) break
          page = next
          if (entries.length > this.#maxFileCount * 2) break
        }
        const origin = new URL(this.#apiBaseUrl)
        const rawBase = `${origin.protocol}//${origin.host}`
        return await this.#fetchSubsetRaw(
          entries,
          (path) =>
            `${rawBase}/${this.#repository}/-/raw/${encodeURIComponent(useRef)}/${path}`
        )
      }
      case 'bitbucket': {
        let url = `${this.#apiBaseUrl}/repositories/${this.#ownerEncoded}/${this.#repoEncoded}/src/${encodeURIComponent(useRef)}/?recursive=true`
        type Entry = { path: string; type: string; size?: number }
        const entries: Entry[] = []
        while (url) {
          const response = await this.#fetchWithRetry(url)
          if (!response.ok) break
          const data = await response.json().catch(() => undefined)
          if (!data || !Array.isArray(data.values)) break
          for (const value of data.values) {
            if (
              value &&
              value.type === 'commit_file' &&
              typeof value.path === 'string'
            ) {
              entries.push({
                path: value.path,
                type: 'blob',
                size: typeof value.size === 'number' ? value.size : undefined,
              })
            }
          }
          url = typeof data.next === 'string' ? data.next : ''
          if (entries.length > this.#maxFileCount * 2) break
        }
        return await this.#fetchSubsetRaw(
          entries,
          (path) =>
            `https://bitbucket.org/${this.#ownerEncoded}/${this.#repoEncoded}/raw/${encodeURIComponent(useRef)}/${path}`
        )
      }
      default:
        return false
    }
  }

  async #fetchSubsetRaw(
    allEntries: { path: string; type: string; size?: number }[],
    buildUrl: (path: string) => string
  ): Promise<boolean> {
    const filtered = allEntries.filter((entry) =>
      this.#pathMatchesFilters(entry.path)
    )
    let total = 0
    let count = 0
    const toFetch: { path: string }[] = []
    for (const entry of filtered) {
      count++
      if (count > this.#maxFileCount) break
      if (typeof entry.size === 'number') {
        if (entry.size > this.#maxFileBytes) continue
        total += entry.size
        if (total > this.#maxArchiveBytes) break
      }
      toFetch.push({ path: entry.path })
    }
    const files = this.getFiles()
    files.clear()
    if (toFetch.length === 0) return true

    const concurrency = 8
    const gate = new Semaphore(Math.min(concurrency, toFetch.length))
    await Promise.all(
      toFetch.map(async ({ path }) => {
        const release = await gate.acquire()
        try {
          const url = buildUrl(path)
          this.#assertAllowed(url)
          const response = await fetch(url, {
            headers: this.#noAuthHeaders,
            referrerPolicy: 'no-referrer',
          })
          if (!response.ok) return
          const arrayBuffer = await response.arrayBuffer()
          const buffer = new Uint8Array(arrayBuffer)
          if (buffer.length > this.#maxFileBytes) return
          const content: InMemoryFileContent = this.#isBinaryBuffer(buffer)
            ? { kind: 'Binary', content: buffer, encoding: 'binary' }
            : new TextDecoder('utf-8').decode(buffer)
          this.createFile(path, content)
        } catch (error) {
          if (!this.#isIgnorableNetworkAbortError(error)) {
            throw error
          }
        } finally {
          release()
        }
      })
    )
    return this.getFiles().size > 0
  }

  async *#tarStreamEntries(stream: ReadableStream<Uint8Array>): AsyncGenerator<{
    header: Uint8Array
    size: number
    typeFlag: number
    name: string
    prefix: string
    linkname: string
    readData: (maxChunk: number) => Promise<Uint8Array>
    discard: () => Promise<void>
  }> {
    const reader = stream.getReader()
    let buffer = new Uint8Array(0)
    let done = false
    let rawBytesRead = 0
    const readFromStream = async (size: number): Promise<Uint8Array> => {
      while (buffer.length < size && !done) {
        const { value, done: rdone } = await reader.read()
        if (rdone) {
          done = true
          break
        }
        if (value && value.length > 0) {
          rawBytesRead += value.length
          if (rawBytesRead > this.#maxTarStreamBytes) {
            throw new Error('[renoun] Archive exceeds maximum stream size')
          }
          const merged = new Uint8Array(buffer.length + value.length)
          merged.set(buffer, 0)
          merged.set(value, buffer.length)
          buffer = merged
        }
      }
      const out = buffer.subarray(0, Math.min(size, buffer.length))
      buffer = buffer.subarray(out.length)
      return out
    }

    while (true) {
      const header = await readFromStream(512)
      if (header.length === 0 || header.every((byte) => byte === 0)) break
      if (header.length < 512) throw new Error('[renoun] Truncated tar header')
      if (!this.#validTarChecksum(header)) {
        throw new Error('[renoun] Invalid tar header checksum')
      }

      const size = this.#parseTarSize(header)
      const typeFlag = header[156]!
      const name = this.#readTarString(header, 0, 100)
      const prefix = this.#readTarString(header, 345, 500)
      const linkname = this.#readTarString(header, 157, 257)

      const dataSize = size
      const paddedSize = Math.ceil(dataSize / 512) * 512
      let remaining = dataSize

      let discarded = false
      const readData = async (maxChunk: number): Promise<Uint8Array> => {
        if (remaining <= 0) return new Uint8Array(0)
        const toRead = Math.min(remaining, maxChunk)
        const chunk = await readFromStream(toRead)
        remaining -= chunk.length
        return chunk
      }
      const discard = async () => {
        let toSkip = remaining
        while (toSkip > 0) {
          const chunk = await readFromStream(Math.min(64 * 1024, toSkip))
          if (chunk.length === 0) break
          toSkip -= chunk.length
        }
        remaining = 0
        let pad = paddedSize - dataSize
        while (pad > 0) {
          const chunk = await readFromStream(Math.min(64 * 1024, pad))
          if (chunk.length === 0) break
          pad -= chunk.length
        }
        discarded = true
      }
      const finishPadding = async () => {
        const pad = paddedSize - dataSize
        if (pad > 0) await readFromStream(pad)
      }

      yield {
        header,
        size,
        typeFlag,
        name,
        prefix,
        linkname,
        readData,
        discard,
      }

      // If consumer didn't fully read, ensure we consume padding
      if (remaining > 0) {
        await discard()
      } else if (!discarded) {
        await finishPadding()
      }
    }
  }

  #parsePaxRecords(buffer: Uint8Array): Record<string, string> {
    const result: Record<string, string> = {}
    let index = 0
    const decoder = new TextDecoder('utf-8')

    while (index < buffer.length) {
      let length = 0
      let digits = 0
      while (index < buffer.length && buffer[index] !== 0x20) {
        const char = buffer[index++]!
        if (char < 0x30 || char > 0x39) {
          throw new Error('[renoun] Invalid PAX length')
        }
        length = length * 10 + (char - 0x30)
        digits++
        if (length > 16 * 1024) {
          throw new Error('[renoun] Oversized PAX header line')
        }
      }
      if (buffer[index++] !== 0x20) {
        throw new Error('[renoun] Invalid PAX record format')
      }
      const end = index + (length - (digits + 1))
      if (end > buffer.length) throw new Error('[renoun] Truncated PAX record')
      const record = buffer.subarray(index, end)
      index = end
      if (index < buffer.length && buffer[index] === 0x0a) index++

      const equalsIndex = record.indexOf(0x3d)
      if (equalsIndex === -1) continue
      const key = decoder.decode(record.subarray(0, equalsIndex))
      const raw = decoder.decode(record.subarray(equalsIndex + 1))
      if (!/^[\x20-\x7E]+$/.test(key) || key.length > 256) continue
      const value =
        key === 'path' || key === 'linkpath'
          ? this.#sanitizeTarPath(raw)
          : this.#stripNullTerminator(raw)
      if (value) result[key] = value
    }
    return result
  }

  #parseTarSize(header: Uint8Array): number {
    const sizeField = header.subarray(124, 136)
    const isBase256 = ((sizeField[0] ?? 0) & 0x80) !== 0

    if (isBase256) {
      const negative = (sizeField[0]! & 0x40) !== 0
      if (negative) {
        throw new Error(
          '[renoun] Tar entry size uses unsupported negative base-256 encoding'
        )
      }
      let value = 0n

      for (let index = 0; index < sizeField.length; index++) {
        const byte = sizeField[index]!
        const masked = index === 0 ? byte & 0x7f : byte
        value = (value << 8n) | BigInt(masked)
      }

      if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('[renoun] Tar entry size exceeds supported range')
      }

      return Number(value)
    }

    const sizeString = new TextDecoder('utf-8')
      .decode(sizeField)
      .replace(/\0+.*$/, '')
      .trim()
    return sizeString ? parseInt(sizeString, 8) || 0 : 0
  }

  #readTarString(header: Uint8Array, start: number, end: number) {
    return new TextDecoder('utf-8')
      .decode(header.subarray(start, end))
      .replace(/\0+.*$/, '')
      .trim()
  }

  #stripNullTerminator(value: string) {
    return value.replace(/\0+$/, '')
  }

  #sanitizeTarPath(value: string | null | undefined): string | null {
    if (!value) {
      return null
    }

    const stripped = this.#stripNullTerminator(value)
    const withoutNulls = stripped.replace(/\0/g, '')
    const withoutControlChars = withoutNulls.replace(
      /[\u0001-\u001f\u007f]/g,
      ''
    )
    const withoutInvisible = withoutControlChars.replace(
      /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\u061c]/g,
      ''
    )

    const normalized = withoutInvisible.normalize('NFKC')
    return normalized || null
  }

  #isBinaryBuffer(buffer: Uint8Array): boolean {
    if (buffer.length === 0) {
      return false
    }

    const sampleLength = Math.min(buffer.length, 1_024)
    let suspicious = 0

    for (let index = 0; index < sampleLength; index++) {
      const byte = buffer[index]!

      if (byte === 0) {
        return true
      }

      if (byte < 7 || (byte > 13 && byte < 32) || byte === 255) {
        suspicious++
      }
    }

    if (suspicious / sampleLength > 0.1) {
      return true
    }

    const sample = buffer.subarray(0, Math.min(buffer.length, 8_192))
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(sample)
      return false
    } catch {
      return true
    }
  }

  #validTarChecksum(header: Uint8Array): boolean {
    let sum = 0
    for (let index = 0; index < 512; index++) {
      const isChecksumField = index >= 148 && index < 156
      sum += isChecksumField ? 32 : header[index]!
    }
    const storedString = new TextDecoder('utf-8')
      .decode(header.subarray(148, 156))
      .replace(/\0.*$/, '')
      .trim()
    const stored = parseInt(storedString, 8)
    return Number.isFinite(stored) && stored === sum
  }

  #validateRef(ref: string) {
    if (!/^[A-Za-z0-9._\-\/]{1,256}$/.test(ref)) {
      throw new Error('[renoun] Invalid ref')
    }
    if (ref.includes('..')) {
      throw new Error('[renoun] Invalid ref')
    }
    if (/[^\x20-\x7E]/.test(ref)) {
      throw new Error('[renoun] Invalid ref')
    }
    if (ref.startsWith('/') || ref.endsWith('/')) {
      throw new Error('[renoun] Invalid ref')
    }
  }

  async readDirectory(path: string = '.'): Promise<DirectoryEntry[]> {
    await this.#ensureInitialized()
    return InMemoryFileSystem.prototype.readDirectorySync.call(this, path)
  }

  readDirectorySync(): DirectoryEntry[] {
    throw new Error('readDirectorySync is not supported in GitHostFileSystem')
  }

  #resolveSymlinkPath(path: string): string {
    let targetPath = path
    const visited = new Set<string>()
    while (true) {
      const key = targetPath.startsWith('./')
        ? targetPath
        : `./${normalizeSlashes(targetPath)}`
      const link = this.#symlinkMap?.get(key)
      if (!link) break
      if (visited.has(key)) {
        throw new Error('[renoun] Symlink loop detected')
      }
      visited.add(key)
      targetPath = link
    }
    return targetPath
  }

  async readFile(path: string): Promise<string> {
    await this.#ensureInitialized()

    let targetPath = this.#resolveSymlinkPath(path)
    let entry = this.getFileEntry(targetPath)
    if (!entry) {
      const keys = Array.from(this.getFiles().keys())
      // Fallback try to locate file by suffix (handles tar root folder prefix)
      const suffix = `/${normalizeSlashes(targetPath).replace(/^\.+\//, '')}`
      const candidates = keys.filter(
        (key) =>
          key === `./${normalizeSlashes(targetPath)}` || key.endsWith(suffix)
      )
      if (candidates.length > 0) {
        candidates.sort(
          (first, second) => first.split('/').length - second.split('/').length
        )
        const best = candidates[0]!

        targetPath = best.startsWith('./') ? best : `./${best}`
        entry = this.getFileEntry(targetPath)
      }

      if (!entry) {
        throw new Error(`[renoun] File not found: ${path}`)
      }
    }
    return InMemoryFileSystem.prototype.readFileSync.call(this, targetPath)
  }

  async readFileBinary(path: string): Promise<Uint8Array> {
    await this.#ensureInitialized()
    const targetPath = this.#resolveSymlinkPath(path)
    const entry = this.getFileEntry(targetPath)
    if (!entry) {
      throw new Error(`[renoun] File not found: ${path}`)
    }
    return InMemoryFileSystem.prototype.readFileBinarySync.call(
      this,
      targetPath
    )
  }

  readFileSync(): string {
    throw new Error(
      '[renoun] readFileSync is not supported in GitHostFileSystem'
    )
  }

  // LRU cache for parsed exports by content hash (shared across calls)
  #exportParseCache = new LRUMap<string, Map<string, ExportItem>>(500)

  /** Get the export history of a repository based on a set of entry files. */
  async getExportHistory(
    options: ExportHistoryOptions
  ): Promise<ExportHistoryReport> {
    await this.#ensureInitialized()

    const entryArgs = Array.isArray(options.entry)
      ? options.entry
      : [options.entry]
    const entrySources = entryArgs.length ? entryArgs : ['.']
    const uniqueEntrySources = Array.from(
      new Set(
        entrySources.map((path) => normalizePath(String(path))).filter(Boolean)
      )
    )

    // Strict Validation: Only accept code files as entry points
    for (const source of uniqueEntrySources) {
      if (looksLikeFilePath(source) && !hasJavaScriptLikeExtension(source)) {
        throw new Error(
          `Invalid entry file: "${source}". Only JavaScript/TypeScript source files are allowed.`
        )
      }
    }

    const scopeDirectories = Array.from(
      new Set(
        uniqueEntrySources
          .map((path) =>
            looksLikeFilePath(path) ? directoryName(path) : normalizePath(path)
          )
          .map((path) => normalizePath(String(path)))
          .filter(Boolean)
      )
    )

    const maxDepth = options.maxDepth ?? 10
    const detectUpdates = options.detectUpdates ?? true
    const updateMode = options.updateMode ?? 'signature'

    // Resolve entry files in parallel
    const entryRelatives = await Promise.all(
      uniqueEntrySources.map(async (source) => {
        if (looksLikeFilePath(source)) {
          return source
        }
        return this.#inferEntryFile(source)
      })
    )

    const uniqueEntryRelatives = Array.from(
      new Set(entryRelatives.filter((e): e is string => e !== null))
    )
    if (uniqueEntryRelatives.length === 0) {
      throw new Error(`Could not resolve any entry files.`)
    }

    const parseWarnings: string[] = []
    const exports: ExportHistoryReport['exports'] = Object.create(null)

    // Get commit history for the entry files
    const commitHistory = await this.#getCommitHistoryForPaths(
      uniqueEntryRelatives,
      options.limit
    )

    if (commitHistory.length === 0) {
      // No commits found, analyze current state only
      const currentExports = await this.#collectExportsForCurrentSnapshot(
        uniqueEntryRelatives,
        maxDepth,
        scopeDirectories,
        parseWarnings
      )

      const addedIds = new Set<string>()
      const now = Math.floor(Date.now() / 1000)
      const changeBase = {
        sha: 'HEAD',
        unix: now,
        date: new Date(now * 1000).toISOString(),
        release: undefined,
      }

      for (const [name, items] of currentExports) {
        for (const [id] of items) {
          let history = exports[id]
          if (!history) {
            history = []
            exports[id] = history
          }
          if (!addedIds.has(id)) {
            history.push({
              ...changeBase,
              kind: 'Added',
              name,
              filePath: parseExportId(id)?.file ?? '',
              id,
            } as ExportChange)
            addedIds.add(id)
          }
        }
      }

      const nameToId: Record<string, string[]> = Object.create(null)
      for (const [name, ids] of currentExports) {
        const sorted = Array.from(ids.keys()).sort()
        if (sorted.length > 0) {
          nameToId[name] = sorted
        }
      }

      return {
        generatedAt: new Date().toISOString(),
        repo: this.#repository,
        entryFiles: uniqueEntryRelatives,
        exports,
        nameToId,
        ...(parseWarnings.length ? { parseWarnings } : {}),
      }
    }

    // Process commits from oldest to newest
    const reversedCommits = [...commitHistory].reverse()

    // Pre-fetch all file contents in parallel batches
    // This significantly reduces the number of sequential API calls
    const FETCH_BATCH_SIZE = 10
    const fileContentCache = new Map<string, string | null>()

    // Build list of all (commit, file) pairs we need to fetch
    const fetchTasks: Array<{ commitSha: string; filePath: string }> = []
    for (const commit of reversedCommits) {
      for (const entryRelative of uniqueEntryRelatives) {
        fetchTasks.push({ commitSha: commit.sha, filePath: entryRelative })
      }
    }

    // Fetch in parallel batches with concurrency limit
    await mapWithLimit(fetchTasks, FETCH_BATCH_SIZE, async (task) => {
      const cacheKey = `${task.commitSha}:${task.filePath}`
      if (!fileContentCache.has(cacheKey)) {
        const content = await this.#fetchFileAtCommit(
          task.filePath,
          task.commitSha
        )
        fileContentCache.set(cacheKey, content)
      }
    })

    // Track previous exports for change detection
    let previousExports: Map<string, Map<string, ExportItem>> | null = null

    // Process each commit
    for (const commit of reversedCommits) {
      const commitExports = new Map<string, Map<string, ExportItem>>()

      // Process entry files in parallel
      const entryResults = await Promise.all(
        uniqueEntryRelatives.map(async (entryRelative) => {
          const cacheKey = `${commit.sha}:${entryRelative}`
          const content = fileContentCache.get(cacheKey)
          if (!content) return null

          // Use content hash for caching parsed exports
          const contentHash = this.#hashContent(content)
          const cachedExports = this.#exportParseCache.get(contentHash)

          if (cachedExports) {
            return { entryRelative, exports: cachedExports }
          }

          const rawExports = scanModuleExports(entryRelative, content)
          const entryExportMap = await this.#resolveExportsFromRawOptimized(
            entryRelative,
            rawExports,
            commit.sha,
            0,
            maxDepth,
            scopeDirectories,
            parseWarnings,
            new Set(),
            fileContentCache
          )

          // Cache the parsed exports
          this.#exportParseCache.set(contentHash, entryExportMap)

          return { entryRelative, exports: entryExportMap }
        })
      )

      // Merge entry results into commitExports
      for (const result of entryResults) {
        if (!result) continue
        for (const [name, item] of result.exports) {
          let itemsForName = commitExports.get(name)
          if (!itemsForName) {
            itemsForName = new Map()
            commitExports.set(name, itemsForName)
          }
          if (!itemsForName.has(item.id)) {
            itemsForName.set(item.id, item)
          }
        }
      }

      const changeBase = {
        sha: commit.sha,
        unix: commit.unix,
        date: new Date(commit.unix * 1000).toISOString(),
        release: commit.release,
      }

      // Process changes between previous and current exports
      this.#processExportChanges(
        previousExports,
        commitExports,
        changeBase,
        exports,
        detectUpdates,
        updateMode
      )

      previousExports = commitExports
    }

    // Build nameToId mapping from final state
    const nameToId: Record<string, string[]> = Object.create(null)
    if (previousExports) {
      for (const [name, ids] of previousExports) {
        const sorted = Array.from(ids.keys()).sort()
        if (sorted.length > 0) {
          nameToId[name] = sorted
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      repo: this.#repository,
      entryFiles: uniqueEntryRelatives,
      exports,
      nameToId,
      ...(parseWarnings.length ? { parseWarnings } : {}),
    }
  }

  #hashContent(content: string): string {
    return createHash('sha1').update(content).digest('hex').substring(0, 16)
  }

  async #collectExportsForCurrentSnapshot(
    entryRelatives: string[],
    maxDepth: number,
    scopeDirectories: string[],
    parseWarnings: string[]
  ): Promise<Map<string, Map<string, ExportItem>>> {
    const currentExports = new Map<string, Map<string, ExportItem>>()

    const results = await Promise.all(
      entryRelatives.map(async (entryRelative) => {
        const entryExportMap = await this.#collectExportsFromFile(
          entryRelative,
          0,
          maxDepth,
          scopeDirectories,
          new Map(),
          parseWarnings,
          new Set()
        )
        return { entryRelative, exports: entryExportMap }
      })
    )

    for (const result of results) {
      for (const [name, item] of result.exports) {
        let itemsForName = currentExports.get(name)
        if (!itemsForName) {
          itemsForName = new Map()
          currentExports.set(name, itemsForName)
        }
        if (!itemsForName.has(item.id)) {
          itemsForName.set(item.id, item)
        }
      }
    }

    return currentExports
  }

  #processExportChanges(
    previousExports: Map<string, Map<string, ExportItem>> | null,
    commitExports: Map<string, Map<string, ExportItem>>,
    changeBase: { sha: string; unix: number; date: string; release?: string },
    exports: Record<string, ExportChange[]>,
    detectUpdates: boolean,
    updateMode: 'body' | 'signature'
  ): void {
    if (previousExports !== null) {
      const { previousById, currentById, previousNamesById } =
        buildExportComparisonMaps(previousExports, commitExports)

      // Detect removed exports
      const removedIds: string[] = []
      for (const id of previousById.keys()) {
        if (!currentById.has(id)) {
          removedIds.push(id)
        }
      }

      const { renamePairs, usedRemovedIds } = detectSameFileRenames(
        previousById,
        currentById,
        removedIds
      )

      detectCrossFileRenames(
        previousById,
        currentById,
        removedIds,
        usedRemovedIds,
        renamePairs
      )

      // Process additions and renames
      const addedIds = new Set<string>()
      const renamedIds = new Set<string>()
      const updatedIds = new Set<string>()
      const deprecatedIds = new Set<string>()

      for (const [name, currentItems] of commitExports) {
        const previousItems = previousExports.get(name)
        for (const [id, currentExportItem] of currentItems) {
          const renameInfo = renamePairs.get(id)
          const history = mergeRenameHistory(
            exports,
            id,
            renameInfo?.oldId ?? id
          )

          // Check for deprecation state change
          const previousDeprecated = renameInfo?.oldId
            ? previousById.get(renameInfo.oldId)?.deprecated
            : (previousById.get(id)?.deprecated ??
              previousItems?.get(id)?.deprecated)
          const willDeprecate =
            currentExportItem.deprecated &&
            !previousDeprecated &&
            !deprecatedIds.has(id)

          if (renameInfo) {
            if (!renamedIds.has(id)) {
              const currentParsed = parseExportId(id)
              const previousParsed = parseExportId(renameInfo.oldId)
              const oldExportName = previousById.get(renameInfo.oldId)?.name

              history.push({
                ...changeBase,
                kind: 'Renamed',
                name,
                filePath: currentParsed?.file ?? '',
                id,
                previousName:
                  oldExportName && oldExportName !== name
                    ? oldExportName
                    : undefined,
                previousFilePath:
                  currentParsed &&
                  previousParsed &&
                  currentParsed.file !== previousParsed.file
                    ? previousParsed.file
                    : undefined,
                previousId: renameInfo.oldId,
              } as ExportChange)
              renamedIds.add(id)
            }
          } else if (!previousItems || !previousItems.has(id)) {
            const previousNames = previousNamesById.get(id)
            if (previousNames && previousNames.size > 0) {
              if (!renamedIds.has(id)) {
                let actualPreviousName: string | undefined
                for (const prevName of previousNames) {
                  if (prevName !== name) {
                    actualPreviousName = prevName
                    break
                  }
                }
                history.push({
                  ...changeBase,
                  kind: 'Renamed',
                  name,
                  filePath: parseExportId(id)?.file ?? '',
                  id,
                  previousName: actualPreviousName,
                  previousId: id,
                } as ExportChange)
                renamedIds.add(id)
              }
            } else if (!addedIds.has(id)) {
              // Check for oscillation: if last entry was "Removed" in same release, collapse
              const collapsed = checkAndCollapseOscillation(
                history,
                'Added',
                changeBase.release
              )
              if (!collapsed) {
                history.push({
                  ...changeBase,
                  kind: 'Added',
                  name,
                  filePath: parseExportId(id)?.file ?? '',
                  id,
                } as ExportChange)
              }
              addedIds.add(id)
            }
          } else if (detectUpdates && !willDeprecate) {
            const previousExportItem = previousItems.get(id)!
            const signatureChanged =
              previousExportItem.signatureHash !==
              currentExportItem.signatureHash
            const bodyChanged =
              previousExportItem.bodyHash !== currentExportItem.bodyHash
            const shouldRecord =
              updateMode === 'signature' ? signatureChanged : bodyChanged
            if (shouldRecord && !updatedIds.has(id)) {
              history.push({
                ...changeBase,
                kind: 'Updated',
                name,
                filePath: parseExportId(id)?.file ?? '',
                id,
                signature: signatureChanged,
              } as ExportChange)
              updatedIds.add(id)
            }
          }

          // Track deprecation changes
          if (willDeprecate) {
            history.push({
              ...changeBase,
              kind: 'Deprecated',
              name,
              filePath: parseExportId(id)?.file ?? '',
              id,
              message: currentExportItem.deprecatedMessage,
            } as ExportChange)
            deprecatedIds.add(id)
          }
        }
      }

      // Process removed exports
      for (const removedId of removedIds) {
        if (usedRemovedIds.has(removedId)) continue
        let history = exports[removedId]
        if (!history) continue
        const removedItem = previousById.get(removedId)
        if (!removedItem) continue

        // Check for oscillation: if last entry was "Added" in same release, collapse
        const collapsed = checkAndCollapseOscillation(
          history,
          'Removed',
          changeBase.release
        )
        if (collapsed && history.length === 0) {
          // History is now empty, remove the export entry entirely
          delete exports[removedId]
        } else if (!collapsed) {
          history.push({
            ...changeBase,
            kind: 'Removed',
            name: removedItem.name,
            filePath: parseExportId(removedId)?.file ?? '',
            id: removedId,
          } as ExportChange)
        }
      }
    } else {
      // First commit - all exports are added
      const addedIds = new Set<string>()
      for (const [name, items] of commitExports) {
        for (const [id] of items) {
          let history = exports[id]
          if (!history) {
            history = []
            exports[id] = history
          }
          if (!addedIds.has(id)) {
            history.push({
              ...changeBase,
              kind: 'Added',
              name,
              filePath: parseExportId(id)?.file ?? '',
              id,
            } as ExportChange)
            addedIds.add(id)
          }
        }
      }
    }
  }

  async #resolveExportsFromRawOptimized(
    filePath: string,
    rawExports: Map<string, ExportItem>,
    commitSha: string,
    depth: number,
    maxDepth: number,
    scopeDirectories: string[],
    parseWarnings: string[],
    visiting: Set<string>,
    fileContentCache: Map<string, string | null>
  ): Promise<Map<string, ExportItem>> {
    const results = new Map<string, ExportItem>()
    const fileIdentity = (name: string) => formatExportId(filePath, name)

    // Partition exports by type
    const localExports: Array<[string, ExportItem]> = []
    const fromExports: Array<[string, ExportItem, string]> = []
    const namespaceExports: Array<[string, ExportItem, string]> = []
    const starExports: Array<[string, ExportItem, string]> = []

    for (const [name, rawItem] of rawExports) {
      if (rawItem.id === '__LOCAL__') {
        localExports.push([name, rawItem])
      } else if (rawItem.id.startsWith('__FROM__')) {
        fromExports.push([name, rawItem, rawItem.id.slice(8)])
      } else if (rawItem.id.startsWith('__NAMESPACE__')) {
        namespaceExports.push([name, rawItem, rawItem.id.slice(13)])
      } else if (rawItem.id.startsWith('__STAR__')) {
        starExports.push([name, rawItem, rawItem.id.slice(8)])
      }
    }

    // Handle local exports
    for (const [name, rawItem] of localExports) {
      results.set(name, { ...rawItem, id: fileIdentity(name) })
    }

    // Early return if no external exports
    const allExternalExports = [
      ...fromExports,
      ...namespaceExports,
      ...starExports,
    ]
    if (allExternalExports.length === 0) {
      return results
    }

    if (depth >= maxDepth) {
      parseWarnings.push(`Max depth exceeded at ${filePath}`)
      return results
    }

    // Resolve module paths in parallel
    const baseDirectory = directoryName(filePath)
    const uniqueFromPaths = [
      ...new Set(allExternalExports.map(([, , fromPath]) => fromPath)),
    ]

    const resolutionResults = await Promise.all(
      uniqueFromPaths.map(async (fromPath) => ({
        fromPath,
        resolved: await this.#resolveModulePath(baseDirectory, fromPath),
      }))
    )

    const resolutionMap = new Map<string, string | null>()
    for (const { fromPath, resolved } of resolutionResults) {
      resolutionMap.set(fromPath, resolved)
    }

    // Collect exports from resolved paths in parallel
    const collectionMap = new Map<string, Map<string, ExportItem>>()
    const pathsNeedingCollection = new Set<string>()

    for (const [, , fromPath] of fromExports) {
      const resolved = resolutionMap.get(fromPath)
      if (resolved) {
        pathsNeedingCollection.add(resolved)
      }
    }
    for (const [, , fromPath] of starExports) {
      const resolved = resolutionMap.get(fromPath)
      if (resolved && isUnderScope(resolved, scopeDirectories)) {
        pathsNeedingCollection.add(resolved)
      }
    }

    // Filter out already visiting paths to prevent cycles
    const newVisiting = new Set(visiting)
    newVisiting.add(filePath)
    const pathsToCollect = Array.from(pathsNeedingCollection).filter(
      (p) => !newVisiting.has(p)
    )

    // Fetch and parse in parallel
    const collectionResults = await Promise.all(
      pathsToCollect.map(async (resolved) => {
        const cacheKey = `${commitSha}:${resolved}`
        let content = fileContentCache.get(cacheKey)

        if (content === undefined) {
          content = await this.#fetchFileAtCommit(resolved, commitSha)
          fileContentCache.set(cacheKey, content)
        }

        if (!content)
          return { resolved, exports: new Map<string, ExportItem>() }

        // Check content cache
        const contentHash = this.#hashContent(content)
        const cachedExports = this.#exportParseCache.get(contentHash)
        if (cachedExports) {
          return { resolved, exports: cachedExports }
        }

        const childRawExports = scanModuleExports(resolved, content)
        const childExports = await this.#resolveExportsFromRawOptimized(
          resolved,
          childRawExports,
          commitSha,
          depth + 1,
          maxDepth,
          scopeDirectories,
          parseWarnings,
          newVisiting,
          fileContentCache
        )

        this.#exportParseCache.set(contentHash, childExports)
        return { resolved, exports: childExports }
      })
    )

    for (const { resolved, exports: childExports } of collectionResults) {
      collectionMap.set(resolved, childExports)
    }

    // Process FROM exports
    for (const [name, rawItem, fromPath] of fromExports) {
      const resolved = resolutionMap.get(fromPath)
      if (!resolved) continue

      const targetExports = collectionMap.get(resolved)
      const sourceName = rawItem.sourceName ?? name
      const targetItem = targetExports?.get(sourceName)

      if (targetItem) {
        results.set(name, targetItem)
      } else {
        results.set(name, {
          ...rawItem,
          id: formatExportId(resolved, sourceName),
        })
      }
    }

    // Process NAMESPACE exports
    for (const [name, rawItem, fromPath] of namespaceExports) {
      const resolved = resolutionMap.get(fromPath)
      if (!resolved) continue

      results.set(name, {
        ...rawItem,
        id: formatExportId(resolved, '__NAMESPACE__'),
      })
    }

    // Process STAR exports
    for (const [, , fromPath] of starExports) {
      const resolved = resolutionMap.get(fromPath)
      if (!resolved || !isUnderScope(resolved, scopeDirectories)) continue

      const children = collectionMap.get(resolved)
      if (!children) continue

      for (const [childName, childItem] of children) {
        if (childName !== 'default' && !results.has(childName)) {
          results.set(childName, childItem)
        }
      }
    }

    return results
  }

  async #inferEntryFile(scopeDirectory: string): Promise<string | null> {
    for (const name of INDEX_FILE_CANDIDATES) {
      const path = joinPaths(scopeDirectory, name)
      const normalizedPath = normalizePath(path)
      const entry =
        this.getFileEntry(normalizedPath) ||
        this.getFileEntry(`./${normalizedPath}`)
      if (entry) {
        return normalizedPath
      }
    }
    return null
  }

  async #collectExportsFromFile(
    filePath: string,
    depth: number,
    maxDepth: number,
    scopeDirectories: string[],
    _blobCache: Map<string, Map<string, ExportItem>>,
    parseWarnings: string[],
    visiting: Set<string>
  ): Promise<Map<string, ExportItem>> {
    const results = new Map<string, ExportItem>()

    if (depth > maxDepth) {
      parseWarnings.push(`Max depth exceeded at ${filePath}`)
      return results
    }

    if (visiting.has(filePath)) {
      return results
    }
    const visitingBranch = new Set(visiting)
    visitingBranch.add(filePath)

    // Read file content
    let content: string
    try {
      content = await this.readFile(filePath)
    } catch {
      return results
    }

    // Check content cache first
    const contentHash = this.#hashContent(content)
    const cachedExports = this.#exportParseCache.get(contentHash)
    if (cachedExports) {
      return cachedExports
    }

    const rawExports = scanModuleExports(filePath, content)

    const exportMap = await this.#resolveExportsFromRaw(
      filePath,
      rawExports,
      null,
      depth,
      maxDepth,
      scopeDirectories,
      parseWarnings,
      visitingBranch
    )

    // Cache the result
    this.#exportParseCache.set(contentHash, exportMap)

    return exportMap
  }

  async #resolveExportsFromRaw(
    filePath: string,
    rawExports: Map<string, ExportItem>,
    commitSha: string | null,
    depth: number,
    maxDepth: number,
    scopeDirectories: string[],
    parseWarnings: string[],
    visiting: Set<string>
  ): Promise<Map<string, ExportItem>> {
    const results = new Map<string, ExportItem>()
    const fileIdentity = (name: string) => formatExportId(filePath, name)

    // Partition exports by type
    const localExports: Array<[string, ExportItem]> = []
    const fromExports: Array<[string, ExportItem, string]> = []
    const namespaceExports: Array<[string, ExportItem, string]> = []
    const starExports: Array<[string, ExportItem, string]> = []

    for (const [name, rawItem] of rawExports) {
      if (rawItem.id === '__LOCAL__') {
        localExports.push([name, rawItem])
      } else if (rawItem.id.startsWith('__FROM__')) {
        fromExports.push([name, rawItem, rawItem.id.slice(8)])
      } else if (rawItem.id.startsWith('__NAMESPACE__')) {
        namespaceExports.push([name, rawItem, rawItem.id.slice(13)])
      } else if (rawItem.id.startsWith('__STAR__')) {
        starExports.push([name, rawItem, rawItem.id.slice(8)])
      }
    }

    // Handle local exports
    for (const [name, rawItem] of localExports) {
      results.set(name, { ...rawItem, id: fileIdentity(name) })
    }

    // Early return if no external exports
    const allExternalExports = [
      ...fromExports,
      ...namespaceExports,
      ...starExports,
    ]
    if (allExternalExports.length === 0) {
      return results
    }

    // Resolve module paths in parallel
    const baseDirectory = directoryName(filePath)
    const uniqueFromPaths = [
      ...new Set(allExternalExports.map(([, , fromPath]) => fromPath)),
    ]

    const resolutionResults = await Promise.all(
      uniqueFromPaths.map(async (fromPath) => ({
        fromPath,
        resolved: await this.#resolveModulePath(baseDirectory, fromPath),
      }))
    )

    const resolutionMap = new Map<string, string | null>()
    for (const { fromPath, resolved } of resolutionResults) {
      resolutionMap.set(fromPath, resolved)
    }

    // Collect exports from resolved paths
    const collectionMap = new Map<string, Map<string, ExportItem>>()
    const pathsNeedingCollection = new Set<string>()

    for (const [, , fromPath] of fromExports) {
      const resolved = resolutionMap.get(fromPath)
      if (resolved) {
        pathsNeedingCollection.add(resolved)
      }
    }
    for (const [, , fromPath] of starExports) {
      const resolved = resolutionMap.get(fromPath)
      if (resolved && isUnderScope(resolved, scopeDirectories)) {
        pathsNeedingCollection.add(resolved)
      }
    }

    // Filter out already visiting paths to prevent cycles
    const newVisiting = new Set(visiting)
    newVisiting.add(filePath)
    const pathsToCollect = Array.from(pathsNeedingCollection).filter(
      (p) => !newVisiting.has(p)
    )

    // Fetch and parse in parallel
    const collectionResults = await Promise.all(
      pathsToCollect.map(async (resolved) => {
        let content: string | null = null
        try {
          if (commitSha) {
            content = await this.#fetchFileAtCommit(resolved, commitSha)
          } else {
            content = await this.readFile(resolved)
          }
        } catch {
          return { resolved, exports: new Map<string, ExportItem>() }
        }
        if (!content)
          return { resolved, exports: new Map<string, ExportItem>() }

        // Check content cache
        const contentHash = this.#hashContent(content)
        const cachedExports = this.#exportParseCache.get(contentHash)
        if (cachedExports) {
          return { resolved, exports: cachedExports }
        }

        const childRawExports = scanModuleExports(resolved, content)
        const childExports = await this.#resolveExportsFromRaw(
          resolved,
          childRawExports,
          commitSha,
          depth + 1,
          maxDepth,
          scopeDirectories,
          parseWarnings,
          newVisiting
        )

        this.#exportParseCache.set(contentHash, childExports)
        return { resolved, exports: childExports }
      })
    )

    for (const { resolved, exports: childExports } of collectionResults) {
      collectionMap.set(resolved, childExports)
    }

    // Process FROM exports
    for (const [name, rawItem, fromPath] of fromExports) {
      const resolved = resolutionMap.get(fromPath)
      if (!resolved) continue

      const targetExports = collectionMap.get(resolved)
      const sourceName = rawItem.sourceName ?? name
      const targetItem = targetExports?.get(sourceName)

      if (targetItem) {
        results.set(name, targetItem)
      } else {
        results.set(name, {
          ...rawItem,
          id: formatExportId(resolved, sourceName),
        })
      }
    }

    // Process NAMESPACE exports
    for (const [name, rawItem, fromPath] of namespaceExports) {
      const resolved = resolutionMap.get(fromPath)
      if (!resolved) continue

      results.set(name, {
        ...rawItem,
        id: formatExportId(resolved, '__NAMESPACE__'),
      })
    }

    // Process STAR exports
    for (const [, , fromPath] of starExports) {
      const resolved = resolutionMap.get(fromPath)
      if (!resolved || !isUnderScope(resolved, scopeDirectories)) continue

      const children = collectionMap.get(resolved)
      if (!children) continue

      for (const [childName, childItem] of children) {
        if (childName !== 'default' && !results.has(childName)) {
          results.set(childName, childItem)
        }
      }
    }

    return results
  }

  async #resolveModulePath(
    baseDir: string,
    specifier: string
  ): Promise<string | null> {
    if (!specifier.startsWith('.')) {
      return null
    }

    const basePath = joinPaths(baseDir, specifier)
    const fileCandidates = EXTENSION_PRIORITY.map((ext) => basePath + ext)
    const indexCandidates = INDEX_FILE_CANDIDATES.map((name) =>
      joinPaths(basePath, name)
    )

    for (const candidate of [...fileCandidates, ...indexCandidates]) {
      const normalized = normalizePath(candidate)
      const entry =
        this.getFileEntry(normalized) || this.getFileEntry(`./${normalized}`)
      if (entry) {
        return normalized
      }
    }

    return null
  }

  async #getCommitHistoryForPaths(
    paths: string[],
    limit?: number
  ): Promise<Array<{ sha: string; unix: number; release?: string }>> {
    const commits: Array<{ sha: string; unix: number; release?: string }> = []

    switch (this.#host) {
      case 'github': {
        if (!this.#ownerEncoded || !this.#repoEncoded) return commits
        const pathParam =
          paths.length === 1 ? `&path=${encodeURIComponent(paths[0])}` : ''
        const perPage = limit ? Math.min(limit, 100) : 100
        const url = `${this.#apiBaseUrl}/repos/${this.#ownerEncoded}/${this.#repoEncoded}/commits?sha=${encodeURIComponent(this.#ref)}&per_page=${perPage}${pathParam}`

        const response = await this.#fetchWithRetry(url)
        if (!response.ok) return commits

        const data = await response.json().catch(() => [])
        if (!Array.isArray(data)) return commits

        for (const commit of data) {
          const sha = commit?.sha
          const dateStr =
            commit?.commit?.author?.date || commit?.commit?.committer?.date
          if (!sha || !dateStr) continue
          const date = new Date(dateStr)
          if (isNaN(date.getTime())) continue
          commits.push({
            sha,
            unix: Math.floor(date.getTime() / 1000),
          })
        }
        break
      }
      case 'gitlab': {
        const project = encodeURIComponent(this.#repository)
        const pathParam =
          paths.length === 1 ? `&path=${encodeURIComponent(paths[0])}` : ''
        const perPage = limit ? Math.min(limit, 100) : 100
        const url = `${this.#apiBaseUrl}/projects/${project}/repository/commits?ref_name=${encodeURIComponent(this.#ref)}&per_page=${perPage}${pathParam}`

        const response = await this.#fetchWithRetry(url)
        if (!response.ok) return commits

        const data = await response.json().catch(() => [])
        if (!Array.isArray(data)) return commits

        for (const commit of data) {
          const sha = commit?.id
          const dateStr = commit?.committed_date || commit?.created_at
          if (!sha || !dateStr) continue
          const date = new Date(dateStr)
          if (isNaN(date.getTime())) continue
          commits.push({
            sha,
            unix: Math.floor(date.getTime() / 1000),
          })
        }
        break
      }
      case 'bitbucket': {
        if (!this.#ownerEncoded || !this.#repoEncoded) return commits
        const pathParam =
          paths.length === 1 ? `&path=${encodeURIComponent(paths[0])}` : ''
        const pageLen = limit ? Math.min(limit, 100) : 100
        const url = `${this.#apiBaseUrl}/repositories/${this.#ownerEncoded}/${this.#repoEncoded}/commits/${encodeURIComponent(this.#ref)}?pagelen=${pageLen}${pathParam}`

        const response = await this.#fetchWithRetry(url)
        if (!response.ok) return commits

        const data = await response.json().catch(() => ({}))
        const values = Array.isArray(data?.values) ? data.values : []

        for (const commit of values) {
          const sha = commit?.hash
          const dateStr = commit?.date
          if (!sha || !dateStr) continue
          const date = new Date(dateStr)
          if (isNaN(date.getTime())) continue
          commits.push({
            sha,
            unix: Math.floor(date.getTime() / 1000),
          })
        }
        break
      }
    }

    return commits
  }

  async #fetchFileAtCommit(
    filePath: string,
    commitSha: string
  ): Promise<string | null> {
    try {
      switch (this.#host) {
        case 'github': {
          if (!this.#ownerEncoded || !this.#repoEncoded) return null
          const url = `https://raw.githubusercontent.com/${this.#ownerEncoded}/${this.#repoEncoded}/${commitSha}/${filePath}`
          const response = await fetch(url, {
            headers: this.#noAuthHeaders,
            referrerPolicy: 'no-referrer',
          })
          if (!response.ok) return null
          return await response.text()
        }
        case 'gitlab': {
          const project = encodeURIComponent(this.#repository)
          const encodedPath = encodeURIComponent(filePath)
          const url = `${this.#apiBaseUrl}/projects/${project}/repository/files/${encodedPath}/raw?ref=${commitSha}`
          const response = await this.#fetchWithRetry(url)
          if (!response.ok) return null
          return await response.text()
        }
        case 'bitbucket': {
          if (!this.#ownerEncoded || !this.#repoEncoded) return null
          const url = `https://bitbucket.org/${this.#ownerEncoded}/${this.#repoEncoded}/raw/${commitSha}/${filePath}`
          const response = await fetch(url, {
            headers: this.#noAuthHeaders,
            referrerPolicy: 'no-referrer',
          })
          if (!response.ok) return null
          return await response.text()
        }
      }
    } catch {
      return null
    }
    return null
  }

  isFilePathGitIgnored(): boolean {
    return false
  }

  override isFilePathExcludedFromTsConfig(): boolean {
    return false
  }
}
