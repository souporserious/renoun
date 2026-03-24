import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { describe, expect, test, vi } from 'vitest'

import { Cache } from './Cache.ts'
import { Directory } from './entries.ts'
import { GitFileSystem } from './GitFileSystem.ts'
import { Repository } from './Repository.ts'
import * as spawnModule from './spawn.ts'
import type { ExportHistoryGenerator, ExportHistoryReport } from './types.ts'

const INTEGRATION_TIMEOUT_MS = 20_000

type SerializableNavigationInput = {
  entry: { name: string; depth: number; getPathname: () => string }
  children?: SerializableNavigationInput[]
}

type SerializedNavigationEntry = {
  name: string
  depth: number
  path: string
  children?: SerializedNavigationEntry[]
}

async function drain(
  gen: ExportHistoryGenerator
): Promise<ExportHistoryReport> {
  let result = await gen.next()
  while (!result.done) result = await gen.next()
  return result.value
}

function serializeNavigationEntries(
  entries: SerializableNavigationInput[]
): SerializedNavigationEntry[] {
  return entries.map(({ entry, children }) => ({
    name: entry.name,
    depth: entry.depth,
    path: entry.getPathname(),
    ...(children ? { children: serializeNavigationEntries(children) } : {}),
  }))
}

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
  const result = spawnSync('git', args, {
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

function commitFiles(
  repo: string,
  files: Array<{ filename: string; content: string }>,
  message: string
) {
  for (const file of files) {
    const path = join(repo, file.filename)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, file.content)
  }

  git(repo, ['add', '--sparse', ...files.map((file) => file.filename)])
  git(repo, ['commit', '--no-gpg-sign', '-m', message])
}

function closeGitDirectory(directory: Directory | undefined) {
  if (!directory) {
    return
  }

  const fileSystem = directory.getFileSystem()
  if (fileSystem instanceof GitFileSystem) {
    fileSystem.close()
  }
}

function createPublicRemoteRepository(options: {
  fileUrl: string
  cacheRoot: string
  ref: string
}) {
  const cache = new Cache({ outputDirectory: options.cacheRoot })
  const repository = new Repository({
    path: 'https://github.com/owner/repo',
    ref: options.ref,
    cache,
  })
  const fileSystem = new GitFileSystem({
    repository: options.fileUrl,
    ref: options.ref,
    cache,
  })

  vi.spyOn(repository, 'getFileSystem').mockImplementation(() => fileSystem)

  return {
    repository,
    fileSystem,
  }
}

describe('Repository public remote integration', () => {
  test(
    'analyzes remote directory exports and history through public APIs',
    async () => {
      const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
      const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
      const cacheRoot = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
      const bareRepo = join(bareRoot, 'repo.git')
      let directory: Directory | undefined
      let fileSystem: GitFileSystem | undefined

      initRepo(repoRoot)
      git(repoRoot, ['branch', '-m', 'dev'])

      try {
        commitFiles(
          repoRoot,
          [
            {
              filename: 'tsconfig.json',
              content: JSON.stringify({
                compilerOptions: {
                  allowJs: true,
                  checkJs: true,
                },
                include: ['src/**/*.js'],
              }),
            },
            {
              filename: 'src/nodes/TSL.js',
              content: `export const branch = 'dev'`,
            },
          ],
          'init'
        )

        git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
        git(bareRepo, ['symbolic-ref', 'HEAD', 'refs/heads/dev'])

        const remote = createPublicRemoteRepository({
          fileUrl: pathToFileURL(bareRepo).toString(),
          cacheRoot,
          ref: 'dev',
        })
        fileSystem = remote.fileSystem

        directory = new Directory({
          path: 'src/nodes',
          filter: '**/*.js',
          repository: remote.repository,
        })

        const entries = await directory.getEntries()
        expect(entries.map((entry) => entry.name)).toEqual(['TSL.js'])

        const file = await directory.getFile('TSL', 'js')
        expect(await file.getText()).toContain(`branch = 'dev'`)
        expect(await file.getFirstCommitDate()).toBeInstanceOf(Date)
        expect(await file.getLastCommitDate()).toBeInstanceOf(Date)

        const exports = await file.getExports()
        expect(exports.map((entry) => entry.name)).toEqual(['branch'])

        const branchExport = await file.getExport('branch')
        expect(await branchExport.getText()).toContain(`branch = 'dev'`)
        expect(branchExport.getSourceUrl()).toBe(
          'https://github.com/owner/repo/blob/dev/src/nodes/TSL.js#L1'
        )

        const report = await drain(
          directory.getRepository().getExportHistory({
            entry: file.workspacePath,
            exportName: 'branch',
          })
        )
        const lastCommitSha = report.lastCommitSha

        if (!lastCommitSha) {
          throw new Error('expected export history to include lastCommitSha')
        }

        expect(lastCommitSha.length).toBeGreaterThan(0)
        expect(report.nameToId.branch).toHaveLength(1)
        expect(Object.keys(report.exports)).toHaveLength(1)
        expect(report.exports[report.nameToId.branch[0]]).toBeDefined()
      } finally {
        vi.restoreAllMocks()
        fileSystem?.close()
        closeGitDirectory(directory)
        rmSync(repoRoot, { recursive: true, force: true })
        rmSync(bareRoot, { recursive: true, force: true })
        rmSync(cacheRoot, { recursive: true, force: true })
      }
    },
    INTEGRATION_TIMEOUT_MS
  )

  test(
    'reuses warm remote explicit-ref history across fresh public API instances',
    async () => {
      const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
      const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
      const cacheRoot = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
      const bareRepo = join(bareRoot, 'repo.git')
      let firstDirectory: Directory | undefined
      let secondDirectory: Directory | undefined
      let firstFileSystem: GitFileSystem | undefined
      let secondFileSystem: GitFileSystem | undefined

      initRepo(repoRoot)
      git(repoRoot, ['branch', '-m', 'dev'])

      try {
        commitFiles(
          repoRoot,
          [
            {
              filename: 'tsconfig.json',
              content: JSON.stringify({
                compilerOptions: {
                  allowJs: true,
                  checkJs: true,
                },
                include: ['src/**/*.js'],
              }),
            },
            {
              filename: 'src/nodes/TSL.js',
              content: `export const branch = 'dev'`,
            },
          ],
          'init'
        )

        git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
        git(bareRepo, ['symbolic-ref', 'HEAD', 'refs/heads/dev'])

        const fileUrl = pathToFileURL(bareRepo).toString()
        const spawnSpy = vi.spyOn(spawnModule, 'spawnWithResult')
        const firstRemote = createPublicRemoteRepository({
          fileUrl,
          cacheRoot,
          ref: 'dev',
        })
        firstFileSystem = firstRemote.fileSystem

        firstDirectory = new Directory({
          path: 'src/nodes',
          filter: '**/*.js',
          repository: firstRemote.repository,
        })

        const firstFile = await firstDirectory.getFile('TSL', 'js')
        const firstReport = await drain(
          firstDirectory.getRepository().getExportHistory({
            entry: firstFile.workspacePath,
          })
        )
        const firstLsRemoteCount = spawnSpy.mock.calls.filter(
          ([command, commandArguments]) =>
            command === 'git' &&
            commandArguments[0] === 'ls-remote' &&
            commandArguments[1] === 'origin' &&
            commandArguments[2] === 'dev'
        ).length

        closeGitDirectory(firstDirectory)
        firstDirectory = undefined
        firstFileSystem?.close()
        firstFileSystem = undefined

        const secondRemote = createPublicRemoteRepository({
          fileUrl,
          cacheRoot,
          ref: 'dev',
        })
        secondFileSystem = secondRemote.fileSystem

        secondDirectory = new Directory({
          path: 'src/nodes',
          filter: '**/*.js',
          repository: secondRemote.repository,
        })

        const secondFile = await secondDirectory.getFile('TSL', 'js')
        const secondReport = await drain(
          secondDirectory.getRepository().getExportHistory({
            entry: secondFile.workspacePath,
          })
        )
        const secondLsRemoteCount = spawnSpy.mock.calls.filter(
          ([command, commandArguments]) =>
            command === 'git' &&
            commandArguments[0] === 'ls-remote' &&
            commandArguments[1] === 'origin' &&
            commandArguments[2] === 'dev'
        ).length

        const exports = await secondFile.getExports()

        expect(firstLsRemoteCount).toBeGreaterThan(0)
        expect(secondLsRemoteCount).toBe(firstLsRemoteCount)
        expect(secondReport.generatedAt).toBe(firstReport.generatedAt)
        expect(secondReport.lastCommitSha).toBe(firstReport.lastCommitSha)
        expect(exports.map((entry) => entry.name)).toEqual(['branch'])
      } finally {
        vi.restoreAllMocks()
        firstFileSystem?.close()
        secondFileSystem?.close()
        closeGitDirectory(firstDirectory)
        closeGitDirectory(secondDirectory)
        rmSync(repoRoot, { recursive: true, force: true })
        rmSync(bareRoot, { recursive: true, force: true })
        rmSync(cacheRoot, { recursive: true, force: true })
      }
    },
    INTEGRATION_TIMEOUT_MS
  )

  test(
    'reuses warm getTree snapshots across fresh git-backed directory instances',
    async () => {
      const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
      const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
      const cacheRoot = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
      const bareRepo = join(bareRoot, 'repo.git')
      let firstDirectory: Directory | undefined
      let secondDirectory: Directory | undefined
      let firstFileSystem: GitFileSystem | undefined
      let secondFileSystem: GitFileSystem | undefined

      initRepo(repoRoot)
      git(repoRoot, ['branch', '-m', 'dev'])

      try {
        commitFiles(
          repoRoot,
          [
            {
              filename: 'tsconfig.json',
              content: JSON.stringify({
                compilerOptions: {
                  allowJs: true,
                  checkJs: true,
                },
                include: ['src/**/*.js'],
              }),
            },
            {
              filename: 'src/nodes/core/Node.js',
              content: `export const core = 'core'`,
            },
            {
              filename: 'src/nodes/math/basic/Add.js',
              content: `export const add = (left, right) => left + right`,
            },
            {
              filename: 'src/nodes/math/basic/Subtract.js',
              content: `export const subtract = (left, right) => left - right`,
            },
          ],
          'init'
        )

        git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
        git(bareRepo, ['symbolic-ref', 'HEAD', 'refs/heads/dev'])

        const firstRemote = createPublicRemoteRepository({
          fileUrl: pathToFileURL(bareRepo).toString(),
          cacheRoot,
          ref: 'dev',
        })
        firstFileSystem = firstRemote.fileSystem
        firstDirectory = new Directory({
          path: 'src/nodes',
          filter: '**/*.js',
          repository: firstRemote.repository,
        })

        const firstTree = serializeNavigationEntries(await firstDirectory.getTree())

        const secondRemote = createPublicRemoteRepository({
          fileUrl: pathToFileURL(bareRepo).toString(),
          cacheRoot,
          ref: 'dev',
        })
        secondFileSystem = secondRemote.fileSystem
        const secondReadDirectory = vi.spyOn(secondFileSystem, 'readDirectory')
        secondDirectory = new Directory({
          path: 'src/nodes',
          filter: '**/*.js',
          repository: secondRemote.repository,
        })

        const secondTree = serializeNavigationEntries(
          await secondDirectory.getTree()
        )

        expect(secondTree).toEqual(firstTree)
        expect(secondReadDirectory.mock.calls.length).toBeLessThanOrEqual(1)
      } finally {
        vi.restoreAllMocks()
        firstFileSystem?.close()
        secondFileSystem?.close()
        closeGitDirectory(firstDirectory)
        closeGitDirectory(secondDirectory)
        rmSync(repoRoot, { recursive: true, force: true })
        rmSync(bareRoot, { recursive: true, force: true })
        rmSync(cacheRoot, { recursive: true, force: true })
      }
    },
    INTEGRATION_TIMEOUT_MS
  )
})
