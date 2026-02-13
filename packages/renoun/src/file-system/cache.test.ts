import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import {
  dirname,
  join,
  relative as relativePath,
  resolve as resolvePath,
} from 'node:path'
import { describe, expect, test, vi } from 'vitest'

import { CacheStore } from './CacheStore.ts'
import {
  SqliteCacheStorePersistence,
  disposeCacheStorePersistence,
  disposeDefaultCacheStorePersistence,
  getCacheStorePersistence,
} from './CacheStoreSqlite.ts'
import { InMemoryFileSystem } from './InMemoryFileSystem.ts'
import { NodeFileSystem } from './NodeFileSystem.ts'
import { Session } from './Session.ts'
import { FileSystemSnapshot } from './Snapshot.ts'
import { Directory, File, Package, Workspace } from './index.tsx'
import type { FileStructure, GitExportMetadata, GitMetadata } from './types.ts'

class NestedCwdNodeFileSystem extends NodeFileSystem {
  readonly #cwd: string

  constructor(cwd: string) {
    super()
    this.#cwd = cwd
  }

  override getAbsolutePath(path: string): string {
    return resolvePath(this.#cwd, path)
  }
}

class SyntheticContentIdFileSystem extends InMemoryFileSystem {
  readonly #contentIds = new Map<string, string>()

  constructor(
    files: Record<string, string> = {},
    contentIds: Record<string, string> = {}
  ) {
    super(files)

    for (const [path, contentId] of Object.entries(contentIds)) {
      this.#contentIds.set(this.#normalizePath(path), contentId)
    }
  }

  setContentId(path: string, contentId: string): void {
    this.#contentIds.set(this.#normalizePath(path), contentId)
  }

  override getFileLastModifiedMsSync(_path: string): number | undefined {
    return 1_000
  }

  override async getFileLastModifiedMs(path: string): Promise<number | undefined> {
    return this.getFileLastModifiedMsSync(path)
  }

  override getFileByteLengthSync(_path: string): number | undefined {
    return 16
  }

  override async getFileByteLength(path: string): Promise<number | undefined> {
    return this.getFileByteLengthSync(path)
  }

  async getContentId(path: string): Promise<string | undefined> {
    return this.#contentIds.get(this.#normalizePath(path))
  }

  #normalizePath(path: string): string {
    return path.replace(/^\/+/, '')
  }
}

class MutableTimestampFileSystem extends InMemoryFileSystem {
  readonly #fileTimes = new Map<string, number>()

  setLastModified(path: string, modifiedMs: number): void {
    this.#fileTimes.set(this.#normalizePath(path), modifiedMs)
  }

  override getFileLastModifiedMsSync(path: string): number | undefined {
    const normalized = this.#normalizePath(path)
    return this.#fileTimes.get(normalized) ?? super.getFileLastModifiedMsSync(path)
  }

  #normalizePath(path: string): string {
    return path.replace(/^\/+/, '')
  }
}

function createDeferredPromise() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })

  return {
    promise,
    resolve,
  }
}

function createTempNodeFileSystem(tmpDirectory: string) {
  const tsConfigPath = join(tmpDirectory, 'tsconfig.json')
  writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')
  const fs = new NodeFileSystem({ tsConfigPath })
  return fs
}

function withTestCacheDbPath<T>(
  tmpDirectory: string,
  run: () => Promise<T> | T
) {
  const previousPath = process.env.RENOUN_FS_CACHE_DB_PATH
  process.env.RENOUN_FS_CACHE_DB_PATH = join(tmpDirectory, '.cache', 'renoun', 'fs-cache.sqlite')

  try {
    return run()
  } finally {
    if (previousPath === undefined) {
      delete process.env.RENOUN_FS_CACHE_DB_PATH
    } else {
      process.env.RENOUN_FS_CACHE_DB_PATH = previousPath
    }
  }
}

async function withProductionSqliteCache<T>(
  run: (tmpDirectory: string) => Promise<T> | T
) {
  const tmpDirectory = mkdtempSync(
    join(process.cwd(), 'tmp-renoun-cache-sqlite-worker-')
  )
  const previousNodeEnv = process.env.NODE_ENV

  process.env.NODE_ENV = 'production'
  disposeDefaultCacheStorePersistence()

  try {
    return await withTestCacheDbPath(tmpDirectory, () => run(tmpDirectory))
  } finally {
    disposeDefaultCacheStorePersistence()
    process.env.NODE_ENV = previousNodeEnv

    rmSync(tmpDirectory, { recursive: true, force: true })
  }
}

