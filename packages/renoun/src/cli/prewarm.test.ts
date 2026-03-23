import { basename, extname, resolve } from 'node:path'
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
const entryGetExportTypesMock = vi.fn<(filePath: string) => Promise<unknown>>()
const entryGetExportsMock = vi.fn<(filePath: string) => Promise<unknown>>()
const entryGetOutlineRangesMock =
  vi.fn<(filePath: string) => Promise<unknown>>()
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
    getExportTypes: () => entryGetExportTypesMock(filePath),
    getExports: () => entryGetExportsMock(filePath),
    getOutlineRanges: () => entryGetOutlineRangesMock(filePath),
    getSections: () => entryGetSectionsMock(filePath),
    getStaticExportValue: (name: string) =>
      entryGetStaticExportValueMock(filePath, name),
  }
}

class MockEntriesDirectory {
  readonly #path: string

  constructor(options?: { path?: string }) {
    this.#path = resolve(options?.path ?? '.')
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

let prewarmRenounRpcServerCache:
  | ((options?: { analysisOptions?: AnalysisOptions }) => Promise<void>)
  | undefined
let collectRenounPrewarmTargets:
  | ((
      project: ProjectInstance,
      analysisOptions?: AnalysisOptions
    ) => Promise<RenounPrewarmTargets>)
  | undefined

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
  }))

  vi.doMock(nodeClientModuleSpecifier, () => ({
    getFileExports: getFileExportsMock,
    getOutlineRanges: getOutlineRangesMock,
    getSourceTextMetadata: getSourceTextMetadataMock,
    getTokens: getTokensMock,
    resolveFileExportsWithDependencies: resolveFileExportsWithDependenciesMock,
  }))

  vi.doMock(repositoryModuleSpecifier, () => ({
    Repository: {
      resolve: repositoryResolveMock,
    },
  }))

  vi.doMock(gitIgnoredModuleSpecifier, () => ({
    isFilePathGitIgnored: isFilePathGitIgnoredMock,
  }))

  const prewarm = await import(prewarmModuleSpecifier)
  prewarmRenounRpcServerCache = prewarm.prewarmRenounRpcServerCache
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
  getSourceTextMetadataMock.mockImplementation(async (_project, options) => ({
    value: options['value'],
    language: options['language'],
    filePath:
      typeof options['filePath'] === 'string'
        ? options['filePath']
        : '/virtual/snippet.ts',
  }))
  getTokensMock.mockResolvedValue([])
  entryGetExportTypesMock.mockResolvedValue([])
  entryGetExportsMock.mockResolvedValue([])
  entryGetOutlineRangesMock.mockResolvedValue([])
  entryGetSectionsMock.mockResolvedValue([])
  entryGetStaticExportValueMock.mockResolvedValue(undefined)
  getMarkdownSectionsMock.mockReturnValue([])
  getMDXSectionsMock.mockReturnValue([])
  getWorkspaceChangeTokenMock.mockResolvedValue(null)
  getWorkspaceChangedPathsSinceTokenMock.mockResolvedValue(null)
  registerSparsePathMock.mockReset()
  repositoryGetExportHistoryMock.mockReset()
  repositoryResolveMock.mockReset()
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
  })
})

afterEach(() => {
  delete process.env.RENOUN_SERVER_PORT
  delete process.env.RENOUN_SERVER_ID
  delete process.env.NODE_ENV
})

