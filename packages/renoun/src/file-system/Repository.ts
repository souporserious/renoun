export type GitProviderType = 'github' | 'gitlab' | 'bitbucket'

export interface RepositoryConfig {
  /** The base URL of the repository. */
  baseUrl: string

  /** The type of Git provider. */
  provider: GitProviderType
}

export interface GetFileUrlOptions {
  /** The path to the file within the repository. */
  path: string

  /** The file url type. */
  type?: 'blob' | 'edit' | 'raw' | 'blame' | 'history'

  /**
   * Branch or commit hash.
   * - A branch name (defaults to 'main')
   * - Or a commit hash (e.g. 'abcdef1234...')
   */
  branchOrCommitHash?: string

  /**
   * Line or range of lines to link to.
   * - A single line number: `line: 42`
   * - A range: `[startLine, endLine]` e.g. `[42, 50]`
   */
  line?: number | [number, number]
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

      this.#baseUrl = baseUrl.replace(/\/+$/, '') // Trim trailing slashes
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
      }
    }

    if (!['github', 'gitlab', 'bitbucket'].includes(this.#provider)) {
      throw new Error(`Unsupported provider: ${this.#provider}`)
    }
  }

  /** Creates a new issue URL for the repository. */
  createIssueUrl(
    title: string,
    description: string = '',
    labels: string[] = []
  ): string {
    if (!this.#owner || !this.#repo) {
      throw new Error('Cannot determine owner/repo for this repository.')
    }

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
    const { type = 'blob', path, line, branchOrCommitHash = 'main' } = options

    switch (this.#provider) {
      case 'github':
        return this.#getGitHubUrl(type, branchOrCommitHash, path, line)
      case 'gitlab':
        return this.#getGitLabUrl(type, branchOrCommitHash, path, line)
      case 'bitbucket':
        return this.#getBitbucketUrl(type, branchOrCommitHash, path, line)
      default:
        throw new Error(`Unsupported provider: ${this.#provider}`)
    }
  }

  #getGitHubUrl(
    type: string,
    branchOrCommitHash: string,
    path: string,
    line?: number | [number, number]
  ): string {
    const lineFragment = this.#formatLineFragment(line, {
      rangeDelimiter: '-L',
    })

    switch (type) {
      case 'edit':
        return `${this.#baseUrl}/edit/${branchOrCommitHash}/${path}`
      case 'raw':
        // If we have owner/repo, use raw.githubusercontent.com directly
        if (this.#owner && this.#repo) {
          return `https://raw.githubusercontent.com/${this.#owner}/${this.#repo}/${branchOrCommitHash}/${path}`
        }
        throw new Error('[renoun] Cannot generate raw URL without owner/repo')
      case 'blame':
        return `${this.#baseUrl}/blame/${branchOrCommitHash}/${path}${lineFragment}`
      case 'history':
        return `${this.#baseUrl}/commits/${branchOrCommitHash}/${path}`
      case 'blob':
      default:
        return `${this.#baseUrl}/blob/${branchOrCommitHash}/${path}${lineFragment}`
    }
  }

  #getGitLabUrl(
    type: string,
    branchOrCommitHash: string,
    path: string,
    line?: number | [number, number]
  ): string {
    const lineFragment = this.#formatLineFragment(line, {
      rangeDelimiter: '-',
    })

    switch (type) {
      case 'edit':
        return `${this.#baseUrl}/-/edit/${branchOrCommitHash}/${path}`
      case 'raw':
        return `${this.#baseUrl}/-/raw/${branchOrCommitHash}/${path}`
      case 'blame':
        return `${this.#baseUrl}/-/blame/${branchOrCommitHash}/${path}${lineFragment}`
      case 'history':
        return `${this.#baseUrl}/-/commits/${branchOrCommitHash}/${path}`
      case 'blob':
      default:
        return `${this.#baseUrl}/-/blob/${branchOrCommitHash}/${path}${lineFragment}`
    }
  }

  #getBitbucketUrl(
    type: string,
    branchOrCommitHash: string,
    path: string,
    line?: number | [number, number]
  ): string {
    const lineFragment = this.#formatLineFragment(line)

    switch (type) {
      case 'edit':
        return `${this.#baseUrl}/src/${branchOrCommitHash}/${path}?mode=edit`
      case 'raw':
        return `${this.#baseUrl}/raw/${branchOrCommitHash}/${path}`
      case 'blame':
        return `${this.#baseUrl}/annotate/${branchOrCommitHash}/${path}${lineFragment}`
      case 'history':
        return `${this.#baseUrl}/history/${branchOrCommitHash}/${path}`
      case 'blob':
      default:
        return `${this.#baseUrl}/src/${branchOrCommitHash}/${path}${lineFragment}`
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
