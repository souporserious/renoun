import {
  readFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
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
import { serialize } from 'node:v8'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { getRootDirectory } from '../utils/get-root-directory.ts'
import { normalizePathKey } from '../utils/path.ts'
import { getDebugLogger } from '../utils/debug.ts'
import { setGlobalTelemetry, type Telemetry } from '../utils/telemetry.ts'
import { captureProcessEnv, restoreProcessEnv } from '../utils/test.ts'

import {
  Cache,
  CacheStore,
  type CacheEntry,
  type CacheStorePersistence,
  createMemoryOnlyCacheStore,
  createFingerprint,
} from './Cache.ts'
import { DirectorySnapshot } from './directory-snapshot.ts'
import type { PersistedDirectorySnapshotV1 } from './directory-snapshot.ts'
import {
  SqliteCacheStorePersistence,
  disposeCacheStorePersistence,
  disposeDefaultCacheStorePersistence,
  getCacheStorePersistence,
  getDefaultCacheDatabasePath,
  runSqliteCacheMaintenance,
} from './CacheSqlite.ts'
import { InMemoryFileSystem } from './InMemoryFileSystem.ts'
import { NodeFileSystem } from './NodeFileSystem.ts'
import type {
  JavaScriptFileReferenceBaseData,
  JavaScriptFileResolvedTypesData,
} from './reference-artifacts.ts'
import { Session } from './Session.ts'
import { FileSystemSnapshot, type Snapshot } from './Snapshot.ts'
import {
  Collection,
  Directory,
  File,
  Package,
  Workspace,
} from './index.tsx'
import { FS_ANALYSIS_CACHE_VERSION, createCacheNodeKey } from './cache-key.ts'
import type {
  ExportHistoryGenerator,
  ExportHistoryOptions,
  ExportHistoryReport,
  FileStructure,
  GitExportMetadata,
  GitMetadata,
  GitModuleMetadata,
} from './types.ts'
import type { ResolvedTypeAtLocationResult } from '../utils/resolve-type-at-location.ts'

type SqliteComputeSlotPersistence = CacheStorePersistence & {
  computeSlotTtlMs?: number
  acquireComputeSlot(
    nodeKey: string,
    owner: string,
    ttlMs?: number
  ): Promise<boolean>
  refreshComputeSlot?(
    nodeKey: string,
    owner: string,
    ttlMs: number
  ): Promise<boolean>
  releaseComputeSlot(nodeKey: string, owner: string): Promise<void>
  getComputeSlotOwner(nodeKey: string): Promise<string | undefined>
}

const originalEnvironment = captureProcessEnv(['CI'])

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

  constructor(cwd: string, tsConfigPath?: string, outputDirectory?: string) {
    super({ tsConfigPath, outputDirectory })
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

class CombinedMetadataFileSystem extends InMemoryFileSystem {
  #metadataCallCount = 0

  getMetadataCallCount(): number {
    return this.#metadataCallCount
  }

  async getFileDependencyMetadata(path: string): Promise<
    | {
        lastModifiedMs?: number
        byteLength?: number
      }
    | undefined
  > {
    this.#metadataCallCount += 1
    const source = await this.readFile(path)
    return {
      lastModifiedMs: 1_000,
      byteLength: source.length,
    }
  }

  override async getFileLastModifiedMs(
    _path: string
  ): Promise<number | undefined> {
    throw new Error('fallback-last-modified-lookup-should-not-run')
  }

  override async getFileByteLength(_path: string): Promise<number | undefined> {
    throw new Error('fallback-byte-length-lookup-should-not-run')
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
    const changedPathsByToken =
      this.#changedPathsByToken.get(normalizedRootPath) ??
      new Map<string, readonly string[] | null>()
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

class HeadAwareMetadataNodeFileSystem extends NestedCwdNodeFileSystem {
  #workspaceChangeToken: string
  readonly #changedPathsByToken = new Map<
    string,
    Map<string, readonly string[] | null>
  >()

  fileMetadata: GitMetadata = {
    authors: [
      {
        name: 'Ada',
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

  constructor(cwd: string, tsConfigPath: string, token: string) {
    super(cwd, tsConfigPath)
    this.#workspaceChangeToken = token
  }

  setWorkspaceChangeToken(token: string): void {
    this.#workspaceChangeToken = token
  }

  override async getWorkspaceChangeToken(_rootPath: string): Promise<string> {
    return this.#workspaceChangeToken
  }

  setChangedPathsSinceToken(
    rootPath: string,
    previousToken: string,
    changedPaths: readonly string[] | null
  ): void {
    const normalizedRootPath = normalizePathKey(rootPath)
    const changedPathsByToken =
      this.#changedPathsByToken.get(normalizedRootPath) ??
      new Map<string, readonly string[] | null>()
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

class HeadAwareModuleMetadataNodeFileSystem extends HeadAwareMetadataNodeFileSystem {
  moduleMetadataCalls = 0
  moduleExportMetadata: Record<string, GitExportMetadata> = {
    alpha: {
      firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
      lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
      firstCommitHash: 'a1',
      lastCommitHash: 'b2',
    },
    beta: {
      firstCommitDate: new Date('2024-01-02T00:00:00.000Z'),
      lastCommitDate: new Date('2024-02-02T00:00:00.000Z'),
      firstCommitHash: 'a2',
      lastCommitHash: 'b3',
    },
  }

  async getModuleMetadata(path: string): Promise<GitModuleMetadata> {
    this.moduleMetadataCalls += 1

    return {
      kind: 'module',
      path: normalizePathKey(path),
      ref: 'head',
      refCommit: 'head',
      firstCommitDate: this.fileMetadata.firstCommitDate?.toISOString(),
      lastCommitDate: this.fileMetadata.lastCommitDate?.toISOString(),
      authors: this.fileMetadata.authors,
      exports: this.moduleExportMetadata,
    }
  }
}

class HeadAwareExportHistoryNodeFileSystem extends HeadAwareModuleMetadataNodeFileSystem {
  exportHistoryCalls = 0
  exportHistoryReport: ExportHistoryReport = {
    generatedAt: '2024-02-01T00:00:00.000Z',
    repo: '/repo',
    entryFiles: ['index.ts'],
    exports: Object.create(null),
    nameToId: Object.create(null),
  }

  override async getModuleMetadata(path: string): Promise<GitModuleMetadata> {
    this.moduleMetadataCalls += 1

    return {
      kind: 'module',
      path: normalizePathKey(path),
      ref: 'head',
      refCommit: 'head',
      firstCommitDate: this.fileMetadata.firstCommitDate?.toISOString(),
      lastCommitDate: this.fileMetadata.lastCommitDate?.toISOString(),
      authors: this.fileMetadata.authors,
      exports: {},
    }
  }

  async *getExportHistory(
    _options: ExportHistoryOptions = {}
  ): ExportHistoryGenerator {
    this.exportHistoryCalls += 1
    return this.exportHistoryReport
  }
}

function createSyntheticExportHistoryReport(
  entryFile: string,
  exportNames: string[]
): ExportHistoryReport {
  const exports: ExportHistoryReport['exports'] = Object.create(null)
  const nameToId: ExportHistoryReport['nameToId'] = Object.create(null)

  for (const [index, name] of exportNames.entries()) {
    const timestamp = Date.UTC(2024, 0, index + 1)
    const id = `${entryFile}::${name}`

    nameToId[name] = [id]
    exports[id] = [
      {
        kind: 'Added',
        sha: `sha-${index}`,
        unix: timestamp / 1000,
        date: new Date(timestamp).toISOString(),
        name,
        filePath: entryFile,
        id,
      },
    ]
  }

  return {
    generatedAt: '2024-02-01T00:00:00.000Z',
    repo: '/repo',
    entryFiles: [entryFile],
    exports,
    nameToId,
  }
}

class ThrowingByteLengthNodeFileSystem extends NestedCwdNodeFileSystem {
  override getFileByteLengthSync(_path: string): number | undefined {
    throw new Error('byte-length-lookup-should-not-run')
  }
}

class NonDeterministicNodeFileSystem extends NestedCwdNodeFileSystem {
  isPersistentCacheDeterministic(): boolean {
    return false
  }
}

function createDeferredPromise<Value = void>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void
  const promise = new Promise<Value>((resolvePromise) => {
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
    getComputeSlotOwner:
      sqlitePersistence.getComputeSlotOwner.bind(sqlitePersistence),
    releaseComputeSlot:
      sqlitePersistence.releaseComputeSlot.bind(sqlitePersistence),
  }

  if (options.withHeartbeat) {
    persistence.refreshComputeSlot = (nodeKey, owner) =>
      sqlitePersistence.refreshComputeSlot(nodeKey, owner, slotTtlMs)
  }

  return persistence
}

function createTempNodeFileSystem(tmpDirectory: string) {
  const tsConfigPath = join(tmpDirectory, 'tsconfig.json')
  if (!existsSync(tsConfigPath)) {
    writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')
  }
  const fileSystem = new NestedCwdNodeFileSystem(
    getRootDirectory(),
    tsConfigPath,
    join(tmpDirectory, '.renoun', 'cache')
  )
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

function waitForMilliseconds(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForFirstSectionTitle(
  file: {
    getSections: () => Promise<Array<{ title?: string }>>
  },
  expectedTitle: string,
  timeoutMs = 3_000
): Promise<Array<{ title?: string }>> {
  const deadline = Date.now() + timeoutMs
  let sections = await file.getSections()

  while (sections[0]?.title !== expectedTitle && Date.now() < deadline) {
    await waitForMilliseconds(25)
    sections = await file.getSections()
  }

  return sections
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

function addLegacyDirectoryMtimeDeps(
  snapshot: PersistedDirectorySnapshotV1
): PersistedDirectorySnapshotV1 {
  const dependencyEntries = new Map(snapshot.dependencySignatures)

  for (const [dependencyKey, dependencyVersion] of snapshot.dependencySignatures) {
    if (dependencyKey.startsWith('dir:')) {
      dependencyEntries.set(
        `dir-mtime:${dependencyKey.slice('dir:'.length)}`,
        dependencyVersion
      )
    }
  }

  return {
    ...snapshot,
    dependencySignatures: Array.from(dependencyEntries.entries()).sort(
      (first, second) => first[0].localeCompare(second[0])
    ),
    entries: snapshot.entries.map((entry) =>
      entry.kind === 'directory'
        ? {
            ...entry,
            snapshot: addLegacyDirectoryMtimeDeps(entry.snapshot),
          }
        : entry
    ),
  }
}

function hasLegacyDirectoryMtimeDeps(
  snapshot: PersistedDirectorySnapshotV1
): boolean {
  if (
    snapshot.dependencySignatures.some(([dependencyKey]) =>
      dependencyKey.startsWith('dir-mtime:')
    )
  ) {
    return true
  }

  return snapshot.entries.some(
    (entry) =>
      entry.kind === 'directory' && hasLegacyDirectoryMtimeDeps(entry.snapshot)
  )
}

afterEach(() => {
  setGlobalTelemetry(undefined)
  restoreProcessEnv(originalEnvironment)
})

beforeEach(() => {
  delete process.env['CI']
})

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

  test('keeps persisted parent entries fresh when node dependency fingerprint matches', async () => {
    const childNodeKey = 'child'
    const childDeps: Array<{ depKey: string; depVersion: string }> = []
    const childEntry: CacheEntry<{ node: 'child' }> = {
      value: { node: 'child' },
      deps: childDeps,
      fingerprint: createFingerprint(childDeps),
      persist: true,
      updatedAt: Date.now(),
    }
    const parentDeps = [
      {
        depKey: `node:${childNodeKey}`,
        depVersion: childEntry.fingerprint,
      },
    ]
    const parentEntry: CacheEntry<{ node: 'parent' }> = {
      value: { node: 'parent' },
      deps: parentDeps,
      fingerprint: createFingerprint(parentDeps),
      persist: true,
      updatedAt: Date.now(),
    }
    const persistedEntries = new Map<string, CacheEntry>([
      [childNodeKey, childEntry],
      ['parent', parentEntry],
    ])
    const persistence: CacheStorePersistence = {
      async load(nodeKey) {
        return persistedEntries.get(nodeKey)
      },
      async save(nodeKey, entry) {
        persistedEntries.set(nodeKey, entry)
      },
      async delete(nodeKey) {
        persistedEntries.delete(nodeKey)
      },
    }
    const store = new CacheStore({
      snapshot: new FileSystemSnapshot(new InMemoryFileSystem({})),
      persistence,
    })

    const result = await store.getWithFreshness<{ node: 'parent' }>('parent')

    expect(result.value).toEqual({ node: 'parent' })
    expect(result.fresh).toBe(true)
  })

  test('keeps restored child entries fresh after a parent hydrates matching node dependencies', async () => {
    const childSourceNodeKey = 'child:source'
    const childSourceDeps: Array<{ depKey: string; depVersion: string }> = []
    const childSourceEntry: CacheEntry<{ node: 'child:source' }> = {
      value: { node: 'child:source' },
      deps: childSourceDeps,
      fingerprint: createFingerprint(childSourceDeps),
      persist: true,
      updatedAt: Date.now(),
    }
    const childNodeKey = 'child'
    const childDeps = [
      {
        depKey: `node:${childSourceNodeKey}`,
        depVersion: childSourceEntry.fingerprint,
      },
    ]
    const childEntry: CacheEntry<{ node: 'child' }> = {
      value: { node: 'child' },
      deps: childDeps,
      fingerprint: createFingerprint(childDeps),
      persist: true,
      updatedAt: Date.now(),
    }
    const parentDeps = [
      {
        depKey: `node:${childNodeKey}`,
        depVersion: childEntry.fingerprint,
      },
    ]
    const parentEntry: CacheEntry<{ node: 'parent' }> = {
      value: { node: 'parent' },
      deps: parentDeps,
      fingerprint: createFingerprint(parentDeps),
      persist: true,
      updatedAt: Date.now(),
    }
    const persistedEntries = new Map<string, CacheEntry>([
      [childSourceNodeKey, childSourceEntry],
      [childNodeKey, childEntry],
      ['parent', parentEntry],
    ])
    const persistence: CacheStorePersistence = {
      async load(nodeKey) {
        return persistedEntries.get(nodeKey)
      },
      async save(nodeKey, entry) {
        persistedEntries.set(nodeKey, entry)
      },
      async delete(nodeKey) {
        persistedEntries.delete(nodeKey)
      },
    }
    const store = new CacheStore({
      snapshot: new FileSystemSnapshot(new InMemoryFileSystem({})),
      persistence,
    })

    const parent = await store.getWithFreshness<{ node: 'parent' }>('parent')
    const child = await store.getWithFreshness<{ node: 'child' }>('child')

    expect(parent.value).toEqual({ node: 'parent' })
    expect(parent.fresh).toBe(true)
    expect(child.value).toEqual({ node: 'child' })
    expect(child.fresh).toBe(true)
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

  test('recomputes function-based filters even when function references are the same', async () => {
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

    expect(readDirectorySpy.mock.calls.length).toBeGreaterThan(callsAfterFirst)
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

  test('rebuilds against the new session when reset happens during a snapshot build', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    try {
      const fileSystem = new MutableTimestampFileSystem({
        'index.ts': 'export const value = 1',
      })
      fileSystem.setLastModified('index.ts', 1)
      const originalReadDirectory = fileSystem.readDirectory.bind(fileSystem)
      const readDirectorySpy = vi.spyOn(fileSystem, 'readDirectory')
      const directory = new Directory({ fileSystem })

      await directory.getEntries({
        includeIndexAndReadmeFiles: true,
      })

      const blockRebuild = createDeferredPromise()
      const continueRebuild = createDeferredPromise()
      let shouldBlockRebuild = false

      readDirectorySpy.mockImplementation(async (path) => {
        const result = await originalReadDirectory(path)

        if (shouldBlockRebuild) {
          shouldBlockRebuild = false
          blockRebuild.resolve()
          await continueRebuild.promise
        }

        return result
      })

      fileSystem.setLastModified('index.ts', 2)
      shouldBlockRebuild = true

      const staleReload = directory.getEntries({
        includeIndexAndReadmeFiles: true,
      })

      await blockRebuild.promise
      await fileSystem.writeFile(
        'after-reset.ts',
        'export const afterReset = 1'
      )
      Session.reset(fileSystem)
      const freshSession = Session.for(fileSystem)

      continueRebuild.resolve()
      const refreshedEntries = await staleReload

      expect(freshSession.directorySnapshots.size).toBe(1)
      expect(
        refreshedEntries.map((entry) => entry.workspacePath).sort()
      ).toEqual(['after-reset.ts', 'index.ts'])
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
      const guidesSnapshotKey = Array.from(
        session.directorySnapshots.keys()
      ).find((key) => key.startsWith(`dir:${normalizePathKey('guides')}|`))
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
      const rebuildGuidesCalls =
        readDirectorySpy.mock.calls.slice(callsBeforeRebuild)
      const rebuildGuidePaths = rebuildGuidesCalls.map(([path]) => String(path))

      expect(
        rebuildGuidePaths.some((path) => isGuidesDirectoryPath(path))
      ).toBe(true)
      expect(rebuildGuidePaths.every((path) => !isApiDirectoryPath(path))).toBe(
        true
      )
      expect(session.directorySnapshots.has(guidesSnapshotKey!)).toBe(true)

      session.invalidatePath('guides/guide.ts')
      expect(session.directorySnapshots.has(guidesSnapshotKey!)).toBe(false)

      const callsBeforeApiGet = readDirectorySpy.mock.calls.length
      await apiDirectory.getEntries({
        includeIndexAndReadmeFiles: true,
      })
      expect(readDirectorySpy.mock.calls.slice(callsBeforeApiGet).length).toBe(
        0
      )

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
  }, 45_000)

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

  test('does not record dependencies for gitignored files excluded from snapshots', async () => {
    const fileSystem = new InMemoryFileSystem({
      'visible.ts': 'export const visible = true',
      'ignored.ts': 'export const ignored = true',
    })
    const gitIgnoreSpy = vi
      .spyOn(fileSystem, 'isFilePathGitIgnored')
      .mockImplementation((filePath) => filePath.endsWith('ignored.ts'))

    try {
      const directory = new Directory({ fileSystem })
      const entries = await directory.getEntries({
        recursive: true,
        includeGitIgnoredFiles: false,
        includeIndexAndReadmeFiles: true,
      })

      expect(
        entries.some((entry) => entry.workspacePath.endsWith('ignored.ts'))
      ).toBe(false)

      const session = directory.getSession()
      const snapshotKey = Array.from(session.directorySnapshots.keys()).find(
        (key) => key.startsWith('dir:.|')
      )
      expect(snapshotKey).toBeDefined()

      const snapshot = snapshotKey
        ? session.directorySnapshots.get(snapshotKey)
        : undefined
      const dependencyKeys = snapshot?.getDependencies()
        ? Array.from(snapshot.getDependencies()!.keys())
        : []

      expect(
        dependencyKeys.some(
          (key) => key.startsWith('file:') && key.endsWith('visible.ts')
        )
      ).toBe(true)
      expect(
        dependencyKeys.some(
          (key) => key.startsWith('file:') && key.endsWith('ignored.ts')
        )
      ).toBe(false)
    } finally {
      gitIgnoreSpy.mockRestore()
    }
  })

  test('revalidates snapshots when workspace .gitignore dependency signatures change', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const fileSystem = new MutableTimestampFileSystem({
      '.gitignore': '# initial',
      'docs/visible.ts': 'export const visible = true',
      'docs/ignored.ts': 'export const ignored = true',
    })
    fileSystem.setLastModified('.gitignore', 1)
    let shouldIgnoreIgnoredFile = false
    const gitIgnoreSpy = vi
      .spyOn(fileSystem, 'isFilePathGitIgnored')
      .mockImplementation((filePath) => {
        const normalizedPath = normalizePathKey(filePath)
        if (normalizedPath.endsWith('docs/ignored.ts')) {
          return shouldIgnoreIgnoredFile
        }

        return false
      })

    try {
      const directory = new Directory({
        fileSystem,
        path: 'docs',
      })
      const firstEntries = await directory.getEntries({
        includeIndexAndReadmeFiles: true,
      })
      expect(
        firstEntries.some((entry) => entry.workspacePath.endsWith('ignored.ts'))
      ).toBe(true)

      const session = directory.getSession()
      const snapshotKey = Array.from(session.directorySnapshots.keys()).find(
        (key) => key.startsWith(`dir:${normalizePathKey('docs')}|`)
      )
      expect(snapshotKey).toBeDefined()

      const firstSnapshot = snapshotKey
        ? session.directorySnapshots.get(snapshotKey)
        : undefined
      const firstDependencyKeys = firstSnapshot?.getDependencies()
        ? Array.from(firstSnapshot.getDependencies()!.keys())
        : []
      expect(
        firstDependencyKeys.some(
          (dependencyKey) =>
            dependencyKey.startsWith('file:') &&
            dependencyKey.endsWith('.gitignore')
        )
      ).toBe(true)

      shouldIgnoreIgnoredFile = true
      fileSystem.setLastModified('.gitignore', 2)

      const secondEntries = await directory.getEntries({
        includeIndexAndReadmeFiles: true,
      })
      expect(
        secondEntries.some((entry) =>
          entry.workspacePath.endsWith('ignored.ts')
        )
      ).toBe(false)
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = previousNodeEnv
      }

      gitIgnoreSpy.mockRestore()
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
    const fileStructureOptions = {
      includeGitDates: 'last' as const,
      includeAuthors: true,
    }
    const exportStructureOptions = {
      includeGitDates: 'last' as const,
    }

    const firstFileStructure = await file.getStructure(fileStructureOptions)
    const firstExportStructure = await valueExport.getStructure(
      exportStructureOptions
    )

    fileSystem.fileMetadata = {
      authors: [
        {
          name: 'Ada',
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

    const secondFileStructure = await file.getStructure(fileStructureOptions)
    const secondExportStructure = await valueExport.getStructure(
      exportStructureOptions
    )

    expect(firstFileStructure.firstCommitDate).toBeUndefined()
    expect(firstFileStructure.lastCommitDate?.toISOString()).toBe(
      '2024-01-01T00:00:00.000Z'
    )
    expect(secondFileStructure.firstCommitDate).toBeUndefined()
    expect(secondFileStructure.lastCommitDate?.toISOString()).toBe(
      '2024-02-01T00:00:00.000Z'
    )
    expect(firstFileStructure.authors?.[0]?.commitCount).toBe(1)
    expect(secondFileStructure.authors?.[0]?.commitCount).toBe(2)
    expect(firstExportStructure.firstCommitDate).toBeUndefined()
    expect(firstExportStructure.lastCommitDate?.toISOString()).toBe(
      '2024-01-01T00:00:00.000Z'
    )
    expect(secondExportStructure.firstCommitDate).toBeUndefined()
    expect(secondExportStructure.lastCommitDate?.toISOString()).toBe(
      '2024-02-01T00:00:00.000Z'
    )
  })

  test('does not block getExports behind an in-flight reference-data compute', async () => {
    class SlowGitMetadataInMemoryFileSystem extends InMemoryFileSystem {
      readonly gitMetadataStarted = createDeferredPromise<void>()
      readonly releaseGitMetadata = createDeferredPromise<void>()

      async getGitFileMetadata(_path: string): Promise<GitMetadata> {
        this.gitMetadataStarted.resolve()
        await this.releaseGitMetadata.promise

        return {
          authors: [],
          firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
          lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
        }
      }

      async getGitExportMetadata(
        _path: string,
        _startLine: number,
        _endLine: number
      ): Promise<GitExportMetadata> {
        return {
          firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
          lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
          firstCommitHash: 'a1',
          lastCommitHash: 'b2',
        }
      }
    }

    const fileSystem = new SlowGitMetadataInMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('index', 'ts')
    const referenceDataPromise = file.getCachedReferenceData()

    await fileSystem.gitMetadataStarted.promise

    const timedOut = Symbol('timedOut')
    const exportsResult = await Promise.race([
      file.getExports(),
      waitForMilliseconds(50).then(() => timedOut),
    ])

    expect(exportsResult).not.toBe(timedOut)
    expect(Array.isArray(exportsResult)).toBe(true)
    expect((exportsResult as unknown[]).length).toBe(1)

    fileSystem.releaseGitMetadata.resolve()
    await referenceDataPromise
  })

  test('routes reference-heavy entry methods through server-managed artifacts when supported', async () => {
    class ServerManagedArtifactInMemoryFileSystem extends InMemoryFileSystem {
      freshReferenceBaseReads = 0
      cachedReferenceBaseReads = 0
      cachedReferenceResolvedTypesReads = 0
      cachedReferenceSectionsReads = 0
      readonly referenceBaseData: JavaScriptFileReferenceBaseData = {
        exportMetadata: [
          {
            name: 'publicValue',
            path: '/index.ts',
            position: 0,
            kind: 0 as any,
          },
        ],
        gitMetadataByName: {
          publicValue: {
            firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
            lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
            firstCommitHash: 'a1',
            lastCommitHash: 'b1',
          },
        },
        fileGitMetadata: {
          authors: [],
          firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
          lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
        },
      }

      override supportsServerManagedReferenceArtifacts(): boolean {
        return true
      }

      override async readFreshReferenceBaseArtifact(
        _filePath: string,
        _stripInternal: boolean
      ): Promise<JavaScriptFileReferenceBaseData | undefined> {
        this.freshReferenceBaseReads += 1
        return this.referenceBaseData
      }

      override async getCachedReferenceBaseArtifact(
        _filePath: string,
        _stripInternal: boolean
      ): Promise<JavaScriptFileReferenceBaseData> {
        this.cachedReferenceBaseReads += 1
        return this.referenceBaseData
      }

      override async getCachedReferenceResolvedTypesArtifact(
        _filePath: string
      ): Promise<JavaScriptFileResolvedTypesData> {
        this.cachedReferenceResolvedTypesReads += 1
        return {
          resolvedTypes: [{ kind: 'object', name: 'publicValue' } as any],
          typeDependencies: ['/index.ts'],
        }
      }

      override async getCachedReferenceSectionsArtifact(
        _filePath: string,
        _options: { stripInternal: boolean; slugCasing: any }
      ): Promise<Array<{ id: string; title: string }>> {
        this.cachedReferenceSectionsReads += 1
        return [{ id: 'publicValue', title: 'publicValue' }]
      }
    }

    const fileSystem = new ServerManagedArtifactInMemoryFileSystem({
      'index.ts': [
        '/** @internal */ export const internalValue = 1',
        'export const publicValue = 2',
      ].join('\n'),
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('index', 'ts')

    const exports = await file.getExports()
    const lastCommitDate = await file.getLastCommitDate()
    const exportTypes = await file.getExportTypes()
    const sections = await file.getSections()

    expect(exports.map((entry) => entry.name)).toEqual(['publicValue'])
    expect(lastCommitDate?.toISOString()).toBe('2024-02-01T00:00:00.000Z')
    expect(exportTypes).toHaveLength(1)
    expect(sections).toEqual([{ id: 'publicValue', title: 'publicValue' }])
    expect(fileSystem.freshReferenceBaseReads).toBe(1)
    expect(fileSystem.cachedReferenceBaseReads).toBe(0)
    expect(fileSystem.cachedReferenceResolvedTypesReads).toBe(1)
    expect(fileSystem.cachedReferenceSectionsReads).toBe(1)
  })

  test('omits authors by default and supports first-date-only structures', async () => {
    class MetadataAwareInMemoryFileSystem extends InMemoryFileSystem {
      fileMetadata: GitMetadata = {
        authors: [
          {
            name: 'Ada',
            commitCount: 2,
            firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
            lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
          },
        ],
        firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
        lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
      }
      exportMetadata: GitExportMetadata = {
        firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
        lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
        firstCommitHash: 'a1',
        lastCommitHash: 'b2',
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

    const fileStructure = await file.getStructure({
      includeGitDates: 'first',
    })
    const fileStructureWithAuthors = await file.getStructure({
      includeGitDates: 'first',
      includeAuthors: true,
    })
    const exportStructure = await valueExport.getStructure({
      includeGitDates: 'first',
    })

    expect(fileStructure.firstCommitDate?.toISOString()).toBe(
      '2024-01-01T00:00:00.000Z'
    )
    expect(fileStructure.lastCommitDate).toBeUndefined()
    expect(fileStructure.authors).toBeUndefined()
    expect(fileStructureWithAuthors.authors?.[0]?.commitCount).toBe(2)
    expect(exportStructure.firstCommitDate?.toISOString()).toBe(
      '2024-01-01T00:00:00.000Z'
    )
    expect(exportStructure.lastCommitDate).toBeUndefined()
  })

  test('recomputes file and export git metadata after session reset when workspace token is unchanged', async () => {
    class MetadataAwareInMemoryFileSystem extends InMemoryFileSystem {
      fileMetadata: GitMetadata = {
        authors: [
          {
            name: 'Ada',
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

      override async getWorkspaceChangeToken(
        rootPath: string
      ): Promise<string> {
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

    expect(firstFileCommitDate?.toISOString()).toBe('2024-01-01T00:00:00.000Z')
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

    expect(secondFileCommitDate?.toISOString()).toBe('2024-02-01T00:00:00.000Z')
    expect(secondExportCommitDate?.toISOString()).toBe(
      '2024-02-01T00:00:00.000Z'
    )
    expect(secondWorkspaceCommitDate?.toISOString()).toBe(
      '2024-02-01T00:00:00.000Z'
    )
    expect(fileSystem.fileMetadataCalls).toBeGreaterThan(priorFileMetadataCalls)
    expect(fileSystem.exportMetadataCalls).toBeGreaterThan(
      priorExportMetadataCalls
    )
  })

  test('uses module-level git metadata for header-only JavaScript structures', async () => {
    const tempDirectory = createTmpRenounCacheDirectory(
      'renoun-cache-module-structure-'
    )
    const scopedCwd = join(tempDirectory, 'scoped-cwd')
    const tsConfigPath = join(tempDirectory, 'tsconfig.json')
    const fileSystem = new HeadAwareModuleMetadataNodeFileSystem(
      scopedCwd,
      tsConfigPath,
      'head:a'
    )

    mkdirSync(scopedCwd, { recursive: true })
    writeFileSync(
      join(scopedCwd, 'index.ts'),
      ['export const alpha = 1', 'export const beta = 2'].join('\n'),
      'utf8'
    )
    writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

    try {
      const directory = new Directory({ fileSystem })
      const file = await directory.getFile('index', 'ts')

      const structure = await file.getStructure({
        includeExports: 'headers',
        includeSections: false,
        includeResolvedTypes: false,
        includeGitDates: true,
      })

      expect(fileSystem.moduleMetadataCalls).toBe(1)
      expect(fileSystem.exportMetadataCalls).toBe(0)
      expect(
        structure.exports?.map((entry) => [
          entry.name,
          entry.lastCommitDate?.toISOString(),
        ])
      ).toEqual([
        ['alpha', '2024-02-01T00:00:00.000Z'],
        ['beta', '2024-02-02T00:00:00.000Z'],
      ])
    } finally {
      Session.reset(fileSystem)
      rmSync(tempDirectory, { recursive: true, force: true })
    }
  })

  test('reuses module-level git metadata for JavaScript export commit dates', async () => {
    const tempDirectory = createTmpRenounCacheDirectory(
      'renoun-cache-module-export-dates-'
    )
    const scopedCwd = join(tempDirectory, 'scoped-cwd')
    const tsConfigPath = join(tempDirectory, 'tsconfig.json')
    const fileSystem = new HeadAwareModuleMetadataNodeFileSystem(
      scopedCwd,
      tsConfigPath,
      'head:a'
    )

    mkdirSync(scopedCwd, { recursive: true })
    writeFileSync(
      join(scopedCwd, 'index.ts'),
      ['export const alpha = 1', 'export const beta = 2'].join('\n'),
      'utf8'
    )
    writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

    try {
      const directory = new Directory({ fileSystem })
      const file = await directory.getFile('index', 'ts')
      const [alpha, beta] = await Promise.all([
        file.getExport('alpha'),
        file.getExport('beta'),
      ])

      const [alphaCommitDate, betaCommitDate] = await Promise.all([
        alpha.getFirstCommitDate(),
        beta.getFirstCommitDate(),
      ])

      expect(fileSystem.moduleMetadataCalls).toBe(1)
      expect(fileSystem.exportMetadataCalls).toBe(0)
      expect(alphaCommitDate?.toISOString()).toBe('2024-01-01T00:00:00.000Z')
      expect(betaCommitDate?.toISOString()).toBe('2024-01-02T00:00:00.000Z')
    } finally {
      Session.reset(fileSystem)
      rmSync(tempDirectory, { recursive: true, force: true })
    }
  })

  test('reuses one file-level export history scan for repeated barrel export commit dates', async () => {
    const tempDirectory = createTmpRenounCacheDirectory(
      'renoun-cache-export-history-dates-'
    )
    const scopedCwd = join(tempDirectory, 'scoped-cwd')
    const tsConfigPath = join(tempDirectory, 'tsconfig.json')
    const fileSystem = new HeadAwareExportHistoryNodeFileSystem(
      scopedCwd,
      tsConfigPath,
      'head:a'
    )
    const exportNames = Array.from({ length: 48 }, (_, index) => `value${index}`)

    mkdirSync(scopedCwd, { recursive: true })
    writeFileSync(
      join(scopedCwd, 'index.ts'),
      exportNames
        .map((name) => `export * from './exports/${name}.ts'`)
        .join('\n'),
      'utf8'
    )

    for (const [index, name] of exportNames.entries()) {
      const exportFilePath = join(scopedCwd, 'exports', `${name}.ts`)
      mkdirSync(dirname(exportFilePath), { recursive: true })
      writeFileSync(
        exportFilePath,
        `export const ${name} = ${index}`,
        'utf8'
      )
    }

    fileSystem.exportHistoryReport = createSyntheticExportHistoryReport(
      'index.ts',
      exportNames
    )
    writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

    try {
      const directory = new Directory({ fileSystem })
      const file = await directory.getFile('index', 'ts')
      const exports = await file.getExports()
      const firstCommitDates = await Promise.all(
        exports.map((entry) => entry.getFirstCommitDate())
      )
      const secondCommitDates = await Promise.all(
        exports.map((entry) => entry.getFirstCommitDate())
      )
      const firstCommitDateByName = new Map(
        exports.map((entry, index) => [
          entry.name,
          firstCommitDates[index]?.toISOString(),
        ])
      )

      expect(exports).toHaveLength(exportNames.length)
      expect(fileSystem.moduleMetadataCalls).toBe(1)
      expect(fileSystem.exportHistoryCalls).toBe(1)
      expect(fileSystem.exportMetadataCalls).toBe(0)
      expect(firstCommitDates.every((date) => date instanceof Date)).toBe(true)
      expect(secondCommitDates.every((date) => date instanceof Date)).toBe(true)
      expect(firstCommitDateByName.get('value0')).toBe(
        '2024-01-01T00:00:00.000Z'
      )
      expect(firstCommitDateByName.get('value47')).toBe(
        '2024-02-17T00:00:00.000Z'
      )
    } finally {
      Session.reset(fileSystem)
      rmSync(tempDirectory, { recursive: true, force: true })
    }
  })

  test('reuses persisted barrel export git dates after a full session reset', async () => {
    const tempDirectory = createTmpRenounCacheDirectory(
      'renoun-cache-export-history-reset-'
    )
    const scopedCwd = join(tempDirectory, 'scoped-cwd')
    const tsConfigPath = join(tempDirectory, 'tsconfig.json')
    const fileSystem = new HeadAwareExportHistoryNodeFileSystem(
      scopedCwd,
      tsConfigPath,
      'head:a'
    )
    const exportNames = Array.from({ length: 24 }, (_, index) => `value${index}`)

    mkdirSync(scopedCwd, { recursive: true })
    writeFileSync(
      join(scopedCwd, 'index.ts'),
      exportNames
        .map((name) => `export * from './exports/${name}.ts'`)
        .join('\n'),
      'utf8'
    )

    for (const [index, name] of exportNames.entries()) {
      const exportFilePath = join(scopedCwd, 'exports', `${name}.ts`)
      mkdirSync(dirname(exportFilePath), { recursive: true })
      writeFileSync(
        exportFilePath,
        `export const ${name} = ${index}`,
        'utf8'
      )
    }

    fileSystem.exportHistoryReport = createSyntheticExportHistoryReport(
      'index.ts',
      exportNames
    )
    writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

    try {
      const firstDirectory = new Directory({ fileSystem })
      const firstFile = await firstDirectory.getFile('index', 'ts')
      const firstExports = await firstFile.getExports()
      const firstSnapshotId = firstDirectory.getSession().snapshot.id

      await Promise.all(firstExports.map((entry) => entry.getFirstCommitDate()))

      expect(fileSystem.exportHistoryCalls).toBe(1)

      Session.reset(fileSystem)

      const secondDirectory = new Directory({ fileSystem })
      const secondFile = await secondDirectory.getFile('index', 'ts')
      const secondExports = await secondFile.getExports()

      expect(secondDirectory.getSession().snapshot.id).not.toBe(firstSnapshotId)

      await Promise.all(
        secondExports.map((entry) => entry.getFirstCommitDate())
      )

      expect(fileSystem.exportHistoryCalls).toBe(1)
      expect(fileSystem.exportMetadataCalls).toBe(0)
    } finally {
      Session.reset(fileSystem)
      rmSync(tempDirectory, { recursive: true, force: true })
    }
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
      const secondSections = await waitForFirstSectionTitle(secondFile, 'Beta')

      expect(firstSections[0]?.title).toBe('Alpha')
      expect(secondSections[0]?.title).toBe('Beta')
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true })
    }
  }, 30_000)

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

  test('uses combined file metadata lookups when provided by the file system', async () => {
    const fileSystem = new CombinedMetadataFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(fileSystem, 'combined-metadata')

    const firstContentId = await snapshot.contentId('/index.ts')
    expect(firstContentId.startsWith('mtime:')).toBe(true)
    expect(fileSystem.getMetadataCallCount()).toBe(1)

    const secondContentId = await snapshot.contentId('/index.ts')
    expect(secondContentId).toBe(firstContentId)
    expect(fileSystem.getMetadataCallCount()).toBe(1)
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

  test('coalesces overlapping paths in snapshot.invalidatePaths', async () => {
    const fileSystem = new InMemoryFileSystem({
      'src/index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'snapshot-bulk-invalidation'
    )
    const invalidatedPaths: string[] = []
    const disposeListener = snapshot.onInvalidate((path) => {
      invalidatedPaths.push(normalizePathKey(path))
    })

    const firstContentId = await snapshot.contentId('/src/index.ts')
    await fileSystem.writeFile('src/index.ts', 'export const value = 2')

    snapshot.invalidatePaths?.(['/src/index.ts', '/src', '/src/index.ts'])

    const secondContentId = await snapshot.contentId('/src/index.ts')

    disposeListener()

    expect(invalidatedPaths).toEqual(['src'])
    expect(secondContentId).not.toBe(firstContentId)
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

  test('does not reuse package structure cache across source path and export override variants', async () => {
    const fileSystem = new InMemoryFileSystem({
      'packages/foo/package.json': JSON.stringify({
        name: 'foo',
        exports: {
          '.': './src/index.ts',
        },
      }),
      'packages/foo/src/index.ts': 'export const sourceEntry = 1',
      'packages/foo/docs/guide.ts': 'export const docsEntry = 1',
    })
    const getFileRelativePaths = (
      structure: Awaited<ReturnType<Package['getStructure']>>
    ) => {
      return structure
        .filter((entry): entry is FileStructure => entry.kind === 'File')
        .map((entry) => entry.relativePath)
        .sort()
    }

    const sourcePackage = new Package({
      path: 'packages/foo',
      fileSystem,
    })
    const docsSourcePackage = new Package({
      path: 'packages/foo',
      fileSystem,
      sourcePath: 'docs',
    })
    const docsOverridePackage = new Package({
      path: 'packages/foo',
      fileSystem,
      exports: {
        '.': {
          path: 'docs',
        },
      },
    })

    expect(getFileRelativePaths(await sourcePackage.getStructure())).toEqual([
      'packages/foo/src/index.ts',
    ])
    expect(
      getFileRelativePaths(await docsSourcePackage.getStructure())
    ).toEqual(['packages/foo/docs/guide.ts'])
    expect(
      getFileRelativePaths(await docsOverridePackage.getStructure())
    ).toEqual(['packages/foo/docs/guide.ts'])
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

  test('rotates snapshot identity after a full session reset', () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const firstSession = Session.for(fileSystem)
    const firstSnapshotId = firstSession.snapshot.id

    Session.reset(fileSystem)

    const secondSession = Session.for(fileSystem)

    expect(secondSession.snapshot.id).not.toBe(firstSnapshotId)
  })

  test('reuses snapshot identity after a targeted session reset', () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const firstSession = Session.for(fileSystem)
    const firstSnapshotId = firstSession.snapshot.id

    Session.reset(fileSystem, firstSnapshotId)

    const secondSession = Session.for(fileSystem)

    expect(secondSession).not.toBe(firstSession)
    expect(secondSession.snapshot.id).toBe(firstSnapshotId)
  })

  test('refreshes cached directory sessions after a targeted session reset', () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const directory = new Directory({ fileSystem })
    const firstSession = directory.getSession()
    const firstSnapshotId = firstSession.snapshot.id

    Session.reset(fileSystem, firstSnapshotId)

    const nextSession = directory.getSession()
    expect(nextSession).not.toBe(firstSession)
    expect(nextSession.snapshot.id).toBe(firstSnapshotId)
  })

  test('gates replacement session persistence until reset invalidations drain', async () => {
    const fileSystem = new InMemoryFileSystem({
      'src/index.ts': 'export const value = 1',
    })
    const deleteByDependencyPathsStarted = createDeferredPromise()
    const releaseDeleteByDependencyPaths = createDeferredPromise()
    const loadSpy = vi.fn(async () => undefined)
    const saveSpy = vi.fn(async () => {})
    const cache = new Cache({
      persistence: {
        load: loadSpy,
        save: saveSpy,
        async delete() {},
        async deleteByDependencyPaths() {
          deleteByDependencyPathsStarted.resolve()
          await releaseDeleteByDependencyPaths.promise
          return {
            deletedNodeKeys: [],
            usedDependencyIndex: true,
            hasMissingDependencyMetadata: false,
          }
        },
      },
    })
    const firstSession = Session.for(fileSystem, undefined, cache)

    firstSession.invalidatePath('src')
    await deleteByDependencyPathsStarted.promise
    Session.reset(fileSystem, firstSession.snapshot.id)

    const nextSession = Session.for(fileSystem, undefined, cache)
    const putPromise = nextSession.cache.put(
      'test:targeted-reset-persistence-gate',
      { value: 1 },
      { persist: true }
    )

    await Promise.resolve()
    await Promise.resolve()

    expect(loadSpy).not.toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()

    releaseDeleteByDependencyPaths.resolve()
    await putPromise

    expect(loadSpy).toHaveBeenCalled()
    expect(saveSpy).toHaveBeenCalled()
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

  test('disposes cache stores during session reset', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const session = Session.for(fileSystem)
    const disposeSpy = vi.spyOn(session.cache, 'dispose')

    Session.reset(fileSystem, session.snapshot.id)
    await session.waitForPendingInvalidations()
    await Promise.resolve()

    expect(disposeSpy).toHaveBeenCalledTimes(1)
  })

  test('unsubscribes snapshot invalidation listeners when cache stores are disposed', () => {
    const invalidateListeners = new Set<(path: string) => void>()
    const snapshot = {
      id: 'dispose-listener-cleanup',
      async readDirectory() {
        return []
      },
      async readFile() {
        return ''
      },
      async readFileBinary() {
        return new Uint8Array(0)
      },
      readFileStream() {
        throw new Error('readFileStream is not required for this test')
      },
      async fileExists() {
        return false
      },
      async getFileLastModifiedMs() {
        return undefined
      },
      async getFileByteLength() {
        return undefined
      },
      isFilePathGitIgnored() {
        return false
      },
      async isFilePathExcludedFromTsConfigAsync() {
        return false
      },
      getRelativePathToWorkspace(path: string) {
        return normalizePathKey(path)
      },
      async contentId(path: string) {
        return `content:${normalizePathKey(path)}`
      },
      invalidatePath(path: string) {
        for (const listener of invalidateListeners) {
          listener(path)
        }
      },
      onInvalidate(listener: (path: string) => void) {
        invalidateListeners.add(listener)
        return () => {
          invalidateListeners.delete(listener)
        }
      },
    } satisfies Snapshot
    const firstStore = new CacheStore({ snapshot })
    const secondStore = new CacheStore({ snapshot })

    expect(invalidateListeners.size).toBe(1)

    firstStore.dispose()
    expect(invalidateListeners.size).toBe(1)

    secondStore.dispose()
    expect(invalidateListeners.size).toBe(0)
  })

  test('throws when using a disposed cache store', async () => {
    const store = createMemoryOnlyCacheStore()

    await store.put('test:disposed', 'value', { persist: false })
    store.dispose()

    await expect(
      store.getOrCompute(
        'test:disposed',
        { persist: false },
        async () => 'next'
      )
    ).rejects.toThrow(/disposed/i)
    expect(() => store.getSync('test:disposed')).toThrow(/disposed/i)
  })

  test('cleans persisted writes that complete after disposal', async () => {
    const nodeKey = 'test:dispose-persistence-race'
    const saveStarted = createDeferredPromise()
    const releaseSave = createDeferredPromise()
    const persistedEntries = new Map<string, CacheEntry>()
    const persistence: CacheStorePersistence = {
      async load(key) {
        return persistedEntries.get(key)
      },
      async save(key, entry) {
        saveStarted.resolve()
        await releaseSave.promise
        persistedEntries.set(key, entry)
      },
      async delete(key) {
        persistedEntries.delete(key)
      },
    }
    const store = new CacheStore({
      snapshot: new FileSystemSnapshot(new InMemoryFileSystem({})),
      persistence,
    })

    const writePromise = store.put(nodeKey, { value: 1 }, { persist: true })
    await saveStarted.promise
    store.dispose()
    releaseSave.resolve()
    await writePromise

    expect(await persistence.load(nodeKey)).toBeUndefined()
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
    expect(await unrelatedSession.inflight.get('token')).toBe(
      await unrelatedToken
    )
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

  test('reuses unrelated sessions after resetting a different snapshot family', () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })

    const targetSession = Session.for(
      fileSystem,
      new FileSystemSnapshot(fileSystem, 'target-lineage')
    )
    const unrelatedSession = Session.for(
      fileSystem,
      new FileSystemSnapshot(fileSystem, 'unrelated-lineage')
    )

    Session.reset(fileSystem, targetSession.snapshot.id)

    const reusedUnrelatedSession = Session.for(
      fileSystem,
      unrelatedSession.snapshot
    )

    expect(reusedUnrelatedSession).toBe(unrelatedSession)
    expect(reusedUnrelatedSession.snapshot.id).toBe(
      unrelatedSession.snapshot.id
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

  test('Session.invalidatePaths coalesces overlapping paths', async () => {
    const fileSystem = new InMemoryFileSystem({
      'src/index.ts': 'export const value = 1',
    })
    const session = Session.for(
      fileSystem,
      new FileSystemSnapshot(fileSystem, 'graph-batch-path-invalidation')
    )
    const nodeKey = 'test:graph-batch-path-invalidation'
    let calls = 0

    const firstValue = await session.cache.getOrCompute(
      nodeKey,
      { persist: false },
      async (ctx) => {
        calls += 1
        await ctx.recordFileDep('/src/index.ts')
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

    session.invalidatePaths(['/src/index.ts', '/src', '/src/index.ts'])

    const thirdValue = await session.cache.getOrCompute(
      nodeKey,
      { persist: false },
      async (ctx) => {
        calls += 1
        await ctx.recordFileDep('/src/index.ts')
        return `value-${calls}`
      }
    )

    expect(thirdValue).toBe('value-2')
    expect(calls).toBe(2)
  })

  test('Session.invalidatePaths preserves correctness when prefix index is capped', () => {
    const fileSystem = new InMemoryFileSystem({})
    const cache = new Cache({
      directorySnapshotPrefixIndexMaxKeys: 1,
    })
    const session = Session.for(
      fileSystem,
      new FileSystemSnapshot(fileSystem, 'session-prefix-index-cap'),
      cache
    )

    const componentsKey = session.createDirectorySnapshotKey({
      directoryPath: '/src/components',
      mask: 1,
      filterSignature: 'all',
      sortSignature: 'none',
    })
    const buttonKey = session.createDirectorySnapshotKey({
      directoryPath: '/src/components/button',
      mask: 1,
      filterSignature: 'all',
      sortSignature: 'none',
    })
    const otherKey = session.createDirectorySnapshotKey({
      directoryPath: '/src/other',
      mask: 1,
      filterSignature: 'all',
      sortSignature: 'none',
    })

    session.directorySnapshots.set(componentsKey, {
      path: 'src/components',
    } as any)
    session.directorySnapshots.set(buttonKey, {
      path: 'src/components/button',
    } as any)
    session.directorySnapshots.set(otherKey, { path: 'src/other' } as any)

    session.invalidatePaths(['/src/components/button/file.ts'])

    expect(session.directorySnapshots.has(componentsKey)).toBe(false)
    expect(session.directorySnapshots.has(buttonKey)).toBe(false)
    expect(session.directorySnapshots.has(otherKey)).toBe(true)
  })

  test('Session.invalidatePaths uses snapshot bulk invalidation when available', () => {
    const fileSystem = new InMemoryFileSystem({})
    const invalidateListeners = new Set<(path: string) => void>()
    const invalidatePathSpy = vi.fn()
    const invalidatePathsSpy = vi.fn((paths: Iterable<string>) => {
      for (const path of paths) {
        for (const listener of invalidateListeners) {
          listener(path)
        }
      }
    })
    const snapshot = {
      id: 'session-bulk-snapshot',
      async readDirectory() {
        return []
      },
      async readFile() {
        return ''
      },
      async readFileBinary() {
        return new Uint8Array(0)
      },
      readFileStream() {
        throw new Error('readFileStream is not required for this test')
      },
      async fileExists() {
        return false
      },
      async getFileLastModifiedMs() {
        return undefined
      },
      async getFileByteLength() {
        return undefined
      },
      isFilePathGitIgnored() {
        return false
      },
      async isFilePathExcludedFromTsConfigAsync() {
        return false
      },
      getRelativePathToWorkspace(path: string) {
        return normalizePathKey(path)
      },
      async contentId(path: string) {
        return `content:${normalizePathKey(path)}`
      },
      invalidatePath(path: string) {
        invalidatePathSpy(path)
        for (const listener of invalidateListeners) {
          listener(path)
        }
      },
      invalidatePaths(paths: Iterable<string>) {
        invalidatePathsSpy(paths)
      },
      onInvalidate(listener: (path: string) => void) {
        invalidateListeners.add(listener)
        return () => {
          invalidateListeners.delete(listener)
        }
      },
    } satisfies Snapshot

    const session = Session.for(fileSystem, snapshot)

    session.invalidatePaths(['/src/index.ts', '/src', '/src/index.ts'])

    expect(invalidatePathsSpy).toHaveBeenCalledTimes(1)
    expect(invalidatePathsSpy).toHaveBeenCalledWith(['/src'])
    expect(invalidatePathSpy).not.toHaveBeenCalled()
  })

  test('Session.invalidatePaths coalesces persisted invalidation queue work across calls', async () => {
    const fileSystem = new InMemoryFileSystem({
      'src/index.ts': 'export const value = 1',
    })
    const cache = new Cache({
      persistence: {
        async load() {
          return undefined
        },
        async save() {},
        async delete() {},
      },
    })
    const session = Session.for(
      fileSystem,
      new FileSystemSnapshot(fileSystem, 'session-persisted-batch'),
      cache
    )
    const deleteByDependencyPathsSpy = vi
      .spyOn(session.cache, 'deleteByDependencyPaths')
      .mockResolvedValue({
        deletedNodeKeys: [],
        usedDependencyIndex: true,
        hasMissingDependencyMetadata: false,
      })

    session.invalidatePaths(['/src/index.ts'])
    session.invalidatePaths(['/src'])
    await session.waitForPendingInvalidations()

    expect(deleteByDependencyPathsSpy).toHaveBeenCalledTimes(1)
    expect(deleteByDependencyPathsSpy).toHaveBeenCalledWith(['src'])
  })

  test('Session.reset lets queued persisted invalidations finish draining', async () => {
    const fileSystem = new InMemoryFileSystem({
      'src/first.ts': 'export const first = 1',
      'src/second.ts': 'export const second = 1',
    })
    const cache = new Cache({
      persistence: {
        async load() {
          return undefined
        },
        async save() {},
        async delete() {},
      },
    })
    const session = Session.for(
      fileSystem,
      new FileSystemSnapshot(fileSystem, 'session-reset-drain'),
      cache
    )
    const firstBatchStarted = createDeferredPromise()
    const releaseFirstBatch = createDeferredPromise()
    let callCount = 0
    const deleteByDependencyPathsSpy = vi
      .spyOn(session.cache, 'deleteByDependencyPaths')
      .mockImplementation(async (paths) => {
        callCount += 1
        if (callCount === 1) {
          firstBatchStarted.resolve()
          await releaseFirstBatch.promise
        }

        return {
          deletedNodeKeys: [],
          usedDependencyIndex: true,
          hasMissingDependencyMetadata: false,
        }
      })

    session.invalidatePaths(['/src/first.ts'])
    await firstBatchStarted.promise
    session.invalidatePaths(['/src/second.ts'])

    Session.reset(fileSystem)
    releaseFirstBatch.resolve()
    await session.waitForPendingInvalidations()

    expect(deleteByDependencyPathsSpy.mock.calls).toEqual([
      [['src/first.ts']],
      [['src/second.ts']],
    ])
  })

  test('Session.invalidatePaths prioritizes immediate persisted invalidations over queued background work', async () => {
    const fileSystem = new InMemoryFileSystem({
      'src/background-a.ts': 'export const value = "a"',
      'src/background-b.ts': 'export const value = "b"',
      'src/immediate.ts': 'export const value = "immediate"',
    })
    const cache = new Cache({
      persistence: {
        async load() {
          return undefined
        },
        async save() {},
        async delete() {},
      },
    })
    const session = Session.for(
      fileSystem,
      new FileSystemSnapshot(fileSystem, 'session-persisted-priority'),
      cache
    )
    const firstBatchStarted = createDeferredPromise()
    const releaseFirstBatch = createDeferredPromise()
    let callCount = 0
    const deleteByDependencyPathsSpy = vi
      .spyOn(session.cache, 'deleteByDependencyPaths')
      .mockImplementation(async () => {
        callCount += 1
        if (callCount === 1) {
          firstBatchStarted.resolve()
          await releaseFirstBatch.promise
        }

        return {
          deletedNodeKeys: [],
          usedDependencyIndex: true,
          hasMissingDependencyMetadata: false,
        }
      })

    session.invalidatePaths(['/src/background-a.ts'], {
      priority: 'background',
    })
    await firstBatchStarted.promise

    session.invalidatePaths(['/src/background-b.ts'], {
      priority: 'background',
    })
    session.invalidatePaths(['/src/immediate.ts'])

    releaseFirstBatch.resolve()
    await session.waitForPendingInvalidations()

    expect(deleteByDependencyPathsSpy).toHaveBeenCalledTimes(3)
    expect(deleteByDependencyPathsSpy.mock.calls[0]?.[0]).toEqual([
      'src/background-a.ts',
    ])
    expect(deleteByDependencyPathsSpy.mock.calls[1]?.[0]).toEqual([
      'src/immediate.ts',
    ])
    expect(deleteByDependencyPathsSpy.mock.calls[2]?.[0]).toEqual([
      'src/background-b.ts',
    ])
  })

  test('Session.invalidatePaths batches broad persisted fallback scans across multiple paths', async () => {
    const fileSystem = new InMemoryFileSystem({
      'src/first.ts': 'export const first = 1',
      'src/second.ts': 'export const second = 1',
    })
    const cache = new Cache({
      persistence: {
        async load() {
          return undefined
        },
        async save() {},
        async delete() {},
        async listNodeKeysByPrefix() {
          return []
        },
      },
    })
    const session = Session.for(
      fileSystem,
      new FileSystemSnapshot(fileSystem, 'session-persisted-fallback-batch'),
      cache
    )
    const deleteByDependencyPathsSpy = vi
      .spyOn(session.cache, 'deleteByDependencyPaths')
      .mockResolvedValue({
        deletedNodeKeys: [],
        usedDependencyIndex: true,
        hasMissingDependencyMetadata: true,
      })
    const listNodeKeysByPrefixSpy = vi.spyOn(
      session.cache,
      'listNodeKeysByPrefix'
    )

    session.invalidatePaths(['/src/first.ts', '/src/second.ts'])
    await session.waitForPendingInvalidations()

    expect(deleteByDependencyPathsSpy).toHaveBeenCalledTimes(1)
    expect(listNodeKeysByPrefixSpy).toHaveBeenCalledTimes(1)
    expect(listNodeKeysByPrefixSpy).toHaveBeenCalledWith('')
  })

  test('Session.invalidatePaths uses targeted missing-dependency keys when available', async () => {
    const fileSystem = new InMemoryFileSystem({
      'src/first.ts': 'export const first = 1',
    })
    const cache = new Cache({
      persistence: {
        async load() {
          return undefined
        },
        async save() {},
        async delete() {},
        async listNodeKeysByPrefix() {
          return []
        },
      },
    })
    const session = Session.for(
      fileSystem,
      new FileSystemSnapshot(fileSystem, 'session-persisted-fallback-targeted'),
      cache
    )
    const deleteByDependencyPathsSpy = vi
      .spyOn(session.cache, 'deleteByDependencyPaths')
      .mockResolvedValue({
        deletedNodeKeys: [],
        usedDependencyIndex: true,
        hasMissingDependencyMetadata: true,
        missingDependencyNodeKeys: ['analysis:missing-metadata'],
      })
    const listNodeKeysByPrefixSpy = vi.spyOn(
      session.cache,
      'listNodeKeysByPrefix'
    )

    session.invalidatePaths(['/src/first.ts'])
    await session.waitForPendingInvalidations()

    expect(deleteByDependencyPathsSpy).toHaveBeenCalledTimes(1)
    expect(listNodeKeysByPrefixSpy).toHaveBeenCalledTimes(0)
  })

  test('Session.invalidatePaths can force broad scans when targeted missing-dependency fallback is disabled', async () => {
    const fileSystem = new InMemoryFileSystem({
      'src/first.ts': 'export const first = 1',
    })
    const cache = new Cache({
      targetedMissingDependencyFallback: false,
      persistence: {
        async load() {
          return undefined
        },
        async save() {},
        async delete() {},
        async listNodeKeysByPrefix() {
          return []
        },
      },
    })
    const session = Session.for(
      fileSystem,
      new FileSystemSnapshot(
        fileSystem,
        'session-persisted-fallback-targeted-disabled'
      ),
      cache
    )
    vi.spyOn(session.cache, 'deleteByDependencyPaths').mockResolvedValue({
      deletedNodeKeys: [],
      usedDependencyIndex: true,
      hasMissingDependencyMetadata: true,
      missingDependencyNodeKeys: ['analysis:missing-metadata'],
    })
    const listNodeKeysByPrefixSpy = vi.spyOn(
      session.cache,
      'listNodeKeysByPrefix'
    )

    session.invalidatePaths(['/src/first.ts'])
    await session.waitForPendingInvalidations()

    expect(listNodeKeysByPrefixSpy).toHaveBeenCalledTimes(1)
    expect(listNodeKeysByPrefixSpy).toHaveBeenCalledWith('')
  })

  test('Session.invalidatePaths waits for persisted snapshot key deletions', async () => {
    const fileSystem = new InMemoryFileSystem({
      'src/index.ts': 'export const value = 1',
    })
    const cache = new Cache({
      persistence: {
        async load() {
          return undefined
        },
        async save() {},
        async delete() {},
      },
    })
    const session = Session.for(
      fileSystem,
      new FileSystemSnapshot(fileSystem, 'session-delete-many-wait'),
      cache
    )
    const snapshotKey = session.createDirectorySnapshotKey({
      directoryPath: 'src',
      mask: 0,
      filterSignature: 'all',
      sortSignature: 'default',
    })
    session.directorySnapshots.set(snapshotKey, {} as never)

    const deleteManyStarted = createDeferredPromise()
    const releaseDeleteMany = createDeferredPromise()
    vi.spyOn(session.cache, 'deleteByDependencyPaths').mockResolvedValue({
      deletedNodeKeys: [],
      usedDependencyIndex: true,
      hasMissingDependencyMetadata: false,
    })
    const deleteManySpy = vi
      .spyOn(session.cache, 'deleteMany')
      .mockImplementation(async (nodeKeys) => {
        deleteManyStarted.resolve()
        await releaseDeleteMany.promise
        return Array.from(nodeKeys).length
      })

    session.invalidatePaths(['/src'])
    await deleteManyStarted.promise

    let completed = false
    const waitForInvalidations = session
      .waitForPendingInvalidations()
      .then(() => {
        completed = true
      })
    await Promise.resolve()

    expect(completed).toBe(false)
    releaseDeleteMany.resolve()
    await waitForInvalidations

    expect(deleteManySpy).toHaveBeenCalledWith([snapshotKey])
    expect(completed).toBe(true)
  })

  test('Session.invalidatePaths scans all persisted keys when the dependency index is unavailable', async () => {
    const fileSystem = new InMemoryFileSystem({
      'src/first.ts': 'export const first = 1',
    })
    const cache = new Cache({
      persistence: {
        async load() {
          return undefined
        },
        async save() {},
        async delete() {},
        async listNodeKeysByPrefix() {
          return []
        },
      },
    })
    const session = Session.for(
      fileSystem,
      new FileSystemSnapshot(fileSystem, 'session-persisted-full-fallback'),
      cache
    )
    vi.spyOn(session.cache, 'deleteByDependencyPaths').mockResolvedValue({
      deletedNodeKeys: [],
      usedDependencyIndex: false,
      hasMissingDependencyMetadata: false,
    })
    const listNodeKeysByPrefixSpy = vi.spyOn(
      session.cache,
      'listNodeKeysByPrefix'
    )

    session.invalidatePaths(['/src/first.ts'])
    await session.waitForPendingInvalidations()

    expect(listNodeKeysByPrefixSpy).toHaveBeenCalledTimes(1)
    expect(listNodeKeysByPrefixSpy).toHaveBeenCalledWith('')
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

    const firstCompute = replaceWithGetOrCompute('first', firstGate.promise)
    await Promise.resolve()
    const secondCompute = replaceWithGetOrCompute('second', secondGate.promise)
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

  test('does not persist stale in-flight compute results after explicit delete', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'replacement-delete-inflight'
    )
    const store = new CacheStore({ snapshot })
    const nodeKey = 'test:replacement-delete-inflight'

    const started = createDeferredPromise()
    const release = createDeferredPromise()

    const staleCompute = store.getOrCompute(
      nodeKey,
      { persist: false },
      async (ctx) => {
        await ctx.recordFileDep('/index.ts')
        started.resolve()
        await release.promise
        return 'stale'
      }
    )

    await started.promise
    await store.delete(nodeKey)

    const freshValue = await store.getOrCompute(
      nodeKey,
      { persist: false },
      async (ctx) => {
        await ctx.recordFileDep('/index.ts')
        return 'fresh'
      }
    )

    release.resolve()
    const staleValue = await staleCompute

    expect(staleValue).toBe('stale')
    expect(freshValue).toBe('fresh')
    expect(await store.get<string>(nodeKey)).toBe('fresh')
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

  test('uses persistent cache policy from filesystem capability methods', async () => {
    const AnonymousNodeFileSystem = class extends NodeFileSystem {}
    const AnonymousInMemoryFileSystem = class extends InMemoryFileSystem {}
    const nodeFileSystem = new AnonymousNodeFileSystem()
    const inMemoryFileSystem = new AnonymousInMemoryFileSystem({})

    try {
      expect(Session.for(nodeFileSystem).usesPersistentCache).toBe(true)
      expect(Session.for(inMemoryFileSystem).usesPersistentCache).toBe(false)
    } finally {
      Session.reset(nodeFileSystem)
      Session.reset(inMemoryFileSystem)
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

  test('uses development workspace token defaults when persistent cache is enabled', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    const fileSystem = new TokenAwareNodeFileSystem(
      getRootDirectory(),
      join(getRootDirectory(), 'tsconfig.json'),
      'stable-token'
    )
    const tokenLookup = vi
      .spyOn(fileSystem, 'getWorkspaceChangeToken')
      .mockImplementation(async (rootPath) => {
        return `token:${normalizePathKey(rootPath)}`
      })
    const changedPathsLookup = vi
      .spyOn(fileSystem, 'getWorkspaceChangedPathsSinceToken')
      .mockImplementation(async () => {
        return [normalizePathKey('docs/page.ts')]
      })

    try {
      const session = Session.for(fileSystem)
      expect(session.usesPersistentCache).toBe(true)

      const firstToken = await session.getWorkspaceChangeToken('docs')
      const secondToken = await session.getWorkspaceChangeToken('docs')
      expect(firstToken).toBe('token:docs')
      expect(secondToken).toBe('token:docs')
      expect(tokenLookup).toHaveBeenCalledTimes(1)

      const firstChangedPaths =
        await session.getWorkspaceChangedPathsSinceToken('docs', 'prev')
      const secondChangedPaths =
        await session.getWorkspaceChangedPathsSinceToken('docs', 'prev')
      expect(Array.from(firstChangedPaths ?? [])).toEqual([
        normalizePathKey('docs/page.ts'),
      ])
      expect(Array.from(secondChangedPaths ?? [])).toEqual([
        normalizePathKey('docs/page.ts'),
      ])
      expect(changedPathsLookup).toHaveBeenCalledTimes(1)
    } finally {
      Session.reset(fileSystem)
      tokenLookup.mockRestore()
      changedPathsLookup.mockRestore()
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = previousNodeEnv
      }
    }
  })

  test('awaits refreshed workspace token and changed paths while revalidating in development', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    const fileSystem = new TokenAwareNodeFileSystem(
      getRootDirectory(),
      join(getRootDirectory(), 'tsconfig.json'),
      'stable-token'
    )
    const tokenRefreshGate = createDeferredPromise()
    const changedPathsRefreshGate = createDeferredPromise()
    let tokenLookupCount = 0
    let changedPathsLookupCount = 0
    const tokenLookup = vi
      .spyOn(fileSystem, 'getWorkspaceChangeToken')
      .mockImplementation(async (rootPath) => {
        tokenLookupCount += 1
        if (tokenLookupCount === 1) {
          return `token:v1:${normalizePathKey(rootPath)}`
        }

        await tokenRefreshGate.promise
        return `token:v2:${normalizePathKey(rootPath)}`
      })
    const changedPathsLookup = vi
      .spyOn(fileSystem, 'getWorkspaceChangedPathsSinceToken')
      .mockImplementation(async (rootPath) => {
        changedPathsLookupCount += 1
        if (changedPathsLookupCount === 1) {
          return [normalizePathKey(`${normalizePathKey(rootPath)}/v1.ts`)]
        }

        await changedPathsRefreshGate.promise
        return [normalizePathKey(`${normalizePathKey(rootPath)}/v2.ts`)]
      })
    const cache = new Cache({
      workspaceChangeTokenTtlMs: 5,
      workspaceChangedPathsTtlMs: 5,
    })

    try {
      const session = Session.for(fileSystem, undefined, cache)

      const firstToken = await session.getWorkspaceChangeToken('docs')
      const firstChangedPaths =
        await session.getWorkspaceChangedPathsSinceToken('docs', 'prev')
      expect(firstToken).toBe('token:v1:docs')
      expect(Array.from(firstChangedPaths ?? [])).toEqual([
        normalizePathKey('docs/v1.ts'),
      ])

      await new Promise((resolve) => setTimeout(resolve, 15))

      const staleTokenPromise = session.getWorkspaceChangeToken('docs')
      const refreshedChangedPathsPromise =
        session.getWorkspaceChangedPathsSinceToken('docs', 'prev')

      let refreshedTokenResolved = false
      let refreshedChangedPathsResolved = false
      void staleTokenPromise.then(() => {
        refreshedTokenResolved = true
      })
      void refreshedChangedPathsPromise.then(() => {
        refreshedChangedPathsResolved = true
      })

      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(refreshedTokenResolved).toBe(false)
      expect(refreshedChangedPathsResolved).toBe(false)

      tokenRefreshGate.resolve()
      const refreshedTokenDuringRevalidation = await staleTokenPromise
      changedPathsRefreshGate.resolve()

      const refreshedChangedPathsAfterRevalidation =
        await refreshedChangedPathsPromise
      expect(refreshedTokenDuringRevalidation).toBe('token:v2:docs')
      expect(Array.from(refreshedChangedPathsAfterRevalidation ?? [])).toEqual([
        normalizePathKey('docs/v2.ts'),
      ])
      await new Promise((resolve) => setTimeout(resolve, 5))

      const refreshedToken = await session.getWorkspaceChangeToken('docs')
      const refreshedChangedPaths =
        await session.getWorkspaceChangedPathsSinceToken('docs', 'prev')
      expect(refreshedToken).toBe('token:v2:docs')
      expect(Array.from(refreshedChangedPaths ?? [])).toEqual([
        normalizePathKey('docs/v2.ts'),
      ])

      expect(tokenLookup.mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(changedPathsLookup.mock.calls.length).toBeGreaterThanOrEqual(2)
    } finally {
      Session.reset(fileSystem)
      tokenLookup.mockRestore()
      changedPathsLookup.mockRestore()
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = previousNodeEnv
      }
    }
  })

  test('keeps persistent workspace token defaults uncached in production', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    const fileSystem = new TokenAwareNodeFileSystem(
      getRootDirectory(),
      join(getRootDirectory(), 'tsconfig.json'),
      'stable-token'
    )
    const tokenLookup = vi
      .spyOn(fileSystem, 'getWorkspaceChangeToken')
      .mockImplementation(async (rootPath) => {
        return `token:${normalizePathKey(rootPath)}`
      })
    const changedPathsLookup = vi
      .spyOn(fileSystem, 'getWorkspaceChangedPathsSinceToken')
      .mockImplementation(async () => {
        return [normalizePathKey('docs/page.ts')]
      })

    try {
      const session = Session.for(fileSystem)
      expect(session.usesPersistentCache).toBe(true)

      await session.getWorkspaceChangeToken('docs')
      await session.getWorkspaceChangeToken('docs')
      expect(tokenLookup).toHaveBeenCalledTimes(2)

      await session.getWorkspaceChangedPathsSinceToken('docs', 'prev')
      await session.getWorkspaceChangedPathsSinceToken('docs', 'prev')
      expect(changedPathsLookup).toHaveBeenCalledTimes(2)
    } finally {
      Session.reset(fileSystem)
      tokenLookup.mockRestore()
      changedPathsLookup.mockRestore()
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = previousNodeEnv
      }
    }
  })

  test('dedupes concurrent workspace token and changed-path lookups when TTL is disabled', async () => {
    const fileSystem = new TokenAwareNodeFileSystem(
      getRootDirectory(),
      join(getRootDirectory(), 'tsconfig.json'),
      'stable-token'
    )
    const cache = new Cache({
      workspaceChangeTokenTtlMs: 0,
      workspaceChangedPathsTtlMs: 0,
    })
    const tokenLookup = vi
      .spyOn(fileSystem, 'getWorkspaceChangeToken')
      .mockImplementation(async (rootPath) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return `token:${normalizePathKey(rootPath)}`
      })
    const changedPathsLookup = vi
      .spyOn(fileSystem, 'getWorkspaceChangedPathsSinceToken')
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return [normalizePathKey('docs/page.ts')]
      })

    try {
      const session = Session.for(fileSystem, undefined, cache)
      const [firstToken, secondToken] = await Promise.all([
        session.getWorkspaceChangeToken('docs'),
        session.getWorkspaceChangeToken('docs'),
      ])

      const [firstChangedPaths, secondChangedPaths] = await Promise.all([
        session.getWorkspaceChangedPathsSinceToken('docs', 'prev'),
        session.getWorkspaceChangedPathsSinceToken('docs', 'prev'),
      ])

      expect(firstToken).toBe('token:docs')
      expect(secondToken).toBe('token:docs')
      expect(tokenLookup).toHaveBeenCalledTimes(1)
      expect(Array.from(firstChangedPaths ?? [])).toEqual([
        normalizePathKey('docs/page.ts'),
      ])
      expect(Array.from(secondChangedPaths ?? [])).toEqual([
        normalizePathKey('docs/page.ts'),
      ])
      expect(changedPathsLookup).toHaveBeenCalledTimes(1)
    } finally {
      Session.reset(fileSystem)
    }
  })

  test('falls back to in-memory workspace token defaults when persistence becomes unavailable', async () => {
    const fileSystem = new TokenAwareNodeFileSystem(
      getRootDirectory(),
      join(getRootDirectory(), 'tsconfig.json'),
      'stable-token'
    )
    let persistenceAvailable = true
    const persistence: CacheStorePersistence = {
      async load() {
        return undefined
      },
      async save() {},
      async delete() {},
      isAvailable() {
        return persistenceAvailable
      },
    }
    const cache = new Cache({ persistence })
    const session = Session.for(fileSystem, undefined, cache)

    try {
      persistenceAvailable = false
      expect(session.usesPersistentCache).toBe(false)

      const tokenLookup = vi.spyOn(fileSystem, 'getWorkspaceChangeToken')
      const changedPathsLookup = vi.spyOn(
        fileSystem,
        'getWorkspaceChangedPathsSinceToken'
      )

      const firstToken = await session.getWorkspaceChangeToken('docs')
      const secondToken = await session.getWorkspaceChangeToken('docs')
      expect(firstToken).toBe(secondToken)
      expect(tokenLookup).toHaveBeenCalledTimes(1)

      const firstChangedPaths =
        await session.getWorkspaceChangedPathsSinceToken(
          'docs',
          'outdated-token'
        )
      const secondChangedPaths =
        await session.getWorkspaceChangedPathsSinceToken(
          'docs',
          'outdated-token'
        )
      expect(firstChangedPaths).toBeNull()
      expect(secondChangedPaths).toBeNull()
      expect(changedPathsLookup).toHaveBeenCalledTimes(1)
    } finally {
      Session.reset(fileSystem)
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
      const secondWorkerFile = await secondWorkerDirectory.getFile(
        'page',
        'mdx'
      )
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
      writeFileSync(join(docsDirectory, 'index.mdx'), '# Home', 'utf8')

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
      expect(secondReadDirectory).toHaveBeenCalledTimes(3)
    })
  })

  test('persists deep directory snapshot payloads and restores them on a warm run', async () => {
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
      const firstSnapshotKey = Array.from(
        firstSession.directorySnapshots.keys()
      )[0]
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

      expect(
        secondEntries.some((entry) =>
          entry.relativePath.endsWith('getting-started.mdx')
        )
      ).toBe(true)
      expect(secondReadDirectory).toHaveBeenCalledTimes(3)
    })
  })

  test('reuses persisted snapshots without dependency stat checks when token is unchanged', async () => {
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

  test('recomputes persisted git metadata when HEAD changes without path changes', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')
      const firstToken = `head:${'a'.repeat(40)};dirty:${'0'.repeat(40)};count:0;ignored-only:0`
      const secondToken = `head:${'b'.repeat(40)};dirty:${'0'.repeat(40)};count:0;ignored-only:0`

      mkdirSync(docsDirectory, { recursive: true })
      writeFileSync(
        join(docsDirectory, 'index.ts'),
        'export const value = 1',
        'utf8'
      )
      writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

      const firstFileSystem = new HeadAwareMetadataNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        firstToken
      )
      ;(firstFileSystem as { repoRoot?: string }).repoRoot = tmpDirectory

      const firstDirectory = new Directory({
        fileSystem: firstFileSystem,
        path: workspaceDirectory,
      })
      const firstFile = await firstDirectory.getFile('index', 'ts')
      const firstExport = await firstFile.getExport('value')

      expect((await firstFile.getLastCommitDate())?.toISOString()).toBe(
        '2024-01-01T00:00:00.000Z'
      )
      expect((await firstFile.getAuthors())[0]?.commitCount).toBe(1)
      expect((await firstExport.getLastCommitDate())?.toISOString()).toBe(
        '2024-01-01T00:00:00.000Z'
      )
      expect((await firstDirectory.getLastCommitDate())?.toISOString()).toBe(
        '2024-01-01T00:00:00.000Z'
      )
      expect((await firstDirectory.getAuthors())[0]?.commitCount).toBe(1)

      const secondFileSystem = new HeadAwareMetadataNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        secondToken
      )
      secondFileSystem.fileMetadata = {
        authors: [
          {
            name: 'Ada',
            commitCount: 2,
            firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
            lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
          },
        ],
        firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
        lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
      }
      secondFileSystem.exportMetadata = {
        firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
        lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
        firstCommitHash: 'a1',
        lastCommitHash: 'b2',
      }
      secondFileSystem.setChangedPathsSinceToken(
        workspaceDirectory,
        firstToken,
        []
      )
      ;(secondFileSystem as { repoRoot?: string }).repoRoot = tmpDirectory

      const secondDirectory = new Directory({
        fileSystem: secondFileSystem,
        path: workspaceDirectory,
      })
      const secondFile = await secondDirectory.getFile('index', 'ts')
      const secondExport = await secondFile.getExport('value')

      expect((await secondFile.getLastCommitDate())?.toISOString()).toBe(
        '2024-02-01T00:00:00.000Z'
      )
      expect((await secondFile.getAuthors())[0]?.commitCount).toBe(2)
      expect((await secondExport.getLastCommitDate())?.toISOString()).toBe(
        '2024-02-01T00:00:00.000Z'
      )
      expect((await secondDirectory.getLastCommitDate())?.toISOString()).toBe(
        '2024-02-01T00:00:00.000Z'
      )
      expect((await secondDirectory.getAuthors())[0]?.commitCount).toBe(2)
      expect(secondFileSystem.fileMetadataCalls).toBeGreaterThan(0)
      expect(secondFileSystem.exportMetadataCalls).toBeGreaterThan(0)
    })
  })

  test('reuses persisted child structure metadata when rebuilding directory structure', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')
      const cacheDirectory = join(tmpDirectory, '.renoun', 'cache')
      const token = `head:${'a'.repeat(40)};dirty:${'0'.repeat(40)};count:0;ignored-only:0`
      const structureOptions = {
        includeExports: 'headers' as const,
        includeSections: false,
        includeResolvedTypes: false,
        includeGitDates: true,
      }

      mkdirSync(docsDirectory, { recursive: true })
      writeFileSync(
        join(docsDirectory, 'index.ts'),
        ['export const alpha = 1', 'export const beta = 2'].join('\n'),
        'utf8'
      )
      writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

      const firstFileSystem = new HeadAwareMetadataNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        token
      )
      ;(firstFileSystem as { repoRoot?: string }).repoRoot = tmpDirectory

      const firstDirectory = new Directory({
        fileSystem: firstFileSystem,
        path: workspaceDirectory,
        cache: new Cache({ outputDirectory: cacheDirectory }),
      })

      const firstStructure = await firstDirectory.getStructure(structureOptions)
      expect(
        firstStructure.some(
          (entry) =>
            entry.kind === 'File' &&
            entry.relativePath.endsWith('/docs/index.ts')
        )
      ).toBe(true)
      expect(firstFileSystem.fileMetadataCalls).toBeGreaterThan(0)
      expect(firstFileSystem.exportMetadataCalls).toBeGreaterThan(0)

      await firstDirectory.getSession().cache.delete(
        firstDirectory.getStructureCacheKey(structureOptions)
      )

      const secondFileSystem = new HeadAwareMetadataNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        token
      )
      ;(secondFileSystem as { repoRoot?: string }).repoRoot = tmpDirectory

      const secondDirectory = new Directory({
        fileSystem: secondFileSystem,
        path: workspaceDirectory,
        cache: new Cache({ outputDirectory: cacheDirectory }),
      })

      const secondStructure = await secondDirectory.getStructure(structureOptions)
      const rebuiltFile = secondStructure.find(
        (entry) =>
          entry.kind === 'File' &&
          entry.relativePath.endsWith('/docs/index.ts')
      )

      expect(rebuiltFile).toBeDefined()
      expect(secondFileSystem.fileMetadataCalls).toBe(0)
      expect(secondFileSystem.exportMetadataCalls).toBe(0)
    })
  })

  test('reuses persisted directory structure manifest when workspace token is unchanged', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')
      const cacheDirectory = join(tmpDirectory, '.renoun', 'cache')
      const token = `head:${'a'.repeat(40)};dirty:${'0'.repeat(40)};count:0;ignored-only:0`
      const structureOptions = {
        includeExports: 'headers' as const,
        includeSections: false,
        includeResolvedTypes: false,
        includeGitDates: true,
      }

      mkdirSync(docsDirectory, { recursive: true })
      writeFileSync(
        join(docsDirectory, 'index.ts'),
        ['export const alpha = 1', 'export const beta = 2'].join('\n'),
        'utf8'
      )
      writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

      const firstFileSystem = new HeadAwareModuleMetadataNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        token
      )
      ;(firstFileSystem as { repoRoot?: string }).repoRoot = tmpDirectory
      const firstExportsSpy = vi.spyOn(firstFileSystem, 'getFileExports')

      const firstDirectory = new Directory({
        fileSystem: firstFileSystem,
        path: workspaceDirectory,
        cache: new Cache({ outputDirectory: cacheDirectory }),
      })

      const firstStructure = await firstDirectory.getStructure(structureOptions)
      expect(
        firstStructure.some(
          (entry) =>
            entry.kind === 'File' &&
            entry.relativePath.endsWith('/docs/index.ts')
        )
      ).toBe(true)
      expect(firstFileSystem.fileMetadataCalls).toBe(0)
      expect(firstFileSystem.moduleMetadataCalls).toBeGreaterThan(0)
      expect(firstExportsSpy).toHaveBeenCalled()

      const secondFileSystem = new HeadAwareModuleMetadataNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        token
      )
      ;(secondFileSystem as { repoRoot?: string }).repoRoot = tmpDirectory
      const secondExportsSpy = vi.spyOn(secondFileSystem, 'getFileExports')

      const secondDirectory = new Directory({
        fileSystem: secondFileSystem,
        path: workspaceDirectory,
        cache: new Cache({ outputDirectory: cacheDirectory }),
      })

      const secondStructure = await secondDirectory.getStructure(structureOptions)
      expect(
        secondStructure.some(
          (entry) =>
            entry.kind === 'File' &&
            entry.relativePath.endsWith('/docs/index.ts')
        )
      ).toBe(true)
      expect(secondFileSystem.fileMetadataCalls).toBe(0)
      expect(secondFileSystem.moduleMetadataCalls).toBe(0)
      expect(secondFileSystem.exportMetadataCalls).toBe(0)
      expect(secondExportsSpy).not.toHaveBeenCalled()
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

  test('distinguishes snapshot workspace-change path lookups when values contain separators', async () => {
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

    const snapshot = new FileSystemSnapshot(fileSystem, 'separator-snapshot')

    expect(
      Array.from(
        (await snapshot.getWorkspaceChangedPathsSinceToken('a|b', 'c')) ?? []
      )
    ).toEqual([normalizePathKey('joined-snapshots')])
    expect(
      Array.from(
        (await snapshot.getWorkspaceChangedPathsSinceToken('a', 'b|c')) ?? []
      )
    ).toEqual([normalizePathKey('primary-snapshots')])
  })

  test('reuses persisted snapshots when token changes without dependency-path intersection', async () => {
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

  test('revalidates includeGitIgnoredFiles snapshots when ignored dependencies change with unchanged token', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')
      const ignoredFilePath = join(docsDirectory, 'ignored.ts')
      const stableToken = `stable-token:${normalizePathKey(workspaceDirectory)}`

      mkdirSync(docsDirectory, { recursive: true })
      writeFileSync(ignoredFilePath, 'export const ignored = 1', 'utf8')
      writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

      const createWorkerFileSystem = () => {
        const fileSystem = new NestedCwdNodeFileSystem(
          getRootDirectory(),
          tsConfigPath
        )
        vi.spyOn(fileSystem, 'getWorkspaceChangeToken').mockResolvedValue(
          stableToken
        )
        vi.spyOn(
          fileSystem,
          'getWorkspaceChangedPathsSinceToken'
        ).mockImplementation(async (_rootPath, previousToken) =>
          previousToken === stableToken ? [] : null
        )
        vi.spyOn(fileSystem, 'isFilePathGitIgnored').mockImplementation(
          (filePath) => normalizePathKey(filePath).endsWith('docs/ignored.ts')
        )
        return fileSystem
      }

      const firstFileSystem = createWorkerFileSystem()
      const firstWorkerDirectory = new Directory({
        fileSystem: firstFileSystem,
        path: workspaceDirectory,
      })

      const firstEntries = await firstWorkerDirectory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
        includeGitIgnoredFiles: true,
      })
      expect(
        firstEntries.some((entry) => entry.workspacePath.endsWith('ignored.ts'))
      ).toBe(true)

      await new Promise((resolve) => setTimeout(resolve, 25))
      writeFileSync(ignoredFilePath, 'export const ignored = 2', 'utf8')

      const secondFileSystem = createWorkerFileSystem()
      const secondStatLookup = vi.spyOn(
        secondFileSystem,
        'getFileLastModifiedMs'
      )
      const secondBinaryLookup = vi.spyOn(secondFileSystem, 'readFileBinary')
      const secondWorkerDirectory = new Directory({
        fileSystem: secondFileSystem,
        path: workspaceDirectory,
      })

      const secondEntries = await secondWorkerDirectory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
        includeGitIgnoredFiles: true,
      })

      expect(
        secondEntries.some((entry) =>
          entry.workspacePath.endsWith('ignored.ts')
        )
      ).toBe(true)
      expect(
        secondStatLookup.mock.calls.length > 0 ||
          secondBinaryLookup.mock.calls.length > 0
      ).toBe(true)
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
        const workspaceDirectory = relativePath(
          getRootDirectory(),
          docsDirectory
        )
        const guidesDirectoryPath = join(workspaceDirectory, 'guides')
        const validEntryPath = join(guidesDirectoryPath, 'index.mdx')
        const validEntryAbsolutePath = join(
          docsDirectory,
          'guides',
          'index.mdx'
        )
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
        const snapshotKey = Array.from(
          firstSession.directorySnapshots.keys()
        ).find((key) => key.startsWith(`dir:${guideWorkspacePathKey}|`))
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
          const cacheKeysAfterFirstRead = await secondDirectory
            .getSession()
            .cache.listNodeKeysByPrefix('dir:')

          expect(
            secondEntries.some((entry) =>
              entry.workspacePath.endsWith('index.mdx')
            )
          ).toBe(true)
          expect(secondReadDirectory).toHaveBeenCalledTimes(0)
          expect(warnSpy).toHaveBeenCalledTimes(0)
          expect(
            await secondDirectory.getSession().cache.get(snapshotKey!)
          ).toBeDefined()
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
      const docsWorkspacePathKey = normalizePathKey(
        firstDirectory.workspacePath
      )
      const snapshotKey = Array.from(
        firstSession.directorySnapshots.keys()
      ).find((key) => key.startsWith(`dir:${docsWorkspacePathKey}|`))

      expect(snapshotKey).toBeDefined()

      const persistedSnapshot = (await firstSession.cache.get(
        snapshotKey!
      )) as {
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
        tsConfigPath,
        join(tmpDirectory, '.renoun', 'cache')
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
      expect(secondReadDirectory).toHaveBeenCalledTimes(1)
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
      const previousToken =
        await firstFileSystem.getWorkspaceChangeToken(workspaceDirectory)

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
            relativePath(
              getRootDirectory(),
              join(docsDirectory, 'guides', 'new.mdx')
            )
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

  test('revalidates persisted snapshots when tsconfig probes are created, updated, and deleted', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')
      const workspaceRelativeRoot = relativePath(
        getRootDirectory(),
        tmpDirectory
      )
      const examplesFileName = 'button.examples.tsx'
      const examplesRelativePath = `${workspaceRelativeRoot}/docs/${examplesFileName}`

      mkdirSync(docsDirectory, { recursive: true })
      writeFileSync(
        join(docsDirectory, 'index.tsx'),
        'export const value = true',
        'utf8'
      )
      writeFileSync(
        join(docsDirectory, examplesFileName),
        'export const sample = true',
        'utf8'
      )

      const createWorkerFileSystem = () => {
        const fileSystem = new NestedCwdNodeFileSystem(
          getRootDirectory(),
          tsConfigPath
        )
        ;(fileSystem as { repoRoot?: string }).repoRoot = tmpDirectory
        return fileSystem
      }
      const getVisibleEntries = async () => {
        const directory = new Directory({
          fileSystem: createWorkerFileSystem(),
          path: workspaceDirectory,
        })
        const entries = await directory.getEntries({
          includeIndexAndReadmeFiles: true,
        })
        return entries
          .filter((entry): entry is File => entry instanceof File)
          .map((entry) => normalizePathKey(entry.workspacePath))
          .sort((first, second) => first.localeCompare(second))
      }

      const firstEntries = await getVisibleEntries()
      expect(firstEntries).toContain(normalizePathKey(examplesRelativePath))

      writeFileSync(
        tsConfigPath,
        JSON.stringify(
          {
            exclude: ['docs/**/*.examples.tsx'],
          },
          null,
          2
        ),
        'utf8'
      )
      await new Promise((resolve) => setTimeout(resolve, 300))

      const secondEntries = await getVisibleEntries()
      expect(secondEntries).not.toContain(
        normalizePathKey(examplesRelativePath)
      )

      writeFileSync(
        tsConfigPath,
        JSON.stringify(
          {
            exclude: [],
          },
          null,
          2
        ),
        'utf8'
      )
      await new Promise((resolve) => setTimeout(resolve, 300))

      const thirdEntries = await getVisibleEntries()
      expect(thirdEntries).toContain(normalizePathKey(examplesRelativePath))

      rmSync(tsConfigPath, { force: true })
      await new Promise((resolve) => setTimeout(resolve, 300))

      const fourthEntries = await getVisibleEntries()
      expect(fourthEntries).toContain(normalizePathKey(examplesRelativePath))
    })
  })

  test('stores persisted snapshot paths as normalized workspace-relative keys', async () => {
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

  test('persists only the root snapshot key when recursively hydrating a directory', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const workspacePathKey = normalizePathKey(workspaceDirectory)

      mkdirSync(join(docsDirectory, 'guides', 'advanced'), { recursive: true })
      writeFileSync(
        join(docsDirectory, 'guides', 'intro.mdx'),
        '# Intro',
        'utf8'
      )
      writeFileSync(
        join(docsDirectory, 'guides', 'advanced', 'deep-dive.mdx'),
        '# Deep Dive',
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
      const rootSnapshotKey = Array.from(
        session.directorySnapshots.keys()
      ).find((key) => key.startsWith(`dir:${workspacePathKey}|`))
      const persistedSnapshotKeys =
        await session.cache.listNodeKeysByPrefix('dir:')

      expect(rootSnapshotKey).toBeDefined()
      expect(persistedSnapshotKeys).toEqual([rootSnapshotKey])
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
      const firstReadDirectory = vi.spyOn(
        firstWorkerFileSystem,
        'readDirectory'
      )
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
        firstReadDirectory.mock.calls.length +
        secondReadDirectory.mock.calls.length
      expect(totalDirectoryReads).toBe(3)
    })
  })

  test('rebuilds persisted directory snapshots when a child signature changes', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    try {
      await withProductionSqliteCache(async (tmpDirectory) => {
        const docsDirectory = join(tmpDirectory, 'docs')
        const workspaceDirectory = relativePath(
          getRootDirectory(),
          docsDirectory
        )

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

        expect(secondReadDirectory).toHaveBeenCalledTimes(4)
      })
    } finally {
      process.env.NODE_ENV = previousNodeEnv
    }
  })

  test('treats disposed-cache snapshot cleanup as a cache miss during restore', async () => {
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
      writeFileSync(join(docsDirectory, 'index.mdx'), '# Home', 'utf8')

      const firstDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: workspaceDirectory,
      })

      const firstEntries = await firstDirectory.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
      })
      const firstPaths = firstEntries
        .filter((entry): entry is File => entry instanceof File)
        .map((entry) => entry.workspacePath)
        .sort()

      const firstSession = firstDirectory.getSession()
      const snapshotKey = Array.from(firstSession.directorySnapshots.keys())[0]
      expect(snapshotKey).toBeDefined()

      await firstSession.cache.put(snapshotKey!, { version: 999 } as any, {
        persist: true,
      })

      const secondFileSystem = createTempNodeFileSystem(tmpDirectory)
      const secondReadDirectory = vi.spyOn(secondFileSystem, 'readDirectory')
      const secondDirectory = new Directory({
        fileSystem: secondFileSystem,
        path: workspaceDirectory,
      })
      const secondSession = secondDirectory.getSession()
      const originalDelete = secondSession.cache.delete.bind(secondSession.cache)
      const deleteSpy = vi
        .spyOn(secondSession.cache, 'delete')
        .mockImplementation(async (nodeKey: string) => {
          if (nodeKey === snapshotKey) {
            throw new Error(
              '[renoun] Cache store operation "delete" cannot continue because the store has been disposed.'
            )
          }

          return originalDelete(nodeKey)
        })

      try {
        const secondEntries = await secondDirectory.getEntries({
          recursive: true,
          includeIndexAndReadmeFiles: true,
        })
        const secondPaths = secondEntries
          .filter((entry): entry is File => entry instanceof File)
          .map((entry) => entry.workspacePath)
          .sort()

        expect(secondPaths).toEqual(firstPaths)
        expect(deleteSpy).toHaveBeenCalledWith(snapshotKey)
        expect(secondReadDirectory).toHaveBeenCalled()
      } finally {
        deleteSpy.mockRestore()
      }
    })
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
      expect(snapshotKeys.length).toBe(0)

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

  test('warns and falls back when strict hermetic mode detects a non-deterministic file system', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      try {
        const docsDirectory = join(tmpDirectory, 'docs')
        const workspaceDirectory = relativePath(
          getRootDirectory(),
          docsDirectory
        )
        const tsConfigPath = join(tmpDirectory, 'tsconfig.json')

        mkdirSync(docsDirectory, { recursive: true })
        writeFileSync(join(docsDirectory, 'index.mdx'), '# Home', 'utf8')
        writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

        const firstWorkerFileSystem = new NonDeterministicNodeFileSystem(
          getRootDirectory(),
          tsConfigPath
        )
        ;(firstWorkerFileSystem as { repoRoot?: string }).repoRoot =
          tmpDirectory

        const firstWorkerDirectory = new Directory({
          fileSystem: firstWorkerFileSystem,
          path: workspaceDirectory,
        })

        await firstWorkerDirectory.getEntries({
          includeIndexAndReadmeFiles: true,
        })

        const firstSession = firstWorkerDirectory.getSession()
        const snapshotKeys = Array.from(firstSession.directorySnapshots.keys())
        expect(snapshotKeys.length).toBe(1)
        firstSession.cache.clearMemory()
        expect(await firstSession.cache.get(snapshotKeys[0]!)).toBeUndefined()

        const secondWorkerFileSystem = new NonDeterministicNodeFileSystem(
          getRootDirectory(),
          tsConfigPath
        )
        ;(secondWorkerFileSystem as { repoRoot?: string }).repoRoot =
          tmpDirectory
        const secondReadDirectory = vi.spyOn(
          secondWorkerFileSystem,
          'readDirectory'
        )
        const secondWorkerDirectory = new Directory({
          fileSystem: secondWorkerFileSystem,
          path: workspaceDirectory,
        })

        await secondWorkerDirectory.getEntries({
          includeIndexAndReadmeFiles: true,
        })

        expect(secondReadDirectory).toHaveBeenCalledTimes(1)
        expect(
          warnSpy.mock.calls.filter(([message]) => {
            return (
              typeof message === 'string' &&
              message.includes(
                'Strict hermetic directory snapshot cache fell back because the file system marked persistent cache as non-deterministic.'
              )
            )
          })
        ).toHaveLength(1)
      } finally {
        warnSpy.mockRestore()
      }
    })
  })

  test('strict hermetic mode sanitizes persisted legacy dir-mtime snapshot dependencies', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)
      const workspacePathKey = normalizePathKey(workspaceDirectory)
      const cacheOutputDirectory = join(tmpDirectory, '.renoun', 'cache')

      mkdirSync(join(docsDirectory, 'guides'), { recursive: true })
      writeFileSync(join(docsDirectory, 'index.mdx'), '# Home', 'utf8')
      writeFileSync(join(docsDirectory, 'guides', 'intro.mdx'), '# Intro', 'utf8')

      const seedDirectory = new Directory({
        fileSystem: createTempNodeFileSystem(tmpDirectory),
        path: workspaceDirectory,
        cache: new Cache({
          outputDirectory: cacheOutputDirectory,
        }),
      })

      await seedDirectory.getEntries({
        includeIndexAndReadmeFiles: true,
      })

      const seedSession = seedDirectory.getSession()
      const snapshotKey = (
        await seedSession.cache.listNodeKeysByPrefix('dir:')
      ).find((key) => key.startsWith(`dir:${workspacePathKey}|`))

      expect(snapshotKey).toBeDefined()

      const persisted = await seedSession.cache.get<PersistedDirectorySnapshotV1>(
        snapshotKey!
      )

      expect(persisted).toBeDefined()

      await seedSession.cache.put(
        snapshotKey!,
        addLegacyDirectoryMtimeDeps(persisted!),
        {
          persist: true,
        }
      )
      seedSession.cache.clearMemory()

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      try {
        const strictDirectory = new Directory({
          fileSystem: createTempNodeFileSystem(tmpDirectory),
          path: workspaceDirectory,
          cache: new Cache({
            outputDirectory: cacheOutputDirectory,
            strictHermetic: true,
          }),
        })

        const entries = await strictDirectory.getEntries({
          includeIndexAndReadmeFiles: true,
        })

        expect(entries.map((entry) => entry.name)).toEqual([
          'guides',
          'index.mdx',
        ])

        const restored = await strictDirectory
          .getSession()
          .cache.get<PersistedDirectorySnapshotV1>(snapshotKey!)

        expect(restored).toBeDefined()
        expect(hasLegacyDirectoryMtimeDeps(restored!)).toBe(false)
        expect(
          warnSpy.mock.calls.some(([message]) => {
            return (
              typeof message === 'string' &&
              message.includes('legacy directory mtime dependencies')
            )
          })
        ).toBe(false)
      } finally {
        warnSpy.mockRestore()
      }
    })
  })

  test('allows opting out of strict hermetic mode with cache option override', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      try {
        const docsDirectory = join(tmpDirectory, 'docs')
        const workspaceDirectory = relativePath(
          getRootDirectory(),
          docsDirectory
        )
        const tsConfigPath = join(tmpDirectory, 'tsconfig.json')

        mkdirSync(docsDirectory, { recursive: true })
        writeFileSync(join(docsDirectory, 'index.mdx'), '# Home', 'utf8')
        writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

        const fileSystem = new NonDeterministicNodeFileSystem(
          getRootDirectory(),
          tsConfigPath
        )
        ;(fileSystem as { repoRoot?: string }).repoRoot = tmpDirectory

        const directory = new Directory({
          fileSystem,
          path: workspaceDirectory,
          cache: new Cache({
            strictHermetic: false,
          }),
        })

        await directory.getEntries({
          includeIndexAndReadmeFiles: true,
        })

        expect(
          warnSpy.mock.calls.filter(([message]) => {
            return (
              typeof message === 'string' &&
              message.includes(
                'Strict hermetic directory snapshot cache fell back because the file system marked persistent cache as non-deterministic.'
              )
            )
          })
        ).toHaveLength(0)
      } finally {
        warnSpy.mockRestore()
      }
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
          compare: (left, right) =>
            String(left).localeCompare(String(right)),
        },
      })

      await directory.getStructure()

      const session = directory.getSession()
      const nodeKey = directory.getStructureCacheKey()
      session.cache.clearMemory()

      expect(await session.cache.get(nodeKey)).toBeUndefined()
    })
  })

  test('recomputes directory structure when a callback filter changes behavior', async () => {
    const fileSystem = new InMemoryFileSystem({
      'docs/alpha.mdx': '# Alpha',
      'docs/beta.mdx': '# Beta',
    })
    let visiblePrefix = 'alpha'
    const directory = new Directory({
      fileSystem,
      path: 'docs',
      filter: (entry) => entry.name.startsWith(visiblePrefix),
    })
    const getFileRelativePaths = (
      structure: Awaited<ReturnType<Directory['getStructure']>>
    ) => {
      return structure
        .filter((entry): entry is FileStructure => entry.kind === 'File')
        .map((entry) => entry.relativePath)
        .sort()
    }

    expect(getFileRelativePaths(await directory.getStructure())).toEqual([
      'docs/alpha.mdx',
    ])

    visiblePrefix = 'beta'

    expect(getFileRelativePaths(await directory.getStructure())).toEqual([
      'docs/beta.mdx',
    ])
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
      writeFileSync(
        join(docsDirectory, 'guides', 'intro.mdx'),
        '# Intro',
        'utf8'
      )
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
        if ((await firstSession.cache.get(snapshotKey!)) === undefined) {
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

      expect(secondReadDirectory).toHaveBeenCalledTimes(2)
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
      writeFileSync(
        join(docsDirectory, 'guides', 'intro.mdx'),
        '# Intro',
        'utf8'
      )
      writeFileSync(
        join(docsDirectory, 'api', 'reference.mdx'),
        '# Reference',
        'utf8'
      )

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
        if ((await session.cache.get(guidesSnapshotKey!)) === undefined) {
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
      const affectedSnapshotPathKey = normalizePathKey(
        join(workspaceDirectory, 'guides')
      )
      const unrelatedSnapshotPathKey = normalizePathKey(
        join(workspaceDirectory, 'api')
      )

      mkdirSync(docsDirectory, { recursive: true })
      mkdirSync(join(docsDirectory, 'guides'), { recursive: true })
      mkdirSync(join(docsDirectory, 'api'), { recursive: true })
      writeFileSync(
        join(docsDirectory, 'guides', 'index.mdx'),
        '# Guides',
        'utf8'
      )
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
      const unaffectedSnapshotKey = `dir:${unrelatedSnapshotPathKey}|fallback-unrelated`
      const nonDirectoryFallbackKey = 'analysis:fallback-metadata-missing'

      await session.cache.put(
        affectedSnapshotKey,
        {
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
        },
        {
          persist: true,
          deps: [],
        }
      )

      await session.cache.put(
        unaffectedSnapshotKey,
        {
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
        },
        {
          persist: true,
          deps: [],
        }
      )
      await session.cache.put(
        nonDirectoryFallbackKey,
        {
          value: 'metadata-missing',
        },
        {
          persist: true,
          deps: [],
        }
      )

      expect(await session.cache.get(affectedSnapshotKey)).toBeDefined()
      expect(await session.cache.get(unaffectedSnapshotKey)).toBeDefined()
      expect(await session.cache.get(nonDirectoryFallbackKey)).toBeDefined()

      session.invalidatePath(join(docsDirectory, 'guides', 'index.mdx'))

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const affectedResult = await session.cache.get(affectedSnapshotKey)
        const unaffectedResult = await session.cache.get(unaffectedSnapshotKey)
        const nonDirectoryResult = await session.cache.get(
          nonDirectoryFallbackKey
        )

        if (
          affectedResult === undefined &&
          unaffectedResult !== undefined &&
          nonDirectoryResult === undefined
        ) {
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 25))
      }

      expect(await session.cache.get(affectedSnapshotKey)).toBeUndefined()
      expect(await session.cache.get(unaffectedSnapshotKey)).toBeDefined()
      expect(await session.cache.get(nonDirectoryFallbackKey)).toBeUndefined()
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

  test('refreshes stale collection sibling navigation after a development restart', async () => {
    const tmpDirectory = createTmpRenounCacheDirectory(
      'renoun-dev-collection-navigation-'
    )
    const previousNodeEnv = process.env.NODE_ENV
    let seedFileSystem: ReturnType<typeof createTempNodeFileSystem> | undefined
    let devFileSystem: ReturnType<typeof createTempNodeFileSystem> | undefined

    process.env.NODE_ENV = 'development'
    disposeDefaultCacheStorePersistence()

    try {
      const docsDirectory = join(tmpDirectory, 'docs')
      const workspaceDirectory = relativePath(getRootDirectory(), docsDirectory)

      mkdirSync(docsDirectory, { recursive: true })
      writeFileSync(join(docsDirectory, 'a.mdx'), '# Alpha', 'utf8')
      writeFileSync(join(docsDirectory, 'c.mdx'), '# Gamma', 'utf8')

      seedFileSystem = createTempNodeFileSystem(tmpDirectory)
      const seedDirectory = new Directory({
        fileSystem: seedFileSystem,
        path: workspaceDirectory,
      })
      const seedCollection = new Collection({ entries: [seedDirectory] })
      const seedFile = await seedDirectory.getFile('c', 'mdx')
      const [seedPrevious, seedNext] = await seedFile.getSiblings({
        collection: seedCollection,
      })
      expect(seedPrevious?.baseName).toBe('a')
      expect(seedNext).toBeUndefined()

      writeFileSync(join(docsDirectory, 'b.mdx'), '# Beta', 'utf8')
      await waitForMilliseconds(300)

      devFileSystem = createTempNodeFileSystem(tmpDirectory)
      const devDirectory = new Directory({
        fileSystem: devFileSystem,
        path: workspaceDirectory,
      })
      const devCollection = new Collection({ entries: [devDirectory] })
      const devFile = await devDirectory.getFile('c', 'mdx')

      const [initialPrevious, initialNext] = await devFile.getSiblings({
        collection: devCollection,
      })
      expect(initialPrevious?.baseName).toBe('a')
      expect(initialNext).toBeUndefined()

      const deadline = Date.now() + 3_000
      let refreshedPrevious = initialPrevious

      while (refreshedPrevious?.baseName !== 'b' && Date.now() < deadline) {
        await waitForMilliseconds(50)
        ;[refreshedPrevious] = await devFile.getSiblings({
          collection: devCollection,
        })
      }

      expect(refreshedPrevious?.baseName).toBe('b')
    } finally {
      if (seedFileSystem) {
        Session.reset(seedFileSystem)
      }
      if (devFileSystem) {
        Session.reset(devFileSystem)
      }
      disposeDefaultCacheStorePersistence()
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = previousNodeEnv
      }
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
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
        typeResolverSpy.mockImplementation(async function (
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

  test('reuses persisted export types across worker sessions despite workspace token changes', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')

      class StableTokenExportTypeNodeFileSystem extends NestedCwdNodeFileSystem {
        #workspaceChangeToken: string

        constructor(token: string) {
          super(
            getRootDirectory(),
            tsConfigPath,
            join(tmpDirectory, '.renoun', 'cache')
          )
          this.#workspaceChangeToken = token
        }

        override async getWorkspaceChangeToken(
          _rootPath: string
        ): Promise<string> {
          return this.#workspaceChangeToken
        }
      }

      const createWorkerFileSystem = (token: string) => {
        const fileSystem = new StableTokenExportTypeNodeFileSystem(token)
        ;(fileSystem as { repoRoot?: string }).repoRoot = tmpDirectory
        return fileSystem
      }

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

      const exportResolverSpy = vi.spyOn(
        NodeFileSystem.prototype,
        'resolveFileExportsWithDependencies'
      )
      const resolveTypesForDependency = (dependencyContent: string) => {
        if (dependencyContent.includes('count')) {
          return [
            {
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
          ]
        }

        return [
          {
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
        ]
      }

      try {
        exportResolverSpy.mockImplementation(async function (
          this: NodeFileSystem,
          filePath: string,
          _filter?: unknown
        ): Promise<any> {
          const dependencyPath = resolvePath(dirname(filePath), 'b.ts')
          const dependencyContent = await this.readFile(dependencyPath)

          return {
            resolvedTypes: resolveTypesForDependency(dependencyContent),
            dependencies: [filePath, dependencyPath],
          }
        })

        const firstWorkerDirectory = new Directory({
          fileSystem: createWorkerFileSystem('stable-token'),
          path: tmpDirectory,
        })
        const firstFile = await firstWorkerDirectory.getFile('a', 'ts')
        const firstTypes = await firstFile.getExportTypes()
        const firstSerializedTypes = JSON.stringify(firstTypes)

        expect(firstTypes).toHaveLength(1)

        const secondWorkerDirectory = new Directory({
          fileSystem: createWorkerFileSystem('stable-token'),
          path: tmpDirectory,
        })
        const secondFile = await secondWorkerDirectory.getFile('a', 'ts')
        const secondTypes = await secondFile.getExportTypes()

        expect(JSON.stringify(secondTypes)).toBe(firstSerializedTypes)
        expect(exportResolverSpy).toHaveBeenCalledTimes(1)

        const thirdWorkerDirectory = new Directory({
          fileSystem: createWorkerFileSystem('stable-token-next'),
          path: tmpDirectory,
        })
        const thirdFile = await thirdWorkerDirectory.getFile('a', 'ts')
        const thirdTypes = await thirdFile.getExportTypes()

        expect(JSON.stringify(thirdTypes)).toBe(firstSerializedTypes)
        expect(exportResolverSpy).toHaveBeenCalledTimes(1)

        writeFileSync(
          join(tmpDirectory, 'b.ts'),
          'export type Value = { count: number; total: number }',
          'utf8'
        )

        const fourthWorkerDirectory = new Directory({
          fileSystem: createWorkerFileSystem('stable-token-build-output'),
          path: tmpDirectory,
        })
        const fourthFile = await fourthWorkerDirectory.getFile('a', 'ts')
        const fourthTypes = await fourthFile.getExportTypes()

        expect(JSON.stringify(fourthTypes)).not.toBe(firstSerializedTypes)
        expect(exportResolverSpy).toHaveBeenCalledTimes(2)
      } finally {
        exportResolverSpy.mockRestore()
      }
    })
  })

  test('reuses persisted reference data across worker sessions despite workspace token changes', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')
      const referenceDataCacheDirectory = join(tmpDirectory, '.renoun', 'cache')
      const moduleExportMetadata: Record<string, GitExportMetadata> = {
        Metadata: {
          firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
          lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
          firstCommitHash: 'a1',
          lastCommitHash: 'b1',
        },
      }
      let fileExportCalls = 0
      let moduleMetadataCalls = 0
      let fileMetadataCalls = 0
      let exportTypeCalls = 0

      class StableTokenReferenceDataNodeFileSystem extends NodeFileSystem {
        readonly #workspaceChangeToken: string

        constructor(token: string) {
          super({
            tsConfigPath,
            outputDirectory: referenceDataCacheDirectory,
          })
          this.#workspaceChangeToken = token
        }

        override getAbsolutePath(path: string): string {
          return resolvePath(tmpDirectory, path)
        }

        override isFilePathGitIgnored(_filePath: string): boolean {
          return false
        }

        override async getWorkspaceChangeToken(
          _rootPath: string
        ): Promise<string> {
          return this.#workspaceChangeToken
        }

        override async getGitFileMetadata(_path: string): Promise<GitMetadata> {
          fileMetadataCalls += 1
          return {
            authors: [
              {
                name: 'Ada',
                commitCount: 1,
                firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
                lastCommitDate: new Date('2024-01-01T00:00:00.000Z'),
              },
            ],
            firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
            lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
          }
        }

        override async getModuleMetadata(path: string): Promise<GitModuleMetadata> {
          moduleMetadataCalls += 1

          return {
            kind: 'module',
            path: normalizePathKey(path),
            ref: 'head',
            refCommit: 'head',
            authors: [
              {
                name: 'Ada',
                commitCount: 1,
                firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
                lastCommitDate: new Date('2024-01-01T00:00:00.000Z'),
              },
            ],
            firstCommitDate: '2024-01-01T00:00:00.000Z',
            lastCommitDate: '2024-02-01T00:00:00.000Z',
            exports: moduleExportMetadata,
          }
        }

        override async getFileExports(filePath: string): Promise<any[]> {
          fileExportCalls += 1

          return NodeFileSystem.prototype.getFileExports.call(this, filePath)
        }

        override async resolveFileExportsWithDependencies(
          _filePath: string
        ): Promise<any> {
          exportTypeCalls += 1

          return {
            resolvedTypes: [
              {
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
            ],
            dependencies: [resolvePath(tmpDirectory, 'a.ts')],
          }
        }
      }

      const createWorkerFileSystem = (token: string) =>
        new StableTokenReferenceDataNodeFileSystem(token)

      writeFileSync(
        join(tmpDirectory, 'a.ts'),
        'export type Metadata = { name: string }',
        'utf8'
      )

      const readReferenceData = async (token: string) => {
        const directory = new Directory({
          fileSystem: createWorkerFileSystem(token),
          path: tmpDirectory,
        })
        const file = await directory.getFile('a', 'ts')
        const exports = await file.getExports()

        return {
          lastCommitDate: await file.getLastCommitDate(),
          exportFirstCommitDates: await Promise.all(
            exports.map((entry) => entry.getFirstCommitDate())
          ),
          exportTypes: await file.getExportTypes(),
        }
      }

      const firstResult = await readReferenceData('stable-token')
      const secondResult = await readReferenceData('stable-token')

      expect(firstResult.lastCommitDate?.toISOString()).toBe(
        '2024-02-01T00:00:00.000Z'
      )
      expect(
        firstResult.exportFirstCommitDates[0]?.toISOString()
      ).toBe('2024-01-01T00:00:00.000Z')
      expect(firstResult.exportTypes).toHaveLength(1)
      expect(secondResult.lastCommitDate?.toISOString()).toBe(
        '2024-02-01T00:00:00.000Z'
      )
      expect(fileExportCalls).toBe(1)
      expect(moduleMetadataCalls).toBe(1)
      expect(fileMetadataCalls).toBe(0)
      expect(exportTypeCalls).toBe(1)

      const thirdResult = await readReferenceData('stable-token-next')

      expect(thirdResult.lastCommitDate?.toISOString()).toBe(
        '2024-02-01T00:00:00.000Z'
      )
      expect(moduleMetadataCalls).toBe(1)
      expect(fileMetadataCalls).toBe(0)
      expect(exportTypeCalls).toBe(1)
    })
  })

  test('reuses persisted reference base data after the snapshot-scoped exports child is evicted', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')
      const referenceDataCacheDirectory = join(tmpDirectory, '.renoun', 'cache')
      let fileExportCalls = 0
      let moduleMetadataCalls = 0

      class StableTokenReferenceDataNodeFileSystem extends NodeFileSystem {
        readonly #workspaceChangeToken: string

        constructor(token: string) {
          super({
            tsConfigPath,
            outputDirectory: referenceDataCacheDirectory,
          })
          this.#workspaceChangeToken = token
        }

        override getAbsolutePath(path: string): string {
          return resolvePath(tmpDirectory, path)
        }

        override isFilePathGitIgnored(_filePath: string): boolean {
          return false
        }

        override async getWorkspaceChangeToken(
          _rootPath: string
        ): Promise<string> {
          return this.#workspaceChangeToken
        }

        override async getModuleMetadata(path: string): Promise<GitModuleMetadata> {
          moduleMetadataCalls += 1

          return {
            kind: 'module',
            path: normalizePathKey(path),
            ref: 'head',
            refCommit: 'head',
            authors: [
              {
                name: 'Ada',
                commitCount: 1,
                firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
                lastCommitDate: new Date('2024-01-01T00:00:00.000Z'),
              },
            ],
            firstCommitDate: '2024-01-01T00:00:00.000Z',
            lastCommitDate: '2024-02-01T00:00:00.000Z',
            exports: {
              Metadata: {
                firstCommitDate: new Date('2024-01-01T00:00:00.000Z'),
                lastCommitDate: new Date('2024-02-01T00:00:00.000Z'),
                firstCommitHash: 'a1',
                lastCommitHash: 'b1',
              },
            },
          }
        }

        override async getFileExports(filePath: string): Promise<any[]> {
          fileExportCalls += 1
          return NodeFileSystem.prototype.getFileExports.call(this, filePath)
        }
      }

      writeFileSync(
        join(tmpDirectory, 'a.ts'),
        'export type Metadata = { name: string }',
        'utf8'
      )

      const createWorkerDirectory = (token: string) =>
        new Directory({
          fileSystem: new StableTokenReferenceDataNodeFileSystem(token),
          path: tmpDirectory,
        })

      const firstDirectory = createWorkerDirectory('stable-token')
      const firstFile = await firstDirectory.getFile('a', 'ts')
      await firstFile.getLastCommitDate()

      expect(fileExportCalls).toBe(1)
      expect(moduleMetadataCalls).toBe(1)

      const firstSession = firstDirectory.getSession()
      const exportsNodeKey = createCacheNodeKey('js.exports', {
        version: FS_ANALYSIS_CACHE_VERSION,
        dependencyVersion: 3,
        snapshot: firstSession.snapshot.id,
        filePath: normalizePathKey(firstFile.absolutePath),
      })

      await firstSession.cache.delete(exportsNodeKey)

      const secondDirectory = createWorkerDirectory('stable-token-next')
      const secondFile = await secondDirectory.getFile('a', 'ts')
      const lastCommitDate = await secondFile.getLastCommitDate()

      expect(lastCommitDate?.toISOString()).toBe('2024-02-01T00:00:00.000Z')
      expect(fileExportCalls).toBe(1)
      expect(moduleMetadataCalls).toBe(1)
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
  }, 30_000)

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
      rmSync(tmpDirectory, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 50,
      })
    }
  })

  test('reuses persisted entries without dependency content checks when workspace token is unchanged', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const sourceFilePath = join(tmpDirectory, 'docs', 'index.ts')
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')
      mkdirSync(dirname(sourceFilePath), { recursive: true })
      writeFileSync(sourceFilePath, 'export const value = 1', 'utf8')
      writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:workspace-token-fast-path-unchanged'

      const firstFileSystem = new TokenAwareNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        'stable-token'
      )
      const firstSnapshot = new FileSystemSnapshot(
        firstFileSystem,
        'workspace-token-fast-path-first'
      )
      const firstStore = new CacheStore({
        snapshot: firstSnapshot,
        persistence,
      })
      await firstStore.getOrCompute(
        nodeKey,
        { persist: true },
        async (context) => {
          await context.recordFileDep(sourceFilePath)
          return { value: 1 }
        }
      )

      const secondFileSystem = new TokenAwareNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        'stable-token'
      )
      const secondReadBinary = vi.spyOn(secondFileSystem, 'readFileBinary')
      const secondSnapshot = new FileSystemSnapshot(
        secondFileSystem,
        'workspace-token-fast-path-second'
      )
      const secondStore = new CacheStore({
        snapshot: secondSnapshot,
        persistence,
      })

      const value = await secondStore.get(nodeKey)

      expect(value).toEqual({ value: 1 })
      expect(secondReadBinary).toHaveBeenCalledTimes(0)
    })
  })

  test('falls back to dependency content checks for ignored file dependencies when workspace token is unchanged', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const sourceFilePath = join(tmpDirectory, 'docs', 'ignored.ts')
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')
      mkdirSync(dirname(sourceFilePath), { recursive: true })
      writeFileSync(sourceFilePath, 'export const value = 1', 'utf8')
      writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:workspace-token-fast-path-ignored-file'

      const createWorkerFileSystem = () => {
        const fileSystem = new TokenAwareNodeFileSystem(
          getRootDirectory(),
          tsConfigPath,
          'stable-token'
        )
        vi.spyOn(fileSystem, 'isFilePathGitIgnored').mockImplementation(
          (filePath) => normalizePathKey(filePath).endsWith('docs/ignored.ts')
        )
        return fileSystem
      }

      const firstFileSystem = createWorkerFileSystem()
      const firstSnapshot = new FileSystemSnapshot(
        firstFileSystem,
        'workspace-token-ignored-first'
      )
      const firstStore = new CacheStore({
        snapshot: firstSnapshot,
        persistence,
      })
      await firstStore.getOrCompute(
        nodeKey,
        { persist: true },
        async (context) => {
          await context.recordFileDep(sourceFilePath)
          return { value: 1 }
        }
      )

      writeFileSync(sourceFilePath, 'export const value = 2', 'utf8')

      const secondFileSystem = createWorkerFileSystem()
      const secondReadBinary = vi.spyOn(secondFileSystem, 'readFileBinary')
      const secondSnapshot = new FileSystemSnapshot(
        secondFileSystem,
        'workspace-token-ignored-second'
      )
      const secondStore = new CacheStore({
        snapshot: secondSnapshot,
        persistence,
      })

      let computeCount = 0
      const value = await secondStore.getOrCompute(
        nodeKey,
        { persist: true },
        async (context) => {
          computeCount += 1
          await context.recordFileDep(sourceFilePath)
          return { value: 2 }
        }
      )

      expect(value).toEqual({ value: 2 })
      expect(computeCount).toBe(1)
      expect(secondReadBinary.mock.calls.length).toBeGreaterThan(0)
    })
  })

  test('falls back to dependency freshness checks when workspace token changes on intersecting paths', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const sourceFilePath = join(tmpDirectory, 'docs', 'index.ts')
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')
      mkdirSync(dirname(sourceFilePath), { recursive: true })
      writeFileSync(sourceFilePath, 'export const value = 1', 'utf8')
      writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:workspace-token-fast-path-intersecting'

      const firstFileSystem = new TokenAwareNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        'stable-token'
      )
      const firstSnapshot = new FileSystemSnapshot(
        firstFileSystem,
        'workspace-token-intersection-first'
      )
      const firstStore = new CacheStore({
        snapshot: firstSnapshot,
        persistence,
      })
      await firstStore.getOrCompute(
        nodeKey,
        { persist: true },
        async (context) => {
          await context.recordFileDep(sourceFilePath)
          return { value: 1 }
        }
      )
      const previousToken =
        (await firstSnapshot.getWorkspaceChangeToken?.('.')) ?? null
      const relativeSourcePath = normalizePathKey(
        firstSnapshot.getRelativePathToWorkspace(sourceFilePath)
      )

      writeFileSync(sourceFilePath, 'export const value = 2', 'utf8')

      const secondFileSystem = new TokenAwareNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        'updated-token'
      )
      if (previousToken) {
        secondFileSystem.setChangedPathsSinceToken('.', previousToken, [
          relativeSourcePath,
        ])
      }
      const secondReadBinary = vi.spyOn(secondFileSystem, 'readFileBinary')
      const secondSnapshot = new FileSystemSnapshot(
        secondFileSystem,
        'workspace-token-intersection-second'
      )
      const secondStore = new CacheStore({
        snapshot: secondSnapshot,
        persistence,
      })

      let computeCount = 0
      const value = await secondStore.getOrCompute(
        nodeKey,
        { persist: true },
        async (context) => {
          computeCount += 1
          await context.recordFileDep(sourceFilePath)
          return { value: 2 }
        }
      )

      expect(value).toEqual({ value: 2 })
      expect(computeCount).toBe(1)
      expect(secondReadBinary.mock.calls.length).toBeGreaterThan(0)
    })
  })

  test('treats generated analysis cache paths as workspace-token-unsafe and reuses persisted entries through unrelated .next churn', async () => {
    await withProductionSqliteCache(async (tmpDirectory) => {
      const sourceFilePath = join(
        tmpDirectory,
        '.next',
        'cache',
        'renoun',
        'git',
        '_analysis',
        'repo',
        'commit',
        'src',
        'nodes',
        'utils',
        'MemberNode.js'
      )
      const tsConfigPath = join(tmpDirectory, 'tsconfig.json')
      mkdirSync(dirname(sourceFilePath), { recursive: true })
      writeFileSync(sourceFilePath, 'export const value = 1', 'utf8')
      writeFileSync(tsConfigPath, '{"compilerOptions":{}}', 'utf8')

      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:workspace-token-fast-path-generated-analysis'

      const firstFileSystem = new TokenAwareNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        'stable-token'
      )
      const firstSnapshot = new FileSystemSnapshot(
        firstFileSystem,
        'workspace-token-generated-analysis-first'
      )
      const firstStore = new CacheStore({
        snapshot: firstSnapshot,
        persistence,
      })
      await firstStore.getOrCompute(
        nodeKey,
        { persist: true },
        async (context) => {
          await context.recordFileDep(sourceFilePath)
          return { value: 1 }
        }
      )
      const previousToken =
        (await firstSnapshot.getWorkspaceChangeToken?.('.')) ?? null
      expect(previousToken).toBeTruthy()

      const secondFileSystem = new TokenAwareNodeFileSystem(
        getRootDirectory(),
        tsConfigPath,
        'next-build-token'
      )
      secondFileSystem.setChangedPathsSinceToken('.', previousToken!, [
        normalizePathKey(join(tmpDirectory, '.next', 'server', 'app', 'page.js')),
      ])
      const secondReadBinary = vi.spyOn(secondFileSystem, 'readFileBinary')
      const secondSnapshot = new FileSystemSnapshot(
        secondFileSystem,
        'workspace-token-generated-analysis-second'
      )
      const secondStore = new CacheStore({
        snapshot: secondSnapshot,
        persistence,
      })

      let computeCount = 0
      const value = await secondStore.getOrCompute(
        nodeKey,
        { persist: true },
        async (context) => {
          computeCount += 1
          await context.recordFileDep(sourceFilePath)
          return { value: 2 }
        }
      )

      expect(value).toEqual({ value: 1 })
      expect(computeCount).toBe(0)
      expect(secondReadBinary.mock.calls.length).toBeGreaterThan(0)
    })
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
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-touch-throttle-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-touch-throttle'
      )
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
        preparedStatementCacheMax: 64,
        structuredIdCacheEnabled: true,
      })
      await first.load('test:options:warmup')
      const second = getCacheStorePersistence({
        dbPath,
        maxRows: 10,
        maxAgeMs: 1_000,
        preparedStatementCacheMax: 64,
        structuredIdCacheEnabled: true,
      })

      expect(second).toBe(first)

      expect(() =>
        getCacheStorePersistence({
          dbPath,
          maxRows: 20,
          maxAgeMs: 1_000,
          preparedStatementCacheMax: 64,
          structuredIdCacheEnabled: true,
        })
      ).toThrow(/already initialized with different options/)

      expect(() =>
        getCacheStorePersistence({
          dbPath,
          maxRows: 10,
          maxAgeMs: 1_000,
          preparedStatementCacheMax: 32,
          structuredIdCacheEnabled: true,
        })
      ).toThrow(/already initialized with different options/)

      expect(() =>
        getCacheStorePersistence({
          dbPath,
          maxRows: 10,
          maxAgeMs: 1_000,
          preparedStatementCacheMax: 64,
          structuredIdCacheEnabled: false,
        })
      ).toThrow(/already initialized with different options/)
    } finally {
      disposeCacheStorePersistence({ dbPath })
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('stays unavailable after disposal while initialization is still in flight', async () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-dispose-'))
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')

    try {
      const first = getCacheStorePersistence({ dbPath })
      disposeCacheStorePersistence({ dbPath })

      await new Promise((resolve) => setTimeout(resolve, 500))

      expect(first.isAvailable()).toBe(false)

      const second = getCacheStorePersistence({ dbPath })
      expect(second).not.toBe(first)

      await expect(second.load('test:dispose-race')).resolves.toBeUndefined()
    } finally {
      disposeCacheStorePersistence({ dbPath })
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('preserves persisted rows when schema version changes', async () => {
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

      expect(computeCount).toBe(1)
      expect(await secondStore.get(nodeKey)).toEqual({ value: 1 })
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('migrates frozen legacy sqlite fixture and drops incompatible persisted rows', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-schema-fixture-')
    )
    const fixtureSqlPath = join(
      getRootDirectory(),
      'packages',
      'renoun',
      'fixtures',
      'cache',
      'sqlite-schema-v1.sql'
    )
    const telemetryHistograms: Array<{
      name: string
      value: number
      tags?: Record<string, string>
    }> = []
    setGlobalTelemetry({
      enabled() {
        return true
      },
      emit() {},
      histogram(name, value, tags) {
        telemetryHistograms.push({
          name,
          value,
          tags,
        })
      },
      counter() {},
    })

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fixtureSql = readFileSync(fixtureSqlPath, 'utf8')
      const sqliteModule = (await import('node:sqlite')) as {
        DatabaseSync?: new (path: string) => any
      }
      const DatabaseSync = sqliteModule.DatabaseSync
      if (!DatabaseSync) {
        throw new Error('node:sqlite DatabaseSync is unavailable')
      }

      const setupDb = new DatabaseSync(dbPath)
      const legacyWarmNodeKey = 'test:legacy:warm-start'
      const legacyDepsNodeKey = 'test:legacy:deps'
      const warmValue = { marker: 'warm-start', value: 42 }
      const depValue = { marker: 'legacy-deps', value: 7 }
      const seededUpdatedAt = Date.now()
      try {
        setupDb.exec(fixtureSql)
        setupDb
          .prepare(
            `
              UPDATE cache_entries
              SET value_blob = ?, updated_at = ?
              WHERE node_key = ?
            `
          )
          .run(serialize(warmValue), seededUpdatedAt, legacyWarmNodeKey)
        setupDb
          .prepare(
            `
              UPDATE cache_entries
              SET value_blob = ?, updated_at = ?
              WHERE node_key = ?
            `
          )
          .run(serialize(depValue), seededUpdatedAt, legacyDepsNodeKey)
      } finally {
        setupDb.close()
      }

      const initializeStartedAt = Date.now()
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const loadedWarmEntry = await persistence.load(legacyWarmNodeKey, {
        skipLastAccessedUpdate: true,
      })
      const initializeDurationMs = Date.now() - initializeStartedAt

      expect(loadedWarmEntry).toBeUndefined()
      expect(initializeDurationMs).toBeLessThan(2_000)

      const verifyDb = new DatabaseSync(dbPath)
      try {
        const legacyDepsTable = verifyDb
          .prepare(
            `
              SELECT name
              FROM sqlite_master
              WHERE type = 'table' AND name = 'cache_deps'
            `
          )
          .get()
        expect(legacyDepsTable).toBeUndefined()

        const migratedDepRow = verifyDb
          .prepare(
            `
              SELECT dep_term_id
              FROM cache_entry_deps_v2
              WHERE node_key = ? AND dep_key = ?
            `
          )
          .get(legacyDepsNodeKey, 'file:/fixture/dep.ts') as
          | { dep_term_id?: unknown }
          | undefined
        expect(Number(migratedDepRow?.dep_term_id ?? 0)).toBeGreaterThan(0)

        const migratedWarmRow = verifyDb
          .prepare(
            `
              SELECT persist, revision, last_accessed_at
              FROM cache_entries
              WHERE node_key = ?
            `
          )
          .get(legacyWarmNodeKey) as
          | {
              persist?: unknown
              revision?: unknown
              last_accessed_at?: unknown
            }
          | undefined
        expect(migratedWarmRow).toBeUndefined()
      } finally {
        verifyDb.close()
      }

      const store = new CacheStore({
        snapshot: new FileSystemSnapshot(
          new InMemoryFileSystem({}),
          'sqlite-schema-fixture'
        ),
        persistence,
      })
      let computeCount = 0
      const warmStartValue = await store.getOrCompute(
        legacyWarmNodeKey,
        { persist: true },
        async () => {
          computeCount += 1
          return { marker: 'recomputed', value: 0 }
        }
      )

      expect(warmStartValue).toEqual({ marker: 'recomputed', value: 0 })
      expect(computeCount).toBe(1)

      const migrationHistogram = telemetryHistograms.find((histogram) => {
        return histogram.name === 'renoun.cache.sqlite.schema_migration_ms'
      })
      expect(migrationHistogram).toBeDefined()
      expect(migrationHistogram?.tags?.from).toBe('1')
      expect((migrationHistogram?.value ?? 0) >= 0).toBe(true)
      expect(migrationHistogram?.value ?? 0).toBeLessThan(2_000)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('falls back to in-memory mode when sqlite initialization fails', async () => {
    const telemetryCounters: Array<{
      name: string
      value: number
      tags?: Record<string, string>
    }> = []
    const telemetry: Telemetry = {
      enabled() {
        return true
      },
      emit() {},
      counter(name, value = 1, tags) {
        telemetryCounters.push({
          name,
          value,
          tags,
        })
      },
    }
    setGlobalTelemetry(telemetry)

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
    expect(firstStore.usesPersistentCache).toBe(false)

    const secondStore = new CacheStore({ snapshot, persistence })
    await secondStore.getOrCompute(nodeKey, { persist: true }, async (ctx) => {
      computeCount += 1
      await ctx.recordFileDep('/index.ts')
      return { value: 2 }
    })
    expect(secondStore.usesPersistentCache).toBe(false)

    expect(computeCount).toBe(2)
    expect(
      telemetryCounters.some(
        (counter) =>
          counter.name === 'renoun.cache.sqlite.fallback_to_memory_count'
      )
    ).toBe(true)
  })

  test('auto-resets malformed sqlite cache files once before falling back', async () => {
    const telemetryCounters: Array<{
      name: string
      value: number
      tags?: Record<string, string>
    }> = []
    const telemetry: Telemetry = {
      enabled() {
        return true
      },
      emit() {},
      counter(name, value = 1, tags) {
        telemetryCounters.push({
          name,
          value,
          tags,
        })
      },
    }
    setGlobalTelemetry(telemetry)

    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-auto-reset-'))

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      writeFileSync(dbPath, 'this is not sqlite', 'utf8')
      writeFileSync(`${dbPath}-wal`, 'stale wal', 'utf8')
      writeFileSync(`${dbPath}-shm`, 'stale shm', 'utf8')

      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:sqlite-auto-reset'
      await persistence.save(nodeKey, {
        value: { value: 'recovered' },
        deps: [{ depKey: 'const:auto-reset:1', depVersion: '1' }],
        fingerprint: createFingerprint([
          { depKey: 'const:auto-reset:1', depVersion: '1' },
        ]),
        persist: true,
        updatedAt: Date.now(),
      })

      expect(await persistence.load(nodeKey)).toBeDefined()
      expect(readFileSync(dbPath).subarray(0, 15).toString('utf8')).toBe(
        'SQLite format 3'
      )
      expect(
        telemetryCounters.some(
          (counter) => counter.name === 'renoun.cache.sqlite.auto_reset_count'
        )
      ).toBe(true)
      persistence.close()
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('runs sqlite checkpoint and vacuum maintenance without clearing persisted rows', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-maintenance-explicit-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:sqlite-maintenance-explicit'
      await persistence.save(nodeKey, {
        value: { value: 1 },
        deps: [{ depKey: 'const:maintenance:1', depVersion: '1' }],
        fingerprint: createFingerprint([
          { depKey: 'const:maintenance:1', depVersion: '1' },
        ]),
        persist: true,
        updatedAt: Date.now(),
      })

      const result = await persistence.runMaintenance({
        checkpoint: true,
        quickCheck: true,
        integrityCheck: true,
        vacuum: true,
        checkpointMode: 'PASSIVE',
      })

      expect(result.available).toBe(true)
      expect(result.checkpoint.executed).toBe(true)
      expect(result.checkpoint.mode).toBe('PASSIVE')
      expect(result.quickCheck.executed).toBe(true)
      expect(result.quickCheck.ok).toBe(true)
      expect(result.integrityCheck.executed).toBe(true)
      expect(result.integrityCheck.ok).toBe(true)
      expect(result.vacuum.executed).toBe(true)
      expect(await persistence.load(nodeKey)).toBeDefined()
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('uses checkpoint-on and vacuum-off defaults for sqlite maintenance', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-maintenance-defaults-')
    )

    try {
      const result = await runSqliteCacheMaintenance({
        dbPath: join(tmpDirectory, 'fs-cache.sqlite'),
      })

      expect(result.available).toBe(true)
      expect(result.checkpoint.executed).toBe(true)
      expect(result.vacuum.executed).toBe(false)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('throws when project root resolves to filesystem root', () => {
    expect(() => getDefaultCacheDatabasePath('/')).toThrow(
      /filesystem root "\/"/
    )
  })

  test('stores app-mode sqlite cache under the project root instead of the runtime directory', () => {
    const tmpDirectory = createTmpRenounCacheDirectory(
      'renoun-cache-app-runtime-root-'
    )
    const projectRoot = join(tmpDirectory, 'project')
    const runtimeRoot = join(projectRoot, '.renoun', 'app', '-renoun-blog')
    const previousRuntimeDirectory = process.env.RENOUN_RUNTIME_DIRECTORY

    mkdirSync(runtimeRoot, { recursive: true })
    writeFileSync(
      join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'cache-app-runtime-root-test', private: true }),
      'utf8'
    )

    try {
      process.env.RENOUN_RUNTIME_DIRECTORY = runtimeRoot

      const expectedDbPath = join(
        projectRoot,
        '.renoun',
        'cache',
        'fs-cache.sqlite'
      )

      expect(getDefaultCacheDatabasePath()).toBe(expectedDbPath)
      expect(getDefaultCacheDatabasePath(runtimeRoot)).toBe(expectedDbPath)

      const projectPersistence = getCacheStorePersistence({ projectRoot })
      const runtimePersistence = getCacheStorePersistence({
        projectRoot: runtimeRoot,
      })

      expect(runtimePersistence).toBe(projectPersistence)
    } finally {
      if (previousRuntimeDirectory === undefined) {
        delete process.env.RENOUN_RUNTIME_DIRECTORY
      } else {
        process.env.RENOUN_RUNTIME_DIRECTORY = previousRuntimeDirectory
      }

      disposeCacheStorePersistence({ projectRoot })
      disposeCacheStorePersistence({ projectRoot: runtimeRoot })
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('stores Next app sqlite persistence under the app .next/cache/renoun directory', () => {
    const tmpDirectory = mkdtempSync(join(tmpdir(), 'renoun-cache-next-app-'))
    const workspaceRoot = join(tmpDirectory, 'workspace')
    const appRoot = join(workspaceRoot, 'apps', 'site')

    mkdirSync(join(appRoot, 'app'), { recursive: true })
    writeFileSync(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({
        name: 'renoun-cache-next-workspace',
        private: true,
        workspaces: ['apps/*'],
      }),
      'utf8'
    )
    writeFileSync(
      join(appRoot, 'package.json'),
      JSON.stringify({
        name: 'renoun-cache-next-app',
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
        expect(getDefaultCacheDatabasePath()).toBe(
          join(
            canonicalAppRoot,
            '.next',
            'cache',
            'renoun',
            'fs-cache.sqlite'
          )
        )
      })
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('uses the Next app .next/cache/renoun directory when projectRoot is passed directly', () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-next-project-root-')
    )
    const workspaceRoot = join(tmpDirectory, 'workspace')
    const appRoot = join(workspaceRoot, 'apps', 'site')

    mkdirSync(join(appRoot, 'app'), { recursive: true })
    writeFileSync(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({
        name: 'renoun-cache-next-project-root-workspace',
        private: true,
        workspaces: ['apps/*'],
      }),
      'utf8'
    )
    writeFileSync(
      join(appRoot, 'package.json'),
      JSON.stringify({
        name: 'renoun-cache-next-project-root-app',
        private: true,
        dependencies: {
          next: '15.0.0',
        },
      }),
      'utf8'
    )

    try {
      const canonicalAppRoot = realpathSync(appRoot)
      expect(getDefaultCacheDatabasePath(appRoot)).toBe(
        join(
          canonicalAppRoot,
          '.next',
          'cache',
          'renoun',
          'fs-cache.sqlite'
        )
      )
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('collapses cached Next descendants back to the app root for sqlite persistence', () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-next-descendant-')
    )
    const workspaceRoot = join(tmpDirectory, 'workspace')
    const appRoot = join(workspaceRoot, 'apps', 'site')
    const cachedRepoRoot = join(
      appRoot,
      '.next',
      'cache',
      'renoun',
      'git',
      'repo'
    )

    mkdirSync(join(appRoot, 'app'), { recursive: true })
    mkdirSync(join(appRoot, '.next'), { recursive: true })
    mkdirSync(cachedRepoRoot, { recursive: true })
    writeFileSync(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({
        name: 'renoun-cache-next-descendant-workspace',
        private: true,
        workspaces: ['apps/*'],
      }),
      'utf8'
    )
    writeFileSync(
      join(appRoot, 'package.json'),
      JSON.stringify({
        name: 'renoun-cache-next-descendant-app',
        private: true,
        dependencies: {
          next: '15.0.0',
        },
      }),
      'utf8'
    )
    writeFileSync(
      join(appRoot, '.next', 'package.json'),
      JSON.stringify({
        name: 'next-runtime-output',
        private: true,
      }),
      'utf8'
    )

    try {
      const canonicalAppRoot = realpathSync(appRoot)
      const expectedDbPath = join(
        canonicalAppRoot,
        '.next',
        'cache',
        'renoun',
        'fs-cache.sqlite'
      )

      withWorkingDirectory(cachedRepoRoot, () => {
        expect(getDefaultCacheDatabasePath()).toBe(expectedDbPath)
      })
      expect(getDefaultCacheDatabasePath(cachedRepoRoot)).toBe(expectedDbPath)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('allows overriding the sqlite cache directory from a Directory option', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-explicit-directory-')
    )
    const cacheDirectory = join(tmpDirectory, 'custom-cache')
    const cache = new Cache({
      outputDirectory: cacheDirectory,
    })
    const directory = new Directory({
      cache,
    })
    const fileSystem = directory.getFileSystem()

    try {
      const session = Session.for(fileSystem, undefined, cache)
      const value = await session.cache.getOrCompute(
        'test:explicit-sqlite-cache-directory',
        { persist: true },
        async () => 'persisted'
      )

      expect(value).toBe('persisted')
      expect(existsSync(join(cacheDirectory, 'fs-cache.sqlite'))).toBe(true)
    } finally {
      Session.reset(fileSystem)
      disposeCacheStorePersistence({ cacheDirectory })
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
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
    Reflect.set(realFileSystem, 'repoRoot', realRoot)
    Reflect.set(aliasFileSystem, 'repoRoot', aliasRoot)

    try {
      const realSession = Session.for(realFileSystem)
      const aliasSession = Session.for(aliasFileSystem)
      const nodeKey = `test:session-root-alias:${normalizePathKey(tmpDirectory)}`
      let computeCount = 0

      const realResult = await realSession.cache.getOrCompute(
        nodeKey,
        { persist: true },
        async () => {
          computeCount += 1
          return 'real'
        }
      )
      const aliasResult = await aliasSession.cache.getOrCompute(
        nodeKey,
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

      const realPersistence = getCacheStorePersistence({
        projectRoot: realRoot,
      })
      const aliasPersistence = getCacheStorePersistence({
        projectRoot: aliasRoot,
      })

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
        .prepare(`SELECT node_key FROM cache_inflight WHERE node_key = ?`)
        .all(nodeKey) as Array<{ node_key?: string }>
      sqliteDb.close()

      expect(rowsBefore.length).toBe(1)

      await persistence.load(nodeKey)

      const verifiedDb = new DatabaseSync(dbPath)
      const rowsAfter = verifiedDb
        .prepare(`SELECT node_key FROM cache_inflight WHERE node_key = ?`)
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

      await store.put('test:unserializable', unserializableValue, {
        persist: true,
      })
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
      expect(
        await persistence.load('test:stripped-react-symbolic')
      ).toBeUndefined()
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
    const telemetryCounters: Array<{
      name: string
      value: number
      tags?: Record<string, string>
    }> = []
    setGlobalTelemetry({
      enabled() {
        return true
      },
      emit() {},
      counter(name, value = 1, tags) {
        telemetryCounters.push({
          name,
          value,
          tags,
        })
      },
    })

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
          UPDATE cache_entry_deps_v2
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
      expect(
        telemetryCounters.some((counter) => {
          return (
            counter.name ===
            'renoun.cache.sqlite.fingerprint_mismatch_cleanup_count'
          )
        })
      ).toBe(true)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('loads a consistent persisted row when a concurrent writer commits between row and dependency reads', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-load-snapshot-race-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const persistence = new SqliteCacheStorePersistence({ dbPath })
      const nodeKey = 'test:load-snapshot-race'
      const previousDeps = [
        { depKey: 'const:load-snapshot-race:1', depVersion: '1' },
      ]
      const nextDeps = [
        { depKey: 'const:load-snapshot-race:2', depVersion: '1' },
      ]

      await persistence.save(nodeKey, {
        value: { value: 'initial' },
        deps: previousDeps,
        fingerprint: createFingerprint(previousDeps),
        persist: true,
        updatedAt: Date.now(),
      })

      const sqliteModule = (await import('node:sqlite')) as {
        DatabaseSync?: new (path: string) => any
      }
      const DatabaseSync = sqliteModule.DatabaseSync
      if (!DatabaseSync) {
        throw new Error('node:sqlite DatabaseSync is unavailable')
      }

      const nextUpdatedAt = Date.now() + 1
      const nextFingerprint = createFingerprint(nextDeps)

      const applyConcurrentWrite = () => {
        const concurrentDb = new DatabaseSync(dbPath)
        try {
          concurrentDb
            .prepare(
              `
                UPDATE cache_entries
                SET
                  fingerprint = ?,
                  value_blob = ?,
                  updated_at = ?,
                  last_accessed_at = ?,
                  revision = revision + 1
                WHERE node_key = ?
              `
            )
            .run(
              nextFingerprint,
              serialize({ value: 'updated' }),
              nextUpdatedAt,
              nextUpdatedAt,
              nodeKey
            )
          concurrentDb
            .prepare(`DELETE FROM cache_entry_deps_v2 WHERE node_key = ?`)
            .run(nodeKey)
          concurrentDb
            .prepare(
              `
                INSERT INTO cache_entry_deps_v2 (node_key, dep_key, dep_term_id, dep_version)
                VALUES (?, ?, NULL, ?)
              `
            )
            .run(nodeKey, nextDeps[0]!.depKey, nextDeps[0]!.depVersion)
        } finally {
          concurrentDb.close()
        }
      }

      const originalPrepare = DatabaseSync.prototype.prepare
      let wroteConcurrentUpdate = false
      DatabaseSync.prototype.prepare = function patchedPrepare(
        this: unknown,
        sql: string
      ): unknown {
        const statement = originalPrepare.call(this, sql) as {
          all?: (...args: unknown[]) => unknown
        }

        if (
          sql.includes('FROM cache_entry_deps_v2') &&
          sql.includes('WHERE node_key = ?') &&
          typeof statement.all === 'function'
        ) {
          const originalAll = statement.all.bind(statement)
          statement.all = (...args: unknown[]) => {
            if (!wroteConcurrentUpdate) {
              applyConcurrentWrite()
              wroteConcurrentUpdate = true
            }
            return originalAll(...args)
          }
        }

        return statement
      }

      try {
        const loaded = await persistence.load(nodeKey)
        expect(loaded?.value).toEqual({ value: 'initial' })
        expect(loaded?.deps).toEqual(previousDeps)
      } finally {
        DatabaseSync.prototype.prepare = originalPrepare
      }

      const reloaded = await persistence.load(nodeKey)
      expect(reloaded?.value).toEqual({ value: 'updated' })
      expect(reloaded?.deps).toEqual(nextDeps)
      expect(reloaded?.fingerprint).toBe(nextFingerprint)
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
    const warnSpy = vi
      .spyOn(getDebugLogger(), 'warn')
      .mockImplementation(() => {})
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

      const warnSpy = vi
        .spyOn(getDebugLogger(), 'warn')
        .mockImplementation(() => {})
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
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'persistence-delete-race'
    )
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
    const warnSpy = vi
      .spyOn(getDebugLogger(), 'warn')
      .mockImplementation(() => {})
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

  test('re-checks stale sqlite rows inside prune transactions before deleting', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-prune-transaction-race-')
    )
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-prune-transaction-race'
      )
      const maxAgeMs = 1_000
      const persistence = new SqliteCacheStorePersistence({
        dbPath,
        maxRows: 200,
        maxAgeMs,
      })
      const store = new CacheStore({ snapshot, persistence })
      const staleNodeKey = 'test:prune-transaction-race:stale'

      await store.put(
        staleNodeKey,
        { value: 'stale' },
        {
          persist: true,
          deps: [
            { depKey: 'const:prune-transaction-race:stale', depVersion: '1' },
          ],
        }
      )

      const sqliteModule = (await import('node:sqlite')) as {
        DatabaseSync?: new (path: string) => any
      }
      const DatabaseSync = sqliteModule.DatabaseSync
      if (!DatabaseSync) {
        throw new Error('node:sqlite DatabaseSync is unavailable')
      }

      const setupDb = new DatabaseSync(dbPath)
      try {
        setupDb
          .prepare(
            `
              UPDATE cache_entries
              SET last_accessed_at = ?
              WHERE node_key = ?
            `
          )
          .run(Date.now() - maxAgeMs - 5_000, staleNodeKey)
      } finally {
        setupDb.close()
      }

      vi.setSystemTime(Date.now() + 6 * 60 * 1_000)

      const originalExec = DatabaseSync.prototype.exec
      let beginCount = 0
      const refreshedLastAccessedAt = Date.now() + maxAgeMs + 60_000
      DatabaseSync.prototype.exec = function patchedExec(
        this: unknown,
        sql: string
      ): unknown {
        if (sql.trim().toUpperCase() === 'BEGIN IMMEDIATE') {
          beginCount += 1
          if (beginCount === 2) {
            const touchDb = new DatabaseSync(dbPath)
            try {
              touchDb
                .prepare(
                  `
                    UPDATE cache_entries
                    SET last_accessed_at = ?
                    WHERE node_key = ?
                  `
                )
                .run(refreshedLastAccessedAt, staleNodeKey)
            } finally {
              touchDb.close()
            }
          }
        }

        return originalExec.call(this, sql)
      }

      try {
        await store.put(
          'test:prune-transaction-race:trigger',
          { value: 'trigger' },
          {
            persist: true,
            deps: [
              {
                depKey: 'const:prune-transaction-race:trigger',
                depVersion: '1',
              },
            ],
          }
        )
      } finally {
        DatabaseSync.prototype.exec = originalExec
      }

      expect(beginCount).toBeGreaterThanOrEqual(2)
      expect(await persistence.load(staleNodeKey)).toBeDefined()
    } finally {
      vi.useRealTimers()
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
              LEFT JOIN cache_entry_deps_v2 d ON d.node_key = e.node_key
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

  test('compacts structured dependency path and term rows after prune', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-prune-structured-compact-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-prune-structured-compact'
      )
      const persistence = new SqliteCacheStorePersistence({
        dbPath,
        maxRows: 3,
        maxAgeMs: 1000 * 60 * 60,
      })
      const store = new CacheStore({ snapshot, persistence })

      for (let index = 0; index < 24; index += 1) {
        await store.put(
          `test:structured-compact:${index}`,
          { index },
          {
            persist: true,
            deps: [
              {
                depKey: `file:/dep/${index}.ts`,
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
        const entryCountRow = db
          .prepare(`SELECT COUNT(*) as total FROM cache_entries`)
          .get() as { total?: number }
        const depTermCountRow = db
          .prepare(`SELECT COUNT(*) as total FROM dep_terms`)
          .get() as { total?: number }
        const depPathCountRow = db
          .prepare(`SELECT COUNT(*) as total FROM dep_paths`)
          .get() as { total?: number }

        const entryCount = Number(entryCountRow.total ?? 0)
        const depTermCount = Number(depTermCountRow.total ?? 0)
        const depPathCount = Number(depPathCountRow.total ?? 0)

        expect(entryCount).toBeLessThanOrEqual(3)
        expect(depTermCount).toBeLessThanOrEqual(entryCount)
        expect(depPathCount).toBeLessThanOrEqual(depTermCount + 3)
      } finally {
        db.close()
      }
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('emits prune retry and latency telemetry under prune lock contention', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-prune-telemetry-contention-')
    )
    const telemetryCounters: Array<{
      name: string
      value: number
      tags?: Record<string, string>
    }> = []
    const telemetryHistograms: Array<{
      name: string
      value: number
      tags?: Record<string, string>
    }> = []
    setGlobalTelemetry({
      enabled() {
        return true
      },
      emit() {},
      counter(name, value = 1, tags) {
        telemetryCounters.push({
          name,
          value,
          tags,
        })
      },
      histogram(name, value, tags) {
        telemetryHistograms.push({
          name,
          value,
          tags,
        })
      },
    })

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const fileSystem = new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
      })
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-prune-telemetry-contention'
      )
      const persistence = new SqliteCacheStorePersistence({
        dbPath,
        maxRows: 1,
        maxAgeMs: 1000 * 60 * 60,
      })
      const store = new CacheStore({ snapshot, persistence })

      const sqliteModule = (await import('node:sqlite')) as {
        DatabaseSync?: new (path: string) => any
      }
      const DatabaseSync = sqliteModule.DatabaseSync
      if (!DatabaseSync) {
        throw new Error('node:sqlite DatabaseSync is unavailable')
      }

      const originalExec = DatabaseSync.prototype.exec
      let injectedPruneBusy = false
      DatabaseSync.prototype.exec = function patchedExec(
        this: unknown,
        sql: string
      ): unknown {
        if (
          !injectedPruneBusy &&
          sql.trim().toUpperCase() === 'BEGIN IMMEDIATE'
        ) {
          const stack = new Error().stack ?? ''
          if (stack.includes('runPruneWithRetries')) {
            injectedPruneBusy = true
            const busyError = new Error('database is locked')
            ;(busyError as { code?: string }).code = 'SQLITE_BUSY'
            throw busyError
          }
        }

        return originalExec.call(this, sql)
      }

      try {
        await store.put(
          'test:prune-telemetry:0',
          { index: 0 },
          {
            persist: true,
            deps: [{ depKey: 'file:/dep/0.ts', depVersion: '0' }],
          }
        )
        await store.put(
          'test:prune-telemetry:1',
          { index: 1 },
          {
            persist: true,
            deps: [{ depKey: 'file:/dep/1.ts', depVersion: '1' }],
          }
        )
      } finally {
        DatabaseSync.prototype.exec = originalExec
      }

      expect(injectedPruneBusy).toBe(true)
      expect(
        telemetryCounters.some((counter) => {
          return (
            counter.name === 'renoun.cache.sqlite.busy_retry_count' &&
            counter.tags?.operation === 'prune'
          )
        })
      ).toBe(true)
      expect(
        telemetryHistograms.some((histogram) => {
          return (
            histogram.name === 'renoun.cache.sqlite.prune_ms' &&
            histogram.value >= 0
          )
        })
      ).toBe(true)
      expect(
        telemetryHistograms.some((histogram) => {
          return (
            histogram.name === 'renoun.cache.sqlite.compaction_ms' &&
            histogram.value >= 0
          )
        })
      ).toBe(true)
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
      const snapshot = new FileSystemSnapshot(
        fileSystem,
        'sqlite-prune-concurrent'
      )
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
          return writer.put(
            `test:prune-concurrent:${index}`,
            { index },
            {
              persist: true,
              deps: [
                {
                  depKey: `const:prune-concurrent:${index}`,
                  depVersion: String(index),
                },
              ],
            }
          )
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
              FROM cache_entry_deps_v2 AS dependency
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
        let secondSettled = false
        const second = secondStore
          .getOrCompute(
            'test:sqlite-compute-slot-lock',
            { persist: true },
            async () => {
              computeCount += 1
              return 'second'
            }
          )
          .finally(() => {
            secondSettled = true
          })

        await new Promise((resolve) => {
          setTimeout(resolve, 30)
        })
        expect(secondSettled).toBe(false)

        await new Promise((resolve) => {
          setTimeout(resolve, 120)
        })
        lockDb.exec('ROLLBACK')

        const [firstResult, secondResult] = await Promise.all([first, second])

        expect(firstResult).toBe('first')
        expect(secondResult).toBe('first')
        expect(computeCount).toBe(1)
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
      expect(
        (persistedAfter as { revision?: number } | undefined)?.revision
      ).toBe(thirdRevision)
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
      const baselineDeps = [
        { depKey: 'const:guarded:baseline', depVersion: '1' },
      ]
      const baselineRevision = await sqlitePersistence.saveWithRevision(
        nodeKey,
        {
          value: { value: 'baseline' },
          deps: baselineDeps,
          fingerprint: createFingerprint(baselineDeps),
          persist: true,
          updatedAt: Date.now(),
        }
      )

      const candidateDeps = [
        { depKey: 'const:guarded:candidate', depVersion: '1' },
      ]
      const candidateEntry: CacheEntry = {
        value: { value: 'candidate' },
        deps: candidateDeps,
        fingerprint: createFingerprint(candidateDeps),
        persist: true,
        updatedAt: Date.now() + 1,
      }

      const missingPreconditionResult =
        await sqlitePersistence.saveWithRevisionGuarded(
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

      const staleRevisionResult =
        await sqlitePersistence.saveWithRevisionGuarded(
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
      expect(
        (persistedAfter as { revision?: number } | undefined)?.revision
      ).toBe(baselineRevision)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('loads persisted revision preconditions during refresh so guarded writes stay active', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'sqlite-refresh-guarded-precondition'
    )
    type PersistedEntry = CacheEntry<{ value: string }> & { revision: number }
    const persistedEntries = new Map<string, PersistedEntry>()
    const nodeKey = 'test:sqlite-refresh-guarded-precondition'
    const baselineDeps = [
      { depKey: 'const:refresh-guarded:baseline', depVersion: '1' },
    ]
    persistedEntries.set(nodeKey, {
      value: { value: 'baseline' },
      deps: baselineDeps,
      fingerprint: createFingerprint(baselineDeps),
      persist: true,
      updatedAt: Date.now(),
      revision: 7,
    })

    const load = vi.fn(async (lookupNodeKey: string) => {
      const current = persistedEntries.get(lookupNodeKey)
      return current ? { ...current } : undefined
    })
    const saveWithRevision = vi.fn(
      async (lookupNodeKey: string, entry: CacheEntry) => {
        const nextRevision =
          (persistedEntries.get(lookupNodeKey)?.revision ?? 0) + 1
        persistedEntries.set(lookupNodeKey, {
          ...(entry as CacheEntry<{ value: string }>),
          revision: nextRevision,
        })
        return nextRevision
      }
    )
    const saveWithRevisionGuarded = vi.fn(
      async (
        lookupNodeKey: string,
        entry: CacheEntry,
        options: {
          expectedRevision: number | 'missing'
        }
      ) => {
        const currentRevision = persistedEntries.get(lookupNodeKey)?.revision
        if (options.expectedRevision === 'missing') {
          if (typeof currentRevision === 'number') {
            return {
              applied: false,
              revision: currentRevision,
            }
          }

          persistedEntries.set(lookupNodeKey, {
            ...(entry as CacheEntry<{ value: string }>),
            revision: 1,
          })
          return {
            applied: true,
            revision: 1,
          }
        }

        if (currentRevision !== options.expectedRevision) {
          return {
            applied: false,
            revision: typeof currentRevision === 'number' ? currentRevision : 0,
          }
        }

        const nextRevision = currentRevision + 1
        persistedEntries.set(lookupNodeKey, {
          ...(entry as CacheEntry<{ value: string }>),
          revision: nextRevision,
        })
        return {
          applied: true,
          revision: nextRevision,
        }
      }
    )
    const persistence: CacheStorePersistence = {
      load,
      save: vi.fn(async (lookupNodeKey: string, entry: CacheEntry) => {
        await saveWithRevision(lookupNodeKey, entry)
      }),
      saveWithRevision,
      saveWithRevisionGuarded,
      delete: vi.fn(async (lookupNodeKey: string) => {
        persistedEntries.delete(lookupNodeKey)
      }),
    }
    const store = new CacheStore({ snapshot, persistence })

    const result = await store.refresh(
      nodeKey,
      { persist: true },
      async (ctx) => {
        ctx.recordDep('const:refresh-guarded:fresh', '1')
        return {
          value: 'fresh',
        }
      }
    )

    expect(result).toEqual({ value: 'fresh' })
    expect(load).toHaveBeenCalled()
    expect(saveWithRevisionGuarded).toHaveBeenCalledTimes(1)
    expect(saveWithRevisionGuarded).toHaveBeenCalledWith(
      nodeKey,
      expect.objectContaining({
        persist: true,
      }),
      {
        expectedRevision: 7,
      }
    )
    expect(saveWithRevision).not.toHaveBeenCalled()
    expect(persistedEntries.get(nodeKey)).toMatchObject({
      value: { value: 'fresh' },
      revision: 8,
    })
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
      const baselineRevision = await sqlitePersistence.saveWithRevision(
        nodeKey,
        {
          value: { value: 'baseline' },
          deps: baselineDeps,
          fingerprint: createFingerprint(baselineDeps),
          persist: true,
          updatedAt: Date.now(),
        }
      )

      const winnerDeps = [
        { depKey: 'const:sqlite-guarded-reconcile:winner', depVersion: '1' },
      ]
      let injectedConcurrentWrite = false
      const persistence: CacheStorePersistence = {
        load: sqlitePersistence.load.bind(sqlitePersistence),
        delete: sqlitePersistence.delete.bind(sqlitePersistence),
        save: sqlitePersistence.save.bind(sqlitePersistence),
        saveWithRevision:
          sqlitePersistence.saveWithRevision.bind(sqlitePersistence),
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

      expect(
        (persistedAfter as { revision?: number } | undefined)?.revision
      ).toBe(baselineRevision + 1)
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
      const staleDeps = [
        { depKey: 'const:sqlite-save-supersede:stale', depVersion: '1' },
      ]
      const staleRevision = await sqlitePersistence.saveWithRevision(nodeKey, {
        value: { value: 'baseline' },
        deps: staleDeps,
        fingerprint: createFingerprint(staleDeps),
        persist: true,
        updatedAt: Date.now(),
      })

      const bumpDeps = [
        { depKey: 'const:sqlite-save-supersede:bump', depVersion: '1' },
      ]
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
      const localDeps = [
        { depKey: 'const:sqlite-save-supersede:local', depVersion: '1' },
      ]
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
      const resolvedConcurrentRevision = concurrentRevision
      const resolvedLocalRevision = localRevision

      expect(resolvedConcurrentRevision).toBeDefined()
      expect(resolvedLocalRevision).toBeDefined()

      expect(
        (persistedAfter as { revision?: number } | undefined)?.revision
      ).toBe(resolvedConcurrentRevision)
      expect(resolvedConcurrentRevision!).toBeGreaterThan(staleRevision)
      expect(
        (persistedAfter as { revision?: number } | undefined)?.revision
      ).toBeGreaterThan(bumpedRevision)
      expect(resolvedLocalRevision!).toBeGreaterThan(bumpedRevision)
      expect(resolvedConcurrentRevision!).toBeGreaterThan(
        resolvedLocalRevision!
      )
      expect(persistedAfter?.value).toEqual({ value: 'concurrent' })
      expect(memoryAfter).toEqual({ value: 'concurrent' })
      expect(resolvedLocalRevision!).toBe(staleRevision + 2)
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
        getComputeSlotOwner:
          sqlitePersistence.getComputeSlotOwner.bind(sqlitePersistence),
        releaseComputeSlot:
          sqlitePersistence.releaseComputeSlot.bind(sqlitePersistence),
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
        getComputeSlotOwner:
          sqlitePersistence.getComputeSlotOwner.bind(sqlitePersistence),
        releaseComputeSlot:
          sqlitePersistence.releaseComputeSlot.bind(sqlitePersistence),
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
        getComputeSlotOwner:
          sqlitePersistence.getComputeSlotOwner.bind(sqlitePersistence),
        releaseComputeSlot:
          sqlitePersistence.releaseComputeSlot.bind(sqlitePersistence),
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
    const nodeKey = 'test:sqlite-compute-slot-heartbeat'
    const persistence = createShortTtlComputeSlotPersistence(dbPath, {
      slotTtlMs: 180,
      withHeartbeat: true,
    })
    const firstStore = new CacheStore({ snapshot, persistence })
    const secondStore = new CacheStore({ snapshot, persistence })

    try {
      let computeCount = 0
      const first = firstStore.getOrCompute(
        nodeKey,
        { persist: true },
        async () => {
          computeCount += 1
          await new Promise((resolve) => setTimeout(resolve, 650))
          return 'first'
        }
      )

      const ownerDeadline = Date.now() + 1_000
      let observedOwner: string | undefined
      while (Date.now() < ownerDeadline) {
        observedOwner = await persistence.getComputeSlotOwner(nodeKey)
        if (observedOwner) {
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      expect(observedOwner).toBeTruthy()

      const second = secondStore.getOrCompute(
        nodeKey,
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

  test('rechecks persisted cache when the compute-slot owner disappears after owner grace elapses', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'compute-slot-owner-disappears'
    )
    const nodeKey = 'test:compute-slot-owner-disappears'
    const persistedEntries = new Map<string, CacheEntry<string>>()
    let inFlightOwner: string | undefined = 'leader-owner'
    let getComputeSlotOwnerCalls = 0
    const persistence: SqliteComputeSlotPersistence = {
      computeSlotTtlMs: 5,
      async load(lookupNodeKey) {
        return persistedEntries.get(lookupNodeKey)
      },
      async save(lookupNodeKey, entry) {
        persistedEntries.set(lookupNodeKey, entry as CacheEntry<string>)
      },
      async delete(lookupNodeKey) {
        persistedEntries.delete(lookupNodeKey)
      },
      async acquireComputeSlot(_lookupNodeKey, owner) {
        if (inFlightOwner) {
          return false
        }

        inFlightOwner = owner
        return true
      },
      async getComputeSlotOwner(lookupNodeKey) {
        getComputeSlotOwnerCalls += 1

        if (getComputeSlotOwnerCalls === 2) {
          persistedEntries.set(lookupNodeKey, {
            value: 'winner',
            deps: [],
            fingerprint: createFingerprint([]),
            persist: true,
            updatedAt: Date.now(),
          })
          inFlightOwner = undefined
        }

        return inFlightOwner
      },
      async releaseComputeSlot(_lookupNodeKey, owner) {
        if (inFlightOwner === owner) {
          inFlightOwner = undefined
        }
      },
    }
    const followerStore = new CacheStore({
      snapshot,
      persistence,
      computeSlotPollMs: 25,
    })

    let computeCount = 0
    const result = await followerStore.getOrCompute(
      nodeKey,
      { persist: true },
      async () => {
        computeCount += 1
        return 'computed'
      }
    )

    expect(result).toBe('winner')
    expect(computeCount).toBe(0)
    expect(getComputeSlotOwnerCalls).toBe(2)
  })

  test('does not persist a stale leader result after the heartbeat loses compute-slot ownership', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-slot-heartbeat-loss-')
    )
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'sqlite-compute-slot-heartbeat-loss'
    )
    const sqlitePersistence = new SqliteCacheStorePersistence({ dbPath })
    const slotTtlMs = 60
    let didLoseOwnership = false
    const persistence: SqliteComputeSlotPersistence = {
      load: sqlitePersistence.load.bind(sqlitePersistence),
      save: sqlitePersistence.save.bind(sqlitePersistence),
      delete: sqlitePersistence.delete.bind(sqlitePersistence),
      computeSlotTtlMs: slotTtlMs,
      acquireComputeSlot: (nodeKey, owner) =>
        sqlitePersistence.acquireComputeSlot(nodeKey, owner, slotTtlMs),
      refreshComputeSlot: async (nodeKey, owner) => {
        if (!didLoseOwnership) {
          didLoseOwnership = true
          await sqlitePersistence.releaseComputeSlot(nodeKey, owner)
        }

        return false
      },
      getComputeSlotOwner:
        sqlitePersistence.getComputeSlotOwner.bind(sqlitePersistence),
      releaseComputeSlot:
        sqlitePersistence.releaseComputeSlot.bind(sqlitePersistence),
    }
    const firstStore = new CacheStore({ snapshot, persistence })
    const secondStore = new CacheStore({ snapshot, persistence })
    const thirdStore = new CacheStore({ snapshot, persistence })
    const releaseFirst = createDeferredPromise<void>()

    try {
      let computeCount = 0
      const first = firstStore.getOrCompute(
        'test:sqlite-compute-slot-heartbeat-loss',
        { persist: true },
        async () => {
          computeCount += 1
          await releaseFirst.promise
          return 'first'
        }
      )

      await new Promise((resolve) => {
        setTimeout(resolve, 90)
      })

      const second = secondStore.getOrCompute(
        'test:sqlite-compute-slot-heartbeat-loss',
        { persist: true },
        async () => {
          computeCount += 1
          return 'second'
        }
      )

      await new Promise((resolve) => {
        setTimeout(resolve, 20)
      })
      releaseFirst.resolve()

      const [firstResult, secondResult] = await Promise.all([first, second])
      expect(firstResult).toBe('first')
      expect(secondResult).toBe('second')
      expect(computeCount).toBe(2)

      const persisted = await thirdStore.getOrCompute(
        'test:sqlite-compute-slot-heartbeat-loss',
        { persist: true },
        async () => {
          computeCount += 1
          return 'third'
        }
      )

      expect(persisted).toBe('second')
      expect(computeCount).toBe(2)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  }, 12000)

  test('does not persist a stale leader result after heartbeat refresh errors', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-slot-heartbeat-refresh-error-')
    )
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'sqlite-compute-slot-heartbeat-refresh-error'
    )
    const sqlitePersistence = new SqliteCacheStorePersistence({ dbPath })
    const slotTtlMs = 200
    let didThrowRefreshError = false
    const persistence: SqliteComputeSlotPersistence = {
      load: sqlitePersistence.load.bind(sqlitePersistence),
      save: sqlitePersistence.save.bind(sqlitePersistence),
      delete: sqlitePersistence.delete.bind(sqlitePersistence),
      computeSlotTtlMs: slotTtlMs,
      acquireComputeSlot: (nodeKey, owner) =>
        sqlitePersistence.acquireComputeSlot(nodeKey, owner, slotTtlMs),
      refreshComputeSlot: async (nodeKey, owner) => {
        if (!didThrowRefreshError) {
          didThrowRefreshError = true
          await sqlitePersistence.releaseComputeSlot(nodeKey, owner)
          throw new Error('refresh failed')
        }

        return sqlitePersistence.refreshComputeSlot(nodeKey, owner, slotTtlMs)
      },
      getComputeSlotOwner:
        sqlitePersistence.getComputeSlotOwner.bind(sqlitePersistence),
      releaseComputeSlot:
        sqlitePersistence.releaseComputeSlot.bind(sqlitePersistence),
    }
    const firstStore = new CacheStore({ snapshot, persistence })
    const secondStore = new CacheStore({ snapshot, persistence })
    const thirdStore = new CacheStore({ snapshot, persistence })
    const releaseFirst = createDeferredPromise()

    try {
      let computeCount = 0
      const first = firstStore.getOrCompute(
        'test:sqlite-compute-slot-heartbeat-refresh-error',
        { persist: true },
        async () => {
          computeCount += 1
          await releaseFirst.promise
          return 'first'
        }
      )

      await waitForMilliseconds(130)

      const secondResult = await secondStore.getOrCompute(
        'test:sqlite-compute-slot-heartbeat-refresh-error',
        { persist: true },
        async () => {
          computeCount += 1
          return 'second'
        }
      )

      releaseFirst.resolve()
      const firstResult = await first

      expect(firstResult).toBe('first')
      expect(secondResult).toBe('second')
      expect(computeCount).toBe(2)
      expect(didThrowRefreshError).toBe(true)

      const persisted = await thirdStore.getOrCompute(
        'test:sqlite-compute-slot-heartbeat-refresh-error',
        { persist: true },
        async () => {
          computeCount += 1
          return 'third'
        }
      )

      expect(persisted).toBe('second')
      expect(computeCount).toBe(2)
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  }, 12000)

  test('reuses sqlite compute work without heartbeat when the leader finishes within owner grace', async () => {
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
          await new Promise((resolve) => setTimeout(resolve, 180))
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

  test('duplicates sqlite compute work without heartbeat after owner grace elapses', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-slot-no-heartbeat-stale-owner-')
    )
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'sqlite-compute-slot-no-heartbeat-stale-owner'
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
        'test:sqlite-compute-slot-no-heartbeat-stale-owner',
        { persist: true },
        async () => {
          computeCount += 1
          await new Promise((resolve) => setTimeout(resolve, 650))
          return 'first'
        }
      )

      await new Promise((resolve) => {
        setTimeout(resolve, 20)
      })
      const second = secondStore.getOrCompute(
        'test:sqlite-compute-slot-no-heartbeat-stale-owner',
        { persist: true },
        async () => {
          computeCount += 1
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

      await store.put(
        affectedNodeKey,
        { value: 'affected' },
        {
          persist: true,
          deps: [
            {
              depKey: 'file:src/components_button/index.ts',
              depVersion: affectedDepVersion,
            },
          ],
        }
      )
      await store.put(
        unaffectedNodeKey,
        { value: 'unaffected' },
        {
          persist: true,
          deps: [
            {
              depKey: 'file:src/componentsXbutton/index.ts',
              depVersion: unaffectedDepVersion,
            },
          ],
        }
      )

      const prefixMatches = await store.listNodeKeysByPrefix(
        'dir:src/components_button|'
      )
      expect(prefixMatches).toEqual([affectedNodeKey])

      const eviction = await store.deleteByDependencyPath(
        'src/components_button'
      )
      expect(eviction.deletedNodeKeys).toContain(affectedNodeKey)
      expect(eviction.deletedNodeKeys).not.toContain(unaffectedNodeKey)

      expect(
        await store.get<{ value: string }>(affectedNodeKey)
      ).toBeUndefined()
      expect(await store.get<{ value: string }>(unaffectedNodeKey)).toEqual({
        value: 'unaffected',
      })
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('creates a composite dependency index for dependency-path lookups', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-dep-index-')
    )

    try {
      const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
      const persistence = new SqliteCacheStorePersistence({ dbPath })

      await persistence.load('test:sqlite-dep-index:init')

      const sqliteModule = (await import('node:sqlite')) as {
        DatabaseSync?: new (path: string) => any
      }
      const DatabaseSync = sqliteModule.DatabaseSync
      if (!DatabaseSync) {
        throw new Error('node:sqlite DatabaseSync is unavailable')
      }

      const db = new DatabaseSync(dbPath)
      try {
        const depPathsTable = db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dep_paths'`
          )
          .get() as { name?: string } | undefined
        const depPathClosureTable = db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dep_path_closure'`
          )
          .get() as { name?: string } | undefined
        const depTermsTable = db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dep_terms'`
          )
          .get() as { name?: string } | undefined
        const cacheEntryDepsV2Table = db
          .prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cache_entry_deps_v2'`
          )
          .get() as { name?: string } | undefined

        expect(depPathsTable?.name).toBe('dep_paths')
        expect(depPathClosureTable?.name).toBe('dep_path_closure')
        expect(depTermsTable?.name).toBe('dep_terms')
        expect(cacheEntryDepsV2Table?.name).toBe('cache_entry_deps_v2')

        const structuredIndexRows = db
          .prepare(`PRAGMA index_list('cache_entry_deps_v2')`)
          .all() as Array<{ name?: string }>
        const structuredIndexNames = structuredIndexRows
          .map((row) => row.name)
          .filter((name): name is string => typeof name === 'string')
        expect(structuredIndexNames).toContain(
          'cache_entry_deps_v2_dep_term_node_key_idx'
        )

        const structuredIndexInfoRows = db
          .prepare(
            `PRAGMA index_info('cache_entry_deps_v2_dep_term_node_key_idx')`
          )
          .all() as Array<{ name?: string }>
        const structuredIndexColumns = structuredIndexInfoRows
          .map((row) => row.name)
          .filter((name): name is string => typeof name === 'string')
        expect(structuredIndexColumns).toEqual(['dep_term_id', 'node_key'])
      } finally {
        db.close()
      }
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('evicts persisted entries by batched dependency paths in a single call', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-path-eviction-batch-')
    )
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const snapshot = new FileSystemSnapshot(
      new InMemoryFileSystem({
        'src/components/button.ts': 'export const button = 1',
        'src/other/value.ts': 'export const value = 1',
      }),
      'sqlite-path-eviction-batch'
    )
    const persistence = new SqliteCacheStorePersistence({ dbPath })
    const store = new CacheStore({ snapshot, persistence })
    const affectedNodeKey = 'analysis:components:batch'
    const unaffectedNodeKey = 'analysis:other:batch'

    try {
      const affectedDepVersion = await snapshot.contentId(
        'src/components/button.ts'
      )
      const unaffectedDepVersion =
        await snapshot.contentId('src/other/value.ts')

      await store.put(
        affectedNodeKey,
        { value: 'affected' },
        {
          persist: true,
          deps: [
            {
              depKey: 'file:src/components/button.ts',
              depVersion: affectedDepVersion,
            },
          ],
        }
      )
      await store.put(
        unaffectedNodeKey,
        { value: 'unaffected' },
        {
          persist: true,
          deps: [
            {
              depKey: 'file:src/other/value.ts',
              depVersion: unaffectedDepVersion,
            },
          ],
        }
      )

      const eviction = await store.deleteByDependencyPaths([
        'src/components',
        'src/components/button.ts',
      ])
      expect(eviction.deletedNodeKeys).toContain(affectedNodeKey)
      expect(eviction.deletedNodeKeys).not.toContain(unaffectedNodeKey)

      expect(await store.get(affectedNodeKey)).toBeUndefined()
      expect(await store.get(unaffectedNodeKey)).toEqual({
        value: 'unaffected',
      })
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('evicts persisted entries using structured dependency index metadata', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-structured-path-eviction-')
    )
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const snapshot = new FileSystemSnapshot(
      new InMemoryFileSystem({
        'src/components/button.ts': 'export const button = 1',
        'src/components/input.ts': 'export const input = 1',
        'src/other/value.ts': 'export const value = 1',
      }),
      'sqlite-structured-path-eviction'
    )
    const persistence = new SqliteCacheStorePersistence({ dbPath })
    const store = new CacheStore({ snapshot, persistence })
    const affectedNodeKey = 'analysis:components:structured'
    const unaffectedNodeKey = 'analysis:other:structured'

    try {
      const affectedDepVersion = await snapshot.contentId(
        'src/components/button.ts'
      )
      const unaffectedDepVersion =
        await snapshot.contentId('src/other/value.ts')

      await store.put(
        affectedNodeKey,
        { value: 'affected' },
        {
          persist: true,
          deps: [
            {
              depKey: 'file:src/components/button.ts',
              depVersion: affectedDepVersion,
            },
          ],
        }
      )
      await store.put(
        unaffectedNodeKey,
        { value: 'unaffected' },
        {
          persist: true,
          deps: [
            {
              depKey: 'file:src/other/value.ts',
              depVersion: unaffectedDepVersion,
            },
          ],
        }
      )

      const eviction = await store.deleteByDependencyPath('src/components')
      expect(eviction.deletedNodeKeys).toContain(affectedNodeKey)
      expect(eviction.deletedNodeKeys).not.toContain(unaffectedNodeKey)
      expect(eviction.invalidationMode).toBe('structured')
      expect(typeof eviction.invalidationSeq).toBe('number')
      expect((eviction.invalidationSeq ?? 0) > 0).toBe(true)

      expect(await store.get(affectedNodeKey)).toBeUndefined()
      expect(await store.get(unaffectedNodeKey)).toEqual({
        value: 'unaffected',
      })
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('evicts directory dependencies when invalidating an unseen descendant path', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-structured-unseen-path-')
    )
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const snapshot = new FileSystemSnapshot(
      new InMemoryFileSystem({
        'src/components/button.ts': 'export const button = 1',
        'src/other/value.ts': 'export const value = 1',
      }),
      'sqlite-structured-unseen-path'
    )
    const persistence = new SqliteCacheStorePersistence({ dbPath })
    const store = new CacheStore({ snapshot, persistence })
    const affectedNodeKey = 'dir:src/components|mask=1|sig=structured-unseen'
    const unaffectedNodeKey = 'dir:src/other|mask=1|sig=structured-unseen'

    try {
      const affectedDirectoryDepVersion =
        await snapshot.contentId('src/components')
      const unaffectedDirectoryDepVersion =
        await snapshot.contentId('src/other')

      await store.put(
        affectedNodeKey,
        { value: 'affected' },
        {
          persist: true,
          deps: [
            {
              depKey: 'dir:src/components',
              depVersion: affectedDirectoryDepVersion,
            },
          ],
        }
      )
      await store.put(
        unaffectedNodeKey,
        { value: 'unaffected' },
        {
          persist: true,
          deps: [
            {
              depKey: 'dir:src/other',
              depVersion: unaffectedDirectoryDepVersion,
            },
          ],
        }
      )

      const eviction = await store.deleteByDependencyPath(
        'src/components/new-file.ts'
      )
      expect(eviction.deletedNodeKeys).toContain(affectedNodeKey)
      expect(eviction.deletedNodeKeys).not.toContain(unaffectedNodeKey)
      expect(eviction.invalidationMode).toBe('structured')
      expect(typeof eviction.invalidationSeq).toBe('number')
      expect((eviction.invalidationSeq ?? 0) > 0).toBe(true)

      expect(await store.get(affectedNodeKey)).toBeUndefined()
      expect(await store.get(unaffectedNodeKey)).toEqual({
        value: 'unaffected',
      })
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('does not bump invalidation sequence for no-op dependency path invalidations', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-structured-noop-invalidation-seq-')
    )
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const snapshot = new FileSystemSnapshot(
      new InMemoryFileSystem({
        'src/components/button.ts': 'export const button = 1',
      }),
      'sqlite-structured-noop-invalidation-seq'
    )
    const persistence = new SqliteCacheStorePersistence({ dbPath })
    const store = new CacheStore({ snapshot, persistence })
    const nodeKey = 'analysis:components:noop-invalidation-seq'

    try {
      const depVersion = await snapshot.contentId('src/components/button.ts')

      await store.put(
        nodeKey,
        { value: 'stable' },
        {
          persist: true,
          deps: [
            {
              depKey: 'file:src/components/button.ts',
              depVersion,
            },
          ],
        }
      )

      const eviction = await store.deleteByDependencyPath('src/unrelated')
      expect(eviction.deletedNodeKeys).toEqual([])
      expect(eviction.usedDependencyIndex).toBe(true)
      expect(eviction.hasMissingDependencyMetadata).toBe(false)
      expect(eviction.missingDependencyNodeKeys).toEqual([])
      expect(eviction.invalidationMode).toBe('structured')
      expect(eviction.invalidationSeq).toBeUndefined()
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('evicts non-directory persisted entries by dependency path', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-path-eviction-')
    )
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const snapshot = new FileSystemSnapshot(
      new InMemoryFileSystem({
        'src/components/button.ts': 'export const button = 1',
        'src/other/value.ts': 'export const value = 1',
      }),
      'sqlite-path-eviction'
    )
    const persistence = new SqliteCacheStorePersistence({ dbPath })
    const store = new CacheStore({ snapshot, persistence })
    const affectedNodeKey = 'analysis:components'
    const unaffectedNodeKey = 'analysis:other'

    try {
      const affectedDepVersion = await snapshot.contentId(
        'src/components/button.ts'
      )
      const unaffectedDepVersion =
        await snapshot.contentId('src/other/value.ts')

      await store.put(
        affectedNodeKey,
        { value: 'affected' },
        {
          persist: true,
          deps: [
            {
              depKey: 'file:src/components/button.ts',
              depVersion: affectedDepVersion,
            },
          ],
        }
      )
      await store.put(
        unaffectedNodeKey,
        { value: 'unaffected' },
        {
          persist: true,
          deps: [
            {
              depKey: 'file:src/other/value.ts',
              depVersion: unaffectedDepVersion,
            },
          ],
        }
      )

      const eviction = await store.deleteByDependencyPath('src/components')
      expect(eviction.deletedNodeKeys).toContain(affectedNodeKey)
      expect(eviction.deletedNodeKeys).not.toContain(unaffectedNodeKey)

      expect(await store.get(affectedNodeKey)).toBeUndefined()
      expect(await store.get(unaffectedNodeKey)).toEqual({
        value: 'unaffected',
      })
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('reports missing dependency metadata for non-directory persisted rows', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-missing-deps-')
    )
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const snapshot = new FileSystemSnapshot(
      new InMemoryFileSystem({
        'src/components/button.ts': 'export const button = 1',
      }),
      'sqlite-missing-deps'
    )
    const persistence = new SqliteCacheStorePersistence({ dbPath })
    const store = new CacheStore({ snapshot, persistence })

    try {
      await store.put(
        'analysis:metadata-missing',
        { value: 'missing' },
        {
          persist: true,
          deps: [],
        }
      )

      const eviction = await store.deleteByDependencyPath('src/components')
      expect(eviction.usedDependencyIndex).toBe(true)
      expect(eviction.hasMissingDependencyMetadata).toBe(true)
      expect(eviction.deletedNodeKeys).toEqual([])
      expect(eviction.missingDependencyNodeKeys).toEqual([
        'analysis:metadata-missing',
      ])
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('maintains missing dependency metadata across rewrites and deletes', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-missing-deps-transition-')
    )
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const snapshot = new FileSystemSnapshot(
      new InMemoryFileSystem({
        'src/components/button.ts': 'export const button = 1',
      }),
      'sqlite-missing-deps-transition'
    )
    const persistence = new SqliteCacheStorePersistence({ dbPath })
    const store = new CacheStore({ snapshot, persistence })
    const nodeKey = 'analysis:metadata-transition'

    try {
      const depVersion = await snapshot.contentId('src/components/button.ts')

      await store.put(
        nodeKey,
        { value: 'missing' },
        {
          persist: true,
          deps: [],
        }
      )

      let eviction = await store.deleteByDependencyPath('src/unrelated')
      expect(eviction.hasMissingDependencyMetadata).toBe(true)
      expect(eviction.missingDependencyNodeKeys).toEqual([nodeKey])

      await store.put(
        nodeKey,
        { value: 'with-dependency' },
        {
          persist: true,
          deps: [
            {
              depKey: 'file:src/components/button.ts',
              depVersion,
            },
          ],
        }
      )

      eviction = await store.deleteByDependencyPath('src/unrelated')
      expect(eviction.hasMissingDependencyMetadata).toBe(false)
      expect(eviction.missingDependencyNodeKeys).toEqual([])

      await store.delete(nodeKey)
      eviction = await store.deleteByDependencyPath('src/unrelated')
      expect(eviction.hasMissingDependencyMetadata).toBe(false)
      expect(eviction.missingDependencyNodeKeys).toEqual([])
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('persists subsequent puts after dependency-path eviction removes persisted rows', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-path-eviction-repersist-')
    )
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const snapshot = new FileSystemSnapshot(
      new InMemoryFileSystem({
        'src/components/button.ts': 'export const button = 1',
      }),
      'sqlite-path-eviction-repersist'
    )
    const persistence = new SqliteCacheStorePersistence({ dbPath })
    const store = new CacheStore({ snapshot, persistence })
    const nodeKey = 'analysis:components:repersist'

    try {
      const depVersion = await snapshot.contentId('src/components/button.ts')

      await store.put(
        nodeKey,
        { value: 'before-eviction' },
        {
          persist: true,
          deps: [
            {
              depKey: 'file:src/components/button.ts',
              depVersion,
            },
          ],
        }
      )

      const persistedBeforeEviction = await persistence.load(nodeKey)
      expect(persistedBeforeEviction?.persist).toBe(true)
      expect(persistedBeforeEviction?.value).toEqual({
        value: 'before-eviction',
      })

      const eviction = await store.deleteByDependencyPath('src/components')
      expect(eviction.deletedNodeKeys).toContain(nodeKey)
      expect(await persistence.load(nodeKey)).toBeUndefined()

      await store.put(
        nodeKey,
        { value: 'after-eviction' },
        {
          persist: true,
          deps: [
            {
              depKey: 'file:src/components/button.ts',
              depVersion,
            },
          ],
        }
      )

      const persistedAfterEviction = await persistence.load(nodeKey)
      expect(persistedAfterEviction?.persist).toBe(true)
      expect(persistedAfterEviction?.value).toEqual({
        value: 'after-eviction',
      })
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  })

  test('evicts persisted entries keyed by absolute dependency paths', async () => {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-sqlite-absolute-path-eviction-')
    )
    const dbPath = join(tmpDirectory, 'fs-cache.sqlite')
    const snapshot = new FileSystemSnapshot(
      new InMemoryFileSystem({
        'index.ts': 'export const value = 1',
        'src/other/value.ts': 'export const other = 1',
      }),
      'sqlite-absolute-path-eviction'
    )
    const persistence = new SqliteCacheStorePersistence({ dbPath })
    const store = new CacheStore({ snapshot, persistence })
    const affectedNodeKey = 'analysis:absolute'
    const unaffectedNodeKey = 'analysis:relative'
    const absoluteDependencyPath =
      '/Users/example/project/src/components/button.ts'

    try {
      const unaffectedDepVersion =
        await snapshot.contentId('src/other/value.ts')

      await store.put(
        affectedNodeKey,
        { value: 'affected' },
        {
          persist: true,
          deps: [
            {
              depKey: `file:${absoluteDependencyPath}`,
              depVersion: 'missing',
            },
          ],
        }
      )
      await store.put(
        unaffectedNodeKey,
        { value: 'unaffected' },
        {
          persist: true,
          deps: [
            {
              depKey: 'file:src/other/value.ts',
              depVersion: unaffectedDepVersion,
            },
          ],
        }
      )

      const eviction = await store.deleteByDependencyPath(
        absoluteDependencyPath
      )
      expect(eviction.deletedNodeKeys).toContain(affectedNodeKey)
      expect(eviction.deletedNodeKeys).not.toContain(unaffectedNodeKey)

      expect(await store.get(affectedNodeKey)).toBeUndefined()
      expect(await store.get(unaffectedNodeKey)).toEqual({
        value: 'unaffected',
      })
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
    const warnSpy = vi
      .spyOn(getDebugLogger(), 'warn')
      .mockImplementation(() => {})
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
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'persistence-verification-no-entry'
    )
    const persistedEntries = new Map<string, CacheEntry<{ value: number }>>()
    const persistence = {
      load: vi.fn(async (nodeKey) => persistedEntries.get(nodeKey)),
      save: vi.fn(async (nodeKey, entry) => {
        persistedEntries.set(nodeKey, { ...entry })
        persistedEntries.delete(nodeKey)
      }),
      delete: vi.fn(async () => undefined),
    }
    const warnSpy = vi
      .spyOn(getDebugLogger(), 'warn')
      .mockImplementation(() => {})
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

  test('supports disabling persisted write verification attempts', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'persistence-verification-disabled'
    )
    const persistedEntries = new Map<string, CacheEntry<{ value: number }>>()
    const persistence = {
      load: vi.fn(async (nodeKey) => persistedEntries.get(nodeKey)),
      save: vi.fn(async (nodeKey, entry) => {
        persistedEntries.set(nodeKey, { ...entry })
      }),
      delete: vi.fn(async () => undefined),
    }
    const store = new CacheStore({
      snapshot,
      persistence,
      persistedVerificationAttempts: 0,
    })
    let computeCount = 0

    const firstResult = await store.getOrCompute(
      'test:persistence-verification-disabled',
      { persist: true },
      async (ctx) => {
        computeCount += 1
        await ctx.recordFileDep('/index.ts')
        return { value: 1 }
      }
    )
    const secondResult = await store.getOrCompute(
      'test:persistence-verification-disabled',
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
    expect(persistence.save).toHaveBeenCalledTimes(1)
    expect(persistence.load).toHaveBeenCalledTimes(1)
  })

  test('treats fingerprint matches as superseded when a newer persisted revision wins', async () => {
    const fileSystem = new InMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const snapshot = new FileSystemSnapshot(
      fileSystem,
      'persistence-verification-fingerprint-match-superseded'
    )
    type PersistedEntry = CacheEntry<{ value: number }> & { revision: number }
    const persistedEntries = new Map<string, PersistedEntry>()
    let nextRevision = 0
    let shouldInjectSupersedingWinner = true
    const nodeKey = 'test:persistence-verification-fingerprint-match-superseded'
    const persistence = {
      load: vi.fn(async (lookupNodeKey: string) => {
        const current = persistedEntries.get(lookupNodeKey)
        if (!current) {
          return undefined
        }
        return { ...current }
      }),
      save: vi.fn(async (lookupNodeKey: string, entry: CacheEntry) => {
        const existingRevision =
          persistedEntries.get(lookupNodeKey)?.revision ?? 0
        persistedEntries.set(lookupNodeKey, {
          ...entry,
          revision: existingRevision,
        } as PersistedEntry)
      }),
      saveWithRevision: vi.fn(
        async (lookupNodeKey: string, entry: CacheEntry) => {
          nextRevision += 1
          const writtenRevision = nextRevision
          persistedEntries.set(lookupNodeKey, {
            ...entry,
            revision: writtenRevision,
          } as PersistedEntry)
          if (entry.value && shouldInjectSupersedingWinner) {
            shouldInjectSupersedingWinner = false
            nextRevision += 1
            persistedEntries.set(lookupNodeKey, {
              ...(entry as CacheEntry<{ value: number }>),
              value: { value: 2 },
              updatedAt: entry.updatedAt + 100,
              revision: nextRevision,
            })
          }
          return writtenRevision
        }
      ),
      delete: vi.fn(async (lookupNodeKey: string) => {
        persistedEntries.delete(lookupNodeKey)
      }),
    }
    const store = new CacheStore({ snapshot, persistence })

    let computeCount = 0
    const firstResult = await store.getOrCompute(
      nodeKey,
      { persist: true },
      async (ctx) => {
        computeCount += 1
        ctx.recordDep('const:persistence-fingerprint-match', '1')
        return { value: 1 }
      }
    )

    const replayed = await store.get(nodeKey)

    expect(firstResult).toEqual({ value: 1 })
    expect(replayed).toEqual({ value: 2 })
    expect(computeCount).toBe(1)
    expect(persistence.saveWithRevision).toHaveBeenCalledTimes(1)
    expect(persistence.load).toHaveBeenCalled()
    expect(persistedEntries.get(nodeKey)).toMatchObject({
      value: { value: 2 },
      deps: [
        { depKey: 'const:persistence-fingerprint-match', depVersion: '1' },
      ],
      fingerprint: createFingerprint([
        { depKey: 'const:persistence-fingerprint-match', depVersion: '1' },
      ]),
      persist: true,
      revision: 2,
    })
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
    const warnSpy = vi
      .spyOn(getDebugLogger(), 'warn')
      .mockImplementation(() => {})
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

      const secondResult = await store.get(
        'test:persistence-verification-fallback-revisionless'
      )

      expect(firstResult).toEqual({ value: 1 })
      expect(secondResult).toEqual({ value: 2 })
      expect(computeCount).toBe(1)
      expect(
        persistedEntries.get(
          'test:persistence-verification-fallback-revisionless'
        )?.value
      ).toEqual({
        value: 2,
      })
      expect(
        persistedEntries.get(
          'test:persistence-verification-fallback-revisionless'
        )
      ).toMatchObject({
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
    const warnSpy = vi
      .spyOn(getDebugLogger(), 'warn')
      .mockImplementation(() => {})
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
    const warnSpy = vi
      .spyOn(getDebugLogger(), 'warn')
      .mockImplementation(() => {})
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
