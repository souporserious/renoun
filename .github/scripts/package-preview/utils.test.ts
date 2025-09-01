import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from 'vitest'

// In-memory filesystem and command capture for tests
let fs = new Set<string>()
let gitCommands: string[] = []

vi.mock('node:fs', () => {
  return {
    existsSync: (p: any) => fs.has(String(p)),
    mkdirSync: (p: any) => {
      fs.add(String(p))
    },
    rmSync: (p: any) => {
      const base = String(p)
      for (const entry of Array.from(fs)) {
        if (entry === base || entry.startsWith(base + '/')) fs.delete(entry)
      }
    },
  }
})

vi.mock('node:child_process', () => {
  return {
    execSync: (cmd: any) => {
      if (typeof cmd === 'string' && cmd.startsWith('git ')) {
        gitCommands.push(cmd)
      }
      return '' as any
    },
  }
})

import { join } from 'node:path'
import { existsSync, mkdirSync, rmSync } from 'node:fs'

let utils: typeof import('./utils.js')
beforeAll(async () => {
  utils = await import('./utils.js')
})

describe('utils', () => {
  let exitSpy: any

  beforeEach(() => {
    fs = new Set<string>()
    gitCommands = []
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
      expect(() => utils.assertSafePreviewBranch('main', 'main')).toThrow(
        /exit:1/
      )
      expect(() => utils.assertSafePreviewBranch('master', 'main')).toThrow(
        /exit:1/
      )
      expect(() => utils.assertSafePreviewBranch('develop', 'main')).toThrow(
        /exit:1/
      )
    })

    it('allows a safe preview branch', () => {
      expect(() =>
        utils.assertSafePreviewBranch('package-preview', 'main')
      ).not.toThrow()
      expect(() =>
        utils.assertSafePreviewBranch('previews/feature', 'main')
      ).not.toThrow()
    })
  })

  describe('assertSafeWorkdir', () => {
    it('allows ephemeral .preview-* workdir inside repo', () => {
      const workdir = join(process.cwd(), '.preview-test')
      mkdirSync(workdir)
      expect(() => utils.assertSafeWorkdir(workdir)).not.toThrow()
      rmSync(workdir)
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
      mkdirSync(workdir)
      // Create a fake .git to ensure it gets removed
      const gitDir = join(workdir, '.git')
      mkdirSync(gitDir)

      utils.safeReinitGitRepo(
        workdir,
        'package-preview',
        'https://x-access-token:t@github.com/o/r.git',
        {
          owner: 'o',
          repo: 'r',
          defaultBranch: 'main',
        }
      )

      // After re-init with mocked exec, .git remains removed
      expect(existsSync(gitDir)).toBe(false)

      // Ensure expected git commands were invoked
      expect(gitCommands).toEqual([
        'git init',
        'git checkout -b package-preview',
        'git remote add origin https://x-access-token:t@github.com/o/r.git',
      ])

      rmSync(workdir)
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
      { name: 'a', path: '/repo/packages/a', private: false },
      { name: 'b', path: '/repo/packages/b', private: true },
    ])
  })

  it('computePublishableTargets', () => {
    const workspaces = [
      { name: 'a', path: '/a', private: false },
      { name: 'b', path: '/b', private: true },
      { name: 'c', path: '/c', private: false },
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

describe('git + depgraph selection', () => {
  it('selectTouchedWorkspaces matches files inside workspace paths', () => {
    const workspaces = [
      { name: 'a', path: '/repo/packages/a', private: false },
      { name: 'b', path: '/repo/packages/b', private: false },
    ]
    const files = ['/repo/packages/a/src/index.ts', '/repo/README.md']
    const out = utils.selectTouchedWorkspaces(workspaces, files)
    expect(out).toEqual(['a'])
  })

  it('expandWithDependents walks reverse graph', () => {
    const reverse = new Map([
      ['a', new Set(['b'])],
      ['b', new Set(['c'])],
    ])
    expect(utils.expandWithDependents(['a'], reverse)).toEqual(['a', 'b', 'c'])
  })
})
