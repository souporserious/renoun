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

export class Repository {
  #baseUrl: string
  #provider: GitProviderType
  #owner?: string
  #repo?: string

  constructor(repository: RepositoryConfig | string) {
    if (typeof repository === 'string') {
      const [owner, repo] = repository.split('/')

      if (!owner || !repo) {
        throw new Error(
          'Invalid repository string. Must be in format "owner/repo"'
        )
      }

      this.#baseUrl = `https://github.com/${owner}/${repo}`
      this.#provider = 'github'
      this.#owner = owner
      this.#repo = repo
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

      this.#provider = provider.toLowerCase() as GitProviderType

      if (this.#provider === 'github') {
        const match = this.#baseUrl.match(/github\.com\/([^/]+)\/([^/]+)$/)
        if (match) {
          this.#owner = match.at(1)
          this.#repo = match.at(2)
        }
      } else if (this.#provider === 'gitlab') {
        const match = this.#baseUrl.match(/gitlab\.com\/([^/]+)\/([^/]+)$/)
        if (match) {
          this.#owner = match.at(1)
          this.#repo = match.at(2)
        }
      } else if (this.#provider === 'bitbucket') {
        const match = this.#baseUrl.match(/bitbucket\.org\/([^/]+)\/([^/]+)$/)
        if (match) {
          this.#owner = match.at(1)
          this.#repo = match.at(2)
        }
      } else if (this.#provider === 'pierre') {
        const match = this.#baseUrl.match(/pierre\.co\/([^/]+)\/([^/]+)$/)
        if (match) {
          this.#owner = match.at(1)
          this.#repo = match.at(2)
        }
      }
    }

    if (!['github', 'gitlab', 'bitbucket', 'pierre'].includes(this.#provider)) {
      throw new Error(`Unsupported provider: ${this.#provider}`)
    }
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
        labels.forEach((label) => {
          params.append('issue[label_names][]', label)
        })

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
    const { type = 'source', path, line, ref: ref = 'main' } = options

    switch (this.#provider) {
      case 'github':
        return this.#getGitHubUrl(type, ref, path, line)
      case 'gitlab':
        return this.#getGitLabUrl(type, ref, path, line)
      case 'bitbucket':
        return this.#getBitbucketUrl(type, ref, path, line)
      case 'pierre':
        return this.#getPierreUrl(type, ref, path)
      default:
        throw new Error(`Unsupported provider: ${this.#provider}`)
    }
  }

  /** Constructs a URL for a directory in the repository. */
  getDirectoryUrl(options: GetDirectoryUrlOptions): string {
    const { type = 'source', path, ref: ref = 'main' } = options

    switch (this.#provider) {
      case 'github':
        return this.#getGitHubDirectoryUrl(type, ref, path)
      case 'gitlab':
        return this.#getGitLabDirectoryUrl(type, ref, path)
      case 'bitbucket':
        return this.#getBitbucketDirectoryUrl(type, ref, path)
      case 'pierre':
        return this.#getPierreDirectoryUrl(type, ref, path)
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
      case 'raw':
        if (this.#owner && this.#repo) {
          return `https://raw.githubusercontent.com/${this.#owner}/${this.#repo}/${ref}/${path}`
        }
        throw new Error('Cannot generate raw URL without owner/repo')
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
      case 'history':
        return `${this.#baseUrl}/history?commit=${ref}`
      case 'source':
      default:
        return `${this.#baseUrl}/files?path=${encodeURIComponent(path)}`
    }
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
    if (!line) return ''

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