describe('file-system cache integration', () => {
  test('shares directory snapshots across directory instances', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': '',
      'nested/page.mdx': '# Page',
      'nested/notes.txt': 'notes',
    })
    const readDirectorySpy = vi.spyOn(fileSystem, 'readDirectory')
    const first = new Directory({ fileSystem })
    const second = new Directory({ fileSystem })

    await first.getEntries({
      recursive: true,
      includeDirectoryNamedFiles: true,
      includeIndexAndReadmeFiles: true,
    })
    const callsAfterFirst = readDirectorySpy.mock.calls.length

    await second.getEntries({
      recursive: true,
      includeDirectoryNamedFiles: true,
      includeIndexAndReadmeFiles: true,
    })

    expect(readDirectorySpy.mock.calls.length).toBe(callsAfterFirst)
  })

  test('keeps function-based filters isolated when function references differ', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': '',
      'page.mdx': '# Page',
      'notes.txt': 'notes',
    })
    const directory = new Directory({ fileSystem })

    const typescriptEntries = await directory.getEntries({
      filter: (entry): entry is File => entry instanceof File && entry.extension === 'ts',
      includeIndexAndReadmeFiles: true,
    })
    const mdxEntries = await directory.getEntries({
      filter: (entry): entry is File =>
        entry instanceof File && entry.extension === 'mdx',
      includeIndexAndReadmeFiles: true,
    })

    expect(typescriptEntries.map((entry) => entry.workspacePath)).toEqual([
      'index.ts',
    ])
    expect(mdxEntries.map((entry) => entry.workspacePath)).toEqual(['page.mdx'])
  })

  test('shares function-based filters when function references are the same', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': '',
      'page.mdx': '# Page',
      'notes.txt': 'notes',
    })
    const readDirectorySpy = vi.spyOn(fileSystem, 'readDirectory')
    const first = new Directory({ fileSystem })
    const second = new Directory({ fileSystem })
    const filter = (entry: unknown): entry is File =>
      entry instanceof File && entry.extension === 'ts'

    await first.getEntries({
      filter,
      includeIndexAndReadmeFiles: true,
    })
    const callsAfterFirst = readDirectorySpy.mock.calls.length

    await second.getEntries({
      filter,
      includeIndexAndReadmeFiles: true,
    })

    expect(readDirectorySpy.mock.calls.length).toBe(callsAfterFirst)
  })

  test('does not persist function-filtered directory structure across sessions', async () => {
    const firstFileSystem = new InMemoryFileSystem({
      'index.ts': '',
      'page.mdx': '# Page',
    })
    const firstDirectory = new Directory({
      fileSystem: firstFileSystem,
      filter: (entry): entry is File =>
        entry instanceof File && entry.extension === 'ts',
    })

    const firstStructure = await firstDirectory.getStructure()
    const firstFileEntries = firstStructure.filter(
      (entry) => entry.kind === 'File'
    )
    expect(firstFileEntries.map((entry) => entry.relativePath)).toEqual([
      'index.ts',
    ])

    const secondFileSystem = new InMemoryFileSystem({
      'index.ts': '',
      'page.mdx': '# Page',
    })
    const secondDirectory = new Directory({
      fileSystem: secondFileSystem,
      filter: (entry): entry is File =>
        entry instanceof File && entry.extension === 'mdx',
    })

    const secondStructure = await secondDirectory.getStructure()
    const secondFileEntries = secondStructure.filter(
      (entry) => entry.kind === 'File'
    )
    expect(secondFileEntries.map((entry) => entry.relativePath)).toEqual([
      'page.mdx',
    ])
  })

  test('invalidates shared snapshots across instances when files are mutated', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const readDirectorySpy = vi.spyOn(fileSystem, 'readDirectory')
    const first = new Directory({ fileSystem })
    const second = new Directory({ fileSystem })

    await first.getEntries()
    const callsAfterFirstRead = readDirectorySpy.mock.calls.length

    await second.getEntries()
    expect(readDirectorySpy.mock.calls.length).toBe(callsAfterFirstRead)

    const indexFile = await first.getFile('index', 'ts')
    await indexFile.write('export const value = 2')

    await second.getEntries()
    expect(readDirectorySpy.mock.calls.length).toBeGreaterThan(callsAfterFirstRead)
  })

  test('dedupes concurrent stale directory rebuilds for instances', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    try {
      const fileSystem = new MutableTimestampFileSystem({
        'index.ts': 'export const value = 1',
      })
      fileSystem.setLastModified('index.ts', 1)
      const readDirectorySpy = vi.spyOn(fileSystem, 'readDirectory')
      const first = new Directory({ fileSystem })
      const second = new Directory({ fileSystem })

      await first.getEntries({
        includeIndexAndReadmeFiles: true,
      })
      const callsAfterFirstRead = readDirectorySpy.mock.calls.length
      const originalReadDirectory = fileSystem.readDirectory.bind(fileSystem)
      const blockRebuild = createDeferredPromise()
      const continueRebuild = createDeferredPromise()

      readDirectorySpy.mockImplementation(async (path) => {
        blockRebuild.resolve()
        await continueRebuild.promise
        return originalReadDirectory(path)
      })

      fileSystem.setLastModified('index.ts', 2)

      const firstReload = first.getEntries({
        includeIndexAndReadmeFiles: true,
      })

      await blockRebuild.promise
      continueRebuild.resolve()

      await Promise.all([
        firstReload,
        second.getEntries({
          includeIndexAndReadmeFiles: true,
        }),
      ])

      expect(readDirectorySpy.mock.calls.length).toBe(callsAfterFirstRead + 1)
    } finally {
      process.env.NODE_ENV = previousNodeEnv
    }
  })

  test('invalidates root directory snapshots for path-scoped invalidations', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    try {
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const directory = new Directory({ fileSystem })

      const firstEntries = await directory.getEntries({
        includeIndexAndReadmeFiles: true,
      })
      expect(firstEntries.map((entry) => entry.workspacePath)).toEqual(['index.ts'])

      await fileSystem.writeFile('new.ts', 'export const added = true')
      Session.for(fileSystem).invalidatePath('new.ts')

      const secondEntries = await directory.getEntries({
        includeIndexAndReadmeFiles: true,
      })

      expect(secondEntries.map((entry) => entry.workspacePath).sort()).toEqual([
        'index.ts',
        'new.ts',
      ])
    } finally {
      process.env.NODE_ENV = previousNodeEnv
    }
  })

  test('revalidates cached child directory snapshots in development mode', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    let tempDirectory: string | undefined

    try {
      tempDirectory = mkdtempSync(
        join(process.cwd(), 'tmp-renoun-cache-child-snapshot-')
      )
      const directoryPath = relativePath(process.cwd(), tempDirectory)
      const fileSystem = new NodeFileSystem()

      mkdirSync(join(tempDirectory, 'nested'), { recursive: true })
      writeFileSync(
        join(tempDirectory, 'nested', 'one.ts'),
        'export const one = 1',
        'utf8'
      )

      const directory = new Directory({
        fileSystem,
        path: directoryPath,
      })

      const firstEntries = await directory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
        includeGitIgnoredFiles: true,
        includeTsConfigExcludedFiles: true,
      })
      expect(
        firstEntries.some((entry) => entry.workspacePath.endsWith('nested/one.ts'))
      ).toBe(true)

      rmSync(join(tempDirectory, 'nested', 'one.ts'))
      writeFileSync(
        join(tempDirectory, 'nested', 'two.ts'),
        'export const two = 2',
        'utf8'
      )

      const secondEntries = await directory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
        includeGitIgnoredFiles: true,
        includeTsConfigExcludedFiles: true,
      })

      expect(
        secondEntries.some((entry) => entry.workspacePath.endsWith('nested/one.ts'))
      ).toBe(false)
      expect(
        secondEntries.some((entry) => entry.workspacePath.endsWith('nested/two.ts'))
      ).toBe(true)
    } finally {
      process.env.NODE_ENV = previousNodeEnv
      if (tempDirectory) {
        rmSync(tempDirectory, { recursive: true, force: true })
      }
    }
  })

  test('revalidates cached child directory snapshots in production mode', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    let tempDirectory: string | undefined

    try {
      tempDirectory = mkdtempSync(
        join(process.cwd(), 'tmp-renoun-cache-child-snapshot-prod-')
      )
      const directoryPath = relativePath(process.cwd(), tempDirectory)
      const fileSystem = new NodeFileSystem()

      mkdirSync(join(tempDirectory, 'nested'), { recursive: true })
      writeFileSync(
        join(tempDirectory, 'nested', 'one.ts'),
        'export const one = 1',
        'utf8'
      )

      const directory = new Directory({
        fileSystem,
        path: directoryPath,
      })

      const firstEntries = await directory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
        includeGitIgnoredFiles: true,
        includeTsConfigExcludedFiles: true,
      })
      expect(
        firstEntries.some((entry) => entry.workspacePath.endsWith('nested/one.ts'))
      ).toBe(true)

      writeFileSync(
        join(tempDirectory, 'nested', 'two.ts'),
        'export const two = 2',
        'utf8'
      )

      await new Promise((resolve) => setTimeout(resolve, 300))

      const secondEntries = await directory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
        includeGitIgnoredFiles: true,
        includeTsConfigExcludedFiles: true,
      })

      expect(
        secondEntries.some((entry) => entry.workspacePath.endsWith('nested/two.ts'))
      ).toBe(true)
    } finally {
      process.env.NODE_ENV = previousNodeEnv
      if (tempDirectory) {
        rmSync(tempDirectory, { recursive: true, force: true })
      }
    }
  })

  test('dedupes concurrent outline range computation across instances', async () => {
    const fileSystem = new InMemoryFileSystem({
      'file.ts': `//#region alpha
const a = 1
//#endregion`,
    })
    const outlineSpy = vi.spyOn(fileSystem, 'getOutlineRanges')
    const first = new Directory({ fileSystem })
    const second = new Directory({ fileSystem })
    const firstFile = await first.getFile('file', 'ts')
    const secondFile = await second.getFile('file', 'ts')

    await Promise.all([firstFile.getOutlineRanges(), secondFile.getOutlineRanges()])

    expect(outlineSpy).toHaveBeenCalledTimes(1)
  })

  test('invalidates cached getType results when dependency files change', async () => {
    const fileSystem = new InMemoryFileSystem({
      'a.ts': `import type { Value } from './b'
export type Metadata = Value`,
      'b.ts': `export type Value = { name: string }`,
    })
    const typeResolverSpy = vi.spyOn(
      fileSystem,
      'resolveTypeAtLocationWithDependencies'
    )
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('a', 'ts')
    const dependencyFile = await directory.getFile('b', 'ts')
    const metadataExport = await file.getExport('Metadata')

    const firstType = await metadataExport.getType()
    await dependencyFile.write(`export type Value = { count: number; total: number }`)
    const secondType = await metadataExport.getType()

    expect(firstType).toBeDefined()
    expect(secondType).toBeDefined()
    expect(typeResolverSpy).toHaveBeenCalledTimes(2)
  })

  test('invalidates cached re-export locations when source declarations change', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': `export { JSONValue } from './entries'`,
      'entries.ts': `export type JSONValue = string`,
    })
    const firstDirectory = new Directory({ fileSystem })
    const firstIndexFile = await firstDirectory.getFile('index', 'ts')
    const firstExport = await firstIndexFile.getExport('JSONValue')

    expect(firstExport.getPosition()?.start.line).toBe(1)

    const entriesFile = await firstDirectory.getFile('entries', 'ts')
    await entriesFile.write(`/** updated */\nexport type JSONValue = string`)

    const secondDirectory = new Directory({ fileSystem })
    const secondIndexFile = await secondDirectory.getFile('index', 'ts')
    const secondExport = await secondIndexFile.getExport('JSONValue')

    expect(secondExport.getPosition()?.start.line).toBe(2)
  })

  test('stabilizes snapshot dependency parsing with namespace keys', async () => {
    const fileSystem = new InMemoryFileSystem({
      'dir:root.ts': 'export const value = 1',
      'dir:branch/file.ts': 'export const branch = 1',
    })
    const directory = new Directory({ fileSystem })
    const session = directory.getSession()

    const firstEntries = await directory.getEntries({
      recursive: true,
      includeDirectoryNamedFiles: true,
      includeIndexAndReadmeFiles: true,
    })
    expect(firstEntries.length).toBeGreaterThan(0)

    const firstSnapshotKey = Array.from(session.directorySnapshots.keys()).find(
      (key) => key.startsWith('dir:.|')
    )
    expect(firstSnapshotKey).toBeDefined()

    const firstSnapshot = firstSnapshotKey
      ? session.directorySnapshots.get(firstSnapshotKey)
      : undefined
    expect(firstSnapshot).toBeDefined()
    const firstDependencies = firstSnapshot?.getDependencies()
    expect(firstDependencies).toBeDefined()

    const firstDependencyKeys = firstDependencies ? [...firstDependencies.keys()] : []
    expect(firstDependencyKeys).toContain('dir:.')
    expect(
      firstDependencyKeys.some(
        (key) => key.startsWith('file:') && key.endsWith('dir:root.ts')
      )
    ).toBe(true)
    expect(
      firstDependencyKeys.some(
        (key) => key.startsWith('dir:') && key.endsWith('dir:branch')
      )
    ).toBe(true)
    expect(
      firstDependencyKeys.some(
        (key) => key.startsWith('file:') && key.endsWith('dir:branch/file.ts')
      )
    ).toBe(true)

    for (const [key, signature] of firstDependencies ?? []) {
      if (key.startsWith('file:') || key.startsWith('dir:')) {
        expect(signature.startsWith('file:')).toBe(false)
        expect(signature.startsWith('dir:')).toBe(false)
      }
    }
  })

  test('parses windows-style file dependency keys after cache restore', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(fileSystem, 'windows-file-deps')
    const contentIdSpy = vi.spyOn(snapshot, 'contentId')
    const store = new CacheStore({ snapshot })
    const depKey = 'file:C:/Users/me/project/index.ts'
    const nodeKey = 'test:windows-file-dep'

    try {
      await store.put(
        nodeKey,
        'value',
        {
          persist: false,
          deps: [{ depKey, depVersion: 'v1' }],
        }
      )

      contentIdSpy.mockReset()
      contentIdSpy.mockResolvedValue('v1')

      await store.get(nodeKey)
      expect(contentIdSpy).toHaveBeenCalledWith('C:/Users/me/project/index.ts')
    } finally {
      contentIdSpy.mockRestore()
    }
  })

  test('retries uncached module-export structure type resolution after initial failure', async () => {
    const fileSystem = new InMemoryFileSystem({
      'a.ts': `export type Metadata = { value: string }`,
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('a', 'ts')
    const metadataExport = await file.getExport('Metadata')
    const typeResolverSpy = vi.spyOn(
      fileSystem,
      'resolveTypeAtLocationWithDependencies'
    )
    let shouldThrow = true

    typeResolverSpy.mockImplementation(async (...args) => {
      if (shouldThrow) {
        throw new Error('transient type resolution failure')
      }

      return InMemoryFileSystem.prototype.resolveTypeAtLocationWithDependencies.apply(
        fileSystem,
        args as Parameters<
          InMemoryFileSystem['resolveTypeAtLocationWithDependencies']
        >
      )
    })

    const firstStructure = await metadataExport.getStructure()
    shouldThrow = false
    const secondStructure = await metadataExport.getStructure()

    expect(firstStructure.resolvedType).toBeUndefined()
    expect(secondStructure.resolvedType).toBeDefined()
    expect(typeResolverSpy).toHaveBeenCalledTimes(2)
  })

  test('refreshes structure caches when git metadata changes without file content changes', async () => {
    class MetadataAwareInMemoryFileSystem extends InMemoryFileSystem {
      fileMetadata: GitMetadata = {
        authors: [
          {
            name: 'Ada',
            email: 'ada@example.com',
            commitCount: 1,
            firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
            lastCommitDate: new Date('2024-01-01T00:00:00.000Z'),
          },
        ],
        firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
        lastCommitDate: new Date('2024-01-01T00:00:00.000Z'),
      }
      exportMetadata: GitExportMetadata = {
        firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
        lastCommitDate: new Date('2024-01-01T00:00:00.000Z'),
        firstCommitHash: 'a1',
        lastCommitHash: 'a1',
      }

      async getGitFileMetadata(_path: string): Promise<GitMetadata> {
        return this.fileMetadata
      }

      async getGitExportMetadata(
        _path: string,
        _startLine: number,
        _endLine: number
      ): Promise<GitExportMetadata> {
        return this.exportMetadata
      }
    }

    const fileSystem = new MetadataAwareInMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('index', 'ts')
    const valueExport = await file.getExport('value')

    const firstFileStructure = await file.getStructure()
    const firstExportStructure = await valueExport.getStructure()

    fileSystem.fileMetadata = {
      authors: [
        {
          name: 'Ada',
          email: 'ada@example.com',
          commitCount: 2,
          firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
          lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
        },
      ],
      firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
      lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
    }
    fileSystem.exportMetadata = {
      firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
      lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
      firstCommitHash: 'a1',
      lastCommitHash: 'b2',
    }

    const secondFileStructure = await file.getStructure()
    const secondExportStructure = await valueExport.getStructure()

    expect(firstFileStructure.lastCommitDate?.toISOString()).toBe(
      '2024-01-01T00:00:00.000Z'
    )
    expect(secondFileStructure.lastCommitDate?.toISOString()).toBe(
      '2024-02-01T00:00:00.000Z'
    )
    expect(firstFileStructure.authors?.[0]?.commitCount).toBe(1)
    expect(secondFileStructure.authors?.[0]?.commitCount).toBe(2)
    expect(firstExportStructure.lastCommitDate?.toISOString()).toBe(
      '2024-01-01T00:00:00.000Z'
    )
    expect(secondExportStructure.lastCommitDate?.toISOString()).toBe(
      '2024-02-01T00:00:00.000Z'
    )
  })

  test('invalidates cached markdown sections on NodeFileSystem when files change', async () => {
    const tempDirectory = mkdtempSync(
      join(process.cwd(), 'tmp-renoun-cache-node-')
    )
    const scopedCwd = join(tempDirectory, 'scoped-cwd')
    mkdirSync(scopedCwd, { recursive: true })
    const fileSystem = new NestedCwdNodeFileSystem(scopedCwd)

    writeFileSync(
      join(tempDirectory, 'page.md'),
      `# Alpha

first content`,
      'utf8'
    )

    try {
      const firstDirectory = new Directory({
        fileSystem,
        path: tempDirectory,
      })
      const firstFile = await firstDirectory.getFile('page', 'md')
      const firstSections = await firstFile.getSections()

      await firstFile.write(
        `# Beta

updated content`
      )

      const secondDirectory = new Directory({
        fileSystem,
        path: tempDirectory,
      })
      const secondFile = await secondDirectory.getFile('page', 'md')
      const secondSections = await secondFile.getSections()

      expect(firstSections[0]?.title).toBe('Alpha')
      expect(secondSections[0]?.title).toBe('Beta')
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true })
    }
  })

  test('invalidates snapshot content IDs for absolute paths in nested-cwd sessions', async () => {
    const tempDirectory = mkdtempSync(
      join(process.cwd(), 'tmp-renoun-cache-session-invalidate-')
    )
    const filePath = join(tempDirectory, 'index.ts')
    const scopedCwd = join(tempDirectory, 'scoped-cwd')
    mkdirSync(scopedCwd, { recursive: true })
    const fileSystem = new NestedCwdNodeFileSystem(scopedCwd)

    writeFileSync(filePath, 'export const value = 1', 'utf8')

    try {
      const session = Session.for(fileSystem)
      const firstContentId = await session.snapshot.contentId(filePath)

      writeFileSync(filePath, 'export const value = 2000', 'utf8')
      session.invalidatePath(filePath)

      const secondContentId = await session.snapshot.contentId(filePath)
      expect(secondContentId).not.toBe(firstContentId)
    } finally {
      Session.reset(fileSystem)
      rmSync(tempDirectory, { recursive: true, force: true })
    }
  })

  test('revalidates metadata content IDs after a short freshness window for NodeFileSystem', async () => {
    const tempDirectory = mkdtempSync(
      join(process.cwd(), 'tmp-renoun-cache-snapshot-')
    )
    const filePath = join(tempDirectory, 'index.ts')
    const fileSystem = new NodeFileSystem()
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'nodefs-metadata-content-id'
    )

    writeFileSync(filePath, 'export const value = 1', 'utf8')

    try {
      const firstContentId = await snapshot.contentId(filePath)
      writeFileSync(filePath, 'export const value = 100000', 'utf8')
      const immediateContentId = await snapshot.contentId(filePath)

      expect(immediateContentId).toBe(firstContentId)

      await new Promise((resolve) => setTimeout(resolve, 275))
      const secondContentId = await snapshot.contentId(filePath)

      expect(secondContentId).not.toBe(firstContentId)
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true })
    }
  })

  test('prefers file-system-provided content IDs over coarse metadata fingerprints', async () => {
    const fileSystem = new SyntheticContentIdFileSystem(
      {
        'index.ts': 'export const value = 1',
      },
      {
        'index.ts': 'git-blob:one',
      }
    )
    const snapshot = new FileSystemSnapshot(fileSystem, 'custom-content-id')

    const firstContentId = await snapshot.contentId('/index.ts')
    await fileSystem.writeFile('/index.ts', 'export const value = 2')
    fileSystem.setContentId('/index.ts', 'git-blob:two')
    snapshot.invalidatePath('/index.ts')
    const secondContentId = await snapshot.contentId('/index.ts')

    expect(firstContentId).toBe('git-blob:one')
    expect(secondContentId).toBe('git-blob:two')
  })

  test('clears cached content IDs when invalidating the snapshot root path', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'snapshot-root-invalidation'
    )
    const readFileBinarySpy = vi.spyOn(fileSystem, 'readFileBinary')

    await snapshot.contentId('/index.ts')
    await snapshot.contentId('/index.ts')
    expect(readFileBinarySpy).toHaveBeenCalledTimes(1)

    snapshot.invalidatePath('.')

    await snapshot.contentId('/index.ts')
    expect(readFileBinarySpy).toHaveBeenCalledTimes(2)
  })

  test('clears all snapshot content IDs when resetting nested-cwd sessions', async () => {
    const tempDirectory = mkdtempSync(
      join(process.cwd(), 'tmp-renoun-cache-session-reset-')
    )
    const filePath = join(tempDirectory, 'index.ts')
    const scopedCwd = join(tempDirectory, 'scoped-cwd')
    mkdirSync(scopedCwd, { recursive: true })
    const fileSystem = new NestedCwdNodeFileSystem(scopedCwd)

    writeFileSync(filePath, 'export const value = 1', 'utf8')

    try {
      const session = Session.for(fileSystem)
      const firstContentId = await session.snapshot.contentId(filePath)

      writeFileSync(filePath, 'export const value = 100000', 'utf8')
      Session.reset(fileSystem, session.snapshot.id)

      const secondContentId = await session.snapshot.contentId(filePath)
      expect(secondContentId).not.toBe(firstContentId)
    } finally {
      Session.reset(fileSystem)
      rmSync(tempDirectory, { recursive: true, force: true })
    }
  })

  test('reuses and invalidates workspace structure DAG nodes', async () => {
    const fileSystem = new InMemoryFileSystem({
      'package.json': JSON.stringify({
        name: 'repo',
        workspaces: ['packages/*'],
      }),
      'packages/foo/package.json': JSON.stringify({
        name: 'foo',
        exports: {
          '.': './src/index.ts',
        },
      }),
      'packages/foo/src/index.ts': 'export const value = 1',
    })
    const exportsSpy = vi.spyOn(fileSystem, 'getFileExports')
    const workspace = new Workspace({ fileSystem, rootDirectory: '.' })

    await workspace.getStructure()
    const callsAfterFirstRun = exportsSpy.mock.calls.length
    await workspace.getStructure()
    expect(exportsSpy.mock.calls.length).toBe(callsAfterFirstRun)

    const packageDirectory = new Directory({
      fileSystem,
      path: 'packages/foo/src',
    })
    const file = await packageDirectory.getFile('index', 'ts')
    await file.write('export const value = 200')

    await workspace.getStructure()
    expect(exportsSpy.mock.calls.length).toBeGreaterThan(callsAfterFirstRun)
  })

  test('invalidates workspace structure when rootDirectory package.json appears later', async () => {
    const fileSystem = new InMemoryFileSystem({
      'apps/docs/src/index.ts': 'export const value = 1',
    })
    const workspace = new Workspace({
      fileSystem,
      rootDirectory: 'apps/docs',
    })

    const firstStructure = await workspace.getStructure()
    const firstWorkspaceEntry = firstStructure.find(
      (entry) => entry.kind === 'Workspace'
    )
    expect(firstWorkspaceEntry?.name).toBe('workspace')

    await fileSystem.writeFile(
      'apps/docs/package.json',
      JSON.stringify(
        {
          name: 'docs-workspace',
          exports: {
            '.': './src/index.ts',
          },
        },
        null,
        2
      )
    )

    Session.for(fileSystem).invalidatePath('apps/docs/package.json')

    const secondStructure = await workspace.getStructure()
    const secondWorkspaceEntry = secondStructure.find(
      (entry) => entry.kind === 'Workspace'
    )
    expect(secondWorkspaceEntry?.name).toBe('docs-workspace')
  })

  test('invalidates workspace structure when lockfiles change package manager detection', async () => {
    const fileSystem = new InMemoryFileSystem({
      'package.json': JSON.stringify({
        name: 'repo',
        workspaces: ['packages/*'],
      }),
      'packages/foo/package.json': JSON.stringify({
        name: 'foo',
        exports: {
          '.': './src/index.ts',
        },
      }),
      'packages/foo/src/index.ts': 'export const foo = 1',
    })
    const workspace = new Workspace({ fileSystem, rootDirectory: '.' })

    const firstStructure = await workspace.getStructure()
    const firstWorkspaceEntry = firstStructure.find(
      (entry) => entry.kind === 'Workspace'
    )
    expect(firstWorkspaceEntry?.packageManager).toBe('npm')

    await fileSystem.writeFile('pnpm-lock.yaml', 'lockfileVersion: "9.0"')
    Session.for(fileSystem).invalidatePath('pnpm-lock.yaml')

    const secondStructure = await workspace.getStructure()
    const secondWorkspaceEntry = secondStructure.find(
      (entry) => entry.kind === 'Workspace'
    )
    expect(secondWorkspaceEntry?.packageManager).toBe('pnpm')
  })

  test('invalidates workspace structure when a matching package is added', async () => {
    const fileSystem = new InMemoryFileSystem({
      'package.json': JSON.stringify({
        name: 'repo',
        workspaces: ['packages/*'],
      }),
      'packages/foo/package.json': JSON.stringify({
        name: 'foo',
        exports: {
          '.': './src/index.ts',
        },
      }),
      'packages/foo/src/index.ts': 'export const foo = 1',
    })
    const workspace = new Workspace({ fileSystem, rootDirectory: '.' })

    const firstStructure = await workspace.getStructure()
    const firstPackages = firstStructure
      .filter((entry) => entry.kind === 'Package')
      .map((entry) => entry.name)
      .sort()
    expect(firstPackages).toEqual(['foo'])

    await fileSystem.writeFile(
      'packages/bar/package.json',
      JSON.stringify(
        {
          name: 'bar',
          exports: {
            '.': './src/index.ts',
          },
        },
        null,
        2
      )
    )
    await fileSystem.writeFile('packages/bar/src/index.ts', 'export const bar = 1')
    Session.for(fileSystem).invalidatePath('packages/bar/package.json')

    const secondStructure = await workspace.getStructure()
    const secondPackages = secondStructure
      .filter((entry) => entry.kind === 'Package')
      .map((entry) => entry.name)
      .sort()
    expect(secondPackages).toEqual(['bar', 'foo'])
  })

  test('reuses package structure cache when package name is inferred', async () => {
    const fileSystem = new InMemoryFileSystem({
      'packages/foo/package.json': JSON.stringify({
        name: 'foo',
        exports: {
          '.': './src/index.ts',
        },
      }),
      'packages/foo/src/index.ts': 'export const value = 1',
    })
    const exportsSpy = vi.spyOn(fileSystem, 'getFileExports')
    const pkg = new Package({
      path: 'packages/foo',
      fileSystem,
    })

    await pkg.getStructure()
    const callsAfterFirstStructure = exportsSpy.mock.calls.length

    await pkg.getStructure()

    expect(exportsSpy.mock.calls.length).toBe(callsAfterFirstStructure)
  })

  test('refreshes package manifest-derived structure after package.json changes', async () => {
    const fileSystem = new InMemoryFileSystem({
      'packages/foo/package.json': JSON.stringify({
        name: 'foo',
        version: '1.0.0',
        exports: {
          '.': './src/index.ts',
        },
      }),
      'packages/foo/src/index.ts': 'export const value = 1',
      'packages/foo/docs/guide.ts': 'export const guide = 1',
    })
    const pkg = new Package({
      path: 'packages/foo',
      fileSystem,
    })

    const firstStructure = await pkg.getStructure()
    const firstPackageEntry = firstStructure.find((entry) => entry.kind === 'Package')
    expect(firstPackageEntry?.name).toBe('foo')
    expect(firstPackageEntry?.version).toBe('1.0.0')

    await fileSystem.writeFile(
      'packages/foo/package.json',
      JSON.stringify(
        {
          name: 'foo-next',
          version: '2.0.0',
          exports: {
            '.': './docs/guide.ts',
          },
        },
        null,
        2
      )
    )
    Session.for(fileSystem).invalidatePath('packages/foo/package.json')

    const secondStructure = await pkg.getStructure()
    const secondPackageEntry = secondStructure.find(
      (entry) => entry.kind === 'Package'
    )

    expect(secondPackageEntry?.name).toBe('foo-next')
    expect(secondPackageEntry?.version).toBe('2.0.0')
  })

  test('rotates snapshot identity after session reset', () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const firstSession = Session.for(fileSystem)
    const firstSnapshotId = firstSession.snapshot.id

    Session.reset(fileSystem, firstSnapshotId)

    const secondSession = Session.for(fileSystem)

    expect(secondSession.snapshot.id).not.toBe(firstSnapshotId)
  })

  test('refreshes cached directory sessions after a session reset', () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const directory = new Directory({ fileSystem })
    const firstSnapshotId = directory.getSession().snapshot.id

    Session.reset(fileSystem, firstSnapshotId)

    const nextSnapshotId = directory.getSession().snapshot.id
    expect(nextSnapshotId).not.toBe(firstSnapshotId)
  })

  test('does not rotate snapshot identity when resetting an unknown snapshot id', () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const firstSession = Session.for(fileSystem)
    const firstSnapshotId = firstSession.snapshot.id

    Session.reset(fileSystem, `${firstSnapshotId}:missing`)

    const secondSession = Session.for(fileSystem)

    expect(secondSession).toBe(firstSession)
    expect(secondSession.snapshot.id).toBe(firstSnapshotId)
  })

  test('does not reset unrelated :g-suffixed sessions that are not in the same explicit family', () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })

    const firstSession = Session.for(
      fileSystem,
      new FileSystemSnapshot(fileSystem, 'foo:g1')
    )
    const secondSession = Session.for(
      fileSystem,
      new FileSystemSnapshot(fileSystem, 'foo:g2')
    )
    const unrelatedSession = Session.for(
      fileSystem,
      new FileSystemSnapshot(fileSystem, 'bar:g2')
    )

    const firstSessionToken = Symbol('first-session')
    const secondSessionToken = Symbol('second-session')
    const unrelatedSessionToken = Symbol('unrelated-session')
    firstSession.inflight.set('token', firstSessionToken)
    secondSession.inflight.set('token', secondSessionToken)
    unrelatedSession.inflight.set('token', unrelatedSessionToken)

    Session.reset(fileSystem, firstSession.snapshot.id)

    expect(firstSession.inflight.has('token')).toBe(false)

    const refreshedFirstSession = Session.for(
      fileSystem,
      firstSession.snapshot
    )
    Session.for(fileSystem, secondSession.snapshot)
    Session.for(fileSystem, unrelatedSession.snapshot)

    expect(refreshedFirstSession).not.toBe(firstSession)
    expect(secondSession.inflight.get('token')).toBe(secondSessionToken)
    expect(unrelatedSession.inflight.get('token')).toBe(unrelatedSessionToken)
  })
})

