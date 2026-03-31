// GitFileSystem.test.ts
import { describe, it, expect, vi } from 'vitest'
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
  mkdtempSync,
  existsSync,
  realpathSync,
  statSync,
  symlinkSync,
} from 'node:fs'
import { basename, join, dirname, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import {
  GitFileSystem,
  ensureCacheClone,
  ensureCacheCloneSync,
  resetGitCapabilitySupportCachesForTests,
} from './GitFileSystem'
import {
  getRootDirectory,
  resolvePersistentProjectRootDirectory,
} from '../utils/get-root-directory.ts'
import * as rootDirectoryModule from '../utils/get-root-directory.ts'
import { Directory, File } from './index.tsx'
import { GIT_HISTORY_CACHE_VERSION } from './cache-key'
import { Cache, CacheStore } from './Cache.ts'
import {
  getCacheStorePersistence,
  disposeCacheStorePersistence,
} from './CacheSqlite.ts'
import { InMemoryFileSystem } from './InMemoryFileSystem'
import { FileSystemSnapshot } from './Snapshot'
import {
  createGitCloneDirectoryName,
  createGitFileSystemPersistentCacheNodeKey,
} from './git-cache-key'
import { Session } from './Session'
import * as spawnModule from './spawn.ts'
import type {
  ExportHistoryGenerator,
  ExportHistoryOptions,
  ExportHistoryReport,
  GitAuthor,
} from './types'

/** Drain a generator to get the final report. */
async function drain(
  gen: ExportHistoryGenerator
): Promise<ExportHistoryReport> {
  let result = await gen.next()
  while (!result.done) result = await gen.next()
  return result.value
}

function createDeferredPromise<Value = void>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return {
    promise,
    resolve,
    reject,
  }
}

async function waitForCondition(
  check: () => boolean,
  timeoutMs: number = 5_000
): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    if (check()) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  throw new Error('Timed out waiting for condition')
}

const GIT_ENV = {
  /** Force the C/POSIX locale so git output/messages are consistent across machines. */
  LC_ALL: 'C',

  /** Commit author name used for test commits (avoids relying on global git config). */
  GIT_AUTHOR_NAME: 'Test User',

  /** Commit author email used for test commits (avoids relying on global git config). */
  GIT_AUTHOR_EMAIL: 'test@example.com',

  /** Committer name used for test commits (the identity that creates the commit object). */
  GIT_COMMITTER_NAME: 'Test User',

  /** Committer email used for test commits (the identity that creates the commit object). */
  GIT_COMMITTER_EMAIL: 'test@example.com',

  /** Prevent git from prompting for credentials on the terminal. */
  GIT_TERMINAL_PROMPT: '0',

  /** Ignore the user's global git config to keep tests deterministic. */
  GIT_CONFIG_GLOBAL: '/dev/null',

  /** Ignore the system git config to keep tests deterministic. */
  GIT_CONFIG_SYSTEM: '/dev/null',

  /** If git tries "askpass" prompting (no TTY), run `echo` so it fails fast. */
  GIT_ASKPASS: 'echo',

  /** Same as GIT_ASKPASS, but for SSH auth prompts. */
  SSH_ASKPASS: 'echo',
} as const

type GitIdentity = {
  name: string
  email: string
  /** If omitted, committer = author */
  committerName?: string
  committerEmail?: string
}

function identityEnv(id: GitIdentity) {
  return {
    GIT_AUTHOR_NAME: id.name,
    GIT_AUTHOR_EMAIL: id.email,
    GIT_COMMITTER_NAME: id.committerName ?? id.name,
    GIT_COMMITTER_EMAIL: id.committerEmail ?? id.email,
  } as const
}

function git(cwd: string, args: string[], identity?: GitIdentity) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      ...GIT_ENV,
      ...(identity ? identityEnv(identity) : {}),
    },
  })
  if (result.status !== 0) {
    throw new Error(`Git error: ${result.stderr} (cmd: git ${args.join(' ')})`)
  }
  return result.stdout.trim()
}

function initRepo(cwd: string) {
  git(cwd, ['-c', 'init.defaultBranch=main', 'init'])
  // Disable sparse-checkout to avoid CI issues where it may be enabled globally
  git(cwd, ['config', 'core.sparseCheckout', 'false'])
  git(cwd, ['config', '--worktree', 'core.sparseCheckout', 'false'])
  git(cwd, ['config', '--worktree', 'core.sparseCheckoutCone', 'false'])
  const sparseCheckoutPath = join(cwd, '.git', 'info', 'sparse-checkout')
  if (existsSync(sparseCheckoutPath)) {
    rmSync(sparseCheckoutPath, { force: true })
  }
  git(cwd, ['sparse-checkout', 'disable'])
}

function commitFile(
  repo: string,
  filename: string,
  content: string,
  message: string,
  identity?: GitIdentity
) {
  const path = join(repo, filename)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  git(repo, ['add', '--sparse', filename])
  git(repo, ['commit', '--no-gpg-sign', '-m', message], identity)

  // Get hash and unix timestamp in a single git command
  const output = git(repo, ['log', '-1', '--format=%H %ct'])
  const [hash, unixStr] = output.split(' ')
  return { hash, unix: parseInt(unixStr, 10) }
}

function commitFiles(
  repo: string,
  files: Array<{ filename: string; content: string }>,
  message: string,
  identity?: GitIdentity
) {
  for (const file of files) {
    const path = join(repo, file.filename)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, file.content)
  }
  git(repo, ['add', '--sparse', ...files.map((file) => file.filename)])
  git(repo, ['commit', '--no-gpg-sign', '-m', message], identity)

  const output = git(repo, ['log', '-1', '--format=%H %ct'])
  const [hash, unixStr] = output.split(' ')
  return { hash, unix: parseInt(unixStr, 10) }
}

function tag(repo: string, tagName: string) {
  git(repo, ['tag', tagName])
}

function getPrimaryId(
  report: { nameToId: Record<string, string[]> },
  name: string
) {
  return report.nameToId[name]?.[0]
}

interface TestContext {
  repoRoot: string
  cacheDirectory: string
}

// Wrapper for concurrent tests with automatic cleanup
function test(name: string, fn: (ctx: TestContext) => Promise<void>): void {
  it.concurrent(
    name,
    async () => {
      const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
      const cacheDirectory = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
      initRepo(repoRoot)
      try {
        await fn({ repoRoot, cacheDirectory })
      } finally {
        rmSync(repoRoot, { recursive: true, force: true })
        rmSync(cacheDirectory, { recursive: true, force: true })
      }
    },
    30_000
  )
}

function withTemporaryHomeDirectory(fn: (homeDirectory: string) => void) {
  const previousHome = process.env.HOME
  const previousUserProfile = process.env.USERPROFILE
  const homeDirectory = mkdtempSync(join(tmpdir(), 'renoun-git-home-'))

  process.env.HOME = homeDirectory
  process.env.USERPROFILE = homeDirectory

  try {
    fn(homeDirectory)
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = previousHome
    }

    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE
    } else {
      process.env.USERPROFILE = previousUserProfile
    }

    rmSync(homeDirectory, { recursive: true, force: true })
  }
}

function withWorkingDirectory<Value>(
  directory: string,
  fn: () => Value
): Value {
  const previousWorkingDirectory = process.cwd()
  process.chdir(directory)

  try {
    return fn()
  } finally {
    process.chdir(previousWorkingDirectory)
  }
}

