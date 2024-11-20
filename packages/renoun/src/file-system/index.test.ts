import { describe, test, expect, expectTypeOf } from 'vitest'
import { runInNewContext } from 'node:vm'
import { z } from 'zod'

import { NodeFileSystem } from './NodeFileSystem'
import { VirtualFileSystem } from './VirtualFileSystem'
import {
  isFile,
  isFileWithExtension,
  File,
  Directory,
  JavaScriptFile,
  JavaScriptFileExport,
  type FileSystemEntry,
} from './index'

describe('file system', () => {
  test('node file system read directory', async () => {
    const fileSystem = new NodeFileSystem()
    const entries = await fileSystem.readDirectory('fixtures/utils')
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('path.ts')
  })

  test('virtual file system read directory', async () => {
    const fileSystem = new VirtualFileSystem({ 'fixtures/utils/path.ts': '' })
    const entries = await fileSystem.readDirectory('fixtures/utils')
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('path.ts')
  })

  test('directory with virtual file system', async () => {
    const fileSystem = new VirtualFileSystem({
      'fixtures/project/server.ts': '',
      'fixtures/project/types.ts': '',
    })
    const fixturesDirectory = new Directory({
      path: 'fixtures',
      fileSystem,
    })
    const directory = await fixturesDirectory.getDirectory('project')

    expect(directory).toBeInstanceOf(Directory)
    expect(directory?.getName()).toBe('project')

    const file = await fixturesDirectory.getFile('project/server', 'ts')

    expect(file).toBeInstanceOf(File)
    expect(file?.getName()).toBe('server')
  })

  test('entries', async () => {
    const fileSystem = new VirtualFileSystem({ 'foo.ts': '', 'bar.ts': '' })
    const directory = new Directory({ fileSystem })
    const entries = await directory.getEntries()

    expect(entries).toHaveLength(2)
  })

  test('recursive entries', async () => {
    const directory = new Directory({ path: 'fixtures/project' })
    const entries = await directory.getEntries({
      recursive: true,
      includeIndexAndReadme: true,
    })

    expect(entries.map((entry) => entry.getPath())).toMatchInlineSnapshot(`
      [
        "/rpc/client",
        "/rpc/server",
        "/rpc",
        "/server",
        "/types",
      ]
    `)
  })

  test('recursive entries does not error', async () => {
    const fixturesDirectory = new Directory({ path: 'fixtures' })

    await expect(
      fixturesDirectory.getEntries({ recursive: true })
    ).resolves.toBeDefined()
  })

  test('virtual recursive entries', async () => {
    const fileSystem = new VirtualFileSystem({
      'index.ts': '',
      'components/Button/index.tsx': '',
      'components/Link.tsx': '',
    })
    const directory = new Directory({ fileSystem })
    const entries = await directory.getEntries({
      recursive: true,
      includeIndexAndReadme: true,
    })

    expect(entries).toHaveLength(5)
    expect(entries.map((entry) => entry.getPath())).toMatchInlineSnapshot(`
      [
        "/index",
        "/components/Link",
        "/components/Button/index",
        "/components/Button",
        "/components",
      ]
    `)
  })

  test('filters out index and readme from entries by default', async () => {
    const fileSystem = new VirtualFileSystem({
      'index.tsx': '',
      'README.mdx': '',
      'server.ts': '',
    })
    const directory = new Directory({ fileSystem })
    const entries = await directory.getEntries()

    expect(entries).toHaveLength(1)
  })

  test('filter entries', async () => {
    type PostType = { frontmatter: { title: string } }
    const fileSystem = new VirtualFileSystem({
      'posts/getting-started.mdx': '# Getting Started',
      'posts/meta.json': '{ "title": "Posts" }',
    })
    const posts = new Directory<{ mdx: PostType }>({
      path: 'posts',
      fileSystem,
    })
      .filter((entry) => isFileWithExtension(entry, 'mdx'))
      .sort((a, b) => a.getName().localeCompare(b.getName()))
    const files = await posts.getEntries()

    expectTypeOf(files).toMatchTypeOf<JavaScriptFile<PostType>[]>()
    expect(files).toHaveLength(1)
  })

  test('filter entries with type guard', async () => {
    type PostType = { frontmatter: { title: string } }
    const posts = new Directory<{ mdx: PostType }>({
      path: 'fixtures/posts',
    }).filter((entry) => isFileWithExtension(entry, 'mdx'))
    const files = await posts.getEntries()

    expectTypeOf(files).toMatchTypeOf<JavaScriptFile<PostType>[]>()
    expect(files).toHaveLength(1)
  })

  test('sort entries', async () => {
    const fileSystem = new VirtualFileSystem({
      'foo.ts': '',
      'bar.ts': '',
    })
    const directory = new Directory({ fileSystem }).sort((a, b) =>
      a.getName().localeCompare(b.getName())
    )
    const entries = await directory.getEntries()

    expect(entries.map((entry) => entry.getName())).toMatchInlineSnapshot(`
      [
        "bar",
        "foo",
      ]
    `)
  })

  test('filter and sort entries', async () => {
    const fileSystem = new VirtualFileSystem({
      'foo.ts': 'const sort = 2',
      'bar.ts': 'const sort = 1',
    })
    const directory = new Directory<{ ts: { sort: number } }>({
      fileSystem,
      getModule: async (path) => {
        if (path === 'foo.ts') {
          return { sort: 2 }
        }
        if (path === 'bar.ts') {
          return { sort: 1 }
        }
      },
    })
      .filter((entry) => isFileWithExtension(entry, 'ts'))
      .sort(async (a, b) => {
        const aSort = await a.getExport('sort').getRuntimeValue()
        const bSort = await b.getExport('sort').getRuntimeValue()
        return aSort - bSort
      })
    const entries = await directory.getEntries()

    expect(entries.map((entry) => entry.getName())).toMatchInlineSnapshot(`
      [
        "bar",
        "foo",
      ]
    `)
  })

  test('filter and recursive entries', async () => {
    const docs = new Directory({ path: 'fixtures/docs' }).filter((entry) =>
      isFileWithExtension(entry, 'mdx')
    )
    const entries = await docs.getEntries({ recursive: true })

    expect(entries.every((entry) => entry.getExtension() === 'mdx')).toBe(true)
    expect(entries).toHaveLength(2)
  })

  test('entry', async () => {
    const fixturesDirectory = new Directory({ path: 'fixtures' })

    expect(await fixturesDirectory.getEntry('project')).toBeInstanceOf(
      Directory
    )
    expect(
      await (
        await fixturesDirectory.getDirectoryOrThrow('project')
      ).getEntry('server')
    ).toBeInstanceOf(File)
  })

  test('directory', async () => {
    const componentsDirectory = new Directory({ path: 'fixtures/components' })
    const directory = await componentsDirectory.getDirectory('CodeBlock')

    expect(directory).toBeInstanceOf(Directory)
  })

  test('nested directory', async () => {
    const rootDirectory = new Directory()
    const nestedDirectory = await rootDirectory.getDirectory(
      'fixtures/project/rpc'
    )

    expect(nestedDirectory).toBeInstanceOf(Directory)
  })

  test('file', async () => {
    const rootDirectory = new Directory()
    const file = await rootDirectory.getFile('tsconfig', 'json')

    expectTypeOf(file!).toMatchTypeOf<File>()
    expect(file!).toBeInstanceOf(File)
  })

  test('nested file', async () => {
    const rootDirectory = new Directory()
    const nestedfile = await rootDirectory.getFile(
      'fixtures/project/rpc/server',
      'ts'
    )

    expect(nestedfile).toBeInstanceOf(File)
  })

  test('index file', async () => {
    const fixturesDirectory = new Directory()
    const file = await fixturesDirectory.getFile([
      'fixtures',
      'components',
      'index',
    ])

    expect(file).toBeInstanceOf(File)
  })

  test('readme file', async () => {
    const fixturesDirectory = new Directory()
    const file = await fixturesDirectory.getFile(
      'fixtures/components/README',
      'mdx'
    )

    expect(file).toBeInstanceOf(File)
  })

  test('javascript file', async () => {
    const projectDirectory = new Directory({ path: 'fixtures/project' })
    const file = await projectDirectory.getFile('server', 'ts')

    expect(file!).toBeInstanceOf(JavaScriptFile)
    expectTypeOf(file!).toMatchTypeOf<JavaScriptFile<any>>()
  })

  test('removes order prefix from file name and path', async () => {
    const fileSystem = new VirtualFileSystem({
      '01.server.ts': '',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFileOrThrow('server', 'ts')

    expect(file).toBeInstanceOf(File)
    expect(file.getName()).toBe('server')
    expect(file.getPath()).toBe('/server')
    expect(file.getPathSegments()).toStrictEqual(['server'])
  })

  test('all file exports', async () => {
    const projectDirectory = new Directory({ path: 'fixtures/project' })
    const file = await projectDirectory.getFile('server', 'ts')
    const fileExports = await file!.getExports()

    expect(await fileExports[0].getName()).toMatch('createServer')
  })

  test('all virtual file exports', async () => {
    const fileSystem = new VirtualFileSystem({
      'use-hover.ts': 'export const useHover = () => {}',
    })
    const rootDirectory = new Directory({ fileSystem })
    const file = await rootDirectory.getFileOrThrow('use-hover', 'ts')
    const fileExports = await Promise.all(
      (await file.getExports()).map(async (fileExport) => ({
        name: await fileExport.getName(),
      }))
    )

    expect(fileExports).toMatchObject([{ name: 'useHover' }])
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
    const value = await file.getExport('useHover').getRuntimeValue()

    expectTypeOf(value).toMatchTypeOf<Function>()
    expect(value).toBeInstanceOf(Function)
  })

  test('file export value types', async () => {
    const projectDirectory = new Directory<{
      ts: { createServer: () => void }
    }>({
      path: 'fixtures/project',
      getModule: (path) => import(`#fixtures/project/${path}`),
    })
    const file = await projectDirectory.getFileOrThrow('server', 'ts')
    const value = await file.getExport('createServer').getRuntimeValue()

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
    const fileExport = file.getExport('metadata')

    await expect(
      fileExport!.getRuntimeValue()
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: [renoun] Schema validation failed to parse export "metadata" at file path "./index.ts" errored with: Expected a title]`
    )
  })

  test('schema transforms export value', async () => {
    const fileSystem = new VirtualFileSystem({
      'hello-world.ts': `export const metadata = { title: 'Hello, World!', date: '2022-01-01' }`,
    })
    const metadataSchema = z.object({
      title: z.string(),
      date: z.coerce.date(),
    })
    const directory = new Directory<{
      ts: {
        metadata: z.infer<typeof metadataSchema>
      }
    }>({
      fileSystem,
      schema: {
        ts: {
          metadata: metadataSchema.parse,
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
    const file = await directory.getFileOrThrow('hello-world', 'ts')
    const metadata = await file.getExport('metadata').getRuntimeValue()

    expect(metadata).toMatchObject({
      title: 'Hello, World!',
      date: new Date('2022-01-01'),
    })
  })

  test('file export metadata', async () => {
    const fileSystem = new VirtualFileSystem({
      'index.ts': `/**\n * Say hello.\n * @category greetings\n */\nexport default function hello() {}`,
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFileOrThrow('index', 'ts')
    const fileExport = file.getExport('default')

    expect(fileExport).toBeInstanceOf(JavaScriptFileExport)
    expect(await fileExport.getName()).toBe('hello')
    expect(await fileExport.getDescription()).toBe('Say hello.')
    expect(await fileExport.getTags()).toMatchObject([
      { tagName: 'category', text: 'greetings' },
    ])
  })

  test('file export type reference', async () => {
    const fileSystem = new VirtualFileSystem({
      'index.ts': 'export type Metadata = { title: string }',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFileOrThrow('index', 'ts')
    const fileExport = file.getExport('Metadata')
    const type = await fileExport.getType()

    expect(type).toBeDefined()
    expect(type!.kind).toBe('Object')
    expect(type!.name).toBe('Metadata')
  })

  test('getRuntimeValue resolves export runtime value from getModule', async () => {
    const fileSystemDirectory = new Directory({
      path: 'fixtures/utils',
      getModule: (path) => import(`#fixtures/utils/${path}`),
    })
    const file = await fileSystemDirectory.getFileOrThrow('path', 'ts')

    expectTypeOf(file).toMatchTypeOf<JavaScriptFile<any>>()
    expect(file).toBeInstanceOf(JavaScriptFile)

    const fileExport = file.getExport('basename')

    expectTypeOf(fileExport).toHaveProperty('getRuntimeValue')
    expect(fileExport).toBeInstanceOf(JavaScriptFileExport)

    const basename = await fileExport.getRuntimeValue()

    expect(basename).toBeDefined()
    expect(basename('/path/to/file.ts', '.ts')).toBe('file')
  })

  test('uses first file found when no file extension present', async () => {
    const projectDirectory = new Directory({ path: 'fixtures/project' })
    const file = await projectDirectory.getFile('server')

    expect(file).toBeDefined()
  })

  test('attempts to load index file when targeting directory path', async () => {
    const fileSystem = new VirtualFileSystem({
      'fixtures/project/index.ts': 'export const project = 1',
    })
    const rootDirectory = new Directory({ fileSystem })
    const file = await rootDirectory.getFile('fixtures/project')

    expect(file).toBeInstanceOf(File)
  })

  test('attempts to load readme file when targeting directory path', async () => {
    const fileSystem = new VirtualFileSystem({
      'fixtures/project/README.mdx': '# Project',
    })
    const projectDirectory = new Directory({ path: 'fixtures', fileSystem })
    const file = await projectDirectory.getFile('project')

    expect(file).toBeInstanceOf(File)
  })

  test('generates sibling navigation from file', async () => {
    const projectDirectory = new Directory({ path: 'fixtures/project' })
    const file = await projectDirectory.getFile('server', 'ts')
    const [previousEntry, nextEntry] = await file!.getSiblings()

    expect(previousEntry?.getName()).toBe('rpc')
    expect(nextEntry?.getName()).toBe('types')
  })

  test('generates sibling navigation from directory', async () => {
    const projectDirectory = new Directory({ path: 'fixtures/project' })
    const directory = await projectDirectory.getDirectory('rpc')
    const [previousEntry, nextEntry] = await directory!.getSiblings()

    expect(previousEntry).toBe(undefined)
    expect(nextEntry?.getName()).toBe('server')
  })

  test('generates sibling navigation from index as directory', async () => {
    const fileSystem = new VirtualFileSystem({
      'components/index.ts': '',
      'utils/index.ts': '',
    })
    const rootDirectory = new Directory({ fileSystem })
    const indexFile = await rootDirectory.getFileOrThrow('components/index')
    const [previousEntry, nextEntry] = await indexFile.getSiblings()

    expect(previousEntry).toBe(undefined)
    expect(nextEntry?.getName()).toBe('utils')
    expect(nextEntry).toBeInstanceOf(Directory)
  })

  test('generates tree navigation', async () => {
    const projectDirectory = new Directory({
      path: 'fixtures/project',
      basePath: 'project',
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

    const sources = await projectDirectory.getEntries()
    const tree = await Promise.all(sources.map(buildTreeNavigation))

    expect(tree).toMatchInlineSnapshot(`
      [
        {
          "children": [
            {
              "name": "client",
              "path": "/project/rpc/client",
            },
            {
              "name": "server",
              "path": "/project/rpc/server",
            },
          ],
          "name": "rpc",
          "path": "/project/rpc",
        },
        {
          "name": "server",
          "path": "/project/server",
        },
        {
          "name": "types",
          "path": "/project/types",
        },
      ]
    `)
  })

  test('uses directory name when index or readme file', async () => {
    const projectDirectory = new Directory({ path: 'fixtures/components' })
    const indexFile = await projectDirectory.getFile('index')
    const readmeFile = await projectDirectory.getFile('README')

    expect(indexFile?.getName()).toBe('components')
    expect(readmeFile?.getName()).toBe('components')
  })

  test('adds basePath to file and directory getPath', async () => {
    const projectDirectory = new Directory({
      path: 'fixtures/project',
      basePath: 'renoun',
    })
    const file = await projectDirectory.getFileOrThrow('server', 'ts')
    const directory = await projectDirectory.getDirectoryOrThrow('rpc')

    expect(file.getPath()).toBe('/renoun/server')
    expect(directory.getPath()).toBe('/renoun/rpc')
  })

  test('does not add basePath to getPathSegments', async () => {
    const projectDirectory = new Directory({
      path: 'fixtures/project',
      basePath: 'renoun',
    })
    const segments = (
      await projectDirectory.getDirectoryOrThrow('rpc')
    ).getPathSegments()

    expect(segments).toEqual(['rpc'])
  })

  test('uses file name for anonymous default export metadata', async () => {
    const fileSystem = new VirtualFileSystem({
      'index.ts': `export default function () {}`,
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFileOrThrow('index', 'ts')
    const fileExport = file.getExport('default')

    expect(await fileExport.getName()).toBe(file.getName())
  })

  test('isFileWithExtension', async () => {
    type Metadata = { title: string }
    const fileSystem = new VirtualFileSystem({ 'Button.tsx': '' })
    const directory = new Directory<{ tsx: Metadata }>({ fileSystem })
    const file = await directory.getFileOrThrow('Button')
    const hasTsxExtension = isFileWithExtension(file, 'tsx')

    expect(hasTsxExtension).toBe(true)

    if (hasTsxExtension) {
      expectTypeOf(file).toMatchTypeOf<JavaScriptFile<Metadata>>()
    }
  })

  test('isFileWithExtension array', async () => {
    type Metadata = { title: string }
    type FileTypes = { ts: Metadata; tsx: Metadata }
    const fileSystem = new VirtualFileSystem({ 'Button.tsx': '' })
    const directory = new Directory<FileTypes>({ fileSystem })
    const file = await directory.getFileOrThrow('Button')
    const hasTsLikeExtension = isFileWithExtension(file, ['ts', 'tsx'])

    expect(hasTsLikeExtension).toBe(true)

    if (hasTsLikeExtension) {
      expectTypeOf(file).toMatchTypeOf<JavaScriptFile<Metadata>>()
    }

    const hasCssExtension = isFileWithExtension(file, ['css'])

    expect(hasCssExtension).toBe(false)

    if (hasCssExtension) {
      expectTypeOf(file).toMatchTypeOf<File<FileTypes>>()
    }
  })
})
