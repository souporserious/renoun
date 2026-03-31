import { basename, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest'
import type { AnalysisOptions } from '../analysis/types.ts'
import type { RenounPrewarmTargets } from './prewarm.ts'

import { resolveSchemePath } from '../utils/path.ts'
import { getTsMorph } from '../utils/ts-morph.ts'

const moduleSpecifierExtension =
  extname(fileURLToPath(import.meta.url)) === '.js' ? '.js' : '.ts'
const repositoryRootPath = resolve(
  fileURLToPath(new URL('../../../../', import.meta.url))
)

const getProgramModuleSpecifier = `../analysis/get-program${moduleSpecifierExtension}`
const clientServerModuleSpecifier = `../analysis/client.server${moduleSpecifierExtension}`
const nodeFileSystemModuleSpecifier = `../file-system/NodeFileSystem${moduleSpecifierExtension}`
const entriesModuleSpecifier = `../file-system/entries${moduleSpecifierExtension}`
const nodeClientModuleSpecifier = `../analysis/node-client${moduleSpecifierExtension}`
const repositoryModuleSpecifier = `../file-system/Repository${moduleSpecifierExtension}`
const gitIgnoredModuleSpecifier = `../utils/is-file-path-git-ignored${moduleSpecifierExtension}`
const prewarmModuleSpecifier = `./prewarm${moduleSpecifierExtension}`

const getProjectMock = vi.fn()
const getClientServerProjectMock = vi.fn()
const getCachedTypeScriptDependencyPathsMock = vi.fn<
  (project: ProjectInstance, filePath: string) => Promise<string[]>
>()
const readDirectoryMock = vi.fn<
  (path: string) => Promise<
    Array<{
      name: string
      path: string
      isDirectory: boolean
      isFile: boolean
    }>
  >
>()
const readFileMock = vi.fn<(path: string) => Promise<string>>()
const fileExistsMock = vi.fn<(path: string) => Promise<boolean>>()
const fileExistsSyncMock = vi.fn<(path: string) => boolean>()
const nodeFileSystemConstructorMock = vi.fn<(options?: unknown) => void>()
const createHighlighterMock = vi.fn<(...args: any[]) => Promise<unknown>>()
const getFileExportsMock = vi.fn<(...args: any[]) => Promise<unknown>>()
const getOutlineRangesMock = vi.fn<(...args: any[]) => Promise<unknown>>()
const resolveFileExportsWithDependenciesMock =
  vi.fn<(...args: any[]) => Promise<unknown>>()
const getSourceTextMetadataMock = vi.fn<(...args: any[]) => Promise<unknown>>()
const getTokensMock = vi.fn<(...args: any[]) => Promise<unknown>>()
const entryGetCachedReferenceBaseDataMock =
  vi.fn<(filePath: string) => Promise<unknown>>()
const entryGetCachedReferenceDataMock =
  vi.fn<(filePath: string) => Promise<unknown>>()
const entryGetExportTypesMock = vi.fn<(filePath: string) => Promise<unknown>>()
const entryGetExportsMock = vi.fn<(filePath: string) => Promise<unknown>>()
const entryGetCachedGitExportMetadataByNameMock =
  vi.fn<(filePath: string) => Promise<unknown>>()
const entryGetLastCommitDateMock =
  vi.fn<(filePath: string) => Promise<unknown>>()
const entryGetOutlineRangesMock =
  vi.fn<(filePath: string) => Promise<unknown>>()
const entryGetStructureMock =
  vi.fn<(directoryPath: string, options?: unknown) => Promise<unknown>>()
const entryGetSectionsMock = vi.fn<(filePath: string) => Promise<unknown>>()
const entryGetStaticExportValueMock =
  vi.fn<(filePath: string, name: string) => Promise<unknown>>()
const getMarkdownSectionsMock = vi.fn<(source: string) => unknown>()
const getMDXSectionsMock = vi.fn<(source: string) => unknown>()
const isFilePathGitIgnoredMock = vi.fn(() => false)
const getWorkspaceChangeTokenMock =
  vi.fn<(rootPath: string) => Promise<string | null>>()
const getWorkspaceChangedPathsSinceTokenMock =
  vi.fn<
    (
      rootPath: string,
      previousToken: string
    ) => Promise<readonly string[] | null>
  >()
const registerSparsePathMock = vi.fn<(path: string) => void>()
const prepareAnalysisRootMock = vi.fn<() => Promise<unknown>>()
const repositoryGetExportHistoryMock =
  vi.fn<(options?: Record<string, unknown>) => AsyncGenerator<unknown, unknown, void>>()
const repositoryResolveMock = vi.fn()

const { Project } = getTsMorph()
type ProjectInstance = InstanceType<typeof Project>

const analysisOptions: AnalysisOptions = {
  tsConfigFilePath: '/repo/tsconfig.json',
  compilerOptions: {},
  useInMemoryFileSystem: true,
}

let project: ProjectInstance

class MockNodeFileSystem {
  constructor(options?: unknown) {
    nodeFileSystemConstructorMock(options)
  }

  getAbsolutePath(path: string): string {
    return resolve(path)
  }

  getWorkspaceChangeToken(rootPath: string): Promise<string | null> {
    return getWorkspaceChangeTokenMock(rootPath)
  }

  getWorkspaceChangedPathsSinceToken(
    rootPath: string,
    previousToken: string
  ): Promise<readonly string[] | null> {
    return getWorkspaceChangedPathsSinceTokenMock(rootPath, previousToken)
  }

  readDirectory(path: string) {
    return readDirectoryMock(path)
  }

  readFile(path: string) {
    return readFileMock(path)
  }

  fileExists(path: string) {
    return fileExistsMock(path)
  }

  fileExistsSync(path: string): boolean {
    return fileExistsSyncMock(path)
  }
}

function createMockWarmEntryFile(filePath: string) {
  return {
    absolutePath: filePath,
    extension: extname(filePath).replace(/^\./, ''),
    isDirectory: false,
    isFile: true,
    relativePath: basename(filePath),
    workspacePath: filePath,
    getCachedReferenceBaseData: () =>
      entryGetCachedReferenceBaseDataMock(filePath),
    getCachedReferenceData: () => entryGetCachedReferenceDataMock(filePath),
    getCachedGitExportMetadataByName: () =>
      entryGetCachedGitExportMetadataByNameMock(filePath),
    getLastCommitDate: () => entryGetLastCommitDateMock(filePath),
    getExportTypes: () => entryGetExportTypesMock(filePath),
    getExports: () => entryGetExportsMock(filePath),
    getOutlineRanges: () => entryGetOutlineRangesMock(filePath),
    getSections: () => entryGetSectionsMock(filePath),
    getStaticExportValue: (name: string) =>
      entryGetStaticExportValueMock(filePath, name),
    getPathname() {
      const currentRelativePath =
        typeof this.relativePath === 'string'
          ? this.relativePath
          : basename(filePath)
      const normalizedRelativePath = currentRelativePath.replace(/\\/g, '/')
      const withoutExtension = normalizedRelativePath.replace(/\.[^.]+$/u, '')
      const pathname = withoutExtension.replace(/\/(index|readme)$/iu, '')
      return pathname ? `/${pathname}` : '/'
    },
  }
}

class MockEntriesDirectory {
  readonly #path: string
  readonly #logicalRepositoryPath: string | undefined

  constructor(options?: {
    path?: string
    fileSystem?: unknown
    repository?: unknown
  }) {
    this.#logicalRepositoryPath =
      options?.repository && options?.path && !String(options.path).startsWith('/')
        ? resolve('/repo', String(options.path))
        : undefined
    const basePath =
      options?.repository && options?.path && !String(options.path).startsWith('/')
        ? resolve('/repo', String(options.path))
        : resolve(options?.path ?? '.')
    this.#path = basePath
  }

  #getRepositoryRelativePath(filePath: string): string | undefined {
    if (!this.#logicalRepositoryPath) {
      return undefined
    }

    const normalizedFilePath = resolve(filePath).replace(/\\/g, '/')
    if (!normalizedFilePath.includes('/.renoun/cache/')) {
      return undefined
    }

    const normalizedLogicalRepositoryPath =
      this.#logicalRepositoryPath.replace(/\\/g, '/')
    const logicalRepositorySuffix = normalizedLogicalRepositoryPath.replace(
      /^\/repo\//u,
      ''
    )
    const marker = `/${logicalRepositorySuffix}/`
    const markerIndex = normalizedFilePath.indexOf(marker)

    if (markerIndex === -1) {
      return undefined
    }

    return normalizedFilePath.slice(markerIndex + marker.length)
  }

  async getStructure(options?: unknown) {
    return entryGetStructureMock(this.#path, options)
  }

  async getEntries(options?: {
    recursive?: boolean
    includeDirectoryNamedFiles?: boolean
    includeIndexAndReadmeFiles?: boolean
  }) {
    const collect = async (directoryPath: string): Promise<any[]> => {
      const entries = await readDirectoryMock(directoryPath)
      const files: any[] = []

      for (const entry of entries) {
        if (entry.isDirectory) {
          if (options?.recursive) {
            files.push(...(await collect(entry.path)))
          }
          continue
        }

        if (!entry.isFile) {
          continue
        }

        const filePath = resolve(entry.path)
        const baseNameWithoutExtensions = basename(filePath).replace(
          /\.[^.]+/g,
          ''
        )
        const parentName = basename(resolve(directoryPath))

        if (
          options?.includeIndexAndReadmeFiles === false &&
          /^(index|readme)$/i.test(baseNameWithoutExtensions)
        ) {
          continue
        }

        if (
          options?.includeDirectoryNamedFiles === false &&
          baseNameWithoutExtensions.toLowerCase() === parentName.toLowerCase()
        ) {
          continue
        }

        const repositoryRelativePath = this.#getRepositoryRelativePath(filePath)

        files.push({
          ...createMockWarmEntryFile(filePath),
          absolutePath: filePath,
          relativePath: repositoryRelativePath ?? relative(this.#path, filePath),
          workspacePath: filePath,
          extension: extname(filePath).replace(/^\./, ''),
        })
      }

      return files
    }

    return collect(this.#path)
  }

  async getTree(options?: {
    includeIndexAndReadmeFiles?: boolean
  }): Promise<
    Array<{
      entry: unknown
      children?: Array<{
        entry: unknown
        children?: unknown[]
      }>
    }>
  > {
    const build = async (
      directoryPath: string
    ): Promise<
      Array<{
        entry: unknown
        children?: Array<{
          entry: unknown
          children?: unknown[]
        }>
      }>
    > => {
      const entries = await readDirectoryMock(directoryPath)
      const nodes: Array<{
        entry: unknown
        children?: Array<{
          entry: unknown
          children?: unknown[]
        }>
      }> = []

      for (const entry of entries) {
        if (entry.isDirectory) {
          const children = await build(entry.path)
          const directoryEntry = {
            isDirectory: true,
            isFile: false,
            relativePath: basename(resolve(entry.path)),
            workspacePath: resolve(entry.path),
          }
          nodes.push(children.length > 0 ? { entry: directoryEntry, children } : { entry: directoryEntry })
          continue
        }

        if (!entry.isFile) {
          continue
        }

        const filePath = resolve(entry.path)
        const baseNameWithoutExtensions = basename(filePath).replace(
          /\.[^.]+/g,
          ''
        )

        if (
          options?.includeIndexAndReadmeFiles === false &&
          /^(index|readme)$/i.test(baseNameWithoutExtensions)
        ) {
          continue
        }

        const repositoryRelativePath = this.#getRepositoryRelativePath(filePath)

        nodes.push({
          entry: {
            ...createMockWarmEntryFile(filePath),
            absolutePath: filePath,
            relativePath:
              repositoryRelativePath ?? relative(this.#path, filePath),
            workspacePath: filePath,
            extension: extname(filePath).replace(/^\./, ''),
          },
        })
      }

      return nodes
    }

    return build(this.#path)
  }

  async getFile(path: string | string[], extension?: string | string[]) {
    const normalizedPath = Array.isArray(path) ? path.join('/') : path
    const normalizedExtension = Array.isArray(extension)
      ? extension[0]
      : extension
    const resolvedPath = resolve(
      this.#path,
      normalizedExtension
        ? `${normalizedPath}.${normalizedExtension}`
        : normalizedPath
    )

    return createMockWarmEntryFile(resolvedPath)
  }
}

function createMockFileEntry(path: string): {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
} {
  return {
    name: basename(path),
    path,
    isDirectory: false,
    isFile: true,
  }
}

vi.mock('@renoun/mdx/utils', () => ({
  getMarkdownSections: getMarkdownSectionsMock,
  getMDXSections: getMDXSectionsMock,
}))

let startPrewarmRenounRpcServerCache:
  | ((
      options?: {
        analysisOptions?: AnalysisOptions
        requestPriority?: 'bootstrap' | 'immediate' | 'background'
      }
    ) => {
      ready: Promise<void>
      settled: Promise<void>
    })
  | undefined
let collectRenounPrewarmTargets:
  | ((
      project: ProjectInstance,
      analysisOptions?: AnalysisOptions
    ) => Promise<RenounPrewarmTargets>)
  | undefined

async function runPrewarmToSettled(options?: {
  analysisOptions?: AnalysisOptions
}): Promise<void> {
  const prewarm = startPrewarmRenounRpcServerCache!(options)
  await prewarm.ready
  await prewarm.settled
}

beforeAll(async () => {
  vi.doMock(getProgramModuleSpecifier, () => ({
    getProgram: getProjectMock,
  }))

  vi.doMock(clientServerModuleSpecifier, () => ({
    createHighlighter: createHighlighterMock,
    getCachedFileExports: getFileExportsMock,
    getCachedOutlineRanges: getOutlineRangesMock,
    getCachedSourceTextMetadata: getSourceTextMetadataMock,
    getCachedTokens: getTokensMock,
    getProgram: getClientServerProjectMock,
    getCachedTypeScriptDependencyPaths: getCachedTypeScriptDependencyPathsMock,
    resolveCachedFileExportsWithDependencies:
      resolveFileExportsWithDependenciesMock,
  }))

  vi.doMock(nodeFileSystemModuleSpecifier, () => ({
    NodeFileSystem: MockNodeFileSystem,
  }))

  vi.doMock(entriesModuleSpecifier, () => ({
    Directory: MockEntriesDirectory,
    isFile: (entry: { isFile?: boolean; absolutePath?: string }) =>
      entry?.isFile === true || typeof entry?.absolutePath === 'string',
  }))

  vi.doMock(nodeClientModuleSpecifier, () => ({
    getFileExports: getFileExportsMock,
    getOutlineRanges: getOutlineRangesMock,
    getSourceTextMetadata: getSourceTextMetadataMock,
    getTypeScriptDependencyPaths: getCachedTypeScriptDependencyPathsMock,
    getTokens: getTokensMock,
    resolveFileExportsWithDependencies: resolveFileExportsWithDependenciesMock,
  }))

  vi.doMock(repositoryModuleSpecifier, () => ({
    Repository: {
      resolve: repositoryResolveMock,
      resolveUnsafe: repositoryResolveMock,
    },
  }))

  vi.doMock(gitIgnoredModuleSpecifier, () => ({
    isFilePathGitIgnored: isFilePathGitIgnoredMock,
  }))

  const prewarm = await import(prewarmModuleSpecifier)
  startPrewarmRenounRpcServerCache = prewarm.startPrewarmRenounRpcServerCache
  collectRenounPrewarmTargets = prewarm.collectRenounPrewarmTargets
})

beforeEach(() => {
  vi.clearAllMocks()

  process.env.RENOUN_SERVER_PORT = '1234'
  process.env.RENOUN_SERVER_ID = 'test-server-id'
  project = new Project({ useInMemoryFileSystem: true })
  getProjectMock.mockReturnValue(project)
  getClientServerProjectMock.mockReturnValue(project)
  getCachedTypeScriptDependencyPathsMock.mockResolvedValue([])

  readDirectoryMock.mockResolvedValue([])
  readFileMock.mockRejectedValue(new Error('File not found'))
  fileExistsMock.mockResolvedValue(false)
  fileExistsSyncMock.mockReturnValue(false)
  nodeFileSystemConstructorMock.mockReset()
  createHighlighterMock.mockResolvedValue({})
  getFileExportsMock.mockResolvedValue(undefined)
  getOutlineRangesMock.mockResolvedValue(undefined)
  resolveFileExportsWithDependenciesMock.mockResolvedValue({
    exports: [],
    dependencies: [],
  })
  getSourceTextMetadataMock.mockImplementation(async (...args) => {
    const options = (args[args.length - 1] ?? {}) as Record<string, unknown>
    return {
      value: options['value'],
      language: options['language'],
      filePath:
        typeof options['filePath'] === 'string'
          ? options['filePath']
          : '/virtual/snippet.ts',
    }
  })
  getTokensMock.mockResolvedValue([])
  entryGetCachedReferenceBaseDataMock.mockResolvedValue(undefined)
  entryGetCachedReferenceDataMock.mockResolvedValue(undefined)
  entryGetExportTypesMock.mockResolvedValue([])
  entryGetExportsMock.mockResolvedValue([])
  entryGetCachedGitExportMetadataByNameMock.mockResolvedValue({})
  entryGetLastCommitDateMock.mockResolvedValue(undefined)
  entryGetOutlineRangesMock.mockResolvedValue([])
  entryGetStructureMock.mockResolvedValue([])
  entryGetSectionsMock.mockResolvedValue([])
  entryGetStaticExportValueMock.mockResolvedValue(undefined)
  getMarkdownSectionsMock.mockReturnValue([])
  getMDXSectionsMock.mockReturnValue([])
  getWorkspaceChangeTokenMock.mockResolvedValue(null)
  getWorkspaceChangedPathsSinceTokenMock.mockResolvedValue(null)
  registerSparsePathMock.mockReset()
  prepareAnalysisRootMock.mockReset()
  repositoryGetExportHistoryMock.mockReset()
  repositoryResolveMock.mockReset()
  prepareAnalysisRootMock.mockResolvedValue(undefined)
  repositoryGetExportHistoryMock.mockImplementation(async function* () {
    return {
      generatedAt: new Date(0).toISOString(),
      repo: 'mock-repo',
      entryFiles: [],
      exports: {},
      nameToId: {},
    }
  })
  repositoryResolveMock.mockReturnValue({
    registerSparsePath: registerSparsePathMock,
    getExportHistory: repositoryGetExportHistoryMock,
    getFileSystem: () => ({
      prepareAnalysisRoot: prepareAnalysisRootMock,
    }),
  })
})

afterEach(() => {
  delete process.env.RENOUN_SERVER_PORT
  delete process.env.RENOUN_SERVER_ID
  delete process.env.NODE_ENV
})

describe('prewarm cache warming', () => {
  test('collects callsites and prewarms file entry caches plus markdown analysis', async () => {
    project.createSourceFile(
      '/repo/src/test.ts',
      `
        import { Directory as Dir } from 'renoun'
        import * as Renoun from 'renoun'

        const direct = new Dir('/repo/direct')
        const objectPath = new Dir({ path: '/repo/object' })
        const namespaced = new Renoun.Directory('/repo/namespaced')
        const basePath = '/repo/inline'
        const variable = new Dir(basePath)

        direct.getEntries()
        objectPath.getEntries()
        namespaced.getEntries()
        new Dir('/repo/inline').getEntries()
        variable.getEntries()
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockImplementation(async (directoryPath: string) => {
      const entriesByPath = new Map<
        string,
        Array<{
          name: string
          path: string
          isDirectory: boolean
          isFile: boolean
        }>
      >([
        [
          '/repo/direct',
          [
            createMockFileEntry('/repo/direct/index.ts'),
            createMockFileEntry('/repo/direct/notes.txt'),
          ],
        ],
        ['/repo/object', [createMockFileEntry('/repo/object/main.mts')]],
        [
          '/repo/namespaced',
          [
            createMockFileEntry('/repo/namespaced/page.mjs'),
            createMockFileEntry('/repo/namespaced/readme.md'),
            createMockFileEntry('/repo/namespaced/guide.mdx'),
          ],
        ],
        ['/repo/inline', [createMockFileEntry('/repo/inline/content.tsx')]],
      ])

      return entriesByPath.get(directoryPath) ?? []
    })

    readFileMock.mockImplementation(async (path) => {
      if (path === '/repo/namespaced/readme.md') {
        return '# Markdown readme'
      }

      if (path === '/repo/namespaced/guide.mdx') {
        return '# MDX guide'
      }

      throw new Error(`Unexpected file read: ${path}`)
    })

    await runPrewarmToSettled({ analysisOptions })

    expect(
      entryGetExportsMock.mock.calls.map((call) => call[0]).sort()
    ).toEqual(
      [
        '/repo/direct/index.ts',
        '/repo/object/main.mts',
        '/repo/namespaced/page.mjs',
        '/repo/inline/content.tsx',
      ].sort()
    )

    expect(
      entryGetOutlineRangesMock.mock.calls.map((call) => call[0]).sort()
    ).toEqual(
      [
        '/repo/direct/index.ts',
        '/repo/object/main.mts',
        '/repo/namespaced/page.mjs',
        '/repo/inline/content.tsx',
      ].sort()
    )

    expect(
      entryGetSectionsMock.mock.calls.map((call) => call[0]).sort()
    ).toEqual(
      [
        '/repo/direct/index.ts',
        '/repo/inline/content.tsx',
        '/repo/namespaced/guide.mdx',
        '/repo/namespaced/page.mjs',
        '/repo/namespaced/readme.md',
        '/repo/object/main.mts',
      ].sort()
    )
    expect(readFileMock.mock.calls.map((call) => call[0]).sort()).toEqual(
      ['/repo/namespaced/guide.mdx', '/repo/namespaced/readme.md'].sort()
    )

    expect(getProjectMock).toHaveBeenCalledWith(analysisOptions)
    expect(readDirectoryMock).toHaveBeenCalled()
  })

  test('prewarms Directory#getStructure callsites', async () => {
    project.createSourceFile(
      '/repo/src/search.ts',
      `
        import { Directory } from 'renoun'

        const docs = new Directory('/repo/docs')

        docs.getStructure({
          includeExports: 'headers',
          includeSections: false,
          includeDescriptions: 'snippet',
          includeResolvedTypes: false,
          includeGitDates: true,
        })
      `,
      { overwrite: true }
    )

    await runPrewarmToSettled({ analysisOptions })

    expect(entryGetStructureMock).toHaveBeenCalledWith('/repo/docs', {
      includeExports: 'headers',
      includeSections: false,
      includeDescriptions: 'snippet',
      includeResolvedTypes: false,
      includeGitDates: true,
    })
  })

  test('prewarms repository-backed Directory#getStructure callsites with sparse scope', async () => {
    project.createSourceFile(
      '/repo/src/search-remote.ts',
      `
        import { Directory, Repository } from 'renoun'

        const docsRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          repository: docsRepository,
        })

        docs.getStructure({
          includeExports: 'headers',
          includeSections: false,
          includeResolvedTypes: false,
          includeGitDates: 'first',
        })
      `,
      { overwrite: true }
    )

    await runPrewarmToSettled({ analysisOptions })

    expect(registerSparsePathMock).toHaveBeenCalledWith('./src/nodes')
    expect(prepareAnalysisRootMock).toHaveBeenCalledTimes(1)
    expect(entryGetStructureMock).toHaveBeenCalledWith('/repo/src/nodes', {
      includeExports: 'headers',
      includeSections: false,
      includeResolvedTypes: false,
      includeGitDates: 'first',
    })
    expect(prepareAnalysisRootMock.mock.invocationCallOrder[0]).toBeLessThan(
      entryGetStructureMock.mock.invocationCallOrder[0]
    )
  })

  test('does not block production server-backed prewarm on directory structure warming', async () => {
    process.env.NODE_ENV = 'production'

    project.createSourceFile(
      '/repo/src/search-background.ts',
      `
        import { Directory, Repository } from 'renoun'

        const docsRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          repository: docsRepository,
        })

        docs.getStructure({
          includeExports: 'headers',
          includeSections: false,
          includeResolvedTypes: false,
          includeGitDates: 'first',
        })
      `,
      { overwrite: true }
    )

    let releaseStructureWarm: (() => void) | undefined
    const structureWarmBlocked = new Promise<void>((resolve) => {
      releaseStructureWarm = resolve
    })
    let markStructureWarmStarted: (() => void) | undefined
    const structureWarmStarted = new Promise<void>((resolve) => {
      markStructureWarmStarted = resolve
    })

    entryGetStructureMock.mockImplementation(
      async (_directoryPath: string, options?: unknown) => {
        const structureOptions = (options ?? {}) as Record<string, unknown>

        if (
          structureOptions.includeResolvedTypes === false &&
          structureOptions.includeSections === false &&
          structureOptions.includeGitDates === false &&
          structureOptions.includeAuthors === false
        ) {
          return []
        }

        markStructureWarmStarted?.()
        await structureWarmBlocked
        return []
      }
    )

    let prewarm:
      | ReturnType<NonNullable<typeof startPrewarmRenounRpcServerCache>>
      | undefined

    try {
      prewarm = startPrewarmRenounRpcServerCache!({ analysisOptions })
      const prewarmStatus = await Promise.race([
        prewarm.ready.then(() => 'resolved'),
        new Promise<'timeout'>((resolve) => {
          setTimeout(() => resolve('timeout'), 1_000)
        }),
      ])

      expect(prewarmStatus).toBe('resolved')

      const backgroundStatus = await Promise.race([
        structureWarmStarted.then(() => 'started'),
        new Promise<'timeout'>((resolve) => {
          setTimeout(() => resolve('timeout'), 250)
        }),
      ])

      expect(backgroundStatus).toBe('started')
    } finally {
      releaseStructureWarm?.()
      await prewarm?.settled
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    }
  })

  test('prewarms dynamic getFile reference routes by warming matching directory files', async () => {
    project.createSourceFile(
      '/repo/src/page.tsx',
      `
        import { Directory, Reference } from 'renoun'

        const docs = new Directory('/repo/docs')

        async function renderPage(pathname: string) {
          const file = docs.getFile(pathname, 'ts')
          await file.getExports()
          await file.getLastCommitDate()
          return <Reference source={file} />
        }

        void renderPage
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockImplementation(async (directoryPath: string) => {
      const entriesByPath = new Map<
        string,
        Array<{
          name: string
          path: string
          isDirectory: boolean
          isFile: boolean
        }>
      >([
        [
          '/repo/docs',
          [
            createMockFileEntry('/repo/docs/a.ts'),
            createMockFileEntry('/repo/docs/b.ts'),
          ],
        ],
      ])

      return entriesByPath.get(directoryPath) ?? []
    })

    await runPrewarmToSettled({ analysisOptions })

    expect(entryGetExportsMock.mock.calls.map((call) => call[0]).sort()).toEqual([
      '/repo/docs/a.ts',
      '/repo/docs/b.ts',
    ])
    expect(entryGetExportTypesMock).not.toHaveBeenCalled()
    expect(
      entryGetCachedReferenceBaseDataMock.mock.calls
        .map((call) => call[0])
        .sort()
    ).toEqual(['/repo/docs/a.ts', '/repo/docs/b.ts'])
    expect(
      entryGetLastCommitDateMock.mock.calls.map((call) => call[0]).sort()
    ).toEqual(['/repo/docs/a.ts', '/repo/docs/b.ts'])
    expect(
      entryGetCachedGitExportMetadataByNameMock.mock.calls
        .map((call) => call[0])
        .sort()
    ).toEqual(['/repo/docs/a.ts', '/repo/docs/b.ts'])
  })

  test('prewarms getTree leaf routes using navigation tree leaves instead of raw entry pathnames', async () => {
    project.createSourceFile(
      '/repo/src/repository-tree-page.tsx',
      `
        import { Directory, Reference, Repository } from 'renoun'

        const docsRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          repository: docsRepository,
        })

        docs.getTree()

        async function renderPage(pathname: string) {
          const file = docs.getFile(pathname, 'ts')
          await file.getExports()
          await file.getLastCommitDate()
          return <Reference source={file} />
        }

        void renderPage
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockImplementation(async (directoryPath: string) => {
      const entriesByPath = new Map<
        string,
        Array<{
          name: string
          path: string
          isDirectory: boolean
          isFile: boolean
        }>
      >([
        [
          '/repo/src/nodes',
          [
            createMockFileEntry('/repo/src/nodes/tsl.ts'),
            {
              name: 'tsl',
              path: '/repo/src/nodes/tsl',
              isDirectory: true,
              isFile: false,
            },
          ],
        ],
        [
          '/repo/src/nodes/tsl',
          [createMockFileEntry('/repo/src/nodes/tsl/base.ts')],
        ],
      ])

      return entriesByPath.get(directoryPath) ?? []
    })

    await runPrewarmToSettled({ analysisOptions })

    expect(registerSparsePathMock).toHaveBeenCalledWith('./src/nodes')
    expect(prepareAnalysisRootMock).toHaveBeenCalledTimes(1)
    expect(entryGetExportsMock.mock.calls.map((call) => call[0]).sort()).toEqual([
      '/repo/src/nodes/tsl.ts',
      '/repo/src/nodes/tsl/base.ts',
    ])
    expect(
      entryGetCachedReferenceBaseDataMock.mock.calls
        .map((call) => call[0])
        .sort()
    ).toEqual(['/repo/src/nodes/tsl.ts', '/repo/src/nodes/tsl/base.ts'])
  })

  test('is a no-op when server environment variables are missing', async () => {
    delete process.env.RENOUN_SERVER_PORT
    delete process.env.RENOUN_SERVER_ID

    await runPrewarmToSettled()

    expect(getProjectMock).not.toHaveBeenCalled()
    expect(readDirectoryMock).not.toHaveBeenCalled()
    expect(readFileMock).not.toHaveBeenCalled()
    expect(entryGetExportsMock).not.toHaveBeenCalled()
    expect(entryGetOutlineRangesMock).not.toHaveBeenCalled()
    expect(entryGetSectionsMock).not.toHaveBeenCalled()
  })

  test('skips prewarm when workspace token is unchanged and reruns when token changes', async () => {
    const tokenProjectOptions: AnalysisOptions = {
      ...analysisOptions,
      tsConfigFilePath: `/repo/tsconfig.${Date.now()}.json`,
    }

    project.createSourceFile(
      '/repo/src/token-gate.ts',
      `
        import { Directory } from 'renoun'
        const posts = new Directory('/repo/posts')
        posts.getEntries()
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockResolvedValue([
      createMockFileEntry('/repo/posts/index.ts'),
    ])
    getWorkspaceChangeTokenMock.mockResolvedValue('workspace-token-a')

    await runPrewarmToSettled({ analysisOptions: tokenProjectOptions })
    expect(getProjectMock).toHaveBeenCalledTimes(1)
    expect(readDirectoryMock).toHaveBeenCalledTimes(1)

    await runPrewarmToSettled({ analysisOptions: tokenProjectOptions })
    expect(getProjectMock).toHaveBeenCalledTimes(2)
    expect(readDirectoryMock).toHaveBeenCalledTimes(1)

    getWorkspaceChangeTokenMock.mockResolvedValue('workspace-token-b')
    await runPrewarmToSettled({ analysisOptions: tokenProjectOptions })
    expect(getProjectMock).toHaveBeenCalledTimes(3)
    expect(readDirectoryMock).toHaveBeenCalledTimes(2)
  })

  test('skips full prewarm in production when workspace token is unchanged', async () => {
    const tokenProjectOptions: AnalysisOptions = {
      ...analysisOptions,
      tsConfigFilePath: `/repo/tsconfig.production.${Date.now()}.json`,
    }

    project.createSourceFile(
      '/repo/src/production-token-gate.ts',
      `
        import { Directory } from 'renoun'
        const posts = new Directory('/repo/posts')
        posts.getEntries()
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockResolvedValue([
      createMockFileEntry('/repo/posts/index.ts'),
    ])
    getWorkspaceChangeTokenMock.mockResolvedValue('workspace-token-a')
    process.env.NODE_ENV = 'production'

    await runPrewarmToSettled({ analysisOptions: tokenProjectOptions })
    expect(getProjectMock).toHaveBeenCalledTimes(1)
    expect(readDirectoryMock).toHaveBeenCalledTimes(1)

    await runPrewarmToSettled({ analysisOptions: tokenProjectOptions })
    expect(getProjectMock).toHaveBeenCalledTimes(2)
    expect(readDirectoryMock).toHaveBeenCalledTimes(1)
  })

  test('still bootstraps repository analysis roots when workspace token is unchanged', async () => {
    const tokenProjectOptions: AnalysisOptions = {
      ...analysisOptions,
      tsConfigFilePath: `/repo/tsconfig.production-repository.${Date.now()}.json`,
    }

    project.createSourceFile(
      '/repo/src/production-repository-token-gate.ts',
      `
        import { Directory, Repository } from 'renoun'

        const docsRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          repository: docsRepository,
        })

        docs.getStructure({
          includeExports: 'headers',
        })
      `,
      { overwrite: true }
    )

    getWorkspaceChangeTokenMock.mockResolvedValue('workspace-token-a')
    process.env.NODE_ENV = 'production'

    await runPrewarmToSettled({ analysisOptions: tokenProjectOptions })
    expect(prepareAnalysisRootMock).toHaveBeenCalledTimes(1)
    expect(entryGetStructureMock).toHaveBeenCalledTimes(1)

    await runPrewarmToSettled({ analysisOptions: tokenProjectOptions })
    expect(prepareAnalysisRootMock).toHaveBeenCalledTimes(2)
    expect(entryGetStructureMock).toHaveBeenCalledTimes(1)
  })

  test('uses the project root as the workspace token scope when available', async () => {
    const nestedProjectOptions: AnalysisOptions = {
      ...analysisOptions,
      tsConfigFilePath: resolve(
        repositoryRootPath,
        `apps/site/tsconfig.token-scope.${Date.now()}.json`
      ),
    }

    project.createSourceFile(
      resolve(repositoryRootPath, 'apps/site/src/token-scope.ts'),
      `
        import { Directory } from 'renoun'
        const posts = new Directory('/repo/posts')
        posts.getEntries()
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockResolvedValue([
      createMockFileEntry('/repo/posts/index.ts'),
    ])
    getWorkspaceChangeTokenMock.mockResolvedValue('workspace-token-a')

    await runPrewarmToSettled({ analysisOptions: nestedProjectOptions })

    expect(getWorkspaceChangeTokenMock).toHaveBeenCalledWith(repositoryRootPath)
    expect(readDirectoryMock).toHaveBeenCalledTimes(1)
  })

  test('incrementally rewarms only directory targets touched by changed paths', async () => {
    const tokenProjectOptions: AnalysisOptions = {
      ...analysisOptions,
      tsConfigFilePath: `/repo/tsconfig.incremental-directories.${Date.now()}.json`,
    }

    project.createSourceFile(
      '/repo/src/incremental-directories.ts',
      `
        import { Directory } from 'renoun'
        const posts = new Directory('/repo/posts')
        const guides = new Directory('/repo/guides')

        posts.getEntries()
        guides.getEntries()
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockImplementation(async (directoryPath: string) => {
      if (directoryPath === '/repo/posts') {
        return [createMockFileEntry('/repo/posts/index.ts')]
      }

      if (directoryPath === '/repo/guides') {
        return [createMockFileEntry('/repo/guides/index.ts')]
      }

      return []
    })

    getWorkspaceChangeTokenMock.mockResolvedValue('workspace-token-a')

    await runPrewarmToSettled({ analysisOptions: tokenProjectOptions })

    expect(readDirectoryMock).toHaveBeenCalledTimes(2)
    expect(entryGetExportsMock).toHaveBeenCalledTimes(2)

    getWorkspaceChangeTokenMock.mockResolvedValue('workspace-token-b')
    getWorkspaceChangedPathsSinceTokenMock.mockResolvedValue(['posts/index.ts'])

    await runPrewarmToSettled({ analysisOptions: tokenProjectOptions })

    expect(getWorkspaceChangedPathsSinceTokenMock).toHaveBeenCalledWith(
      '/repo',
      'workspace-token-a'
    )
    expect(readDirectoryMock).toHaveBeenCalledTimes(3)
    expect(readDirectoryMock.mock.calls.map((call) => call[0])).toEqual([
      '/repo/posts',
      '/repo/guides',
      '/repo/posts',
    ])
    expect(entryGetExportsMock).toHaveBeenCalledTimes(3)
    expect(entryGetExportsMock.mock.calls.map((call) => call[0])).toEqual([
      '/repo/posts/index.ts',
      '/repo/guides/index.ts',
      '/repo/posts/index.ts',
    ])
  })

  test('incrementally rewarms getFile targets when a cached dependency changes', async () => {
    const tokenProjectOptions: AnalysisOptions = {
      ...analysisOptions,
      tsConfigFilePath: `/repo/tsconfig.incremental-get-file.${Date.now()}.json`,
    }

    project.createSourceFile(
      '/repo/src/incremental-get-file.ts',
      `
        import { Directory } from 'renoun'
        const fileSystemDirectory = new Directory('/repo/packages/renoun/src/file-system')
        fileSystemDirectory.getFile('index')
      `,
      { overwrite: true }
    )

    fileExistsMock.mockImplementation(async (path) => {
      return path === '/repo/packages/renoun/src/file-system/index.tsx'
    })
    fileExistsSyncMock.mockImplementation((path) => {
      return path === '/repo/packages/renoun/tsconfig.json'
    })
    readDirectoryMock.mockImplementation(async (path) => {
      if (path === '/repo/packages/renoun/src/file-system/index.tsx') {
        throw new Error('Not a directory')
      }

      return []
    })
    getCachedTypeScriptDependencyPathsMock.mockResolvedValue([
      '/repo/packages/renoun/src/file-system/entries.ts',
    ])
    getWorkspaceChangeTokenMock.mockResolvedValue('workspace-token-a')

    await runPrewarmToSettled({ analysisOptions: tokenProjectOptions })

    expect(entryGetExportsMock).toHaveBeenCalledTimes(1)
    expect(entryGetExportTypesMock).toHaveBeenCalledTimes(1)

    getWorkspaceChangeTokenMock.mockResolvedValue('workspace-token-b')
    getWorkspaceChangedPathsSinceTokenMock.mockResolvedValue([
      'packages/renoun/src/file-system/entries.ts',
    ])

    await runPrewarmToSettled({ analysisOptions: tokenProjectOptions })

    expect(getWorkspaceChangedPathsSinceTokenMock).toHaveBeenCalledWith(
      '/repo',
      'workspace-token-a'
    )
    expect(entryGetExportsMock).toHaveBeenCalledTimes(2)
    expect(entryGetExportsMock.mock.calls.map((call) => call[0])).toEqual([
      '/repo/packages/renoun/src/file-system/index.tsx',
      '/repo/packages/renoun/src/file-system/index.tsx',
    ])
    expect(entryGetExportTypesMock).toHaveBeenCalledTimes(2)
    expect(entryGetExportTypesMock.mock.calls.map((call) => call[0])).toEqual([
      '/repo/packages/renoun/src/file-system/index.tsx',
      '/repo/packages/renoun/src/file-system/index.tsx',
    ])
  })

  test('prewarms javascript getFile targets for export headers and export types', async () => {
    project.createSourceFile(
      '/repo/src/reference-route.ts',
      `
        import { Directory } from 'renoun'

        const docs = new Directory('/repo/docs')
        const file = docs.getFile('reference', 'js')

        await file.getExports()
        await file.getExportTypes()
      `,
      { overwrite: true }
    )

    fileExistsMock.mockImplementation(async (path) => {
      return path === '/repo/docs/reference.js'
    })
    fileExistsSyncMock.mockImplementation((path) => {
      return path === '/repo/tsconfig.json'
    })
    readDirectoryMock.mockImplementation(async (path) => {
      if (path === '/repo/docs/reference.js') {
        throw new Error('Not a directory')
      }

      return []
    })

    await runPrewarmToSettled({ analysisOptions })

    expect(entryGetExportsMock).toHaveBeenCalledWith('/repo/docs/reference.js')
    expect(entryGetCachedReferenceBaseDataMock).toHaveBeenCalledWith(
      '/repo/docs/reference.js'
    )
    expect(entryGetExportTypesMock).toHaveBeenCalledWith(
      '/repo/docs/reference.js'
    )
    expect(
      entryGetCachedReferenceBaseDataMock.mock.invocationCallOrder[0]
    ).toBeLessThan(entryGetExportsMock.mock.invocationCallOrder[0]!)
    expect(
      entryGetCachedReferenceBaseDataMock.mock.invocationCallOrder[0]
    ).toBeLessThan(entryGetExportTypesMock.mock.invocationCallOrder[0]!)
  })

  test('does not prewarm shared reference data for export-only getFile targets', async () => {
    project.createSourceFile(
      '/repo/src/headers-only-route.ts',
      `
        import { Directory } from 'renoun'

        const docs = new Directory('/repo/docs')
        const file = docs.getFile('headers', 'js')

        await file.getExports()
      `,
      { overwrite: true }
    )

    fileExistsMock.mockImplementation(async (path) => {
      return path === '/repo/docs/headers.js'
    })
    fileExistsSyncMock.mockImplementation((path) => {
      return path === '/repo/tsconfig.json'
    })
    readDirectoryMock.mockImplementation(async (path) => {
      if (path === '/repo/docs/headers.js') {
        throw new Error('Not a directory')
      }

      return []
    })

    await runPrewarmToSettled({ analysisOptions })

    expect(entryGetExportsMock).toHaveBeenCalledWith('/repo/docs/headers.js')
    expect(entryGetCachedReferenceBaseDataMock).not.toHaveBeenCalled()
    expect(entryGetCachedReferenceDataMock).not.toHaveBeenCalled()
    expect(entryGetExportTypesMock).not.toHaveBeenCalled()
  })

  test('skips prewarm work when changed paths miss all cached targets', async () => {
    const tokenProjectOptions: AnalysisOptions = {
      ...analysisOptions,
      tsConfigFilePath: `/repo/tsconfig.incremental-skip.${Date.now()}.json`,
    }

    project.createSourceFile(
      '/repo/src/incremental-skip.ts',
      `
        import { Directory } from 'renoun'
        const posts = new Directory('/repo/posts')
        posts.getEntries()
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockResolvedValue([
      createMockFileEntry('/repo/posts/index.ts'),
    ])
    getWorkspaceChangeTokenMock.mockResolvedValue('workspace-token-a')

    await runPrewarmToSettled({ analysisOptions: tokenProjectOptions })

    expect(readDirectoryMock).toHaveBeenCalledTimes(1)
    expect(entryGetExportsMock).toHaveBeenCalledTimes(1)

    getWorkspaceChangeTokenMock.mockResolvedValue('workspace-token-b')
    getWorkspaceChangedPathsSinceTokenMock.mockResolvedValue([
      'guides/readme.mdx',
    ])

    await runPrewarmToSettled({ analysisOptions: tokenProjectOptions })

    expect(getProjectMock).toHaveBeenCalledTimes(2)
    expect(getWorkspaceChangedPathsSinceTokenMock).toHaveBeenCalledWith(
      '/repo',
      'workspace-token-a'
    )
    expect(readDirectoryMock).toHaveBeenCalledTimes(1)
    expect(entryGetExportsMock).toHaveBeenCalledTimes(1)
  })

  test('continues prewarming when one directory target fails enumeration', async () => {
    project.createSourceFile(
      '/repo/src/error.ts',
      `
        import { Directory } from 'renoun'
        const failingDirectory = new Directory('/repo/failing')
        const workingDirectory = new Directory('/repo/working')
        failingDirectory.getEntries()
        workingDirectory.getEntries()
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockImplementation(async (directoryPath: string) => {
      if (directoryPath === '/repo/failing') {
        throw new Error('Directory enumeration failed')
      }

      if (directoryPath === '/repo/working') {
        return [createMockFileEntry('/repo/working/index.ts')]
      }

      return []
    })

    await expect(
      runPrewarmToSettled({ analysisOptions })
    ).resolves.toBe(undefined)
    expect(entryGetExportsMock).toHaveBeenCalledWith('/repo/working/index.ts')
  })

  test('continues prewarming when one file cache warm method fails', async () => {
    project.createSourceFile(
      '/repo/src/error-exports.ts',
      `
        import { Directory } from 'renoun'
        const failingDirectory = new Directory('/repo/failing')
        const workingDirectory = new Directory('/repo/working')
        failingDirectory.getEntries()
        workingDirectory.getEntries()
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockImplementation(async (directoryPath: string) => {
      if (directoryPath === '/repo/failing') {
        return [createMockFileEntry('/repo/failing/index.ts')]
      }

      if (directoryPath === '/repo/working') {
        return [createMockFileEntry('/repo/working/index.ts')]
      }

      return []
    })

    entryGetExportsMock.mockImplementation(async (filePath: string) => {
      if (filePath === '/repo/failing/index.ts') {
        throw new Error('RPC cache prewarm failed')
      }
    })

    await expect(
      runPrewarmToSettled({ analysisOptions })
    ).resolves.toBe(undefined)
    expect(entryGetExportsMock).toHaveBeenCalledWith('/repo/failing/index.ts')
    expect(entryGetExportsMock).toHaveBeenCalledWith('/repo/working/index.ts')
    expect(entryGetOutlineRangesMock).toHaveBeenCalledWith(
      '/repo/working/index.ts'
    )
  })

  test('prewarms markdown code fence token caches after source metadata normalization', async () => {
    project.createSourceFile(
      '/repo/src/guides.ts',
      `
        import { Directory } from 'renoun'
        const guides = new Directory('/repo/guides')
        guides.getEntries()
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockResolvedValue([
      createMockFileEntry('/repo/guides/valibot.mdx'),
    ])
    readFileMock.mockResolvedValue(`
\`\`\`ts path="./examples/schema.ts" allowErrors="2307" showErrors={false}
const schema = { answer: 42 }
\`\`\`
`)

    getSourceTextMetadataMock.mockResolvedValue({
      value: 'const schema = { answer: 42 }\n',
      language: 'ts',
      filePath: '/repo/guides/examples/schema.ts',
    })

    await runPrewarmToSettled({ analysisOptions })

    expect(getSourceTextMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisOptions,
        filePath: './examples/schema.ts',
        baseDirectory: '/repo/guides',
        language: 'ts',
      })
    )
    expect(getCachedTypeScriptDependencyPathsMock).toHaveBeenCalledWith(
      '/repo/guides/examples/schema.ts',
      analysisOptions
    )
    expect(getTokensMock).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisOptions,
        allowErrors: '2307',
        value: 'const schema = { answer: 42 }\n',
        language: 'ts',
        filePath: '/repo/guides/examples/schema.ts',
        showErrors: false,
        theme: undefined,
        waitForWarmResult: true,
      })
    )
  })

  test('uses the nearest tsconfig for getFile export header and type prewarm targets', async () => {
    project.createSourceFile(
      '/repo/src/reference.ts',
      `
        import { Directory } from 'renoun'
        const fileSystemDirectory = new Directory('/repo/packages/renoun/src/file-system')
        fileSystemDirectory.getFile('index')
      `,
      { overwrite: true }
    )

    fileExistsMock.mockImplementation(async (path) => {
      return path === '/repo/packages/renoun/src/file-system/index.tsx'
    })
    fileExistsSyncMock.mockImplementation((path) => {
      return path === '/repo/packages/renoun/tsconfig.json'
    })
    readDirectoryMock.mockImplementation(async (path) => {
      if (path === '/repo/packages/renoun/src/file-system/index.tsx') {
        throw new Error('Not a directory')
      }

      return []
    })

    await runPrewarmToSettled({ analysisOptions })

    expect(nodeFileSystemConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tsConfigPath: '/repo/packages/renoun/tsconfig.json',
      })
    )
    expect(entryGetExportsMock).toHaveBeenCalledWith(
      '/repo/packages/renoun/src/file-system/index.tsx'
    )
    expect(entryGetExportTypesMock).toHaveBeenCalledWith(
      '/repo/packages/renoun/src/file-system/index.tsx'
    )
    expect(entryGetOutlineRangesMock).toHaveBeenCalledWith(
      '/repo/packages/renoun/src/file-system/index.tsx'
    )
  })

  test('prewarms export header and type caches for repository-backed getFile targets', async () => {
    project.createSourceFile(
      '/repo/src/remote-reference.tsx',
      `
        import { Directory, Reference, Repository } from 'renoun'

        const remoteRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          repository: remoteRepository,
        })
        const file = docs.getFile('TSL', 'js')

        file.getExports()
        const page = <Reference source={file} />
        docs.getRepository().getExportHistory()

        void page
      `,
      { overwrite: true }
    )

    fileExistsMock.mockImplementation(async (path) => {
      return path === '/repo/src/nodes/TSL.js'
    })
    fileExistsSyncMock.mockImplementation((path) => {
      return path === '/repo/tsconfig.json'
    })
    readDirectoryMock.mockImplementation(async (path) => {
      if (path === '/repo/src/nodes/TSL.js') {
        throw new Error('Not a directory')
      }

      return []
    })

    await runPrewarmToSettled({ analysisOptions })

    expect(entryGetExportsMock).toHaveBeenCalledWith('/repo/src/nodes/TSL.js')
    expect(entryGetCachedReferenceBaseDataMock).toHaveBeenCalledWith(
      '/repo/src/nodes/TSL.js'
    )
    expect(entryGetExportTypesMock).not.toHaveBeenCalled()
    expect(registerSparsePathMock).toHaveBeenCalledWith('./src/nodes')
    expect(prepareAnalysisRootMock).toHaveBeenCalledTimes(1)
    expect(repositoryGetExportHistoryMock).toHaveBeenCalledWith(undefined)
  })

  test('prewarms repository-backed dynamic getFile reference routes by warming matching repository files', async () => {
    project.createSourceFile(
      '/repo/src/remote-dynamic-reference.tsx',
      `
        import { Directory, Reference, Repository } from 'renoun'

        const remoteRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          repository: remoteRepository,
        })

        async function renderPage(pathname: string) {
          const file = docs.getFile(pathname, 'js')
          await file.getExports()
          await file.getLastCommitDate()
          return <Reference source={file} />
        }

        void renderPage
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockImplementation(async (directoryPath: string) => {
      if (directoryPath === '/repo/src/nodes') {
        return [
          createMockFileEntry('/repo/src/nodes/TSL.js'),
          createMockFileEntry('/repo/src/nodes/nodes.js'),
        ]
      }

      return []
    })

    await runPrewarmToSettled({ analysisOptions })

    expect(entryGetExportsMock.mock.calls.map((call) => call[0]).sort()).toEqual([
      '/repo/src/nodes/TSL.js',
      '/repo/src/nodes/nodes.js',
    ])
    expect(
      entryGetCachedReferenceBaseDataMock.mock.calls
        .map((call) => call[0])
        .sort()
    ).toEqual(['/repo/src/nodes/TSL.js', '/repo/src/nodes/nodes.js'])
    expect(entryGetExportTypesMock).not.toHaveBeenCalled()
    expect(
      entryGetLastCommitDateMock.mock.calls.map((call) => call[0]).sort()
    ).toEqual(['/repo/src/nodes/TSL.js', '/repo/src/nodes/nodes.js'])
    expect(
      entryGetCachedGitExportMetadataByNameMock.mock.calls
        .map((call) => call[0])
        .sort()
    ).toEqual(['/repo/src/nodes/TSL.js', '/repo/src/nodes/nodes.js'])
    expect(registerSparsePathMock).toHaveBeenCalledWith('./src/nodes')
  })

  test('prewarms repository-backed dynamic getFile routes even when materialized cache paths are gitignored', async () => {
    project.createSourceFile(
      '/repo/src/remote-dynamic-reference-gitignored.tsx',
      `
        import { Directory, Reference, Repository } from 'renoun'

        const remoteRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          repository: remoteRepository,
        })

        async function renderPage(pathname: string) {
          const file = docs.getFile(pathname, 'js')
          await file.getExports()
          await file.getLastCommitDate()
          return <Reference source={file} />
        }

        void renderPage
      `,
      { overwrite: true }
    )

    isFilePathGitIgnoredMock.mockImplementation((filePath: string) => {
      return filePath.includes('/.renoun/cache/')
    })

    readDirectoryMock.mockImplementation(async (directoryPath: string) => {
      if (directoryPath === '/repo/src/nodes') {
        return [
          createMockFileEntry(
            '/repo/.renoun/cache/git/github_mrdoob_threejs/src/nodes/TSL.js'
          ),
          createMockFileEntry(
            '/repo/.renoun/cache/git/github_mrdoob_threejs/src/nodes/nodes.js'
          ),
        ]
      }

      return []
    })

    await runPrewarmToSettled({ analysisOptions })

    expect(entryGetExportsMock.mock.calls.map((call) => call[0]).sort()).toEqual([
      '/repo/src/nodes/TSL.js',
      '/repo/src/nodes/nodes.js',
    ])
    expect(
      entryGetCachedReferenceBaseDataMock.mock.calls
        .map((call) => call[0])
        .sort()
    ).toEqual([
      '/repo/src/nodes/TSL.js',
      '/repo/src/nodes/nodes.js',
    ])
    expect(entryGetExportTypesMock).not.toHaveBeenCalled()
    expect(
      entryGetLastCommitDateMock.mock.calls.map((call) => call[0]).sort()
    ).toEqual([
      '/repo/src/nodes/TSL.js',
      '/repo/src/nodes/nodes.js',
    ])
    expect(
      entryGetCachedGitExportMetadataByNameMock.mock.calls
        .map((call) => call[0])
        .sort()
    ).toEqual([
      '/repo/src/nodes/TSL.js',
      '/repo/src/nodes/nodes.js',
    ])
  })

  test('limits server-backed high-fanout leaf-only route prewarm to a bounded representative sample', async () => {
    project.createSourceFile(
      '/repo/src/high-fanout-reference-route.tsx',
      `
        import { Directory, Reference, Repository, Section } from 'renoun'

        const docsRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          filter: '**/*.js',
          repository: docsRepository,
        })

        docs.getTree()

        async function renderPage(pathname: string) {
          const file = docs.getFile(pathname, 'js')
          await file.getExports()
          await file.getLastCommitDate()

          return (
            <>
              <Reference source={file} />
              <Section source={file} />
            </>
          )
        }

        void renderPage
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockImplementation(async (directoryPath: string) => {
      if (directoryPath === '/repo/src/nodes') {
        return Array.from({ length: 300 }, (_, index) =>
          createMockFileEntry(`/repo/src/nodes/Leaf${index}.js`)
        )
      }

      return []
    })

    await runPrewarmToSettled({ analysisOptions })

    expect(entryGetExportsMock).toHaveBeenCalledTimes(300)
    expect(entryGetCachedReferenceBaseDataMock).toHaveBeenCalledTimes(32)
    expect(entryGetLastCommitDateMock).toHaveBeenCalledTimes(32)
    expect(entryGetCachedGitExportMetadataByNameMock).toHaveBeenCalledTimes(32)
    expect(entryGetExportTypesMock).toHaveBeenCalledTimes(32)
    expect(entryGetOutlineRangesMock).toHaveBeenCalledTimes(32)
    expect(entryGetSectionsMock).toHaveBeenCalledTimes(32)
  })

  test('does not block production server-backed high-fanout leaf-only route prewarm on sampled leaf warming', async () => {
    process.env.NODE_ENV = 'production'

    project.createSourceFile(
      '/repo/src/high-fanout-background-reference-route.tsx',
      `
        import { Directory, Reference, Repository, Section } from 'renoun'

        const docsRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          filter: '**/*.js',
          repository: docsRepository,
        })

        docs.getTree()

        async function renderPage(pathname: string) {
          const file = docs.getFile(pathname, 'js')
          await file.getExports()
          await file.getLastCommitDate()

          return (
            <>
              <Reference source={file} />
              <Section source={file} />
            </>
          )
        }

        void renderPage
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockImplementation(async (directoryPath: string) => {
      if (directoryPath === '/repo/src/nodes') {
        return Array.from({ length: 300 }, (_, index) =>
          createMockFileEntry(`/repo/src/nodes/Leaf${index}.js`)
        )
      }

      return []
    })

    let releaseExportWarm: (() => void) | undefined
    const exportWarmBlocked = new Promise<void>((resolve) => {
      releaseExportWarm = resolve
    })
    let markExportWarmStarted: (() => void) | undefined
    const exportWarmStarted = new Promise<void>((resolve) => {
      markExportWarmStarted = resolve
    })

    entryGetExportsMock.mockImplementation(async () => {
      markExportWarmStarted?.()
      await exportWarmBlocked
      return []
    })

    let prewarm:
      | ReturnType<NonNullable<typeof startPrewarmRenounRpcServerCache>>
      | undefined

    try {
      prewarm = startPrewarmRenounRpcServerCache!({ analysisOptions })
      const prewarmStatus = await Promise.race([
        prewarm.ready.then(() => 'resolved'),
        new Promise<'timeout'>((resolve) => {
          setTimeout(() => resolve('timeout'), 250)
        }),
      ])

      expect(prewarmStatus).toBe('resolved')

      const backgroundStatus = await Promise.race([
        exportWarmStarted.then(() => 'started'),
        new Promise<'timeout'>((resolve) => {
          setTimeout(() => resolve('timeout'), 250)
        }),
      ])

      expect(backgroundStatus).toBe('started')
    } finally {
      releaseExportWarm?.()
      await prewarm?.settled
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    }
  })

  test('fully warms production server-backed moderate leaf-only route sets before sampling kicks in', async () => {
    process.env.NODE_ENV = 'production'

    project.createSourceFile(
      '/repo/src/moderate-reference-route.tsx',
      `
        import { Directory, Reference, Repository, Section } from 'renoun'

        const docsRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          filter: '**/*.js',
          repository: docsRepository,
        })

        docs.getTree()

        async function renderPage(pathname: string) {
          const file = docs.getFile(pathname, 'js')
          await file.getExports()
          await file.getLastCommitDate()

          return (
            <>
              <Reference source={file} />
              <Section source={file} />
            </>
          )
        }

        void renderPage
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockImplementation(async (directoryPath: string) => {
      if (directoryPath === '/repo/src/nodes') {
        return Array.from({ length: 96 }, (_, index) =>
          createMockFileEntry(`/repo/src/nodes/Leaf${index}.js`)
        )
      }

      return []
    })

    await runPrewarmToSettled({ analysisOptions })

    expect(entryGetExportsMock).toHaveBeenCalledTimes(96)
    expect(entryGetCachedReferenceBaseDataMock).toHaveBeenCalledTimes(96)
    expect(entryGetLastCommitDateMock).toHaveBeenCalledTimes(96)
    expect(entryGetCachedGitExportMetadataByNameMock).toHaveBeenCalledTimes(
      96
    )
    expect(entryGetExportTypesMock).toHaveBeenCalledTimes(96)
    expect(entryGetOutlineRangesMock).toHaveBeenCalledTimes(96)
  })

  test('preserves directory constructor filters when prewarming repository-backed dynamic reference routes', async () => {
    project.createSourceFile(
      '/repo/src/remote-dynamic-reference-filtered.tsx',
      `
        import { Directory, Reference, Repository } from 'renoun'

        const remoteRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          filter: '**/*.js',
          repository: remoteRepository,
        })

        docs.getTree()

        async function renderPage(pathname: string) {
          const file = docs.getFile(pathname, 'js')
          await file.getExports()
          await file.getLastCommitDate()
          return <Reference source={file} />
        }

        void renderPage
      `,
      { overwrite: true }
    )

    isFilePathGitIgnoredMock.mockImplementation((filePath: string) => {
      return filePath.includes('/.renoun/cache/')
    })

    readDirectoryMock.mockImplementation(async (directoryPath: string) => {
      if (directoryPath === '/repo/src/nodes') {
        return [
          createMockFileEntry(
            '/repo/.renoun/cache/git/github_mrdoob_threejs/src/nodes/TSL.js'
          ),
          createMockFileEntry(
            '/repo/.renoun/cache/git/github_mrdoob_threejs/src/nodes/Guide.mdx'
          ),
        ]
      }

      return []
    })

    await runPrewarmToSettled({ analysisOptions })

    expect(entryGetExportsMock.mock.calls.map((call) => call[0])).toEqual([
      '/repo/src/nodes/TSL.js',
    ])
    expect(entryGetCachedReferenceBaseDataMock.mock.calls.map((call) => call[0])).toEqual([
      '/repo/src/nodes/TSL.js',
    ])
    expect(entryGetExportTypesMock).not.toHaveBeenCalled()
    expect(entryGetLastCommitDateMock.mock.calls.map((call) => call[0])).toEqual([
      '/repo/src/nodes/TSL.js',
    ])
    expect(
      entryGetCachedGitExportMetadataByNameMock.mock.calls.map((call) => call[0])
    ).toEqual([
      '/repo/src/nodes/TSL.js',
    ])
  })

  test('bails out for unresolved Directory constructors during prewarm', async () => {
    project.createSourceFile(
      '/repo/src/unresolved.ts',
      `
        import { Directory } from 'renoun'

        function resolveDirectory() {
          return '/repo/should-not-touch'
        }

        const unresolvedDir = new Directory(resolveDirectory())
        const unresolvedNoArg = new Directory()

        const knownDirectory = new Directory('/repo/known')

        unresolvedDir.getEntries()
        unresolvedNoArg.getEntries()
        knownDirectory.getEntries()
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockImplementation(async (directoryPath: string) => {
      const entriesByPath = new Map<
        string,
        Array<{
          name: string
          path: string
          isDirectory: boolean
          isFile: boolean
        }>
      >([['/repo/known', [createMockFileEntry('/repo/known/index.ts')]]])

      return entriesByPath.get(directoryPath) ?? []
    })

    await runPrewarmToSettled({ analysisOptions })

    expect(readDirectoryMock).toHaveBeenCalledTimes(1)
    expect(readDirectoryMock).toHaveBeenCalledWith('/repo/known')
  })

  test('prewarms Next.js-style barrel-exported directories without dynamic-root fallback', async () => {
    project.createSourceFile(
      '/repo/src/content/renoun-directories.ts',
      `
        import { Collection, Directory } from 'renoun'

        const dynamicDirectory = process.env['RENOUN_APP_DIRECTORY']

        export const appDirectory = new Directory('/repo/src/app')
        export const routeDirectory = new Directory('/repo/src/app/api')
        export const marketingDirectory = new Directory('/repo/src/app/(marketing)')

        export const appCollections = new Collection({
          entries: [
            appDirectory,
            routeDirectory,
            new Directory(dynamicDirectory),
            marketingDirectory,
          ],
        })
      `,
      { overwrite: true }
    )

    project.createSourceFile(
      '/repo/src/content/renoun-entry.ts',
      `
        export { appDirectory, appCollections } from './renoun-directories'
      `,
      { overwrite: true }
    )

    project.createSourceFile(
      '/repo/src/app/page.tsx',
      `
        import { appDirectory, appCollections } from '../content/renoun-entry'

        appDirectory.getEntries({ recursive: true })
        appCollections.getEntries({ includeIndexAndReadmeFiles: false })
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockImplementation(async (directoryPath: string) => {
      const entriesByPath = new Map<
        string,
        Array<{
          name: string
          path: string
          isDirectory: boolean
          isFile: boolean
        }>
      >([
        ['/repo/src/app', [createMockFileEntry('/repo/src/app/page.tsx')]],
        [
          '/repo/src/app/api',
          [createMockFileEntry('/repo/src/app/api/route.ts')],
        ],
        [
          '/repo/src/app/(marketing)',
          [createMockFileEntry('/repo/src/app/(marketing)/campaign.ts')],
        ],
      ])

      return entriesByPath.get(directoryPath) ?? []
    })

    await runPrewarmToSettled({ analysisOptions })

    expect(readDirectoryMock).toHaveBeenCalledTimes(3)
    expect(readDirectoryMock).toHaveBeenCalledWith('/repo/src/app')
    expect(readDirectoryMock).toHaveBeenCalledWith('/repo/src/app/api')
    expect(readDirectoryMock).toHaveBeenCalledWith('/repo/src/app/(marketing)')
    expect(readDirectoryMock).not.toHaveBeenCalledWith('/repo')
  })

  test('prewarms Repository#getExportHistory targets with repository sparse scope', async () => {
    project.createSourceFile(
      '/repo/src/history.ts',
      `
        import { Directory, Repository } from 'renoun'

        const remoteRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          repository: remoteRepository,
        })
        const repo = docs.getRepository()

        repo.getExportHistory()
        new Repository('owner/direct').getExportHistory({
          entry: 'src/index.ts',
          ref: 'latest',
        })
      `,
      { overwrite: true }
    )

    await runPrewarmToSettled({ analysisOptions })

    expect(registerSparsePathMock).toHaveBeenCalledWith('./src/nodes')
    expect(repositoryGetExportHistoryMock).toHaveBeenCalledWith(undefined)
    expect(repositoryGetExportHistoryMock).toHaveBeenCalledWith({
      entry: 'src/index.ts',
      ref: 'latest',
    })
    expect(repositoryResolveMock.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining([
        { path: 'owner/repo', ref: 'main' },
        'owner/direct',
      ])
    )
  })

  test('does not block production server-backed prewarm on export history warming', async () => {
    process.env.NODE_ENV = 'production'

    project.createSourceFile(
      '/repo/src/history-background.ts',
      `
        import { Directory, Repository } from 'renoun'

        const remoteRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          repository: remoteRepository,
        })

        docs.getRepository().getExportHistory()
      `,
      { overwrite: true }
    )

    let releaseHistoryWarm: (() => void) | undefined
    const historyWarmBlocked = new Promise<void>((resolve) => {
      releaseHistoryWarm = resolve
    })
    let markHistoryWarmStarted: (() => void) | undefined
    const historyWarmStarted = new Promise<void>((resolve) => {
      markHistoryWarmStarted = resolve
    })

    repositoryGetExportHistoryMock.mockImplementation(async function* () {
      markHistoryWarmStarted?.()
      await historyWarmBlocked

      return {
        generatedAt: new Date(0).toISOString(),
        repo: 'mock-repo',
        entryFiles: [],
        exports: {},
        nameToId: {},
      }
    })

    let prewarm:
      | ReturnType<NonNullable<typeof startPrewarmRenounRpcServerCache>>
      | undefined

    try {
      prewarm = startPrewarmRenounRpcServerCache!({ analysisOptions })
      const prewarmStatus = await Promise.race([
        prewarm.ready.then(() => 'resolved'),
        new Promise<'timeout'>((resolve) => {
          setTimeout(() => resolve('timeout'), 250)
        }),
      ])

      expect(prewarmStatus).toBe('resolved')

      const backgroundStatus = await Promise.race([
        historyWarmStarted.then(() => 'started'),
        new Promise<'timeout'>((resolve) => {
          setTimeout(() => resolve('timeout'), 250)
        }),
      ])

      expect(backgroundStatus).toBe('started')
    } finally {
      releaseHistoryWarm?.()
      await prewarm?.settled
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    }
  })
})

