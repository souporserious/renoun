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
      'src/project/server.ts': '',
      'src/project/types.ts': '',
    })
    const srcDirectory = new Directory({
      path: 'src',
      fileSystem,
    })
    const directory = await srcDirectory.getDirectory('project')

    expect(directory).toBeInstanceOf(Directory)
    expect(directory?.getName()).toBe('project')

    const file = await srcDirectory.getFile('project/server', 'ts')

    expect(file).toBeInstanceOf(File)
    expect(file?.getName()).toBe('server')
  })

  test('returns entries', async () => {
    const fileSystem = new VirtualFileSystem({ 'foo.ts': '', 'bar.ts': '' })
    const directory = new Directory({ fileSystem })
    const entries = await directory.getEntries()

    expect(entries).toHaveLength(2)
  })

  test('filters out index and readme from entries', async () => {
    const fileSystem = new VirtualFileSystem({
      'index.tsx': '',
      'README.mdx': '',
      'server.ts': '',
    })
    const directory = new Directory({ fileSystem })
    const entries = await directory.getEntries()

    expect(entries).toHaveLength(1)
  })

  test('returns entry', async () => {
    const srcDirectory = new Directory({ path: 'src' })

    expect(await srcDirectory.getEntry('project')).toBeInstanceOf(Directory)
    expect(
      await (
        await srcDirectory.getDirectoryOrThrow('project')
      ).getEntry('server')
    ).toBeInstanceOf(File)
  })

  test('returns directory', async () => {
    const componentsDirectory = new Directory({ path: 'src/components' })
    const directory = await componentsDirectory.getDirectory('CodeBlock')

    expect(directory).toBeInstanceOf(Directory)
  })

  test('returns nested directory', async () => {
    const rootDirectory = new Directory()
    const nestedDirectory = await rootDirectory.getDirectory('src/project/rpc')

    expect(nestedDirectory).toBeInstanceOf(Directory)
  })

  test('returns file', async () => {
    const rootDirectory = new Directory()
    const file = await rootDirectory.getFile('tsconfig', 'json')

    expectTypeOf(file!).toMatchTypeOf<File>()
    expect(file!).toBeInstanceOf(File)
  })

  test('returns nested file', async () => {
    const rootDirectory = new Directory()
    const nestedfile = await rootDirectory.getFile(
      'src/project/rpc/server',
      'ts'
    )

    expect(nestedfile).toBeInstanceOf(File)
  })

  test('returns index file', async () => {
    const srcDirectory = new Directory()
    const file = await srcDirectory.getFile(['src', 'components', 'index'])

    expect(file).toBeInstanceOf(File)
  })

  test('returns readme file', async () => {
    const srcDirectory = new Directory()
    const file = await srcDirectory.getFile('src/components/README', 'mdx')

    expect(file).toBeInstanceOf(File)
  })

  test('returns javascript file', async () => {
    const projectDirectory = new Directory({ path: 'src/project' })
    const file = await projectDirectory.getFile('server', 'ts')

    expect(file!).toBeInstanceOf(JavaScriptFile)
    expectTypeOf(file!).toMatchTypeOf<JavaScriptFile<any>>()
  })

  test('all file exports', async () => {
    const projectDirectory = new Directory({ path: 'src/project' })
    const file = await projectDirectory.getFile('server', 'ts')
    const fileExports = await file!.getExports()

    expect(fileExports).toMatchObject([
      { name: 'createServer', position: 1245 },
    ])
  })

  test('all virtual file exports', async () => {
    const fileSystem = new VirtualFileSystem({
      'use-hover.ts': 'export const useHover = () => {}',
    })
    const rootDirectory = new Directory({ fileSystem })
    const file = await rootDirectory.getFile('use-hover', 'ts')
    const fileExports = await file!.getExports()

    expect(fileExports).toMatchObject([{ name: 'useHover', position: 12 }])
  })

  test('single virtual file export', async () => {
    const fileSystem = new VirtualFileSystem({
      'use-hover.ts': 'export const useHover = () => {}',
    })
    const rootDirectory = new Directory<{
      ts: { useHover: Function }
    }>({
      fileSystem,
      getModule: async () => {
        return {
          useHover: () => {},
        }
      },
    })
    const file = await rootDirectory.getFileOrThrow('use-hover', 'ts')
    const fileExport = await file.getExport('useHover')
    const value = await fileExport.getRuntimeValue()

    expectTypeOf(value).toMatchTypeOf<Function>()
    expect(value).toBeInstanceOf(Function)
  })

  test('file export value types', async () => {
    const projectDirectory = new Directory<{
      ts: { createServer: () => void }
    }>({
      path: 'src/project',
      getModule: (path) => import(`../project/${path}`),
    })
    const file = await projectDirectory.getFileOrThrow('server', 'ts')
    const fileExport = await file.getExport('createServer')
    const value = await fileExport.getRuntimeValue()

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
    const fileExport = await file.getExport('metadata')

    await expect(
      fileExport!.getRuntimeValue()
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[TypeError: Cannot read properties of undefined (reading 'getText')]`
    )
  })

  test('getRuntimeValue is not typed when getModule is not defined', async () => {
    const fileSystemDirectory = new Directory({ path: 'src/file-system' })
    const file = await fileSystemDirectory.getFileOrThrow('path', 'ts')

    expectTypeOf(file!).toMatchTypeOf<JavaScriptFile<any>>()
    expect(file).toBeInstanceOf(JavaScriptFile)

    const fileExport = await file.getExport('basename')

    expectTypeOf(fileExport).not.toHaveProperty('getRuntimeValue')
    expect(fileExport).toBeInstanceOf(JavaScriptFileExport)

    // @ts-expect-error
    fileExport!.getRuntimeValue
  })

  test('getRuntimeValue resolves export runtime value from getModule', async () => {
    const fileSystemDirectory = new Directory({
      path: 'src/file-system',
      getModule: (path) => import(`./${path}`),
    })
    const file = await fileSystemDirectory.getFileOrThrow('path', 'ts')

    expectTypeOf(file).toMatchTypeOf<JavaScriptFileWithRuntime<any>>()
    expect(file).toBeInstanceOf(JavaScriptFileWithRuntime)

    const fileExport = await file.getExport('basename')

    expectTypeOf(fileExport).toHaveProperty('getRuntimeValue')
    expect(fileExport).toBeInstanceOf(JavaScriptFileExportWithRuntime)

    const basename = await fileExport.getRuntimeValue()

    expect(basename).toBeDefined()
    expect(basename('/path/to/file.ts', '.ts')).toBe('file')
  })

  test('uses first file found when no file extension present', async () => {
    const projectDirectory = new Directory({ path: 'src/project' })
    const file = await projectDirectory.getFile('server')

    expect(file).toBeDefined()
  })

  test('attempts to load index file when targeting directory path', async () => {
    const fileSystem = new VirtualFileSystem({
      'src/project/index.ts': 'export const project = 1',
    })
    const rootDirectory = new Directory({ fileSystem })
    const file = await rootDirectory.getFile('src/project')

    expect(file).toBeInstanceOf(File)
  })

  test('attempts to load readme file when targeting directory path', async () => {
    const fileSystem = new VirtualFileSystem({
      'src/project/README.mdx': '# Project',
    })
    const projectDirectory = new Directory({ path: 'src', fileSystem })
    const file = await projectDirectory.getFile('project')

    expect(file).toBeInstanceOf(File)
  })

  test('generates sibling navigation from file', async () => {
    const projectDirectory = new Directory({ path: 'src/project' })
    const file = await projectDirectory.getFile('server', 'ts')
    const [previousEntry, nextEntry] = await file!.getSiblings()

    expect(previousEntry?.getName()).toBe('rpc')
    expect(nextEntry?.getName()).toBe('types')
  })

  test('generates sibling navigation from directory', async () => {
    const projectDirectory = new Directory({ path: 'src/project' })
    const directory = await projectDirectory.getDirectory('rpc')
    const [previousEntry, nextEntry] = await directory!.getSiblings()

    expect(previousEntry?.getName()).toBe('refresh')
    expect(nextEntry?.getName()).toBe('server')
  })

  test('generates tree navigation', async () => {
    const projectDirectory = new Directory({ path: 'src/project' })

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

    const sources = await projectDirectory.getEntries()
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
