import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()

  return {
    ...actual,
    spawnSync: vi.fn(actual.spawnSync),
  }
})

import * as childProcessModule from 'node:child_process'

import { GitFileSystem, ensureCacheCloneSync } from './GitFileSystem'

const GIT_ENV = {
  LC_ALL: 'C',
  GIT_AUTHOR_NAME: 'Test User',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test User',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_ASKPASS: 'echo',
  SSH_ASKPASS: 'echo',
} as const

function git(cwd: string, args: string[]) {
  const result = childProcessModule.spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      ...GIT_ENV,
    },
  })

  if (result.status !== 0) {
    throw new Error(`Git error: ${result.stderr} (cmd: git ${args.join(' ')})`)
  }

  return result.stdout.trim()
}

function initRepo(cwd: string) {
  git(cwd, ['-c', 'init.defaultBranch=main', 'init'])
  git(cwd, ['config', 'core.sparseCheckout', 'false'])
  git(cwd, ['config', '--worktree', 'core.sparseCheckout', 'false'])
  git(cwd, ['config', '--worktree', 'core.sparseCheckoutCone', 'false'])
  git(cwd, ['sparse-checkout', 'disable'])
}

function commitFile(
  repo: string,
  filename: string,
  content: string,
  message: string
) {
  const path = join(repo, filename)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  git(repo, ['add', '--sparse', filename])
  git(repo, ['commit', '--no-gpg-sign', '-m', message])
}

function countGitCommandCalls(
  commandName: string,
  predicate?: (args: string[]) => boolean
) {
  const spawnSyncMock = vi.mocked(childProcessModule.spawnSync)

  return spawnSyncMock.mock.calls.filter(([command, args]) => {
    if (command !== 'git' || !Array.isArray(args) || args[0] !== commandName) {
      return false
    }

    return predicate ? predicate(args) : true
  }).length
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('GitFileSystem sync cache clone behavior', () => {
  it.sequential(
    'does not force a second sync remote freshness check on repeated sync probes',
    () => {
      const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
      const cacheDirectory = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
      const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
      const bareRepo = join(bareRoot, 'repo.git')
      initRepo(repoRoot)

      try {
        commitFile(repoRoot, 'src/index.ts', `export const value = 1`, 'v1')
        git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
        const fileUrl = pathToFileURL(bareRepo).toString()

        git(repoRoot, ['remote', 'add', 'origin', fileUrl])
        git(repoRoot, ['push', '-u', 'origin', 'main'])

        const cachedRepo = ensureCacheCloneSync({
          spec: fileUrl,
          cacheDirectory,
        })

        using store = new GitFileSystem({
          repository: cachedRepo,
          cacheDirectory,
          ref: 'main',
          autoFetch: true,
        })

        vi.mocked(childProcessModule.spawnSync).mockClear()

        expect(store.fileExistsSync('src/index.ts')).toBe(true)
        const firstLsRemoteCount = countGitCommandCalls(
          'ls-remote',
          (args) => args[1] === 'origin'
        )

        expect(store.fileExistsSync('src/index.ts')).toBe(true)
        const secondLsRemoteCount = countGitCommandCalls(
          'ls-remote',
          (args) => args[1] === 'origin'
        )

        expect(firstLsRemoteCount).toBeGreaterThan(0)
        expect(secondLsRemoteCount).toBe(firstLsRemoteCount)
      } finally {
        rmSync(repoRoot, { recursive: true, force: true })
        rmSync(cacheDirectory, { recursive: true, force: true })
        rmSync(bareRoot, { recursive: true, force: true })
      }
    }
  )

  it.sequential('reuses cached git-ignore results for worktree paths', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
    initRepo(repoRoot)

    try {
      commitFile(repoRoot, 'src/index.ts', `export const value = 1`, 'v1')

      using store = new GitFileSystem({
        repository: repoRoot,
      })

      vi.mocked(childProcessModule.spawnSync).mockClear()

      expect(store.isFilePathGitIgnored('src/index.ts')).toBe(false)
      const firstCheckIgnoreCount = countGitCommandCalls('check-ignore')

      expect(store.isFilePathGitIgnored('src/index.ts')).toBe(false)
      const secondCheckIgnoreCount = countGitCommandCalls('check-ignore')

      expect(firstCheckIgnoreCount).toBe(1)
      expect(secondCheckIgnoreCount).toBe(firstCheckIgnoreCount)
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })

  it.sequential('skips git-ignore checks for object-backed cache-clone paths', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
    const cacheDirectory = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
    const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
    const bareRepo = join(bareRoot, 'repo.git')
    initRepo(repoRoot)

    try {
      commitFile(repoRoot, 'src/index.ts', `export const value = 1`, 'v1')
      git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
      const fileUrl = pathToFileURL(bareRepo).toString()

      git(repoRoot, ['remote', 'add', 'origin', fileUrl])
      git(repoRoot, ['push', '-u', 'origin', 'main'])

      const cachedRepo = ensureCacheCloneSync({
        spec: fileUrl,
        cacheDirectory,
      })

      using store = new GitFileSystem({
        repository: cachedRepo,
        cacheDirectory,
        ref: 'main',
        autoFetch: true,
      })

      vi.mocked(childProcessModule.spawnSync).mockClear()

      expect(store.isFilePathGitIgnored('src/index.ts')).toBe(false)
      expect(countGitCommandCalls('check-ignore')).toBe(0)
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
      rmSync(cacheDirectory, { recursive: true, force: true })
      rmSync(bareRoot, { recursive: true, force: true })
    }
  })
})
