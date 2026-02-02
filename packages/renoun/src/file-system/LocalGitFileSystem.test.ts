// LocalGitFileSystem.test.ts
import { describe, it, expect } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

import { LocalGitFileSystem } from './LocalGitFileSystem'

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Test User',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test User',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

function git(cwd: string, args: string[]) {
  const res = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    env: GIT_ENV,
  })
  if (res.status !== 0) {
    throw new Error(`Git error: ${res.stderr} (cmd: git ${args.join(' ')})`)
  }
  return res.stdout.trim()
}

function initRepo(cwd: string) {
  git(cwd, ['-c', 'init.defaultBranch=main', 'init'])
}

function commitFile(
  repo: string,
  filename: string,
  content: string,
  msg: string
) {
  const path = join(repo, filename)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  git(repo, ['add', filename])
  git(repo, ['commit', '--no-gpg-sign', '-m', msg])

  // Get hash and unix timestamp in a single git command
  const output = git(repo, ['log', '-1', '--format=%H %ct'])
  const [hash, unixStr] = output.split(' ')
  return { hash, unix: parseInt(unixStr, 10) }
}

function commitFiles(
  repo: string,
  files: Array<{ filename: string; content: string }>,
  msg: string
) {
  for (const file of files) {
    const path = join(repo, file.filename)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, file.content)
  }
  git(repo, ['add', ...files.map((f) => f.filename)])
  git(repo, ['commit', '--no-gpg-sign', '-m', msg])

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
  cacheDir: string
}

// Wrapper for concurrent tests with automatic cleanup
function test(name: string, fn: (ctx: TestContext) => Promise<void>): void {
  it.concurrent(name, async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'renoun-test-repo-'))
    const cacheDir = mkdtempSync(join(tmpdir(), 'renoun-test-cache-'))
    initRepo(repoRoot)
    try {
      await fn({ repoRoot, cacheDir })
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
      rmSync(cacheDir, { recursive: true, force: true })
    }
  })
}

