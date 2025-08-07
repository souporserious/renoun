import { Semaphore } from '../utils/Semaphore.js'
import { MemoryFileSystem } from './MemoryFileSystem.js'
import type { DirectoryEntry } from './types.js'

type GitProvider = 'github' | 'gitlab' | 'bitbucket'

interface GitProviderFileSystemOptions {
  /** Repository in the format "owner/repo". */
  repository: string

  /** Branch, tag, or commit reference. Defaults to 'main'. */
  ref?: string

  /** Git provider host */
  provider: GitProvider

  /** Custom API base URL for self-hosted instances. */
  baseUrl?: string

  /** Personal access / OAuth token for private repositories or higher rate limits. */
  token?: string

  /** Request timeout in milliseconds. Defaults to 30 seconds. */
  timeoutMs?: number

  /** Time-to-live for directory cache entries in milliseconds. Unlimited when `undefined`. */
  cacheTTL?: number

  /** Maximum number of simultaneous HTTP requests. Defaults to `8`. */
  concurrency?: number
}

const repoPattern = /^[^/]+\/[^/]+$/

function normalizePath(path: string) {
  if (path === '.' || path === './') {
    return ''
  }

  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  const stack: string[] = []

  for (const part of parts) {
    if (part === '.') {
      continue
    }
    if (part === '..') {
      stack.pop()
    } else {
      stack.push(part)
    }
  }

  return stack.join('/')
}

