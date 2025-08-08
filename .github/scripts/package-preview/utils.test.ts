import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import * as utils from '../utils.js'

describe('utils', () => {
  let exitSpy: any

  beforeEach(() => {
    exitSpy = vi
      .spyOn(process, 'exit')
      // Throw to make exit observable without terminating the test run
      .mockImplementation(((code?: string | number | null | undefined) => {
        throw new Error(`exit:${code ?? ''}`)
      }) as never)
  })

  afterEach(() => {
    exitSpy.mockRestore()
    vi.restoreAllMocks()
  })

  describe('assertSafePreviewBranch', () => {
    it('exits for protected branch names', () => {
      vi.spyOn(utils, 'sh').mockReturnValue('main')
      expect(() =>
        utils.assertSafePreviewBranch('main', 'owner', 'repo')
      ).toThrow(/exit:1/)
      expect(() =>
        utils.assertSafePreviewBranch('master', 'owner', 'repo')
      ).toThrow(/exit:1/)
      expect(() =>
        utils.assertSafePreviewBranch('develop', 'owner', 'repo')
      ).toThrow(/exit:1/)
    })

    it('allows a safe preview branch', () => {
      vi.spyOn(utils, 'sh').mockReturnValue('main')
      expect(() =>
        utils.assertSafePreviewBranch('package-preview', 'o', 'r')
      ).not.toThrow()
      expect(() =>
        utils.assertSafePreviewBranch('previews/feature', 'o', 'r')
      ).not.toThrow()
    })
  })

  describe('assertSafeWorkdir', () => {
    it('allows ephemeral .preview-* workdir inside repo', () => {
      const workdir = join(process.cwd(), '.preview-test')
      // Ensure dir exists for completeness; the function only checks path
      if (!existsSync(workdir)) mkdirSync(workdir)
      expect(() => utils.assertSafeWorkdir(workdir)).not.toThrow()
      rmSync(workdir, { recursive: true, force: true })
    })

    it('exits for directories outside repo root', () => {
      const outside = '/tmp/.preview-outside'
      expect(() => utils.assertSafeWorkdir(outside)).toThrow(/exit:1/)
    })

    it('exits when basename does not start with .preview-', () => {
      const bad = join(process.cwd(), 'not-preview')
      expect(() => utils.assertSafeWorkdir(bad)).toThrow(/exit:1/)
    })
  })

  describe('getGithubRemoteUrl', () => {
    it('exits without token', () => {
      expect(() => utils.getGithubRemoteUrl('o', 'r', '')).toThrow(/exit:1/)
    })

    it('returns a validated https remote for github.com', () => {
      const url = utils.getGithubRemoteUrl('o', 'r', 't')
      expect(url.startsWith('https://x-access-token:')).toBe(true)
      expect(url.includes('@github.com/o/r.git')).toBe(true)
    })
  })

  describe('safeReinitGitRepo', () => {
    it('removes existing .git and invokes git init/checkout/remote add', () => {
      const workdir = join(process.cwd(), '.preview-safe-reinit')
      if (!existsSync(workdir)) mkdirSync(workdir)
      // Create a fake .git to ensure it gets removed
      const gitDir = join(workdir, '.git')
      if (!existsSync(gitDir)) mkdirSync(gitDir)

      const cmds: string[] = []
      vi.spyOn(utils, 'runCommands').mockImplementation((c, _opts) => {
        cmds.push(...c)
      })

      utils.safeReinitGitRepo(
        workdir,
        'package-preview',
        'https://x-access-token:t@github.com/o/r.git',
        {
          owner: 'o',
          repo: 'r',
        }
      )

      expect(existsSync(gitDir)).toBe(false)
      expect(cmds).toEqual([
        'git init',
        'git checkout -b package-preview',
        'git remote add origin https://x-access-token:t@github.com/o/r.git',
      ])

      rmSync(workdir, { recursive: true, force: true })
    })
  })
})

describe('transforms', () => {
  it('parsePnpmWorkspaces', () => {
    const json = JSON.stringify([
      { name: 'a', path: '/repo/packages/a', private: false },
      { name: 'b', path: '/repo/packages/b', private: true },
      { name: '', path: '/repo/packages/empty' },
    ])
    const out = utils.parsePnpmWorkspaces(json)
    expect(out).toEqual([
      { name: 'a', dir: '/repo/packages/a', private: false },
      { name: 'b', dir: '/repo/packages/b', private: true },
    ])
  })

  it('parseTurboDryRunPackages - array form', () => {
    const json = JSON.stringify([
      { package: 'a' },
      { package: 'b' },
      { package: 'a' },
    ])
    expect(utils.parseTurboDryRunPackages(json)).toEqual(['a', 'b'])
  })

  it('parseTurboDryRunPackages - tasks form', () => {
    const json = JSON.stringify({ tasks: [{ package: 'a' }, { package: 'b' }] })
    expect(utils.parseTurboDryRunPackages(json)).toEqual(['a', 'b'])
  })

  it('parseTurboDryRunPackages - packages form', () => {
    const json = JSON.stringify({ packages: ['a', 'b', 'a'] })
    expect(utils.parseTurboDryRunPackages(json)).toEqual(['a', 'b'])
  })

  it('computePublishableTargets', () => {
    const workspaces = [
      { name: 'a', dir: '/a', private: false },
      { name: 'b', dir: '/b', private: true },
      { name: 'c', dir: '/c', private: false },
    ]
    expect(
      utils.computePublishableTargets(workspaces, ['a', 'b', 'x'])
    ).toEqual(['a'])
  })

  it('renamePackedFilenames', () => {
    const files = ['a.tgz', 'b.tgz']
    expect(utils.renamePackedFilenames(files, 'abc123')).toEqual([
      'a-abc123.tgz',
      'b-abc123.tgz',
    ])
  })

  it('buildRawBaseUrl + buildAssets + buildManifest', () => {
    const base = utils.buildRawBaseUrl('o', 'r', 'branch', 42)
    const assets = utils.buildAssets(base, ['a.tgz'])
    const manifest = utils.buildManifest({
      branch: 'branch',
      short: 'abc123',
      pr: 42,
      assets,
      targets: ['pkg-a'],
      commentId: 123,
    })
    expect(base).toMatch('/o/r/branch/42/')
    expect(assets[0].url).toMatch('/branch/42/a.tgz')
    expect(manifest.commentId).toBe(123)
  })

  it('buildPreviewCommentBody - assets', () => {
    const body = utils.buildPreviewCommentBody(utils.stickyMarker, [
      { name: 'a-abc.tgz', url: 'https://raw/a-abc.tgz' },
    ])
    expect(body).toContain('Preview packages')
    expect(body).toContain('npm install "https://raw/a-abc.tgz"')
  })

  it('buildPreviewCommentBody - empty', () => {
    const body = utils.buildPreviewCommentBody(utils.stickyMarker, [])
    expect(body).toContain('No publishable workspaces')
  })
})
