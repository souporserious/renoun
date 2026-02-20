import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createElement, Fragment, isValidElement } from 'react'
import { tmpdir } from 'node:os'
import {
  dirname,
  join,
  relative as relativePath,
  resolve as resolvePath,
} from 'node:path'
import { describe, expect, test, vi } from 'vitest'

import { getRootDirectory } from '../utils/get-root-directory.ts'
import { normalizePathKey } from '../utils/path.ts'

import {
  Cache,
  CacheStore,
  type CacheEntry,
  type CacheStorePersistence,
  createFingerprint,
} from './Cache.ts'
import { DirectorySnapshot } from './directory-snapshot.ts'
import {
  SqliteCacheStorePersistence,
  disposeCacheStorePersistence,
  disposeDefaultCacheStorePersistence,
  getCacheStorePersistence,
  getDefaultCacheDatabasePath,
} from './CacheSqlite.ts'
import { InMemoryFileSystem } from './InMemoryFileSystem.ts'
import { NodeFileSystem } from './NodeFileSystem.ts'
import { Session } from './Session.ts'
import { FileSystemSnapshot } from './Snapshot.ts'
import { Directory, File, Package, Workspace } from './index.tsx'
import type { FileStructure, GitExportMetadata, GitMetadata } from './types.ts'
import type { ResolvedTypeAtLocationResult } from '../utils/resolve-type-at-location.ts'