describe('startPrewarmRenounRpcServerCache', () => {
  test('resolves ready after repository bootstrap, tree discovery, and header-only structure warm while settled work continues', async () => {
    project.createSourceFile(
      '/repo/src/phased-docs-page.tsx',
      `
        import { Directory, Reference, Repository } from 'renoun'

        const docsRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          repository: docsRepository,
        })

        docs.getTree()
        docs.getStructure({
          includeExports: 'headers',
          includeDescriptions: 'snippet',
          includeSections: true,
          includeResolvedTypes: true,
          includeGitDates: 'first',
          includeAuthors: true,
        })
        docs.getRepository().getExportHistory()

        async function renderPage(pathname: string) {
          const file = docs.getFile(pathname, 'ts')
          await file.getExports()
          await file.getExportTypes()
          return <Reference source={file} />
        }

        void renderPage
      `,
      { overwrite: true }
    )

    let releaseBootstrap!: () => void
    const bootstrapBlocked = new Promise<void>((resolve) => {
      releaseBootstrap = resolve
    })
    let releaseHeaderStructure!: () => void
    const headerStructureBlocked = new Promise<void>((resolve) => {
      releaseHeaderStructure = resolve
    })
    let releaseSettledStructure!: () => void
    const settledStructureBlocked = new Promise<void>((resolve) => {
      releaseSettledStructure = resolve
    })
    let releaseExportHistory!: () => void
    const exportHistoryBlocked = new Promise<void>((resolve) => {
      releaseExportHistory = resolve
    })

    prepareAnalysisRootMock.mockImplementation(async () => {
      await bootstrapBlocked
    })
    entryGetStructureMock.mockImplementation(
      async (_directoryPath: string, options?: unknown) => {
        const structureOptions = (options ?? {}) as Record<string, unknown>

        if (
          structureOptions.includeResolvedTypes === false &&
          structureOptions.includeSections === false &&
          structureOptions.includeGitDates === false &&
          structureOptions.includeAuthors === false
        ) {
          await headerStructureBlocked
          return []
        }

        await settledStructureBlocked
        return []
      }
    )
    repositoryGetExportHistoryMock.mockImplementation(async function* () {
      await exportHistoryBlocked

      return {
        generatedAt: new Date(0).toISOString(),
        repo: 'mock-repo',
        entryFiles: [],
        exports: {},
        nameToId: {},
      }
    })
    readDirectoryMock.mockImplementation(async (directoryPath: string) => {
      if (directoryPath === '/repo/src/nodes') {
        return [createMockFileEntry('/repo/src/nodes/guide.ts')]
      }

      return []
    })
    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    const prewarm = startPrewarmRenounRpcServerCache!({
      analysisOptions,
      requestPriority: 'bootstrap',
    })

    let didResolveReady = false
    void prewarm.ready.then(() => {
      didResolveReady = true
    })

    await vi.waitFor(() => {
      expect(prepareAnalysisRootMock).toHaveBeenCalledTimes(1)
    })
    expect(didResolveReady).toBe(false)

    releaseBootstrap()

    await vi.waitFor(() => {
      expect(entryGetStructureMock).toHaveBeenCalledWith('/repo/src/nodes', {
        includeExports: 'headers',
        includeDescriptions: 'snippet',
        includeSections: false,
        includeResolvedTypes: false,
        includeGitDates: false,
        includeAuthors: false,
      })
    })
    expect(readDirectoryMock).toHaveBeenCalledWith('/repo/src/nodes')
    expect(didResolveReady).toBe(false)

    releaseHeaderStructure()

    await prewarm.ready

    const settledStatus = await Promise.race([
      prewarm.settled.then(() => 'resolved'),
      new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), 50)
      }),
    ])

    expect(settledStatus).toBe('timeout')
    expect(entryGetStructureMock).toHaveBeenCalledWith('/repo/src/nodes', {
      includeExports: 'headers',
      includeDescriptions: 'snippet',
      includeSections: true,
      includeResolvedTypes: true,
      includeGitDates: 'first',
      includeAuthors: true,
    })
    expect(repositoryGetExportHistoryMock).toHaveBeenCalledTimes(1)

    releaseSettledStructure()
    releaseExportHistory()
    await prewarm.settled
  })

  test('keeps reference base in ready even when export types are deferred to settled', async () => {
    process.env.NODE_ENV = 'production'

    project.createSourceFile(
      '/repo/src/reference-phase-page.tsx',
      `
        import { Directory, Reference, Repository } from 'renoun'

        const docsRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          repository: docsRepository,
        })

        docs.getTree()

        async function renderPage(pathname: string) {
          const file = docs.getFile(pathname, 'ts')
          await file.getExports()
          await file.getExportTypes()
          return <Reference source={file} />
        }

        void renderPage
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockImplementation(async (directoryPath: string) => {
      if (directoryPath === '/repo/src/nodes') {
        return [createMockFileEntry('/repo/src/nodes/guide.ts')]
      }

      return []
    })
    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    const prewarm = startPrewarmRenounRpcServerCache!({
      analysisOptions,
      requestPriority: 'bootstrap',
    })

    await prewarm.ready

    expect(entryGetExportsMock).toHaveBeenCalledWith('/repo/src/nodes/guide.ts')
    expect(entryGetCachedReferenceBaseDataMock).toHaveBeenCalledWith(
      '/repo/src/nodes/guide.ts'
    )
    expect(targets.directoryGetEntries).toContainEqual({
      directoryPath: './src/nodes',
      recursive: true,
      leafOnly: true,
      includeDirectoryNamedFiles: true,
      includeIndexAndReadmeFiles: true,
      filterExtensions: null,
      repository: {
        path: 'owner/repo',
        ref: 'main',
      },
      sparsePaths: ['./src/nodes'],
      methods: ['getExportTypes', 'getExports', 'getReferenceBase'],
    })

    const settledStatus = await Promise.race([
      prewarm.settled.then(() => 'resolved'),
      new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), 50)
      }),
    ])

    expect(settledStatus).toBe('resolved')
    await prewarm.settled
  })
})

describe('collectRenounPrewarmTargets', () => {
  test('skips Directory callsites with unresolved constructor arguments', async () => {
    project.createSourceFile(
      '/repo/src/unknown.ts',
      `
        import { Directory } from 'renoun'

        const knownDirectory = new Directory('/repo/known')
        const unresolvedDirectory = new Directory(Math.random() > 0.5 ? '/repo/a' : '/repo/b')

        knownDirectory.getEntries()
        unresolvedDirectory.getEntries()
      `,
      { overwrite: true }
    )

    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    expect(targets.directoryGetEntries).toEqual([
      {
        directoryPath: '/repo/known',
        recursive: false,
        includeDirectoryNamedFiles: true,
        includeIndexAndReadmeFiles: true,
        filterExtensions: null,
      },
    ])
  })

  test('collects Directory#getStructure callsites with literal options', async () => {
    project.createSourceFile(
      '/repo/src/search.ts',
      `
        import { Directory } from 'renoun'

        const docs = new Directory({
          path: 'src/nodes',
          repository: { path: 'owner/repo', ref: 'main' },
        })

        docs.getStructure({
          includeExports: 'headers',
          includeSections: false,
          includeDescriptions: 'snippet',
          includeResolvedTypes: false,
          includeGitDates: true,
        })
      `,
      { overwrite: true }
    )

    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    expect(targets.directoryGetStructure).toEqual([
      {
        directoryPath: './src/nodes',
        repository: { path: 'owner/repo', ref: 'main' },
        sparsePaths: ['./src/nodes'],
        options: {
          includeExports: 'headers',
          includeSections: false,
          includeDescriptions: 'snippet',
          includeResolvedTypes: false,
          includeGitDates: true,
        },
      },
    ])
  })

  test('resolves aliased imports and nested collection entries', async () => {
    project = new Project({ useInMemoryFileSystem: true })

    project.createSourceFile(
      '/repo/src/collections.ts',
      `
        import { Collection, Directory } from 'renoun'

        export const posts = new Directory('/repo/root')
        export const nestedDirectory = new Directory('/repo/nested')
        export const rootCollection = new Collection({
          entries: [nestedDirectory],
        })
      `,
      { overwrite: true }
    )

    project.createSourceFile(
      '/repo/src/collections-entry.ts',
      `
        export { posts, rootCollection } from './collections'
      `,
      { overwrite: true }
    )

    project.createSourceFile(
      '/repo/src/pages.ts',
      `
        import { posts, rootCollection, nestedDirectory } from './collections'
        import { posts as postAlias } from './collections-entry'
        import { rootCollection as aliasedCollection } from './collections-entry'

        posts.getEntries({ recursive: true })
        postAlias.getEntries({ includeIndexAndReadmeFiles: false })
        rootCollection.getEntries()
        aliasedCollection.getEntries()
        nestedDirectory.getFile('readme', 'mdx')
      `,
      { overwrite: true }
    )

    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    expect(targets.directoryGetEntries).toEqual(
      expect.arrayContaining([
        {
          directoryPath: '/repo/root',
          recursive: true,
          includeDirectoryNamedFiles: true,
          includeIndexAndReadmeFiles: true,
          filterExtensions: null,
        },
        {
          directoryPath: '/repo/nested',
          recursive: false,
          includeDirectoryNamedFiles: true,
          includeIndexAndReadmeFiles: true,
          filterExtensions: null,
        },
      ])
    )

    expect(targets.fileGetFile).toEqual([
      {
        directoryPath: '/repo/nested',
        path: 'readme',
        extensions: ['mdx'],
      },
    ])
  })

  test('resolves nested collection entries across imported collections', async () => {
    project = new Project({ useInMemoryFileSystem: true })

    project.createSourceFile(
      '/repo/src/root-collection.ts',
      `
        import { Collection } from 'renoun'
        import { nestedCollection } from './nested-collection'

        export const rootCollection = new Collection({
          entries: [nestedCollection],
        })
      `,
      { overwrite: true }
    )

    project.createSourceFile(
      '/repo/src/nested-collection.ts',
      `
        import { Collection, Directory } from 'renoun'

        export const contentDirectory = new Directory('/repo/content')
        export const nestedCollection = new Collection({
          entries: [contentDirectory],
        })
      `,
      { overwrite: true }
    )

    project.createSourceFile(
      '/repo/src/entry.ts',
      `
        import { rootCollection } from './root-collection'

        rootCollection.getEntries()
      `,
      { overwrite: true }
    )

    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    expect(targets.directoryGetEntries).toEqual([
      {
        directoryPath: '/repo/content',
        recursive: false,
        includeDirectoryNamedFiles: true,
        includeIndexAndReadmeFiles: true,
        filterExtensions: null,
      },
    ])
  })

  test('captures renoun imports from subpath specifiers', async () => {
    project.createSourceFile(
      '/repo/src/subpath.ts',
      `
        import { Directory, Collection } from 'renoun/file-system'

        const posts = new Directory('/repo/posts')
        const nestedCollection = new Collection({
          entries: [posts],
        })

        posts.getFile('index', ['md'])
        nestedCollection.getEntries()
      `,
      { overwrite: true }
    )

    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    expect(targets.directoryGetEntries).toEqual([
      {
        directoryPath: '/repo/posts',
        recursive: false,
        includeDirectoryNamedFiles: true,
        includeIndexAndReadmeFiles: true,
        filterExtensions: null,
      },
    ])

    expect(targets.fileGetFile).toEqual([
      {
        directoryPath: '/repo/posts',
        path: 'index',
        extensions: ['md'],
      },
    ])
  })

  test('resolves workspace scheme paths for Directory declarations', async () => {
    project.createSourceFile(
      '/repo/src/workspace-scheme.ts',
      `
        import { Directory } from 'renoun'

        const examples = new Directory({ path: 'workspace:examples' })

        examples.getEntries()
      `,
      { overwrite: true }
    )

    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    expect(targets.directoryGetEntries).toEqual([
      {
        directoryPath: resolveSchemePath('workspace:examples'),
        recursive: false,
        includeDirectoryNamedFiles: true,
        includeIndexAndReadmeFiles: true,
        filterExtensions: null,
      },
    ])
  })

  test('captures next.js app-directory collections across re-exports and skips dynamic paths', async () => {
    project = new Project({ useInMemoryFileSystem: true })

    project.createSourceFile(
      '/repo/src/content/renoun-directories.ts',
      `
        import { Collection, Directory } from 'renoun'

        const dynamicDirectory = process.env['RENOUN_APP_DIRECTORY']

        export const appDirectory = new Directory('/repo/src/app')
        export const routeDirectory = new Directory('/repo/src/app/api')
        const marketingDirectory = new Directory('/repo/src/app/(marketing)')

        export const appCollections = new Collection({
          entries: [
            appDirectory,
            routeDirectory,
            new Directory(dynamicDirectory),
            marketingDirectory,
          ],
        })
      `,
      { overwrite: true }
    )

    project.createSourceFile(
      '/repo/src/app/page.tsx',
      `
        import { appDirectory, appCollections } from '../content/renoun-directories'

        appDirectory.getEntries({ recursive: true })
        appCollections.getEntries({ recursive: false })
        appDirectory.getFile('page', ['tsx'])
      `,
      { overwrite: true }
    )

    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    expect(targets.directoryGetEntries).toEqual(
      expect.arrayContaining([
        {
          directoryPath: '/repo/src/app',
          recursive: true,
          includeDirectoryNamedFiles: true,
          includeIndexAndReadmeFiles: true,
          filterExtensions: null,
        },
        {
          directoryPath: '/repo/src/app/api',
          recursive: false,
          includeDirectoryNamedFiles: true,
          includeIndexAndReadmeFiles: true,
          filterExtensions: null,
        },
        {
          directoryPath: '/repo/src/app/(marketing)',
          recursive: false,
          includeDirectoryNamedFiles: true,
          includeIndexAndReadmeFiles: true,
          filterExtensions: null,
        },
      ])
    )

    expect(targets.fileGetFile).toEqual([
      {
        directoryPath: '/repo/src/app',
        path: 'page',
        extensions: ['tsx'],
      },
    ])
  })

  test('infers precise getFile warm methods from local consumers and Reference usage', async () => {
    project.createSourceFile(
      '/repo/src/get-file-usage.tsx',
      `
        import { Directory, Reference as APIReference } from 'renoun'

        const docs = new Directory('/repo/docs')

        const headersFile = docs.getFile('headers', 'js')
        headersFile.getExports()

        const typedFile = docs.getFile('typed', 'tsx')
        const typedAlias = typedFile
        const typedView = <APIReference source={typedAlias} />

        const sectionsFile = docs.getFile('sections', 'ts')
        sectionsFile.getSections()

        docs.getFile('direct', 'ts').getExportTypes()

        void typedView
      `,
      { overwrite: true }
    )

    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    expect(targets.fileGetFile).toEqual([
      {
        directoryPath: '/repo/docs',
        path: 'headers',
        extensions: ['js'],
        methods: ['getExports'],
      },
      {
        directoryPath: '/repo/docs',
        path: 'typed',
        extensions: ['tsx'],
        methods: ['getReferenceBase'],
      },
      {
        directoryPath: '/repo/docs',
        path: 'sections',
        extensions: ['ts'],
        methods: ['getExports', 'getSections'],
      },
      {
        directoryPath: '/repo/docs',
        path: 'direct',
        extensions: ['ts'],
        methods: ['getExportTypes'],
      },
    ])
  })

  test('falls back to directory-wide prewarm for dynamic getFile paths with inferred consumers', async () => {
    project.createSourceFile(
      '/repo/src/dynamic-reference.tsx',
      `
        import { Directory, Reference } from 'renoun'

        const docs = new Directory('/repo/docs')

        async function render(pathname: string) {
          const file = docs.getFile(pathname, 'ts')
          const exports = await file.getExports()
          await file.getLastCommitDate()

          const page = <Reference source={file} />

          void exports
          return page
        }

        void render
      `,
      { overwrite: true }
    )

    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    expect(targets.fileGetFile).toEqual([])
    expect(targets.directoryGetEntries).toEqual([
      {
        directoryPath: '/repo/docs',
        recursive: true,
        includeDirectoryNamedFiles: true,
        includeIndexAndReadmeFiles: true,
        filterExtensions: new Set(['ts']),
        methods: ['getExports', 'getGitMetadata', 'getReferenceBase'],
      },
    ])
  })

  test('preserves repository scope for dynamic getFile fallback targets', async () => {
    project.createSourceFile(
      '/repo/src/repository-dynamic-reference.tsx',
      `
        import { Directory, Reference, Repository } from 'renoun'

        const docsRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          repository: docsRepository,
        })

        async function render(pathname: string) {
          const file = docs.getFile(pathname, 'js')
          await file.getExports()
          await file.getLastCommitDate()

          return <Reference source={file} />
        }

        void render
      `,
      { overwrite: true }
    )

    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    expect(targets.fileGetFile).toEqual([])
    expect(targets.directoryGetEntries).toEqual([
      {
        directoryPath: './src/nodes',
        recursive: true,
        includeDirectoryNamedFiles: true,
        includeIndexAndReadmeFiles: true,
        filterExtensions: new Set(['js']),
        repository: {
          path: 'owner/repo',
          ref: 'main',
        },
        sparsePaths: ['./src/nodes'],
        methods: ['getExports', 'getGitMetadata', 'getReferenceBase'],
      },
    ])
  })

  test('preserves directory constructor filters for repository-backed getTree routes', async () => {
    project.createSourceFile(
      '/repo/src/repository-filtered-tree.tsx',
      `
        import { Directory, Reference, Repository } from 'renoun'

        const docsRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          filter: '**/*.js',
          repository: docsRepository,
        })

        docs.getTree()

        async function render(pathname: string) {
          const file = docs.getFile(pathname, 'js')
          await file.getExports()
          await file.getLastCommitDate()

          return <Reference source={file} />
        }

        void render
      `,
      { overwrite: true }
    )

    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    expect(targets.fileGetFile).toEqual([])
    expect(targets.directoryGetEntries).toEqual([
      {
        directoryPath: './src/nodes',
        recursive: true,
        leafOnly: true,
        includeDirectoryNamedFiles: true,
        includeIndexAndReadmeFiles: true,
        filterExtensions: new Set(['js']),
        repository: {
          path: 'owner/repo',
          ref: 'main',
        },
        sparsePaths: ['./src/nodes'],
        methods: ['getExports', 'getGitMetadata', 'getReferenceBase'],
      },
    ])
  })

  test('infers directory filter extensions from explicit loader maps when filters are dynamic', async () => {
    project.createSourceFile(
      '/repo/src/loader-filter-inference.tsx',
      `
        import { Directory } from 'renoun'

        const keepVisibleEntries = async () => true
        const docs = new Directory({
          path: '/repo/docs',
          loader: {
            ts: async () => ({}),
            tsx: async () => ({}),
          },
          filter: keepVisibleEntries,
        })

        docs.getEntries({ recursive: true })
      `,
      { overwrite: true }
    )

    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    expect(targets.directoryGetEntries).toEqual([
      {
        directoryPath: '/repo/docs',
        recursive: true,
        includeDirectoryNamedFiles: true,
        includeIndexAndReadmeFiles: true,
        filterExtensions: new Set(['ts', 'tsx']),
      },
    ])
  })

  test('treats getTree callsites as recursive directory prewarm targets', async () => {
    project.createSourceFile(
      '/repo/src/routes.ts',
      `
        import { Directory } from 'renoun'

        const docs = new Directory('/repo/docs')

        docs.getTree()
      `,
      { overwrite: true }
    )

    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    expect(targets.directoryGetEntries).toEqual([
      {
        directoryPath: '/repo/docs',
        recursive: true,
        leafOnly: true,
        includeDirectoryNamedFiles: true,
        includeIndexAndReadmeFiles: true,
        filterExtensions: null,
      },
    ])
  })

  test('falls back to extension-based getFile prewarm when file usage escapes analysis', async () => {
    project.createSourceFile(
      '/repo/src/get-file-escape.ts',
      `
        import { Directory } from 'renoun'

        const docs = new Directory('/repo/docs')
        const file = docs.getFile('entry', 'ts')

        consume(file)
      `,
      { overwrite: true }
    )

    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    expect(targets.fileGetFile).toEqual([
      {
        directoryPath: '/repo/docs',
        path: 'entry',
        extensions: ['ts'],
      },
    ])
  })

  test('collects Repository#getExportHistory targets across repository aliases', async () => {
    project.createSourceFile(
      '/repo/src/history.ts',
      `
        import { Directory, Repository } from 'renoun'

        const docsRepository = new Repository({
          path: 'owner/repo',
          ref: 'main',
        })
        const docs = new Directory({
          path: 'src/nodes',
          repository: docsRepository,
        })
        const repo = docs.getRepository()

        repo.getExportHistory({ ref: 'latest' })
        new Repository('owner/direct').getExportHistory({
          entry: ['src/index.ts'],
        })
      `,
      { overwrite: true }
    )

    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    expect(targets.exportHistory).toEqual(
      expect.arrayContaining([
        {
          repository: {
            path: 'owner/repo',
            ref: 'main',
          },
          sparsePaths: ['./src/nodes'],
          options: {
            ref: 'latest',
          },
        },
        {
          repository: 'owner/direct',
          sparsePaths: [],
          options: {
            entry: ['src/index.ts'],
          },
        },
      ])
    )
  })

  test('collects History component repository sources as export-history prewarm targets', async () => {
    project.createSourceFile(
      '/repo/src/history-view.tsx',
      `
        import { Directory, History } from 'renoun'

        const docs = new Directory({
          path: 'src/nodes',
          repository: {
            path: 'owner/repo',
            ref: 'main',
          },
        })
        const repo = docs.getRepository()

        export function Page() {
          return (
            <History
              source={repo}
              sourceOptions={{
                ref: 'latest',
                entry: ['src/index.ts'],
              }}
            />
          )
        }
      `,
      { overwrite: true }
    )

    const targets = await collectRenounPrewarmTargets!(project, analysisOptions)

    expect(targets.exportHistory).toEqual(
      expect.arrayContaining([
        {
          repository: {
            path: 'owner/repo',
            ref: 'main',
          },
          sparsePaths: ['./src/nodes'],
          options: {
            ref: 'latest',
            entry: ['src/index.ts'],
          },
        },
      ])
    )
  })
})
