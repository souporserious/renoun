import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import * as utils from '../utils.js'

describe('package-preview utils safety', () => {
  const originalCwd = process.cwd()
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    exitSpy = vi
      .spyOn(process, 'exit')
      // Throw to make exit observable without terminating the test run
      .mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? ''}`)
      }) as unknown as (code?: number) => never)
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