type SqliteComputeSlotPersistence = CacheStorePersistence & {
  acquireComputeSlot(
    nodeKey: string,
    owner: string,
    ttlMs?: number
  ): Promise<boolean>
  refreshComputeSlot?(
    nodeKey: string,
    owner: string,
    ttlMs: number
  ): Promise<void>
  releaseComputeSlot(nodeKey: string, owner: string): Promise<void>
  getComputeSlotOwner(nodeKey: string): Promise<string | undefined>
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

  override async getFileLastModifiedMs(
    path: string
  ): Promise<number | undefined> {
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

class NestedCwdNodeFileSystem extends NodeFileSystem {
  readonly #cwd: string

  constructor(cwd: string, tsConfigPath?: string) {
    super({ tsConfigPath })
    this.#cwd = cwd
  }

  override getAbsolutePath(path: string): string {
    return resolvePath(this.#cwd, path)
  }

  override isFilePathGitIgnored(filePath: string): boolean {
    return false
  }
}

class RootlessNodeFileSystem extends NestedCwdNodeFileSystem {
  override getAbsolutePath(path: string): string {
    return '/'
  }
}

class MutableTimestampFileSystem extends InMemoryFileSystem {
  readonly #fileTimes = new Map<string, number>()

  setLastModified(path: string, modifiedMs: number): void {
    this.#fileTimes.set(this.#normalizePath(path), modifiedMs)
  }

  override getFileLastModifiedMsSync(path: string): number | undefined {
    const normalized = this.#normalizePath(path)
    return (
      this.#fileTimes.get(normalized) ?? super.getFileLastModifiedMsSync(path)
    )
  }

  #normalizePath(path: string): string {
    return path.replace(/^\/+/, '')
  }
}

class TokenAwareNodeFileSystem extends NestedCwdNodeFileSystem {
  #workspaceChangeToken: string
  readonly #changedPathsByToken = new Map<
    string,
    Map<string, readonly string[] | null>
  >()

  constructor(cwd: string, tsConfigPath: string, token: string) {
    super(cwd, tsConfigPath)
    this.#workspaceChangeToken = token
  }

  setWorkspaceChangeToken(token: string): void {
    this.#workspaceChangeToken = token
  }

  override async getWorkspaceChangeToken(rootPath: string): Promise<string> {
    return `${this.#workspaceChangeToken}:${normalizePathKey(rootPath)}`
  }

  setChangedPathsSinceToken(
    rootPath: string,
    previousToken: string,
    changedPaths: readonly string[] | null
  ): void {
    const normalizedRootPath = normalizePathKey(rootPath)
    const changedPathsByToken = this.#changedPathsByToken.get(normalizedRootPath) ?? new Map<
      string,
      readonly string[] | null
    >()
    changedPathsByToken.set(previousToken, changedPaths)
    this.#changedPathsByToken.set(normalizedRootPath, changedPathsByToken)
  }

  override async getWorkspaceChangedPathsSinceToken(
    rootPath: string,
    previousToken: string
  ): Promise<readonly string[] | null> {
    const changedPathsByToken = this.#changedPathsByToken.get(
      normalizePathKey(rootPath)
    )
    const configuredChangedPaths =
      changedPathsByToken?.get(previousToken) ?? undefined
    if (configuredChangedPaths !== undefined) {
      return configuredChangedPaths
    }

    const currentToken = await this.getWorkspaceChangeToken(rootPath)
    if (currentToken === previousToken) {
      return []
    }

    return null
  }
}

class ThrowingByteLengthNodeFileSystem extends NestedCwdNodeFileSystem {
  override getFileByteLengthSync(_path: string): number | undefined {
    throw new Error('byte-length-lookup-should-not-run')
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

function createShortTtlComputeSlotPersistence(
  dbPath: string,
  options: {
    slotTtlMs: number
    withHeartbeat: boolean
  }
): SqliteComputeSlotPersistence {
  const sqlitePersistence = new SqliteCacheStorePersistence({ dbPath })
  const slotTtlMs = Math.max(1, Math.floor(options.slotTtlMs))

  const persistence: SqliteComputeSlotPersistence = {
    load: sqlitePersistence.load.bind(sqlitePersistence),
    save: sqlitePersistence.save.bind(sqlitePersistence),
    delete: sqlitePersistence.delete.bind(sqlitePersistence),
    computeSlotTtlMs: slotTtlMs,
    acquireComputeSlot: (nodeKey, owner) =>
      sqlitePersistence.acquireComputeSlot(nodeKey, owner, slotTtlMs),
    getComputeSlotOwner: sqlitePersistence.getComputeSlotOwner.bind(
      sqlitePersistence
    ),
    releaseComputeSlot: sqlitePersistence.releaseComputeSlot.bind(
      sqlitePersistence
    ),
  }

  if (options.withHeartbeat) {
    persistence.refreshComputeSlot = (nodeKey, owner) =>
      sqlitePersistence.refreshComputeSlot(nodeKey, owner, slotTtlMs)
  }

  return persistence
}

function createTempNodeFileSystem(tmpDirectory: string) {
  const tsConfigPath = join(tmpDirectory, 'tsconfig.json')
  writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')
  const fileSystem = new NestedCwdNodeFileSystem(getRootDirectory(), tsConfigPath)
  ;(fileSystem as { repoRoot?: string }).repoRoot = tmpDirectory
  return fileSystem
}

function createTmpRenounCacheDirectory(prefix: string) {
  const cacheBaseDirectory = join(
    getRootDirectory(),
    'packages',
    'renoun',
    '.renoun',
    'cache'
  )
  mkdirSync(cacheBaseDirectory, { recursive: true })
  return mkdtempSync(join(cacheBaseDirectory, prefix))
}

async function withProductionSqliteCache<T>(
  run: (tmpDirectory: string) => Promise<T> | T
) {
  const tmpDirectory = createTmpRenounCacheDirectory(
    'renoun-cache-sqlite-worker-'
  )
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  disposeDefaultCacheStorePersistence()

  try {
    return await run(tmpDirectory)
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

  test('uses shared custom cache provider across directory instances', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': '',
      'nested/page.mdx': '# Page',
    })
    const cache = new Cache()
    const first = new Directory({ fileSystem, cache })
    const second = new Directory({ fileSystem, cache })

    expect(first.getSession()).toBe(second.getSession())

    const readDirectorySpy = vi.spyOn(fileSystem, 'readDirectory')
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

  test('does not share caches between different custom cache providers', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': '',
      'nested/page.mdx': '# Page',
    })
    const first = new Directory({ fileSystem, cache: new Cache() })
    const second = new Directory({ fileSystem, cache: new Cache() })

    expect(first.getSession()).not.toBe(second.getSession())
  })

  test('keeps function-based filters isolated when function references differ', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': '',
      'page.mdx': '# Page',
      'notes.txt': 'notes',
    })
    const directory = new Directory({ fileSystem })

    const typescriptEntries = await directory.getEntries({
      filter: (entry): entry is File =>
        entry instanceof File && entry.extension === 'ts',
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
    expect(readDirectorySpy.mock.calls.length).toBeGreaterThan(
      callsAfterFirstRead
    )
  })

  test('dedupes concurrent stale directory rebuilds for instances', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    try {
      const fileSystem = new MutableTimestampFileSystem({
        'index.ts': 'export const value = 1',
      })
      fileSystem.setLastModified('index.ts', 1)
      const originalReadDirectory = fileSystem.readDirectory.bind(fileSystem)
      const readDirectorySpy = vi.spyOn(fileSystem, 'readDirectory')
      const first = new Directory({ fileSystem })
      const second = new Directory({ fileSystem })

      await first.getEntries({
        includeIndexAndReadmeFiles: true,
      })
      const callsAfterFirstRead = readDirectorySpy.mock.calls.length
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
      expect(firstEntries.map((entry) => entry.workspacePath)).toEqual([
        'index.ts',
      ])

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

  test('invalidates only intersecting directory snapshot keys by path', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    try {
      const fileSystem = new InMemoryFileSystem({
        'guides/guide.ts': 'export const value = 1',
        'api/api.ts': 'export const value = 2',
      })

      const guidesDirectory = new Directory({ fileSystem, path: 'guides' })
      const apiDirectory = new Directory({ fileSystem, path: 'api' })
      const originalReadDirectory = fileSystem.readDirectory.bind(fileSystem)
      const normalizeDirectoryPath = (path: string): string =>
        normalizePathKey(path)
      const isGuidesDirectoryPath = (path: string): boolean => {
        const normalized = normalizeDirectoryPath(String(path))
        return normalized === 'guides' || normalized.startsWith('guides/')
      }
      const isApiDirectoryPath = (path: string): boolean => {
        const normalized = normalizeDirectoryPath(String(path))
        return normalized === 'api' || normalized.startsWith('api/')
      }

      const readDirectorySpy = vi
        .spyOn(fileSystem, 'readDirectory')
        .mockImplementation(async (path) => originalReadDirectory(path))

      await guidesDirectory.getEntries({
        includeIndexAndReadmeFiles: true,
      })
      await apiDirectory.getEntries({
        includeIndexAndReadmeFiles: true,
      })

      const session = guidesDirectory.getSession()
      const guidesSnapshotKey = Array.from(session.directorySnapshots.keys()).find(
        (key) => key.startsWith(`dir:${normalizePathKey('guides')}|`)
      )
      const apiSnapshotKey = Array.from(session.directorySnapshots.keys()).find(
        (key) => key.startsWith(`dir:${normalizePathKey('api')}|`)
      )
      expect(guidesSnapshotKey).toBeDefined()
      expect(apiSnapshotKey).toBeDefined()
      expect(session.directorySnapshots.has(guidesSnapshotKey!)).toBe(true)
      expect(session.directorySnapshots.has(apiSnapshotKey!)).toBe(true)

      session.invalidatePath('guides/guide.ts')
      expect(session.directorySnapshots.has(guidesSnapshotKey!)).toBe(false)
      expect(session.directorySnapshots.has(apiSnapshotKey!)).toBe(true)

      const callsBeforeRebuild = readDirectorySpy.mock.calls.length
      await guidesDirectory.getEntries({
        includeIndexAndReadmeFiles: true,
      })
      const rebuildGuidesCalls = readDirectorySpy.mock.calls.slice(callsBeforeRebuild)
      const rebuildGuidePaths = rebuildGuidesCalls.map(([path]) =>
        String(path)
      )

      expect(
        rebuildGuidePaths.some((path) => isGuidesDirectoryPath(path))
      ).toBe(true)
      expect(
        rebuildGuidePaths.every((path) => !isApiDirectoryPath(path))
      ).toBe(true)
      expect(session.directorySnapshots.has(guidesSnapshotKey!)).toBe(true)

      session.invalidatePath('guides/guide.ts')
      expect(session.directorySnapshots.has(guidesSnapshotKey!)).toBe(false)

      const callsBeforeApiGet = readDirectorySpy.mock.calls.length
      await apiDirectory.getEntries({
        includeIndexAndReadmeFiles: true,
      })
      expect(readDirectorySpy.mock.calls.slice(callsBeforeApiGet).length).toBe(0)

      readDirectorySpy.mockRestore()
    } finally {
      process.env.NODE_ENV = previousNodeEnv
      vi.restoreAllMocks()
    }
  })

  test('revalidates cached child directory snapshots in development mode', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    let tempDirectory: string | undefined

    try {
      tempDirectory = createTmpRenounCacheDirectory(
        'renoun-cache-child-snapshot-'
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
        firstEntries.some((entry) =>
          entry.workspacePath.endsWith('nested/one.ts')
        )
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
        secondEntries.some((entry) =>
          entry.workspacePath.endsWith('nested/one.ts')
        )
      ).toBe(false)
      expect(
        secondEntries.some((entry) =>
          entry.workspacePath.endsWith('nested/two.ts')
        )
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
      tempDirectory = createTmpRenounCacheDirectory(
        'renoun-cache-child-snapshot-prod-'
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
        firstEntries.some((entry) =>
          entry.workspacePath.endsWith('nested/one.ts')
        )
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
        secondEntries.some((entry) =>
          entry.workspacePath.endsWith('nested/two.ts')
        )
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
    disposeDefaultCacheStorePersistence()

    const outlineSpy = vi.spyOn(fileSystem, 'getOutlineRanges')
    const first = new Directory({ fileSystem })
    const second = new Directory({ fileSystem })
    const firstFile = await first.getFile('file', 'ts')
    const secondFile = await second.getFile('file', 'ts')

    try {
      await Promise.all([
        firstFile.getOutlineRanges(),
        secondFile.getOutlineRanges(),
      ])

      expect(outlineSpy).toHaveBeenCalledTimes(1)
    } finally {
      disposeDefaultCacheStorePersistence()
    }
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
    await dependencyFile.write(
      `export type Value = { count: number; total: number }`
    )
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

    const firstDependencyKeys = firstDependencies
      ? [...firstDependencies.keys()]
      : []
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
      await store.put(nodeKey, 'value', {
        persist: false,
        deps: [{ depKey, depVersion: 'v1' }],
      })

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

  test('recomputes file and export git metadata after session reset when workspace token is unchanged', async () => {
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

      fileMetadataCalls = 0
      exportMetadataCalls = 0
      workspaceChangeTokenCalls = 0

      override async getWorkspaceChangeToken(rootPath: string): Promise<string> {
        this.workspaceChangeTokenCalls += 1
        return `token:${normalizePathKey(rootPath)}`
      }

      async getGitFileMetadata(_path: string): Promise<GitMetadata> {
        this.fileMetadataCalls += 1
        return this.fileMetadata
      }

      async getGitExportMetadata(
        _path: string,
        _startLine: number,
        _endLine: number
      ): Promise<GitExportMetadata> {
        this.exportMetadataCalls += 1
        return this.exportMetadata
      }
    }

    const fileSystem = new MetadataAwareInMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('index', 'ts')
    const valueExport = await file.getExport('value')

    const firstFileCommitDate = await file.getLastCommitDate()
    const firstExportCommitDate = await valueExport.getLastCommitDate()
    const firstWorkspaceCommitDate = await directory.getLastCommitDate()

    expect(firstFileCommitDate?.toISOString()).toBe(
      '2024-01-01T00:00:00.000Z'
    )
    expect(firstExportCommitDate?.toISOString()).toBe(
      '2024-01-01T00:00:00.000Z'
    )
    expect(firstWorkspaceCommitDate?.toISOString()).toBe(
      '2024-01-01T00:00:00.000Z'
    )

    await file.getLastCommitDate()
    await valueExport.getLastCommitDate()
    await directory.getLastCommitDate()

    expect(fileSystem.fileMetadataCalls).toBe(2)
    expect(fileSystem.exportMetadataCalls).toBe(1)
    expect(fileSystem.workspaceChangeTokenCalls).toBeGreaterThan(0)

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

    const priorFileMetadataCalls = fileSystem.fileMetadataCalls
    const priorExportMetadataCalls = fileSystem.exportMetadataCalls

    Session.reset(fileSystem)

    const secondFileCommitDate = await file.getLastCommitDate()
    const secondExportCommitDate = await valueExport.getLastCommitDate()
    const secondWorkspaceCommitDate = await directory.getLastCommitDate()

    expect(secondFileCommitDate?.toISOString()).toBe(
      '2024-02-01T00:00:00.000Z'
    )
    expect(secondExportCommitDate?.toISOString()).toBe(
      '2024-02-01T00:00:00.000Z'
    )
    expect(secondWorkspaceCommitDate?.toISOString()).toBe(
      '2024-02-01T00:00:00.000Z'
    )
    expect(fileSystem.fileMetadataCalls).toBeGreaterThan(priorFileMetadataCalls)
    expect(fileSystem.exportMetadataCalls).toBeGreaterThan(priorExportMetadataCalls)
  })

  test('invalidates cached markdown sections on NodeFileSystem when files change', async () => {
    const tempDirectory = createTmpRenounCacheDirectory('renoun-cache-node-')
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
    const tempDirectory = createTmpRenounCacheDirectory(
      'renoun-cache-session-invalidate-'
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
    const tempDirectory = createTmpRenounCacheDirectory(
      'renoun-cache-snapshot-'
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

  test('falls back to content hashing when metadata IDs collide within the guard window', async () => {
    const fileSystem = new MutableTimestampFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'metadata-collision-guard'
    )
    const filePath = '/index.ts'
    const fixedModifiedAt = Date.now()
    fileSystem.setLastModified(filePath, fixedModifiedAt)

    const firstId = await snapshot.contentId(filePath)
    expect(firstId.startsWith('mtime:')).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 275))

    // Keep metadata unchanged (same mtime and byte length) while changing content.
    await fileSystem.writeFile('index.ts', 'export const value = 2')
    fileSystem.setLastModified(filePath, fixedModifiedAt)

    const secondId = await snapshot.contentId(filePath)

    expect(secondId).not.toBe(firstId)
    expect(secondId.startsWith('sha1:')).toBe(true)
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
    const tempDirectory = createTmpRenounCacheDirectory(
      'renoun-cache-session-reset-'
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
    await fileSystem.writeFile(
      'packages/bar/src/index.ts',
      'export const bar = 1'
    )
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
    const firstPackageEntry = firstStructure.find(
      (entry) => entry.kind === 'Package'
    )
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

  test('resets a full snapshot lineage when reset is targeted at an ancestor', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })

    const baseSession = Session.for(fileSystem)
    Session.reset(fileSystem)

    const parentSession = Session.for(fileSystem, baseSession.snapshot)
    const childSession = Session.for(fileSystem, parentSession.snapshot)
    const unrelatedSession = Session.for(
      fileSystem,
      new FileSystemSnapshot(fileSystem, 'unrelated-lineage')
    )

    const parentToken = Promise.resolve(Symbol('parent-session'))
    const childToken = Promise.resolve(Symbol('child-session'))
    const unrelatedToken = Promise.resolve(Symbol('unrelated-session'))
    parentSession.inflight.set('token', parentToken)
    childSession.inflight.set('token', childToken)
    unrelatedSession.inflight.set('token', unrelatedToken)

    Session.reset(fileSystem, parentSession.snapshot.id)

    expect(parentSession.inflight.has('token')).toBe(false)
    expect(childSession.inflight.has('token')).toBe(false)
    expect(await unrelatedSession.inflight.get('token')).toBe(await unrelatedToken)
  })

  test('does not reset unrelated :g-suffixed sessions that are not in the same explicit family', async () => {
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

    const firstSessionToken = Promise.resolve(Symbol('first-session'))
    const secondSessionToken = Promise.resolve(Symbol('second-session'))
    const unrelatedSessionToken = Promise.resolve(Symbol('unrelated-session'))
    firstSession.inflight.set('token', firstSessionToken)
    secondSession.inflight.set('token', secondSessionToken)
    unrelatedSession.inflight.set('token', unrelatedSessionToken)

    Session.reset(fileSystem, firstSession.snapshot.id)

    expect(firstSession.inflight.has('token')).toBe(false)

    const refreshedFirstSession = Session.for(fileSystem, firstSession.snapshot)
    Session.for(fileSystem, secondSession.snapshot)
    Session.for(fileSystem, unrelatedSession.snapshot)

    expect(refreshedFirstSession).not.toBe(firstSession)
    expect(await secondSession.inflight.get('token')).toBe(
      await secondSessionToken
    )
    expect(await unrelatedSession.inflight.get('token')).toBe(
      await unrelatedSessionToken
    )
  })

  test('invalidates parent directory snapshots on nested entry content changes', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    try {
      const fileSystem = new InMemoryFileSystem({
        'nested/child.ts': 'export const value = 1',
      })
      const directory = new Directory({ fileSystem })
      const readDirectorySpy = vi.spyOn(fileSystem, 'readDirectory')

      await directory.getEntries({ recursive: false })
      const callsAfterFirstRead = readDirectorySpy.mock.calls.length

      await fileSystem.writeFile('nested/child.ts', 'export const value = 2')
      await directory.getEntries({ recursive: false })

      expect(readDirectorySpy.mock.calls.length).toBeGreaterThan(
        callsAfterFirstRead
      )
    } finally {
      process.env.NODE_ENV = previousNodeEnv
    }
  })

  test('auto-links parent cache nodes to child nodes without explicit recordNodeDep', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(fileSystem, 'auto-node-links')
    const store = new CacheStore({ snapshot })
    const childNodeKey = 'test:auto-node-links:child'
    const parentNodeKey = 'test:auto-node-links:parent'
    let childCalls = 0
    let parentCalls = 0

    const readChild = () =>
      store.getOrCompute(childNodeKey, { persist: false }, async (ctx) => {
        childCalls += 1
        await ctx.recordFileDep('/index.ts')
        return childCalls
      })

    const readParent = () =>
      store.getOrCompute(parentNodeKey, { persist: false }, async () => {
        parentCalls += 1
        const childValue = await readChild()
        return childValue * 2
      })

    const firstParentValue = await readParent()
    const secondParentValue = await readParent()

    expect(firstParentValue).toBe(2)
    expect(secondParentValue).toBe(2)
    expect(childCalls).toBe(1)
    expect(parentCalls).toBe(1)

    await fileSystem.writeFile('index.ts', 'export const value = 2')
    snapshot.invalidatePath('/index.ts')

    const thirdParentValue = await readParent()

    expect(thirdParentValue).toBe(4)
    expect(childCalls).toBe(2)
    expect(parentCalls).toBe(2)
  })

  test('Session.invalidatePath marks memory cache entries stale via dependency graph', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const session = Session.for(
      fileSystem,
      new FileSystemSnapshot(fileSystem, 'graph-path-invalidation')
    )
    const nodeKey = 'test:graph-path-invalidation'
    let calls = 0

    const firstValue = await session.cache.getOrCompute(
      nodeKey,
      { persist: false },
      async (ctx) => {
        calls += 1
        await ctx.recordFileDep('/index.ts')
        return `value-${calls}`
      }
    )
    const secondValue = await session.cache.getOrCompute(
      nodeKey,
      { persist: false },
      () => 'should-not-run'
    )

    expect(firstValue).toBe('value-1')
    expect(secondValue).toBe('value-1')
    expect(calls).toBe(1)

    session.invalidatePath('/index.ts')

    const thirdValue = await session.cache.getOrCompute(
      nodeKey,
      { persist: false },
      async (ctx) => {
        calls += 1
        await ctx.recordFileDep('/index.ts')
        return `value-${calls}`
      }
    )

    expect(thirdValue).toBe('value-2')
    expect(calls).toBe(2)
  })

  test('recomputes when provided const dependency versions change', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(fileSystem, 'const-deps-freshness')
    const store = new CacheStore({ snapshot })
    const nodeKey = 'test:const-deps-freshness'
    let calls = 0

    const run = (compilerOptionsVersion: string) =>
      store.getOrCompute(
        nodeKey,
        {
          persist: false,
          constDeps: [
            {
              name: 'compiler-options',
              version: compilerOptionsVersion,
            },
          ],
        },
        async (ctx) => {
          calls += 1
          ctx.recordConstDep('compiler-options', compilerOptionsVersion)
          return `value-${calls}`
        }
      )

    expect(await run('hash-1')).toBe('value-1')
    expect(await run('hash-1')).toBe('value-1')
    expect(await run('hash-2')).toBe('value-2')
    expect(await run('hash-2')).toBe('value-2')
    expect(calls).toBe(2)
  })

  test('invalidates all linked stores when shared snapshots invalidate a path', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(fileSystem, 'shared-snapshot-store')
    const firstStore = new CacheStore({ snapshot })
    const secondStore = new CacheStore({ snapshot })
    let firstCalls = 0
    let secondCalls = 0

    const readFromStore = (
      store: CacheStore,
      nodeKey: string,
      nextCalls: () => number
    ) =>
      store.getOrCompute(nodeKey, { persist: false }, async (ctx) => {
        await ctx.recordFileDep('/index.ts')
        return `value-${nextCalls()}`
      })

    await readFromStore(firstStore, 'test:shared-store:first', () => {
      firstCalls += 1
      return firstCalls
    })
    await readFromStore(secondStore, 'test:shared-store:second', () => {
      secondCalls += 1
      return secondCalls
    })

    expect(firstCalls).toBe(1)
    expect(secondCalls).toBe(1)

    await fileSystem.writeFile('index.ts', 'export const value = 2')
    snapshot.invalidatePath('/index.ts')

    const firstAfter = await readFromStore(
      firstStore,
      'test:shared-store:first',
      () => {
        firstCalls += 1
        return firstCalls
      }
    )
    const secondAfter = await readFromStore(
      secondStore,
      'test:shared-store:second',
      () => {
        secondCalls += 1
        return secondCalls
      }
    )

    expect(firstAfter).toBe('value-2')
    expect(secondAfter).toBe('value-2')
    expect(firstCalls).toBe(2)
    expect(secondCalls).toBe(2)
  })

  test('path invalidation without manual node deps propagates through reactive parent/child cache links', async () => {
    const fileSystem = new InMemoryFileSystem({
      'src/index.ts': 'export const value = 1',
      'src/child.ts': 'export const child = 1',
    })
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'graph-path-invalidation-parent-propagation'
    )
    const store = new CacheStore({ snapshot })
    const childNodeKey = 'test:graph-path-invalidation:child'
    const parentNodeKey = 'test:graph-path-invalidation:parent'
    let childCalls = 0
    let parentCalls = 0

    const readChild = () =>
      store.getOrCompute(childNodeKey, { persist: false }, async (ctx) => {
        childCalls += 1
        await ctx.recordFileDep('/src/child.ts')
        return childCalls
      })

    const readParent = () =>
      store.getOrCompute(parentNodeKey, { persist: false }, async () => {
        parentCalls += 1
        return readChild()
      })

    const firstValue = await readParent()
    const secondValue = await readParent()

    expect(firstValue).toBe(1)
    expect(secondValue).toBe(1)
    expect(childCalls).toBe(1)
    expect(parentCalls).toBe(1)

    snapshot.invalidatePath('src')

    const thirdValue = await readParent()

    expect(thirdValue).toBe(2)
    expect(childCalls).toBe(2)
    expect(parentCalls).toBe(2)
  })

  test('propagates stale child state through transitive auto node dependencies', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'transitive-auto-node-links'
    )
    const store = new CacheStore({ snapshot })
    const grandchildNodeKey = 'test:transitive:auto:grandchild'
    const childNodeKey = 'test:transitive:auto:child'
    const parentNodeKey = 'test:transitive:auto:parent'
    let grandchildCalls = 0
    let childCalls = 0
    let parentCalls = 0

    const readGrandchild = () =>
      store.getOrCompute(grandchildNodeKey, { persist: false }, async (ctx) => {
        grandchildCalls += 1
        await ctx.recordFileDep('/index.ts')
        return grandchildCalls
      })

    const readChild = () =>
      store.getOrCompute(childNodeKey, { persist: false }, async () => {
        childCalls += 1
        const grandchildValue = await readGrandchild()
        return grandchildValue + 1
      })

    const readParent = () =>
      store.getOrCompute(parentNodeKey, { persist: false }, async () => {
        parentCalls += 1
        const childValue = await readChild()
        return childValue + 1
      })

    const firstValue = await readParent()
    const secondValue = await readParent()

    expect(firstValue).toBe(3)
    expect(secondValue).toBe(3)
    expect(grandchildCalls).toBe(1)
    expect(childCalls).toBe(1)
    expect(parentCalls).toBe(1)

    await fileSystem.writeFile('index.ts', 'export const value = 2')
    snapshot.invalidatePath('/index.ts')

    const thirdValue = await readParent()

    expect(thirdValue).toBe(4)
    expect(grandchildCalls).toBe(2)
    expect(childCalls).toBe(2)
    expect(parentCalls).toBe(2)
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

    const firstGate = createDeferredPromise()
    const secondGate = createDeferredPromise()

    const replaceWithGetOrCompute = async (
      value: string,
      gate: Promise<void>
    ) => {
      await store.getOrCompute(nodeKey, { persist: false }, async () => {
        await gate
        return value
      })
    }

    const firstCompute = replaceWithGetOrCompute(
      'first',
      firstGate.promise
    )
    await Promise.resolve()
    const secondCompute = replaceWithGetOrCompute(
      'second',
      secondGate.promise
    )
    await Promise.resolve()
    firstGate.resolve()
    secondGate.resolve()
    await Promise.all([firstCompute, secondCompute])

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

