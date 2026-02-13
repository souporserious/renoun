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

import { getTsMorph } from '../utils/ts-morph.ts'

const getProjectMock = vi.fn()
const getEntriesMock = vi.fn<
  (path: string, options?: Record<string, unknown>) => Promise<MockFile[]>
>()
const getFileExportsMock = vi.fn<(filePath: string) => Promise<unknown>>()
const isFilePathGitIgnoredMock = vi.fn(() => false)

const { Project } = getTsMorph()
type ProjectInstance = InstanceType<typeof Project>

let project: ProjectInstance

class MockFile {
  readonly extension: string

  constructor(public readonly absolutePath: string) {
    this.extension = absolutePath.split('.').pop() ?? ''
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
}

vi.mock('../project/get-project.ts', () => ({
  getProject: getProjectMock,
}))

vi.mock('../project/client.ts', () => ({
  getFileExports: getFileExportsMock,
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

beforeAll(async () => {
  const prewarm = await import('./prewarm.ts')
  prewarmRenounRpcServerCache = prewarm.prewarmRenounRpcServerCache
})

beforeEach(() => {
  vi.clearAllMocks()

  process.env.RENOUN_SERVER_PORT = '1234'
  process.env.RENOUN_SERVER_ID = 'test-server-id'
  project = new Project({ useInMemoryFileSystem: true })
  getProjectMock.mockReturnValue(project)
})

afterEach(() => {
  delete process.env.RENOUN_SERVER_PORT
  delete process.env.RENOUN_SERVER_ID
})

describe('prewarmRenounRpcServerCache', () => {
  test('collects Directory#getEntries callsites and prewarms discovered JS-like files', async () => {
    const projectOptions: ProjectOptions = {
      tsConfigFilePath: '/repo/tsconfig.json',
      compilerOptions: {},
      useInMemoryFileSystem: true,
    }

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
          [new MockFile('/repo/direct/index.ts'), new MockFile('/repo/direct/notes.txt')],
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

    getFileExportsMock.mockResolvedValue([])

    await prewarmRenounRpcServerCache!({ projectOptions })

    const warmedFiles = getFileExportsMock.mock.calls
      .map((call) => call[0])
      .sort()

    expect(warmedFiles).toEqual(
      [
        '/repo/direct/index.ts',
        '/repo/object/main.mts',
        '/repo/namespaced/page.mjs',
        '/repo/inline/content.tsx',
      ].sort()
    )

    expect(getProjectMock).toHaveBeenCalledWith(projectOptions)
  })

  test('is a no-op when server environment variables are missing', async () => {
    delete process.env.RENOUN_SERVER_PORT
    delete process.env.RENOUN_SERVER_ID

    await prewarmRenounRpcServerCache!()

    expect(getProjectMock).not.toHaveBeenCalled()
    expect(getFileExportsMock).not.toHaveBeenCalled()
    expect(getEntriesMock).not.toHaveBeenCalled()
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

    await expect(prewarmRenounRpcServerCache!()).rejects.toThrow(
      'Directory enumeration failed'
    )
  })

  test('does not swallow errors from getFileExports', async () => {
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
    getFileExportsMock.mockRejectedValue(new Error('RPC cache prewarm failed'))

    await expect(prewarmRenounRpcServerCache!()).rejects.toThrow(
      'RPC cache prewarm failed'
    )
  })
})
