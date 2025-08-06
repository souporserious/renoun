import { MemoryFileSystem } from './MemoryFileSystem.js'
import type { DirectoryEntry } from './types.js'

interface GitProviderFileSystemOptions {
  /** Repository in the format "owner/repo". */
  repository: string

  /** Branch, tag, or commit reference. Defaults to 'main'. */
  ref?: string

  /** Git provider host */
  provider: 'github' | 'gitlab' | 'bitbucket'
}

/**
 * A file system backed by a remote git provider. Files are fetched lazily via
 * provider APIs and cached in-memory.
 */
export class GitProviderFileSystem extends MemoryFileSystem {
  #repository: string
  #ref: string
  #provider: 'github' | 'gitlab' | 'bitbucket'
  #directoryCache = new Map<string, DirectoryEntry[]>()

  constructor(options: GitProviderFileSystemOptions) {
    super({})
    this.#repository = options.repository
    this.#ref = options.ref ?? 'main'
    this.#provider = options.provider
  }

  async #fetchDirectory(path: string): Promise<DirectoryEntry[]> {
    let url: string

    switch (this.#provider) {
      case 'github': {
        const apiPath = path ? `/${path}` : ''
        url = `https://api.github.com/repos/${this.#repository}/contents${apiPath}?ref=${this.#ref}`
        break
      }
      case 'gitlab': {
        const repo = encodeURIComponent(this.#repository)
        const params = new URLSearchParams({ ref: this.#ref })
        if (path) params.set('path', path)
        url = `https://gitlab.com/api/v4/projects/${repo}/repository/tree?${params}`
        break
      }
      case 'bitbucket': {
        const base = `https://api.bitbucket.org/2.0/repositories/${this.#repository}/src/${this.#ref}`
        url = path ? `${base}/${path}?format=meta` : `${base}?format=meta`
        break
      }
      default:
        throw new Error(`[renoun] Unsupported git provider: ${this.#provider}`)
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(
        `[renoun] Failed to fetch directory "${path}": ${response.statusText}`
      )
    }

    let entries: DirectoryEntry[]

    switch (this.#provider) {
      case 'github': {
        const data = (await response.json()) as any[]
        entries = data.map((item) => ({
          name: item.name,
          path: path ? `./${path}/${item.name}` : `./${item.name}`,
          isDirectory: item.type === 'dir',
          isFile: item.type === 'file',
        }))
        break
      }
      case 'gitlab': {
        const data = (await response.json()) as any[]
        entries = data.map((item) => ({
          name: item.name,
          path: path ? `./${path}/${item.name}` : `./${item.name}`,
          isDirectory: item.type === 'tree',
          isFile: item.type === 'blob',
        }))
        break
      }
      case 'bitbucket': {
        const data = (await response.json()) as any
        entries = data.values.map((item: any) => ({
          name: item.path.split('/').pop(),
          path: `./${item.path}`,
          isDirectory: item.type === 'commit_directory',
          isFile: item.type === 'commit_file',
        }))
        break
      }
    }

    this.#directoryCache.set(path, entries)
    return entries
  }

  async readDirectory(path: string = '.'): Promise<DirectoryEntry[]> {
    if (!path.startsWith('.')) {
      path = `./${path}`
    }
    const normalized = path === '.' ? '' : path.replace(/^\.\//, '')
    if (this.#directoryCache.has(normalized)) {
      return this.#directoryCache.get(normalized)!
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
        url = `https://api.github.com/repos/${this.#repository}/contents/${normalized}?ref=${this.#ref}`
        break
      case 'gitlab': {
        const repo = encodeURIComponent(this.#repository)
        const filePath = encodeURIComponent(normalized)
        url = `https://gitlab.com/api/v4/projects/${repo}/repository/files/${filePath}/raw?ref=${this.#ref}`
        break
      }
      case 'bitbucket':
        url = `https://api.bitbucket.org/2.0/repositories/${this.#repository}/src/${this.#ref}/${normalized}`
        break
      default:
        throw new Error(`[renoun] Unsupported git provider: ${this.#provider}`)
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(
        `[renoun] Failed to fetch file "${path}": ${response.statusText}`
      )
    }

    switch (this.#provider) {
      case 'github': {
        const data = await response.json()
        if (typeof data.content === 'string' && data.encoding === 'base64') {
          const content = Buffer.from(data.content, 'base64').toString('utf-8')
          this.createFile(path, content)
        } else if (typeof data.download_url === 'string') {
          const res = await fetch(data.download_url)
          const content = await res.text()
          this.createFile(path, content)
        } else {
          throw new Error(`[renoun] Unsupported file response for "${path}"`)
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

  readFileSync(path: string): string {
    return super.readFileSync(path)
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