describe('prewarmRenounRpcServerCache', () => {
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

    await prewarmRenounRpcServerCache!({ analysisOptions })

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
      ['/repo/namespaced/guide.mdx', '/repo/namespaced/readme.md'].sort()
    )
    expect(readFileMock.mock.calls.map((call) => call[0]).sort()).toEqual(
      ['/repo/namespaced/guide.mdx', '/repo/namespaced/readme.md'].sort()
    )

    expect(getProjectMock).toHaveBeenCalledWith(analysisOptions)
    expect(readDirectoryMock).toHaveBeenCalled()
  })

  test('is a no-op when server environment variables are missing', async () => {
    delete process.env.RENOUN_SERVER_PORT
    delete process.env.RENOUN_SERVER_ID

    await prewarmRenounRpcServerCache!()

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

    await prewarmRenounRpcServerCache!({ analysisOptions: tokenProjectOptions })
    expect(getProjectMock).toHaveBeenCalledTimes(1)
    expect(readDirectoryMock).toHaveBeenCalledTimes(1)

    await prewarmRenounRpcServerCache!({ analysisOptions: tokenProjectOptions })
    expect(getProjectMock).toHaveBeenCalledTimes(2)
    expect(readDirectoryMock).toHaveBeenCalledTimes(1)

    getWorkspaceChangeTokenMock.mockResolvedValue('workspace-token-b')
    await prewarmRenounRpcServerCache!({ analysisOptions: tokenProjectOptions })
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

    await prewarmRenounRpcServerCache!({ analysisOptions: tokenProjectOptions })
    expect(getProjectMock).toHaveBeenCalledTimes(1)
    expect(readDirectoryMock).toHaveBeenCalledTimes(1)

    await prewarmRenounRpcServerCache!({ analysisOptions: tokenProjectOptions })
    expect(getProjectMock).toHaveBeenCalledTimes(2)
    expect(readDirectoryMock).toHaveBeenCalledTimes(1)
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

    await prewarmRenounRpcServerCache!({ analysisOptions: nestedProjectOptions })

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

    await prewarmRenounRpcServerCache!({ analysisOptions: tokenProjectOptions })

    expect(readDirectoryMock).toHaveBeenCalledTimes(2)
    expect(entryGetExportsMock).toHaveBeenCalledTimes(2)

    getWorkspaceChangeTokenMock.mockResolvedValue('workspace-token-b')
    getWorkspaceChangedPathsSinceTokenMock.mockResolvedValue(['posts/index.ts'])

    await prewarmRenounRpcServerCache!({ analysisOptions: tokenProjectOptions })

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

    await prewarmRenounRpcServerCache!({ analysisOptions: tokenProjectOptions })

    expect(entryGetExportsMock).toHaveBeenCalledTimes(1)
    expect(entryGetExportTypesMock).toHaveBeenCalledTimes(1)

    getWorkspaceChangeTokenMock.mockResolvedValue('workspace-token-b')
    getWorkspaceChangedPathsSinceTokenMock.mockResolvedValue([
      'packages/renoun/src/file-system/entries.ts',
    ])

    await prewarmRenounRpcServerCache!({ analysisOptions: tokenProjectOptions })

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

    await prewarmRenounRpcServerCache!({ analysisOptions })

    expect(entryGetExportsMock).toHaveBeenCalledWith('/repo/docs/reference.js')
    expect(entryGetExportTypesMock).toHaveBeenCalledWith(
      '/repo/docs/reference.js'
    )
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

    await prewarmRenounRpcServerCache!({ analysisOptions: tokenProjectOptions })

    expect(readDirectoryMock).toHaveBeenCalledTimes(1)
    expect(entryGetExportsMock).toHaveBeenCalledTimes(1)

    getWorkspaceChangeTokenMock.mockResolvedValue('workspace-token-b')
    getWorkspaceChangedPathsSinceTokenMock.mockResolvedValue([
      'guides/readme.mdx',
    ])

    await prewarmRenounRpcServerCache!({ analysisOptions: tokenProjectOptions })

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
      prewarmRenounRpcServerCache!({ analysisOptions })
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
      prewarmRenounRpcServerCache!({ analysisOptions })
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

    await prewarmRenounRpcServerCache!({ analysisOptions })

    expect(getSourceTextMetadataMock).toHaveBeenCalledWith(
      project,
      expect.objectContaining({
        filePath: './examples/schema.ts',
        baseDirectory: '/repo/guides',
        language: 'ts',
      })
    )
    expect(getClientServerProjectMock).toHaveBeenCalledWith(analysisOptions)
    expect(getCachedTypeScriptDependencyPathsMock).toHaveBeenCalledWith(
      project,
      '/repo/guides/examples/schema.ts'
    )
    expect(getTokensMock).toHaveBeenCalledWith(
      project,
      expect.objectContaining({
        allowErrors: '2307',
        value: 'const schema = { answer: 42 }\n',
        language: 'ts',
        filePath: '/repo/guides/examples/schema.ts',
        showErrors: false,
        theme: undefined,
        waitForWarmResult: true,
        highlighterLoader: expect.any(Function),
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

    await prewarmRenounRpcServerCache!({ analysisOptions })

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

    await prewarmRenounRpcServerCache!({ analysisOptions })

    expect(entryGetExportsMock).toHaveBeenCalledWith('/repo/src/nodes/TSL.js')
    expect(entryGetExportTypesMock).toHaveBeenCalledWith(
      '/repo/src/nodes/TSL.js'
    )
    expect(registerSparsePathMock).toHaveBeenCalledWith('./src/nodes')
    expect(repositoryGetExportHistoryMock).toHaveBeenCalledWith(undefined)
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

    await prewarmRenounRpcServerCache!({ analysisOptions })

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

    await prewarmRenounRpcServerCache!({ analysisOptions })

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

    await prewarmRenounRpcServerCache!({ analysisOptions })

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
        methods: ['getExportTypes'],
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
})
