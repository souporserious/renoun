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
const getEntriesMock =
  vi.fn<
    (path: string, options?: Record<string, unknown>) => Promise<MockFile[]>
  >()
const getFileMock =
  vi.fn<
    (
      directoryPath: string,
      filePath: string,
      extensions?: string | string[]
    ) => Promise<MockFile>
  >()
const getExportsMock = vi.fn<(filePath: string) => Promise<unknown>>()
const getSectionsMock = vi.fn<(filePath: string) => Promise<unknown>>()
const getContentMock = vi.fn<(filePath: string) => Promise<unknown>>()
const isFilePathGitIgnoredMock = vi.fn(() => false)

const { Project } = getTsMorph()
type ProjectInstance = InstanceType<typeof Project>

const projectOptions: ProjectOptions = {
  tsConfigFilePath: '/repo/tsconfig.json',
  compilerOptions: {},
  useInMemoryFileSystem: true,
}

let project: ProjectInstance

class MockFile {
  readonly extension: string

  constructor(public readonly absolutePath: string) {
    this.extension = absolutePath.split('.').pop() ?? ''
  }

  async getExports() {
    return getExportsMock(this.absolutePath)
  }

  async getSections() {
    return getSectionsMock(this.absolutePath)
  }

  async getContent() {
    return getContentMock(this.absolutePath)
  }
}

class MockDirectory {
  readonly path: string

  constructor(options: { path: string }) {
    this.path = options.path
  }

  getEntries(_options?: Record<string, unknown>) {
    return getEntriesMock(this.path)
  }

  getFile(path: string, extensions?: string | string[]) {
    return getFileMock(this.path, path, extensions)
  }
}

vi.mock('../project/get-project.ts', () => ({
  getProject: getProjectMock,
}))

vi.mock('../file-system/entries.tsx', () => ({
  Directory: MockDirectory,
  File: MockFile,
}))

vi.mock('../utils/is-file-path-git-ignored.ts', () => ({
  isFilePathGitIgnored: isFilePathGitIgnoredMock,
}))

let prewarmRenounRpcServerCache:
  | ((options?: { projectOptions?: ProjectOptions }) => Promise<void>)
  | undefined
let collectRenounPrewarmTargets:
  | ((project: ProjectInstance, projectOptions?: ProjectOptions) => RenounPrewarmTargets)
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

  getEntriesMock.mockResolvedValue([])
  getFileMock.mockResolvedValue(new MockFile('/repo/fallback'))
  getExportsMock.mockResolvedValue(undefined)
  getSectionsMock.mockResolvedValue(undefined)
  getContentMock.mockResolvedValue(undefined)
})

afterEach(() => {
  delete process.env.RENOUN_SERVER_PORT
  delete process.env.RENOUN_SERVER_ID
})

describe('prewarmRenounRpcServerCache', () => {
  test('collects callsites and prewarms files via direct File methods', async () => {
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

    getEntriesMock.mockImplementation(async (directoryPath: string) => {
      const entriesByPath = new Map<string, MockFile[]>([
        [
          '/repo/direct',
          [
            new MockFile('/repo/direct/index.ts'),
            new MockFile('/repo/direct/notes.txt'),
          ],
        ],
        ['/repo/object', [new MockFile('/repo/object/main.mts')]],
        [
          '/repo/namespaced',
          [
            new MockFile('/repo/namespaced/page.mjs'),
            new MockFile('/repo/namespaced/readme.md'),
          ],
        ],
        ['/repo/inline', [new MockFile('/repo/inline/content.tsx')]],
      ])

      return entriesByPath.get(directoryPath) ?? []
    })

    await prewarmRenounRpcServerCache!({ projectOptions })

    expect(getExportsMock.mock.calls.map((call) => call[0]).sort()).toEqual(
      [
        '/repo/direct/index.ts',
        '/repo/object/main.mts',
        '/repo/namespaced/page.mjs',
        '/repo/inline/content.tsx',
      ].sort()
    )

    expect(getSectionsMock.mock.calls.map((call) => call[0]).sort()).toEqual(
      [
        '/repo/direct/index.ts',
        '/repo/object/main.mts',
        '/repo/namespaced/page.mjs',
        '/repo/namespaced/readme.md',
        '/repo/inline/content.tsx',
      ].sort()
    )

    expect(getContentMock.mock.calls.map((call) => call[0]).sort()).toEqual([
      '/repo/namespaced/readme.md',
    ])

    expect(getProjectMock).toHaveBeenCalledWith(projectOptions)
    expect(getEntriesMock).toHaveBeenCalled()
  })

  test('is a no-op when server environment variables are missing', async () => {
    delete process.env.RENOUN_SERVER_PORT
    delete process.env.RENOUN_SERVER_ID

    await prewarmRenounRpcServerCache!()

    expect(getProjectMock).not.toHaveBeenCalled()
    expect(getEntriesMock).not.toHaveBeenCalled()
    expect(getFileMock).not.toHaveBeenCalled()
    expect(getExportsMock).not.toHaveBeenCalled()
    expect(getSectionsMock).not.toHaveBeenCalled()
    expect(getContentMock).not.toHaveBeenCalled()
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

    getEntriesMock.mockRejectedValue(new Error('Directory enumeration failed'))

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

    getEntriesMock.mockImplementation(async () => [
      new MockFile('/repo/failing/index.ts'),
    ])
    getExportsMock.mockRejectedValueOnce(new Error('RPC cache prewarm failed'))

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

    getEntriesMock.mockImplementation(async (directoryPath: string) => {
      const entriesByPath = new Map<string, MockFile[]>([
        [
          '/repo/known',
          [new MockFile('/repo/known/index.ts')],
        ],
      ])

      return entriesByPath.get(directoryPath) ?? []
    })

    await prewarmRenounRpcServerCache!({ projectOptions })

    expect(getEntriesMock).toHaveBeenCalledTimes(1)
    expect(getEntriesMock).toHaveBeenCalledWith('/repo/known')
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

    getEntriesMock.mockImplementation(async (directoryPath: string) => {
      const entriesByPath = new Map<string, MockFile[]>([
        [
          '/repo/src/app',
          [new MockFile('/repo/src/app/page.tsx')],
        ],
        [
          '/repo/src/app/api',
          [new MockFile('/repo/src/app/api/route.ts')],
        ],
        [
          '/repo/src/app/(marketing)',
          [new MockFile('/repo/src/app/(marketing)/campaign.ts')],
        ],
      ])

      return entriesByPath.get(directoryPath) ?? []
    })

    await prewarmRenounRpcServerCache!({ projectOptions })

    expect(getEntriesMock).toHaveBeenCalledTimes(3)
    expect(getEntriesMock).toHaveBeenCalledWith('/repo/src/app')
    expect(getEntriesMock).toHaveBeenCalledWith('/repo/src/app/api')
    expect(getEntriesMock).toHaveBeenCalledWith('/repo/src/app/(marketing)')
    expect(getEntriesMock).not.toHaveBeenCalledWith('/repo')
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

    const targets = collectRenounPrewarmTargets!(project, projectOptions)

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

    const targets = collectRenounPrewarmTargets!(project, projectOptions)

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

    const targets = collectRenounPrewarmTargets!(project, projectOptions)

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
