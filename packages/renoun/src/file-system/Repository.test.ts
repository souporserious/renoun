import { beforeEach, describe, it, expect } from 'vitest'
import { Repository, type RepositoryConfig } from './Repository'

describe('Repository', () => {
  describe('constructor', () => {
    it('constructs with a string "owner/repo" and defaults to GitHub provider', () => {
      const repo = new Repository('owner/repo')
      expect(
        repo.getFileUrl({
          type: 'blob',
          path: 'README.md',
          branchOrCommitHash: 'main',
        })
      ).toEqual('https://github.com/owner/repo/blob/main/README.md')
    })

    it('throws an error for invalid repository string without "/"', () => {
      expect(() => new Repository('invalidRepoString')).toThrow(
        'Invalid repository string. Must be in format "owner/repo"'
      )
    })

    it('constructs with a RepositoryConfig object', () => {
      const config: RepositoryConfig = {
        baseUrl: 'https://github.com/owner/repo',
        provider: 'github',
      }
      const repo = new Repository(config)
      expect(
        repo.getFileUrl({
          type: 'blob',
          path: 'README.md',
          branchOrCommitHash: 'main',
        })
      ).toEqual('https://github.com/owner/repo/blob/main/README.md')

      // Defaults to 'main' if branchOrCommitHash is not provided
      expect(repo.getFileUrl({ path: 'README.md' })).toEqual(
        'https://github.com/owner/repo/blob/main/README.md'
      )
    })

    it('throws an error for unsupported providers', () => {
      const config: RepositoryConfig = {
        baseUrl: 'https://example.com/owner/repo',
        provider: 'unsupported' as any,
      }
      expect(() => new Repository(config)).toThrow(
        'Unsupported provider: unsupported'
      )
    })
  })

  describe('getFileUrl', () => {
    describe('GitHub provider', () => {
      let repo: Repository

      beforeEach(() => {
        repo = new Repository('owner/repo')
      })

      it('blob URL with a branch', () => {
        const url = repo.getFileUrl({
          type: 'blob',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
        })
        expect(url).toBe('https://github.com/owner/repo/blob/main/src/index.ts')
      })

      it('edit URL', () => {
        const url = repo.getFileUrl({
          type: 'edit',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
        })
        expect(url).toBe('https://github.com/owner/repo/edit/main/src/index.ts')
      })

      it('raw URL using raw.githubusercontent.com', () => {
        const url = repo.getFileUrl({
          type: 'raw',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
        })
        expect(url).toBe(
          'https://raw.githubusercontent.com/owner/repo/main/src/index.ts'
        )
      })

      it('blame URL', () => {
        const url = repo.getFileUrl({
          type: 'blame',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
        })
        expect(url).toBe(
          'https://github.com/owner/repo/blame/main/src/index.ts'
        )
      })

      it('history URL', () => {
        const url = repo.getFileUrl({
          type: 'history',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
        })
        expect(url).toBe(
          'https://github.com/owner/repo/commits/main/src/index.ts'
        )
      })

      it('blob URL with a commit hash', () => {
        const url = repo.getFileUrl({
          type: 'blob',
          path: 'src/index.ts',
          branchOrCommitHash: 'abcdef',
        })
        expect(url).toBe(
          'https://github.com/owner/repo/blob/abcdef/src/index.ts'
        )
      })

      it('line fragment', () => {
        const url = repo.getFileUrl({
          type: 'blob',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
          line: 42,
        })
        expect(url).toBe(
          'https://github.com/owner/repo/blob/main/src/index.ts#L42'
        )
      })

      it('line fragment range', () => {
        const url = repo.getFileUrl({
          type: 'blob',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
          line: [10, 20],
        })
        expect(url).toBe(
          'https://github.com/owner/repo/blob/main/src/index.ts#L10-L20'
        )
      })
    })

    describe('GitLab provider', () => {
      let repo: Repository

      beforeEach(() => {
        const config: RepositoryConfig = {
          baseUrl: 'https://gitlab.com/owner/repo',
          provider: 'gitlab',
        }
        repo = new Repository(config)
      })

      it('blob URL', () => {
        const url = repo.getFileUrl({
          type: 'blob',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
        })
        expect(url).toBe(
          'https://gitlab.com/owner/repo/-/blob/main/src/index.ts'
        )
      })

      it('edit URL', () => {
        const url = repo.getFileUrl({
          type: 'edit',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
        })
        expect(url).toBe(
          'https://gitlab.com/owner/repo/-/edit/main/src/index.ts'
        )
      })

      it('raw URL', () => {
        const url = repo.getFileUrl({
          type: 'raw',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
        })
        expect(url).toBe(
          'https://gitlab.com/owner/repo/-/raw/main/src/index.ts'
        )
      })

      it('blame URL', () => {
        const url = repo.getFileUrl({
          type: 'blame',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
        })
        expect(url).toBe(
          'https://gitlab.com/owner/repo/-/blame/main/src/index.ts'
        )
      })

      it('history URL', () => {
        const url = repo.getFileUrl({
          type: 'history',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
        })
        expect(url).toBe(
          'https://gitlab.com/owner/repo/-/commits/main/src/index.ts'
        )
      })

      it('blob URL with a commit hash', () => {
        const url = repo.getFileUrl({
          type: 'blob',
          path: 'src/index.ts',
          branchOrCommitHash: 'abcdef',
        })
        expect(url).toBe(
          'https://gitlab.com/owner/repo/-/blob/abcdef/src/index.ts'
        )
      })

      it('line fragment', () => {
        const url = repo.getFileUrl({
          type: 'blob',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
          line: 42,
        })
        expect(url).toBe(
          'https://gitlab.com/owner/repo/-/blob/main/src/index.ts#L42'
        )
      })

      it('line fragment range', () => {
        const url = repo.getFileUrl({
          type: 'blob',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
          line: [10, 20],
        })
        expect(url).toBe(
          'https://gitlab.com/owner/repo/-/blob/main/src/index.ts#L10-20'
        )
      })
    })

    describe('Bitbucket provider', () => {
      let repo: Repository

      beforeEach(() => {
        const config: RepositoryConfig = {
          baseUrl: 'https://bitbucket.org/owner/repo',
          provider: 'bitbucket',
        }
        repo = new Repository(config)
      })

      it('blob URL', () => {
        const url = repo.getFileUrl({
          type: 'blob',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
        })
        expect(url).toBe(
          'https://bitbucket.org/owner/repo/src/main/src/index.ts'
        )
      })

      it('edit URL', () => {
        const url = repo.getFileUrl({
          type: 'edit',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
        })
        expect(url).toBe(
          'https://bitbucket.org/owner/repo/src/main/src/index.ts?mode=edit'
        )
      })

      it('raw URL', () => {
        const url = repo.getFileUrl({
          type: 'raw',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
        })
        expect(url).toBe(
          'https://bitbucket.org/owner/repo/raw/main/src/index.ts'
        )
      })

      it('blame URL', () => {
        const url = repo.getFileUrl({
          type: 'blame',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
        })
        expect(url).toBe(
          'https://bitbucket.org/owner/repo/annotate/main/src/index.ts'
        )
      })

      it('history URL', () => {
        const url = repo.getFileUrl({
          type: 'history',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
        })
        expect(url).toBe(
          'https://bitbucket.org/owner/repo/history/main/src/index.ts'
        )
      })

      it('blob URL with a commit hash', () => {
        const url = repo.getFileUrl({
          type: 'blob',
          path: 'src/index.ts',
          branchOrCommitHash: 'abcdef',
        })
        expect(url).toBe(
          'https://bitbucket.org/owner/repo/src/abcdef/src/index.ts'
        )
      })

      it('line fragment', () => {
        const url = repo.getFileUrl({
          type: 'blob',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
          line: 42,
        })
        expect(url).toBe(
          'https://bitbucket.org/owner/repo/src/main/src/index.ts#lines-42'
        )
      })

      it('line fragment range', () => {
        const url = repo.getFileUrl({
          type: 'blob',
          path: 'src/index.ts',
          branchOrCommitHash: 'main',
          line: [10, 20],
        })
        expect(url).toBe(
          'https://bitbucket.org/owner/repo/src/main/src/index.ts#lines-10:20'
        )
      })
    })
  })

  describe('createIssueUrl', () => {
    describe('GitHub', () => {
      const repo = new Repository('owner/repo')

      it('URL with just a title', () => {
        const url = repo.createIssueUrl('Bug report')
        expect(url).toMatch(
          /^https:\/\/github\.com\/owner\/repo\/issues\/new\?title=Bug\+report&body=$/
        )
      })

      it('URL with title and description', () => {
        const url = repo.createIssueUrl('Feature request', 'Add a new feature')
        const params = new URLSearchParams(url.split('?')[1])
        expect(url).toContain('https://github.com/owner/repo/issues/new?')
        expect(params.get('title')).toBe('Feature request')
        expect(params.get('body')).toBe('Add a new feature')
        expect(params.has('labels')).toBe(false)
      })

      it('URL with labels', () => {
        const url = repo.createIssueUrl('Bug report', 'Something is broken', [
          'bug',
          'urgent',
        ])
        const params = new URLSearchParams(url.split('?')[1])
        expect(params.get('title')).toBe('Bug report')
        expect(params.get('body')).toBe('Something is broken')
        expect(params.get('labels')).toBe('bug,urgent')
      })
    })

    describe('GitLab', () => {
      const repo = new Repository({
        baseUrl: 'https://gitlab.com/owner/repo',
        provider: 'gitlab',
      })

      it('URL with just a title', () => {
        const url = repo.createIssueUrl('Bug report')
        const [base, query] = url.split('?')
        expect(base).toBe('https://gitlab.com/owner/repo/-/issues/new')

        const params = new URLSearchParams(query)
        expect(params.get('issue[title]')).toBe('Bug report')
        expect(params.get('issue[description]')).toBe('')
        expect(params.getAll('issue[label_names][]')).toEqual([])
      })

      it('URL with title, description, and labels', () => {
        const url = repo.createIssueUrl(
          'Feature request',
          'Add a new feature',
          ['enhancement', 'frontend']
        )
        const [base, query] = url.split('?')
        expect(base).toBe('https://gitlab.com/owner/repo/-/issues/new')

        const params = new URLSearchParams(query)
        expect(params.get('issue[title]')).toBe('Feature request')
        expect(params.get('issue[description]')).toBe('Add a new feature')
        expect(params.getAll('issue[label_names][]')).toEqual([
          'enhancement',
          'frontend',
        ])
      })
    })

    describe('Bitbucket', () => {
      const repo = new Repository({
        baseUrl: 'https://bitbucket.org/owner/repo',
        provider: 'bitbucket',
      })

      it('URL with just a title', () => {
        const url = repo.createIssueUrl('Bug report')
        const [base, query] = url.split('?')
        expect(base).toBe('https://bitbucket.org/owner/repo/issues/new')

        const params = new URLSearchParams(query)
        expect(params.get('title')).toBe('Bug report')
        expect(params.get('content')).toBe('')
        // Bitbucket does not support labels via URL
      })

      it('URL with title and description', () => {
        const url = repo.createIssueUrl('Feature request', 'Add a new feature')
        const [base, query] = url.split('?')
        expect(base).toBe('https://bitbucket.org/owner/repo/issues/new')

        const params = new URLSearchParams(query)
        expect(params.get('title')).toBe('Feature request')
        expect(params.get('content')).toBe('Add a new feature')
      })
    })
  })
})
