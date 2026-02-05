import { afterEach, describe, expect, test, vi } from 'vitest'

import { GitFileSystem } from './GitFileSystem'
import { GitVirtualFileSystem } from './GitVirtualFileSystem'
import { Repository, type RepositoryConfig } from './Repository'

describe('Repository', () => {
  describe('constructor', () => {
    test('constructs with a string "owner/repo" and defaults to GitHub host', () => {
      const repo = new Repository('owner/repo')
      expect(
        repo.getFileUrl({
          type: 'source',
          path: 'README.md',
          ref: 'main',
        })
      ).toEqual('https://github.com/owner/repo/blob/main/README.md')
    })

    test('defaults to the current directory when no options are provided', () => {
      const repo = new Repository()
      expect(repo.toString()).toBe('.')
    })

    test('treats non-specifier strings as local paths', () => {
      const repo = new Repository('local-path')
      expect(repo.toString()).toBe('local-path')
      expect(() =>
        repo.getFileUrl({ type: 'source', path: 'README.md' })
      ).toThrow(/Repository remote information is not configured/)
    })

    test('constructs with a RepositoryConfig object', () => {
      const config: RepositoryConfig = {
        baseUrl: 'https://github.com/owner/repo',
        host: 'github',
      }
      const repo = new Repository(config)
      expect(
        repo.getFileUrl({
          type: 'source',
          path: 'README.md',
          ref: 'main',
        })
      ).toEqual('https://github.com/owner/repo/blob/main/README.md')

      // Defaults to 'main' if branchOrCommitHash is not provided
      expect(repo.getFileUrl({ path: 'README.md' })).toEqual(
        'https://github.com/owner/repo/blob/main/README.md'
      )
    })

    test('constructs with RepositoryOptions using a URL path', () => {
      const repo = new Repository({
        path: 'https://github.com/owner/repo',
      })
      expect(
        repo.getFileUrl({
          type: 'source',
          path: 'README.md',
          ref: 'main',
        })
      ).toEqual('https://github.com/owner/repo/blob/main/README.md')
    })

    test('throws an error for unsupported hosts', () => {
      const config: RepositoryConfig = {
        baseUrl: 'https://example.com/owner/repo',
        host: 'unsupported' as any,
      }
      expect(() => new Repository(config)).toThrow(
        'Invalid host "unsupported". Must be one of: github, gitlab, bitbucket, pierre'
      )
    })

    test('throws an error for incorrect host casing in config', () => {
      const config: RepositoryConfig = {
        baseUrl: 'https://github.com/owner/repo',
        host: 'GitHub' as any,
      }
      expect(() => new Repository(config)).toThrow(
        'Invalid host "GitHub". Must be one of: github, gitlab, bitbucket, pierre'
      )
    })

    test('defaults to clone for remote repositories and delays file system creation', () => {
      const repo = new Repository({
        path: 'https://github.com/owner/repo',
      })
      const getFileSystemSpy = vi.spyOn(repo, 'getFileSystem')

      const directory = repo.getDirectory('src/nodes')

      expect(getFileSystemSpy).not.toHaveBeenCalled()

      const fileSystem = directory.getFileSystem()
      expect(getFileSystemSpy).toHaveBeenCalledTimes(1)
      expect(fileSystem).toBeInstanceOf(GitFileSystem)
      expect(
        (fileSystem as GitFileSystem).prepareScopeDirectories
      ).toContain('src/nodes')
    })

    test('uses the virtual file system when clone is false', () => {
      const repo = new Repository({
        path: 'https://github.com/owner/repo',
        clone: false,
      })
      const fileSystem = repo.getFileSystem()
      expect(fileSystem).toBeInstanceOf(GitVirtualFileSystem)
    })
  })

  describe('getFileUrl', () => {
    describe('GitHub host', () => {
      const repo = new Repository('owner/repo')

      test('source URL with a branch', () => {
        const url = repo.getFileUrl({
          type: 'source',
          path: 'src/index.ts',
          ref: 'main',
        })
        expect(url).toBe('https://github.com/owner/repo/blob/main/src/index.ts')
      })

      test('edit URL', () => {
        const url = repo.getFileUrl({
          type: 'edit',
          path: 'src/index.ts',
          ref: 'main',
        })
        expect(url).toBe('https://github.com/owner/repo/edit/main/src/index.ts')
      })

      test('raw URL using raw.githubusercontent.com', () => {
        const url = repo.getFileUrl({
          type: 'raw',
          path: 'src/index.ts',
          ref: 'main',
        })
        expect(url).toBe(
          'https://raw.githubusercontent.com/owner/repo/main/src/index.ts'
        )
      })

      test('blame URL', () => {
        const url = repo.getFileUrl({
          type: 'blame',
          path: 'src/index.ts',
          ref: 'main',
        })
        expect(url).toBe(
          'https://github.com/owner/repo/blame/main/src/index.ts'
        )
      })

      test('history URL', () => {
        const url = repo.getFileUrl({
          type: 'history',
          path: 'src/index.ts',
          ref: 'main',
        })
        expect(url).toBe(
          'https://github.com/owner/repo/commits/main/src/index.ts'
        )
      })

      test('source URL with a commit hash', () => {
        const url = repo.getFileUrl({
          type: 'source',
          path: 'src/index.ts',
          ref: 'abcdef',
        })
        expect(url).toBe(
          'https://github.com/owner/repo/blob/abcdef/src/index.ts'
        )
      })

      test('line fragment', () => {
        const url = repo.getFileUrl({
          type: 'source',
          path: 'src/index.ts',
          ref: 'main',
          line: 42,
        })
        expect(url).toBe(
          'https://github.com/owner/repo/blob/main/src/index.ts#L42'
        )
      })

      test('line fragment range', () => {
        const url = repo.getFileUrl({
          type: 'source',
          path: 'src/index.ts',
          ref: 'main',
          line: [10, 20],
        })
        expect(url).toBe(
          'https://github.com/owner/repo/blob/main/src/index.ts#L10-L20'
        )
      })
    })

    describe('GitLab host', () => {
      const repo = new Repository({
        baseUrl: 'https://gitlab.com/owner/repo',
        host: 'gitlab',
      })

      test('source URL', () => {
        const url = repo.getFileUrl({
          type: 'source',
          path: 'src/index.ts',
          ref: 'main',
        })
        expect(url).toBe(
          'https://gitlab.com/owner/repo/-/blob/main/src/index.ts'
        )
      })

      test('edit URL', () => {
        const url = repo.getFileUrl({
          type: 'edit',
          path: 'src/index.ts',
          ref: 'main',
        })
        expect(url).toBe(
          'https://gitlab.com/owner/repo/-/edit/main/src/index.ts'
        )
      })

      test('raw URL', () => {
        const url = repo.getFileUrl({
          type: 'raw',
          path: 'src/index.ts',
          ref: 'main',
        })
        expect(url).toBe(
          'https://gitlab.com/owner/repo/-/raw/main/src/index.ts'
        )
      })

      test('blame URL', () => {
        const url = repo.getFileUrl({
          type: 'blame',
          path: 'src/index.ts',
          ref: 'main',
        })
        expect(url).toBe(
          'https://gitlab.com/owner/repo/-/blame/main/src/index.ts'
        )
      })

      test('history URL', () => {
        const url = repo.getFileUrl({
          type: 'history',
          path: 'src/index.ts',
          ref: 'main',
        })
        expect(url).toBe(
          'https://gitlab.com/owner/repo/-/commits/main/src/index.ts'
        )
      })

      test('source URL with a commit hash', () => {
        const url = repo.getFileUrl({
          type: 'source',
          path: 'src/index.ts',
          ref: 'abcdef',
        })
        expect(url).toBe(
          'https://gitlab.com/owner/repo/-/blob/abcdef/src/index.ts'
        )
      })

      test('line fragment', () => {
        const url = repo.getFileUrl({
          type: 'source',
          path: 'src/index.ts',
          ref: 'main',
          line: 42,
        })
        expect(url).toBe(
          'https://gitlab.com/owner/repo/-/blob/main/src/index.ts#L42'
        )
      })

      test('line fragment range', () => {
        const url = repo.getFileUrl({
          type: 'source',
          path: 'src/index.ts',
          ref: 'main',
          line: [10, 20],
        })
        expect(url).toBe(
          'https://gitlab.com/owner/repo/-/blob/main/src/index.ts#L10-20'
        )
      })
    })

    describe('Bitbucket host', () => {
      const repo = new Repository({
        baseUrl: 'https://bitbucket.org/owner/repo',
        host: 'bitbucket',
      })

      test('source URL', () => {
        const url = repo.getFileUrl({
          type: 'source',
          path: 'src/index.ts',
          ref: 'main',
        })
        expect(url).toBe(
          'https://bitbucket.org/owner/repo/src/main/src/index.ts'
        )
      })

      test('edit URL', () => {
        const url = repo.getFileUrl({
          type: 'edit',
          path: 'src/index.ts',
          ref: 'main',
        })
        expect(url).toBe(
          'https://bitbucket.org/owner/repo/src/main/src/index.ts?mode=edit'
        )
      })

      test('raw URL', () => {
        const url = repo.getFileUrl({
          type: 'raw',
          path: 'src/index.ts',
          ref: 'main',
        })
        expect(url).toBe(
          'https://bitbucket.org/owner/repo/raw/main/src/index.ts'
        )
      })

      test('blame URL', () => {
        const url = repo.getFileUrl({
          type: 'blame',
          path: 'src/index.ts',
          ref: 'main',
        })
        expect(url).toBe(
          'https://bitbucket.org/owner/repo/annotate/main/src/index.ts'
        )
      })

      test('history URL', () => {
        const url = repo.getFileUrl({
          type: 'history',
          path: 'src/index.ts',
          ref: 'main',
        })
        expect(url).toBe(
          'https://bitbucket.org/owner/repo/history/main/src/index.ts'
        )
      })

      test('source URL with a commit hash', () => {
        const url = repo.getFileUrl({
          type: 'source',
          path: 'src/index.ts',
          ref: 'abcdef',
        })
        expect(url).toBe(
          'https://bitbucket.org/owner/repo/src/abcdef/src/index.ts'
        )
      })

      test('line fragment', () => {
        const url = repo.getFileUrl({
          type: 'source',
          path: 'src/index.ts',
          ref: 'main',
          line: 42,
        })
        expect(url).toBe(
          'https://bitbucket.org/owner/repo/src/main/src/index.ts#lines-42'
        )
      })

      test('line fragment range', () => {
        const url = repo.getFileUrl({
          type: 'source',
          path: 'src/index.ts',
          ref: 'main',
          line: [10, 20],
        })
        expect(url).toBe(
          'https://bitbucket.org/owner/repo/src/main/src/index.ts#lines-10:20'
        )
      })
    })
  })

  describe('getIssueUrl', () => {
    describe('GitHub', () => {
      const repo = new Repository('owner/repo')

      test('URL with just a title', () => {
        const url = repo.getIssueUrl({ title: 'Bug report' })
        expect(url).toMatch(
          /^https:\/\/github\.com\/owner\/repo\/issues\/new\?title=Bug\+report&body=$/
        )
      })

      test('URL with title and description', () => {
        const url = repo.getIssueUrl({
          title: 'Feature request',
          description: 'Add a new feature',
        })
        const params = new URLSearchParams(url.split('?')[1])
        expect(url).toContain('https://github.com/owner/repo/issues/new?')
        expect(params.get('title')).toBe('Feature request')
        expect(params.get('body')).toBe('Add a new feature')
        expect(params.has('labels')).toBe(false)
      })

      test('URL with labels', () => {
        const url = repo.getIssueUrl({
          title: 'Bug report',
          description: 'Something is broken',
          labels: ['bug', 'urgent'],
        })
        const params = new URLSearchParams(url.split('?')[1])
        expect(params.get('title')).toBe('Bug report')
        expect(params.get('body')).toBe('Something is broken')
        expect(params.get('labels')).toBe('bug,urgent')
      })
    })

    describe('GitLab', () => {
      const repo = new Repository({
        baseUrl: 'https://gitlab.com/owner/repo',
        host: 'gitlab',
      })

      test('URL with just a title', () => {
        const url = repo.getIssueUrl({ title: 'Bug report' })
        const [base, query] = url.split('?')
        expect(base).toBe('https://gitlab.com/owner/repo/-/issues/new')

        const params = new URLSearchParams(query)
        expect(params.get('issue[title]')).toBe('Bug report')
        expect(params.get('issue[description]')).toBe('')
        expect(params.getAll('issue[label_names][]')).toEqual([])
      })

      test('URL with title, description, and labels', () => {
        const url = repo.getIssueUrl({
          title: 'Feature request',
          description: 'Add a new feature',
          labels: ['enhancement', 'frontend'],
        })
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
        host: 'bitbucket',
      })

      test('URL with just a title', () => {
        const url = repo.getIssueUrl({ title: 'Bug report' })
        const [base, query] = url.split('?')
        expect(base).toBe('https://bitbucket.org/owner/repo/issues/new')

        const params = new URLSearchParams(query)
        expect(params.get('title')).toBe('Bug report')
        expect(params.get('content')).toBe('')
        // Bitbucket does not support labels via URL
      })

      test('URL with title and description', () => {
        const url = repo.getIssueUrl({
          title: 'Feature request',
          description: 'Add a new feature',
        })
        const [base, query] = url.split('?')
        expect(base).toBe('https://bitbucket.org/owner/repo/issues/new')

        const params = new URLSearchParams(query)
        expect(params.get('title')).toBe('Feature request')
        expect(params.get('content')).toBe('Add a new feature')
      })
    })
  })

  describe('getDirectoryUrl', () => {
    describe('GitHub host', () => {
      const repo = new Repository('owner/repo')

      test('with a branch', () => {
        const url = repo.getDirectoryUrl({
          path: 'src',
          ref: 'main',
        })
        expect(url).toBe('https://github.com/owner/repo/tree/main/src')
      })

      test('with a commit hash', () => {
        const url = repo.getDirectoryUrl({
          path: 'src',
          ref: 'abcdef',
        })
        expect(url).toBe('https://github.com/owner/repo/tree/abcdef/src')
      })

      test('without specifying ref (defaults to main)', () => {
        const url = repo.getDirectoryUrl({ path: 'src' })
        expect(url).toBe('https://github.com/owner/repo/tree/main/src')
      })

      test('history directory URL', () => {
        const url = repo.getDirectoryUrl({
          type: 'history',
          path: 'src',
          ref: 'main',
        })
        expect(url).toBe('https://github.com/owner/repo/commits/main/src')
      })
    })

    describe('GitLab host', () => {
      const repo = new Repository({
        baseUrl: 'https://gitlab.com/owner/repo',
        host: 'gitlab',
      })

      test('with a branch', () => {
        const url = repo.getDirectoryUrl({
          path: 'src',
        })
        expect(url).toBe('https://gitlab.com/owner/repo/-/tree/main/src')
      })

      test('with a commit hash', () => {
        const url = repo.getDirectoryUrl({
          path: 'src',
          ref: 'abcdef',
        })
        expect(url).toBe('https://gitlab.com/owner/repo/-/tree/abcdef/src')
      })

      test('without specifying ref (defaults to main)', () => {
        const url = repo.getDirectoryUrl({ path: 'src' })
        expect(url).toBe('https://gitlab.com/owner/repo/-/tree/main/src')
      })

      test('history directory URL', () => {
        const url = repo.getDirectoryUrl({
          type: 'history',
          path: 'src',
          ref: 'main',
        })
        expect(url).toBe('https://gitlab.com/owner/repo/-/commits/main/src')
      })
    })

    describe('Bitbucket host', () => {
      const repo = new Repository({
        baseUrl: 'https://bitbucket.org/owner/repo',
        host: 'bitbucket',
      })

      test('with a branch', () => {
        const url = repo.getDirectoryUrl({
          type: 'source',
          path: 'src',
          ref: 'main',
        })
        expect(url).toBe('https://bitbucket.org/owner/repo/src/main/src')
      })

      test('with a commit hash', () => {
        const url = repo.getDirectoryUrl({
          path: 'src',
          ref: 'abcdef',
        })
        expect(url).toBe('https://bitbucket.org/owner/repo/src/abcdef/src')
      })

      test('without specifying ref (defaults to main)', () => {
        const url = repo.getDirectoryUrl({ path: 'src' })
        expect(url).toBe('https://bitbucket.org/owner/repo/src/main/src')
      })

      test('history directory URL', () => {
        const url = repo.getDirectoryUrl({
          type: 'history',
          path: 'src',
          ref: 'main',
        })
        expect(url).toBe('https://bitbucket.org/owner/repo/history/main/src')
      })
    })
  })

  describe('constructor shorthand parsing', () => {
    test('supports "github:owner/repo" prefix', () => {
      const repo = new Repository('github:owner/repo')
      expect(
        repo.getFileUrl({ type: 'source', path: 'README.md', ref: 'main' })
      ).toBe('https://github.com/owner/repo/blob/main/README.md')
    })

    test('throws error for incorrect host casing', () => {
      expect(() => new Repository('GitHub:owner/repo')).toThrow(
        'Invalid host "GitHub". Must be one of: github, gitlab, bitbucket, pierre'
      )
    })

    test('supports GitLab groups with host prefix', () => {
      const repo = new Repository('gitlab:group/subgroup/repo')
      expect(
        repo.getFileUrl({ type: 'source', path: 'README.md', ref: 'main' })
      ).toBe('https://gitlab.com/group/subgroup/repo/-/blob/main/README.md')
    })

    test('strips optional .git suffix', () => {
      const repo = new Repository('owner/repo.git@main')
      expect(repo.getFileUrl({ type: 'source', path: 'README.md' })).toBe(
        'https://github.com/owner/repo/blob/main/README.md'
      )
    })
  })

  describe('default ref and default path from shorthand', () => {
    test('uses defaultRef when omitted in getFileUrl', () => {
      const repo = new Repository('owner/repo@v1')
      // no ref passed here; should use @v1 from constructor
      expect(repo.getFileUrl({ type: 'source', path: 'CHANGELOG.md' })).toBe(
        'https://github.com/owner/repo/blob/v1/CHANGELOG.md'
      )
    })

    test('supports "#ref/path" and merges with provided path', () => {
      const repo = new Repository('owner/repo#deadbeef/docs')
      expect(
        repo.getFileUrl({ type: 'source', path: 'guide/getting-started.md' })
      ).toBe(
        'https://github.com/owner/repo/blob/deadbeef/docs/guide/getting-started.md'
      )
    })

    test('deduplicates slashes when joining defaultPath and path', () => {
      const repo = new Repository('github:owner/repo@main/docs/')
      expect(repo.getFileUrl({ type: 'source', path: '/README.md' })).toBe(
        'https://github.com/owner/repo/blob/main/docs/README.md'
      )
    })

    test('defaultPath also applies to directory URLs', () => {
      const repo = new Repository('github:owner/repo@main/docs')
      expect(repo.getDirectoryUrl({ path: 'api' })).toBe(
        'https://github.com/owner/repo/tree/main/docs/api'
      )
    })
  })

  describe('Pierre host', () => {
    const repo = new Repository({
      baseUrl: 'https://pierre.co/team/app',
      host: 'pierre',
    })

    test('supports "source" (files endpoint) and encodes path', () => {
      const url = repo.getFileUrl({
        type: 'source',
        path: 'docs/Hello World.md',
        ref: 'abc123',
      })
      expect(url).toBe(
        'https://pierre.co/team/app/files?path=docs%2FHello%20World.md'
      )
    })

    test('supports "history" (commit query)', () => {
      const url = repo.getFileUrl({
        type: 'history',
        path: 'docs/README.md',
        ref: 'abc123',
      })
      expect(url).toBe('https://pierre.co/team/app/history?commit=abc123')
    })

    test('throws for unsupported file URL types', () => {
      expect(() =>
        repo.getFileUrl({ type: 'edit', path: 'x', ref: 'main' })
      ).toThrow(/not supported/i)
      expect(() =>
        repo.getFileUrl({ type: 'raw', path: 'x', ref: 'main' })
      ).toThrow(/not supported/i)
      expect(() =>
        repo.getFileUrl({ type: 'blame', path: 'x', ref: 'main' })
      ).toThrow(/not supported/i)
    })

    test('directory URLs: source and history', () => {
      const src = repo.getDirectoryUrl({ path: 'docs', ref: 'main' })
      const hist = repo.getDirectoryUrl({
        type: 'history',
        path: 'docs',
        ref: 'c0ffee',
      })
      expect(src).toBe('https://pierre.co/team/app/files?path=docs')
      expect(hist).toBe('https://pierre.co/team/app/history?commit=c0ffee')
    })
  })

  describe('Bitbucket + defaultPath from shorthand', () => {
    const repo = new Repository('bitbucket:owner/repo@main/docs')

    test('file URL includes defaultPath', () => {
      const url = repo.getFileUrl({ type: 'source', path: 'guide.md' })
      expect(url).toBe(
        'https://bitbucket.org/owner/repo/src/main/docs/guide.md'
      )
    })

    test('directory URL includes defaultPath', () => {
      const url = repo.getDirectoryUrl({ path: 'api' })
      expect(url).toBe('https://bitbucket.org/owner/repo/src/main/docs/api')
    })
  })

  describe('GitHub raw URL when constructed from shorthand', () => {
    const repo = new Repository('owner/repo@abcdef')

    test('raw points to raw.githubusercontent.com with defaultRef', () => {
      const url = repo.getFileUrl({ type: 'raw', path: 'src/index.ts' })
      expect(url).toBe(
        'https://raw.githubusercontent.com/owner/repo/abcdef/src/index.ts'
      )
    })
  })

  describe('getIssueUrl guardrails', () => {
    test('Pierre issues are unsupported', () => {
      const pierre = new Repository({
        baseUrl: 'https://pierre.co/team/app',
        host: 'pierre',
      })
      expect(() => pierre.getIssueUrl({ title: 'Bug' })).toThrow(
        /Unsupported host: pierre/
      )
    })
  })

  test('repository string representation', () => {
    const repo = new Repository('owner/repo@develop')
    expect(repo.toString()).toBe('github:owner/repo@develop')
  })

  describe('getRelease', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
      globalThis.fetch = originalFetch
      vi.restoreAllMocks()
    })

    test('fetches release metadata from GitHub and caches results', async () => {
      const releasesPayload = [
        {
          tag_name: 'v1.2.3',
          html_url: 'https://github.com/owner/repo/releases/tag/v1.2.3',
          name: 'v1.2.3 Release',
          published_at: '2024-01-01T00:00:00Z',
          draft: false,
          prerelease: false,
          assets: [
            {
              name: 'cli-win.exe',
              browser_download_url:
                'https://github.com/owner/repo/releases/download/v1.2.3/cli-win.exe',
              content_type: 'application/x-msdownload',
              size: 123,
            },
            {
              name: 'cli-linux.tar.gz',
              browser_download_url:
                'https://github.com/owner/repo/releases/download/v1.2.3/cli-linux.tar.gz',
              content_type: 'application/gzip',
              size: 456,
            },
          ],
          zipball_url: 'https://github.com/owner/repo/zipball/v1.2.3',
          tarball_url: 'https://github.com/owner/repo/tarball/v1.2.3',
        },
        {
          tag_name: 'v1.2.3-rc.1',
          html_url: 'https://github.com/owner/repo/releases/tag/v1.2.3-rc.1',
          name: 'v1.2.3 RC',
          published_at: '2023-12-25T00:00:00Z',
          draft: false,
          prerelease: true,
          assets: [],
          zipball_url: 'https://github.com/owner/repo/zipball/v1.2.3-rc.1',
          tarball_url: 'https://github.com/owner/repo/tarball/v1.2.3-rc.1',
        },
      ]

      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => releasesPayload,
      })) as unknown as typeof fetch

      globalThis.fetch = mockFetch

      const repository = new Repository('owner/repo')
      const release = await repository.getRelease()

      expect(release).toEqual({
        tagName: 'v1.2.3',
        name: 'v1.2.3 Release',
        htmlUrl: 'https://github.com/owner/repo/releases/tag/v1.2.3',
        publishedAt: '2024-01-01T00:00:00Z',
        isDraft: false,
        isPrerelease: false,
        isFallback: false,
        assets: [
          {
            name: 'cli-win.exe',
            downloadUrl:
              'https://github.com/owner/repo/releases/download/v1.2.3/cli-win.exe',
            contentType: 'application/x-msdownload',
            size: 123,
          },
          {
            name: 'cli-linux.tar.gz',
            downloadUrl:
              'https://github.com/owner/repo/releases/download/v1.2.3/cli-linux.tar.gz',
            contentType: 'application/gzip',
            size: 456,
          },
        ],
        tarballUrl: 'https://github.com/owner/repo/tarball/v1.2.3',
        zipballUrl: 'https://github.com/owner/repo/zipball/v1.2.3',
      })

      await expect(repository.getReleaseUrl()).resolves.toBe(
        'https://github.com/owner/repo/releases/tag/v1.2.3'
      )
      await expect(repository.getReleaseUrl({ asset: 'linux' })).resolves.toBe(
        'https://github.com/owner/repo/releases/download/v1.2.3/cli-linux.tar.gz'
      )

      const originalNavigator = (globalThis as any).navigator
      try {
        Object.defineProperty(globalThis, 'navigator', {
          configurable: true,
          value: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' },
        })

        await expect(repository.getReleaseUrl({ asset: true })).resolves.toBe(
          'https://github.com/owner/repo/releases/download/v1.2.3/cli-linux.tar.gz'
        )
      } finally {
        if (originalNavigator === undefined) {
          delete (globalThis as any).navigator
        } else {
          Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: originalNavigator,
          })
        }
      }
      await expect(repository.getReleaseUrl({ source: 'zip' })).resolves.toBe(
        'https://github.com/owner/repo/zipball/v1.2.3'
      )
      await expect(repository.getReleaseUrl({ source: 'tar' })).resolves.toBe(
        'https://github.com/owner/repo/tarball/v1.2.3'
      )
      await expect(
        repository.getReleaseUrl({ compare: 'v1.2.2' })
      ).resolves.toBe('https://github.com/owner/repo/compare/v1.2.2...v1.2.3')

      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Cached result should avoid another fetch.
      await repository.getRelease()
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    test('resolves releases by explicit tag name and supports cache refresh', async () => {
      const releasesPayload = [
        {
          tag_name: 'v3.0.0',
          html_url: 'https://github.com/owner/repo/releases/tag/v3.0.0',
          name: 'v3.0.0 Release',
          draft: false,
          prerelease: false,
          assets: [],
        },
        {
          tag_name: 'v1.4.0',
          html_url: 'https://github.com/owner/repo/releases/tag/v1.4.0',
          name: 'v1.4.0',
          draft: false,
          prerelease: false,
          assets: [],
        },
      ]

      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => releasesPayload,
      })) as unknown as typeof fetch

      globalThis.fetch = mockFetch

      const repository = new Repository('owner/repo')

      const first = await repository.getRelease()
      expect(first.tagName).toBe('v3.0.0')
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const byTag = await repository.getRelease({
        release: 'v1.4.0',
      })
      expect(byTag.tagName).toBe('v1.4.0')
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const refreshed = await repository.getRelease({ refresh: true })
      expect(refreshed.tagName).toBe('v3.0.0')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    test('resolves releases using semver range matching', async () => {
      const releasesPayload = [
        {
          tag_name: 'v2.0.0-beta.1',
          html_url: 'https://github.com/owner/repo/releases/tag/v2.0.0-beta.1',
          name: 'v2.0.0 Beta',
          draft: false,
          prerelease: true,
          assets: [],
        },
        {
          tag_name: 'v1.10.0',
          html_url: 'https://github.com/owner/repo/releases/tag/v1.10.0',
          name: 'v1.10.0',
          draft: false,
          prerelease: false,
          assets: [],
        },
        {
          tag_name: 'v1.9.5',
          html_url: 'https://github.com/owner/repo/releases/tag/v1.9.5',
          name: 'v1.9.5',
          draft: false,
          prerelease: false,
          assets: [],
        },
      ]

      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => releasesPayload,
      })) as unknown as typeof fetch

      globalThis.fetch = mockFetch

      const repository = new Repository('owner/repo')
      const release = await repository.getRelease({
        release: '~1.10.0',
        refresh: true,
      })

      expect(release.tagName).toBe('v1.10.0')
      expect(release.isPrerelease).toBe(false)
    })

    test('selects release assets by matcher and platform heuristics', async () => {
      const releasesPayload = [
        {
          tag_name: 'v1.0.0',
          html_url: 'https://github.com/owner/repo/releases/tag/v1.0.0',
          name: 'v1.0.0',
          draft: false,
          prerelease: false,
          assets: [
            {
              name: 'tool-win.exe',
              browser_download_url:
                'https://github.com/owner/repo/releases/download/v1.0.0/tool-win.exe',
            },
            {
              name: 'tool-mac.dmg',
              browser_download_url:
                'https://github.com/owner/repo/releases/download/v1.0.0/tool-mac.dmg',
            },
            {
              name: 'tool-linux.tar.gz',
              browser_download_url:
                'https://github.com/owner/repo/releases/download/v1.0.0/tool-linux.tar.gz',
            },
          ],
        },
      ]

      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => releasesPayload,
      })) as unknown as typeof fetch

      globalThis.fetch = mockFetch

      const originalNavigator = (globalThis as any).navigator

      try {
        Object.defineProperty(globalThis, 'navigator', {
          configurable: true,
          value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5)' },
        })

        const repository = new Repository('owner/repo')

        await expect(
          repository.getReleaseUrl({ asset: /linux/, refresh: true })
        ).resolves.toBe(
          'https://github.com/owner/repo/releases/download/v1.0.0/tool-linux.tar.gz'
        )

        await expect(repository.getReleaseUrl({ asset: true })).resolves.toBe(
          'https://github.com/owner/repo/releases/download/v1.0.0/tool-mac.dmg'
        )
      } finally {
        if (originalNavigator === undefined) {
          delete (globalThis as any).navigator
        } else {
          Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: originalNavigator,
          })
        }
      }
    })

    test('throws a descriptive error when asset selection fails', async () => {
      const releasesPayload = [
        {
          tag_name: 'v1.0.0',
          html_url: 'https://github.com/owner/repo/releases/tag/v1.0.0',
          name: 'v1.0.0',
          draft: false,
          prerelease: false,
          assets: [
            {
              name: 'tool-win.exe',
              browser_download_url:
                'https://github.com/owner/repo/releases/download/v1.0.0/tool-win.exe',
            },
          ],
        },
      ]

      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => releasesPayload,
      })) as unknown as typeof fetch

      globalThis.fetch = mockFetch

      const repository = new Repository('owner/repo')

      await expect(
        repository.getReleaseUrl({ asset: 'mac', refresh: true })
      ).rejects.toThrow('No release asset matched the provided criteria')
    })

    test('supports next release specifier including prereleases', async () => {
      const releasesPayload = [
        {
          tag_name: 'v2.0.0-beta.1',
          html_url: 'https://github.com/owner/repo/releases/tag/v2.0.0-beta.1',
          name: 'v2.0.0 Beta',
          published_at: '2024-02-01T00:00:00Z',
          draft: false,
          prerelease: true,
          assets: [],
        },
        {
          tag_name: 'v1.9.0',
          html_url: 'https://github.com/owner/repo/releases/tag/v1.9.0',
          name: 'v1.9.0',
          published_at: '2023-11-01T00:00:00Z',
          draft: false,
          prerelease: false,
          assets: [],
        },
      ]

      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => releasesPayload,
      })) as unknown as typeof fetch

      globalThis.fetch = mockFetch

      const repository = new Repository('owner/repo')
      const release = await repository.getRelease({
        release: 'next',
        refresh: true,
      })

      expect(release.tagName).toBe('v2.0.0-beta.1')
      expect(release.isPrerelease).toBe(true)
    })

    test('falls back to releases overview when no releases can be resolved', async () => {
      const mockFetch = vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({}),
      })) as unknown as typeof fetch

      globalThis.fetch = mockFetch

      const repository = new Repository('owner/repo')
      const release = await repository.getRelease({ refresh: true })

      expect(release.htmlUrl).toBe('https://github.com/owner/repo/releases')
      expect(release.isFallback).toBe(true)
      expect(release.assets).toEqual([])
    })
  })
})
