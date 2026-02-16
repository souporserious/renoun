import { basename, resolve } from 'node:path'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest'
import type { ProjectOptions } from '../project/types.ts'
import type { RenounPrewarmTargets } from './prewarm.ts'

import { getTsMorph } from '../utils/ts-morph.ts'

const getProjectMock = vi.fn()
const readDirectoryMock =
  vi.fn<
    (
      path: string
    ) => Promise<
      Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean }>
    >
  >()
const readFileMock = vi.fn<(path: string) => Promise<string>>()
const fileExistsMock = vi.fn<(path: string) => Promise<boolean>>()
const getFileExportsMock = vi.fn<(filePath: string) => Promise<unknown>>()
const getOutlineRangesMock = vi.fn<(filePath: string) => Promise<unknown>>()
const getMarkdownSectionsMock = vi.fn<(source: string) => unknown>()
const getMDXSectionsMock = vi.fn<(source: string) => unknown>()
const isFilePathGitIgnoredMock = vi.fn(() => false)

const { Project } = getTsMorph()
type ProjectInstance = InstanceType<typeof Project>

const projectOptions: ProjectOptions = {
  tsConfigFilePath: '/repo/tsconfig.json',
  compilerOptions: {},
  useInMemoryFileSystem: true,
}

let project: ProjectInstance