function decodeBase64(string: string) {
  if (typeof atob === 'function') {
    const binary = atob(string)
    return new TextDecoder().decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0))
    )
  }

  return Buffer.from(string, 'base64').toString('utf-8')
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getResetDelayMs(
  response: Response,
  provider: GitProvider
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

  switch (provider) {
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

export class GitProviderFileSystem extends MemoryFileSystem {
  #repository: string
  #ref: string
  #provider: GitProvider
  #token?: string
  #timeoutMs: number
  #cacheTTL?: number
  #semaphore: Semaphore
  #apiBaseUrl: string

  #directoryCache = new Map<
    string,
    { entries: DirectoryEntry[]; cachedAt: number }
  >()
  #fileFetches = new Map<string, Promise<void>>()
  #headers: Record<string, string>

  constructor(options: GitProviderFileSystemOptions) {
    if (!repoPattern.test(options.repository)) {
      throw new Error('[renoun] Repository must be in "owner/repo" format')
    }
    if (!['github', 'gitlab', 'bitbucket'].includes(options.provider)) {
      throw new Error('[renoun] Unsupported git provider')
    }

    super({})

    this.#repository = options.repository
    this.#ref = options.ref ?? 'main'
    this.#provider = options.provider
    this.#token = options.token
    this.#timeoutMs = options.timeoutMs ?? 30_000
    this.#cacheTTL = options.cacheTTL
    this.#semaphore = new Semaphore(options.concurrency ?? 8)
    this.#apiBaseUrl = options.baseUrl ?? this.#getDefaultApiBaseUrl()
    this.#headers = this.#getHeaders()
  }

  clearCache(path?: string) {
    path
      ? this.#directoryCache.delete(normalizePath(path))
      : this.#directoryCache.clear()
  }

  #getDefaultApiBaseUrl() {
    switch (this.#provider) {
      case 'github':
        return 'https://api.github.com'
      case 'gitlab':
        return 'https://gitlab.com/api/v4'
      case 'bitbucket':
        return 'https://api.bitbucket.org/2.0'
    }
  }

  #getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}

    if (this.#provider === 'github') {
      headers['Accept'] = 'application/vnd.github.v3+json'
    }

    if (!this.#token) {
      return headers
    }

    switch (this.#provider) {
      case 'github':
        headers['Authorization'] = /^gh[pus]_|^github_pat_/.test(this.#token)
          ? `Bearer ${this.#token}`
          : `token ${this.#token}`
        break
      case 'gitlab':
        headers['PRIVATE-TOKEN'] = this.#token
        break
      case 'bitbucket':
        headers['Authorization'] = `Bearer ${this.#token}`
        break
    }

    return headers
  }

  #isRateLimited(response: Response): boolean {
    // 429 is a universal "Too Many Requests" status
    if (response.status === 429) {
      return true
    }

    // Some providers return 403 when the rate limit is exhausted.
    if (response.status !== 403) {
      return false
    }

    switch (this.#provider) {
      case 'github':
      case 'bitbucket': {
        return response.headers.get('X-RateLimit-Remaining') === '0'
      }
      case 'gitlab': {
        return response.headers.get('RateLimit-Remaining') === '0'
      }
      default:
        return false
    }
  }

  /** Fetch with retry and rate-limit handling. */
  async #fetchWithRetry(url: string, maxAttempts = 3): Promise<Response> {
    const release = await this.#semaphore.acquire()

    try {
      for (let attempt = 0; attempt < Math.max(1, maxAttempts); attempt++) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), this.#timeoutMs)

        try {
          const response = await fetch(url, {
            headers: this.#headers,
            signal: controller.signal,
          })

          if (this.#isRateLimited(response)) {
            const delay =
              Number(response.headers.get('Retry-After')) * 1_000 ||
              getResetDelayMs(response, this.#provider)

            if (delay !== undefined) {
              await sleep(delay + 100)
              continue
            }
          }

          /* Retry on 5xx except 501 (unlikely here) */
          if (response.status >= 500 && response.status !== 501) {
            if (attempt === maxAttempts - 1) {
              return response
            }
            /* fall-through to back-off */
          } else {
            return response
          }
        } catch (error) {
          if (attempt === maxAttempts - 1) {
            throw error
          }
        } finally {
          clearTimeout(timer)
        }

        /* Exponential back-off with jitter for 5xx / network failures */
        const backoff = 2 ** attempt * 200 + Math.random() * 100
        await sleep(backoff)
      }
    } finally {
      release()
    }

    throw new Error(`[renoun] Failed to fetch after ${maxAttempts} attempts`)
  }

  #encodePath(path: string) {
    return path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
  }

  async #fetchRootTree(): Promise<DirectoryEntry[]> {
    const commitResponse = await this.#fetchWithRetry(
      `${this.#apiBaseUrl}/repos/${this.#repository}/commits/${this.#ref}`
    )
    if (!commitResponse.ok) {
      throw new Error(
        `[renoun] Failed to resolve ref: ${commitResponse.status}`
      )
    }

    const { commit } = await commitResponse.json()
    const treeSha = commit.tree.sha as string

    const treeResponse = await this.#fetchWithRetry(
      `${this.#apiBaseUrl}/repos/${this.#repository}/git/trees/${treeSha}?recursive=1`
    )
    if (!treeResponse.ok) {
      throw new Error(`[renoun] Tree fetch failed: ${treeResponse.status}`)
    }

    const { tree, truncated } = await treeResponse.json()

    if (truncated) {
      return this.#fetchDirectoryContents('')
    }

    return tree.map((item: any) => ({
      name: item.path.split('/').pop(),
      path: `./${item.path}`,
      isDirectory: item.type === 'tree' || item.type === 'commit',
      isFile: item.type === 'blob',
    }))
  }

  async #fetchDirectoryContents(path: string): Promise<DirectoryEntry[]> {
    const entries: DirectoryEntry[] = []
    const pushEntries = (items: any[]) => {
      switch (this.#provider) {
        case 'github':
          entries.push(
            ...items.map((item) => ({
              name: item.name,
              path: path ? `./${path}/${item.name}` : `./${item.name}`,
              isDirectory: item.type === 'dir' || item.type === 'submodule',
              isFile: item.type === 'file',
            }))
          )
          break
        case 'gitlab':
          entries.push(
            ...items.map((item) => ({
              name: item.name,
              path: path ? `./${path}/${item.name}` : `./${item.name}`,
              isDirectory: item.type === 'tree',
              isFile: item.type === 'blob',
            }))
          )
          break
        case 'bitbucket':
          entries.push(
            ...items.map((item: any) => ({
              name: item.path.substring(item.path.lastIndexOf('/') + 1),
              path: `./${item.path}`,
              isDirectory: item.type === 'commit_directory',
              isFile: item.type === 'commit_file',
            }))
          )
          break
      }
    }

    if (this.#provider === 'github') {
      const apiPath = path ? `/${this.#encodePath(path)}` : ''
      const perPage = 100
      let page = 1

      while (true) {
        const url = `${this.#apiBaseUrl}/repos/${this.#repository}/contents${apiPath}?ref=${this.#ref}&per_page=${perPage}&page=${page}`
        const response = await this.#fetchWithRetry(url)

        if (!response.ok) {
          throw new Error(
            `[renoun] Failed to fetch directory "${path}": ${response.status} ${response.statusText}`
          )
        }

        const data = (await response.json()) as any[]
        pushEntries(data)

        if (data.length < perPage) {
          break
        }

        page++
      }
    } else if (this.#provider === 'gitlab') {
      const repo = encodeURIComponent(this.#repository)
      const perPage = 100
      let page = 1

      while (true) {
        const params = new URLSearchParams({
          ref: this.#ref,
          per_page: String(perPage),
          page: String(page),
        })

        if (path) {
          params.set('path', path)
        }

        const url = `${this.#apiBaseUrl}/projects/${repo}/repository/tree?${params}`
        const response = await this.#fetchWithRetry(url)

        if (!response.ok) {
          throw new Error(
            `[renoun] Failed to fetch directory "${path}": ${response.status} ${response.statusText}`
          )
        }

        const data = (await response.json()) as any[]
        pushEntries(data)

        const nextPage = response.headers.get('X-Next-Page')
        if (!nextPage) {
          break
        }

        page = Number(nextPage) || 0
        if (!page) {
          break
        }
      }
    } else {
      let next: string | undefined = path
        ? `${this.#apiBaseUrl}/repositories/${this.#repository}/src/${this.#ref}/${this.#encodePath(
            path
          )}?format=meta&pagelen=100`
        : `${this.#apiBaseUrl}/repositories/${this.#repository}/src/${this.#ref}?format=meta&pagelen=100`

      while (next) {
        const response = await this.#fetchWithRetry(next)
        if (!response.ok) {
          throw new Error(
            `[renoun] Failed to fetch directory "${path}": ${response.status} ${response.statusText}`
          )
        }
        const data = (await response.json()) as any
        pushEntries(data.values)
        next = data.next
      }
    }

    this.#directoryCache.set(path, { entries, cachedAt: Date.now() })
    return entries
  }

  async #fetchDirectory(path: string) {
    if (this.#provider === 'github' && path === '') {
      return this.#fetchRootTree()
    }
    return this.#fetchDirectoryContents(path)
  }

  async readDirectory(path: string = '.'): Promise<DirectoryEntry[]> {
    const key = normalizePath(path)
    const cached = this.#directoryCache.get(key)

    if (
      cached &&
      this.#cacheTTL !== 0 &&
      (!this.#cacheTTL || Date.now() - cached.cachedAt < this.#cacheTTL)
    ) {
      return cached.entries
    }

    this.#directoryCache.delete(key)
    return this.#fetchDirectory(key)
  }

  readDirectorySync(): DirectoryEntry[] {
    throw new Error(
      'readDirectorySync is not supported in GitProviderFileSystem'
    )
  }

  async #fetchFile(path: string): Promise<void> {
    const normalizedPath = normalizePath(path)
    let url: string

    switch (this.#provider) {
      case 'github':
        url = `${this.#apiBaseUrl}/repos/${this.#repository}/contents/${this.#encodePath(
          normalizedPath
        )}?ref=${this.#ref}`
        break
      case 'gitlab': {
        const repo = encodeURIComponent(this.#repository)
        const filePath = encodeURIComponent(normalizedPath)
        url = `${this.#apiBaseUrl}/projects/${repo}/repository/files/${filePath}/raw?ref=${this.#ref}`
        break
      }
      case 'bitbucket':
        url = `${this.#apiBaseUrl}/repositories/${this.#repository}/src/${this.#ref}/${this.#encodePath(
          normalizedPath
        )}`
        break
    }

    const response = await this.#fetchWithRetry(url)
    if (!response.ok) {
      throw new Error(
        `[renoun] Failed to fetch file "${path}": ${response.status} ${response.statusText}`
      )
    }

    const contentType = response.headers.get('Content-Type') || ''
    const isText =
      /^text\//.test(contentType) ||
      /application\/(json|xml|javascript|typescript)/i.test(contentType) ||
      /svg\+xml/.test(contentType)

    if (this.#provider === 'github') {
      const data = await response.json()

      /* Small files (≤1 MB) include base64 content outright */
      if (typeof data.content === 'string' && data.encoding === 'base64') {
        this.createFile(path, decodeBase64(data.content))
        return
      }

      /* For private repos download_url is null wo we fall back to blob API */
      if (typeof data.sha === 'string') {
        const blobResponse = await this.#fetchWithRetry(
          `${this.#apiBaseUrl}/repos/${this.#repository}/git/blobs/${data.sha}`
        )
        if (!blobResponse.ok) {
          throw new Error(
            `[renoun] Failed to fetch blob "${path}": ${blobResponse.status} ${blobResponse.statusText}`
          )
        }
        const { content, encoding } = await blobResponse.json()
        if (encoding === 'base64') {
          this.createFile(path, decodeBase64(content))
        } else {
          this.createFile(path, content)
        }
        return
      }

      /* Public repos can still fall back to raw. */
      if (typeof data.download_url === 'string') {
        const rawResponse = await this.#fetchWithRetry(data.download_url)
        this.createFile(path, await rawResponse.text())
        return
      }

      throw new Error('[renoun] Unable to resolve GitHub file content')
    }

    /* GitLab & Bitbucket already return raw text/binary */
    if (!isText) {
      /* Buffer the binary as Base64-encoded string */
      const arrayBuffer = await response.arrayBuffer()
      const encoded = Buffer.from(arrayBuffer).toString('base64')
      this.createFile(path, encoded)
    } else {
      this.createFile(path, await response.text())
    }
  }

  async readFile(path: string): Promise<string> {
    const key = normalizePath(path)

    if (!this.fileExistsSync(key)) {
      let fetchPromise = this.#fileFetches.get(key)

      if (!fetchPromise) {
        fetchPromise = this.#fetchFile(key).finally(() =>
          this.#fileFetches.delete(key)
        )
        this.#fileFetches.set(key, fetchPromise)
      }

      await fetchPromise
    }

    return super.readFile(key)
  }

  readFileSync(): string {
    throw new Error('readFileSync is not supported in GitProviderFileSystem')
  }

  fileExistsSync(path: string): boolean {
    return super.fileExistsSync(normalizePath(path))
  }

  isFilePathGitIgnored(): boolean {
    return false
  }

  override isFilePathExcludedFromTsConfig(): boolean {
    return false
  }
}