describe('session cache persistence policy', () => {
  test('uses persisted cache by default for Node filesystems', async () => {
    const tempDirectory = createTmpRenounCacheDirectory(
      'renoun-cache-session-policy-'
    )
    const nodeFileSystem = createTempNodeFileSystem(tempDirectory)
    const memoryFileSystem = new InMemoryFileSystem({})
    const explicitOffFileSystem = createTempNodeFileSystem(tempDirectory)

    try {
      expect(Session.for(nodeFileSystem).usesPersistentCache).toBe(true)

      expect(Session.for(memoryFileSystem).usesPersistentCache).toBe(false)

      expect(
        Session.for(explicitOffFileSystem, undefined, new Cache())
          .usesPersistentCache
      ).toBe(false)
    } finally {
      Session.reset(nodeFileSystem)
      Session.reset(memoryFileSystem)
      Session.reset(explicitOffFileSystem)

      rmSync(tempDirectory, { recursive: true, force: true })
    }
  })

  test('uses persistent cache for node-like rootless filesystems', async () => {
    const rootlessFileSystem = new RootlessNodeFileSystem(process.cwd())

    try {
      expect(Session.for(rootlessFileSystem).usesPersistentCache).toBe(true)
    } finally {
      Session.reset(rootlessFileSystem)
    }
  })
})

