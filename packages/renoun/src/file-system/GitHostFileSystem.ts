import { joinPaths, normalizePath, normalizeSlashes } from '../utils/path.js'
import { MemoryFileSystem, type MemoryFileContent } from './MemoryFileSystem.js'
import type { DirectoryEntry } from './types.js'

type GitHost = 'github' | 'gitlab' | 'bitbucket'

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

const clamp = (ms: number, max = 15 * 60_000) => Math.min(Math.max(ms, 0), max)

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

export class GitHostFileSystem extends MemoryFileSystem {
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
          '[renoun] Repository archive exceeds allowed size during extraction'
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

      const content: MemoryFileContent = this.#isBinaryBuffer(buf)
        ? { kind: 'binary', content: buf, encoding: 'binary' }
        : new TextDecoder('utf-8').decode(buf)

      this.createFile(relativePath, content)
      seen.add(relativePath.toLowerCase())
    }
  }

  clearCache() {
    if (this.#currentFetch) {
      try {
        this.#currentFetch.abort()
      } catch {}
      this.#currentFetch = undefined
    }
    this.#initId++
    const files = this.getFiles()
    files.clear()
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
              await sleep(retryAfter)
              // Honor server-advised delay exactly; skip client-side backoff
              skipBackoff = true
              break
            }
          }

          if (response.status >= 500 && response.status !== 501) {
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
        if (attempt === maxAttempts - 1) {
          throw error
        }
      } finally {
        clearTimeout(timer)
        if (this.#currentFetch === controller) {
          this.#currentFetch = undefined
        }
      }

      if (skipBackoff) {
        continue
      }
      const backoff = 2 ** attempt * 200 + Math.random() * 100
      await sleep(backoff)
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
    } catch {}
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
    let index = 0
    const worker = async () => {
      while (index < toFetch.length) {
        const currentIndex = index++
        const entry = toFetch[currentIndex]!
        const url = buildUrl(entry.path)
        try {
          this.#assertAllowed(url)
          const response = await fetch(url, {
            headers: this.#noAuthHeaders,
            referrerPolicy: 'no-referrer',
          })
          if (!response.ok) continue
          const arrayBuffer = await response.arrayBuffer()
          const buffer = new Uint8Array(arrayBuffer)
          if (buffer.length > this.#maxFileBytes) continue
          const content: MemoryFileContent = this.#isBinaryBuffer(buffer)
            ? { kind: 'binary', content: buffer, encoding: 'binary' }
            : new TextDecoder('utf-8').decode(buffer)
          this.createFile(entry.path, content)
        } catch {}
      }
    }
    const workers = Array.from(
      { length: Math.min(concurrency, toFetch.length) },
      () => worker()
    )
    await Promise.all(workers)
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
    return MemoryFileSystem.prototype.readDirectorySync.call(this, path)
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
        throw new Error(`File not found: ${path}`)
      }
    }
    return MemoryFileSystem.prototype.readFileSync.call(this, targetPath)
  }

  async readFileBinary(path: string): Promise<Uint8Array> {
    await this.#ensureInitialized()
    const targetPath = this.#resolveSymlinkPath(path)
    const entry = this.getFileEntry(targetPath)
    if (!entry) {
      throw new Error(`File not found: ${path}`)
    }
    if (entry.kind === 'binary') {
      return entry.content.slice()
    }
    return new TextEncoder().encode(entry.content)
  }

  readFileSync(): string {
    throw new Error('readFileSync is not supported in GitHostFileSystem')
  }

  isFilePathGitIgnored(): boolean {
    return false
  }

  override isFilePathExcludedFromTsConfig(): boolean {
    return false
  }
}
