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

  /** Personal-access / OAuth token for private repositories or higher rate limits. */
  token?: string

  /** Request timeout in milliseconds. Defaults to 30 seconds. */
  timeoutMs?: number

  /** Time-to-live for directory cache in milliseconds. Unlimited when `undefined`. */
  cacheTTL?: number
}

const binaryExtensions = Object.freeze(
  new Set([
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'svg',
    'ico',
    'pdf',
    'zip',
    'rar',
    '7z',
    'gz',
    'tar',
    'mp3',
    'mp4',
    'mov',
    'avi',
    'mkv',
    'wasm',
  ])
)

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
  if (typeof Buffer === 'undefined') {
    return new TextDecoder().decode(
      Uint8Array.from(atob(string), (character) => character.charCodeAt(0))
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
    // Numeric seconds to ms
    const seconds = Number(retryAfter)
    if (!Number.isNaN(seconds)) {
      return seconds * 1_000 + 100
    }
    // HTTP-date to absolute
    const date = Date.parse(retryAfter)
    if (!Number.isNaN(date)) {
      return Math.max(date - Date.now(), 0) + 100
    }
  }

  const now = Date.now()
  let reset: number | undefined

  switch (provider) {
    case 'github': {
      reset = Number(response.headers.get('X-RateLimit-Reset'))
      break
    }
    case 'gitlab': {
      reset = Number(response.headers.get('RateLimit-Reset'))
      break
    }
    case 'bitbucket': {
      reset = Number(response.headers.get('X-RateLimit-Reset'))
      break
    }
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
  #directoryCache = new Map<
    string,
    { entries: DirectoryEntry[]; cachedAt: number }
  >()
  #fileFetches = new Map<string, Promise<void>>() // in-flight dedupe

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
  }

  clearCache(path?: string) {
    path
      ? this.#directoryCache.delete(normalizePath(path))
      : this.#directoryCache.clear()
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

  /** Fetch with retry + provider-aware rate-limit handling. */
  async #fetchWithRetry(url: string, attempts = 3): Promise<Response> {
    attempts = Math.max(1, attempts)

    for (let index = 0; index < attempts; index++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.#timeoutMs)

      try {
        const response = await fetch(url, {
          headers: this.#getHeaders(),
          signal: controller.signal,
        })
        const isRateLimited =
          response.status === 429 ||
          (this.#provider === 'github' &&
            response.status === 403 &&
            response.headers.get('X-RateLimit-Remaining') === '0')

        if (isRateLimited) {
          const delay = getResetDelayMs(response, this.#provider)
          if (delay !== undefined) {
            await sleep(delay)
            continue
          }
        }

        // Success or non-retryable client error
        if (
          response.ok ||
          (response.status >= 400 &&
            response.status < 500 &&
            response.status !== 429)
        ) {
          return response
        }

        // Retryable server error
        if (index === attempts - 1) {
          return response
        }
      } catch (error) {
        if (index === attempts - 1) {
          throw error
        }
      } finally {
        clearTimeout(timer)
      }

      // Exponential back-off with jitter for generic 5xx / network failures
      const backoff = 2 ** index * 200 + Math.random() * 100
      await sleep(backoff)
    }

    throw new Error(`[renoun] Failed to fetch after ${attempts} attempts`)
  }

  #encodePath(path: string) {
    return path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
  }

  async #fetchRootTree(): Promise<DirectoryEntry[]> {
    const commitResponse = await this.#fetchWithRetry(
      `https://api.github.com/repos/${this.#repository}/commits/${this.#ref}`
    )

    if (!commitResponse.ok) {
      throw new Error(
        `[renoun] Failed to resolve ref: ${commitResponse.status}`
      )
    }

    const { commit } = await commitResponse.json()
    const treeSha = commit.tree.sha as string

    const treeResponse = await this.#fetchWithRetry(
      `https://api.github.com/repos/${this.#repository}/git/trees/${treeSha}?recursive=1`
    )
    if (!treeResponse.ok) {
      throw new Error(`[renoun] Tree fetch failed: ${treeResponse.status}`)
    }
    const { tree, truncated } = await treeResponse.json()

    if (truncated) {
      return this.#fetchDirectory('')
    }

    return tree.map((item: any) => ({
      name: item.path.split('/').pop(),
      path: `./${item.path}`,
      isDirectory: item.type === 'tree' || item.type === 'commit',
      isFile: item.type === 'blob',
    }))
  }

  async #fetchDirectory(path: string): Promise<DirectoryEntry[]> {
    if (this.#provider === 'github' && path === '') {
      return this.#fetchRootTree()
    }

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
        const url = `https://api.github.com/repos/${this.#repository}/contents${apiPath}?ref=${this.#ref}&per_page=${perPage}&page=${page}`
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

        const url = `https://gitlab.com/api/v4/projects/${repo}/repository/tree?${params}`
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
        ? `https://api.bitbucket.org/2.0/repositories/${this.#repository}/src/${this.#ref}/${this.#encodePath(
            path
          )}?format=meta&pagelen=100`
        : `https://api.bitbucket.org/2.0/repositories/${this.#repository}/src/${this.#ref}?format=meta&pagelen=100`

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
    const extension = normalizedPath.split('.').pop()?.toLowerCase()

    if (extension && binaryExtensions.has(extension)) {
      throw new Error(`[renoun] Binary file support not implemented: ${path}`)
    }

    let url: string

    switch (this.#provider) {
      case 'github':
        url = `https://api.github.com/repos/${this.#repository}/contents/${this.#encodePath(
          normalizedPath
        )}?ref=${this.#ref}`
        break
      case 'gitlab': {
        const repo = encodeURIComponent(this.#repository)
        const filePath = encodeURIComponent(normalizedPath)
        url = `https://gitlab.com/api/v4/projects/${repo}/repository/files/${filePath}/raw?ref=${this.#ref}`
        break
      }
      case 'bitbucket':
        url = `https://api.bitbucket.org/2.0/repositories/${this.#repository}/src/${this.#ref}/${this.#encodePath(
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

    if (this.#provider === 'github') {
      const data = await response.json()
      if (typeof data.content === 'string' && data.encoding === 'base64') {
        this.createFile(path, decodeBase64(data.content))
      } else if (typeof data.download_url === 'string') {
        const rawResponse = await this.#fetchWithRetry(data.download_url)
        this.createFile(path, await rawResponse.text())
      } else {
        const rawUrl = `https://raw.githubusercontent.com/${this.#repository}/${this.#ref}/${normalizedPath}`
        const rawResponse = await this.#fetchWithRetry(rawUrl)
        this.createFile(path, await rawResponse.text())
      }
    } else {
      this.createFile(path, await response.text())
    }
  }

  async readFile(path: string): Promise<string> {
    const key = normalizePath(path)
    if (!this.fileExistsSync(key)) {
      let fetchPromise = this.#fileFetches.get(key)
      if (!fetchPromise) {
        fetchPromise = this.#fetchFile(path).finally(() =>
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