describe('LocalGitFileSystem', () => {
  test('correctly tracks export additions and removals', async ({
    repoRoot,
    cacheDir,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const foo = 1`, 'init')
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `export const bar = 2`,
      'change exports'
    )

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

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

  test('invalidates export-history cache when ref advances', async ({
    repoRoot,
    cacheDir,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const a = 1`, 'v1')

    const store1 = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    try {
      const report1 = await store1.getExportHistory({ entry: 'src/index.ts' })
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

    const store2 = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    try {
      const report2 = await store2.getExportHistory({ entry: 'src/index.ts' })
      expect(getPrimaryId(report2, 'b')).toBeDefined()
    } finally {
      store2.close()
    }
  })

  test('supports scope expansion on cached repo', async ({
    repoRoot,
    cacheDir,
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

      using store = new LocalGitFileSystem({
        repository: sparseRepo,
        cacheDir,
      })
      const reportA = await store.getExportHistory({
        entry: 'scope-a/index.ts',
      })
      expect(getPrimaryId(reportA, 'a')).toBeDefined()

      git(sparseRepo, ['sparse-checkout', 'set', 'scope-a', 'scope-b'])
      const reportB = await store.getExportHistory({
        entry: 'scope-b/index.ts',
      })
      expect(getPrimaryId(reportB, 'b')).toBeDefined()
    } finally {
      rmSync(cloneRoot, { recursive: true, force: true })
    }
  })

  test('respects startRef by not re-adding existing exports', async ({
    repoRoot,
    cacheDir,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const foo = 1`, 'v1')
    tag(repoRoot, 'v1.0.0')
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `export const foo = 1; export const bar = 2`,
      'add bar'
    )

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({
      entry: 'src/index.ts',
      startRef: 'v1.0.0',
    })

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
    cacheDir,
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

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

    const coreId = getPrimaryId(report, 'core')
    expect(coreId).toBeDefined()
    expect(report.exports[coreId!].length).toBeGreaterThan(0)
  })

  test('detects alias rename in barrel exports', async ({
    repoRoot,
    cacheDir,
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

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

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
    cacheDir,
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

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

    const coreId = getPrimaryId(report, 'core')
    expect(coreId).toBeDefined()
    expect(coreId).toContain('src/b.ts')

    const coreHistory = report.exports[coreId!]
    const renameChange = coreHistory.find((change) => change.kind === 'Renamed')
    expect(renameChange?.sha).toBe(renameCommit.hash)
    expect(report.exports['src/a.ts::core']).toBeUndefined()
  })

  test('avoids ambiguous rename collisions with identical signatures', async ({
    repoRoot,
    cacheDir,
  }) => {
    commitFile(repoRoot, 'src/a.ts', `export const foo = 1`, 'add a')
    commitFile(repoRoot, 'src/b.ts', `export const foo = 1`, 'add b')
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

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

    const aFooId = getPrimaryId(report, 'aFoo')
    expect(aFooId).toBeDefined()
    expect(aFooId).toContain('src/c.ts')
    const bFooId = getPrimaryId(report, 'bFoo')
    expect(bFooId).toBeDefined()
    expect(bFooId).toContain('src/d.ts')

    const aFooHistory = report.exports[aFooId!]
    expect(aFooHistory.find((c) => c.kind === 'Added')?.sha).toBe(
      updateCommit.hash
    )
    expect(aFooHistory.some((c) => c.kind === 'Renamed')).toBe(false)

    const bFooHistory = report.exports[bFooId!]
    expect(bFooHistory.find((c) => c.kind === 'Added')?.sha).toBe(
      updateCommit.hash
    )
    expect(bFooHistory.some((c) => c.kind === 'Renamed')).toBe(false)

    expect(
      report.exports['src/a.ts::foo']?.find((c) => c.kind === 'Removed')?.sha
    ).toBe(updateCommit.hash)
    expect(
      report.exports['src/b.ts::foo']?.find((c) => c.kind === 'Removed')?.sha
    ).toBe(updateCommit.hash)
  })

  test('records deprecation events when @deprecated is added', async ({
    repoRoot,
    cacheDir,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const foo = 1`, 'v1')
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `/** @deprecated use bar */\nexport const foo = 1`,
      'deprecate foo'
    )

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

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
    cacheDir,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const foo = 1`, 'v1')
    // JSDoc with {@link SomeOther} syntax produces an array of JSDocComment nodes
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `/** @deprecated Use {@link bar} instead */\nexport const foo = 1`,
      'deprecate with link'
    )

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

    const fooId = getPrimaryId(report, 'foo')
    expect(fooId).toBeDefined()
    const deprecatedChange = report.exports[fooId!].find(
      (change) => change.kind === 'Deprecated'
    )
    expect(deprecatedChange?.sha).toBe(c2.hash)
    // Should contain the text, not [object Object]
    const message = (deprecatedChange as { message?: string })?.message
    expect(message).toBeDefined()
    expect(message).not.toContain('[object Object]')
    expect(message).toContain('Use')
    expect(message).toContain('instead')
  })

  test('detects deprecation in line comments', async ({
    repoRoot,
    cacheDir,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const foo = 1`, 'v1')
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `export const foo = 1 // @deprecated, use bar instead`,
      'deprecate foo via line comment'
    )

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

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
    cacheDir,
  }) => {
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

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

    const fooId = getPrimaryId(report, 'foo')
    expect(fooId).toBeDefined()

    // foo should only have "Added" from r1, no Removed/Added oscillation in r2
    const fooHistory = report.exports[fooId!]
    expect(fooHistory).toHaveLength(1)
    expect(fooHistory[0].kind).toBe('Added')
    expect(fooHistory[0].release).toBe('r1')
  })

  test('detects body updates', async ({ repoRoot, cacheDir }) => {
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

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({
      entry: 'src/index.ts',
      detectUpdates: true,
      updateMode: 'body',
    })

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
    cacheDir,
  }) => {
    commitFile(
      repoRoot,
      'src/utils/index.ts',
      `export const util = true`,
      'add utils index'
    )
    commitFile(repoRoot, 'src/main.ts', `export * from './utils'`, 'add main')

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/main.ts' })

    expect(Object.keys(report.exports)).toHaveLength(1)
    expect(getPrimaryId(report, 'util')).toBeDefined()
  })

  test('maps git tags to release history', async ({ repoRoot, cacheDir }) => {
    commitFile(repoRoot, 'src/index.ts', `export const v1 = true`, 'feat')
    tag(repoRoot, 'v1.0.0')
    const c2 = commitFile(
      repoRoot,
      'src/index.ts',
      `export const v1 = true; export const v2 = true`,
      'feat 2'
    )

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

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

  test('respects maxDepth to prevent infinite recursion or deep chains', async ({
    repoRoot,
    cacheDir,
  }) => {
    commitFile(repoRoot, 'src/C.ts', `export const final = 1`, 'c')
    commitFile(repoRoot, 'src/B.ts', `export * from './C'`, 'b')
    commitFile(repoRoot, 'src/A.ts', `export * from './B'`, 'a')
    commitFile(repoRoot, 'src/main.ts', `export * from './A'`, 'main')

    using store = new LocalGitFileSystem({
      repository: repoRoot,
      cacheDir,
      maxDepth: 1,
    })
    const report = await store.getExportHistory({ entry: 'src/main.ts' })

    expect(report.nameToId['final']).toBeUndefined()
    expect(report.parseWarnings?.length).toBeGreaterThan(0)
    expect(report.parseWarnings![0]).toContain('Max depth exceeded')
  })

  test('handles default exports correctly', async ({ repoRoot, cacheDir }) => {
    commitFile(
      repoRoot,
      'src/index.ts',
      `export default function MyComponent() {}`,
      'init'
    )

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

    const defaultId = getPrimaryId(report, 'default')
    expect(defaultId).toBeDefined()
    expect(defaultId).toContain('src/index.ts')
  })

  test('handles mixed named and default exports', async ({
    repoRoot,
    cacheDir,
  }) => {
    commitFile(
      repoRoot,
      'src/index.ts',
      `export const a = 1;\nconst b = 2;\nexport default b;`,
      'init'
    )

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

    expect(getPrimaryId(report, 'a')).toBeDefined()
    expect(getPrimaryId(report, 'default')).toBeDefined()
  })

  test('resolves entry directories to index files', async ({
    repoRoot,
    cacheDir,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const foo = 1`, 'init')

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src' })

    expect(report.entryFiles).toContain('src/index.ts')
    expect(getPrimaryId(report, 'foo')).toBeDefined()
  })

  test('throws when entry directory has no index file', async ({
    repoRoot,
    cacheDir,
  }) => {
    commitFile(repoRoot, 'src/other.ts', `export const x = 1`, 'init')

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    await expect(store.getExportHistory({ entry: 'src' })).rejects.toThrow(
      /Could not resolve any entry files/
    )
  })

  test('throws helpful errors for invalid refs', async ({
    repoRoot,
    cacheDir,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `export const foo = 1`, 'init')

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })

    await expect(
      store.getExportHistory({ entry: 'src/index.ts', startRef: 'nope' })
    ).rejects.toThrow(/Invalid startRef/)

    await expect(
      store.getExportHistory({ entry: 'src/index.ts', endRef: 'also-nope' })
    ).rejects.toThrow(/Invalid endRef/)
  })

  test('skips update events when detectUpdates is false', async ({
    repoRoot,
    cacheDir,
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

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({
      entry: 'src/index.ts',
      detectUpdates: false,
    })

    const doThingId = getPrimaryId(report, 'doThing')
    expect(doThingId).toBeDefined()
    expect(
      report.exports[doThingId!].find((change) => change.kind === 'Updated')
    ).toBeUndefined()
  })

  test('detects signature updates when updateMode is signature', async ({
    repoRoot,
    cacheDir,
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

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({
      entry: 'src/index.ts',
      updateMode: 'signature',
    })

    const doThingId = getPrimaryId(report, 'doThing')
    expect(doThingId).toBeDefined()
    const updatedChange = report.exports[doThingId!].find(
      (change) => change.kind === 'Updated'
    )
    expect(updatedChange?.sha).toBe(c2.hash)
  })

  test('supports re-export aliases and namespace exports', async ({
    repoRoot,
    cacheDir,
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

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

    const bazId = getPrimaryId(report, 'baz')
    expect(bazId).toBeDefined()
    expect(bazId).toContain('src/lib.ts')

    const nsId = getPrimaryId(report, 'ns')
    expect(nsId).toBeDefined()
    expect(nsId).toContain('__NAMESPACE__')
  })

  test('handles export assignment (export =)', async ({
    repoRoot,
    cacheDir,
  }) => {
    commitFile(repoRoot, 'src/index.ts', `const foo = 1; export = foo`, 'init')

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

    expect(getPrimaryId(report, 'default')).toBeDefined()
  })

  test('respects star export precedence (first wins)', async ({
    repoRoot,
    cacheDir,
  }) => {
    commitFile(repoRoot, 'src/a.ts', `export const value = 1`, 'a')
    commitFile(repoRoot, 'src/b.ts', `export const value = 2`, 'b')
    commitFile(
      repoRoot,
      'src/index.ts',
      `export * from './a'; export * from './b'`,
      'barrel'
    )

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

    const valueId = getPrimaryId(report, 'value')
    expect(valueId).toBeDefined()
    expect(valueId).toContain('src/a.ts')
  })

  test('detects file rename via git mv', async ({ repoRoot, cacheDir }) => {
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

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

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
    cacheDir,
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

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

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
    cacheDir,
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

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

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

  test('rename: both file and export name', async ({ repoRoot, cacheDir }) => {
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

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

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
    cacheDir,
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

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    const report = await store.getExportHistory({ entry: 'src/index.ts' })

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

  test('throws helpful error when no commits match the entry scope', async ({
    repoRoot,
    cacheDir,
  }) => {
    commitFile(repoRoot, 'README.md', '# Not Code', 'init')

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    await expect(
      store.getExportHistory({ entry: 'src/index.ts' })
    ).rejects.toThrow(/No commits found/)
  })

  test('throws helpful error for invalid entry file', async ({
    repoRoot,
    cacheDir,
  }) => {
    commitFile(repoRoot, 'README.md', '# Not Code', 'init')

    using store = new LocalGitFileSystem({ repository: repoRoot, cacheDir })
    await expect(
      store.getExportHistory({ entry: 'README.md' })
    ).rejects.toThrow(/Invalid entry file/)
  })
})