class MockNodeFileSystem {
  getAbsolutePath(path: string): string {
    return resolve(path)
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

vi.mock('../project/get-project.ts', () => ({
  getProject: getProjectMock,
}))

vi.mock('../file-system/NodeFileSystem.ts', () => ({
  NodeFileSystem: MockNodeFileSystem,
}))

vi.mock('../project/client.ts', () => ({
  getFileExports: getFileExportsMock,
  getOutlineRanges: getOutlineRangesMock,
}))

vi.mock('@renoun/mdx/utils', () => ({
  getMarkdownSections: getMarkdownSectionsMock,
  getMDXSections: getMDXSectionsMock,
}))

vi.mock('../utils/is-file-path-git-ignored.ts', () => ({
  isFilePathGitIgnored: isFilePathGitIgnoredMock,
}))

let prewarmRenounRpcServerCache:
  | ((options?: { projectOptions?: ProjectOptions }) => Promise<void>)
  | undefined
let collectRenounPrewarmTargets:
  | ((
      project: ProjectInstance,
      projectOptions?: ProjectOptions
    ) => Promise<RenounPrewarmTargets>)
  | undefined

beforeAll(async () => {
  const prewarm = await import('./prewarm.ts')
  prewarmRenounRpcServerCache = prewarm.prewarmRenounRpcServerCache
  collectRenounPrewarmTargets = prewarm.collectRenounPrewarmTargets
})

beforeEach(() => {
  vi.clearAllMocks()

  process.env.RENOUN_SERVER_PORT = '1234'
  process.env.RENOUN_SERVER_ID = 'test-server-id'
  project = new Project({ useInMemoryFileSystem: true })
  getProjectMock.mockReturnValue(project)

  readDirectoryMock.mockResolvedValue([])
  readFileMock.mockRejectedValue(new Error('File not found'))
  fileExistsMock.mockResolvedValue(false)
  getFileExportsMock.mockResolvedValue(undefined)
  getOutlineRangesMock.mockResolvedValue(undefined)
  getMarkdownSectionsMock.mockReturnValue([])
  getMDXSectionsMock.mockReturnValue([])
})

afterEach(() => {
  delete process.env.RENOUN_SERVER_PORT
  delete process.env.RENOUN_SERVER_ID
})

describe('prewarmRenounRpcServerCache', () => {
  test('collects callsites and prewarms files via analysis-only methods', async () => {
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

    await prewarmRenounRpcServerCache!({ projectOptions })

    expect(getFileExportsMock.mock.calls.map((call) => call[0]).sort()).toEqual(
      [
        '/repo/direct/index.ts',
        '/repo/object/main.mts',
        '/repo/namespaced/page.mjs',
        '/repo/inline/content.tsx',
      ].sort()
    )

    expect(getOutlineRangesMock.mock.calls.map((call) => call[0]).sort()).toEqual(
      [
        '/repo/direct/index.ts',
        '/repo/object/main.mts',
        '/repo/namespaced/page.mjs',
        '/repo/inline/content.tsx',
      ].sort()
    )

    expect(getMarkdownSectionsMock).toHaveBeenCalledWith('# Markdown readme')
    expect(getMDXSectionsMock).toHaveBeenCalledWith('# MDX guide')
    expect(readFileMock.mock.calls.map((call) => call[0]).sort()).toEqual(
      ['/repo/namespaced/guide.mdx', '/repo/namespaced/readme.md'].sort()
    )

    expect(getProjectMock).toHaveBeenCalledWith(projectOptions)
    expect(readDirectoryMock).toHaveBeenCalled()
  })

  test('is a no-op when server environment variables are missing', async () => {
    delete process.env.RENOUN_SERVER_PORT
    delete process.env.RENOUN_SERVER_ID

    await prewarmRenounRpcServerCache!()

    expect(getProjectMock).not.toHaveBeenCalled()
    expect(readDirectoryMock).not.toHaveBeenCalled()
    expect(readFileMock).not.toHaveBeenCalled()
    expect(getFileExportsMock).not.toHaveBeenCalled()
    expect(getOutlineRangesMock).not.toHaveBeenCalled()
    expect(getMarkdownSectionsMock).not.toHaveBeenCalled()
    expect(getMDXSectionsMock).not.toHaveBeenCalled()
  })

  test('does not swallow errors from directory enumeration', async () => {
    project.createSourceFile(
      '/repo/src/error.ts',
      `
        import { Directory } from 'renoun'
        const failingDirectory = new Directory('/repo/failing')
        failingDirectory.getEntries()
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockRejectedValue(new Error('Directory enumeration failed'))

    await expect(
      prewarmRenounRpcServerCache!({ projectOptions })
    ).rejects.toThrow('Directory enumeration failed')
  })

  test('does not swallow errors from file cache warm methods', async () => {
    project.createSourceFile(
      '/repo/src/error-exports.ts',
      `
        import { Directory } from 'renoun'
        const failingDirectory = new Directory('/repo/failing')
        failingDirectory.getEntries()
      `,
      { overwrite: true }
    )

    readDirectoryMock.mockImplementation(async () => [
      createMockFileEntry('/repo/failing/index.ts'),
    ])
    getFileExportsMock.mockRejectedValueOnce(
      new Error('RPC cache prewarm failed')
    )

    await expect(
      prewarmRenounRpcServerCache!({ projectOptions })
    ).rejects.toThrow('RPC cache prewarm failed')
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
      >([
        ['/repo/known', [createMockFileEntry('/repo/known/index.ts')]],
      ])

      return entriesByPath.get(directoryPath) ?? []
    })

    await prewarmRenounRpcServerCache!({ projectOptions })

    expect(readDirectoryMock).toHaveBeenCalledTimes(1)
    expect(readDirectoryMock).toHaveBeenCalledWith('/repo/known')
  })

  test('prewarms Next.js-style barrel-exported directories without dynamic-root fallback', async () => {
    project.createSourceFile(
      '/repo/src/content/renoun-directories.ts',
      `
        import { Collection, Directory } from 'renoun'

        const dynamicDirectory = process.env.RENOUN_APP_DIRECTORY

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
        [
          '/repo/src/app',
          [createMockFileEntry('/repo/src/app/page.tsx')],
        ],
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

    await prewarmRenounRpcServerCache!({ projectOptions })

    expect(readDirectoryMock).toHaveBeenCalledTimes(3)
    expect(readDirectoryMock).toHaveBeenCalledWith('/repo/src/app')
    expect(readDirectoryMock).toHaveBeenCalledWith('/repo/src/app/api')
    expect(readDirectoryMock).toHaveBeenCalledWith('/repo/src/app/(marketing)')
    expect(readDirectoryMock).not.toHaveBeenCalledWith('/repo')
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

    const targets = await collectRenounPrewarmTargets!(project, projectOptions)

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

    const targets = await collectRenounPrewarmTargets!(project, projectOptions)

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

    const targets = await collectRenounPrewarmTargets!(project, projectOptions)

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

  test('captures next.js app-directory collections across re-exports and skips dynamic paths', async () => {
    project = new Project({ useInMemoryFileSystem: true })

    project.createSourceFile(
      '/repo/src/content/renoun-directories.ts',
      `
        import { Collection, Directory } from 'renoun'

        const dynamicDirectory = process.env.RENOUN_APP_DIRECTORY

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

    const targets = await collectRenounPrewarmTargets!(project, projectOptions)

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
})