describe('cache replacement semantics', () => {
  test('uses put-based replacements to preserve the newest concurrent write', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(fileSystem, 'replacement-semantics')
    const store = new CacheStore({ snapshot })
    const nodeKey = 'test:replacement-semantics'

    const firstLegacyGate = createDeferredPromise()
    const secondLegacyGate = createDeferredPromise()

    const replaceWithGetOrCompute = async (value: string, gate: Promise<void>) => {
      await store.getOrCompute(nodeKey, { persist: false }, async () => {
        await gate
        return value
      })
    }

    const legacyFirst = replaceWithGetOrCompute('first', firstLegacyGate.promise)
    await Promise.resolve()
    const legacySecond = replaceWithGetOrCompute(
      'second',
      secondLegacyGate.promise
    )
    await Promise.resolve()
    firstLegacyGate.resolve()
    secondLegacyGate.resolve()
    await Promise.all([legacyFirst, legacySecond])

    expect(await store.get<string>(nodeKey)).toBe('first')

    await store.delete(nodeKey)

    const firstPutGate = createDeferredPromise()
    const secondPutGate = createDeferredPromise()

    const replaceWithPut = async (value: string, gate: Promise<void>) => {
      await gate
      await store.put(nodeKey, value, { persist: false })
    }

    const putFirst = replaceWithPut('first', firstPutGate.promise)
    const putSecond = replaceWithPut('second', secondPutGate.promise)
    firstPutGate.resolve()
    await Promise.resolve()
    secondPutGate.resolve()
    await Promise.all([putFirst, putSecond])

    expect(await store.get<string>(nodeKey)).toBe('second')
  })
})