describe('GitFileSystem', () => {
  it('defaults clone cacheDirectory to the workspace .renoun/cache/git path', () => {
    const store = new GitFileSystem({ repository: '.' })
    try {
      expect(store.cacheDirectory).toBe(
        resolve(getRootDirectory(), '.renoun', 'cache', 'git')
      )
    } finally {
      store.close()
    }
  })

  it('stores app-mode clone cache under the project root instead of the runtime directory', () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-git-cache-app-runtime-')
    )
    const projectRoot = join(tmpDirectory, 'project')
    const runtimeRoot = join(projectRoot, '.renoun', 'app', '-renoun-blog')
    const previousRuntimeDirectory = process.env.RENOUN_RUNTIME_DIRECTORY

    mkdirSync(runtimeRoot, { recursive: true })
    writeFileSync(
      join(projectRoot, 'package.json'),
      JSON.stringify({
        name: 'git-cache-app-runtime-root-test',
        private: true,
      }),
      'utf8'
    )

    try {
      process.env.RENOUN_RUNTIME_DIRECTORY = runtimeRoot

      const store = new GitFileSystem({ repository: '.' })
      try {
        expect(store.cacheDirectory).toBe(
          resolve(
            resolvePersistentProjectRootDirectory(projectRoot),
            '.renoun',
            'cache',
            'git'
          )
        )
      } finally {
        store.close()
      }
    } finally {
      if (previousRuntimeDirectory === undefined) {
        delete process.env.RENOUN_RUNTIME_DIRECTORY
      } else {
        process.env.RENOUN_RUNTIME_DIRECTORY = previousRuntimeDirectory
      }

      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  it('stores Next app clone caches under the app .renoun/cache directory', () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-git-next-app-'))
    const workspaceRoot = join(tmpDirectory, 'workspace')
    const appRoot = join(workspaceRoot, 'apps', 'site')

    mkdirSync(join(appRoot, 'app'), { recursive: true })
    writeFileSync(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({
        name: 'renoun-git-next-workspace',
        private: true,
        workspaces: ['apps/*'],
      }),
      'utf8'
    )
    writeFileSync(
      join(appRoot, 'package.json'),
      JSON.stringify({
        name: 'renoun-git-next-app',
        private: true,
        dependencies: {
          next: '15.0.0',
        },
      }),
      'utf8'
    )

    try {
      const canonicalAppRoot = realpathSync(appRoot)
      withWorkingDirectory(appRoot, () => {
        const store = new GitFileSystem({ repository: '.' })
        try {
          expect(store.cacheDirectory).toBe(
            resolve(canonicalAppRoot, '.renoun', 'cache', 'git')
          )
        } finally {
          store.close()
        }
      })
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  it('stores remote explicit-ref clone caches under the project .renoun/cache root in Next apps', () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-git-next-remote-'))
    const workspaceRoot = join(tmpDirectory, 'workspace')
    const appRoot = join(workspaceRoot, 'apps', 'site')

    mkdirSync(join(appRoot, 'app'), { recursive: true })
    writeFileSync(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({
        name: 'renoun-git-next-remote-workspace',
        private: true,
        workspaces: ['apps/*'],
      }),
      'utf8'
    )
    writeFileSync(
      join(appRoot, 'package.json'),
      JSON.stringify({
        name: 'renoun-git-next-remote-app',
        private: true,
        dependencies: {
          next: '15.0.0',
        },
      }),
      'utf8'
    )

    try {
      const canonicalAppRoot = realpathSync(appRoot)
      withWorkingDirectory(appRoot, () => {
        const store = new GitFileSystem({
          repository: 'owner/repo',
          ref: 'main',
        })
        try {
          expect(store.cacheDirectory).toBe(
            resolve(canonicalAppRoot, '.renoun', 'cache', 'git')
          )
        } finally {
          store.close()
        }
      })
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  it('allows overriding the cache root explicitly', () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-git-cache-explicit-')
    )
    const cacheDirectory = join(tmpDirectory, 'custom-cache')
    const store = new GitFileSystem({
      repository: '.',
      cache: new Cache({ outputDirectory: cacheDirectory }),
    })

    try {
      expect(store.cacheDirectory).toBe(resolve(cacheDirectory, 'git'))
    } finally {
      store.close()
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  it('falls back to the user cache directory when workspace discovery fails', () => {
    withTemporaryHomeDirectory((homeDirectory) => {
      const rootDirectorySpy = vi
        .spyOn(rootDirectoryModule, 'getRootDirectory')
        .mockImplementation(() => {
          throw new Error('workspace not found')
        })

      const store = new GitFileSystem({ repository: '.' })
      try {
        expect(store.cacheDirectory).toBe(
          resolve(homeDirectory, '.cache', 'renoun-git')
        )
      } finally {
        store.close()
        rootDirectorySpy.mockRestore()
      }
    })
  })

  it('falls back to the user cache directory when workspace discovery resolves to filesystem root', () => {
    withTemporaryHomeDirectory((homeDirectory) => {
      const rootDirectorySpy = vi
        .spyOn(rootDirectoryModule, 'getRootDirectory')
        .mockReturnValue(resolve('/'))

      const store = new GitFileSystem({ repository: '.' })
      try {
        expect(store.cacheDirectory).toBe(
          resolve(homeDirectory, '.cache', 'renoun-git')
        )
      } finally {
        store.close()
        rootDirectorySpy.mockRestore()
      }
    })
  })

  test('returns a stable workspace change token when tree state is unchanged', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const value = 1`, 'init')

    const store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    try {
      const firstToken = await store.getWorkspaceChangeToken('.')
      const secondToken = await store.getWorkspaceChangeToken('.')

      expect(firstToken).toBeTruthy()
      expect(firstToken).toBe(secondToken)
    } finally {
      store.close()
    }
  })

  test('changes workspace token for repeated dirty and untracked updates', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const value = 1`, 'init')

    const trackedPath = join(repoRoot, 'src/index.ts')
    const untrackedPath = join(repoRoot, 'src/new-file.ts')
    const store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    try {
      const cleanToken = await store.getWorkspaceChangeToken('.')

      writeFileSync(trackedPath, `export const value = 2`)
      const firstDirtyToken = await store.getWorkspaceChangeToken('.')

      writeFileSync(trackedPath, `export const value = 333`)
      const secondDirtyToken = await store.getWorkspaceChangeToken('.')
      const dirtyChangedPaths = await store.getWorkspaceChangedPathsSinceToken(
        '.',
        firstDirtyToken!
      )

      writeFileSync(untrackedPath, `export const created = true`)
      const untrackedToken = await store.getWorkspaceChangeToken('.')

      expect(cleanToken).toBeTruthy()
      expect(firstDirtyToken).toBeTruthy()
      expect(secondDirtyToken).toBeTruthy()
      expect(untrackedToken).toBeTruthy()
      expect(firstDirtyToken).not.toBe(cleanToken)
      expect(secondDirtyToken).not.toBe(firstDirtyToken)
      expect(dirtyChangedPaths ?? []).toContain('src/index.ts')
      expect(untrackedToken).not.toBe(secondDirtyToken)
    } finally {
      store.close()
    }
  })

  test('ignores gitignored-only changes in workspace token checks', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFiles(
      repoRoot,
      [
        { filename: '.gitignore', content: 'ignored/\n' },
        { filename: 'src/index.ts', content: 'export const value = 1' },
      ],
      'init'
    )

    const ignoredPath = join(repoRoot, 'ignored', 'scratch.txt')
    mkdirSync(join(repoRoot, 'ignored'), { recursive: true })
    writeFileSync(ignoredPath, 'first')

    const store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    try {
      const previousToken = await store.getWorkspaceChangeToken('.')
      expect(previousToken).toBeTruthy()

      writeFileSync(ignoredPath, 'second')
      const nextToken = await store.getWorkspaceChangeToken('.')
      expect(nextToken).toBe(previousToken)

      const changedPaths = await store.getWorkspaceChangedPathsSinceToken(
        '.',
        previousToken!
      )
      expect(changedPaths ?? []).toEqual([])
    } finally {
      store.close()
    }
  })

  test('scopes workspace change token by requested root path', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFiles(
      repoRoot,
      [
        { filename: 'docs/page.mdx', content: '# Page' },
        { filename: 'src/index.ts', content: 'export const value = 1' },
      ],
      'init'
    )

    const sourcePath = join(repoRoot, 'src/index.ts')
    const docsPath = join(repoRoot, 'docs/page.mdx')
    const store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    try {
      const initialDocsToken = await store.getWorkspaceChangeToken('docs')

      writeFileSync(sourcePath, 'export const value = 2')
      const docsTokenAfterSourceEdit =
        await store.getWorkspaceChangeToken('docs')

      writeFileSync(docsPath, '# Updated')
      const docsTokenAfterDocsEdit = await store.getWorkspaceChangeToken('docs')

      expect(initialDocsToken).toBeTruthy()
      expect(docsTokenAfterSourceEdit).toBe(initialDocsToken)
      expect(docsTokenAfterDocsEdit).not.toBe(initialDocsToken)
    } finally {
      store.close()
    }
  })

  test('returns deterministic workspace tokens for explicit refs', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const value = 1`, 'init')
    git(repoRoot, ['checkout', '-b', 'feature'])

    const store = new GitFileSystem({
      repository: repoRoot,
      cacheDirectory,
      ref: 'main',
    })

    try {
      const firstToken = await store.getWorkspaceChangeToken('.')
      expect(firstToken).not.toBeNull()
      expect(await store.getWorkspaceChangedPathsSinceToken('.', firstToken!)).toEqual(
        []
      )
      expect(await store.readFile('src/index.ts')).toBe(
        `export const value = 1`
      )

      git(repoRoot, ['checkout', 'main'])
      commitFile(repoRoot, 'src/index.ts', `export const value = 2`, 'update')
      git(repoRoot, ['checkout', 'feature'])

      const secondToken = await store.getWorkspaceChangeToken('.')
      expect(secondToken).not.toBeNull()
      expect(secondToken).not.toBe(firstToken)
      expect(
        await store.getWorkspaceChangedPathsSinceToken('.', firstToken!)
      ).toBeNull()
      expect(await store.readFile('src/index.ts')).toBe(
        `export const value = 2`
      )
    } finally {
      store.close()
    }
  })

  test('tracks unicode file names in workspace changed paths', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const value = 1`, 'init')

    const unicodeRelativePath = 'src/café.ts'
    const unicodeAbsolutePath = join(repoRoot, unicodeRelativePath)
    const store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    try {
      const previousToken = await store.getWorkspaceChangeToken('.')
      expect(previousToken).toBeTruthy()

      writeFileSync(unicodeAbsolutePath, 'export const cafe = 1')
      const changedPaths = await store.getWorkspaceChangedPathsSinceToken(
        '.',
        previousToken!
      )

      expect(changedPaths ?? []).toContain(unicodeRelativePath)
    } finally {
      store.close()
    }
  })

  test('tracks unicode file names across committed head changes', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const value = 1`, 'init')

    const unicodeRelativePath = 'src/café.ts'
    const store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    try {
      const previousToken = await store.getWorkspaceChangeToken('.')
      expect(previousToken).toBeTruthy()

      commitFile(
        repoRoot,
        unicodeRelativePath,
        'export const cafe = 2',
        'add cafe'
      )
      const changedPaths = await store.getWorkspaceChangedPathsSinceToken(
        '.',
        previousToken!
      )

      expect(changedPaths ?? []).toContain(unicodeRelativePath)
    } finally {
      store.close()
    }
  })

  test('does not split dirty filenames containing " -> " as renames', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    const arrowPath = 'src/feature -> docs.ts'
    commitFile(repoRoot, arrowPath, `export const value = 1`, 'init')

    const absoluteArrowPath = join(repoRoot, arrowPath)
    const store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    try {
      const previousToken = await store.getWorkspaceChangeToken('.')
      expect(previousToken).toBeTruthy()

      writeFileSync(absoluteArrowPath, 'export const value = 2')
      const changedPaths = await store.getWorkspaceChangedPathsSinceToken(
        '.',
        previousToken!
      )
      const nextPaths = changedPaths ?? []

      expect(nextPaths).toContain(arrowPath)
      expect(nextPaths).not.toContain('src/feature')
      expect(nextPaths).not.toContain('docs.ts')
    } finally {
      store.close()
    }
  })

  test('correctly tracks export additions and removals', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    // Empty baseline so the next commit enters the comparison path
    commitFile(repoRoot, 'src/index.ts', `export {}`, 'baseline')
    commitFile(repoRoot, 'src/index.ts', `export const foo = 1`, 'init')
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `export const bar = 2`,
      'change exports'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const barId = getPrimaryId(report, 'bar')
    expect(barId).toBeDefined()
    const barHistory = report.exports[barId!]
    expect(barHistory).toHaveLength(1)
    expect(barHistory[0].kind).toBe('Added')
    expect(barHistory[0].sha).toBe(c2.hash)

    expect(report.nameToId['foo']).toBeUndefined()
    const fooHistory = report.exports['src/index.ts::foo']
    expect(fooHistory).toBeDefined()
    const fooRemoved = fooHistory?.find((change) => change.kind === 'Removed')
    expect(fooRemoved?.sha).toBe(c2.hash)
  })

  test('infers multiple entry files from a directory', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFiles(
      repoRoot,
      [
        { filename: 'src/foo/index.ts', content: `export * from './a'` },
        { filename: 'src/foo/Foo.ts', content: `export * from './b'` },
        { filename: 'src/foo/Barrel.ts', content: `export * from './a'` },
        { filename: 'src/foo/Local.ts', content: `export const local = 1` },
        { filename: 'src/foo/External.ts', content: `export { x } from 'pkg'` },
        { filename: 'src/foo/a.ts', content: `export const a = 1` },
        { filename: 'src/foo/b.ts', content: `export const b = 1` },
      ],
      'init'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({
        entry: 'src/foo',
        limit: 1,
        detectUpdates: false,
      })
    )

    expect(report.entryFiles).toEqual([
      'src/foo/index.ts',
      'src/foo/Foo.ts',
      'src/foo/Barrel.ts',
    ])
    expect(report.entryFiles).not.toContain('src/foo/Local.ts')
    expect(report.entryFiles).not.toContain('src/foo/External.ts')
  })

  test('invalidates export-history cache when ref advances', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const a = 1`, 'v1')

    const store1 = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    try {
      const report1 = await drain(
        store1.getExportHistory({ entry: 'src/index.ts' })
      )
      expect(getPrimaryId(report1, 'a')).toBeDefined()
      expect(getPrimaryId(report1, 'b')).toBeUndefined()
    } finally {
      store1.close()
    }

    commitFile(
      repoRoot,
      'src/index.ts',
      `export const a = 1; export const b = 2`,
      'v2'
    )

    const store2 = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    try {
      const report2 = await drain(
        store2.getExportHistory({ entry: 'src/index.ts' })
      )
      expect(getPrimaryId(report2, 'b')).toBeDefined()
    } finally {
      store2.close()
    }
  })

  test('re-resolves ref commits for long-lived file-system instances', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    const v1 = commitFile(
      repoRoot,
      'src/index.ts',
      `export const value = 1`,
      'v1'
    )

    const store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    try {
      const firstMetadata = await store.getFileMetadata('src/index.ts')
      expect(firstMetadata.refCommit).toBe(v1.hash)

      const v2 = commitFile(
        repoRoot,
        'src/index.ts',
        `export const value = 2`,
        'v2'
      )

      const secondMetadata = await store.getFileMetadata('src/index.ts')
      expect(secondMetadata.refCommit).toBe(v2.hash)
      expect(secondMetadata.refCommit).not.toBe(firstMetadata.refCommit)
    } finally {
      store.close()
    }
  })

  test('reuses export-history cache across store instances when ref is unchanged', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const a = 1`, 'v1')

    const store1 = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    let report1: ExportHistoryReport
    try {
      report1 = await drain(store1.getExportHistory({ entry: 'src/index.ts' }))
    } finally {
      store1.close()
    }

    await new Promise((resolve) => setTimeout(resolve, 25))

    const store2 = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    try {
      const report2 = await drain(
        store2.getExportHistory({ entry: 'src/index.ts' })
      )

      expect(report2.generatedAt).toBe(report1.generatedAt)
      expect(report2.lastCommitSha).toBe(report1.lastCommitSha)
      expect(report2.nameToId).toEqual(report1.nameToId)
    } finally {
      store2.close()
    }
  })

  it.sequential(
    'shares in-flight export-history work across concurrent identical store instances',
    async () => {
      const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
      const cacheDirectory = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
      const wrapperDirectory = mkdtempSync(join(tmpdir(), 'renoun-test-git-'))
      const previousPath = process.env.PATH
      const previousRealGit = process.env.REAL_GIT
      const previousLogPath = process.env.RENOUN_GIT_LOG
      const previousStartedPath = process.env.RENOUN_GIT_LOG_STARTED
      const previousReleasePath = process.env.RENOUN_GIT_LOG_RELEASE

      initRepo(repoRoot)

      try {
        commitFile(repoRoot, 'src/index.ts', `export const value = 1`, 'init')
        const realGit = spawnSync('which', ['git'], {
          encoding: 'utf8',
          shell: false,
        }).stdout.trim()
        const logFile = join(wrapperDirectory, 'git.log')
        const startedFile = join(wrapperDirectory, 'git-log-started')
        const releaseFile = join(wrapperDirectory, 'git-log-release')
        const wrapperGitPath = join(wrapperDirectory, 'git')

        writeFileSync(
          wrapperGitPath,
          [
            '#!/bin/sh',
            'printf "%s\\t" "$@" >> "$RENOUN_GIT_LOG"',
            'printf "\\n" >> "$RENOUN_GIT_LOG"',
            'if [ "$1" = "log" ]; then',
            '  : > "$RENOUN_GIT_LOG_STARTED"',
            '  while [ ! -f "$RENOUN_GIT_LOG_RELEASE" ]; do',
            '    sleep 0.01',
            '  done',
            'fi',
            'exec "$REAL_GIT" "$@"',
            '',
          ].join('\n'),
          { mode: 0o755 }
        )

        process.env.PATH = `${wrapperDirectory}:${previousPath ?? ''}`
        process.env.REAL_GIT = realGit
        process.env.RENOUN_GIT_LOG = logFile
        process.env.RENOUN_GIT_LOG_STARTED = startedFile
        process.env.RENOUN_GIT_LOG_RELEASE = releaseFile

        using firstStore = new GitFileSystem({
          repository: repoRoot,
          cacheDirectory,
        })
        using secondStore = new GitFileSystem({
          repository: repoRoot,
          cacheDirectory,
        })

        const firstReportPromise = drain(
          firstStore.getExportHistory({
            entry: 'src/index.ts',
            __skipWarmup: true,
          } as ExportHistoryOptions & { __skipWarmup: true })
        )
        await waitForCondition(() => existsSync(startedFile))

        const secondReportPromise = drain(
          secondStore.getExportHistory({
            entry: 'src/index.ts',
            __skipWarmup: true,
          } as ExportHistoryOptions & { __skipWarmup: true })
        )

        await new Promise((resolve) => setTimeout(resolve, 50))
        const logLinesBeforeRelease = readFileSync(logFile, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
        const gitLogCountBeforeRelease = logLinesBeforeRelease.filter((line) =>
          line.startsWith('log\t')
        ).length
        expect(gitLogCountBeforeRelease).toBe(1)

        writeFileSync(releaseFile, 'release')

        const [firstReport, secondReport] = await Promise.all([
          firstReportPromise,
          secondReportPromise,
        ])

        const finalGitLogCount = readFileSync(logFile, 'utf8')
          .trim()
          .split('\n')
          .filter((line) => line.startsWith('log\t')).length

        expect(finalGitLogCount).toBe(1)
        expect(secondReport.generatedAt).toBe(firstReport.generatedAt)
        expect(secondReport.lastCommitSha).toBe(firstReport.lastCommitSha)
        expect(secondReport.nameToId).toEqual(firstReport.nameToId)
      } finally {
        vi.restoreAllMocks()
        if (previousPath === undefined) {
          delete process.env.PATH
        } else {
          process.env.PATH = previousPath
        }
        if (previousRealGit === undefined) {
          delete process.env.REAL_GIT
        } else {
          process.env.REAL_GIT = previousRealGit
        }
        if (previousLogPath === undefined) {
          delete process.env.RENOUN_GIT_LOG
        } else {
          process.env.RENOUN_GIT_LOG = previousLogPath
        }
        if (previousStartedPath === undefined) {
          delete process.env.RENOUN_GIT_LOG_STARTED
        } else {
          process.env.RENOUN_GIT_LOG_STARTED = previousStartedPath
        }
        if (previousReleasePath === undefined) {
          delete process.env.RENOUN_GIT_LOG_RELEASE
        } else {
          process.env.RENOUN_GIT_LOG_RELEASE = previousReleasePath
        }
        rmSync(repoRoot, { recursive: true, force: true })
        rmSync(cacheDirectory, { recursive: true, force: true })
        rmSync(wrapperDirectory, { recursive: true, force: true })
      }
    }
  )

  test(
    'does not block identical export-history requests when an earlier generator is abandoned after progress',
    async ({ repoRoot, cacheDirectory }) => {
      commitFile(repoRoot, 'src/index.ts', `export const value = 1`, 'init')

      using firstStore = new GitFileSystem({ repository: repoRoot, cacheDirectory })
      const abandonedGenerator = firstStore.getExportHistory({
        entry: 'src/index.ts',
        __skipWarmup: true,
      } as ExportHistoryOptions & { __skipWarmup: true })

      const firstProgress = await abandonedGenerator.next()
      expect(firstProgress.done).toBe(false)
      if (firstProgress.done) {
        throw new Error('Expected an initial progress event before completion.')
      }
      expect(firstProgress.value.phase).toBe('start')

      using secondStore = new GitFileSystem({
        repository: repoRoot,
        cacheDirectory,
      })

      const report = await Promise.race([
        drain(
          secondStore.getExportHistory({
            entry: 'src/index.ts',
            __skipWarmup: true,
          } as ExportHistoryOptions & { __skipWarmup: true })
        ),
        new Promise<never>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  'Timed out waiting for identical export-history request to complete.'
                )
              ),
            5_000
          )
        }),
      ])

      expect(getPrimaryId(report, 'value')).toBeDefined()
    }
  )

  test('persists rename-map entries used by export history', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFiles(
      repoRoot,
      [
        { filename: 'src/index.ts', content: `export * from './old'` },
        { filename: 'src/old.ts', content: `export const core = 1` },
      ],
      'init'
    )
    git(repoRoot, ['mv', 'src/old.ts', 'src/new.ts'])
    writeFileSync(join(repoRoot, 'src/index.ts'), `export * from './new'`)
    git(repoRoot, ['add', '--sparse', 'src/index.ts', 'src/new.ts'])
    git(repoRoot, ['commit', '--no-gpg-sign', '-m', 'rename file'])
    const renameCommit = git(repoRoot, ['log', '-1', '--format=%H'])

    const store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    try {
      const report = await drain(
        store.getExportHistory({
          entry: 'src/index.ts',
        })
      )
      const coreId = getPrimaryId(report, 'core')
      expect(coreId).toBeDefined()
      const renameChange = report.exports[coreId!].find(
        (change) => change.kind === 'Renamed'
      )
      expect(renameChange).toBeDefined()
      expect(renameChange?.sha).toBe(renameCommit)
      expect(renameChange?.previousFilePath).toBe('src/old.ts')
    } finally {
      store.close()
    }

    const persistence = getCacheStorePersistence({ projectRoot: repoRoot })
    try {
      const renameMapKeys = await persistence.listNodeKeysByPrefix(
        `git-file-system:${GIT_HISTORY_CACHE_VERSION}:rename-map:`
      )
      expect(renameMapKeys.length).toBeGreaterThan(0)

      let foundExpectedPair = false
      for (const key of renameMapKeys) {
        const persisted = await persistence.load(key)
        const value = persisted?.value
        if (!Array.isArray(value)) {
          continue
        }
        for (const pair of value) {
          if (
            Array.isArray(pair) &&
            pair[0] === 'src/new.ts' &&
            pair[1] === 'src/old.ts'
          ) {
            foundExpectedPair = true
            break
          }
        }
        if (foundExpectedPair) {
          break
        }
      }

      expect(foundExpectedPair).toBe(true)
    } finally {
      disposeCacheStorePersistence({ projectRoot: repoRoot })
    }
  })

  test('recomputes export-history when public-api-latest pointer is for a different request', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFiles(
      repoRoot,
      [
        { filename: 'src/index.ts', content: `export const index = 1` },
        { filename: 'src/other.ts', content: `export const other = 1` },
      ],
      'init'
    )

    const endRef = 'HEAD'
    const endCommit = git(repoRoot, ['rev-parse', endRef])
    const commonCacheBase = {
      ref: null,
      refScope: 'default',
      endRef,
      release: null,
      startRef: null,
      startCommit: null,
      include: ['src'],
      limit: undefined,
      maxDepth: 25,
      detectUpdates: true,
      updateMode: 'signature',
    }

    const indexReportKey = createGitFileSystemPersistentCacheNodeKey({
      domainVersion: GIT_HISTORY_CACHE_VERSION,
      repository: repoRoot,
      repoRoot,
      namespace: 'public-api-report',
      payload: {
        ...commonCacheBase,
        refCommit: endCommit,
        entry: ['src/index.ts'],
      },
    })

    const poisonedLatestKey = createGitFileSystemPersistentCacheNodeKey({
      domainVersion: GIT_HISTORY_CACHE_VERSION,
      repository: repoRoot,
      repoRoot,
      namespace: 'public-api-latest',
      payload: {
        ...commonCacheBase,
        refCommit: null,
        entry: ['src/other.ts'],
      },
    })

    const persistence = getCacheStorePersistence({ projectRoot: repoRoot })
    const seedStore = new CacheStore({
      snapshot: new FileSystemSnapshot(
        new InMemoryFileSystem({ 'seed.ts': 'export {}' }),
        'seed-snapshot'
      ),
      persistence,
    })

    try {
      using indexStore = new GitFileSystem({
        repository: repoRoot,
        cacheDirectory,
      })
      const indexReport = await drain(
        indexStore.getExportHistory({ entry: 'src/index.ts' })
      )

      await seedStore.put(indexReportKey, indexReport, {
        persist: true,
        deps: [
          {
            depKey: `const:git-file-system-cache:${GIT_HISTORY_CACHE_VERSION}`,
            depVersion: GIT_HISTORY_CACHE_VERSION,
          },
        ],
      })

      await seedStore.put(
        poisonedLatestKey,
        {
          reportNodeKey: indexReportKey,
          lastCommitSha: indexReport.lastCommitSha!,
        },
        {
          persist: true,
          deps: [
            {
              depKey: `const:git-file-system-cache:${GIT_HISTORY_CACHE_VERSION}`,
              depVersion: GIT_HISTORY_CACHE_VERSION,
            },
          ],
        }
      )

      using poisonedStore = new GitFileSystem({
        repository: repoRoot,
        cacheDirectory,
      })
      const poisonedReport = await drain(
        poisonedStore.getExportHistory({ entry: 'src/other.ts' })
      )

      expect(poisonedReport.entryFiles).toContain('src/other.ts')
      expect(poisonedReport.entryFiles).not.toContain('src/index.ts')
    } finally {
      disposeCacheStorePersistence({ projectRoot: repoRoot })
    }
  })

  test('does not persist fallback file metadata after transient git-log failures', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/a.ts', `export const a = 1`, 'a')
    const commit = commitFile(repoRoot, 'src/b.ts', `export const b = 1`, 'b')

    const store = new GitFileSystem({
      repository: repoRoot,
      cacheDirectory,
    })

    try {
      await store.getFileMetadata('src/a.ts')

      const originalMaxBufferBytes = store.maxBufferBytes
      ;(store as any).maxBufferBytes = 1
      const fallback = await store.getFileMetadata('src/b.ts')
      ;(store as any).maxBufferBytes = originalMaxBufferBytes

      expect(fallback.authors).toEqual([])
      const recovered = await store.getFileMetadata('src/b.ts')
      expect(recovered.authors.length).toBeGreaterThan(0)
      expect(recovered.lastCommitHash).toBe(commit.hash)
    } finally {
      store.close()
    }
  })

  test('supports scope expansion on cached repo', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(
      repoRoot,
      'scope-a/index.ts',
      `export const a = 1`,
      'add scope a'
    )
    commitFile(
      repoRoot,
      'scope-b/index.ts',
      `export const b = 1`,
      'add scope b'
    )

    const cloneRoot = mkdtempSync(join(tmpdir(), 'renoun-test-sparse-'))
    const sparseRepo = join(cloneRoot, 'repo')
    try {
      const cloneArgs = ['clone', '--no-checkout', '--sparse']
      let cloneResult = spawnSync(
        'git',
        [...cloneArgs, '--filter=blob:none', repoRoot, sparseRepo],
        { encoding: 'utf8', shell: false, env: GIT_ENV }
      )
      if (cloneResult.status !== 0) {
        cloneResult = spawnSync('git', [...cloneArgs, repoRoot, sparseRepo], {
          encoding: 'utf8',
          shell: false,
          env: GIT_ENV,
        })
        if (cloneResult.status !== 0) {
          throw new Error(
            `Git clone failed: ${cloneResult.stderr || cloneResult.stdout}`
          )
        }
      }

      git(sparseRepo, ['sparse-checkout', 'init', '--cone'])
      git(sparseRepo, ['sparse-checkout', 'set', 'scope-a'])
      git(sparseRepo, ['checkout', 'HEAD'])

      using store = new GitFileSystem({
        repository: sparseRepo,
        cacheDirectory,
      })
      const reportA = await drain(
        store.getExportHistory({
          entry: 'scope-a/index.ts',
        })
      )
      expect(getPrimaryId(reportA, 'a')).toBeDefined()

      git(sparseRepo, ['sparse-checkout', 'set', 'scope-a', 'scope-b'])
      const reportB = await drain(
        store.getExportHistory({
          entry: 'scope-b/index.ts',
        })
      )
      expect(getPrimaryId(reportB, 'b')).toBeDefined()
    } finally {
      rmSync(cloneRoot, { recursive: true, force: true })
    }
  })

  test('respects ref.start by not re-adding existing exports', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const foo = 1`, 'v1')
    tag(repoRoot, 'v1.0.0')
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `export const foo = 1; export const bar = 2`,
      'add bar'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({
        entry: 'src/index.ts',
        ref: { start: 'v1.0.0' },
      })
    )

    const fooId = getPrimaryId(report, 'foo')
    expect(fooId).toBeDefined()
    const fooHistory = report.exports[fooId!]
    expect(fooHistory.find((change) => change.kind === 'Added')).toBeUndefined()

    const barId = getPrimaryId(report, 'bar')
    expect(barId).toBeDefined()
    const barHistory = report.exports[barId!]
    const barAdded = barHistory.find((change) => change.kind === 'Added')
    expect(barAdded?.sha).toBe(c2.hash)
  })

  test('detects renames when re-exporting with same local name', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/lib.ts', `export const core = 100`, 'add lib')
    commitFile(repoRoot, 'src/index.ts', `export { core } from './lib'`, 'v1')
    commitFile(
      repoRoot,
      'src/lib.ts',
      `export const coreV2 = 100`,
      'rename in lib'
    )
    commitFile(
      repoRoot,
      'src/index.ts',
      `export { coreV2 as core } from './lib'`,
      'update re-export'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const coreId = getPrimaryId(report, 'core')
    expect(coreId).toBeDefined()
    expect(report.exports[coreId!].length).toBeGreaterThan(0)
  })

  test('detects alias rename in barrel exports', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/lib.ts', `export const foo = 1`, 'add lib')
    commitFile(
      repoRoot,
      'src/index.ts',
      `export { foo as bar } from './lib'`,
      'export bar'
    )
    const renameCommit = commitFile(
      repoRoot,
      'src/index.ts',
      `export { foo as baz } from './lib'`,
      'rename to baz'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    expect(getPrimaryId(report, 'bar')).toBeUndefined()
    const bazId = getPrimaryId(report, 'baz')
    expect(bazId).toBeDefined()
    expect(bazId).toContain('src/lib.ts')

    const bazHistory = report.exports[bazId!]
    const renameChange = bazHistory.find((change) => change.kind === 'Renamed')
    expect(renameChange?.sha).toBe(renameCommit.hash)
    expect(renameChange?.name).toBe('baz')
    expect(renameChange?.previousId).toBe(bazId)
  })

  test('detects cross-file renames within a commit', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/a.ts', `export const core = 1`, 'add a')
    commitFile(
      repoRoot,
      'src/index.ts',
      `export { core } from './a'`,
      'barrel a'
    )

    const renameCommit = commitFiles(
      repoRoot,
      [
        { filename: 'src/a.ts', content: 'export {}' },
        { filename: 'src/b.ts', content: 'export const core = 1' },
        { filename: 'src/index.ts', content: `export { core } from './b'` },
      ],
      'move core'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const coreId = getPrimaryId(report, 'core')
    expect(coreId).toBeDefined()
    expect(coreId).toContain('src/b.ts')

    const coreHistory = report.exports[coreId!]
    const renameChange = coreHistory.find((change) => change.kind === 'Renamed')
    expect(renameChange?.sha).toBe(renameCommit.hash)
    expect(report.exports['src/a.ts::core']).toBeUndefined()
  })

  test('resolves ambiguous rename collisions via per-name matching', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/a.ts', `export const foo = 1`, 'add a')
    commitFile(repoRoot, 'src/b.ts', `export const foo = 1`, 'add b')
    // Empty barrel baseline so the real barrel enters the comparison path
    commitFile(repoRoot, 'src/index.ts', `export {}`, 'baseline barrel')
    commitFile(
      repoRoot,
      'src/index.ts',
      `export { foo as aFoo } from './a'; export { foo as bFoo } from './b'`,
      'barrel'
    )

    const updateCommit = commitFiles(
      repoRoot,
      [
        { filename: 'src/a.ts', content: 'export {}' },
        { filename: 'src/b.ts', content: 'export {}' },
        { filename: 'src/c.ts', content: 'export const foo = 1' },
        { filename: 'src/d.ts', content: 'export const foo = 1' },
        {
          filename: 'src/index.ts',
          content: `export { foo as aFoo } from './c'; export { foo as bFoo } from './d'`,
        },
      ],
      'swap sources'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const aFooId = getPrimaryId(report, 'aFoo')
    expect(aFooId).toBeDefined()
    expect(aFooId).toContain('src/c.ts')
    const bFooId = getPrimaryId(report, 'bFoo')
    expect(bFooId).toBeDefined()
    expect(bFooId).toContain('src/d.ts')

    // Per-name matching detects these as renames (moves) since each public name
    // independently has exactly one removed and one added ID.
    const aFooHistory = report.exports[aFooId!]
    expect(aFooHistory.some((c) => c.kind === 'Renamed')).toBe(true)
    expect(aFooHistory.find((c) => c.kind === 'Renamed')?.sha).toBe(
      updateCommit.hash
    )

    const bFooHistory = report.exports[bFooId!]
    expect(bFooHistory.some((c) => c.kind === 'Renamed')).toBe(true)
    expect(bFooHistory.find((c) => c.kind === 'Renamed')?.sha).toBe(
      updateCommit.hash
    )

    // Old IDs are merged into the new entries (no separate Removed events)
    expect(report.exports['src/a.ts::foo']).toBeUndefined()
    expect(report.exports['src/b.ts::foo']).toBeUndefined()
  })

  test('records deprecation events when @deprecated is added', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const foo = 1`, 'v1')
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `/** @deprecated use bar */\nexport const foo = 1`,
      'deprecate foo'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const fooId = getPrimaryId(report, 'foo')
    expect(fooId).toBeDefined()
    const deprecatedChange = report.exports[fooId!].find(
      (change) => change.kind === 'Deprecated'
    )
    expect(deprecatedChange?.sha).toBe(c2.hash)
    expect((deprecatedChange as { message?: string })?.message).toBe('use bar')
  })

  test('parses deprecation message with JSDoc link', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const foo = 1`, 'v1')
    // JSDoc with {@link SomeOther} syntax produces an array of JSDocComment nodes
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `/** @deprecated Use {@link bar} instead */\nexport const foo = 1`,
      'deprecate with link'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const fooId = getPrimaryId(report, 'foo')
    expect(fooId).toBeDefined()
    const deprecatedChange = report.exports[fooId!].find(
      (change) => change.kind === 'Deprecated'
    )
    expect(deprecatedChange?.sha).toBe(c2.hash)
    // Should preserve the full text including the link target name
    const message = (deprecatedChange as { message?: string })?.message
    expect(message).toBeDefined()
    expect(message).not.toContain('[object Object]')
    expect(message).toBe('Use bar instead')
  })

  test('detects deprecation in line comments', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const foo = 1`, 'v1')
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `export const foo = 1 // @deprecated, use bar instead`,
      'deprecate foo via line comment'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const fooId = getPrimaryId(report, 'foo')
    expect(fooId).toBeDefined()
    const deprecatedChange = report.exports[fooId!].find(
      (change) => change.kind === 'Deprecated'
    )
    expect(deprecatedChange?.sha).toBe(c2.hash)
    expect((deprecatedChange as { message?: string })?.message).toContain(
      'use bar instead'
    )
  })

  test('collapses oscillating add/remove within same release', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    // Empty baseline so 'add foo' enters the comparison path
    commitFile(repoRoot, 'src/index.ts', `export {}`, 'baseline')
    // First commit in release r1
    commitFile(repoRoot, 'src/index.ts', `export const foo = 1`, 'add foo')
    tag(repoRoot, 'r1')

    // In release r2: remove foo, then re-add it (both commits get release r2)
    commitFile(repoRoot, 'src/index.ts', `export const bar = 2`, 'remove foo')
    commitFile(
      repoRoot,
      'src/index.ts',
      `export const foo = 1; export const bar = 2`,
      're-add foo'
    )
    tag(repoRoot, 'r2')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const fooId = getPrimaryId(report, 'foo')
    expect(fooId).toBeDefined()

    // foo should only have "Added" from r1, no Removed/Added oscillation in r2
    const fooHistory = report.exports[fooId!]
    expect(fooHistory).toHaveLength(1)
    expect(fooHistory[0].kind).toBe('Added')
    expect(fooHistory[0].release).toBe('r1')
  })

  test('detects body updates', async ({ repoRoot, cacheDirectory }) => {
    commitFile(
      repoRoot,
      'src/index.ts',
      `export function doThing() { return 1 }`,
      'v1'
    )
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `export function doThing() { return 999 }`,
      'v2'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({
        entry: 'src/index.ts',
        detectUpdates: true,
        updateMode: 'body',
      })
    )

    const doThingId = getPrimaryId(report, 'doThing')
    expect(doThingId).toBeDefined()
    const updateChange = report.exports[doThingId!].find(
      (c) => c.kind === 'Updated'
    )
    expect(updateChange).toBeDefined()
    expect(updateChange?.sha).toBe(c2.hash)
  })

  test('handles directory module resolution (index files)', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(
      repoRoot,
      'src/utils/index.ts',
      `export const util = true`,
      'add utils index'
    )
    // Empty entry baseline so the real barrel enters the comparison path
    commitFile(repoRoot, 'src/main.ts', `export {}`, 'baseline main')
    commitFile(repoRoot, 'src/main.ts', `export * from './utils'`, 'add main')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(store.getExportHistory({ entry: 'src/main.ts' }))

    expect(Object.keys(report.exports)).toHaveLength(1)
    expect(getPrimaryId(report, 'util')).toBeDefined()
  })

  test('maps git tags to release history', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    // Empty baseline so 'feat' enters the comparison path
    commitFile(repoRoot, 'src/index.ts', `export {}`, 'baseline')
    commitFile(repoRoot, 'src/index.ts', `export const v1 = true`, 'feat')
    tag(repoRoot, 'v1.0.0')
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `export const v1 = true; export const v2 = true`,
      'feat 2'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const v1Id = getPrimaryId(report, 'v1')
    expect(v1Id).toBeDefined()
    expect(report.exports[v1Id!].find((c) => c.kind === 'Added')?.release).toBe(
      'v1.0.0'
    )

    const v2Id = getPrimaryId(report, 'v2')
    expect(v2Id).toBeDefined()
    expect(report.exports[v2Id!].find((c) => c.kind === 'Added')?.sha).toBe(
      c2.hash
    )
  })

  test('scopes export history to a specific release tag', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export {}`, 'baseline')
    commitFile(repoRoot, 'src/index.ts', `export const a = 1`, 'r1 feat')
    tag(repoRoot, 'r1')
    commitFile(
      repoRoot,
      'src/index.ts',
      `export const a = 1; export const b = 2`,
      'r2 feat'
    )
    tag(repoRoot, 'r2')
    commitFile(
      repoRoot,
      'src/index.ts',
      `export const a = 1; export const b = 2; export const c = 3`,
      'r3 feat'
    )
    tag(repoRoot, 'r3')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({
        entry: 'src/index.ts',
        ref: 'r2',
      })
    )

    const bId = getPrimaryId(report, 'b')
    expect(bId).toBeDefined()
    expect(report.exports[bId!].some((change) => change.kind === 'Added')).toBe(
      true
    )

    const releases = Object.values(report.exports)
      .flat()
      .map((change) => change.release)
    expect(releases.length).toBeGreaterThan(0)
    expect(releases.every((release) => release === 'r2')).toBe(true)

    expect(getPrimaryId(report, 'c')).toBeUndefined()
  })

  test('uses the nearest ancestor tag as the release baseline', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export {}`, 'baseline')
    commitFile(repoRoot, 'src/index.ts', `export const a = 1`, 'r1 feat')
    tag(repoRoot, 'r1')

    git(repoRoot, ['checkout', '-b', 'side'])
    commitFile(repoRoot, 'src/index.ts', `export const side = 1`, 'side feat')
    tag(repoRoot, 'side-tag')

    git(repoRoot, ['checkout', 'main'])
    commitFile(
      repoRoot,
      'src/index.ts',
      `export const a = 1; export const b = 2`,
      'r2 feat'
    )
    tag(repoRoot, 'r2')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({
        entry: 'src/index.ts',
        ref: 'r2',
      })
    )

    const bId = getPrimaryId(report, 'b')
    expect(bId).toBeDefined()
    expect(report.exports[bId!].some((change) => change.kind === 'Added')).toBe(
      true
    )

    const allChanges = Object.values(report.exports).flat()
    expect(allChanges.some((change) => change.name === 'side')).toBe(false)
  })

  test('ref "latest" resolves to the most recent release tag', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export {}`, 'baseline')
    commitFile(repoRoot, 'src/index.ts', `export const a = 1`, 'r1 feat')
    tag(repoRoot, 'r1')
    commitFile(
      repoRoot,
      'src/index.ts',
      `export const a = 1; export const b = 2`,
      'r2 feat'
    )
    tag(repoRoot, 'r2')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({
        entry: 'src/index.ts',
        ref: 'latest',
      })
    )

    const bId = getPrimaryId(report, 'b')
    expect(bId).toBeDefined()
    expect(
      report.exports[bId!].find((change) => change.kind === 'Added')
    ).toBeDefined()
    expect(
      Object.values(report.exports)
        .flat()
        .every((change) => change.release === 'r2')
    ).toBe(true)
  })

  test('supports commit ref strings and { end } ref objects', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export {}`, 'baseline')
    commitFile(repoRoot, 'src/index.ts', `export const a = 1`, 'v1')
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `export const a = 1; export const b = 2`,
      'v2'
    )
    commitFile(
      repoRoot,
      'src/index.ts',
      `export const a = 1; export const b = 2; export const c = 3`,
      'v3'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })

    const byString = await drain(
      store.getExportHistory({
        entry: 'src/index.ts',
        ref: c2.hash,
      })
    )
    const byObject = await drain(
      store.getExportHistory({
        entry: 'src/index.ts',
        ref: { end: c2.hash },
      })
    )

    const stringBId = getPrimaryId(byString, 'b')
    const objectBId = getPrimaryId(byObject, 'b')
    expect(stringBId).toBeDefined()
    expect(objectBId).toBeDefined()
    expect(
      byString.exports[stringBId!].find((change) => change.kind === 'Added')
        ?.sha
    ).toBe(c2.hash)
    expect(
      byObject.exports[objectBId!].find((change) => change.kind === 'Added')
        ?.sha
    ).toBe(c2.hash)

    expect(getPrimaryId(byString, 'c')).toBeUndefined()
    expect(getPrimaryId(byObject, 'c')).toBeUndefined()
  })

  test('throws for invalid ref specifiers', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const a = 1`, 'init')
    tag(repoRoot, 'r1')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })

    await expect(
      drain(
        store.getExportHistory({
          entry: 'src/index.ts',
          ref: 'does-not-exist',
        })
      )
    ).rejects.toThrow(/Invalid ref/)

    await expect(
      drain(
        store.getExportHistory({
          entry: 'src/index.ts',
          ref: '   ',
        })
      )
    ).rejects.toThrow(/Invalid ref/)
  })

  test('rejects refs that look like git flags', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const a = 1`, 'init')

    expect(
      () =>
        new GitFileSystem({
          repository: repoRoot,
          cacheDirectory,
          ref: '--help',
        })
    ).toThrow(/must not start with "-"/)
  })

  test('throws when ref range start is not an ancestor of end', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const a = 1`, 'init')
    git(repoRoot, ['checkout', '-b', 'side'])
    const side = commitFile(
      repoRoot,
      'src/index.ts',
      `export const side = 1`,
      'side'
    )
    git(repoRoot, ['checkout', 'main'])
    const main = commitFile(
      repoRoot,
      'src/index.ts',
      `export const main = 1`,
      'main'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })

    await expect(
      drain(
        store.getExportHistory({
          entry: 'src/index.ts',
          ref: { start: side.hash, end: main.hash },
        })
      )
    ).rejects.toThrow(/not an ancestor/i)
  })

  test('respects maxDepth to prevent infinite recursion or deep chains', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/C.ts', `export const final = 1`, 'c')
    commitFile(repoRoot, 'src/B.ts', `export * from './C'`, 'b')
    commitFile(repoRoot, 'src/A.ts', `export * from './B'`, 'a')
    commitFile(repoRoot, 'src/main.ts', `export * from './A'`, 'main')

    using store = new GitFileSystem({
      repository: repoRoot,
      cacheDirectory,
      maxDepth: 1,
    })
    const report = await drain(store.getExportHistory({ entry: 'src/main.ts' }))

    expect(report.nameToId['final']).toBeUndefined()
    expect(report.parseWarnings?.length).toBeGreaterThan(0)
    expect(report.parseWarnings![0]).toContain('Max depth exceeded')
  })

  test('handles default exports correctly', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(
      repoRoot,
      'src/index.ts',
      `export default function MyComponent() {}`,
      'init'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const defaultId = getPrimaryId(report, 'default')
    expect(defaultId).toBeDefined()
    expect(defaultId).toContain('src/index.ts')
  })

  test('handles mixed named and default exports', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(
      repoRoot,
      'src/index.ts',
      `export const a = 1;\nconst b = 2;\nexport default b;`,
      'init'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    expect(getPrimaryId(report, 'a')).toBeDefined()
    expect(getPrimaryId(report, 'default')).toBeDefined()
  })

  test('resolves entry directories to index files', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const foo = 1`, 'init')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(store.getExportHistory({ entry: 'src' }))

    expect(report.entryFiles).toContain('src/index.ts')
    expect(getPrimaryId(report, 'foo')).toBeDefined()
  })

  test('throws when entry directory has no index file', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/other.ts', `export const x = 1`, 'init')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    await expect(
      drain(store.getExportHistory({ entry: 'src' }))
    ).rejects.toThrow(/Could not resolve any entry files/)
  })

  test('throws helpful errors for invalid refs', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const foo = 1`, 'init')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })

    await expect(
      drain(
        store.getExportHistory({
          entry: 'src/index.ts',
          ref: { start: 'nope' },
        })
      )
    ).rejects.toThrow(/Invalid ref\.start/)

    await expect(
      drain(
        store.getExportHistory({
          entry: 'src/index.ts',
          ref: { end: 'also-nope' },
        })
      )
    ).rejects.toThrow(/Invalid ref\.end/)

    await expect(
      drain(
        store.getExportHistory({
          entry: 'src/index.ts',
          ref: {} as any,
        })
      )
    ).rejects.toThrow(/start.*end/)
  })

  test('skips update events when detectUpdates is false', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(
      repoRoot,
      'src/index.ts',
      `export function doThing() { return 1 }`,
      'v1'
    )
    commitFile(
      repoRoot,
      'src/index.ts',
      `export function doThing() { return 2 }`,
      'v2'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({
        entry: 'src/index.ts',
        detectUpdates: false,
      })
    )

    const doThingId = getPrimaryId(report, 'doThing')
    expect(doThingId).toBeDefined()
    expect(
      report.exports[doThingId!].find((change) => change.kind === 'Updated')
    ).toBeUndefined()
  })

  test('detects signature updates when updateMode is signature', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(
      repoRoot,
      'src/index.ts',
      `export function doThing(a: number) { return a }`,
      'v1'
    )
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `export function doThing(a: number, b: number) { return a + b }`,
      'v2'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({
        entry: 'src/index.ts',
        updateMode: 'signature',
      })
    )

    const doThingId = getPrimaryId(report, 'doThing')
    expect(doThingId).toBeDefined()
    const updatedChange = report.exports[doThingId!].find(
      (change) => change.kind === 'Updated'
    )
    expect(updatedChange?.sha).toBe(c2.hash)
  })

  test('supports re-export aliases and namespace exports', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(
      repoRoot,
      'src/lib.ts',
      `export const foo = 1; export const bar = 2`,
      'lib'
    )
    commitFile(
      repoRoot,
      'src/index.ts',
      `export { foo as baz } from './lib'; export * as ns from './lib'`,
      'barrel'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const bazId = getPrimaryId(report, 'baz')
    expect(bazId).toBeDefined()
    expect(bazId).toContain('src/lib.ts')

    const nsId = getPrimaryId(report, 'ns')
    expect(nsId).toBeDefined()
    expect(nsId).toContain('__NAMESPACE__')
  })

  test('handles export assignment (export =)', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `const foo = 1; export = foo`, 'init')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    expect(getPrimaryId(report, 'default')).toBeDefined()
  })

  test('respects star export precedence (first wins)', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/a.ts', `export const value = 1`, 'a')
    commitFile(repoRoot, 'src/b.ts', `export const value = 2`, 'b')
    commitFile(
      repoRoot,
      'src/index.ts',
      `export * from './a'; export * from './b'`,
      'barrel'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const valueId = getPrimaryId(report, 'value')
    expect(valueId).toBeDefined()
    expect(valueId).toContain('src/a.ts')
  })

  test('detects file rename via git mv', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/a.ts', `export const core = 1`, 'add a')
    commitFile(
      repoRoot,
      'src/index.ts',
      `export { core } from './a'`,
      'barrel a'
    )

    git(repoRoot, ['mv', 'src/a.ts', 'src/b.ts'])
    writeFileSync(join(repoRoot, 'src/index.ts'), `export { core } from './b'`)
    git(repoRoot, ['add', 'src/index.ts'])
    git(repoRoot, ['commit', '--no-gpg-sign', '-m', 'rename file'])
    const renameCommitHash = git(repoRoot, ['log', '-1', '--format=%H'])

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const coreId = getPrimaryId(report, 'core')
    expect(coreId).toBeDefined()
    expect(coreId).toContain('src/b.ts')

    const renameChange = report.exports[coreId!].find(
      (change) => change.kind === 'Renamed'
    )
    expect(renameChange?.sha).toBe(renameCommitHash)
  })

  test('rename: export name only (same file, different name)', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    // Create a file with an export - use a larger function body so the name
    // is a small portion of the signature (enabling rename detection)
    const funcBody = `export function createProcessor(input: string, options?: { trim?: boolean; uppercase?: boolean }): string {
  let result = input
  if (options?.trim) result = result.trim()
  if (options?.uppercase) result = result.toUpperCase()
  return result
}`
    const renamedFuncBody = funcBody.replace(
      'createProcessor',
      'buildProcessor'
    )

    commitFile(repoRoot, 'src/lib.ts', funcBody, 'add lib')
    commitFile(
      repoRoot,
      'src/index.ts',
      `export { createProcessor } from './lib'`,
      'export createProcessor'
    )

    // Rename the export in the source file AND update barrel in same commit
    const renameCommit = commitFiles(
      repoRoot,
      [
        { filename: 'src/lib.ts', content: renamedFuncBody },
        {
          filename: 'src/index.ts',
          content: `export { buildProcessor } from './lib'`,
        },
      ],
      'rename to buildProcessor'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const newId = getPrimaryId(report, 'buildProcessor')
    expect(newId).toBeDefined()
    expect(newId).toContain('src/lib.ts')

    const renameChange = report.exports[newId!].find(
      (change) => change.kind === 'Renamed'
    )
    expect(renameChange).toBeDefined()
    expect(renameChange?.sha).toBe(renameCommit.hash)
    // filePath should be the current file
    expect(renameChange?.filePath).toBe('src/lib.ts')
    // Export name changed, so previousName should be set
    expect(renameChange?.previousName).toBe('createProcessor')
    // File didn't change, so previousFilePath should NOT be set
    expect(renameChange?.previousFilePath).toBeUndefined()
    expect(renameChange?.previousId).toBe('src/lib.ts::createProcessor')
  })

  test('rename: file only (different file, same export name)', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    // Create a file with an export
    commitFile(repoRoot, 'src/a.ts', `export const core = 1`, 'add a')
    commitFile(
      repoRoot,
      'src/index.ts',
      `export { core } from './a'`,
      'export core'
    )

    // Move to a different file with the same export name
    const renameCommit = commitFiles(
      repoRoot,
      [
        { filename: 'src/a.ts', content: 'export {}' },
        { filename: 'src/b.ts', content: 'export const core = 1' },
        { filename: 'src/index.ts', content: `export { core } from './b'` },
      ],
      'move core to b'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const coreId = getPrimaryId(report, 'core')
    expect(coreId).toBeDefined()
    expect(coreId).toContain('src/b.ts')

    const renameChange = report.exports[coreId!].find(
      (change) => change.kind === 'Renamed'
    )
    expect(renameChange).toBeDefined()
    expect(renameChange?.sha).toBe(renameCommit.hash)
    // filePath should be the new file
    expect(renameChange?.filePath).toBe('src/b.ts')
    // Export name didn't change, so previousName should NOT be set
    expect(renameChange?.previousName).toBeUndefined()
    // File changed, so previousFilePath should be set
    expect(renameChange?.previousFilePath).toBe('src/a.ts')
    expect(renameChange?.previousId).toBe('src/a.ts::core')
  })

  test('rename: both file and export name', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    // Create a file with an export - use a larger function body so the name
    // is a small portion of the signature (enabling rename detection)
    const funcBody = `export function createValidator(schema: object, options?: { strict?: boolean; allowExtra?: boolean }): (data: unknown) => boolean {
  return (data) => {
    if (typeof data !== 'object') return false
    if (options?.strict && data === null) return false
    return true
  }
}`
    const renamedFuncBody = funcBody.replace(
      'createValidator',
      'buildValidator'
    )

    commitFile(repoRoot, 'src/old.ts', funcBody, 'add old')
    commitFile(
      repoRoot,
      'src/index.ts',
      `export { createValidator } from './old'`,
      'export createValidator'
    )

    // Move to a different file AND rename the export using git mv for proper rename detection
    git(repoRoot, ['mv', 'src/old.ts', 'src/new.ts'])
    writeFileSync(join(repoRoot, 'src/new.ts'), renamedFuncBody)
    writeFileSync(
      join(repoRoot, 'src/index.ts'),
      `export { buildValidator } from './new'`
    )
    git(repoRoot, ['add', 'src/new.ts', 'src/index.ts'])
    git(repoRoot, ['commit', '--no-gpg-sign', '-m', 'move and rename'])
    const renameCommitHash = git(repoRoot, ['log', '-1', '--format=%H'])

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const newNameId = getPrimaryId(report, 'buildValidator')
    expect(newNameId).toBeDefined()
    expect(newNameId).toContain('src/new.ts')

    const renameChange = report.exports[newNameId!].find(
      (change) => change.kind === 'Renamed'
    )
    expect(renameChange).toBeDefined()
    expect(renameChange?.sha).toBe(renameCommitHash)
    // filePath should be the new file
    expect(renameChange?.filePath).toBe('src/new.ts')
    // Export name changed, so previousName should be set
    expect(renameChange?.previousName).toBe('createValidator')
    // File changed, so previousFilePath should be set
    expect(renameChange?.previousFilePath).toBe('src/old.ts')
    expect(renameChange?.previousId).toBe('src/old.ts::createValidator')
  })

  test('rename: alias change only (same underlying ID)', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    // Create a source file and barrel that re-exports with an alias
    commitFile(repoRoot, 'src/lib.ts', `export const foo = 1`, 'add lib')
    commitFile(
      repoRoot,
      'src/index.ts',
      `export { foo as bar } from './lib'`,
      'export as bar'
    )

    // Change the alias in the barrel (same underlying source)
    commitFile(
      repoRoot,
      'src/index.ts',
      `export { foo as baz } from './lib'`,
      'rename alias to baz'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts' })
    )

    const bazId = getPrimaryId(report, 'baz')
    expect(bazId).toBeDefined()
    expect(bazId).toContain('src/lib.ts::foo')

    const renameChange = report.exports[bazId!].find(
      (change) => change.kind === 'Renamed'
    )
    expect(renameChange).toBeDefined()
    // filePath should be the source file
    expect(renameChange?.filePath).toBe('src/lib.ts')
    // The alias changed from bar to baz
    expect(renameChange?.previousName).toBe('bar')
    // The underlying file didn't change (same ID)
    expect(renameChange?.previousFilePath).toBeUndefined()
    // Same underlying ID
    expect(renameChange?.previousId).toBe(bazId)
  })

  test('rejects unsafe repo paths', async ({ repoRoot, cacheDirectory }) => {
    commitFile(repoRoot, 'src/index.ts', `export const ok = 1`, 'init')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    await expect(store.readFile('../secret.txt')).rejects.toThrow(
      /Invalid (repo )?path/
    )
    await expect(store.readFile('a:b')).rejects.toThrow(/Invalid (repo )?path/)
  })

  test('prevents writes through symlinks escaping the repo', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const ok = 1`, 'init')

    const outsideDir = mkdtempSync(join(tmpdir(), 'renoun-test-outside-'))
    try {
      const linkPath = join(repoRoot, 'escape')
      symlinkSync(outsideDir, linkPath, 'dir')

      using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
      await expect(
        store.writeFile('escape/secret.txt', 'nope')
      ).rejects.toThrow(/via symlink/i)
    } finally {
      rmSync(outsideDir, { recursive: true, force: true })
    }
  })

  test('getFileMetadata aggregates authors and commit bounds', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    const c1 = commitFile(repoRoot, 'src/data.txt', `alpha`, 'first', {
      name: 'Alice',
      email: 'alice@example.com',
    })
    const c2 = commitFile(repoRoot, 'src/data.txt', `beta`, 'second', {
      name: 'Bob',
      email: 'bob@example.com',
    })

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const meta = await store.getFileMetadata('src/data.txt')

    expect(meta.kind).toBe('file')
    expect(meta.firstCommitHash).toBe(c1.hash)
    expect(meta.lastCommitHash).toBe(c2.hash)
    expect(meta.authors.map((author) => author.name)).toEqual(
      expect.arrayContaining(['Alice', 'Bob'])
    )

    const alice = meta.authors.find((author) => author.name === 'Alice')
    const bob = meta.authors.find((author) => author.name === 'Bob')
    expect(alice?.commitCount).toBe(1)
    expect(bob?.commitCount).toBe(1)
  })

  test('getFileMetadata distinguishes non-GitHub authors sharing a name by email', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/data.txt', `alpha`, 'first', {
      name: 'Chris',
      email: 'chris.one@example.com',
    })
    commitFile(repoRoot, 'src/data.txt', `beta`, 'second', {
      name: 'Chris',
      email: 'chris.two@example.com',
    })

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const meta = await store.getFileMetadata('src/data.txt')

    expect(meta.authors).toHaveLength(2)
    expect(
      meta.authors
        .map((author) => author.commitCount)
        .sort((countA, countB) => countA - countB)
    ).toEqual([1, 1])
  })

  test('getFileMetadata aggregates non-GitHub author name changes by email', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/data.txt', `alpha`, 'first', {
      name: 'Alicia',
      email: 'alice@example.com',
    })
    commitFile(repoRoot, 'src/data.txt', `beta`, 'second', {
      name: 'Alice',
      email: 'alice@example.com',
    })

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const meta = await store.getFileMetadata('src/data.txt')

    expect(meta.authors).toHaveLength(1)
    expect(meta.authors[0]?.commitCount).toBe(2)
  })

  test('derives githubProfileUrl from GitHub noreply commit emails', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/data.txt', `alpha`, 'first', {
      name: 'Alice',
      email: '12345+alice-dev@users.noreply.github.com',
    })

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const meta = await store.getFileMetadata('src/data.txt')
    const [author] = meta.authors

    expect(author).toMatchObject({
      name: 'Alice',
      commitCount: 1,
      githubProfileUrl: 'https://github.com/alice-dev',
    })
    expect('email' in ((author ?? {}) as GitAuthor)).toBeFalsy()
  })

  test('getModuleMetadata reports only head exports', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    const c1 = commitFile(
      repoRoot,
      'src/index.ts',
      `export const a = 1; export const b = 2`,
      'v1'
    )
    const c2 = commitFile(repoRoot, 'src/index.ts', `export const a = 1`, 'v2')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const meta = await store.getModuleMetadata('src/index.ts')

    expect(meta.kind).toBe('module')
    expect(meta.exports.a).toBeDefined()
    expect(meta.exports.b).toBeUndefined()
    expect(meta.exports.a?.firstCommitHash).toBe(c1.hash)
    expect(meta.exports.a?.lastCommitHash).toBe(c2.hash)
  })

  test('metadata helpers return undefined for missing paths', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const ok = 1`, 'init')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    expect(store.getFileByteLengthSync('missing.txt')).toBeUndefined()
    await expect(
      store.getFileByteLength('missing.txt')
    ).resolves.toBeUndefined()
    expect(store.getFileLastModifiedMsSync('missing.txt')).toBeUndefined()
    await expect(store.getFileLastModifiedMs('missing.txt')).resolves.toBe(
      undefined
    )
  })

  test('prefers worktree content for local repos when ref is implicit', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/tracked.txt', 'v1', 'init')

    writeFileSync(join(repoRoot, 'src/tracked.txt'), 'v2')
    writeFileSync(join(repoRoot, 'src/untracked.txt'), 'new')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    expect(store.readFileSync('src/tracked.txt')).toBe('v2')
    expect(store.readFileSync('src/untracked.txt')).toBe('new')

    const entries = store.readDirectorySync('src')
    expect(
      entries.some((entry) => entry.path.endsWith('src/untracked.txt'))
    ).toBe(true)
  })

  test('uses git objects when ref is explicit', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/tracked.txt', 'v1', 'init')

    writeFileSync(join(repoRoot, 'src/tracked.txt'), 'v2')
    writeFileSync(join(repoRoot, 'src/untracked.txt'), 'new')

    using store = new GitFileSystem({
      repository: repoRoot,
      cacheDirectory,
      ref: 'HEAD',
    })
    expect(store.readFileSync('src/tracked.txt')).toBe('v1')
    expect(() => store.readFileSync('src/untracked.txt')).toThrow()

    const entries = store.readDirectorySync('src')
    expect(
      entries.some((entry) => entry.path.endsWith('src/untracked.txt'))
    ).toBe(false)
  })

  test('export history supports multiple entry files', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/a.ts', `export const a = 1`, 'add a')
    commitFile(repoRoot, 'src/b.ts', `export const b = 1`, 'add b')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({
        entry: ['src/a.ts', 'src/b.ts'],
      })
    )

    expect(getPrimaryId(report, 'a')).toBeDefined()
    expect(getPrimaryId(report, 'b')).toBeDefined()
  })

  test('export history carries forward when entry is missing', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    // Empty baseline so 'add one' enters the comparison path
    commitFile(repoRoot, 'src/one.ts', `export {}`, 'baseline')
    const c1 = commitFile(
      repoRoot,
      'src/one.ts',
      `export const one = 1`,
      'add one'
    )

    git(repoRoot, ['rm', '-f', '--', 'src/one.ts'])
    git(repoRoot, ['commit', '--no-gpg-sign', '-m', 'remove one'])

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(store.getExportHistory({ entry: 'src/one.ts' }))

    const oneId = getPrimaryId(report, 'one')
    expect(oneId).toBeDefined()
    const history = report.exports[oneId!]
    // Entry file is deleted in the last commit, but the carry-forward logic
    // preserves the previous export state (no Removed event for whole-file deletion).
    expect(history).toHaveLength(1)
    expect(history[0].kind).toBe('Added')
    expect(history[0].sha).toBe(c1.hash)
  })

  test('export history respects limit', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    // 3 commits: baseline, v1 (adds a), v2 (adds b)
    // limit: 2 gives us v1 + v2 — v1 becomes baseline, v2 produces events
    commitFile(repoRoot, 'src/index.ts', `export {}`, 'baseline')
    commitFile(repoRoot, 'src/index.ts', `export const a = 1`, 'v1')
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `export const a = 1; export const b = 2`,
      'v2'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({
        entry: 'src/index.ts',
        limit: 2,
      })
    )

    // b was added in v2 (relative to v1 baseline)
    const bId = getPrimaryId(report, 'b')
    expect(bId).toBeDefined()
    expect(report.exports[bId!][0].sha).toBe(c2.hash)
  })

  test('throws on shallow repos when autoFetch is false', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const a = 1`, 'v1')
    commitFile(repoRoot, 'src/index.ts', `export const a = 2`, 'v2')

    const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
    const bareRepo = join(bareRoot, 'repo.git')
    const shallowRoot = mkdtempSync(join(tmpdir(), 'renoun-test-shallow-'))
    const shallowRepo = join(shallowRoot, 'repo')

    try {
      git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
      const fileUrl = pathToFileURL(bareRepo).toString()
      git(tmpdir(), ['clone', '--depth', '1', fileUrl, shallowRepo])

      using store = new GitFileSystem({
        repository: shallowRepo,
        cacheDirectory,
        autoFetch: false,
      })

      await expect(store.getFileMetadata('src/index.ts')).rejects.toThrow(
        /shallow cloned/i
      )
    } finally {
      rmSync(bareRoot, { recursive: true, force: true })
      rmSync(shallowRoot, { recursive: true, force: true })
    }
  })

  test('unshallows when autoFetch is true', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const a = 1`, 'v1')
    commitFile(repoRoot, 'src/index.ts', `export const a = 2`, 'v2')

    const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
    const bareRepo = join(bareRoot, 'repo.git')
    const shallowRoot = mkdtempSync(join(tmpdir(), 'renoun-test-shallow-'))
    const shallowRepo = join(shallowRoot, 'repo')

    try {
      git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
      const fileUrl = pathToFileURL(bareRepo).toString()
      git(tmpdir(), ['clone', '--depth', '1', fileUrl, shallowRepo])

      using store = new GitFileSystem({
        repository: shallowRepo,
        cacheDirectory,
        autoFetch: true,
      })

      const meta = await store.getFileMetadata('src/index.ts')
      expect(meta.firstCommitHash).toBeDefined()
      expect(meta.lastCommitHash).toBeDefined()
      expect(meta.authors.length).toBeGreaterThan(0)
    } finally {
      rmSync(bareRoot, { recursive: true, force: true })
      rmSync(shallowRoot, { recursive: true, force: true })
    }
  })

  test('ensureCacheClone supports file URLs (async + sync)', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const a = 1`, 'init')

    const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
    const bareRepo = join(bareRoot, 'repo.git')
    const synccacheDirectory = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))

    try {
      git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
      const fileUrl = pathToFileURL(bareRepo).toString()

      const asyncClone = await ensureCacheClone({
        spec: fileUrl,
        cacheDirectory,
      })
      expect(existsSync(join(asyncClone, '.git'))).toBe(true)
      expect(basename(asyncClone)).toBe(createGitCloneDirectoryName(fileUrl))

      const syncClone = ensureCacheCloneSync({
        spec: fileUrl,
        cacheDirectory: synccacheDirectory,
      })
      expect(existsSync(join(syncClone, '.git'))).toBe(true)
      expect(basename(syncClone)).toBe(createGitCloneDirectoryName(fileUrl))
    } finally {
      rmSync(bareRoot, { recursive: true, force: true })
      rmSync(synccacheDirectory, { recursive: true, force: true })
    }
  })

  it.sequential(
    'reclones legacy cached repos with blobless filtering even when git backfill is unavailable',
    async () => {
      const cacheDirectory = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
      const spec = 'owner/repo'
      const target = join(cacheDirectory, createGitCloneDirectoryName(spec))
      mkdirSync(join(target, '.git'), { recursive: true })

      resetGitCapabilitySupportCachesForTests()

      try {
        const originalSpawnWithResult = spawnModule.spawnWithResult
        const spawnSpy = vi
          .spyOn(spawnModule, 'spawnWithResult')
          .mockImplementation(async (command, commandArguments, options) => {
            if (
              command === 'git' &&
              commandArguments[0] === 'backfill' &&
              commandArguments[1] === '-h'
            ) {
              return {
                status: 1,
                stdout: '',
                stderr: "git: 'backfill' is not a git command. See 'git --help'.",
              }
            }

            if (
              command === 'git' &&
              commandArguments[0] === 'clone' &&
              commandArguments[1] === '-h'
            ) {
              return {
                status: 129,
                stdout: 'usage: git clone\n    --filter <filter-spec>\n',
                stderr: '',
              }
            }

            if (
              command === 'git' &&
              commandArguments[0] === 'config' &&
              commandArguments[1] === '--get' &&
              commandArguments[2] === 'remote.origin.promisor'
            ) {
              return {
                status: 1,
                stdout: '',
                stderr: '',
              }
            }

            if (command === 'git' && commandArguments[0] === 'clone') {
              const cloneTarget = String(
                commandArguments[commandArguments.length - 1]
              )
              mkdirSync(join(cloneTarget, '.git'), { recursive: true })
              writeFileSync(
                join(cloneTarget, '.git', 'config'),
                '[remote "origin"]\n\tpromisor = true\n\tpartialclonefilter = blob:none\n',
                'utf8'
              )
              return {
                status: 0,
                stdout: '',
                stderr: '',
              }
            }

            return originalSpawnWithResult(command, commandArguments, options)
          })

        const clonedTarget = await ensureCacheClone({
          spec,
          cacheDirectory,
        })
        const cloneCall = spawnSpy.mock.calls.find(
          ([command, commandArguments]) =>
            command === 'git' &&
            commandArguments[0] === 'clone' &&
            commandArguments[1] !== '-h'
        )

        expect(clonedTarget).toBe(target)
        expect(cloneCall?.[1]).toContain('--filter=blob:none')
        expect(existsSync(join(target, '.git'))).toBe(true)
        expect(
          readdirSync(cacheDirectory).filter((entry) => entry.includes('.legacy-'))
        ).toEqual([])
      } finally {
        resetGitCapabilitySupportCachesForTests()
        vi.restoreAllMocks()
        rmSync(cacheDirectory, { recursive: true, force: true })
      }
    }
  )

  test('rejects scp-style clone URLs with query/hash suffixes', async ({
    cacheDirectory,
  }) => {
    await expect(
      ensureCacheClone({
        spec: 'git@github.com:org/repo.git?token=secret#frag',
        cacheDirectory,
      })
    ).rejects.toThrow('[GitFileSystem] Invalid clone URL')

    expect(() =>
      ensureCacheCloneSync({
        spec: 'git@github.com:org/repo.git?token=secret#frag',
        cacheDirectory,
      })
    ).toThrow('[GitFileSystem] Invalid clone URL')
  })

  test('updates cached clone when remote ref advances', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const value = 1`, 'v1')

    const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
    const bareRepo = join(bareRoot, 'repo.git')

    try {
      git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
      const fileUrl = pathToFileURL(bareRepo).toString()

      const cachedRepo = ensureCacheCloneSync({
        spec: fileUrl,
        cacheDirectory,
      })
      expect(existsSync(join(cachedRepo, '.git'))).toBe(true)

      git(repoRoot, ['remote', 'add', 'origin', fileUrl])
      git(repoRoot, ['push', '-u', 'origin', 'main'])

      commitFile(repoRoot, 'src/index.ts', `export const value = 2`, 'v2')
      git(repoRoot, ['push', 'origin', 'main'])

      using store = new GitFileSystem({
        repository: cachedRepo,
        cacheDirectory,
        ref: 'origin/main',
        autoFetch: true,
        verbose: true,
      })
      const content = store.readFileSync('src/index.ts')
      expect(content).toContain('value = 2')
    } finally {
      rmSync(bareRoot, { recursive: true, force: true })
    }
  })

  it.sequential(
    'does not force a second remote freshness check on warm explicit-ref reads',
    async () => {
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
        const spawnSpy = vi.spyOn(spawnModule, 'spawnWithResult')

        using store = new GitFileSystem({
          repository: cachedRepo,
          cacheDirectory,
          ref: 'main',
          autoFetch: true,
        })

        await drain(
          store.getExportHistory({
            entry: 'src/index.ts',
            __skipWarmup: true,
          } as ExportHistoryOptions & { __skipWarmup: true })
        )
        const firstLsRemoteCount = spawnSpy.mock.calls.filter(
          ([command, commandArguments]) =>
            command === 'git' &&
            commandArguments[0] === 'ls-remote' &&
            commandArguments[1] === 'origin'
        ).length

        await drain(
          store.getExportHistory({
            entry: 'src/index.ts',
            __skipWarmup: true,
          } as ExportHistoryOptions & { __skipWarmup: true })
        )
        const secondLsRemoteCount = spawnSpy.mock.calls.filter(
          ([command, commandArguments]) =>
            command === 'git' &&
            commandArguments[0] === 'ls-remote' &&
            commandArguments[1] === 'origin'
        ).length

        expect(firstLsRemoteCount).toBeGreaterThan(0)
        expect(secondLsRemoteCount).toBe(firstLsRemoteCount)
      } finally {
        vi.restoreAllMocks()
        rmSync(repoRoot, { recursive: true, force: true })
        rmSync(cacheDirectory, { recursive: true, force: true })
        rmSync(bareRoot, { recursive: true, force: true })
      }
    }
  )

  test('reads remote cached clones after switching explicit branch refs', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(
      repoRoot,
      'src/nodes/TSL.js',
      `export const branch = 'shared'`,
      'init'
    )
    git(repoRoot, ['branch', '-m', 'dev'])
    git(repoRoot, ['branch', 'master'])

    const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
    const bareRepo = join(bareRoot, 'repo.git')

    try {
      git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
      git(bareRepo, ['symbolic-ref', 'HEAD', 'refs/heads/dev'])
      const fileUrl = pathToFileURL(bareRepo).toString()

      using devStore = new GitFileSystem({
        repository: fileUrl,
        cacheDirectory,
        ref: 'dev',
      })
      expect(
        (await devStore.readDirectory('src/nodes')).map((entry) => entry.name)
      ).toContain('TSL.js')

      using masterStore = new GitFileSystem({
        repository: fileUrl,
        cacheDirectory,
        ref: 'master',
      })
      expect(
        (await masterStore.readDirectory('src/nodes')).map(
          (entry) => entry.name
        )
      ).toContain('TSL.js')
      expect(
        masterStore.readDirectorySync('src/nodes').map((entry) => entry.name)
      ).toContain('TSL.js')
      expect(await masterStore.readFile('src/nodes/TSL.js')).toContain(
        `branch = 'shared'`
      )
      expect(masterStore.readFileSync('src/nodes/TSL.js')).toContain(
        `branch = 'shared'`
      )
    } finally {
      rmSync(bareRoot, { recursive: true, force: true })
    }
  })

  test('analyzes exports from remote cached clones after switching explicit branch refs', async ({
    repoRoot,
    cacheDirectory,
  }) => {
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
          content: `export const branch = 'shared'`,
        },
      ],
      'init'
    )
    git(repoRoot, ['branch', '-m', 'dev'])
    git(repoRoot, ['branch', 'master'])
    git(repoRoot, ['checkout', 'master'])
    commitFile(
      repoRoot,
      'src/nodes/procedural/Checker.js',
      `export const Checker = 'master'`,
      'checker'
    )
    git(repoRoot, ['checkout', 'dev'])

    const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
    const bareRepo = join(bareRoot, 'repo.git')

    try {
      git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
      git(bareRepo, ['symbolic-ref', 'HEAD', 'refs/heads/dev'])
      const fileUrl = pathToFileURL(bareRepo).toString()
      const spawnSpy = vi.spyOn(spawnModule, 'spawnWithResult')

      using masterStore = new GitFileSystem({
        repository: fileUrl,
        cacheDirectory,
        ref: 'master',
        sparse: ['src/nodes'],
      })

      expect(
        (await masterStore.readDirectory('src/nodes/procedural')).map(
          (entry) => entry.name
        )
      ).toContain('Checker.js')

      const filePath = masterStore.getAbsolutePath(
        'src/nodes/procedural/Checker.js'
      )
      const exports = await masterStore.getFileExports(filePath)

      expect(exports.map((entry) => entry.name)).toContain('Checker')

      const sparseDisableCalls = spawnSpy.mock.calls.filter(
        ([command, commandArguments]) =>
          command === 'git' &&
          commandArguments[0] === 'sparse-checkout' &&
          commandArguments[1] === 'disable'
      )
      const resetHardCalls = spawnSpy.mock.calls.filter(
        ([command, commandArguments]) =>
          command === 'git' &&
          commandArguments[0] === 'reset' &&
          commandArguments[1] === '--hard' &&
          commandArguments[2] === 'HEAD'
      )
      const analysisSparseScopeCall = [...spawnSpy.mock.calls]
        .reverse()
        .find(
          ([command, commandArguments, options]) =>
            command === 'git' &&
            commandArguments[0] === 'sparse-checkout' &&
            (commandArguments[1] === 'set' || commandArguments[1] === 'add') &&
            typeof options?.cwd === 'string' &&
            options.cwd.startsWith(join(cacheDirectory, '_analysis'))
        )

      expect(sparseDisableCalls).toHaveLength(0)
      expect(resetHardCalls).toHaveLength(0)
      expect(analysisSparseScopeCall?.[1]).toContain('src')
      expect(analysisSparseScopeCall?.[1]).not.toContain('.')
    } finally {
      vi.restoreAllMocks()
      rmSync(bareRoot, { recursive: true, force: true })
    }
  })

  it.sequential(
    'reuses the commit-scoped explicit-ref analysis worktree when another process wins the add race',
    async () => {
      const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
      const cacheDirectory = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
      const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
      const bareRepo = join(bareRoot, 'repo.git')
      initRepo(repoRoot)

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
              filename: 'src/index.js',
              content: `export const value = 1`,
            },
          ],
          'init'
        )

        git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
        const fileUrl = pathToFileURL(bareRepo).toString()

        git(repoRoot, ['remote', 'add', 'origin', fileUrl])
        git(repoRoot, ['push', '-u', 'origin', 'main'])

        const originalSpawnWithResult = spawnModule.spawnWithResult
        let simulatedRace = false
        const spawnSpy = vi
          .spyOn(spawnModule, 'spawnWithResult')
          .mockImplementation(async (command, commandArguments, options) => {
            if (
              !simulatedRace &&
              command === 'git' &&
              commandArguments[0] === 'worktree' &&
              commandArguments[1] === 'add'
            ) {
              simulatedRace = true
              const analysisRoot = String(commandArguments[4] ?? '')
              const refCommit = String(commandArguments[5] ?? '')

              const winnerResult = await originalSpawnWithResult(
                command,
                commandArguments,
                options
              )
              expect(winnerResult.status).toBe(0)

              return {
                status: 128,
                stdout: '',
                stderr:
                  `fatal: Unable to create '${join(
                    options.cwd,
                    '.git',
                    'worktrees',
                    basename(analysisRoot),
                    'index.lock'
                  )}': File exists.\n\n` +
                  'Another git process seems to be running in this repository.',
              }
            }

            return originalSpawnWithResult(command, commandArguments, options)
          })

        using store = new GitFileSystem({
          repository: fileUrl,
          cacheDirectory,
          ref: 'main',
          sparse: ['src'],
        })

        const exports = await store.getFileExports('src/index.js')
        const worktreeAddCall = spawnSpy.mock.calls.find(
          ([command, commandArguments]) =>
            command === 'git' &&
            commandArguments[0] === 'worktree' &&
            commandArguments[1] === 'add'
        )

        expect(simulatedRace).toBe(true)
        expect(exports.map((entry) => entry.name)).toContain('value')
        expect(String(worktreeAddCall?.[1][4] ?? '')).toContain(
          git(repoRoot, ['rev-parse', 'HEAD'])
        )
      } finally {
        vi.restoreAllMocks()
        rmSync(repoRoot, { recursive: true, force: true })
        rmSync(cacheDirectory, { recursive: true, force: true })
        rmSync(bareRoot, { recursive: true, force: true })
      }
    }
  )

  it.sequential(
    'merges explicit-ref analysis sparse scopes across GitFileSystem instances',
    async () => {
      const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
      const cacheDirectory = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
      const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
      const bareRepo = join(bareRoot, 'repo.git')
      initRepo(repoRoot)

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
              filename: 'src/nodes/Nodes.js',
              content: `export const NodeValue = 1`,
            },
            {
              filename: 'src/nodes/accessors/Arrays.js',
              content: `export const ArrayValue = 2`,
            },
          ],
          'init'
        )

        git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
        const fileUrl = pathToFileURL(bareRepo).toString()

        using firstStore = new GitFileSystem({
          repository: fileUrl,
          cacheDirectory,
          ref: 'main',
          sparse: ['src/nodes'],
        })
        using secondStore = new GitFileSystem({
          repository: fileUrl,
          cacheDirectory,
          ref: 'main',
          sparse: ['src/nodes'],
        })

        const firstPrepared = await firstStore.prepareAnalysis('src/nodes/Nodes.js')
        const firstExports = await firstStore.getFileExports('src/nodes/Nodes.js')
        expect(firstExports.map((entry) => entry.name)).toContain('NodeValue')
        expect(existsSync(firstPrepared.filePath)).toBe(true)

        const secondExports = await secondStore.getFileExports(
          'src/nodes/accessors/Arrays.js'
        )
        expect(secondExports.map((entry) => entry.name)).toContain('ArrayValue')
        expect(existsSync(firstPrepared.filePath)).toBe(true)

        const refreshedFirstExports = await firstStore.getFileExports(
          'src/nodes/Nodes.js'
        )

        expect(refreshedFirstExports.map((entry) => entry.name)).toContain(
          'NodeValue'
        )
      } finally {
        rmSync(repoRoot, { recursive: true, force: true })
        rmSync(cacheDirectory, { recursive: true, force: true })
        rmSync(bareRoot, { recursive: true, force: true })
      }
    }
  )

  it.sequential(
    'reuses an already prepared explicit-ref analysis sparse scope across fresh instances without rewriting it',
    async () => {
      const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
      const cacheDirectory = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
      const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
      const bareRepo = join(bareRoot, 'repo.git')
      initRepo(repoRoot)

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
              filename: 'src/nodes/core/NodeFunction.js',
              content: `export function NodeFunction() { return 1 }`,
            },
            {
              filename: 'src/other/Other.js',
              content: `export const otherValue = 2`,
            },
          ],
          'init'
        )

        git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
        const fileUrl = pathToFileURL(bareRepo).toString()

        using firstStore = new GitFileSystem({
          repository: fileUrl,
          cacheDirectory,
          ref: 'main',
          sparse: ['src/nodes'],
        })
        using secondStore = new GitFileSystem({
          repository: fileUrl,
          cacheDirectory,
          ref: 'main',
          sparse: ['src/nodes'],
        })

        const prepared = await firstStore.prepareAnalysis(
          'src/nodes/core/NodeFunction.js'
        )
        expect(existsSync(prepared.filePath)).toBe(true)

        const sparseCheckoutPath = git(dirname(prepared.filePath), [
          'rev-parse',
          '--git-path',
          'info/sparse-checkout',
        ])
        const beforeMtimeMs = statSync(sparseCheckoutPath).mtimeMs

        await new Promise((resolve) => setTimeout(resolve, 25))
        const secondPrepared = await secondStore.prepareAnalysis(
          'src/nodes/core/NodeFunction.js'
        )
        const afterMtimeMs = statSync(sparseCheckoutPath).mtimeMs

        expect(secondPrepared.filePath).toBe(prepared.filePath)
        expect(afterMtimeMs).toBe(beforeMtimeMs)
      } finally {
        rmSync(repoRoot, { recursive: true, force: true })
        rmSync(cacheDirectory, { recursive: true, force: true })
        rmSync(bareRoot, { recursive: true, force: true })
      }
    }
  )

  it.sequential(
    'bootstraps the full explicit-ref analysis worktree in production',
    async () => {
      const previousNodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
      const cacheDirectory = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
      const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
      const bareRepo = join(bareRoot, 'repo.git')
      initRepo(repoRoot)

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
              filename: 'src/nodes/core/NodeFunction.js',
              content: `export function NodeFunction() { return 1 }`,
            },
            {
              filename: 'src/nodes/utils/LoopNode.js',
              content: `export function LoopNode() { return NodeFunction() }`,
            },
            {
              filename: 'src/other/Other.js',
              content: `export const Other = 1`,
            },
          ],
          'init'
        )

        git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
        const fileUrl = pathToFileURL(bareRepo).toString()
        vi.spyOn(spawnModule, 'spawnWithResult')

        using store = new GitFileSystem({
          repository: fileUrl,
          cacheDirectory,
          ref: 'main',
          sparse: ['src/nodes'],
        })

        const analysisRoot = await store.prepareAnalysisRoot()

        expect(analysisRoot).toBeTruthy()
        expect(
          existsSync(
            join(
              analysisRoot!,
              '.renoun-full-analysis-worktree.v8.ready'
            )
          )
        ).toBe(true)
        expect(
          existsSync(join(analysisRoot!, 'src/nodes/core/NodeFunction.js'))
        ).toBe(true)
        expect(
          existsSync(join(analysisRoot!, 'src/nodes/utils/LoopNode.js'))
        ).toBe(true)
      } finally {
        vi.restoreAllMocks()
        if (previousNodeEnv === undefined) {
          delete process.env.NODE_ENV
        } else {
          process.env.NODE_ENV = previousNodeEnv
        }
        rmSync(repoRoot, { recursive: true, force: true })
        rmSync(cacheDirectory, { recursive: true, force: true })
        rmSync(bareRoot, { recursive: true, force: true })
      }
    }
  )

  it.sequential(
    'restores deleted explicit-ref analysis files before reading them again',
    async () => {
      const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
      const cacheDirectory = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
      const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
      const bareRepo = join(bareRoot, 'repo.git')
      initRepo(repoRoot)

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
              filename: 'src/nodes/core/NodeFunction.js',
              content: `export function NodeFunction() { return 1 }`,
            },
          ],
          'init'
        )

        git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
        const fileUrl = pathToFileURL(bareRepo).toString()

        using store = new GitFileSystem({
          repository: fileUrl,
          cacheDirectory,
          ref: 'main',
          sparse: ['src/nodes'],
        })

        const prepared = await store.prepareAnalysis(
          'src/nodes/core/NodeFunction.js'
        )
        expect(existsSync(prepared.filePath)).toBe(true)

        rmSync(prepared.filePath, { force: true })
        expect(existsSync(prepared.filePath)).toBe(false)

        const exports = await store.getFileExports('src/nodes/core/NodeFunction.js')

        expect(exports.map((entry) => entry.name)).toContain('NodeFunction')
        expect(existsSync(prepared.filePath)).toBe(true)
      } finally {
        rmSync(repoRoot, { recursive: true, force: true })
        rmSync(cacheDirectory, { recursive: true, force: true })
        rmSync(bareRoot, { recursive: true, force: true })
      }
    }
  )

  it.sequential(
    're-materializes explicit-ref sparse-checkout files after init before resolving transitive exports',
    async () => {
      const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
      const cacheDirectory = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
      const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
      const bareRepo = join(bareRoot, 'repo.git')
      initRepo(repoRoot)

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
              filename: 'src/index.js',
              content: `export { value } from './dep.js'`,
            },
            {
              filename: 'src/dep.js',
              content: `export const value = 1`,
            },
          ],
          'init'
        )

        git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
        const fileUrl = pathToFileURL(bareRepo).toString()

        using firstStore = new GitFileSystem({
          repository: fileUrl,
          cacheDirectory,
          ref: 'main',
          sparse: ['src'],
        })
        using secondStore = new GitFileSystem({
          repository: fileUrl,
          cacheDirectory,
          ref: 'main',
          sparse: ['src'],
        })

        const prepared = await firstStore.prepareAnalysis('src/index.js')
        const analysisRoot = git(dirname(prepared.filePath), [
          'rev-parse',
          '--show-toplevel',
        ]).trim()
        const dependencyPath = join(analysisRoot, 'src/dep.js')

        expect(existsSync(dependencyPath)).toBe(true)

        git(analysisRoot, ['sparse-checkout', 'disable'])
        rmSync(dependencyPath, { force: true })
        expect(existsSync(dependencyPath)).toBe(false)

        const exports = await secondStore.getFileExports('src/index.js')

        expect(exports.map((entry) => entry.name)).toContain('value')
        expect(existsSync(dependencyPath)).toBe(true)
      } finally {
        rmSync(repoRoot, { recursive: true, force: true })
        rmSync(cacheDirectory, { recursive: true, force: true })
        rmSync(bareRoot, { recursive: true, force: true })
      }
    }
  )

  it.sequential(
    'restoring one explicit-ref analysis file does not evict another prepared scope from a stale sparse-checkout file',
    async () => {
      const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
      const cacheDirectory = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
      const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
      const bareRepo = join(bareRoot, 'repo.git')
      initRepo(repoRoot)

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
              filename: 'src/nodes/core/NodeFunction.js',
              content: `export function NodeFunction() { return 1 }`,
            },
            {
              filename: 'src/nodes/accessors/Arrays.js',
              content: `export const ArrayValue = 2`,
            },
          ],
          'init'
        )

        git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
        const fileUrl = pathToFileURL(bareRepo).toString()

        using firstStore = new GitFileSystem({
          repository: fileUrl,
          cacheDirectory,
          ref: 'main',
          sparse: ['src/nodes'],
        })
        using secondStore = new GitFileSystem({
          repository: fileUrl,
          cacheDirectory,
          ref: 'main',
          sparse: ['src/nodes'],
        })

        const firstPrepared = await firstStore.prepareAnalysis(
          'src/nodes/core/NodeFunction.js'
        )
        const secondPrepared = await secondStore.prepareAnalysis(
          'src/nodes/accessors/Arrays.js'
        )

        expect(existsSync(firstPrepared.filePath)).toBe(true)
        expect(existsSync(secondPrepared.filePath)).toBe(true)

        const sparseCheckoutPath = git(dirname(firstPrepared.filePath), [
          'rev-parse',
          '--git-path',
          'info/sparse-checkout',
        ])
        writeFileSync(sparseCheckoutPath, 'src/nodes/core\n')

        rmSync(firstPrepared.filePath, { force: true })
        expect(existsSync(firstPrepared.filePath)).toBe(false)
        expect(existsSync(secondPrepared.filePath)).toBe(true)

        const exports = await firstStore.getFileExports('src/nodes/core/NodeFunction.js')

        expect(exports.map((entry) => entry.name)).toContain('NodeFunction')
        expect(existsSync(firstPrepared.filePath)).toBe(true)
        expect(existsSync(secondPrepared.filePath)).toBe(true)
      } finally {
        rmSync(repoRoot, { recursive: true, force: true })
        rmSync(cacheDirectory, { recursive: true, force: true })
        rmSync(bareRoot, { recursive: true, force: true })
      }
    }
  )

  test('invalidates explicit-ref analysis caches when remote refs advance', async ({
    repoRoot,
    cacheDirectory,
  }) => {
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
          filename: 'src/index.js',
          content: `export const value = 1`,
        },
      ],
      'init'
    )

    const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
    const bareRepo = join(bareRoot, 'repo.git')
    let persistenceProjectRoot: string | undefined

    try {
      git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
      const fileUrl = pathToFileURL(bareRepo).toString()

      git(repoRoot, ['remote', 'add', 'origin', fileUrl])
      git(repoRoot, ['push', '-u', 'origin', 'main'])

      using store = new GitFileSystem({
        repository: fileUrl,
        cacheDirectory,
        ref: 'main',
        autoFetch: true,
      })

      const firstMetadata = await store.getFileMetadata('src/index.js')
      const firstAnalysisScopeId = store.getAnalysisScopeId()
      const firstExports = await store.getFileExports('src/index.js')
      expect(firstExports.map((entry) => entry.name)).toContain('value')
      expect(firstExports.map((entry) => entry.name)).not.toContain('nextValue')

      commitFile(
        repoRoot,
        'src/index.js',
        `export const nextValue = 2`,
        'update'
      )
      git(repoRoot, ['push', 'origin', 'main'])

      persistenceProjectRoot = store.repoRoot
      const persistence = getCacheStorePersistence({
        projectRoot: persistenceProjectRoot,
      })
      const seedStore = new CacheStore({
        snapshot: new FileSystemSnapshot(
          new InMemoryFileSystem({ 'seed.ts': 'export {}' }),
          'seed-snapshot'
        ),
        persistence,
      })
      const remoteRefNodeKey = createGitFileSystemPersistentCacheNodeKey({
        domainVersion: GIT_HISTORY_CACHE_VERSION,
        repository: fileUrl,
        namespace: 'remote-ref',
        payload: {
          remote: 'origin',
          ref: 'main',
        },
      })

      await seedStore.put(
        remoteRefNodeKey,
        {
          remoteSha: firstMetadata.refCommit,
          checkedAt: Date.now() - 600_000,
        },
        {
          persist: true,
          deps: [
            {
              depKey: `const:git-file-system-cache:${GIT_HISTORY_CACHE_VERSION}`,
              depVersion: GIT_HISTORY_CACHE_VERSION,
            },
          ],
        }
      )

      using refreshedStore = new GitFileSystem({
        repository: fileUrl,
        cacheDirectory,
        ref: 'main',
        autoFetch: true,
      })

      const updatedMetadata = await refreshedStore.getFileMetadata('src/index.js')
      const updatedContent = await refreshedStore.readFile('src/index.js')
      expect(updatedMetadata.refCommit).not.toBe(firstMetadata.refCommit)
      expect(updatedContent).toContain('nextValue = 2')
      expect(refreshedStore.readFileSync('src/index.js')).toContain(
        'nextValue = 2'
      )
      expect(refreshedStore.getAnalysisScopeId()).not.toBe(firstAnalysisScopeId)

      const secondExports = await refreshedStore.getFileExports('src/index.js')
      expect(secondExports.map((entry) => entry.name)).toContain('nextValue')
      expect(secondExports.map((entry) => entry.name)).not.toContain('value')
    } finally {
      if (persistenceProjectRoot) {
        disposeCacheStorePersistence({ projectRoot: persistenceProjectRoot })
      }
      rmSync(bareRoot, { recursive: true, force: true })
    }
  })

  it.sequential(
    'refreshes explicit remote refs after remote-ref TTL expiry when the branch tip moves',
    async () => {
      const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
      const cacheDirectory = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
      const bareRoot = mkdtempSync(join(tmpdir(), 'renoun-test-bare-'))
      const bareRepo = join(bareRoot, 'repo.git')
      initRepo(repoRoot)
      let persistenceProjectRoot: string | undefined

      try {
        const firstCommit = commitFile(
          repoRoot,
          'src/index.ts',
          `export const value = 1`,
          'v1'
        )
        git(tmpdir(), ['clone', '--bare', repoRoot, bareRepo])
        const fileUrl = pathToFileURL(bareRepo).toString()

        git(repoRoot, ['remote', 'add', 'origin', fileUrl])
        git(repoRoot, ['push', '-u', 'origin', 'main'])

        using store = new GitFileSystem({
          repository: fileUrl,
          cacheDirectory,
          ref: 'main',
          autoFetch: true,
        })

        expect(await store.readFile('src/index.ts')).toContain('value = 1')
        expect(await store.readFile('src/index.ts')).toContain('value = 1')

        const remoteRefNodeKey = createGitFileSystemPersistentCacheNodeKey({
          domainVersion: GIT_HISTORY_CACHE_VERSION,
          repository: fileUrl,
          namespace: 'remote-ref',
          payload: {
            remote: 'origin',
            ref: 'main',
          },
        })

        const secondCommit = commitFile(
          repoRoot,
          'src/index.ts',
          `export const value = 2`,
          'v2'
        )
        git(repoRoot, ['push', 'origin', 'main'])

        persistenceProjectRoot = store.repoRoot
        const persistence = getCacheStorePersistence({
          projectRoot: persistenceProjectRoot,
        })
        const seedStore = new CacheStore({
          snapshot: new FileSystemSnapshot(
            new InMemoryFileSystem({ 'seed.ts': 'export {}' }),
            'seed-snapshot'
          ),
          persistence,
        })

        await seedStore.put(
          remoteRefNodeKey,
          {
            remoteSha: firstCommit.hash,
            checkedAt: Date.now() - 600_000,
          },
          {
            persist: true,
            deps: [
              {
                depKey: `const:git-file-system-cache:${GIT_HISTORY_CACHE_VERSION}`,
                depVersion: GIT_HISTORY_CACHE_VERSION,
              },
            ],
          }
        )

        const spawnSpy = vi.spyOn(spawnModule, 'spawnWithResult')
        using refreshedStore = new GitFileSystem({
          repository: fileUrl,
          cacheDirectory,
          ref: 'main',
          autoFetch: true,
        })
        const updatedContent = await refreshedStore.readFile('src/index.ts')

        const lsRemoteCount = spawnSpy.mock.calls.filter(
          ([command, commandArguments]) =>
            command === 'git' &&
            commandArguments[0] === 'ls-remote' &&
            commandArguments[1] === 'origin'
        ).length
        const fetchCount = spawnSpy.mock.calls.filter(
          ([command, commandArguments]) =>
            command === 'git' &&
            commandArguments.includes('fetch') &&
            commandArguments.includes('--quiet') &&
            commandArguments.includes('origin')
        ).length

        expect(updatedContent).toContain('value = 2')
        expect(
          (await refreshedStore.getFileMetadata('src/index.ts')).refCommit
        ).toBe(secondCommit.hash)
        expect(lsRemoteCount).toBeGreaterThan(0)
        expect(fetchCount).toBeGreaterThan(0)
      } finally {
        vi.restoreAllMocks()
        if (persistenceProjectRoot) {
          disposeCacheStorePersistence({ projectRoot: persistenceProjectRoot })
        }
        rmSync(repoRoot, { recursive: true, force: true })
        rmSync(cacheDirectory, { recursive: true, force: true })
        rmSync(bareRoot, { recursive: true, force: true })
      }
    }
  )

  test('throws helpful error when no commits match the entry scope', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'README.md', '# Not Code', 'init')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    await expect(
      drain(store.getExportHistory({ entry: 'src/index.ts' }))
    ).rejects.toThrow(/No commits found/)
  })

  test('throws helpful error for invalid entry file', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'README.md', '# Not Code', 'init')

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    await expect(
      drain(store.getExportHistory({ entry: 'README.md' }))
    ).rejects.toThrow(/Invalid entry file/)
  })

  // Regression: per-commit cache isolation
  //
  // metaCache, resolveCache, and blobShaResolveCache must be created fresh
  // for each commit in processCommit(). Sharing them across commits caused
  // stale cross-commit module resolution: when a re-exported file changed
  // between commits, the shared resolve cache returned stale paths/metadata,
  // collapsing granular per-commit changes into a single "big commit" change.
  //
  // This test verifies that updating a re-exported module across multiple
  // commits produces an individual "Updated" change for *each* commit,
  // not just one collapsed change.
  test('tracks granular per-commit updates for re-exported modules (cache isolation)', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    // Commit 1: lib + empty barrel baseline
    commitFile(
      repoRoot,
      'src/lib.ts',
      `export function greet(): string { return "hello" }`,
      'add lib'
    )
    // Empty barrel baseline so 'add barrel' enters the comparison path
    commitFile(repoRoot, 'src/index.ts', `export {}`, 'baseline barrel')
    commitFile(
      repoRoot,
      'src/index.ts',
      `export { greet } from './lib'`,
      'add barrel'
    )

    // Commit 3: update the function signature in lib
    const c2 = commitFile(
      repoRoot,
      'src/lib.ts',
      `export function greet(name: string): string { return "hello " + name }`,
      'update greet signature v2'
    )

    // Commit 4: update the function signature again
    const c3 = commitFile(
      repoRoot,
      'src/lib.ts',
      `export function greet(name: string, formal?: boolean): string { return formal ? "Good day " + name : "hello " + name }`,
      'update greet signature v3'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts', detectUpdates: true })
    )

    const greetId = getPrimaryId(report, 'greet')
    expect(greetId).toBeDefined()

    const greetHistory = report.exports[greetId!]

    // Should have: Added + Updated (c2) + Updated (c3) = 3 entries
    expect(greetHistory.length).toBeGreaterThanOrEqual(3)

    const updates = greetHistory.filter((c) => c.kind === 'Updated')
    // Both c2 and c3 should be tracked as separate updates, not collapsed
    expect(updates.length).toBe(2)
    expect(updates.map((u) => u.sha)).toContain(c2.hash)
    expect(updates.map((u) => u.sha)).toContain(c3.hash)
  })

  // Regression: per-commit cache isolation with star exports
  //
  // Star exports (`export * from './module'`) resolve recursively through
  // collectExportsFromFile. When caches were shared across commits, star
  // re-exports from files that changed between commits would resolve to
  // stale blob metadata, hiding intermediate "Updated" changes.
  // This test uses the three.js-style pattern: a barrel with `export *`
  // pointing at multiple sub-modules that change independently.
  test('tracks granular updates through star re-exports (cache isolation)', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    // Commit 1: initial setup with barrel + two sub-modules
    commitFile(
      repoRoot,
      'src/core/Alpha.ts',
      `export function alpha(): number { return 1 }`,
      'add Alpha'
    )
    commitFile(
      repoRoot,
      'src/core/Beta.ts',
      `export function beta(): number { return 2 }`,
      'add Beta'
    )
    commitFile(
      repoRoot,
      'src/index.ts',
      `export * from './core/Alpha'\nexport * from './core/Beta'`,
      'add barrel'
    )

    // Commit 2: update only Alpha's signature (Beta unchanged)
    const c2 = commitFile(
      repoRoot,
      'src/core/Alpha.ts',
      `export function alpha(x: number): number { return x }`,
      'update Alpha signature'
    )

    // Commit 3: update only Beta's signature (Alpha unchanged)
    const c3 = commitFile(
      repoRoot,
      'src/core/Beta.ts',
      `export function beta(y: number): number { return y * 2 }`,
      'update Beta signature'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts', detectUpdates: true })
    )

    // Alpha should have Added + Updated (c2)
    const alphaId = getPrimaryId(report, 'alpha')
    expect(alphaId).toBeDefined()
    const alphaHistory = report.exports[alphaId!]
    const alphaUpdates = alphaHistory.filter((c) => c.kind === 'Updated')
    expect(alphaUpdates.length).toBe(1)
    expect(alphaUpdates[0].sha).toBe(c2.hash)

    // Beta should have Added + Updated (c3)
    const betaId = getPrimaryId(report, 'beta')
    expect(betaId).toBeDefined()
    const betaHistory = report.exports[betaId!]
    const betaUpdates = betaHistory.filter((c) => c.kind === 'Updated')
    expect(betaUpdates.length).toBe(1)
    expect(betaUpdates[0].sha).toBe(c3.hash)
  })

  // Diagnostic: three.js uses `class X extends Node {}; export default X;`
  // pattern rather than `export default class X {}`. When the barrel uses
  // `export { default as X } from './module'`, changes to the class body
  // must still produce "Updated" events.
  test('detects updates through export-default-identifier re-exports (three.js pattern)', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    // Commit 1: initial class + barrel
    commitFile(
      repoRoot,
      'src/core/ContextNode.ts',
      [
        'class ContextNode {',
        '  constructor() {}',
        '  getContext(): string { return "v1" }',
        '}',
        'export default ContextNode;',
        'export const context = /*#__PURE__*/ ContextNode;',
      ].join('\n'),
      'add ContextNode'
    )
    commitFile(
      repoRoot,
      'src/Nodes.ts',
      `export { default as ContextNode } from './core/ContextNode'`,
      'add barrel'
    )

    // Commit 2: change the class (add a method)
    const c2 = commitFile(
      repoRoot,
      'src/core/ContextNode.ts',
      [
        'class ContextNode {',
        '  constructor() {}',
        '  getContext(): string { return "v2" }',
        '  label(): string { return "ctx" }',
        '}',
        'export default ContextNode;',
        'export const context = /*#__PURE__*/ ContextNode;',
      ].join('\n'),
      'update ContextNode: add label method'
    )

    // Commit 3: change the class again (modify method signature)
    const c3 = commitFile(
      repoRoot,
      'src/core/ContextNode.ts',
      [
        'class ContextNode {',
        '  constructor(scope: string) {}',
        '  getContext(): string { return "v3" }',
        '  label(prefix?: string): string { return prefix ?? "ctx" }',
        '}',
        'export default ContextNode;',
        'export const context = /*#__PURE__*/ ContextNode;',
      ].join('\n'),
      'update ContextNode: change constructor + label'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/Nodes.ts', detectUpdates: true })
    )

    const contextNodeId = getPrimaryId(report, 'ContextNode')
    expect(contextNodeId).toBeDefined()

    const history = report.exports[contextNodeId!]
    const updates = history.filter((c) => c.kind === 'Updated')

    // Must detect both updates, not collapse into the first commit
    expect(updates.length).toBe(2)
    expect(updates.map((u) => u.sha)).toContain(c2.hash)
    expect(updates.map((u) => u.sha)).toContain(c3.hash)
  })

  // Same as above but for `export { X }` (local named re-export without `from`).
  // The hash must come from the declaration, not the static export specifier.
  test('detects updates through export-specifier local re-exports', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(
      repoRoot,
      'src/lib.ts',
      ['function greet(): string { return "v1" }', 'export { greet }'].join(
        '\n'
      ),
      'add lib'
    )
    commitFile(
      repoRoot,
      'src/index.ts',
      `export { greet } from './lib'`,
      'add barrel'
    )

    const c2 = commitFile(
      repoRoot,
      'src/lib.ts',
      [
        'function greet(name: string): string { return name }',
        'export { greet }',
      ].join('\n'),
      'update greet'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({ entry: 'src/index.ts', detectUpdates: true })
    )

    const greetId = getPrimaryId(report, 'greet')
    expect(greetId).toBeDefined()
    const updates = report.exports[greetId!].filter((c) => c.kind === 'Updated')
    expect(updates.length).toBe(1)
    expect(updates[0].sha).toBe(c2.hash)
  })

  test('emits Added for exports in the first commit without ref.start', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    // Single commit with exports — no empty baseline, no ref.start
    const c1 = commitFile(
      repoRoot,
      'src/index.ts',
      `export const foo = 1; export const bar = 2`,
      'init'
    )
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `export const foo = 42; export const bar = 2`,
      'update foo'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({
        entry: 'src/index.ts',
        detectUpdates: true,
        updateMode: 'body',
      })
    )

    // Both exports should have an Added event from the first commit
    const fooId = getPrimaryId(report, 'foo')
    expect(fooId).toBeDefined()
    const fooHistory = report.exports[fooId!]
    const fooAdded = fooHistory.find((c) => c.kind === 'Added')
    expect(fooAdded).toBeDefined()
    expect(fooAdded!.sha).toBe(c1.hash)

    // foo should also have an Updated event from the second commit
    const fooUpdated = fooHistory.find((c) => c.kind === 'Updated')
    expect(fooUpdated).toBeDefined()
    expect(fooUpdated!.sha).toBe(c2.hash)

    const barId = getPrimaryId(report, 'bar')
    expect(barId).toBeDefined()
    const barHistory = report.exports[barId!]
    const barAdded = barHistory.find((c) => c.kind === 'Added')
    expect(barAdded).toBeDefined()
    expect(barAdded!.sha).toBe(c1.hash)

    // bar was not changed, so no Updated event
    expect(barHistory.find((c) => c.kind === 'Updated')).toBeUndefined()
  })

  test('silent baseline with ref.start omits Added for pre-existing exports', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const foo = 1`, 'init')
    tag(repoRoot, 'v1.0.0')
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `export const foo = 42`,
      'update foo'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const report = await drain(
      store.getExportHistory({
        entry: 'src/index.ts',
        ref: { start: 'v1.0.0' },
        detectUpdates: true,
        updateMode: 'body',
      })
    )

    const fooId = getPrimaryId(report, 'foo')
    expect(fooId).toBeDefined()
    const fooHistory = report.exports[fooId!]

    // With ref.start, foo existed in the baseline — no Added event
    expect(fooHistory.find((c) => c.kind === 'Added')).toBeUndefined()

    // But the update should still be tracked
    const fooUpdated = fooHistory.find((c) => c.kind === 'Updated')
    expect(fooUpdated).toBeDefined()
    expect(fooUpdated!.sha).toBe(c2.hash)
  })

  test('excludes gitignored worktree entries from readDirectory', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFiles(
      repoRoot,
      [
        { filename: '.gitignore', content: 'dist/\n' },
        { filename: 'src/index.ts', content: 'export const value = 1' },
      ],
      'init'
    )
    mkdirSync(join(repoRoot, 'dist'), { recursive: true })
    writeFileSync(
      join(repoRoot, 'dist', 'ignored.ts'),
      'export const ignored = 1'
    )

    using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
    const asyncEntries = (await store.readDirectory('.'))
      .map((entry) => entry.name)
      .sort()
    const syncEntries = store
      .readDirectorySync('.')
      .map((entry) => entry.name)
      .sort()

    expect(asyncEntries).toEqual(['.gitignore', 'src'])
    expect(syncEntries).toEqual(['.gitignore', 'src'])
  })

  test('invalidates shared production cache state for write/delete/rename/copy mutations', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const value = 1`, 'init')

    disposeCacheStorePersistence({ projectRoot: repoRoot })

    const listFiles = async (directory: Directory) => {
      const entries = await directory.getEntries({
        recursive: true,
        includeDirectoryNamedFiles: true,
        includeIndexAndReadmeFiles: true,
        includeGitIgnoredFiles: true,
        includeTsConfigExcludedFiles: true,
      })

      return entries
        .filter((entry) => entry instanceof File)
        .map((entry) => entry.relativePath)
        .sort()
    }

    try {
      using store = new GitFileSystem({ repository: repoRoot, cacheDirectory })
      const writerDirectory = new Directory({
        fileSystem: store,
        tsConfigPath: 'tsconfig.json',
      })
      const readerDirectory = new Directory({
        fileSystem: store,
        tsConfigPath: 'tsconfig.json',
      })

      const initialEntries = await listFiles(writerDirectory)
      expect(initialEntries).toEqual(['src/index.ts'])

      const initialFile = await writerDirectory.getFile('src/index', 'ts')
      expect(await initialFile.getText()).toContain('value = 1')

      await store.writeFile('src/index.ts', `export const value = 2`)
      const afterWrite = await readerDirectory.getFile('src/index', 'ts')
      expect(await afterWrite.getText()).toContain('value = 2')

      await store.rename('src/index.ts', 'src/renamed.ts')
      const entriesAfterRename = await listFiles(writerDirectory)
      const renamedDirect = await readerDirectory
        .getFile('src/renamed', 'ts')
        .then(
          async (file) => ({
            exists: true,
            text: await file.getText(),
          }),
          () => ({ exists: false, text: undefined as string | undefined })
        )
      expect(entriesAfterRename).toEqual(['src/renamed.ts'])
      const renamedFile = await readerDirectory.getFile('src/renamed', 'ts')
      expect(await renamedFile.getText()).toContain('value = 2')
      expect(renamedDirect.text).toContain('value = 2')
      expect(renamedDirect.exists).toBe(true)

      await store.copy('src/renamed.ts', 'src/copied.ts')
      const entriesAfterCopy = await listFiles(writerDirectory)
      expect(entriesAfterCopy).toEqual(['src/copied.ts', 'src/renamed.ts'])
      const copiedFile = await readerDirectory.getFile('src/copied', 'ts')
      expect(await copiedFile.getText()).toContain('value = 2')

      await store.deleteFile('src/copied.ts')
      const entriesAfterDelete = await listFiles(readerDirectory)
      expect(entriesAfterDelete).toEqual(['src/renamed.ts'])

      await store.deleteFile('src/renamed.ts')
      const entriesAfterFinalDelete = await listFiles(readerDirectory)
      expect(entriesAfterFinalDelete).toEqual([])
    } finally {
      disposeCacheStorePersistence({ projectRoot: repoRoot })
    }
  })

  test('refreshes session cache when sync repo readiness resolves the root', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'index.ts', 'export const value = 1', 'init')

    const repository = relative(process.cwd(), repoRoot)
    const store = new GitFileSystem({ repository, cacheDirectory })
    try {
      const beforeReadySession = Session.for(store)

      store.readDirectorySync('.')
      const afterReadySession = Session.for(store)

      expect(afterReadySession).not.toBe(beforeReadySession)
      expect(afterReadySession.snapshot.id).not.toBe(
        beforeReadySession.snapshot.id
      )
    } finally {
      store.close()
    }
  })

  test('refreshes session cache when async repo readiness resolves the root', async ({
    repoRoot,
    cacheDirectory,
  }) => {
    commitFile(repoRoot, 'index.ts', 'export const value = 1', 'init')

    const repository = relative(process.cwd(), repoRoot)
    const store = new GitFileSystem({ repository, cacheDirectory })
    try {
      const beforeReadySession = Session.for(store)

      const metadata = await store.getMetadata('index.ts')
      expect(metadata.kind).toBe('module')

      const afterReadySession = Session.for(store)
      expect(afterReadySession).not.toBe(beforeReadySession)
      expect(afterReadySession.snapshot.id).not.toBe(
        beforeReadySession.snapshot.id
      )
    } finally {
      store.close()
    }
  })
})