describe('sqlite cache persistence', () => {
  test('reuses persisted mdx section jsx across worker sessions', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const pagePath = join(docsDirectory, 'page.mdx')

      mkdirSync(docsDirectory, { recursive: true })
      writeFileSync(pagePath, '# Intro', 'utf8')

      const loadSections = vi.fn(async () => ({
        default: () => null,
        sections: [
          {
            id: 'intro',
            title: 'Intro',
            depth: 1,
            jsx: createElement(
              Fragment,
              null,
              'Intro ',
              createElement('strong', null, 'text')
            ),
          },
        ],
      }))

      const createWorkerDirectory = () =>
        new Directory({
          fileSystem: createTempNodeFileSystem(tmpDirectory),
          path: docsDirectory,
          loader: {
            mdx: loadSections,
          },
        })

      const firstWorkerDirectory = createWorkerDirectory()
      const firstWorkerFile = await firstWorkerDirectory.getFile('page', 'mdx')
      const firstSections = await firstWorkerFile.getSections()

      expect(firstSections).toHaveLength(1)
      expect(firstSections[0]!.title).toBe('Intro')
      expect(isValidElement(firstSections[0]!.jsx as any)).toBe(true)

      const secondWorkerDirectory = createWorkerDirectory()
      const secondWorkerFile = await secondWorkerDirectory.getFile('page', 'mdx')
      const secondSections = await secondWorkerFile.getSections()

      expect(secondSections).toHaveLength(1)
      expect(secondSections[0]!.title).toBe('Intro')
      expect(isValidElement(secondSections[0]!.jsx as any)).toBe(true)
      expect(loadSections).toHaveBeenCalledTimes(1)
    })
  })

  test('persists session directory snapshots across worker sessions', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)

      mkdirSync(join(docsDirectory, 'guides', 'advanced'), { recursive: true })
      writeFileSync(
        join(docsDirectory, 'guides', 'intro.mdx'),
        '# Intro',
        'utf8'
      )
      writeFileSync(
        join(docsDirectory, 'guides', 'advanced', 'getting-started.mdx'),
        '# Getting Started',
        'utf8'
      )
      writeFileSync(
        join(docsDirectory, 'index.mdx'),
        '# Home',
        'utf8'
      )

      const firstWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: workspaceDirectory,
      })

      const firstEntries = await firstWorkerDirectory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
      })
      const firstPaths = firstEntries
        .filter((entry): entry is File => entry instanceof File)
        .map((entry) => entry.workspacePath)
        .sort()

      const secondWorkerFilesystem = createTempNodeFileSystem(tmpDirectory)
      const secondReadDirectory = vi.spyOn(
        secondWorkerFilesystem,
        'readDirectory'
      )
      const secondWorkerDirectory = new Directory({
        fileSystem: secondWorkerFilesystem,
        path: workspaceDirectory,
      })
      const secondEntries = await secondWorkerDirectory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
      })
      const secondPaths = secondEntries
        .filter((entry): entry is File => entry instanceof File)
        .map((entry) => entry.workspacePath)
        .sort()

      expect(secondPaths).toEqual(firstPaths)
      expect(secondReadDirectory).toHaveBeenCalledTimes(0)
    })
  })

  test('persists deep directory snapshot payloads and restores them on a warm run', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)

      mkdirSync(join(docsDirectory, 'guides', 'advanced'), { recursive: true })
      writeFileSync(join(docsDirectory, 'guides', 'intro.mdx'), '# Intro', 'utf8')
      writeFileSync(
        join(docsDirectory, 'guides', 'advanced', 'getting-started.mdx'),
        '# Getting Started',
        'utf8'
      )
      writeFileSync(join(docsDirectory, 'index.mdx'), '# Home', 'utf8')

      const firstWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: workspaceDirectory,
      })

      await firstWorkerDirectory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
      })

      const firstSession = firstWorkerDirectory.getSession()
      const firstSnapshotKey = Array.from(firstSession.directorySnapshots.keys())[0]
      expect(firstSnapshotKey).toBeDefined()

      const persistedSnapshot = await firstSession.cache.get(firstSnapshotKey!)
      expect(persistedSnapshot).toBeDefined()
      const persisted = persistedSnapshot as {
        version: 1 | 2
        path: string
        entries: Array<
          | { kind: 'file'; path: string }
          | { kind: 'directory'; path: string; snapshot: { entries: any[] } }
        >
      }

      expect(persisted.version).toBe(2)
      expect(
        persisted.entries.some(
          (entry) =>
            entry.kind === 'directory' &&
            entry.path.endsWith('guides') &&
            entry.snapshot.entries.some(
              (inner) =>
                inner.kind === 'directory' &&
                inner.path.endsWith('guides/advanced')
            )
        )
      ).toBe(true)

      const secondWorkerFilesystem = createTempNodeFileSystem(tmpDirectory)
      const secondReadDirectory = vi.spyOn(secondWorkerFilesystem, 'readDirectory')
      const secondWorkerDirectory = new Directory({
        fileSystem: secondWorkerFilesystem,
        path: workspaceDirectory,
      })
      const secondEntries = await secondWorkerDirectory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
      })

      expect(
        secondEntries.some((entry) =>
          entry.relativePath.endsWith('getting-started.mdx')
        )
      ).toBe(true)
      expect(secondReadDirectory).toHaveBeenCalledTimes(0)
    })
  })

  test('reuses persisted snapshots without dependency stat checks when token is unchanged', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')

      mkdirSync(join(docsDirectory, 'guides'), { recursive: true })
      writeFileSync(join(docsDirectory, 'guides', 'intro.mdx'), '# Intro', 'utf8')
      writeFileSync(join(docsDirectory, 'index.mdx'), '# Home', 'utf8')
      writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

      const firstFileSystem = new TokenAwareNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        'stable-token'
      )
      const firstWorkerDirectory = new Directory({
        fileSystem: firstFileSystem,
        path: workspaceDirectory,
      })

      await firstWorkerDirectory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
      })

      const secondFileSystem = new TokenAwareNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        'stable-token'
      )
      const secondReadDirectory = vi.spyOn(secondFileSystem, 'readDirectory')
      const secondStatLookup = vi.spyOn(
        secondFileSystem,
        'getFileLastModifiedMs'
      )
      const secondWorkerDirectory = new Directory({
        fileSystem: secondFileSystem,
        path: workspaceDirectory,
      })

      await secondWorkerDirectory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
      })

      expect(secondReadDirectory).toHaveBeenCalledTimes(0)
      expect(secondStatLookup).toHaveBeenCalledTimes(0)
    })
  })

  test('distinguishes workspace-change token cache lookups when values contain separators', async () => {
    const fileSystem = new TokenAwareNodeFileSystem(
      getRootDirectory(),
      join(getRootDirectory(), 'tsconfig.json'),
      'stable-token'
    )

    fileSystem.setChangedPathsSinceToken('a|b', 'c', [
      normalizePathKey('joined-snapshots'),
    ])
    fileSystem.setChangedPathsSinceToken('a', 'b|c', [
      normalizePathKey('primary-snapshots'),
    ])

    const session = Session.for(fileSystem)

    expect(
      Array.from(
        (await session.getWorkspaceChangedPathsSinceToken('a|b', 'c')) ?? []
      )
    ).toEqual([normalizePathKey('joined-snapshots')])
    expect(
      Array.from(
        (await session.getWorkspaceChangedPathsSinceToken('a', 'b|c')) ?? []
      )
    ).toEqual([normalizePathKey('primary-snapshots')])
  })

  test('reuses persisted snapshots when token changes without dependency-path intersection', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')

      mkdirSync(join(docsDirectory, 'guides'), { recursive: true })
      writeFileSync(join(docsDirectory, 'guides', 'intro.mdx'), '# Intro', 'utf8')
      writeFileSync(join(docsDirectory, 'index.mdx'), '# Home', 'utf8')
      writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

      const firstFileSystem = new TokenAwareNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        'stable-token'
      )
      const firstWorkerDirectory = new Directory({
        fileSystem: firstFileSystem,
        path: workspaceDirectory,
      })

      await firstWorkerDirectory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
      })

      const secondFileSystem = new TokenAwareNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        'stable-token'
      )

      const secondReadDirectory = vi.spyOn(secondFileSystem, 'readDirectory')
      const secondStatLookup = vi.spyOn(
        secondFileSystem,
        'getFileLastModifiedMs'
      )
      const secondWorkerDirectory = new Directory({
        fileSystem: secondFileSystem,
        path: workspaceDirectory,
      })

      await secondWorkerDirectory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
      })

      expect(secondReadDirectory).toHaveBeenCalledTimes(0)
      expect(secondStatLookup).toHaveBeenCalledTimes(0)
    })
  })

  test('rebuilds persisted snapshots when hydration throws at restore-time', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')

      mkdirSync(join(docsDirectory, 'guides'), { recursive: true })
      writeFileSync(
        join(docsDirectory, 'guides', 'intro.mdx'),
        '# Intro',
        'utf8'
      )
      writeFileSync(join(docsDirectory, 'index.mdx'), '# Home', 'utf8')
      writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

      const firstFileSystem = createTempNodeFileSystem(tmpDirectory)
      const firstWorkerDirectory = new Directory({
        fileSystem: firstFileSystem,
        path: workspaceDirectory,
      })

      await firstWorkerDirectory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
      })

      const firstSession = firstWorkerDirectory.getSession()
      const snapshotKey = Array.from(firstSession.directorySnapshots.keys())[0]
      expect(snapshotKey).toBeDefined()
      expect(await firstSession.cache.get(snapshotKey!)).toBeDefined()

      const secondFileSystem = createTempNodeFileSystem(tmpDirectory)
      const secondDirectory = new Directory({
        fileSystem: secondFileSystem,
        path: workspaceDirectory,
      })
      const secondSession = secondDirectory.getSession()
      const secondReadDirectory = vi.spyOn(secondFileSystem, 'readDirectory')
      const restoreSpy = vi
        .spyOn(DirectorySnapshot, 'fromPersistedSnapshot')
        .mockImplementationOnce(() => {
          throw new Error('simulated persisted snapshot restore failure')
        })

      try {
        const secondEntries = await secondDirectory.getEntries({
        recursive: false,
        includeIndexAndReadmeFiles: true,
      })

      expect(
        secondEntries.some((entry) =>
          entry.workspacePath.endsWith('index.mdx')
        )
      ).toBe(true)
      expect(secondReadDirectory).toHaveBeenCalledTimes(2)
      expect(await secondSession.cache.get(snapshotKey!)).toBeDefined()
      } finally {
        restoreSpy.mockRestore()
      }
    })
  })

  test('filters out invalid persisted snapshot entries while preserving valid restore', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    try {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const guidesDirectoryPath = join(workspaceDirectory, 'guides')
      const validEntryPath = join(guidesDirectoryPath, 'index.mdx')
      const validEntryAbsolutePath = join(docsDirectory, 'guides', 'index.mdx')
      const guideWorkspacePathKey = normalizePathKey(guidesDirectoryPath)
      const validSnapshotPathKey = normalizePathKey(validEntryPath)

        mkdirSync(join(docsDirectory, 'guides'), { recursive: true })
        writeFileSync(validEntryAbsolutePath, '# Guide', 'utf8')

        const firstFileSystem = createTempNodeFileSystem(tmpDirectory)
        const firstDirectory = new Directory({
          fileSystem: firstFileSystem,
          path: guidesDirectoryPath,
        })

        await firstDirectory.getEntries({
          recursive: true,
          includeIndexAndReadmeFiles: true,
        })

        const firstSession = firstDirectory.getSession()
        const snapshotKey = Array.from(firstSession.directorySnapshots.keys()).find(
          (key) => key.startsWith(`dir:${guideWorkspacePathKey}|`)
        )
        expect(snapshotKey).toBeDefined()

        const corruptedSnapshot = {
          version: 2,
          path: guideWorkspacePathKey,
          hasVisibleDescendant: false,
          shouldIncludeSelf: false,
          lastValidatedAt: Date.now(),
          filterSignature: 'filter:none',
          sortSignature: 'sort:none',
          dependencySignatures: [],
          entries: [
            {
              kind: 'file',
              path: validSnapshotPathKey,
              byteLength: 7,
            },
            {
              kind: 'file',
              path: '../outside.mdx',
              byteLength: 4,
            },
            {
              kind: 'directory',
              path: 'weird/../outside-dir',
              snapshot: {
                version: 2,
                path: 'weird/../outside-dir',
                hasVisibleDescendant: false,
                shouldIncludeSelf: false,
                lastValidatedAt: Date.now(),
                filterSignature: 'filter:none',
                sortSignature: 'sort:none',
                dependencySignatures: [],
                entries: [],
                flatEntries: [],
              },
            },
          ],
          flatEntries: [
            {
              kind: 'file',
              path: validSnapshotPathKey,
            },
            {
              kind: 'file',
              path: '../outside.mdx',
            },
          ],
        }

        await firstSession.cache.put(snapshotKey!, corruptedSnapshot, {
          persist: true,
          deps: [],
        })

        const secondFileSystem = createTempNodeFileSystem(tmpDirectory)
        const secondReadDirectory = vi.spyOn(secondFileSystem, 'readDirectory')
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const secondDirectory = new Directory({
          fileSystem: secondFileSystem,
          path: guidesDirectoryPath,
        })

        try {
          const secondEntries = await secondDirectory.getEntries({
            recursive: true,
            includeIndexAndReadmeFiles: true,
          })
          const cacheKeysAfterFirstRead =
            await secondDirectory.getSession().cache.listNodeKeysByPrefix('dir:')

          expect(
            secondEntries.some((entry) => entry.workspacePath.endsWith('index.mdx'))
          ).toBe(true)
          expect(secondReadDirectory).toHaveBeenCalledTimes(0)
          expect(warnSpy).toHaveBeenCalledTimes(0)
          expect(await secondDirectory.getSession().cache.get(snapshotKey!)).toBeDefined()
          expect(cacheKeysAfterFirstRead).toContain(snapshotKey!)

          const retryEntries = await secondDirectory.getEntries({
            recursive: true,
            includeIndexAndReadmeFiles: true,
          })
          expect(
            retryEntries.some((entry) =>
              entry.workspacePath.endsWith('index.mdx')
            )
          ).toBe(true)
          expect(warnSpy).toHaveBeenCalledTimes(0)
        } finally {
          warnSpy.mockRestore()
        }
      })
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = previousNodeEnv
      }
    }
  })

  test('restores persisted snapshots when cwd-relative roots persist workspace-scoped entries', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const scopedCwd = join(tmpDirectory, 'apps', 'site')
      const docsDirectory = join(scopedCwd, 'docs')
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')

      mkdirSync(docsDirectory, { recursive: true })
      writeFileSync(join(docsDirectory, 'intro.mdx'), '# Intro', 'utf8')
      writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

      const firstFileSystem = new NestedCwdNodeFileSystem(
        scopedCwd,
        tsConfigPath
      )
      const firstDirectory = new Directory({
        fileSystem: firstFileSystem,
        path: './docs',
      })

      await firstDirectory.getEntries({
        includeIndexAndReadmeFiles: true,
      })

      const firstSession = firstDirectory.getSession()
      const docsWorkspacePathKey = normalizePathKey(firstDirectory.workspacePath)
      const snapshotKey = Array.from(firstSession.directorySnapshots.keys()).find(
        (key) => key.startsWith(`dir:${docsWorkspacePathKey}|`)
      )

      expect(snapshotKey).toBeDefined()

      const persistedSnapshot = (await firstSession.cache.get(snapshotKey!)) as {
        path?: unknown
      }
      expect(persistedSnapshot.path).toBe(docsWorkspacePathKey)

      const secondFileSystem = new NestedCwdNodeFileSystem(
        scopedCwd,
        tsConfigPath
      )
      const secondDirectory = new Directory({
        fileSystem: secondFileSystem,
        path: './docs',
      })

      const secondEntries = await secondDirectory.getEntries({
        includeIndexAndReadmeFiles: true,
      })

      expect(
        secondEntries.some((entry) => entry.workspacePath.endsWith('intro.mdx'))
      ).toBe(true)
    })
  })

  test('restores persisted file entries with byteLength metadata', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')

      mkdirSync(docsDirectory, { recursive: true })
      writeFileSync(join(docsDirectory, 'index.mdx'), '# Home', 'utf8')
      writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

      const firstWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: workspaceDirectory,
      })

      await firstWorkerDirectory.getEntries({
        includeIndexAndReadmeFiles: true,
      })

      const secondFileSystem = new ThrowingByteLengthNodeFileSystem(
        getRootDirectory(),
        tsConfigPath
      )
      ;(secondFileSystem as { repoRoot?: string }).repoRoot = tmpDirectory
      const secondReadDirectory = vi.spyOn(secondFileSystem, 'readDirectory')
      const secondWorkerDirectory = new Directory({
        fileSystem: secondFileSystem,
        path: workspaceDirectory,
      })

      const restoredEntries = await secondWorkerDirectory.getEntries({
        includeIndexAndReadmeFiles: true,
      })
      const restoredFiles = restoredEntries.filter(
        (entry): entry is File => entry instanceof File
      )

      expect(restoredFiles.length).toBeGreaterThan(0)
      expect(restoredFiles[0]!.size).toBeGreaterThan(0)
      expect(secondReadDirectory).toHaveBeenCalledTimes(0)
    })
  })

  test('rebuilds persisted snapshots when token is unchanged but dependency signature changes', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')
      const indexPath = join(docsDirectory, 'index.mdx')

      mkdirSync(join(docsDirectory, 'guides'), { recursive: true })
      writeFileSync(indexPath, '# Home', 'utf8')
      writeFileSync(
        join(docsDirectory, 'guides', 'intro.mdx'),
        '# Intro',
        'utf8'
      )
      writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

      const firstFileSystem = new TokenAwareNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        'stable-token'
      )
      const firstWorkerDirectory = new Directory({
        fileSystem: firstFileSystem,
        path: workspaceDirectory,
      })

      await firstWorkerDirectory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
      })
      const previousToken = await firstFileSystem.getWorkspaceChangeToken(
        workspaceDirectory
      )

      writeFileSync(
        join(docsDirectory, 'guides', 'new.mdx'),
        '# New Guide',
        'utf8'
      )

      const secondFileSystem = new TokenAwareNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        'stable-token'
      )
      secondFileSystem.setChangedPathsSinceToken(
        workspaceDirectory,
        previousToken,
        [
          normalizePathKey(
            relativePath(getRootDirectory(), join(docsDirectory, 'guides', 'new.mdx'))
          ),
        ]
      )
      const secondReadDirectory = vi.spyOn(secondFileSystem, 'readDirectory')
      const secondWorkerDirectory = new Directory({
        fileSystem: secondFileSystem,
        path: workspaceDirectory,
      })

      const secondEntries = await secondWorkerDirectory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
      })

      expect(secondReadDirectory).toHaveBeenCalledTimes(2)
      expect(
        secondEntries.some((entry) => entry.workspacePath.endsWith('new.mdx'))
      ).toBe(true)
    })
  })

  test('stores persisted snapshot paths as normalized workspace-relative keys', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)

      mkdirSync(join(docsDirectory, 'guides', 'advanced'), { recursive: true })
      writeFileSync(join(docsDirectory, 'guides', 'intro.mdx'), '# Intro', 'utf8')
      writeFileSync(
        join(docsDirectory, 'guides', 'advanced', 'getting-started.mdx'),
        '# Getting Started',
        'utf8'
      )
      writeFileSync(join(docsDirectory, 'index.mdx'), '# Home', 'utf8')

      const directory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: workspaceDirectory,
      })

      await directory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
      })

      const session = directory.getSession()
      const snapshotKey = Array.from(session.directorySnapshots.keys())[0]
      expect(snapshotKey).toBeDefined()

      const persistedSnapshot = await session.cache.get(snapshotKey!)
      expect(persistedSnapshot).toBeDefined()

      const payload = persistedSnapshot as {
        entries: Array<
          | { kind: 'file'; path: string; byteLength?: number }
          | {
              kind: 'directory'
              path: string
              snapshot: { entries: Array<{ kind: string; path: string }> }
            }
        >
      }

      const collectedPaths: string[] = []
      const collectPaths = (
        entries: Array<
          | { kind: 'file'; path: string; byteLength?: number }
          | {
              kind: 'directory'
              path: string
              snapshot: { entries: Array<{ kind: string; path: string }> }
            }
        >
      ) => {
        for (const entry of entries) {
          collectedPaths.push(entry.path)
          if (entry.kind === 'directory') {
            collectPaths(entry.snapshot.entries as any)
          }
        }
      }
      collectPaths(payload.entries)

      expect(collectedPaths.length).toBeGreaterThan(0)
      expect(
        collectedPaths.every((path) => path === normalizePathKey(path))
      ).toBe(true)

      const rootPathKey = normalizePathKey(workspaceDirectory)
      expect(
        collectedPaths.some((path) =>
          path.includes(`${rootPathKey}/${rootPathKey}`)
        )
      ).toBe(false)
    })
  })

  test('dedupes concurrent persisted snapshot rebuilds across workers', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)

      mkdirSync(docsDirectory, { recursive: true })
      const targetFile = join(docsDirectory, 'index.mdx')
      writeFileSync(targetFile, '# Home', 'utf8')

      const seedDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: workspaceDirectory,
      })
      await seedDirectory.getEntries({
        includeIndexAndReadmeFiles: true,
      })

      writeFileSync(targetFile, '# Updated Home', 'utf8')

      const firstWorkerFileSystem = createTempNodeFileSystem(tmpDirectory)
      const secondWorkerFileSystem = createTempNodeFileSystem(tmpDirectory)
      const firstReadDirectory = vi.spyOn(firstWorkerFileSystem, 'readDirectory')
      const secondReadDirectory = vi.spyOn(
        secondWorkerFileSystem,
        'readDirectory'
      )

      const firstWorkerDirectory = new Directory({
        fileSystem: firstWorkerFileSystem,
        path: workspaceDirectory,
      })
      const secondWorkerDirectory = new Directory({
        fileSystem: secondWorkerFileSystem,
        path: workspaceDirectory,
      })

      await Promise.all([
        firstWorkerDirectory.getEntries({
          includeIndexAndReadmeFiles: true,
        }),
        secondWorkerDirectory.getEntries({
          includeIndexAndReadmeFiles: true,
        }),
      ])

      const totalDirectoryReads =
        firstReadDirectory.mock.calls.length + secondReadDirectory.mock.calls.length
      expect(totalDirectoryReads).toBe(1)
    })
  })

  test('rebuilds persisted directory snapshots when a child signature changes', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    try {
      await withProductionSqliteCache(async (tmpDirectory) => {
        const docsDirectory = join(tmpDirectory, 'docs')
        const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)

        mkdirSync(join(docsDirectory, 'guides'), { recursive: true })
        const childPath = join(docsDirectory, 'guides', 'intro.mdx')
        writeFileSync(childPath, '# Intro', 'utf8')
        writeFileSync(join(docsDirectory, 'index.mdx'), '# Home', 'utf8')

        const firstWorkerDirectory = new Directory({
          fileSystem: createTempNodeFileSystem(tmpDirectory),
          path: workspaceDirectory,
        })

        await firstWorkerDirectory.getEntries({
          recursive: true,
          includeIndexAndReadmeFiles: true,
        })

        writeFileSync(childPath, '# Intro with updates', 'utf8')

        const secondWorkerFilesystem = createTempNodeFileSystem(tmpDirectory)
        const secondReadDirectory = vi.spyOn(
          secondWorkerFilesystem,
          'readDirectory'
        )
        const secondWorkerDirectory = new Directory({
          fileSystem: secondWorkerFilesystem,
          path: workspaceDirectory,
        })

        await secondWorkerDirectory.getEntries({
          recursive: true,
          includeIndexAndReadmeFiles: true,
        })

        expect(secondReadDirectory).toHaveBeenCalledTimes(1)
      })
    } finally {
      process.env.NODE_ENV = previousNodeEnv
    }
  })

  test('does not persist function-based directory snapshot options', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const mdxFilter = (entry: any): entry is File =>
        entry instanceof File && entry.extension === 'mdx'

      mkdirSync(join(docsDirectory, 'guides'), { recursive: true })
      writeFileSync(join(docsDirectory, 'index.mdx'), '# Home', 'utf8')
      writeFileSync(join(docsDirectory, 'notes.txt'), 'note', 'utf8')

      const firstWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: workspaceDirectory,
        filter: mdxFilter,
      })

      await firstWorkerDirectory.getEntries({
        includeIndexAndReadmeFiles: true,
      })

      const firstSession = firstWorkerDirectory.getSession()
      const snapshotKeys = Array.from(firstSession.directorySnapshots.keys())
      expect(snapshotKeys.length).toBe(1)
      expect(
        await firstSession.cache.get(snapshotKeys[0]!)
      ).toBeUndefined()

      const secondWorkerFilesystem = createTempNodeFileSystem(tmpDirectory)
      const secondReadDirectory = vi.spyOn(
        secondWorkerFilesystem,
        'readDirectory'
      )
      const secondWorkerDirectory = new Directory({
        fileSystem: secondWorkerFilesystem,
        path: workspaceDirectory,
        filter: (entry: any): entry is File =>
          entry instanceof File && entry.extension === 'mdx',
      })

      await secondWorkerDirectory.getEntries({
        includeIndexAndReadmeFiles: true,
      })

      expect(secondReadDirectory).toHaveBeenCalledTimes(1)
    })
  })

  test('does not persist structure cache when sort compare is a function', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)

      mkdirSync(docsDirectory, { recursive: true })
      writeFileSync(join(docsDirectory, 'a.mdx'), '# A', 'utf8')
      writeFileSync(join(docsDirectory, 'b.mdx'), '# B', 'utf8')

      const directory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: workspaceDirectory,
        sort: {
          key: 'name',
          compare: (left: string, right: string) => left.localeCompare(right),
        },
      })

      await directory.getStructure()

      const session = directory.getSession()
      const nodeKey = directory.getStructureCacheKey()
      session.cache.clearMemory()

      expect(await session.cache.get(nodeKey)).toBeUndefined()
    })
  })

  test('invalidateSnapshots clears persisted snapshot rows', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)

      mkdirSync(docsDirectory, { recursive: true })
      writeFileSync(join(docsDirectory, 'index.mdx'), '# Home', 'utf8')

      const directory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: workspaceDirectory,
      })

      await directory.getEntries({
        includeIndexAndReadmeFiles: true,
      })

      const session = directory.getSession()
      const snapshotKey = Array.from(session.directorySnapshots.keys())[0]
      expect(snapshotKey).toBeDefined()

      session.cache.clearMemory()
      expect(await session.cache.get(snapshotKey!)).toBeDefined()

      directory.invalidateSnapshots()

      for (let attempt = 0; attempt < 20; attempt += 1) {
        session.cache.clearMemory()
        if ((await session.cache.get(snapshotKey!)) === undefined) {
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 25))
      }

      session.cache.clearMemory()
      expect(await session.cache.get(snapshotKey!)).toBeUndefined()
    })
  })

  test('invalidates persisted directory snapshots when cache paths are invalidated', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const targetFile = join(docsDirectory, 'notes.md')

      mkdirSync(join(docsDirectory, 'guides'), { recursive: true })
      writeFileSync(join(docsDirectory, 'guides', 'intro.mdx'), '# Intro', 'utf8')
      writeFileSync(targetFile, 'note', 'utf8')

      const firstWorkerDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: workspaceDirectory,
      })
      await firstWorkerDirectory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
      })

      const firstSession = firstWorkerDirectory.getSession()
      const snapshotKey = Array.from(firstSession.directorySnapshots.keys())[0]
      expect(snapshotKey).toBeDefined()
      expect(await firstSession.cache.get(snapshotKey!)).toBeDefined()

      firstSession.invalidatePath(targetFile)

      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (await firstSession.cache.get(snapshotKey!) === undefined) {
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 25))
      }

      const secondWorkerFilesystem = createTempNodeFileSystem(tmpDirectory)
      const secondReadDirectory = vi.spyOn(
        secondWorkerFilesystem,
        'readDirectory'
      )
      const secondWorkerDirectory = new Directory({
        fileSystem: secondWorkerFilesystem,
        path: workspaceDirectory,
      })
      await secondWorkerDirectory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
      })

      expect(secondReadDirectory).toHaveBeenCalledTimes(1)
    })
  })

  test('evicts only impacted persisted snapshots via dependency index invalidation', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const guidesWorkspacePath = join(workspaceDirectory, 'guides')
      const apiWorkspacePath = join(workspaceDirectory, 'api')

      mkdirSync(join(docsDirectory, 'guides'), { recursive: true })
      mkdirSync(join(docsDirectory, 'api'), { recursive: true })
      writeFileSync(join(docsDirectory, 'guides', 'intro.mdx'), '# Intro', 'utf8')
      writeFileSync(join(docsDirectory, 'api', 'reference.mdx'), '# Reference', 'utf8')

      const fileSystem = createTempNodeFileSystem(tmpDirectory)
      const guidesDirectory = new Directory({
        fileSystem,
        path: guidesWorkspacePath,
      })
      const apiDirectory = new Directory({
        fileSystem,
        path: apiWorkspacePath,
      })

      await guidesDirectory.getEntries({
        includeIndexAndReadmeFiles: true,
      })
      await apiDirectory.getEntries({
        includeIndexAndReadmeFiles: true,
      })

      const session = guidesDirectory.getSession()
      const guidesPathKey = normalizePathKey(guidesWorkspacePath)
      const apiPathKey = normalizePathKey(apiWorkspacePath)
      const snapshotKeys = Array.from(session.directorySnapshots.keys())
      const guidesSnapshotKey = snapshotKeys.find((key) =>
        key.startsWith(`dir:${guidesPathKey}|`)
      )
      const apiSnapshotKey = snapshotKeys.find((key) =>
        key.startsWith(`dir:${apiPathKey}|`)
      )

      expect(guidesSnapshotKey).toBeDefined()
      expect(apiSnapshotKey).toBeDefined()
      expect(await session.cache.get(guidesSnapshotKey!)).toBeDefined()
      expect(await session.cache.get(apiSnapshotKey!)).toBeDefined()

      session.invalidatePath(join(docsDirectory, 'guides', 'intro.mdx'))

      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (await session.cache.get(guidesSnapshotKey!) === undefined) {
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 25))
      }

      expect(await session.cache.get(guidesSnapshotKey!)).toBeUndefined()
      expect(await session.cache.get(apiSnapshotKey!)).toBeDefined()
    })
  })

  test('falls back to intersecting path-pattern persisted invalidation when dependency metadata is missing', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const affectedSnapshotPathKey = normalizePathKey(join(workspaceDirectory, 'guides'))
      const unrelatedSnapshotPathKey = normalizePathKey(join(workspaceDirectory, 'api'))

      mkdirSync(docsDirectory, { recursive: true })
      mkdirSync(join(docsDirectory, 'guides'), { recursive: true })
      mkdirSync(join(docsDirectory, 'api'), { recursive: true })
      writeFileSync(join(docsDirectory, 'guides', 'index.mdx'), '# Guides', 'utf8')
      writeFileSync(join(docsDirectory, 'api', 'index.mdx'), '# API', 'utf8')

      const directory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: workspaceDirectory,
      })
      await directory.getEntries({
        includeIndexAndReadmeFiles: true,
      })

      const session = directory.getSession()
      const affectedSnapshotKey = `dir:${affectedSnapshotPathKey}|fallback-affected`
      const unaffectedSnapshotKey =
        `dir:${unrelatedSnapshotPathKey}|fallback-unrelated`

      await session.cache.put(affectedSnapshotKey, {
        version: 1,
        path: affectedSnapshotPathKey,
        hasVisibleDescendant: false,
        shouldIncludeSelf: false,
        lastValidatedAt: Date.now(),
        filterSignature: 'filter:none',
        sortSignature: 'sort:none',
        dependencySignatures: [],
        entries: [],
        flatEntries: [],
      }, {
        persist: true,
        deps: [],
      })

      await session.cache.put(unaffectedSnapshotKey, {
        version: 1,
        path: unrelatedSnapshotPathKey,
        hasVisibleDescendant: false,
        shouldIncludeSelf: false,
        lastValidatedAt: Date.now(),
        filterSignature: 'filter:none',
        sortSignature: 'sort:none',
        dependencySignatures: [],
        entries: [],
        flatEntries: [],
      }, {
        persist: true,
        deps: [],
      })

      expect(await session.cache.get(affectedSnapshotKey)).toBeDefined()
      expect(await session.cache.get(unaffectedSnapshotKey)).toBeDefined()

      session.invalidatePath(join(docsDirectory, 'guides', 'index.mdx'))

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const affectedResult = await session.cache.get(affectedSnapshotKey)
        const unaffectedResult = await session.cache.get(unaffectedSnapshotKey)

        if (affectedResult === undefined && unaffectedResult !== undefined) {
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 25))
      }

      expect(await session.cache.get(affectedSnapshotKey)).toBeUndefined()
      expect(await session.cache.get(unaffectedSnapshotKey)).toBeDefined()
    })
  })

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
      const secondWorkerFile = await secondWorkerDirectory.getFile(
        'page',
        'mdx'
      )
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

      const createWorkerFileSystem = () =>
        createTempNodeFileSystem(tmpDirectory)

      const firstWorkerDirectory = new Directory({
        fileSystem: createWorkerFileSystem(),
        path: docsDirectory,
      })
      const firstStructure = await firstWorkerDirectory.getStructure()
      const firstIntro = firstStructure.find(
        (entry): entry is FileStructure =>
          entry.kind === 'File' &&
          entry.relativePath.endsWith('docs/guides/intro.mdx')
      )
      expect(firstIntro?.description).toBe('Intro')

      const secondWorkerDirectory = new Directory({
        fileSystem: createWorkerFileSystem(),
        path: docsDirectory,
      })
      const secondStructure = await secondWorkerDirectory.getStructure()
      const secondIntro = secondStructure.find(
        (entry): entry is FileStructure =>
          entry.kind === 'File' &&
          entry.relativePath.endsWith('docs/guides/intro.mdx')
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
          entry.kind === 'File' &&
          entry.relativePath.endsWith('docs/guides/intro.mdx')
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
      const createWorkerFileSystem = () =>
        createTempNodeFileSystem(tmpDirectory)

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
      const createWorkerFileSystem = () =>
        createTempNodeFileSystem(tmpDirectory)
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
      const resolveTypeForDependency = (
        dependencyContent: string
      ): ResolvedTypeAtLocationResult => {
        if (dependencyContent.includes('count')) {
          return {
            resolvedType: {
              kind: 'TypeAlias',
              name: 'Metadata',
              text: 'Metadata = { count: number; total: number }',
              type: {
                kind: 'TypeLiteral',
                text: '{ count: number; total: number }',
                members: [
                  {
                    kind: 'PropertySignature',
                    name: 'count',
                    text: 'count',
                    type: { kind: 'Number', text: 'number' } as any,
                  },
                  {
                    kind: 'PropertySignature',
                    name: 'total',
                    text: 'total',
                    type: { kind: 'Number', text: 'number' } as any,
                  },
                ],
              } as any,
              typeParameters: [],
            } as any,
            dependencies: [],
          } as ResolvedTypeAtLocationResult
        }

        return {
          resolvedType: {
            kind: 'TypeAlias',
            name: 'Metadata',
            text: 'Metadata = { name: string }',
            type: {
              kind: 'TypeLiteral',
              text: '{ name: string }',
              members: [
                {
                  kind: 'PropertySignature',
                  name: 'name',
                  text: 'name',
                  type: { kind: 'String', text: 'string' } as any,
                },
              ],
            } as any,
            typeParameters: [],
            } as any,
          dependencies: [],
        } as ResolvedTypeAtLocationResult
      }

      try {
        typeResolverSpy.mockImplementation(
          async function (
            this: NodeFileSystem,
            filePath: string,
            _position: number,
            _kind: number,
            _filter?: unknown
          ): Promise<ResolvedTypeAtLocationResult> {
            const dependencyPath = resolvePath(dirname(filePath), 'b.ts')
            const dependencyContent = await this.readFile(dependencyPath)
            const dependencyResult = resolveTypeForDependency(dependencyContent)
            return {
              ...dependencyResult,
              dependencies: [dependencyPath],
            }
          }
        )

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
      const createWorkerFileSystem = () =>
        createTempNodeFileSystem(tmpDirectory)

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
      const createWorkerFileSystem = () =>
        createTempNodeFileSystem(tmpDirectory)
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
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-persist-false-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-persist-false'
      )
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

  test('keeps persisted const-only dependencies fresh without runtime const registration', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-persisted-const-fallback-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-persisted-const-fallback'
      )
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:persisted-const-fallback'

      const writerStore = new CacheStore({ snapshot, persistence })
      await writerStore.put(
        nodeKey,
        { value: 'persisted' },
        {
          persist: true,
          deps: [
            {
              depKey: `const:${encodeURIComponent('cache-version')}`,
              depVersion: '1',
            },
          ],
        }
      )

      const reloadedStore = new CacheStore({ snapshot, persistence })
      const cached = await reloadedStore.get(nodeKey)
      const freshness = await reloadedStore.getWithFreshness(nodeKey)

      expect(cached).toEqual({ value: 'persisted' })
      expect(freshness).toEqual({
        value: { value: 'persisted' },
        fresh: true,
      })
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
        .get(nodeKey) as
        | { updated_at?: number; last_accessed_at?: number }
        | undefined
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
        .get(nodeKey) as
        | { updated_at?: number; last_accessed_at?: number }
        | undefined
      afterDb.close()

      expect(afterRow?.updated_at).toBe(beforeRow?.updated_at)
      expect(afterRow?.last_accessed_at ?? 0).toBeGreaterThanOrEqual(
        beforeRow?.last_accessed_at ?? 0
      )
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('throttles repeated persisted read touches to reduce sqlite write churn', async () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-touch-throttle-'))

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-touch-throttle')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:touch-throttle'

      const writerStore = new CacheStore({ snapshot, persistence })
      await writerStore.put(
        nodeKey,
        { value: 1 },
        {
          persist: true,
          deps: [{ depKey: 'const:touch-throttle:1', depVersion: '1' }],
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
            SELECT last_accessed_at
            FROM cache_entries
            WHERE node_key = ?
          `
        )
        .get(nodeKey) as { last_accessed_at?: number } | undefined
      beforeDb.close()

      const firstReader = new CacheStore({ snapshot, persistence })
      await firstReader.get(nodeKey)

      const afterFirstReadDb = new DatabaseSync(dbPath)
      const afterFirstReadRow = afterFirstReadDb
        .prepare(
          `
            SELECT last_accessed_at
            FROM cache_entries
            WHERE node_key = ?
          `
        )
        .get(nodeKey) as { last_accessed_at?: number } | undefined
      afterFirstReadDb.close()

      const secondReader = new CacheStore({ snapshot, persistence })
      await secondReader.get(nodeKey)

      const afterSecondReadDb = new DatabaseSync(dbPath)
      const afterSecondReadRow = afterSecondReadDb
        .prepare(
          `
            SELECT last_accessed_at
            FROM cache_entries
            WHERE node_key = ?
          `
        )
        .get(nodeKey) as { last_accessed_at?: number } | undefined
      afterSecondReadDb.close()

      expect(afterFirstReadRow?.last_accessed_at ?? 0).toBeGreaterThanOrEqual(
        beforeRow?.last_accessed_at ?? 0
      )
      expect(afterSecondReadRow?.last_accessed_at).toBe(
        afterFirstReadRow?.last_accessed_at
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

      await secondStore.getOrCompute(
        nodeKey,
        { persist: true },
        async (ctx) => {
          computeCount += 1
          await ctx.recordFileDep('/index.ts')
          return { value: 2 }
        }
      )

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

  test('uses tmpdir as cache root when project root is filesystem root', () => {
    expect(getDefaultCacheDatabasePath('/')).toBe(
      resolvePath(tmpdir(), '.renoun', 'cache', 'fs-cache.sqlite')
    )
  })

  test('canonicalizes alias session roots so symlinked paths share one sqlite namespace', async () => {
    const tmpDirectory = createTmpRenounCacheDirectory(
      'renoun-cache-session-root-alias-'
    )
    const realRoot = join(tmpDirectory, 'real')
    const aliasRoot = join(tmpDirectory, 'alias')

    mkdirSync(realRoot, { recursive: true })
    symlinkSync(realRoot, aliasRoot, 'dir')
    writeFileSync(join(realRoot, 'index.ts'), 'export const value = 1', 'utf8')

    const realFileSystem = new NodeFileSystem()
    const aliasFileSystem = new NodeFileSystem()
    ;(realFileSystem as { repoRoot: string }).repoRoot = realRoot
    ;(aliasFileSystem as { repoRoot: string }).repoRoot = aliasRoot

    try {
      const realSession = Session.for(realFileSystem)
      const aliasSession = Session.for(aliasFileSystem)
      let computeCount = 0

      const realResult = await realSession.cache.getOrCompute(
        'test:session-root-alias',
        { persist: true },
        async () => {
          computeCount += 1
          return 'real'
        }
      )
      const aliasResult = await aliasSession.cache.getOrCompute(
        'test:session-root-alias',
        { persist: true },
        async () => {
          computeCount += 1
          return 'alias'
        }
      )

      expect(realResult).toBe('real')
      expect(aliasResult).toBe('real')
      expect(computeCount).toBe(1)
    } finally {
      Session.reset(realFileSystem)
      Session.reset(aliasFileSystem)
      disposeDefaultCacheStorePersistence()
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('canonicalizes alias project roots for direct cache db resolution', () => {
    const tmpDirectory = createTmpRenounCacheDirectory(
      'renoun-cache-direct-alias-'
    )
    const realRoot = join(tmpDirectory, 'real')
    const aliasRoot = join(tmpDirectory, 'alias')
    mkdirSync(realRoot, { recursive: true })
    symlinkSync(realRoot, aliasRoot, 'dir')

    try {
      const directPath = getDefaultCacheDatabasePath(realRoot)
      const aliasedPath = getDefaultCacheDatabasePath(aliasRoot)

      expect(directPath).toBe(aliasedPath)

      const realPersistence = getCacheStorePersistence({ projectRoot: realRoot })
      const aliasPersistence = getCacheStorePersistence({ projectRoot: aliasRoot })

      expect(aliasPersistence).toBe(realPersistence)
    } finally {
      disposeCacheStorePersistence({ projectRoot: realRoot })
      disposeCacheStorePersistence({ projectRoot: aliasRoot })
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('cleans stale compute slots during sqlite read', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-inflight-cleanup-read-')
    )
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const persistence = new SqliteCacheStorePersistence({ dbPath })
    const nodeKey = 'test:sqlite-read-stale-inflight'

    try {
      await persistence.save(nodeKey, {
        value: 'initialized',
        deps: [],
        fingerprint: createFingerprint([]),
        persist: false,
        updatedAt: Date.now(),
      })

      const sqliteModule = (await import('node:sqlite')) as {
        DatabaseSync?: new (path: string) => any
      }
      const DatabaseSync = sqliteModule.DatabaseSync
      if (!DatabaseSync) {
        throw new Error('node:sqlite DatabaseSync is unavailable')
      }

      const staleAt = Date.now() - 1_000
      const sqliteDb = new DatabaseSync(dbPath)
      sqliteDb
        .prepare(
          `
            INSERT INTO cache_inflight (node_key, owner, started_at, expires_at)
            VALUES (?, ?, ?, ?)
          `
        )
        .run(nodeKey, 'stale-reader', staleAt - 1_000, staleAt)

      const rowsBefore = sqliteDb
        .prepare(
          `SELECT node_key FROM cache_inflight WHERE node_key = ?`
        )
        .all(nodeKey) as Array<{ node_key?: string }>
      sqliteDb.close()

      expect(rowsBefore.length).toBe(1)

      await persistence.load(nodeKey)

      const verifiedDb = new DatabaseSync(dbPath)
      const rowsAfter = verifiedDb
        .prepare(
          `SELECT node_key FROM cache_inflight WHERE node_key = ?`
        )
        .all(nodeKey) as Array<{ node_key?: string }>
      verifiedDb.close()

      expect(rowsAfter.length).toBe(0)
    } finally {
      disposeCacheStorePersistence({ dbPath })
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('continues persisting other cache entries after skipping an unserializable value', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-unserializable-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-unserializable'
      )
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const store = new CacheStore({ snapshot, persistence })

      const unserializableValue = { value: Symbol('not-serializable') }

      await store.put(
        'test:unserializable',
        unserializableValue,
        { persist: true }
      )
      await store.put('test:serializable', { value: 1 }, { persist: true })

      const memoryValue = await store.get<typeof unserializableValue>(
        'test:unserializable'
      )
      const reloadedStore = new CacheStore({ snapshot, persistence })
      const skippedValue = await reloadedStore.get('test:unserializable')
      const persistedValue = await reloadedStore.get<{ value: number }>(
        'test:serializable'
      )

      expect(memoryValue).toEqual(unserializableValue)
      expect(skippedValue).toBeUndefined()
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
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-stripped-react'
      )
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
      await writerStore.put(
        'test:stripped-react-symbolic',
        {
          title: {
            $$typeof: Symbol.for('react.transitional.element'),
            key: null,
            ref: null,
            props: { children: 'section heading' },
          },
        },
        { persist: true }
      )
      await writerStore.put(
        'test:still-serializable',
        { value: 1 },
        { persist: true }
      )

      const readerStore = new CacheStore({ snapshot, persistence })
      const strippedValue = await readerStore.get('test:stripped-react')
      const strippedSymbolicValue = await readerStore.get(
        'test:stripped-react-symbolic'
      )
      const serializableValue = await readerStore.get<{ value: number }>(
        'test:still-serializable'
      )

      expect(strippedValue).toBeUndefined()
      expect(strippedSymbolicValue).toBeUndefined()
      expect(serializableValue).toEqual({ value: 1 })
      expect(await persistence.load('test:stripped-react')).toBeUndefined()
      expect(await persistence.load('test:stripped-react-symbolic')).toBeUndefined()
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('removes stale persisted entries when fingerprint checks fail', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-fingerprint-')
    )

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
        .prepare(
          `SELECT COUNT(*) as total FROM cache_entries WHERE node_key = ?`
        )
        .get(nodeKey) as { total?: number }
      verifyDb.close()
      expect(Number(countRow.total ?? 0)).toBe(0)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('deletes stale persisted entries before recomputing when getOrCompute throws', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-stale-delete-')
    )

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
        load: async (lookupNodeKey: string) => persistence.load(lookupNodeKey),
        save: vi.fn(async () => {
          throw new Error('disk write failure')
        }),
        delete: vi.fn(async () => {
          throw new Error('disk delete failure')
        }),
      }

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const failingStore = new CacheStore({
        snapshot,
        persistence: failingPersistence,
      })

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

      const reopenAfterFailureStore = new CacheStore({
        snapshot,
        persistence: failingPersistence,
      })
      expect(await reopenAfterFailureStore.get(nodeKey)).toBeUndefined()

      const reopenedStore = new CacheStore({ snapshot, persistence })
      expect(await reopenedStore.get(nodeKey)).toBeUndefined()
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('does not rehydrate a persisted row after delete cleanup fails', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-delete-cleanup-fallback-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-delete-cleanup-fallback'
      )
      const nodeKey = 'test:delete-cleanup-fallback'

      const seedPersistence = new SqliteCacheStorePersistence({ dbPath })
      const seedStore = new CacheStore({
        snapshot,
        persistence: seedPersistence,
      })

      await seedStore.put(nodeKey, { value: 1 }, { persist: true })

      const failingPersistence = {
        load: async (lookupNodeKey: string) =>
          seedPersistence.load(lookupNodeKey),
        save: async (lookupNodeKey: string, entry: CacheEntry) =>
          seedPersistence.save(lookupNodeKey, entry),
        delete: vi.fn(async () => {
          throw new Error('disk delete failure')
        }),
      }
      const failingStore = new CacheStore({
        snapshot,
        persistence: failingPersistence,
      })

      await failingStore.delete(nodeKey)
      expect(await failingStore.get(nodeKey)).toBeUndefined()

      await new Promise((resolve) => setTimeout(resolve, 2200))

      expect(await failingStore.get(nodeKey)).toBeUndefined()
      expect(failingPersistence.delete).toHaveBeenCalledTimes(1)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('does not resurrect deleted entries after concurrent save cleanup', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(fileSystem, 'persistence-delete-race')
    const nodeKey = 'test:persistence-delete-race'
    const saveStarted = createDeferredPromise()
    const allowSaveFailure = createDeferredPromise()
    const persistence = {
      load: vi.fn(async () => undefined),
      save: vi.fn(async () => {
        saveStarted.resolve()
        await allowSaveFailure.promise
        throw new Error('disk write failure')
      }),
      delete: vi.fn(async () => undefined),
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = new CacheStore({ snapshot, persistence })

    try {
      const inFlightWrite = store.getOrCompute(
        nodeKey,
        { persist: true },
        async (ctx) => {
          await ctx.recordFileDep('/index.ts')
          return { value: 1 }
        }
      )

      await saveStarted.promise

      const deletePromise = store.delete(nodeKey)
      allowSaveFailure.resolve()

      await expect(deletePromise).resolves.toBeUndefined()
      await expect(inFlightWrite).resolves.toEqual({ value: 1 })

      expect(await store.get(nodeKey)).toBeUndefined()
      expect(persistence.delete).toHaveBeenCalledTimes(2)
    } finally {
      warnSpy.mockRestore()
    }
  })

  test('keeps persisted cache values consistent across multiple stores during updates', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-multi-store-')
    )

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
            readerStore.getOrCompute(
              nodeKey,
              { persist: true },
              async (ctx) => {
                await ctx.recordFileDep('/index.ts')
                return { value: -1 }
              }
            )
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
        const countRow = db
          .prepare(`SELECT COUNT(*) as total FROM cache_entries`)
          .get() as {
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

  test('age pruning uses last_accessed_at instead of updated_at', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-prune-last-accessed-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-prune-last-accessed'
      )
      const persistence = new SqliteCacheStorePersistence({
        dbPath,
        maxRows: 2,
        maxAgeMs: 1_000,
      })
      const store = new CacheStore({ snapshot, persistence })
      const survivorNodeKey = 'test:stale-survivor'

      await store.put(
        survivorNodeKey,
        { value: 'a' },
        {
          persist: true,
          deps: [{ depKey: 'const:stale-survivor:1', depVersion: '1' }],
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
        db.prepare(
          `
            UPDATE cache_entries
            SET updated_at = ?, last_accessed_at = ?
            WHERE node_key = ?
          `
        ).run(
          Date.now() - 24 * 60 * 60 * 1_000,
          Date.now() + 60_000,
          survivorNodeKey
        )
      } finally {
        db.close()
      }

      await store.put(
        'test:stale-trigger:b',
        { value: 'b' },
        {
          persist: true,
          deps: [{ depKey: 'const:stale-trigger:b:1', depVersion: '1' }],
        }
      )
      await store.put(
        'test:stale-trigger:c',
        { value: 'c' },
        {
          persist: true,
          deps: [{ depKey: 'const:stale-trigger:c:1', depVersion: '1' }],
        }
      )

      const persistedSurvivor = await persistence.load(survivorNodeKey)
      expect(persistedSurvivor?.value).toEqual({ value: 'a' })
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('keeps dependency rows aligned with pruned cache entries', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-prune-aligned-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-prune-aligned'
      )
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

  test('keeps prune behavior idempotent under concurrent writes', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-prune-concurrent-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(fileSystem, 'sqlite-prune-concurrent')
      const persistence = new SqliteCacheStorePersistence({
        dbPath,
        maxRows: 2,
        maxAgeMs: 1000 * 60 * 60,
      })
      const writerOne = new CacheStore({ snapshot, persistence })
      const writerTwo = new CacheStore({ snapshot, persistence })

      await Promise.all(
        Array.from({ length: 20 }, (_, index) => {
          const writer = index % 2 === 0 ? writerOne : writerTwo
          return writer.put(`test:prune-concurrent:${index}`, { index }, {
            persist: true,
            deps: [
              {
                depKey: `const:prune-concurrent:${index}`,
                depVersion: String(index),
              },
            ],
          })
        })
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
        const countRow = db
          .prepare(`SELECT COUNT(*) as total FROM cache_entries`)
          .get() as { total?: number }
        const orphanRows = db
          .prepare(
            `
              SELECT COUNT(*) as total
              FROM cache_deps AS dependency
              LEFT JOIN cache_entries AS entry
                ON entry.node_key = dependency.node_key
              WHERE entry.node_key IS NULL
            `
          )
          .get() as { total?: number }

        expect(Number(countRow.total ?? 0)).toBeLessThanOrEqual(2)
        expect(Number(orphanRows.total ?? 0)).toBe(0)
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

  test('deduplicates concurrent sqlite-backed compute work under sqlite lock contention', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-lock-slot-')
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
        'sqlite-compute-slot-lock'
      )
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const firstStore = new CacheStore({ snapshot, persistence })
      const secondStore = new CacheStore({ snapshot, persistence })

      let computeCount = 0
      const lockDb = new DatabaseSync(dbPath)
      lockDb.exec('BEGIN IMMEDIATE')

      try {
        const startedAt = Date.now()
        const first = firstStore.getOrCompute(
          'test:sqlite-compute-slot-lock',
          { persist: true },
          async () => {
            computeCount += 1
            await new Promise((resolve) => setTimeout(resolve, 40))
            return 'first'
          }
        )

        await new Promise((resolve) => {
          setTimeout(resolve, 30)
        })
        const second = secondStore.getOrCompute(
          'test:sqlite-compute-slot-lock',
          { persist: true },
          async () => {
            computeCount += 1
            return 'second'
          }
        )

        await new Promise((resolve) => {
          setTimeout(resolve, 120)
        })
        lockDb.exec('ROLLBACK')

        const [firstResult, secondResult] = await Promise.all([first, second])

        expect(firstResult).toBe('first')
        expect(secondResult).toBe('first')
        expect(computeCount).toBe(1)
        expect(Date.now() - startedAt).toBeGreaterThan(80)
      } finally {
        lockDb.close()
      }
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  }, 12000)

  test('monotonically increments sqlite persisted revisions for repeated node writes', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-save-revision-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const sqlitePersistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:sqlite-save-revision'
      const baseDependencies = [{ depKey: 'file:index.ts', depVersion: '1' }]

      const firstRevision = await sqlitePersistence.saveWithRevision(nodeKey, {
        value: { value: 'first' },
        deps: baseDependencies,
        fingerprint: createFingerprint(baseDependencies),
        persist: true,
        updatedAt: Date.now(),
      })

      const secondRevision = await sqlitePersistence.saveWithRevision(nodeKey, {
        value: { value: 'second' },
        deps: baseDependencies,
        fingerprint: createFingerprint(baseDependencies),
        persist: true,
        updatedAt: Date.now() + 1,
      })

      const nextDependencies = [{ depKey: 'file:index.ts', depVersion: '2' }]
      const thirdRevision = await sqlitePersistence.saveWithRevision(nodeKey, {
        value: { value: 'third' },
        deps: nextDependencies,
        fingerprint: createFingerprint(nextDependencies),
        persist: true,
        updatedAt: Date.now() + 2,
      })

      expect(firstRevision).toBe(1)
      expect(secondRevision).toBe(2)
      expect(thirdRevision).toBe(3)

      const persistedAfter = await sqlitePersistence.load(nodeKey)
      expect((persistedAfter as { revision?: number } | undefined)?.revision).toBe(
        thirdRevision
      )
      expect(persistedAfter?.value).toEqual({ value: 'third' })
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('returns applied=false when guarded sqlite writes miss revision preconditions', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-guarded-write-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const sqlitePersistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:sqlite-guarded-write'
      const baselineDeps = [{ depKey: 'const:guarded:baseline', depVersion: '1' }]
      const baselineRevision = await sqlitePersistence.saveWithRevision(nodeKey, {
        value: { value: 'baseline' },
        deps: baselineDeps,
        fingerprint: createFingerprint(baselineDeps),
        persist: true,
        updatedAt: Date.now(),
      })

      const candidateDeps = [{ depKey: 'const:guarded:candidate', depVersion: '1' }]
      const candidateEntry: CacheEntry = {
        value: { value: 'candidate' },
        deps: candidateDeps,
        fingerprint: createFingerprint(candidateDeps),
        persist: true,
        updatedAt: Date.now() + 1,
      }

      const missingPreconditionResult = await sqlitePersistence.saveWithRevisionGuarded(
        nodeKey,
        candidateEntry,
        {
          expectedRevision: 'missing',
        }
      )
      expect(missingPreconditionResult).toEqual({
        applied: false,
        revision: baselineRevision,
      })

      const staleRevisionResult = await sqlitePersistence.saveWithRevisionGuarded(
        nodeKey,
        candidateEntry,
        {
          expectedRevision: baselineRevision - 1,
        }
      )
      expect(staleRevisionResult).toEqual({
        applied: false,
        revision: baselineRevision,
      })

      const persistedAfter = await sqlitePersistence.load(nodeKey)
      expect(persistedAfter?.value).toEqual({ value: 'baseline' })
      expect((persistedAfter as { revision?: number } | undefined)?.revision).toBe(
        baselineRevision
      )
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('reconciles in-memory values to the persisted winner when guarded writes are superseded', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-guarded-reconcile-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-guarded-reconcile'
      )
      const sqlitePersistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:sqlite-guarded-reconcile'
      const baselineDeps = [
        { depKey: 'const:sqlite-guarded-reconcile:baseline', depVersion: '1' },
      ]
      const baselineRevision = await sqlitePersistence.saveWithRevision(nodeKey, {
        value: { value: 'baseline' },
        deps: baselineDeps,
        fingerprint: createFingerprint(baselineDeps),
        persist: true,
        updatedAt: Date.now(),
      })

      const winnerDeps = [
        { depKey: 'const:sqlite-guarded-reconcile:winner', depVersion: '1' },
      ]
      let injectedConcurrentWrite = false
      const persistence: CacheStorePersistence = {
        load: sqlitePersistence.load.bind(sqlitePersistence),
        delete: sqlitePersistence.delete.bind(sqlitePersistence),
        save: sqlitePersistence.save.bind(sqlitePersistence),
        saveWithRevision: sqlitePersistence.saveWithRevision.bind(sqlitePersistence),
        saveWithRevisionGuarded: async (candidateNodeKey, entry, options) => {
          if (!injectedConcurrentWrite) {
            injectedConcurrentWrite = true
            await sqlitePersistence.saveWithRevision(candidateNodeKey, {
              value: { value: 'winner' },
              deps: winnerDeps,
              fingerprint: createFingerprint(winnerDeps),
              persist: true,
              updatedAt: entry.updatedAt + 1_000,
            })
          }

          return sqlitePersistence.saveWithRevisionGuarded(
            candidateNodeKey,
            entry,
            options
          )
        },
      }

      const store = new CacheStore({ snapshot, persistence })
      await store.put(
        nodeKey,
        { value: 'local' },
        {
          persist: true,
          deps: [
            {
              depKey: 'const:sqlite-guarded-reconcile:local',
              depVersion: '1',
            },
          ],
        }
      )

      const memoryAfter = await store.get(nodeKey)
      const persistedAfter = await sqlitePersistence.load(nodeKey)

      expect((persistedAfter as { revision?: number } | undefined)?.revision).toBe(
        baselineRevision + 1
      )
      expect(persistedAfter?.value).toEqual({ value: 'winner' })
      expect(memoryAfter).toEqual({ value: 'winner' })
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('keeps a newer persisted row when verification is superseded by concurrent writes', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-save-supersede-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-save-supersede'
      )
      const sqlitePersistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:sqlite-save-supersede'
      const staleDeps = [{ depKey: 'const:sqlite-save-supersede:stale', depVersion: '1' }]
      const staleRevision = await sqlitePersistence.saveWithRevision(nodeKey, {
        value: { value: 'baseline' },
        deps: staleDeps,
        fingerprint: createFingerprint(staleDeps),
        persist: true,
        updatedAt: Date.now(),
      })

      const bumpDeps = [{ depKey: 'const:sqlite-save-supersede:bump', depVersion: '1' }]
      const bumpedRevision = await sqlitePersistence.saveWithRevision(nodeKey, {
        value: { value: 'bumped' },
        deps: bumpDeps,
        fingerprint: createFingerprint(bumpDeps),
        persist: true,
        updatedAt: Date.now() + 10,
      })

      expect(bumpedRevision).toBe(staleRevision + 1)
      expect(staleRevision).toBe(1)

      let injectConcurrentWrite = true
      const concurrentDeps = [
        { depKey: 'const:sqlite-save-supersede:concurrent', depVersion: '1' },
      ]
      let concurrentRevision: number | undefined
      let localRevision: number | undefined
      const localDeps = [{ depKey: 'const:sqlite-save-supersede:local', depVersion: '1' }]
      const racingPersistence: CacheStorePersistence = {
        load: sqlitePersistence.load.bind(sqlitePersistence),
        delete: sqlitePersistence.delete.bind(sqlitePersistence),
        saveWithRevision: async (candidateNodeKey, persistedEntry) => {
          const revision = await sqlitePersistence.saveWithRevision(
            candidateNodeKey,
            persistedEntry
          )
          localRevision = revision
          if (!injectConcurrentWrite) {
            return revision
          }

          injectConcurrentWrite = false
          concurrentRevision = await sqlitePersistence.saveWithRevision(
            candidateNodeKey,
            {
              ...persistedEntry,
              value: { value: 'concurrent' },
              deps: concurrentDeps,
              fingerprint: createFingerprint(concurrentDeps),
              updatedAt: persistedEntry.updatedAt + 1000,
            }
          )
          return revision
        },
        save: async (candidateNodeKey, persistedEntry) => {
          await sqlitePersistence.save(candidateNodeKey, persistedEntry)
        },
      }

      const store = new CacheStore({
        snapshot,
        persistence: racingPersistence,
      })

      await store.put(
        nodeKey,
        { value: 'local' },
        {
          persist: true,
          deps: localDeps,
        }
      )

      const persistedAfter = await sqlitePersistence.load(nodeKey)
      const memoryAfter = await store.get(nodeKey)

      expect((persistedAfter as { revision?: number } | undefined)?.revision).toBe(
        concurrentRevision
      )
      expect(concurrentRevision).toBeGreaterThan(staleRevision)
      expect((persistedAfter as { revision?: number } | undefined)?.revision).toBeGreaterThan(
        bumpedRevision
      )
      expect(localRevision).toBeGreaterThan(bumpedRevision)
      expect(concurrentRevision).toBeGreaterThan(localRevision)
      expect(persistedAfter?.value).toEqual({ value: 'concurrent' })
      expect(memoryAfter).toEqual({ value: 'concurrent' })
      expect(localRevision).toBe(staleRevision + 2)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('deduplicates concurrent sqlite-backed compute work when acquire returns SQLITE_BUSY code', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-slot-busy-code-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-compute-slot-busy-code'
      )
      const sqlitePersistence = new SqliteCacheStorePersistence({ dbPath })
      let shouldThrowNextAcquire = false

      const busyError = new Error('lock contention')
      ;(busyError as { code?: string }).code = 'SQLITE_BUSY'

      const persistence: SqliteComputeSlotPersistence = {
        load: sqlitePersistence.load.bind(sqlitePersistence),
        save: sqlitePersistence.save.bind(sqlitePersistence),
        delete: sqlitePersistence.delete.bind(sqlitePersistence),
        acquireComputeSlot: async (nodeKey, owner) => {
          if (shouldThrowNextAcquire) {
            shouldThrowNextAcquire = false
            throw busyError
          }

          return sqlitePersistence.acquireComputeSlot(nodeKey, owner)
        },
        getComputeSlotOwner: sqlitePersistence.getComputeSlotOwner.bind(
          sqlitePersistence
        ),
        releaseComputeSlot: sqlitePersistence.releaseComputeSlot.bind(
          sqlitePersistence
        ),
      }

      const firstStore = new CacheStore({ snapshot, persistence })
      const secondStore = new CacheStore({ snapshot, persistence })

      let computeCount = 0
      const started = createDeferredPromise()

      const first = firstStore.getOrCompute(
        'test:sqlite-compute-slot-busy-code',
        { persist: true },
        async () => {
          computeCount += 1
          started.resolve()
          await new Promise((resolve) => setTimeout(resolve, 50))
          return 'first'
        }
      )

      await started.promise
      shouldThrowNextAcquire = true

      const second = secondStore.getOrCompute(
        'test:sqlite-compute-slot-busy-code',
        { persist: true },
        async () => {
          computeCount += 1
          return 'second'
        }
      )

      const [firstResult, secondResult] = await Promise.all([first, second])

      expect(firstResult).toBe('first')
      expect(secondResult).toBe('first')
      expect(computeCount).toBe(1)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  }, 12000)

  test('deduplicates concurrent sqlite-backed compute work when acquire reports locked by message', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-slot-busy-message-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-compute-slot-busy-message'
      )
      const sqlitePersistence = new SqliteCacheStorePersistence({ dbPath })
      let shouldThrowNextAcquire = false

      const messageError = new Error('database table is locked')

      const persistence: SqliteComputeSlotPersistence = {
        load: sqlitePersistence.load.bind(sqlitePersistence),
        save: sqlitePersistence.save.bind(sqlitePersistence),
        delete: sqlitePersistence.delete.bind(sqlitePersistence),
        acquireComputeSlot: async (nodeKey, owner) => {
          if (shouldThrowNextAcquire) {
            shouldThrowNextAcquire = false
            throw messageError
          }

          return sqlitePersistence.acquireComputeSlot(nodeKey, owner)
        },
        getComputeSlotOwner: sqlitePersistence.getComputeSlotOwner.bind(
          sqlitePersistence
        ),
        releaseComputeSlot: sqlitePersistence.releaseComputeSlot.bind(
          sqlitePersistence
        ),
      }

      const firstStore = new CacheStore({ snapshot, persistence })
      const secondStore = new CacheStore({ snapshot, persistence })

      let computeCount = 0
      const started = createDeferredPromise()

      const first = firstStore.getOrCompute(
        'test:sqlite-compute-slot-busy-message',
        { persist: true },
        async () => {
          computeCount += 1
          started.resolve()
          await new Promise((resolve) => setTimeout(resolve, 50))
          return 'first'
        }
      )

      await started.promise
      shouldThrowNextAcquire = true

      const second = secondStore.getOrCompute(
        'test:sqlite-compute-slot-busy-message',
        { persist: true },
        async () => {
          computeCount += 1
          return 'second'
        }
      )

      const [firstResult, secondResult] = await Promise.all([first, second])

      expect(firstResult).toBe('first')
      expect(secondResult).toBe('first')
      expect(computeCount).toBe(1)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  }, 12000)

  test('rethrows non-transient sqlite compute-slot acquire errors', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-slot-non-transient-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-compute-slot-non-transient'
      )
      const sqlitePersistence = new SqliteCacheStorePersistence({ dbPath })

      const persistError = new Error('disk failure')
      ;(persistError as { code?: string }).code = 'ENOSPC'

      const persistence: SqliteComputeSlotPersistence = {
        load: sqlitePersistence.load.bind(sqlitePersistence),
        save: sqlitePersistence.save.bind(sqlitePersistence),
        delete: sqlitePersistence.delete.bind(sqlitePersistence),
        acquireComputeSlot: async () => {
          throw persistError
        },
        getComputeSlotOwner: sqlitePersistence.getComputeSlotOwner.bind(
          sqlitePersistence
        ),
        releaseComputeSlot: sqlitePersistence.releaseComputeSlot.bind(
          sqlitePersistence
        ),
      }

      const store = new CacheStore({ snapshot, persistence })
      let computeCount = 0

      await expect(
        store.getOrCompute(
          'test:sqlite-compute-slot-non-transient',
          { persist: true },
          async () => {
            computeCount += 1
            return 'value'
          }
        )
      ).rejects.toThrow('disk failure')

      expect(computeCount).toBe(0)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('keeps a long-running sqlite compute slot alive with heartbeat refresh', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-slot-heartbeat-')
    )
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'sqlite-compute-slot-heartbeat'
    )
    const persistence = createShortTtlComputeSlotPersistence(dbPath, {
      slotTtlMs: 60,
      withHeartbeat: true,
    })
    const firstStore = new CacheStore({ snapshot, persistence })
    const secondStore = new CacheStore({ snapshot, persistence })

    try {
      let computeCount = 0
      const first = firstStore.getOrCompute(
        'test:sqlite-compute-slot-heartbeat',
        { persist: true },
        async () => {
          computeCount += 1
          await new Promise((resolve) => setTimeout(resolve, 220))
          return 'first'
        }
      )

      await new Promise((resolve) => {
        setTimeout(resolve, 20)
      })
      const second = secondStore.getOrCompute(
        'test:sqlite-compute-slot-heartbeat',
        { persist: true },
        async () => {
          computeCount += 1
          return 'second'
        }
      )

      const [firstResult, secondResult] = await Promise.all([first, second])

      expect(firstResult).toBe('first')
      expect(secondResult).toBe('first')
      expect(computeCount).toBe(1)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  }, 12000)

  test('duplicates long-running sqlite compute work without a heartbeat refresh', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-slot-no-heartbeat-')
    )
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'sqlite-compute-slot-no-heartbeat'
    )
    const persistence = createShortTtlComputeSlotPersistence(dbPath, {
      slotTtlMs: 60,
      withHeartbeat: false,
    })
    const firstStore = new CacheStore({ snapshot, persistence })
    const secondStore = new CacheStore({ snapshot, persistence })

    try {
      let computeCount = 0
      const first = firstStore.getOrCompute(
        'test:sqlite-compute-slot-no-heartbeat',
        { persist: true },
        async () => {
          computeCount += 1
          await new Promise((resolve) => setTimeout(resolve, 220))
          return 'first'
        }
      )

      await new Promise((resolve) => {
        setTimeout(resolve, 20)
      })
      const second = secondStore.getOrCompute(
        'test:sqlite-compute-slot-no-heartbeat',
        { persist: true },
        async () => {
          computeCount += 1
          await new Promise((resolve) => setTimeout(resolve, 220))
          return 'second'
        }
      )

      const [firstResult, secondResult] = await Promise.all([first, second])

      expect(firstResult).toBe('first')
      expect(secondResult).toBe('second')
      expect(computeCount).toBe(2)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  }, 12000)

  test('reuses in-flight persisted values when the leader computes undefined', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-slot-undefined-shared-')
    )
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'sqlite-compute-slot-shared-undefined'
    )
    const persistence = createShortTtlComputeSlotPersistence(dbPath, {
      slotTtlMs: 60,
      withHeartbeat: true,
    })
    const firstStore = new CacheStore({ snapshot, persistence })
    const secondStore = new CacheStore({ snapshot, persistence })

    try {
      let computeCount = 0
      const first = firstStore.getOrCompute<string | undefined>(
        'test:sqlite-compute-slot-shared-undefined',
        { persist: true },
        async () => {
          computeCount += 1
          await new Promise((resolve) => setTimeout(resolve, 220))
          return undefined
        }
      )

      await new Promise((resolve) => {
        setTimeout(resolve, 20)
      })
      const second = secondStore.getOrCompute<string | undefined>(
        'test:sqlite-compute-slot-shared-undefined',
        { persist: true },
        async () => {
          computeCount += 1
          return 'second'
        }
      )

      const [firstResult, secondResult] = await Promise.all([first, second])

      expect(firstResult).toBeUndefined()
      expect(secondResult).toBeUndefined()
      expect(computeCount).toBe(1)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  }, 12000)

  test('escapes sqlite LIKE wildcards in cache prefix and dependency invalidation queries', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-like-escape-')
    )
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const snapshot = new FileSystemSnapshot(
      new InMemoryFileSystem({
        'src/components_button/index.ts': 'export const a = 1',
        'src/componentsXbutton/index.ts': 'export const b = 1',
      }),
      'sqlite-like-escape'
    )
    const persistence = new SqliteCacheStorePersistence({ dbPath })
    const store = new CacheStore({ snapshot, persistence })

    const affectedNodeKey = 'dir:src/components_button|abc'
    const unaffectedNodeKey = 'dir:src/componentsXbutton|xyz'

    try {
      const affectedDepVersion = await snapshot.contentId(
        'src/components_button/index.ts'
      )
      const unaffectedDepVersion = await snapshot.contentId(
        'src/componentsXbutton/index.ts'
      )

      await store.put(affectedNodeKey, { value: 'affected' }, {
        persist: true,
        deps: [
          {
            depKey: 'file:src/components_button/index.ts',
            depVersion: affectedDepVersion,
          },
        ],
      })
      await store.put(unaffectedNodeKey, { value: 'unaffected' }, {
        persist: true,
        deps: [
          {
            depKey: 'file:src/componentsXbutton/index.ts',
            depVersion: unaffectedDepVersion,
          },
        ],
      })

      const prefixMatches = await store.listNodeKeysByPrefix(
        'dir:src/components_button|'
      )
      expect(prefixMatches).toEqual([affectedNodeKey])

      const eviction = await store.deleteByDependencyPath('src/components_button')
      expect(eviction.deletedNodeKeys).toContain(affectedNodeKey)
      expect(eviction.deletedNodeKeys).not.toContain(unaffectedNodeKey)

      expect(
        await store.get<{ value: string }>(affectedNodeKey)
      ).toBeUndefined()
      expect(
        await store.get<{ value: string }>(unaffectedNodeKey)
      ).toEqual({ value: 'unaffected' })
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

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

      await expect(
        store.delete('test:persistence-failure')
      ).resolves.toBeUndefined()
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('cleanup(test:persistence-failure)')
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  test('handles verification load-no-entry races without warning', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(fileSystem, 'persistence-verification-no-entry')
    const persistedEntries = new Map<string, CacheEntry<{ value: number }>>()
    const persistence = {
      load: vi.fn(async (nodeKey) => persistedEntries.get(nodeKey)),
      save: vi.fn(async (nodeKey, entry) => {
        persistedEntries.set(nodeKey, { ...entry })
        persistedEntries.delete(nodeKey)
      }),
      delete: vi.fn(async () => undefined),
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = new CacheStore({ snapshot, persistence })
    let computeCount = 0

    try {
      const firstResult = await store.getOrCompute(
        'test:persistence-verification-no-entry',
        { persist: true },
        async (ctx) => {
          computeCount += 1
          await ctx.recordFileDep('/index.ts')
          return { value: 42 }
        }
      )

      const secondResult = await store.getOrCompute(
        'test:persistence-verification-no-entry',
        { persist: true },
        async (ctx) => {
          computeCount += 1
          await ctx.recordFileDep('/index.ts')
          return { value: 43 }
        }
      )

      expect(firstResult).toEqual({ value: 42 })
      expect(secondResult).toEqual({ value: 42 })
      expect(computeCount).toBe(1)
      expect(warnSpy).not.toHaveBeenCalled()
      expect(persistence.save).toHaveBeenCalledTimes(1)
      expect(persistence.load).toHaveBeenCalled()

      const replayed = await store.get('test:persistence-verification-no-entry')
      expect(replayed).toEqual({ value: 42 })
    } finally {
      warnSpy.mockRestore()
    }
  })

  test('falls back gracefully without saveWithRevision when fingerprint drift is expectedly superseded', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'persistence-verification-fallback-revisionless'
    )
    const persistedEntries = new Map<string, CacheEntry<{ value: number }>>()
    let forceSupersedingReplay = true
    const concurrencyDependencies = [
      { depKey: 'const:persistence-fallback:2', depVersion: '2' },
    ]
    const concurrencyFingerprint = createFingerprint([
      { depKey: 'const:persistence-fallback:2', depVersion: '2' },
    ])
    const persistence = {
      load: vi.fn(async (nodeKey) => {
        if (forceSupersedingReplay) {
          const current = persistedEntries.get(nodeKey)
          if (current?.value.value === 1) {
            return {
              ...current,
              value: { value: 2 },
              fingerprint: concurrencyFingerprint,
              updatedAt: current.updatedAt + 100,
              deps: concurrencyDependencies,
            }
          }
        }

        return persistedEntries.get(nodeKey)
      }),
      save: vi.fn(async (nodeKey, entry) => {
        persistedEntries.set(nodeKey, { ...entry })
        if (entry.value.value === 1 && forceSupersedingReplay) {
          forceSupersedingReplay = false
          const current = persistedEntries.get(nodeKey)
          if (current) {
            persistedEntries.set(nodeKey, {
              ...current,
              value: { value: 2 },
              deps: concurrencyDependencies,
              fingerprint: concurrencyFingerprint,
              updatedAt: current.updatedAt + 100,
            })
          }
        }
      }),
      delete: vi.fn(async () => undefined),
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = new CacheStore({ snapshot, persistence })
    let computeCount = 0

    try {
      const firstResult = await store.getOrCompute(
        'test:persistence-verification-fallback-revisionless',
        { persist: true },
        async (ctx) => {
          computeCount += 1
          ctx.recordDep('const:persistence-fallback:1', '1')
          return { value: 1 }
        }
      )

      const secondResult = await store.get('test:persistence-verification-fallback-revisionless')

      expect(firstResult).toEqual({ value: 1 })
      expect(secondResult).toEqual({ value: 2 })
      expect(computeCount).toBe(1)
      expect(persistedEntries.get('test:persistence-verification-fallback-revisionless')?.value).toEqual({
        value: 2,
      })
      expect(persistedEntries.get('test:persistence-verification-fallback-revisionless')).toMatchObject({
        value: { value: 2 },
        deps: [
          {
            depKey: 'const:persistence-fallback:2',
            depVersion: '2',
          },
        ],
        fingerprint: concurrencyFingerprint,
        persist: true,
      })
      expect(warnSpy).not.toHaveBeenCalled()
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
      await store.put(
        'test:persistence-false-delete',
        { value: 1 },
        {
          persist: true,
        }
      )
      await store.put(
        'test:persistence-false-delete',
        { value: 2 },
        {
          persist: false,
        }
      )

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
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'persistence-read-failure'
    )
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
