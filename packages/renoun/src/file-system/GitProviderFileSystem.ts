import { MemoryFileSystem } from './MemoryFileSystem.js'
import type { DirectoryEntry } from './types.js'

interface GitProviderFileSystemOptions {
  /** Repository in the format "owner/repo". */
  repository: string

  /** Branch, tag, or commit reference. Defaults to 'main'. */
  ref?: string

  /** Git provider host */
  provider: 'github' | 'gitlab' | 'bitbucket'

  /** Personal-access / OAuth token for private repositories or higher rate limits. */
  token?: string

  /** Request timeout in milliseconds. Defaults to 30 seconds. */
  timeoutMs?: number

  /** Time-to-live for directory cache in milliseconds. Unlimited when `undefined`. */
  cacheTTL?: number
}

/**
 * A file system backed by a remote git provider. Files are fetched lazily via
 * provider APIs and cached in-memory.
 */
export class GitProviderFileSystem extends MemoryFileSystem {
  #repository: string
  #ref: string
  #provider: 'github' | 'gitlab' | 'bitbucket'
  #token?: string
  #timeoutMs: number
  #cacheTTL?: number
  #directoryCache = new Map<
    string,
    { entries: DirectoryEntry[]; cachedAt: number }
  >()

  constructor(options: GitProviderFileSystemOptions) {
    super({})
    this.#repository = options.repository
    this.#ref = options.ref ?? 'main'
    this.#provider = options.provider
    this.#token = options.token
    this.#timeoutMs = options.timeoutMs ?? 30_000
    this.#cacheTTL = options.cacheTTL
  }

  #getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}

    if (this.#provider === 'github') {
      headers['Accept'] = 'application/vnd.github.v3+json'
    }

    if (this.#token) {
      switch (this.#provider) {
        case 'github':
          headers['Authorization'] = `token ${this.#token}`
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

  async #fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs)

    try {
      return await fetch(url, {
        headers: this.#getHeaders(),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  #encodePath(path: string) {
    return path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
  }

  async #fetchDirectory(path: string): Promise<DirectoryEntry[]> {
    const entries: DirectoryEntry[] = []

    const pushEntries = (items: any[]) => {
      switch (this.#provider) {
        case 'github':
          entries.push(
            ...items.map((item) => ({
              name: item.name,
              path: path ? `./${path}/${item.name}` : `./${item.name}`,
              isDirectory: item.type === 'dir',
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
              name: item.path.split('/').pop(),
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
        const response = await this.#fetchWithTimeout(url)

        if (!response.ok) {
          throw new Error(
            `[renoun] Failed to fetch directory "${path}": ${response.status} ${response.statusText}`
          )
        }

        const data = (await response.json()) as any[]
        pushEntries(data)

        // Last page reached
        if (data.length < perPage) {
          break
        }

        page += 1
      }
    }

    if (this.#provider === 'gitlab') {
      const repo = encodeURIComponent(this.#repository)
      const perPage = 100
      let page = 1

      while (true) {
        const params = new URLSearchParams({
          ref: this.#ref,
          per_page: String(perPage),
          page: String(page),
        })
        if (path) params.set('path', path)
        const url = `https://gitlab.com/api/v4/projects/${repo}/repository/tree?${params}`
        const response = await this.#fetchWithTimeout(url)

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

        page = Number(nextPage)

        if (!page) {
          break
        }
      }
    }

    if (this.#provider === 'bitbucket') {
      let next: string | undefined = path
        ? `https://api.bitbucket.org/2.0/repositories/${this.#repository}/src/${this.#ref}/${this.#encodePath(path)}?format=meta`
        : `https://api.bitbucket.org/2.0/repositories/${this.#repository}/src/${this.#ref}?format=meta`

      while (next) {
        const response = await this.#fetchWithTimeout(next)

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
    if (!path.startsWith('.')) {
      path = `./${path}`
    }

    const normalized = path === '.' ? '' : path.replace(/^\.\//, '')
    const cached = this.#directoryCache.get(normalized)

    if (cached) {
      if (!this.#cacheTTL || Date.now() - cached.cachedAt < this.#cacheTTL) {
        return cached.entries
      }
      // Stale cache -> evict
      this.#directoryCache.delete(normalized)
    }

    return this.#fetchDirectory(normalized)
  }

  readDirectorySync(_path: string = '.'): DirectoryEntry[] {
    throw new Error(
      'readDirectorySync is not supported in GitProviderFileSystem'
    )
  }

  async #fetchFile(path: string): Promise<void> {
    const normalized = path.replace(/^\.\//, '')
    let url: string

    switch (this.#provider) {
      case 'github':
        url = `https://api.github.com/repos/${this.#repository}/contents/${this.#encodePath(normalized)}?ref=${this.#ref}`
        break
      case 'gitlab': {
        const repo = encodeURIComponent(this.#repository)
        const filePath = encodeURIComponent(normalized)
        url = `https://gitlab.com/api/v4/projects/${repo}/repository/files/${filePath}/raw?ref=${this.#ref}`
        break
      }
      case 'bitbucket':
        url = `https://api.bitbucket.org/2.0/repositories/${this.#repository}/src/${this.#ref}/${this.#encodePath(normalized)}`
        break
      default:
        throw new Error(`[renoun] Unsupported git provider: ${this.#provider}`)
    }

    const response = await this.#fetchWithTimeout(url)

    if (!response.ok) {
      throw new Error(
        `[renoun] Failed to fetch file "${path}": ${response.status} ${response.statusText}`
      )
    }

    switch (this.#provider) {
      case 'github': {
        const data = await response.json()
        if (typeof data.content === 'string' && data.encoding === 'base64') {
          const content = Buffer.from(data.content, 'base64').toString('utf-8')
          this.createFile(path, content)
        } else if (typeof data.download_url === 'string') {
          const res = await this.#fetchWithTimeout(data.download_url)
          const content = await res.text()
          this.createFile(path, content)
        } else {
          // Fallback to raw URL for large/binary files
          const rawUrl = `https://raw.githubusercontent.com/${this.#repository}/${this.#ref}/${normalized}`
          const res = await this.#fetchWithTimeout(rawUrl)
          const content = await res.text()
          this.createFile(path, content)
        }
        break
      }
      case 'gitlab': {
        const content = await response.text()
        this.createFile(path, content)
        break
      }
      case 'bitbucket': {
        const content = await response.text()
        this.createFile(path, content)
        break
      }
    }
  }

  async readFile(path: string): Promise<string> {
    if (!this.fileExistsSync(path)) {
      await this.#fetchFile(path)
    }
    return super.readFile(path)
  }

  readFileSync(_path: string): string {
    throw new Error('readFileSync is not supported in GitProviderFileSystem')
  }

  fileExistsSync(path: string): boolean {
    return super.fileExistsSync(path)
  }

  isFilePathGitIgnored(_filePath: string): boolean {
    return false
  }

  override isFilePathExcludedFromTsConfig(
    _filePath: string,
    _isDirectory = false
  ) {
    return false
  }
}
