import { describe, test, expect, expectTypeOf } from 'vitest'
import { runInNewContext } from 'node:vm'

import { VirtualFileSystem } from './VirtualFileSystem'
import {
  isFile,
  File,
  Directory,
  JavaScriptFile,
  JavaScriptFileWithRuntime,
  JavaScriptFileExport,
  JavaScriptFileExportWithRuntime,
  type FileSystemEntry,
} from './index'

describe('file system', () => {
  test('virtual file system', async () => {
    const fileSystem = new VirtualFileSystem({
      'src/project/server.ts': 'export const server = 1',
      'src/project/types.ts': 'export interface Types {}',
    })
    const SrcDirectory = new Directory({
      path: 'src',
      fileSystem,
    })
    const directory = await SrcDirectory.getDirectory('project')

    expect(directory).toBeInstanceOf(Directory)
    expect(directory?.getName()).toBe('project')

    const file = await SrcDirectory.getFile('project/server', 'ts')

    expect(file).toBeInstanceOf(File)
    expect(file?.getName()).toBe('server')
  })

  test('returns directory', async () => {
    const ComponentsDirectory = new Directory({ path: 'src/components' })
    const directory = await ComponentsDirectory.getDirectory('CodeBlock')

    expect(directory).toBeInstanceOf(Directory)
  })

  test('returns file', async () => {
    const RootDirectory = new Directory()
    const file = await RootDirectory.getFile('tsconfig', 'json')

    expectTypeOf(file!).toMatchTypeOf<File>()
    expect(file!).toBeInstanceOf(File)
  })

  test('returns javascript file', async () => {
    const ProjectDirectory = new Directory({ path: 'src/project' })
    const file = await ProjectDirectory.getFile('server', 'ts')

    expect(file!).toBeInstanceOf(JavaScriptFile)
    expectTypeOf(file!).toMatchTypeOf<JavaScriptFile<any>>()
  })

  test('file exports', async () => {
    const ProjectDirectory = new Directory({ path: 'src/project' })
    const file = await ProjectDirectory.getFile('server', 'ts')
    const fileExports = await file!.getExports()

    expect(fileExports).toMatchObject([
      { name: 'createServer', position: 1245 },
    ])
  })

  test('virtual file exports', async () => {
    const fileSystem = new VirtualFileSystem({
      'use-hover.ts': 'export const useHover = () => {}',
    })
    const RootDirectory = new Directory({ fileSystem })
    const file = await RootDirectory.getFile('use-hover', 'ts')
    const fileExports = await file!.getExports()

    expect(fileExports).toMatchObject([{ name: 'useHover', position: 12 }])
  })

  test('file export value types', async () => {
    const ProjectDirectory = new Directory<{
      ts: { createServer: () => void }
    }>({
      path: 'src/project',
      getModule: (path) => import(`../project/${path}`),
    })
    const file = await ProjectDirectory.getFileOrThrow('server', 'ts')
    const fileExport = await file.getExport('createServer')
    const value = await fileExport!.getRuntimeValue()

    expectTypeOf(value).toMatchTypeOf<Function>()
  })

  test('file export schema', async () => {
    const fileSystem = new VirtualFileSystem({
      'index.ts': 'export const metadata = 1',
    })
    const directory = new Directory<{
      ts: { metadata: { title: string } }
    }>({
      fileSystem,
      schema: {
        ts: {
          metadata: (value) => {
            if (typeof value.title === 'string') {
              return value
            }
            throw new Error('Expected a title')
          },
        },
      },
      getModule: async (path) => {
        const transpiledCode = await fileSystem.transpileFile(path)
        const module = { exports: {} }

        runInNewContext(
          `(function(module, exports) { ${transpiledCode} })(module, module.exports);`,
          { module }
        )

        return module.exports
      },
    })
    const file = await directory.getFileOrThrow('index', 'ts')
    const fileExport = await file.getExportOrThrow('metadata')

    await expect(
      fileExport!.getRuntimeValue()
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: [renoun] Schema validation failed to parse export "metadata" at file path "./index.ts"]`
    )
  })

  test('getRuntimeValue is not typed when getModule is not defined', async () => {
    const FileSystemDirectory = new Directory({ path: 'src/file-system' })
    const file = await FileSystemDirectory.getFileOrThrow('path', 'ts')

    expectTypeOf(file!).toMatchTypeOf<JavaScriptFile<any>>()
    expect(file).toBeInstanceOf(JavaScriptFile)

    const fileExport = await file.getExport('basename')

    expectTypeOf(fileExport).not.toHaveProperty('getRuntimeValue')
    expect(fileExport).toBeInstanceOf(JavaScriptFileExport)

    // @ts-expect-error
    fileExport!.getRuntimeValue
  })

  test('getRuntimeValue resolves export runtime value from getModule', async () => {
    const FileSystemDirectory = new Directory({
      path: 'src/file-system',
      tsConfigPath: 'tsconfig.json',
      getModule: (path) => import(`./${path}`),
    })
    const file = await FileSystemDirectory.getFileOrThrow('path', 'ts')

    expectTypeOf(file).toMatchTypeOf<JavaScriptFileWithRuntime<any>>()
    expect(file).toBeInstanceOf(JavaScriptFileWithRuntime)

    const fileExport = await file.getExportOrThrow('basename')

    expectTypeOf(fileExport).toHaveProperty('getRuntimeValue')
    expect(fileExport).toBeInstanceOf(JavaScriptFileExportWithRuntime)

    const basename = await fileExport.getRuntimeValue()

    expect(basename).toBeDefined()
    expect(basename('/path/to/file.ts', '.ts')).toBe('file')
  })

  test('uses first file found when no file extension present', async () => {
    const ProjectDirectory = new Directory({ path: 'src/project' })
    const file = await ProjectDirectory.getFile('server')

    expect(file).toBeDefined()
  })

  test('generates sibling navigation from file', async () => {
    const ProjectDirectory = new Directory({ path: 'src/project' })
    const file = await ProjectDirectory.getFile('server', 'ts')
    const [previousEntry, nextEntry] = await file!.getSiblings()

    expect(previousEntry?.getName()).toBe('rpc')
    expect(nextEntry?.getName()).toBe('types')
  })

  test('generates sibling navigation from directory', async () => {
    const ProjectDirectory = new Directory({ path: 'src/project' })
    const directory = await ProjectDirectory.getDirectory('rpc')
    const [previousEntry, nextEntry] = await directory!.getSiblings()

    expect(previousEntry?.getName()).toBe('refresh')
    expect(nextEntry?.getName()).toBe('server')
  })

  test('generates tree navigation', async () => {
    const ProjectDirectory = new Directory({ path: 'src/project' })

    async function buildTreeNavigation<Entry extends FileSystemEntry<any>>(
      entry: Entry
    ) {
      const name = entry.getName()
      const path = entry.getPath()

      if (isFile(entry)) {
        return { name, path }
      }

      const entries = await entry.getEntries()

      return {
        name,
        path,
        children: await Promise.all(entries.map(buildTreeNavigation)),
      }
    }

    const sources = await ProjectDirectory.getEntries()
    const tree = await Promise.all(sources.map(buildTreeNavigation))

    expect(tree).toMatchInlineSnapshot(`
      [
        {
          "name": "client",
          "path": "./src/project/client.ts",
        },
        {
          "name": "get-project",
          "path": "./src/project/get-project.ts",
        },
        {
          "name": "refresh",
          "path": "./src/project/refresh.ts",
        },
        {
          "children": [
            {
              "name": "client",
              "path": "./src/project/rpc/client.ts",
            },
            {
              "name": "server",
              "path": "./src/project/rpc/server.ts",
            },
          ],
          "name": "rpc",
          "path": "./src/project/rpc",
        },
        {
          "name": "server",
          "path": "./src/project/server.ts",
        },
        {
          "name": "types",
          "path": "./src/project/types.ts",
        },
      ]
    `)
  })
})