describe('sqlite cache persistence', () => {
  test('revalidates persisted sibling navigation across worker sessions after file additions', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')

      mkdirSync(docsDirectory, { recursive: true })
      writeFileSync(join(docsDirectory, 'a.mdx'), '# Alpha', 'utf8')
      writeFileSync(join(docsDirectory, 'b.mdx'), '# Beta', 'utf8')

      const firstWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: docsDirectory,
      })
      const firstWorkerFile = await firstWorkerDirectory.getFile('b', 'mdx')
      const [firstPrevious, firstNext] = await firstWorkerFile.getSiblings()
      expect(firstPrevious?.baseName).toBe('a')
      expect(firstNext).toBeUndefined()

      const secondWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: docsDirectory,
      })
      const secondWorkerFile = await secondWorkerDirectory.getFile('b', 'mdx')
      const [secondPrevious, secondNext] = await secondWorkerFile.getSiblings()
      expect(secondPrevious?.baseName).toBe('a')
      expect(secondNext).toBeUndefined()

      writeFileSync(join(docsDirectory, 'c.mdx'), '# Gamma', 'utf8')
      await new Promise((resolve) => setTimeout(resolve, 300))

      const thirdWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: docsDirectory,
      })
      const thirdWorkerFile = await thirdWorkerDirectory.getFile('b', 'mdx')
      const [thirdPrevious, thirdNext] = await thirdWorkerFile.getSiblings()
      expect(thirdPrevious?.baseName).toBe('a')
      expect(thirdNext?.baseName).toBe('c')
    })
  })

  test('revalidates persisted markdown structure across worker sessions after content updates', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const pagePath = join(docsDirectory, 'page.mdx')

      mkdirSync(docsDirectory, { recursive: true })
      writeFileSync(
        pagePath,
        `# Alpha

first content`,
        'utf8'
      )
      const firstWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: docsDirectory,
      })
      const firstWorkerFile = await firstWorkerDirectory.getFile('page', 'mdx')
      const firstStructure = await firstWorkerFile.getStructure()
      expect(firstStructure.description).toBe('Alpha')

      const secondWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: docsDirectory,
      })
      const secondWorkerFile = await secondWorkerDirectory.getFile('page', 'mdx')
      const secondStructure = await secondWorkerFile.getStructure()
      expect(secondStructure.description).toBe('Alpha')

      writeFileSync(
        pagePath,
        `# Beta

updated content`,
        'utf8'
      )
      await new Promise((resolve) => setTimeout(resolve, 300))

      const thirdWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: docsDirectory,
      })
      const thirdWorkerFile = await thirdWorkerDirectory.getFile('page', 'mdx')
      const thirdStructure = await thirdWorkerFile.getStructure()
      expect(thirdStructure.description).toBe('Beta')
    })
  })

  test('revalidates persisted directory navigation structure across worker sessions after nested markdown updates', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const nestedDirectory = join(docsDirectory, 'guides')
      const nestedFilePath = join(nestedDirectory, 'intro.mdx')

      mkdirSync(nestedDirectory, { recursive: true })
      writeFileSync(join(docsDirectory, 'index.mdx'), '# Home', 'utf8')
      writeFileSync(nestedFilePath, `# Intro\n\nfirst content`, 'utf8')

      const createWorkerFileSystem = () => createTempNodeFileSystem(tmpDirectory)

      const firstWorkerDirectory = new Directory({
        fileSystem: createWorkerFileSystem(),
        path: docsDirectory,
      })
      const firstStructure = await firstWorkerDirectory.getStructure()
      const firstIntro = firstStructure.find(
        (entry): entry is FileStructure =>
          entry.kind === 'File' && entry.relativePath.endsWith('docs/guides/intro.mdx')
      )
      expect(firstIntro?.description).toBe('Intro')

      const secondWorkerDirectory = new Directory({
        fileSystem: createWorkerFileSystem(),
        path: docsDirectory,
      })
      const secondStructure = await secondWorkerDirectory.getStructure()
      const secondIntro = secondStructure.find(
        (entry): entry is FileStructure =>
          entry.kind === 'File' && entry.relativePath.endsWith('docs/guides/intro.mdx')
      )
      expect(secondIntro?.description).toBe('Intro')

      writeFileSync(nestedFilePath, `# Beta\n\nupdated content`, 'utf8')
      await new Promise((resolve) => setTimeout(resolve, 300))

      const thirdWorkerDirectory = new Directory({
        fileSystem: createWorkerFileSystem(),
        path: docsDirectory,
      })
      const thirdStructure = await thirdWorkerDirectory.getStructure()
      const thirdIntro = thirdStructure.find(
        (entry): entry is FileStructure =>
          entry.kind === 'File' && entry.relativePath.endsWith('docs/guides/intro.mdx')
      )
      expect(thirdIntro?.description).toBe('Beta')
    })
  })

  test('revalidates persisted sibling navigation across worker sessions after file deletion', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')

      mkdirSync(docsDirectory, { recursive: true })
      writeFileSync(join(docsDirectory, 'a.mdx'), '# Alpha', 'utf8')
      writeFileSync(join(docsDirectory, 'b.mdx'), '# Beta', 'utf8')
      writeFileSync(join(docsDirectory, 'c.mdx'), '# Gamma', 'utf8')

      const firstWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: docsDirectory,
      })
      const firstWorkerFile = await firstWorkerDirectory.getFile('b', 'mdx')
      const [firstPrevious, firstNext] = await firstWorkerFile.getSiblings()
      expect(firstPrevious?.baseName).toBe('a')
      expect(firstNext?.baseName).toBe('c')

      const secondWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: docsDirectory,
      })
      const secondWorkerFile = await secondWorkerDirectory.getFile('b', 'mdx')
      const [secondPrevious, secondNext] = await secondWorkerFile.getSiblings()
      expect(secondPrevious?.baseName).toBe('a')
      expect(secondNext?.baseName).toBe('c')

      rmSync(join(docsDirectory, 'c.mdx'))
      await new Promise((resolve) => setTimeout(resolve, 300))

      const thirdWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: docsDirectory,
      })
      const thirdWorkerFile = await thirdWorkerDirectory.getFile('b', 'mdx')
      const [thirdPrevious, thirdNext] = await thirdWorkerFile.getSiblings()
      expect(thirdPrevious?.baseName).toBe('a')
      expect(thirdNext).toBeUndefined()
    })
  })

  test('revalidates persisted package structure when package.json changes across worker sessions', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const packageDirectory = join(tmpDirectory, 'packages', 'foo')

      mkdirSync(join(packageDirectory, 'src'), { recursive: true })
      writeFileSync(
        join(packageDirectory, 'package.json'),
        JSON.stringify(
          {
            name: 'foo',
            version: '1.0.0',
            description: 'first release',
            exports: {
              '.': './src/index.ts',
            },
          },
          null,
          2
        ),
        'utf8'
      )
      writeFileSync(
        join(packageDirectory, 'src', 'index.ts'),
        'export const value = 1',
        'utf8'
      )
      const createWorkerFileSystem = () => createTempNodeFileSystem(tmpDirectory)

      const firstPackage = new Package({
        fileSystem: createWorkerFileSystem(),
        path: packageDirectory,
      })
      const firstStructure = await firstPackage.getStructure()
      const firstPackageEntry = firstStructure.find(
        (entry) => entry.kind === 'Package'
      )

      expect(firstPackageEntry?.name).toBe('foo')
      expect(firstPackageEntry?.version).toBe('1.0.0')
      expect(firstPackageEntry?.description).toBe('first release')

      writeFileSync(
        join(packageDirectory, 'package.json'),
        JSON.stringify(
          {
            name: 'foo-next',
            version: '2.0.0',
            description: 'second release',
            exports: {
              '.': './src/index.ts',
            },
          },
          null,
          2
        ),
        'utf8'
      )
      await new Promise((resolve) => setTimeout(resolve, 300))

      const secondPackage = new Package({
        fileSystem: createWorkerFileSystem(),
        path: packageDirectory,
      })
      const secondStructure = await secondPackage.getStructure()
      const secondPackageEntry = secondStructure.find(
        (entry) => entry.kind === 'Package'
      )

      expect(secondPackageEntry?.name).toBe('foo-next')
      expect(secondPackageEntry?.version).toBe('2.0.0')
      expect(secondPackageEntry?.description).toBe('second release')
    })
  })

  test('revalidates persisted export type across worker sessions when dependency file changes', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const createWorkerFileSystem = () => createTempNodeFileSystem(tmpDirectory)
      writeFileSync(
        join(tmpDirectory, 'a.ts'),
        `import type { Value } from './b'
export type Metadata = Value`,
        'utf8'
      )
      writeFileSync(
        join(tmpDirectory, 'b.ts'),
        'export type Value = { name: string }',
        'utf8'
      )

      const typeResolverSpy = vi.spyOn(
        NodeFileSystem.prototype,
        'resolveTypeAtLocationWithDependencies'
      )
      const resolveTypeForDependency = (dependencyContent: string) => {
        if (dependencyContent.includes('count')) {
          return {
            resolvedType: {
              kind: 'TypeAlias',
              name: 'Metadata',
              type: {
                kind: 'TypeLiteral',
                members: [
                  {
                    kind: 'PropertySignature',
                    name: 'count',
                    type: { kind: 'Number' },
                  },
                  {
                    kind: 'PropertySignature',
                    name: 'total',
                    type: { kind: 'Number' },
                  },
                ],
              },
              typeParameters: [],
            } as unknown,
            dependencies: [],
          }
        }

        return {
          resolvedType: {
            kind: 'TypeAlias',
            name: 'Metadata',
            type: {
              kind: 'TypeLiteral',
              members: [
                {
                  kind: 'PropertySignature',
                  name: 'name',
                  type: { kind: 'String' },
                },
              ],
            },
            typeParameters: [],
          } as unknown,
          dependencies: [],
        }
      }

      try {
        typeResolverSpy.mockImplementation(async function (
          filePath,
          _position,
          _kind
        ) {
          const dependencyPath = resolvePath(dirname(filePath), 'b.ts')
          const dependencyContent = await this.readFile(dependencyPath)
          return {
            ...(resolveTypeForDependency(dependencyContent) as {
              resolvedType: unknown
              dependencies: string[]
            }),
            dependencies: [dependencyPath],
          }
        })

        const firstWorkerDirectory = new Directory({
          fileSystem: createWorkerFileSystem(),
          path: tmpDirectory,
        })
        const firstExport = await (
          await firstWorkerDirectory.getFile('a', 'ts')
        ).getExport('Metadata')
        const firstType = await firstExport.getType()
        const firstSerializedType = JSON.stringify(firstType)
        expect(firstType).toBeDefined()

        const secondWorkerDirectory = new Directory({
          fileSystem: createWorkerFileSystem(),
          path: tmpDirectory,
        })
        const secondExport = await (
          await secondWorkerDirectory.getFile('a', 'ts')
        ).getExport('Metadata')
        const secondType = await secondExport.getType()
        const secondSerializedType = JSON.stringify(secondType)
        expect(secondType).toBeDefined()
        expect(secondSerializedType).toBe(firstSerializedType)

        writeFileSync(
          join(tmpDirectory, 'b.ts'),
          'export type Value = { count: number; total: number }',
          'utf8'
        )
        await new Promise((resolve) => setTimeout(resolve, 300))

        const thirdWorkerDirectory = new Directory({
          fileSystem: createWorkerFileSystem(),
          path: tmpDirectory,
        })
        const thirdExport = await (
          await thirdWorkerDirectory.getFile('a', 'ts')
        ).getExport('Metadata')
        const thirdType = await thirdExport.getType()
        const thirdSerializedType = JSON.stringify(thirdType)

        expect(thirdType).toBeDefined()
        expect(thirdSerializedType).not.toBe(firstSerializedType)
        expect(typeResolverSpy).toHaveBeenCalledTimes(2)
      } finally {
        typeResolverSpy.mockRestore()
      }
    })
  })

  test('revalidates persisted workspace structure when scanned package set changes', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const workspaceDirectory = join(tmpDirectory)
      const packageDirectory = join(workspaceDirectory, 'packages', 'foo')
      const createWorkerFileSystem = () => createTempNodeFileSystem(tmpDirectory)

      mkdirSync(join(packageDirectory, 'src'), { recursive: true })
      writeFileSync(
        join(workspaceDirectory, 'package.json'),
        JSON.stringify(
          {
            name: 'docs-workspace',
            workspaces: ['packages/*'],
          },
          null,
          2
        ),
        'utf8'
      )
      writeFileSync(
        join(packageDirectory, 'package.json'),
        JSON.stringify(
          {
            name: 'foo',
          },
          null,
          2
        ),
        'utf8'
      )
      writeFileSync(
        join(packageDirectory, 'src', 'index.ts'),
        'export const value = 1',
        'utf8'
      )

      const firstWorkerWorkspace = new Workspace({
        fileSystem: createWorkerFileSystem(),
        rootDirectory: workspaceDirectory,
      })
      const firstStructure = await firstWorkerWorkspace.getStructure()
      const firstPackages = firstStructure
        .filter((entry) => entry.kind === 'Package')
        .map((entry) => entry.name)
        .sort()
      expect(firstPackages).toEqual(['foo'])

      const barDirectory = join(workspaceDirectory, 'packages', 'bar')
      mkdirSync(join(barDirectory, 'src'), { recursive: true })
      writeFileSync(
        join(barDirectory, 'package.json'),
        JSON.stringify(
          {
            name: 'bar',
          },
          null,
          2
        ),
        'utf8'
      )
      writeFileSync(
        join(barDirectory, 'src', 'index.ts'),
        'export const value = 2',
        'utf8'
      )

      await new Promise((resolve) => setTimeout(resolve, 300))

      const secondWorkerWorkspace = new Workspace({
        fileSystem: createWorkerFileSystem(),
        rootDirectory: workspaceDirectory,
      })
      const secondStructure = await secondWorkerWorkspace.getStructure()
      const secondPackages = secondStructure
        .filter((entry) => entry.kind === 'Package')
        .map((entry) => entry.name)
        .sort()
      expect(secondPackages).toEqual(['bar', 'foo'])
    })
  })

  test('revalidates persisted workspace structure when root manifest changes', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const workspaceDirectory = join(tmpDirectory)
      const createWorkerFileSystem = () => createTempNodeFileSystem(tmpDirectory)
      mkdirSync(join(workspaceDirectory, 'src'), { recursive: true })
      writeFileSync(
        join(workspaceDirectory, 'src', 'index.ts'),
        'export const workspace = true',
        'utf8'
      )

      writeFileSync(
        join(workspaceDirectory, 'package.json'),
        JSON.stringify(
          {
            name: 'workspace',
          },
          null,
          2
        ),
        'utf8'
      )

      const firstWorkspace = new Workspace({
        fileSystem: createWorkerFileSystem(),
        rootDirectory: workspaceDirectory,
      })
      const firstStructure = await firstWorkspace.getStructure()
      const firstWorkspaceEntry = firstStructure.find(
        (entry) => entry.kind === 'Workspace'
      )

      expect(firstWorkspaceEntry?.name).toBe('workspace')

      writeFileSync(
        join(workspaceDirectory, 'package.json'),
        JSON.stringify(
          {
            name: 'updated-workspace',
          },
          null,
          2
        ),
        'utf8'
      )
      await new Promise((resolve) => setTimeout(resolve, 300))

      const secondWorkspace = new Workspace({
        fileSystem: createWorkerFileSystem(),
        rootDirectory: workspaceDirectory,
      })
      const secondStructure = await secondWorkspace.getStructure()
      const secondWorkspaceEntry = secondStructure.find(
        (entry) => entry.kind === 'Workspace'
      )

      expect(secondWorkspaceEntry?.name).toBe('updated-workspace')
    })
  })

  test('revalidates persisted recursive entries across worker sessions after directory rename', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')

      mkdirSync(join(docsDirectory, 'guides'), { recursive: true })
      writeFileSync(
        join(docsDirectory, 'guides', 'intro.mdx'),
        '# Intro',
        'utf8'
      )
      writeFileSync(join(docsDirectory, 'index.mdx'), '# Home', 'utf8')

      const getRecursiveFilePaths = async (directory: Directory<any>) => {
        const entries = await directory.getEntries({
          recursive: true,
          includeIndexAndReadmeFiles: true,
        })
        return entries
          .filter((entry): entry is File => entry instanceof File)
          .map((entry) => entry.workspacePath)
          .sort()
      }

      const firstWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: docsDirectory,
      })
      const firstPaths = await getRecursiveFilePaths(firstWorkerDirectory)
      expect(firstPaths).toEqual([
        expect.stringContaining('docs/guides/intro.mdx'),
        expect.stringContaining('docs/index.mdx'),
      ])

      const secondWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: docsDirectory,
      })
      const secondPaths = await getRecursiveFilePaths(secondWorkerDirectory)
      expect(secondPaths).toEqual(firstPaths)

      renameSync(join(docsDirectory, 'guides'), join(docsDirectory, 'manual'))
      await new Promise((resolve) => setTimeout(resolve, 300))

      const thirdWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: docsDirectory,
      })
      const thirdPaths = await getRecursiveFilePaths(thirdWorkerDirectory)
      expect(thirdPaths).toEqual([
        expect.stringContaining('docs/index.mdx'),
        expect.stringContaining('docs/manual/intro.mdx'),
      ])
      expect(
        thirdPaths.some((path) => path.includes('/guides/intro.mdx'))
      ).toBe(false)
    })
  })

  test('persists cache entries and reloads them in a new cache store instance', async () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-'))

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-persist')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:persisted-value'
      let computeCount = 0

      const firstStore = new CacheStore({ snapshot, persistence })
      const firstResult = await firstStore.getOrCompute(
        nodeKey,
        { persist: true },
        async (ctx) => {
          computeCount += 1
          await ctx.recordFileDep('/index.ts')
          return { value: 1 }
        }
      )

      const secondStore = new CacheStore({ snapshot, persistence })
      const secondResult = await secondStore.getOrCompute(
        nodeKey,
        { persist: true },
        async (ctx) => {
          computeCount += 1
          await ctx.recordFileDep('/index.ts')
          return { value: 2 }
        }
      )

      expect(firstResult).toEqual({ value: 1 })
      expect(secondResult).toEqual({ value: 1 })
      expect(computeCount).toBe(1)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('persist: true then persist: false on same key deletes DB row', async () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-persist-false-'))

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-persist-false')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:persist-false'

      const writerStore = new CacheStore({ snapshot, persistence })
      await writerStore.put(
        nodeKey,
        { value: 1 },
        {
          persist: true,
          deps: [{ depKey: 'const:persisted:1', depVersion: '1' }],
        }
      )

      await writerStore.put(
        nodeKey,
        { value: 2 },
        {
          persist: false,
          deps: [{ depKey: 'const:non-persistent:1', depVersion: '1' }],
        }
      )

      const sqliteModule = (await import('node:sqlite')) as {
        DatabaseSync?: new (path: string) => any
      }
      const DatabaseSync = sqliteModule.DatabaseSync
      if (!DatabaseSync) {
        throw new Error('node:sqlite DatabaseSync is unavailable')
      }

      const db = new DatabaseSync(dbPath)
      const deletedRow = db
        .prepare('SELECT node_key FROM cache_entries WHERE node_key = ?')
        .get(nodeKey) as { node_key?: string } | undefined
      db.close()
      expect(deletedRow).toBeUndefined()

      const reloadedStore = new CacheStore({ snapshot, persistence })
      let computeCount = 0
      const value = await reloadedStore.getOrCompute(
        nodeKey,
        { persist: false },
        async (ctx) => {
          computeCount += 1
          await ctx.recordFileDep('/index.ts')
          return { value: 3 }
        }
      )

      expect(value).toEqual({ value: 3 })
      expect(computeCount).toBe(1)
      expect(await reloadedStore.get(nodeKey)).toEqual({ value: 3 })
      expect(await persistence.load(nodeKey)).toBeUndefined()
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('temporary persistence error does not permanently disable', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-persist-transient-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-persist-transient'
      )
      const sqlitePersistence = new SqliteCacheStorePersistence({ dbPath })
      let saveAttempts = 0
      const persistence = {
        load: sqlitePersistence.load.bind(sqlitePersistence),
        save: vi.fn(async (nodeKey, entry) => {
          saveAttempts += 1
          if (saveAttempts === 1) {
            throw new Error('transient save failure')
          }

          return sqlitePersistence.save(nodeKey, entry)
        }),
        delete: sqlitePersistence.delete.bind(sqlitePersistence),
      }
      const store = new CacheStore({ snapshot, persistence })
      const nodeKey = 'test:persist-transient'

      await store.put(nodeKey, { value: 1 }, { persist: true })
      await store.put(nodeKey, { value: 2 }, { persist: true })

      expect(persistence.save).toHaveBeenCalledTimes(2)

      const reloadedStore = new CacheStore({ snapshot, persistence })
      expect(await reloadedStore.get(nodeKey)).toEqual({ value: 2 })
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('updates last_accessed_at on persisted reads while keeping updated_at write-only', async () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-read-only-'))

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-read-only')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:read-only'

      const firstStore = new CacheStore({ snapshot, persistence })
      await firstStore.put(
        nodeKey,
        { value: 1 },
        {
          persist: true,
          deps: [{ depKey: 'const:read-only:1', depVersion: '1' }],
        }
      )

      const sqliteModule = (await import('node:sqlite')) as {
        DatabaseSync?: new (path: string) => any
      }
      const DatabaseSync = sqliteModule.DatabaseSync
      if (!DatabaseSync) {
        throw new Error('node:sqlite DatabaseSync is unavailable')
      }

      const beforeDb = new DatabaseSync(dbPath)
      const beforeRow = beforeDb
        .prepare(
          `
            SELECT updated_at, last_accessed_at
            FROM cache_entries
            WHERE node_key = ?
          `
        )
        .get(nodeKey) as { updated_at?: number; last_accessed_at?: number } | undefined
      beforeDb.close()

      expect(typeof beforeRow?.updated_at).toBe('number')
      expect(typeof beforeRow?.last_accessed_at).toBe('number')

      const secondStore = new CacheStore({ snapshot, persistence })
      const firstRead = await secondStore.get(nodeKey)
      const secondRead = await secondStore.get(nodeKey)
      expect(firstRead).toEqual({ value: 1 })
      expect(secondRead).toEqual({ value: 1 })

      const afterDb = new DatabaseSync(dbPath)
      const afterRow = afterDb
        .prepare(
          `
            SELECT updated_at, last_accessed_at
            FROM cache_entries
            WHERE node_key = ?
          `
        )
        .get(nodeKey) as { updated_at?: number; last_accessed_at?: number } | undefined
      afterDb.close()

      expect(afterRow?.updated_at).toBe(beforeRow?.updated_at)
      expect(afterRow?.last_accessed_at ?? 0).toBeGreaterThanOrEqual(
        beforeRow?.last_accessed_at ?? 0
      )
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('throws when reusing a db path with conflicting persistence options', async () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-options-'))
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')

    try {
      const first = getCacheStorePersistence({
        dbPath,
        maxRows: 10,
        maxAgeMs: 1_000,
      })
      await first.load('test:options:warmup')
      const second = getCacheStorePersistence({
        dbPath,
        maxRows: 10,
        maxAgeMs: 1_000,
      })

      expect(second).toBe(first)

      expect(() =>
        getCacheStorePersistence({
          dbPath,
          maxRows: 20,
          maxAgeMs: 1_000,
        })
      ).toThrow(/already initialized with different options/)
    } finally {
      disposeCacheStorePersistence({ dbPath })
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('clears persisted rows when schema version changes', async () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-schema-'))

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-schema')
      const nodeKey = 'test:schema-version'
      let computeCount = 0

      const firstPersistence = new SqliteCacheStorePersistence({
        dbPath,
        schemaVersion: 1,
      })
      const firstStore = new CacheStore({
        snapshot,
        persistence: firstPersistence,
      })

      await firstStore.getOrCompute(nodeKey, { persist: true }, async (ctx) => {
        computeCount += 1
        await ctx.recordFileDep('/index.ts')
        return { value: 1 }
      })

      const secondPersistence = new SqliteCacheStorePersistence({
        dbPath,
        schemaVersion: 2,
      })
      const secondStore = new CacheStore({
        snapshot,
        persistence: secondPersistence,
      })

      await secondStore.getOrCompute(nodeKey, { persist: true }, async (ctx) => {
        computeCount += 1
        await ctx.recordFileDep('/index.ts')
        return { value: 2 }
      })

      expect(computeCount).toBe(2)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('falls back to in-memory mode when sqlite initialization fails', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-fallback')
    const persistence = new SqliteCacheStorePersistence({
      dbPath: '/dev/null/renoun/fs-cache.sqlite',
    })
    const nodeKey = 'test:fallback'
    let computeCount = 0

    const firstStore = new CacheStore({ snapshot, persistence })
    await firstStore.getOrCompute(nodeKey, { persist: true }, async (ctx) => {
      computeCount += 1
      await ctx.recordFileDep('/index.ts')
      return { value: 1 }
    })

    const secondStore = new CacheStore({ snapshot, persistence })
    await secondStore.getOrCompute(nodeKey, { persist: true }, async (ctx) => {
      computeCount += 1
      await ctx.recordFileDep('/index.ts')
      return { value: 2 }
    })

    expect(computeCount).toBe(2)
  })

  test('continues persisting other cache entries after skipping an unserializable value', async () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-unserializable-'))

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-unserializable')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const store = new CacheStore({ snapshot, persistence })

      await store.put(
        'test:unserializable',
        { value: Symbol('not-serializable') },
        { persist: true }
      )
      await store.put('test:serializable', { value: 1 }, { persist: true })

      const reloadedStore = new CacheStore({ snapshot, persistence })
      const skippedValue = await reloadedStore.get('test:unserializable')
      const persistedValue = await reloadedStore.get<{ value: number }>(
        'test:serializable'
      )

      expect(skippedValue).toEqual({})
      expect(persistedValue).toEqual({ value: 1 })
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('drops persisted rows containing stripped React element payloads', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-stripped-react-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-stripped-react')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const writerStore = new CacheStore({ snapshot, persistence })

      await writerStore.put(
        'test:stripped-react',
        {
          title: {
            key: null,
            ref: null,
            props: { children: 'section heading' },
          },
        },
        { persist: true }
      )
      await writerStore.put('test:still-serializable', { value: 1 }, { persist: true })

      const readerStore = new CacheStore({ snapshot, persistence })
      const strippedValue = await readerStore.get('test:stripped-react')
      const serializableValue = await readerStore.get<{ value: number }>(
        'test:still-serializable'
      )

      expect(strippedValue).toBeUndefined()
      expect(serializableValue).toEqual({ value: 1 })
      expect(await persistence.load('test:stripped-react')).toBeUndefined()
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('removes stale persisted entries when fingerprint checks fail', async () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-fingerprint-'))

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-fingerprint')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:stale-fingerprint'
      const store = new CacheStore({ snapshot, persistence })

      await store.put(
        nodeKey,
        { value: 1 },
        {
          persist: true,
          deps: [{ depKey: 'file:index.ts', depVersion: 'stale-version' }],
        }
      )

      const fingerprint = await store.getFingerprint(nodeKey)
      const persisted = await persistence.load(nodeKey)

      expect(fingerprint).toBeUndefined()
      expect(persisted).toBeUndefined()
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('drops corrupted persisted entries when stored fingerprint no longer matches dependencies', async () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-corrupt-'))

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-corrupt')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:corrupt-fingerprint'
      const store = new CacheStore({ snapshot, persistence })

      await store.put(
        nodeKey,
        { value: 1 },
        {
          persist: true,
          deps: [{ depKey: 'const:stable:1', depVersion: '1' }],
        }
      )

      const sqliteModule = (await import('node:sqlite')) as {
        DatabaseSync?: new (path: string) => any
      }
      const DatabaseSync = sqliteModule.DatabaseSync
      if (!DatabaseSync) {
        throw new Error('node:sqlite DatabaseSync is unavailable')
      }

      const db = new DatabaseSync(dbPath)
      db.prepare(
        `
          UPDATE cache_deps
          SET dep_version = ?
          WHERE node_key = ? AND dep_key = ?
        `
      ).run('2', nodeKey, 'const:stable:1')
      db.close()

      const reloadedStore = new CacheStore({ snapshot, persistence })
      const value = await reloadedStore.get(nodeKey)
      expect(value).toBeUndefined()

      const verifyDb = new DatabaseSync(dbPath)
      const countRow = verifyDb
        .prepare(`SELECT COUNT(*) as total FROM cache_entries WHERE node_key = ?`)
        .get(nodeKey) as { total?: number }
      verifyDb.close()
      expect(Number(countRow.total ?? 0)).toBe(0)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('deletes stale persisted entries before recomputing when getOrCompute throws', async () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-stale-delete-'))

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-stale-delete')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const store = new CacheStore({ snapshot, persistence })
      const nodeKey = 'test:stale-delete'

      await store.put(
        nodeKey,
        { value: 1 },
        {
          persist: true,
          deps: [{ depKey: 'file:index.ts', depVersion: 'stale-version' }],
        }
      )

      await expect(
        store.getOrCompute(nodeKey, { persist: true }, async (ctx) => {
          await ctx.recordFileDep('/index.ts')
          throw new Error('compute failed')
        })
      ).rejects.toThrow('compute failed')

      const persistedEntry = await persistence.load(nodeKey)
      expect(persistedEntry).toBeUndefined()
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('keeps in-memory values when stale-row cleanup fails during save failure', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'sqlite-stale-save-failure'
    )
    const staleEntry = {
      value: { value: 1 },
      deps: [{ depKey: 'file:index.ts', depVersion: 'stale-version' }],
      fingerprint: 'stale-fingerprint',
      persist: true,
      updatedAt: Date.now(),
    }
    const persistence = {
      load: vi.fn(async (nodeKey) => {
        if (nodeKey === 'test:stale-save-failure') {
          return staleEntry
        }

        return undefined
      }),
      save: vi.fn(async () => {
        throw new Error('disk write failure')
      }),
      delete: vi.fn(async () => {
        throw new Error('disk delete failure')
      }),
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = new CacheStore({ snapshot, persistence })

    try {
      const value = await store.getOrCompute(
        'test:stale-save-failure',
        { persist: true },
        async (ctx) => {
          await ctx.recordFileDep('index.ts')
          return { value: 2 }
        }
      )

      expect(value).toEqual({ value: 2 })
      expect(await store.get('test:stale-save-failure')).toEqual({ value: 2 })
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('cleanup(test:stale-save-failure)')
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  test('prevents stale persisted rows from rehydrating after failed overwrite cleanup', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-overwrite-cleanup-fallback-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'old',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-save-cleanup-fallback'
      )
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:save-cleanup-fallback'
      const staleVersion = await snapshot.contentId('index.ts')

      const writerStore = new CacheStore({ snapshot, persistence })
      await writerStore.put(
        nodeKey,
        { value: 1 },
        {
          persist: true,
          deps: [{ depKey: 'file:index.ts', depVersion: staleVersion }],
        }
      )
      await fileSystem.writeFile('index.ts', 'changed')
      snapshot.invalidatePath('/index.ts')
      const stalePersisted = await persistence.load(nodeKey)
      expect(stalePersisted).toBeDefined()

      const failingPersistence = {
        load: async (lookupNodeKey: string) =>
          persistence.load(lookupNodeKey),
        save: vi.fn(async () => {
          throw new Error('disk write failure')
        }),
        delete: vi.fn(async () => {
          throw new Error('disk delete failure')
        }),
      }

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const failingStore = new CacheStore({ snapshot, persistence: failingPersistence })

      try {
        const value = await failingStore.getOrCompute(
          nodeKey,
          { persist: true },
          async (ctx) => {
            await ctx.recordFileDep('/index.ts')
            return { value: 2 }
          }
        )

        expect(value).toEqual({ value: 2 })
        expect(await failingStore.get(nodeKey)).toEqual({ value: 2 })
      } finally {
        warnSpy.mockRestore()
      }

      const reopenAfterFailureStore = new CacheStore({ snapshot, persistence: failingPersistence })
      expect(await reopenAfterFailureStore.get(nodeKey)).toBeUndefined()

      const reopenedStore = new CacheStore({ snapshot, persistence })
      expect(await reopenedStore.get(nodeKey)).toBeUndefined()
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('keeps persisted cache values consistent across multiple stores during updates', async () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-multi-store-'))

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 0',
      })
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-multi-store')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const writerStore = new CacheStore({ snapshot, persistence })
      const readerStore = new CacheStore({ snapshot, persistence })
      const nodeKey = 'test:multi-store'

      for (let value = 0; value < 10; value += 1) {
        await fileSystem.writeFile('index.ts', `export const value = ${value}`)
        snapshot.invalidatePath('/index.ts')

        const expected = await writerStore.getOrCompute(
          nodeKey,
          { persist: true },
          async (ctx) => {
            await ctx.recordFileDep('/index.ts')
            return { value }
          }
        )

        const reads = await Promise.all(
          Array.from({ length: 6 }, () =>
            readerStore.getOrCompute(nodeKey, { persist: true }, async (ctx) => {
              await ctx.recordFileDep('/index.ts')
              return { value: -1 }
            })
          )
        )

        expect(reads).toEqual(Array.from({ length: 6 }, () => expected))
      }
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('prunes sqlite rows during steady-state writes when maxRows is exceeded', async () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-prune-'))

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-prune')
      const persistence = new SqliteCacheStorePersistence({
        dbPath,
        maxRows: 3,
        maxAgeMs: 1000 * 60 * 60,
      })
      const store = new CacheStore({ snapshot, persistence })

      for (let index = 0; index < 24; index += 1) {
        await store.put(
          `test:prune:${index}`,
          { index },
          {
            persist: true,
          }
        )
      }

      const sqliteModule = (await import('node:sqlite')) as {
        DatabaseSync?: new (path: string) => any
      }
      const DatabaseSync = sqliteModule.DatabaseSync
      if (!DatabaseSync) {
        throw new Error('node:sqlite DatabaseSync is unavailable')
      }

      const db = new DatabaseSync(dbPath)
      try {
        const countRow = db.prepare(`SELECT COUNT(*) as total FROM cache_entries`).get() as {
          total?: number
        }
        expect(Number(countRow.total ?? 0)).toBeLessThanOrEqual(3)
      } finally {
        db.close()
      }
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('updates last_accessed_at on sqlite reads so pruning retains recently loaded rows', async () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-prune-lru-'))

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-prune-lru')
      const persistence = new SqliteCacheStorePersistence({
        dbPath,
        maxRows: 2,
        maxAgeMs: 1000 * 60 * 60,
      })
      const writerStore = new CacheStore({ snapshot, persistence })
      const readerStore = new CacheStore({ snapshot, persistence })

      await writerStore.put(
        'test:lru:a',
        { index: 'a' },
        {
          persist: true,
          deps: [{ depKey: 'const:lru:a:1', depVersion: '1' }],
        }
      )
      await writerStore.put(
        'test:lru:b',
        { index: 'b' },
        {
          persist: true,
          deps: [{ depKey: 'const:lru:b:1', depVersion: '1' }],
        }
      )

      await new Promise((resolve) => setTimeout(resolve, 5))

      // Load "a" from a different store so sqlite access-time bookkeeping is exercised.
      await readerStore.get('test:lru:a')
      await writerStore.put(
        'test:lru:c',
        { index: 'c' },
        {
          persist: true,
          deps: [{ depKey: 'const:lru:c:1', depVersion: '1' }],
        }
      )

      const sqliteModule = (await import('node:sqlite')) as {
        DatabaseSync?: new (path: string) => any
      }
      const DatabaseSync = sqliteModule.DatabaseSync
      if (!DatabaseSync) {
        throw new Error('node:sqlite DatabaseSync is unavailable')
      }

      const db = new DatabaseSync(dbPath)
      try {
        const rows = db
          .prepare(
            `
              SELECT node_key
              FROM cache_entries
              ORDER BY node_key ASC
            `
          )
          .all() as Array<{ node_key?: string }>
        const nodeKeys = rows
          .map((row) => row.node_key)
          .filter((nodeKey): nodeKey is string => typeof nodeKey === 'string')

        expect(nodeKeys).toContain('test:lru:a')
        expect(nodeKeys).toContain('test:lru:c')
        expect(nodeKeys).not.toContain('test:lru:b')
      } finally {
        db.close()
      }
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('keeps dependency rows aligned with pruned cache entries', async () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-prune-aligned-'))

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-prune-aligned')
      const persistence = new SqliteCacheStorePersistence({
        dbPath,
        maxRows: 3,
        maxAgeMs: 1000 * 60 * 60,
      })
      const store = new CacheStore({ snapshot, persistence })

      for (let index = 0; index < 24; index += 1) {
        await store.put(
          `test:aligned:${index}`,
          { index },
          {
            persist: true,
            deps: [
              {
                depKey: `const:aligned:${index}`,
                depVersion: String(index),
              },
            ],
          }
        )
      }

      const sqliteModule = (await import('node:sqlite')) as {
        DatabaseSync?: new (path: string) => any
      }
      const DatabaseSync = sqliteModule.DatabaseSync
      if (!DatabaseSync) {
        throw new Error('node:sqlite DatabaseSync is unavailable')
      }

      const db = new DatabaseSync(dbPath)
      try {
        const rows = db
          .prepare(
            `
              SELECT
                e.node_key as node_key,
                COUNT(d.dep_key) as deps
              FROM cache_entries e
              LEFT JOIN cache_deps d ON d.node_key = e.node_key
              GROUP BY e.node_key
            `
          )
          .all() as Array<{ node_key?: string; deps?: number }>

        expect(rows.length).toBeLessThanOrEqual(3)
        for (const row of rows) {
          expect(Number(row.deps ?? 0)).toBe(1)
        }
      } finally {
        db.close()
      }
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('removes stale persisted row on failed overwrite', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-overwrite-failure-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const sqliteModule = (await import('node:sqlite')) as {
        DatabaseSync?: new (path: string) => any
      }
      const DatabaseSync = sqliteModule.DatabaseSync
      if (!DatabaseSync) {
        throw new Error('node:sqlite DatabaseSync is unavailable')
      }

      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-overwrite-failure'
      )
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:overwrite-failure'
      const initialStore = new CacheStore({ snapshot, persistence })

      await initialStore.put(nodeKey, { value: 1 }, { persist: true })

      const dbBefore = new DatabaseSync(dbPath)
      const persistedBefore = dbBefore
        .prepare('SELECT node_key FROM cache_entries WHERE node_key = ?')
        .get(nodeKey)
      dbBefore.close()
      expect(persistedBefore).toBeDefined()

      const failingPersistence = {
        load: persistence.load.bind(persistence),
        delete: persistence.delete.bind(persistence),
        save: vi.fn(async () => {
          throw new Error('forced sqlite save failure')
        }),
      }
      const failingStore = new CacheStore({
        snapshot,
        persistence: failingPersistence,
      })

      await failingStore.put(nodeKey, { value: 2 }, { persist: true })

      const dbAfter = new DatabaseSync(dbPath)
      const persistedAfter = dbAfter
        .prepare('SELECT node_key FROM cache_entries WHERE node_key = ?')
        .get(nodeKey)
      dbAfter.close()
      expect(persistedAfter).toBeUndefined()

      const reloadedStore = new CacheStore({ snapshot, persistence })
      const reloadedValue = await reloadedStore.get(nodeKey)
      expect(reloadedValue).toBeUndefined()
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('retries sqlite writes while waiting for a database lock', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-lock-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const sqliteModule = (await import('node:sqlite')) as {
        DatabaseSync?: new (path: string) => any
      }
      const DatabaseSync = sqliteModule.DatabaseSync
      if (!DatabaseSync) {
        throw new Error('node:sqlite DatabaseSync is unavailable')
      }

      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-lock-retry')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:sqlite-lock-retry'
      const writeStore = new CacheStore({ snapshot, persistence })

      await persistence.load('init')
      const lockDb = new DatabaseSync(dbPath)
      lockDb.exec('BEGIN IMMEDIATE')

      try {
        const startedAt = Date.now()
        const writePromise = writeStore.put(
          nodeKey,
          { value: 1 },
          { persist: true }
        )

        await new Promise((resolve) => setTimeout(resolve, 120))
        lockDb.exec('ROLLBACK')

        await writePromise
        const elapsedMs = Date.now() - startedAt
        expect(elapsedMs).toBeGreaterThan(80)

        const db = new DatabaseSync(dbPath)
        const persisted = db
          .prepare('SELECT value_blob FROM cache_entries WHERE node_key = ?')
          .get(nodeKey)
        db.close()
        expect(persisted).toBeDefined()
      } finally {
        lockDb.close()
      }
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  }, 12000)

  test('deduplicates concurrent sqlite-backed compute work across sessions', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-slot-')
    )
    const previousNodeEnv = process.env.NODE_ENV
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')

    process.env.NODE_ENV = 'production'
    disposeDefaultCacheStorePersistence()

    try {
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-compute-slot')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const firstStore = new CacheStore({
        snapshot,
        persistence,
      })
      const secondStore = new CacheStore({
        snapshot,
        persistence,
      })

      const blockFirst = createDeferredPromise()
      let computeCount = 0

      const first = firstStore.getOrCompute(
        'test:sqlite-compute-slot',
        { persist: true },
        async (ctx) => {
          computeCount += 1
          await ctx.recordFileDep('/index.ts')
          await blockFirst.promise
          return 'first'
        }
      )

      await Promise.resolve()

      const second = secondStore.getOrCompute(
        'test:sqlite-compute-slot',
        { persist: true },
        async (ctx) => {
          computeCount += 1
          await ctx.recordFileDep('/index.ts')
          return 'second'
        }
      )

      await new Promise((resolve) => {
        setTimeout(resolve, 100)
      })
      blockFirst.resolve()

      const [firstResult, secondResult] = await Promise.all([first, second])

      expect(firstResult).toBe('first')
      expect(secondResult).toBe('first')
      expect(computeCount).toBe(1)
    } finally {
      disposeDefaultCacheStorePersistence()
      process.env.NODE_ENV = previousNodeEnv

      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  }, 12000)

  test('continues with in-memory cache when persistence writes fail', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(fileSystem, 'persistence-failure')
    const persistence = {
      load: vi.fn(async () => undefined),
      save: vi.fn(async () => {
        throw new Error('disk write failure')
      }),
      delete: vi.fn(async () => {
        throw new Error('disk delete failure')
      }),
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = new CacheStore({ snapshot, persistence })
    let computeCount = 0

    try {
      const firstResult = await store.getOrCompute(
        'test:persistence-failure',
        { persist: true },
        async (ctx) => {
          computeCount += 1
          await ctx.recordFileDep('/index.ts')
          return { value: 1 }
        }
      )
      const secondResult = await store.getOrCompute(
        'test:persistence-failure',
        { persist: true },
        async (ctx) => {
          computeCount += 1
          await ctx.recordFileDep('/index.ts')
          return { value: 2 }
        }
      )

      expect(firstResult).toEqual({ value: 1 })
      expect(secondResult).toEqual({ value: 1 })
      expect(computeCount).toBe(1)
      expect(await store.get('test:persistence-failure')).toEqual({ value: 1 })

      await expect(store.delete('test:persistence-failure')).resolves.toBeUndefined()
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('cleanup(test:persistence-failure)')
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  test('warns when explicit persist:false cleanup cannot remove a row', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'persistence-persist-false-failed-delete'
    )
    const persistedEntries = new Map<
      string,
      {
        value: { value: number }
        deps: Array<{ depKey: string; depVersion: string }>
        fingerprint: string
        persist: boolean
        updatedAt: number
      }
    >()
    const persistence = {
      load: vi.fn(async (nodeKey) => persistedEntries.get(nodeKey)),
      save: vi.fn(async (nodeKey, entry) => {
        persistedEntries.set(nodeKey, { ...entry })
      }),
      delete: vi.fn(async () => {
        throw new Error('disk delete failure')
      }),
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = new CacheStore({ snapshot, persistence })

    try {
      await store.put('test:persistence-false-delete', { value: 1 }, {
        persist: true,
      })
      await store.put('test:persistence-false-delete', { value: 2 }, {
        persist: false,
      })

      expect(await store.get('test:persistence-false-delete')).toEqual({
        value: 2,
      })
      expect(persistence.delete).toHaveBeenCalledTimes(1)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('cleanup(test:persistence-false-delete)')
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  test('continues with in-memory cache when persistence reads fail', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(fileSystem, 'persistence-read-failure')
    const persistence = {
      load: vi.fn(async () => {
        throw new Error('disk read failure')
      }),
      save: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = new CacheStore({ snapshot, persistence })
    let computeCount = 0

    try {
      const firstResult = await store.getOrCompute(
        'test:persistence-read-failure',
        { persist: true },
        async (ctx) => {
          computeCount += 1
          await ctx.recordFileDep('/index.ts')
          return { value: 1 }
        }
      )
      const secondResult = await store.getOrCompute(
        'test:persistence-read-failure',
        { persist: true },
        async (ctx) => {
          computeCount += 1
          await ctx.recordFileDep('/index.ts')
          return { value: 2 }
        }
      )

      expect(firstResult).toEqual({ value: 1 })
      expect(secondResult).toEqual({ value: 1 })
      expect(computeCount).toBe(1)
      expect(warnSpy).toHaveBeenCalledTimes(1)
    } finally {
      warnSpy.mockRestore()
    }
  })
})
