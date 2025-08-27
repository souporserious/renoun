import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  files,
  execCalls,
  resetTestState,
  setExecResponder,
  setRepoEnv,
  setEvent,
  writeFile,
} from './test-utils'

// Mock Octokit to avoid network
vi.mock('@octokit/rest', () => {
  return {
    Octokit: class {
      rest = {
        repos: {
          get: async () => ({ data: { default_branch: 'main' } }),
        },
      }
      constructor() {}
    },
  }
})

// Reuse real utils but with our fs/child_process mocks already applied via test-utils

beforeEach(() => {
  vi.resetModules()
  resetTestState()
  setRepoEnv('o/r', 't')
  setEvent(99, { base: { sha: 'aaaaaaaa' }, head: { sha: 'bbbbbbbb' } })
  process.env.GITHUB_SHA = 'bbbbbbbb'

  // Minimal workspace structure
  // pnpm list json result
  setExecResponder((cmd) => {
    if (cmd.startsWith('pnpm -r list')) {
      return JSON.stringify([
        { name: 'pkg-a', path: `${process.cwd()}/packages/a`, private: false },
        { name: 'pkg-b', path: `${process.cwd()}/packages/b`, private: false },
        { name: 'root', path: process.cwd(), private: true },
      ])
    }
    if (cmd.startsWith('git merge-base')) return 'basehash'
    if (cmd.startsWith('git diff --name-only'))
      return [`${process.cwd()}/packages/a/src/index.ts`].join('\n')
    if (cmd.startsWith('git ls-remote')) return '' // no preview branch exists
    if (cmd.includes('pnpm pack')) {
      files.set(`${process.cwd()}/packages/a/pkg-a-1.0.0.tgz`, 'tar')
      files.set(`${process.cwd()}/packages/b/pkg-b-2.0.0.tgz`, 'tar')
      return ''
    }
    // For git commands in safeReinitGitRepo and push etc., just return empty
    return ''
  })

  // package.json files for workspaces
  writeFile(`${process.cwd()}/package.json`, JSON.stringify({ name: 'root' }))
  writeFile(
    `${process.cwd()}/packages/a/package.json`,
    JSON.stringify({
      name: 'pkg-a',
      version: '1.0.0',
      dependencies: { 'pkg-b': '^2.0.0' },
    })
  )
  writeFile(
    `${process.cwd()}/packages/b/package.json`,
    JSON.stringify({
      name: 'pkg-b',
      version: '2.0.0',
    })
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('create.js', () => {
  it('writes empty manifest and exits when no publishable targets', async () => {
    // Override diff to no changes
    setExecResponder((cmd) => {
      if (cmd.startsWith('pnpm -r list')) {
        return JSON.stringify([
          { name: 'pkg-a', path: '/repo/packages/a', private: true },
        ])
      }
      if (cmd.startsWith('git merge-base')) return 'basehash'
      if (cmd.startsWith('git diff --name-only')) return ''
      return ''
    })

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      throw new Error(`exit:${code}`)
    }) as never)

    await expect(import('./create.js')).rejects.toThrow(/exit:0/)

    const manifestPath = `${process.cwd()}/previews/manifest.json`
    expect(files.has(manifestPath)).toBe(true)
    const manifest = JSON.parse(files.get(manifestPath)!)
    expect(manifest.assets).toEqual([])
    expect(manifest.targets).toEqual([])
    exitSpy.mockRestore()
  })

  it('packs affected workspaces, pushes branch, and writes manifest', async () => {
    await import('./create.js')

    // Ensure pnpm pack was invoked for each target with env
    const packCalls = execCalls.filter((c) => c.includes('pnpm pack'))
    expect(packCalls.length).toBeGreaterThan(0)

    const manifestPath = `${process.cwd()}/previews/manifest.json`
    expect(files.has(manifestPath)).toBe(true)
    const manifest = JSON.parse(files.get(manifestPath)!)
    expect(manifest.pr).toBe(99)
    expect(Array.isArray(manifest.assets)).toBe(true)
    expect(Array.isArray(manifest.targets)).toBe(true)
  })
})
