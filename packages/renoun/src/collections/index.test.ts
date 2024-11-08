import { describe, test, expect, expectTypeOf } from 'vitest'

import { VirtualFileSystem } from './file-system/VirtualFileSystem'
import {
  isFile,
  File,
  Directory,
  JavaScriptFile,
  type FileSystemEntry,
} from './index'

describe('collections', () => {
  test('virtual file system', async () => {
    const fileSystem = new VirtualFileSystem({
      'src/project/server.ts': 'export const server = 1',
      'src/project/types.ts': 'export interface Types {}',
    })
    const SrcDirectory = new Directory({
      path: 'src',
      fileExtensions: ['ts'],
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
    const ComponentsDirectory = new Directory({
      path: 'src/components',
      fileExtensions: ['ts', 'tsx'],
    })
    const directory = await ComponentsDirectory.getDirectory('CodeBlock')

    expect(directory).toBeInstanceOf(Directory)
  })

  test('returns file', async () => {
    const RootDirectory = new Directory({ fileExtensions: ['json'] })
    const file = await RootDirectory.getFile('tsconfig', 'json')

    expectTypeOf(file!).toMatchTypeOf<File>()
    expect(file!).toBeInstanceOf(File)
  })

  test('returns javascript file', async () => {
    const ProjectDirectory = new Directory({
      path: 'src/project',
      fileExtensions: ['ts'],
    })
    const file = await ProjectDirectory.getFile('server', 'ts')

    expect(file!).toBeInstanceOf(JavaScriptFile)
    expectTypeOf(file!).toMatchTypeOf<JavaScriptFile<any>>()
  })

  test('file exports', async () => {
    const ProjectDirectory = new Directory({
      path: 'src/project',
      fileExtensions: ['ts'],
    })
    const file = await ProjectDirectory.getFile('server', 'ts')
    const fileExports = await file!.getExports()

    expect(fileExports).toMatchObject([{ name: 'createServer' }])
  })

  test('virtual file exports', async () => {
    const fileSystem = new VirtualFileSystem({
      'server.ts': 'export const createServer = () => {}',
    })
    const RootDirectory = new Directory({
      fileSystem,
      fileExtensions: ['ts'],
    })
    const file = await RootDirectory.getFile('server', 'ts')
    const fileExports = await file!.getExports()

    expect(fileExports).toMatchObject([{ name: 'createServer' }])
  })

  test.todo(
    'getRuntimeValue is only typed when getJavaScriptModule is defined',
    async () => {
      const ProjectDirectory = new Directory({
        path: 'src/project',
        fileExtensions: ['ts', 'tsx'],
        tsConfigFilePath: 'tsconfig.json',
        getJavaScriptModule: (path) => import(`../project/${path}`),
      })
      const file = await ProjectDirectory.getFile('server', 'ts')
      const fileExports = await file!.getExports()
    }
  )

  test('uses collection file extensions when no file extension present', async () => {
    const ProjectDirectory = new Directory({
      path: 'src/project',
      fileExtensions: ['ts'],
    })
    const file = await ProjectDirectory.getFile('server')

    expect(file).toBeDefined()
  })

  test('generates sibling navigation from file', async () => {
    const ProjectDirectory = new Directory({
      path: 'src/project',
      fileExtensions: ['ts'],
    })
    const file = await ProjectDirectory.getFile('server', 'ts')
    const [previousEntry, nextEntry] = await file!.getSiblings()

    expect(previousEntry?.getName()).toBe('rpc')
    expect(nextEntry?.getName()).toBe('types')
  })

  test('generates sibling navigation from directory', async () => {
    const ProjectDirectory = new Directory({
      path: 'src/project',
      fileExtensions: ['ts'],
    })
    const directory = await ProjectDirectory.getDirectory('rpc')
    const [previousEntry, nextEntry] = await directory!.getSiblings()

    expect(previousEntry?.getName()).toBe('refresh')
    expect(nextEntry?.getName()).toBe('server')
  })

  test('generates tree navigation', async () => {
    const ProjectDirectory = new Directory<{ ts: object; tsx: object }>({
      path: 'src/project',
      fileExtensions: ['ts', 'tsx'],
      tsConfigFilePath: 'tsconfig.json',
    })

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
