import type { ComponentType } from 'react'
import { describe, test, expect, expectTypeOf } from 'vitest'
import { runInNewContext } from 'node:vm'
import * as v from 'valibot'
import { z } from 'zod'

import type { basename } from '#fixtures/utils/path.ts'
import type { MDXContent } from '../mdx'
import { NodeFileSystem } from './NodeFileSystem'
import { MemoryFileSystem } from './MemoryFileSystem'
import {
  type FileSystemEntry,
  File,
  Directory,
  JavaScriptFile,
  JavaScriptFileExport,
  EntryGroup,
  isDirectory,
  isFile,
  isJavaScriptFile,
  withSchema,
} from './index'

type IsNotAny<Type> = 0 extends 1 & Type ? never : Type

describe('file system', () => {
  test('node file system read directory', async () => {
    const fileSystem = new NodeFileSystem()
    const entries = await fileSystem.readDirectory('fixtures/utils')
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('path.ts')
  })

  test('virtual file system read directory', async () => {
    const fileSystem = new MemoryFileSystem({ 'fixtures/utils/path.ts': '' })
    const entries = await fileSystem.readDirectory('fixtures/utils')
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('path.ts')
  })

  test('directory with virtual file system', async () => {
    const fileSystem = new MemoryFileSystem({
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
    const fileSystem = new MemoryFileSystem({ 'foo.ts': '', 'bar.ts': '' })
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
        "/rpc",
        "/rpc/client",
        "/rpc/server",
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
    const fileSystem = new MemoryFileSystem({
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
        "/components",
        "/components/button",
        "/components/button/index",
        "/components/link",
      ]
    `)
  })

  test('filters out index and readme from entries by default', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.tsx': '',
      'README.mdx': '',
      'server.ts': '',
    })
    const directory = new Directory({ fileSystem })
    const entries = await directory.getEntries()

    expect(entries).toHaveLength(1)
  })

  test('orders directory before its descendants by default', async () => {
    const fileSystem = new MemoryFileSystem({
      'Button/Button.tsx': '',
      'Button/IconButton.tsx': '',
    })
    const directory = new Directory({ fileSystem, pathCasing: 'none' })
    const entries = await directory.getEntries({ recursive: true })

    expect(entries.map((entry) => entry.getPath())).toEqual([
      '/Button',
      '/Button/IconButton',
    ])
  })

  test('loaders', async () => {
    const directory = new Directory({
      path: 'fixtures/utils',
      loaders: {
        ts: withSchema<{ basename: typeof basename }>(
          (path) => import(`#fixtures/utils/${path}.ts`)
        ),
      },
    })
    const file = await directory.getFileOrThrow('path', 'ts')
    const basenameFn = await file.getExportValueOrThrow('basename')

    expectTypeOf(basenameFn).toMatchTypeOf<
      (path: string, extension?: string) => string
    >()
    expect(basenameFn('fixtures/utils/path.ts')).toBe('path.ts')
  })

  describe('withSchema', () => {
    test('types only', async () => {
      const directory = new Directory({
        path: 'fixtures/docs',
        loaders: {
          ts: withSchema<{ metadata?: { title: string } }>(
            (path) => import(`#fixtures/docs/${path}.ts`)
          ),
        },
      })
      const value = await (
        await directory.getFileOrThrow('introduction', 'ts')
      ).getExportValue('metadata')

      value satisfies IsNotAny<typeof value>

      expectTypeOf(value).toMatchTypeOf<{ title: string } | undefined>()
    })

    test('custom validator', async () => {
      const directory = new Directory({
        path: 'fixtures/docs',
        loaders: {
          ts: withSchema<{ metadata: { title: string } }>(
            {
              metadata: (value) => {
                if (typeof value.title === 'string') {
                  return value
                }
                throw new Error('Expected a title')
              },
            },
            (path) => import(`#fixtures/docs/${path}.ts`)
          ),
        },
      })
      const value = await (
        await directory.getFileOrThrow('introduction', 'ts')
      ).getExportValueOrThrow('metadata')

      value satisfies IsNotAny<typeof value>

      expectTypeOf(value).toMatchTypeOf<{ title: string }>()
    })

    test('inferred validator', async () => {
      const directory = new Directory({
        path: 'fixtures/docs',
        loaders: {
          ts: withSchema(
            {
              metadata: (value: { title: string }) => {
                return value
              },
            },
            (path) => import(`#fixtures/docs/${path}.ts`)
          ),
        },
      })
      const value = await (
        await directory.getFileOrThrow('introduction', 'ts')
      ).getExportValue('metadata')

      value satisfies IsNotAny<typeof value>

      expectTypeOf(value).toMatchTypeOf<{ title: string } | undefined>()
    })

    test('valibot', async () => {
      const directory = new Directory({
        path: 'fixtures/docs',
        loaders: {
          ts: {
            schema: {
              metadata: v.object({
                title: v.string(),
                date: v.date(),
              }),
            },
            runtime: (path) => import(`#fixtures/docs/${path}.ts`),
          },
        },
      })
      const value = await (
        await directory.getFileOrThrow('introduction', 'ts')
      ).getExportValue('metadata')

      value satisfies IsNotAny<typeof value>

      expectTypeOf(value).toMatchTypeOf<
        { title: string; date: Date } | undefined
      >()
    })

    test('zod', async () => {
      const directory = new Directory({
        path: 'fixtures/docs',
        loaders: {
          ts: {
            schema: {
              metadata: z.object({
                title: z.string(),
                date: z.date().optional(),
              }),
            },
            runtime: (path) => import(`#fixtures/docs/${path}.ts`),
          },
        },
      })
      const value = await (
        await directory.getFileOrThrow('introduction', 'ts')
      ).getExportValue('metadata')

      value satisfies IsNotAny<typeof value>

      expectTypeOf(value).toMatchTypeOf<
        { title: string; date?: Date } | undefined
      >()
    })
  })

  test('filter entries', async () => {
    type PostType = { frontmatter: { title: string } }
    const posts = new Directory({
      path: 'fixtures/posts',
      loaders: {
        mdx: withSchema<PostType>(
          {
            frontmatter: (value) => {
              if (typeof value.title === 'string') {
                return value
              }
              throw new Error('Expected a title')
            },
          },
          (path) => import(`#fixtures/posts/${path}.mdx`)
        ),
      },
      include: (entry) => isFile(entry, 'mdx'),
    })
    const files = await posts.getEntries()

    expectTypeOf(files).toMatchTypeOf<JavaScriptFile<PostType>[]>()
    expect(files).toHaveLength(1)
  })

  test('filter virtual entries', async () => {
    type PostType = { frontmatter: { title: string } }
    const fileSystem = new MemoryFileSystem({
      'posts/getting-started.mdx': '# Getting Started',
      'posts/meta.json': '{ "title": "Posts" }',
    })
    const posts = new Directory({
      fileSystem,
      path: 'posts',
      loaders: {
        mdx: withSchema<PostType>(),
      },
      include: (entry) => isFile(entry, 'mdx'),
    })
    const files = await posts.getEntries()

    expectTypeOf(files).toMatchTypeOf<JavaScriptFile<PostType>[]>()
    expect(files).toHaveLength(1)
  })

  test('filter entries with file exports that have internal tags', async () => {
    const fileSystem = new MemoryFileSystem({
      'Button.tsx': '/** @internal */ export const Button = () => {}',
      'Link.tsx': 'export const Link = () => {}',
    })
    const directory = new Directory({
      fileSystem,
      include: async (entry) => {
        if (isFile(entry, 'tsx')) {
          const fileExports = await entry.getExports()

          for (const fileExport of fileExports) {
            const tags = fileExport.getTags()

            if (tags?.some((tag) => tag.tagName === 'internal')) {
              return false
            }
          }

          return true
        }

        return false
      },
    })
    const entries = await directory.getEntries()

    expect(entries).toHaveLength(1)
  })

  test('string filter', async () => {
    const fileSystem = new MemoryFileSystem({
      'foo.ts': '',
      'bar.tsx': '',
      'baz.mdx': '',
    })
    const directory = new Directory({
      fileSystem,
      include: '*.mdx',
    })
    const entries = await directory.getEntries()

    expectTypeOf(entries).toMatchTypeOf<JavaScriptFile[]>()

    expect(entries).toHaveLength(1)
  })

  test('sort entries', async () => {
    const fileSystem = new MemoryFileSystem({
      'foo.ts': '',
      'bar.ts': '',
    })
    const directory = new Directory({
      fileSystem,
      sort: (a, b) => a.getName().localeCompare(b.getName()),
    })
    const entries = await directory.getEntries()

    expect(entries.map((entry) => entry.getName())).toMatchInlineSnapshot(`
      [
        "bar",
        "foo",
      ]
    `)
  })

  test('filter and sort entries', async () => {
    const fileSystem = new MemoryFileSystem({
      'foo.ts': 'const sort = 2',
      'bar.ts': 'const sort = 1',
    })
    const imports = {
      'foo.ts': () => Promise.resolve({ sort: 2 }),
      'bar.ts': () => Promise.resolve({ sort: 1 }),
    }
    const directory = new Directory({
      fileSystem,
      loaders: {
        ts: withSchema<{ sort: number }>((path) => {
          const importPath = `${path}.ts` as keyof typeof imports
          return imports[importPath]()
        }),
      },
      include: (entry) => {
        return isFile(entry, 'ts')
      },
      sort: async (a, b) => {
        const aSort = await a.getExportValueOrThrow('sort')
        const bSort = await b.getExportValueOrThrow('sort')
        return aSort - bSort
      },
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
    const docs = new Directory({
      path: 'fixtures/docs',
      include(entry) {
        return isFile(entry, 'mdx')
      },
    })
    const entries = await docs.getEntries({ recursive: true })

    expect(entries.every((entry) => entry.getExtension() === 'mdx')).toBe(true)
    expect(entries).toHaveLength(2)
  })

  test('deduplicates entries', async () => {
    const fileSystem = new MemoryFileSystem({
      'Button.tsx': '',
      'Button.mdx': '',
      'CodeBlock/CodeBlock.tsx': '',
      'CodeBlock/CodeBlock.mdx': '',
      'CodeBlock/index.ts': '',
    })
    const directory = new Directory({ fileSystem })
    const entries = await directory.getEntries()

    expect(entries).toHaveLength(2)

    const fileEntry = entries.at(0) as File

    expect(fileEntry.getName()).toBe('Button')
    expect(fileEntry.getExtension()).toBe('tsx')

    const directoryEntry = entries.at(1) as Directory<any>

    expect(directoryEntry.getName()).toBe('CodeBlock')
  })

  test('excludes entries based on tsconfig', async () => {
    const fileSystem = new MemoryFileSystem({
      'Button/Button.tsx': '',
      'Button/examples/BasicUsage.tsx': '',
      'CodeBlock.tsx': '',
      'CodeBlock.examples.tsx': '',
      'tsconfig.json': '{ "exclude": ["**/*.examples.tsx", "**/examples/**"] }',
    })
    const directory = new Directory({ fileSystem })
    const entries = await directory.getEntries({ recursive: true })

    expect(entries.map((entry) => entry.getPath())).toMatchInlineSnapshot(`
      [
        "/button",
        "/code-block",
        "/tsconfig",
      ]
    `)
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
    const nestedFile = await rootDirectory.getFile(
      'fixtures/project/rpc/server',
      'ts'
    )

    expect(nestedFile).toBeInstanceOf(File)

    const missingNestedFile = await new Directory({
      path: 'components',
      fileSystem: new MemoryFileSystem({
        'components/CodeBlock/CodeBlock.tsx': '',
        'components/CodeBlock/CodeBlock.mdx': '',
        'components/CodeBlock/CopyButton.tsx': '',
      }),
    }).getFile(['CodeBlock', 'CopyButton'], 'mdx')

    expect(missingNestedFile).toBeUndefined()
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

  test('javascript file with runtime', async () => {
    const projectDirectory = new Directory({
      path: 'fixtures/project',
      loaders: {
        ts: (path) => import(`#fixtures/project/${path}.ts`),
      },
    })
    const file = await projectDirectory.getFileOrThrow('server', 'ts')

    expect(file).toBeInstanceOf(JavaScriptFile)
    expectTypeOf(file).toMatchTypeOf<JavaScriptFile<any>>()
  })

  test('is javascript file with runtime', async () => {
    const projectDirectory = new Directory({
      path: 'fixtures/project',
      loaders: {
        ts: (path) => import(`#fixtures/project/${path}.ts`),
      },
    })
    const entry = await projectDirectory.getEntryOrThrow('server')

    expect(isJavaScriptFile(entry)).toBe(true)

    if (isJavaScriptFile(entry)) {
      expectTypeOf(entry).toMatchTypeOf<JavaScriptFile<any>>()
    }
  })

  test('file name with modifier', async () => {
    const fileSystem = new MemoryFileSystem({
      'APIReference.examples.tsx': '',
      'APIReference.tsx': '',
    })
    const directory = new Directory({ fileSystem })
    const entry = await directory.getEntryOrThrow(['APIReference', 'examples'])

    expect(entry.getAbsolutePath()).toBe('/APIReference.examples.tsx')
  })

  test('prioritizes base file name over file name with modifier', async () => {
    const fileSystem = new MemoryFileSystem({
      'APIReference.examples.tsx': '',
      'APIReference.tsx': '',
    })
    const directory = new Directory({ fileSystem })
    const entry = await directory.getEntryOrThrow('APIReference')

    expect(entry.getAbsolutePath()).toBe('/APIReference.tsx')
  })

  test('chooses entry with same name as directory when bare file path', async () => {
    const directory = new Directory({
      path: 'fixtures/components',
      basePath: 'components',
    })
    const file = await directory.getFileOrThrow('Box')

    expect(file.getRelativePath()).toBe('Box/Box.tsx')
  })

  test('finds file with specific extension starting at directory', async () => {
    const fileSystem = new MemoryFileSystem({
      'PackageInstall/index.ts': '',
      'PackageInstall/PackageInstall.mdx': '',
      'PackageInstall/PackageInstall.tsx': '',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFileOrThrow('PackageInstall', 'mdx')

    expect(file).toBeInstanceOf(File)
    expect(file.getExtension()).toBe('mdx')
  })

  test('removes order prefix from file name and path', async () => {
    const fileSystem = new MemoryFileSystem({
      '01.server.ts': '',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFileOrThrow('server', 'ts')

    expect(file).toBeInstanceOf(File)
    expect(file.getName()).toBe('server')
    expect(file.getPath()).toBe('/server')
    expect(file.getPathSegments()).toStrictEqual(['server'])
  })

  test('nested ordered files', async () => {
    const fileSystem = new MemoryFileSystem({
      '01.docs/01.getting-started.mdx': '',
      '01.getting-started.mdx': '',
    })
    const directory = new Directory({ fileSystem })
    const entries = await directory.getEntries({ recursive: true })

    expect(entries.map((entry) => entry.getPath())).toMatchObject([
      '/docs',
      '/docs/getting-started',
      '/getting-started',
    ])
  })

  test('path casing', async () => {
    const fileSystem = new MemoryFileSystem({
      'Button.tsx': '',
      'Card/Card.tsx': '',
    })
    const rootDirectory = new Directory({
      fileSystem,
      pathCasing: 'kebab',
    })
    const file = await rootDirectory.getFileOrThrow('button')

    expect(file.getPath()).toBe('/button')

    const directory = await rootDirectory.getDirectoryOrThrow('card')

    expect(directory.getPath()).toBe('/card')
  })

  test('deduplicate file path segments', async () => {
    const fileSystem = new MemoryFileSystem({
      'Button/Button.tsx': '',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFileOrThrow('Button/Button', 'tsx')

    expect(file.getPath()).toEqual('/button')
    expect(file.getPathSegments()).toStrictEqual(['button'])

    expect(file.getPath({ includeDuplicateSegments: true })).toEqual(
      '/button/button'
    )
    expect(
      file.getPathSegments({ includeDuplicateSegments: true })
    ).toStrictEqual(['button', 'button'])
  })

  test('all file exports', async () => {
    const projectDirectory = new Directory({ path: 'fixtures/project' })
    const file = await projectDirectory.getFileOrThrow('server', 'ts')
    const fileExports = await file.getExports()
    const fileExport = fileExports.at(0)!

    expect(fileExport.getName()).toMatch('createServer')
  })

  test('all virtual file exports', async () => {
    const fileSystem = new MemoryFileSystem({
      'use-hover.ts': 'export const useHover = () => {}',
    })
    const rootDirectory = new Directory({ fileSystem })
    const file = await rootDirectory.getFileOrThrow('use-hover', 'ts')
    const fileExports = (await file.getExports()).map((fileExport) => ({
      name: fileExport.getName(),
    }))

    expect(fileExports).toMatchObject([{ name: 'useHover' }])
  })

  test('deduplicates file exports', async () => {
    const directory = new Directory({ path: 'fixtures' })
    const file = await directory.getFileOrThrow('components/CodeBlock', 'tsx')
    const fileExports = await file.getExports()

    expect(fileExports.map((fileExport) => fileExport.getName())).toStrictEqual(
      ['CodeBlock']
    )
  })

  test('single virtual file export', async () => {
    const fileSystem = new MemoryFileSystem({
      'use-hover.ts': 'export const useHover = () => {}',
    })
    const rootDirectory = new Directory({
      fileSystem,
      loaders: {
        ts: withSchema<{ useHover: Function }>(() => {
          return Promise.resolve({ useHover: () => {} })
        }),
      },
    })
    const file = await rootDirectory.getFileOrThrow('use-hover', 'ts')
    const fileExport = await file.getExportOrThrow('useHover')
    const value = await fileExport.getRuntimeValue()

    expectTypeOf(value).toMatchTypeOf<Function>()
    expect(value).toBeInstanceOf(Function)
  })

  test('file export value types', async () => {
    const projectDirectory = new Directory({
      path: 'fixtures/project',
      loaders: {
        ts: withSchema<{ createServer: () => void }>(
          (path) => import(`#fixtures/project/${path}.ts`)
        ),
      },
    })
    const file = await projectDirectory.getFileOrThrow('server', 'ts')
    const fileExport = await file.getExportOrThrow('createServer')
    const value = await fileExport.getRuntimeValue()

    expectTypeOf(value).toMatchTypeOf<Function>()
  })

  test('file export schema', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.ts': 'export const metadata = 1',
    })
    const directory = new Directory({
      fileSystem,
      loaders: {
        ts: withSchema<{ metadata: { title: string } }>(
          {
            metadata: (value) => {
              value satisfies IsNotAny<typeof value>

              if (typeof value.title === 'string') {
                return value
              }

              throw new Error('Expected a title')
            },
          },
          async (path) => {
            const transpiledCode = await fileSystem.transpileFile(path)
            const module = { exports: {} }

            runInNewContext(
              `(function(module, exports) { ${transpiledCode} })(module, module.exports);`,
              { module }
            )

            return module.exports as { metadata: { title: string } }
          }
        ),
      },
    })
    const file = await directory.getFileOrThrow('index', 'ts')
    const fileExport = await file.getExportOrThrow('metadata')

    await expect(
      fileExport.getRuntimeValue()
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: [renoun] No source file found while transpiling "index"]`
    )
  })

  test('schema transforms export value', async () => {
    const fileSystem = new MemoryFileSystem({
      'hello-world.ts': `export const metadata = { title: 'Hello, World!', date: '2022-01-01' }`,
    })
    const directory = new Directory({
      fileSystem,
      loaders: {
        ts: {
          schema: {
            metadata: z.object({
              title: z.string(),
              date: z.coerce.date(),
            }),
          },
          runtime: async (path) => {
            const filePath = `${path}.ts`
            const transpiledCode = await fileSystem.transpileFile(filePath)
            const module = { exports: {} }

            runInNewContext(
              `(function(module, exports) { ${transpiledCode} })(module, module.exports);`,
              { module }
            )

            return module.exports
          },
        },
      },
    })
    const file = await directory.getFileOrThrow('hello-world', 'ts')
    const fileExport = await file.getExportOrThrow('metadata')
    const metadata = await fileExport.getRuntimeValue()

    expect(metadata).toMatchObject({
      title: 'Hello, World!',
      date: new Date('2022-01-01'),
    })
  })

  test('file export metadata', async () => {
    const statementText = 'export default function hello() {}'
    const fileSystem = new MemoryFileSystem({
      'index.ts': `/**\n * Say hello.\n * @category greetings\n */\n${statementText}`,
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFileOrThrow('index', 'ts')
    const fileExport = await file.getExportOrThrow('default')

    expect(fileExport).toBeInstanceOf(JavaScriptFileExport)
    expect(fileExport.getName()).toBe('hello')
    expect(fileExport.getDescription()).toBe('Say hello.')
    expect(fileExport.getTags()).toMatchObject([
      { tagName: 'category', text: 'greetings' },
    ])
    expect(fileExport.getText()).toBe(statementText)
    expect(fileExport.getPosition()).toMatchInlineSnapshot(`
      {
        "end": {
          "column": 35,
          "line": 5,
        },
        "start": {
          "column": 1,
          "line": 5,
        },
      }
    `)
  })

  test('barrel file export metadata', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.ts': `export { Button } from './Button.tsx'`,
      'Button.tsx': `/**\n * A button component.\n * @category components\n */\nexport function Button() {}`,
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFileOrThrow('index', 'ts')
    const fileExport = await file.getExportOrThrow('Button')

    expect(fileExport).toBeInstanceOf(JavaScriptFileExport)
    expect(fileExport.getName()).toBe('Button')
  })

  test('file export type reference', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.ts': 'export type Metadata = { title: string }',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFileOrThrow('index', 'ts')
    const fileExport = await file.getExportOrThrow('Metadata')
    const type = await fileExport.getType()

    expect(type).toBeDefined()
    expect(type!.kind).toBe('Object')
    expect(type!.name).toBe('Metadata')
  })

  test('getRuntimeValue resolves export runtime value from extension module', async () => {
    const directory = new Directory({
      path: 'fixtures/utils',
      loaders: {
        ts: (path) => import(`#fixtures/utils/${path}.ts`),
      },
    })
    const file = await directory.getFileOrThrow('path', 'ts')

    expectTypeOf(file).toMatchTypeOf<JavaScriptFile<any>>()
    expect(file).toBeInstanceOf(JavaScriptFile)

    const fileExport = await file.getExportOrThrow('basename')

    expectTypeOf(fileExport).toHaveProperty('getRuntimeValue')
    expect(fileExport).toBeInstanceOf(JavaScriptFileExport)

    const basename = await fileExport.getRuntimeValue()

    expect(basename).toBeDefined()
    expect(basename('/path/to/file.ts', '.ts')).toBe('file')
  })

  test('getRuntimeValue resolves export runtime value from withModule with extension', async () => {
    const directory = new Directory({
      path: 'fixtures/utils',
      loaders: {
        ts: (path) => import(`#fixtures/utils/${path}.ts`),
      },
    })
    const file = await directory.getFileOrThrow('path', 'ts')

    expectTypeOf(file).toMatchTypeOf<JavaScriptFile<any>>()
    expect(file).toBeInstanceOf(JavaScriptFile)

    const fileExport = await file.getExportOrThrow('basename')

    expectTypeOf(fileExport).toHaveProperty('getRuntimeValue')
    expect(fileExport).toBeInstanceOf(JavaScriptFileExport)

    const basename = await fileExport.getRuntimeValue()

    expect(basename).toBeDefined()
    expect(basename('/path/to/file.ts', '.ts')).toBe('file')
  })

  test('getExportValue', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.ts': 'export const metadata = { title: "Hello, World!" }',
    })
    const directory = new Directory({
      fileSystem,
      loaders: {
        ts: async () => {
          return { metadata: { title: 'Hello, World!' } }
        },
      },
    })
    const file = await directory.getFileOrThrow('index', 'ts')
    const fileExport = await file.getExportValue('metadata')

    expect(fileExport).toMatchObject({ title: 'Hello, World!' })
  })

  test('uses first file found when no file extension present', async () => {
    const projectDirectory = new Directory({ path: 'fixtures/project' })
    const file = await projectDirectory.getFile('server')

    expect(file).toBeDefined()
  })

  test('attempts to load index file when targeting directory path', async () => {
    const fileSystem = new MemoryFileSystem({
      'fixtures/project/index.ts': 'export const project = 1',
    })
    const rootDirectory = new Directory({ fileSystem })
    const file = await rootDirectory.getFile('fixtures/project')

    expect(file).toBeInstanceOf(File)
  })

  test('attempts to load readme file when targeting directory path', async () => {
    const fileSystem = new MemoryFileSystem({
      'fixtures/project/README.mdx': '# Project',
    })
    const projectDirectory = new Directory({ path: 'fixtures', fileSystem })
    const file = await projectDirectory.getFile('project')

    expect(file).toBeInstanceOf(File)
  })

  test('generates sibling navigation from file', async () => {
    const projectDirectory = new Directory({ path: 'fixtures/project' })
    const file = await projectDirectory.getFileOrThrow('server', 'ts')
    const [previousEntry, nextEntry] = await file.getSiblings()

    expect(previousEntry?.getName()).toBe('rpc')
    expect(nextEntry?.getName()).toBe('types')
  })

  test('generates sibling navigation from directory', async () => {
    const projectDirectory = new Directory({ path: 'fixtures/project' })
    const directory = await projectDirectory.getDirectoryOrThrow('rpc')
    const [previousEntry, nextEntry] = await directory.getSiblings()

    expect(previousEntry).toBeUndefined()
    expect(nextEntry?.getName()).toBe('server')
  })

  test('generates sibling navigation from index as directory', async () => {
    const fileSystem = new MemoryFileSystem({
      'components/index.ts': '',
      'utils/index.ts': '',
    })
    const rootDirectory = new Directory({ fileSystem })
    const indexFile = await rootDirectory.getFileOrThrow('components/index')
    const [previousEntry, nextEntry] = await indexFile.getSiblings()

    expect(previousEntry).toBeUndefined()
    expect(nextEntry?.getName()).toBe('utils')
    expect(nextEntry).toBeInstanceOf(Directory)
  })

  test('generates tree navigation', async () => {
    const projectDirectory = new Directory({
      path: 'fixtures/project',
      basePath: 'project',
    })

    type TreeEntry = {
      name: string
      path: string
      depth: number
      children?: TreeEntry[]
    }

    async function buildTreeNavigation<Entry extends FileSystemEntry<any>>(
      entry: Entry
    ): Promise<TreeEntry> {
      const name = entry.getName()
      const path = entry.getPath()
      const depth = entry.getDepth()

      if (isFile(entry)) {
        return { name, path, depth }
      }

      const entries = await entry.getEntries()

      return {
        name,
        path,
        depth,
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
              "depth": 1,
              "name": "client",
              "path": "/project/rpc/client",
            },
            {
              "depth": 1,
              "name": "server",
              "path": "/project/rpc/server",
            },
          ],
          "depth": 0,
          "name": "rpc",
          "path": "/project/rpc",
        },
        {
          "depth": 0,
          "name": "server",
          "path": "/project/server",
        },
        {
          "depth": 0,
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

  test('adds base path to entry getPath and getPathSegments', async () => {
    const projectDirectory = new Directory({
      path: 'fixtures/project',
      basePath: 'renoun',
    })

    expect(projectDirectory.getBasePath()).toBe('renoun')

    const file = await projectDirectory.getFileOrThrow('server', 'ts')

    expect(file.getPath()).toBe('/renoun/server')
    expect(file.getPathSegments()).toEqual(['renoun', 'server'])

    const directory = await projectDirectory.getDirectoryOrThrow('rpc')

    expect(directory.getPath({ includeBasePath: false })).toBe('/rpc')
    expect(directory.getPathSegments({ includeBasePath: false })).toEqual([
      'rpc',
    ])
  })

  test('uses file name for anonymous default export metadata', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.ts': `export default function () {}`,
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFileOrThrow('index', 'ts')
    const fileExport = await file.getExportOrThrow('default')

    expect(await fileExport.getName()).toBe(file.getName())
  })

  test('isDirectory', async () => {
    const fileSystem = new MemoryFileSystem({
      'Button/index.ts': '',
      'Button/Button.tsx': '',
      'Button/README.mdx': '',
    })
    const directory = new Directory({
      fileSystem,
      loaders: {
        tsx: withSchema<{ default: ComponentType }>(),
        mdx: withSchema<{ default: MDXContent }>(),
      },
    })
    const entry = await directory.getEntryOrThrow('Button')

    expect(isDirectory(entry)).toBe(false)
    expect(isFile(entry)).toBe(true)

    if (isDirectory(entry)) {
      expectTypeOf(entry).toMatchTypeOf<Directory<any>>()
    }

    const normalizedDirectory = isFile(entry) ? entry.getParent() : entry

    expect(isDirectory(normalizedDirectory)).toBe(true)

    const file = await normalizedDirectory.getFileOrThrow('README', 'mdx')

    expect(isDirectory(file)).toBe(false)
    expectTypeOf(file).toMatchTypeOf<JavaScriptFile<{ default: MDXContent }>>()
  })

  test('isFile', async () => {
    type Metadata = { title: string }
    const fileSystem = new MemoryFileSystem({ 'Button.tsx': '' })
    const directory = new Directory({
      fileSystem,
      loaders: {
        tsx: withSchema<Metadata>(),
      },
    })
    const file = await directory.getFileOrThrow('Button')
    const hasTsxExtension = isFile(file, 'tsx')

    expect(hasTsxExtension).toBe(true)

    if (hasTsxExtension) {
      expectTypeOf(file).toMatchTypeOf<JavaScriptFile<Metadata>>()
    }
  })

  test('isFile array', async () => {
    type Metadata = { title: string }
    const fileSystem = new MemoryFileSystem({ 'Button.tsx': '' })
    const directory = new Directory({
      fileSystem,
      loaders: {
        ts: withSchema<Metadata>(),
        tsx: withSchema<Metadata>(),
      },
    })
    const file = await directory.getFileOrThrow('Button')
    const hasTsLikeExtension = isFile(file, ['ts', 'tsx'])

    expect(hasTsLikeExtension).toBe(true)

    if (hasTsLikeExtension) {
      expectTypeOf(file).toMatchTypeOf<JavaScriptFile<Metadata>>()
    }

    const hasCssExtension = isFile(file, ['css'])

    expect(hasCssExtension).toBe(false)

    if (hasCssExtension) {
      expectTypeOf(file).toMatchTypeOf<File>()
    }
  })

  test('entry group', async () => {
    const memoryFileSystem = new MemoryFileSystem({
      'posts/building-a-button-component.mdx': '# Building a Button Component',
      'posts/meta.js': 'export default { "title": "Posts" }',
    })
    type FrontMatter = { frontmatter: { title: string } }
    const posts = new Directory({
      path: 'posts',
      fileSystem: memoryFileSystem,
      loaders: {
        mdx: withSchema<FrontMatter>(),
      },
    })
    const docs = new Directory({
      path: 'fixtures/docs',
      loaders: {
        mdx: withSchema<FrontMatter>(),
      },
    })
    const group = new EntryGroup({
      entries: [posts, docs],
    })
    const entries = await group.getEntries()

    expect(entries).toHaveLength(2)
    expect(entries[1].getName()).toBe('docs')

    const entry = await group.getEntry('posts/building-a-button-component')

    expect(entry).toBeInstanceOf(File)
    expect(entry?.getName()).toBe('building-a-button-component')

    const directory = await group.getDirectory('docs')

    expect(directory).toBeInstanceOf(Directory)

    const jsFile = await group.getFileOrThrow('posts/meta', 'js')

    expect(jsFile).toBeInstanceOf(JavaScriptFile)
    expectTypeOf(jsFile).toMatchTypeOf<JavaScriptFile<any>>()

    const mdxFile = await group.getFileOrThrow(
      'posts/building-a-button-component',
      'mdx'
    )

    expect(mdxFile).toBeInstanceOf(JavaScriptFile)
    expectTypeOf(mdxFile).toMatchTypeOf<JavaScriptFile<FrontMatter>>()

    const file = await group.getFileOrThrow(['posts', 'meta'], 'js')
    const [previousEntry, nextEntry] = await file.getSiblings({
      entryGroup: group,
    })

    expect(previousEntry?.getName()).toBe('building-a-button-component')
    expect(nextEntry?.getName()).toBe('docs')
  })

  test('getSiblings in entry group', async () => {
    const fileSystem = new MemoryFileSystem({
      'docs/intro.mdx': '',
      'docs/next-steps.mdx': '',
      'guides/intro.mdx': '',
      'guides/next-steps.mdx': '',
    })
    const docs = new Directory({ path: 'docs', fileSystem })
    const guides = new Directory({ path: 'guides', fileSystem })
    const group = new EntryGroup({ entries: [docs, guides] })

    const directory = await group.getDirectoryOrThrow('guides')
    const [previousDirectoryEntry, nextDirectoryEntry] =
      await directory.getSiblings({ entryGroup: group })

    expect(previousDirectoryEntry).toBeDefined()
    expect(previousDirectoryEntry!.getPath()).toBe('/docs/next-steps')

    expect(nextDirectoryEntry).toBeDefined()
    expect(nextDirectoryEntry!.getPath()).toBe('/guides/intro')

    const file = await group.getFileOrThrow('guides/intro')
    const [previousFileEntry, nextFileEntry] = await file.getSiblings({
      entryGroup: group,
    })

    expect(previousFileEntry).toBeDefined()
    expect(previousFileEntry!.getPath()).toBe('/guides')

    expect(nextFileEntry).toBeDefined()
    expect(nextFileEntry!.getPath()).toBe('/guides/next-steps')
  })

  test('multiple extensions in entry group', async () => {
    const fileSystem = new MemoryFileSystem({
      'components/Button.mdx': '',
      'components/Button.tsx': '',
    })
    const directory = new Directory({
      fileSystem,
    })
    const entryGroup = new EntryGroup({
      entries: [directory],
    })
    const directoryEntry = await directory.getFileOrThrow(
      ['components', 'Button'],
      'tsx'
    )

    expect(directoryEntry).toBeDefined()
    expect(directoryEntry?.getExtension()).toBe('tsx')

    const groupEntry = await entryGroup.getFile(
      ['components', 'Button'],
      ['ts', 'tsx']
    )

    expect(groupEntry).toBeDefined()
    expect(groupEntry?.getExtension()).toBe('tsx')
  })

  test('same base file name in entry group with root directories', async () => {
    const directoryOne = new Directory({
      fileSystem: new MemoryFileSystem({ 'components/Button.tsx': '' }),
    })
    const directoryTwo = new Directory({
      fileSystem: new MemoryFileSystem({ 'docs/Button.mdx': '' }),
    })
    const entryGroup = new EntryGroup({
      entries: [directoryOne, directoryTwo],
    })
    const componentEntry = await entryGroup.getEntryOrThrow(['docs', 'Button'])

    expect(componentEntry).toBeDefined()
    expect(componentEntry.getPath()).toBe('/docs/button')

    const componentFile = await entryGroup.getFileOrThrow(
      ['docs', 'Button'],
      'mdx'
    )

    expect(componentFile).toBeDefined()
    expect(componentFile.getPath()).toBe('/docs/button')
  })

  test('has entry', async () => {
    type MDXTypes = { frontmatter: { title: string } }
    type TSXTypes = { metadata: { title: string } }

    const directoryA = new Directory({
      fileSystem: new MemoryFileSystem({ 'Button.mdx': '' }),
      loaders: {
        mdx: withSchema<MDXTypes>(),
      },
    })
    const directoryB = new Directory({
      path: 'fixtures/components',
      loaders: {
        tsx: withSchema<TSXTypes>(),
      },
    })
    const group = new EntryGroup({
      entries: [directoryA, directoryB],
    })
    const file = await group.getFileOrThrow('Button', 'mdx')

    expectTypeOf(file).toMatchTypeOf<JavaScriptFile<MDXTypes>>()

    const entry = await group.getEntryOrThrow('Button')

    expect(directoryA.hasEntry(entry)).toBe(true)

    expect(directoryA.hasFile(entry, 'mdx')).toBe(true)

    entry satisfies IsNotAny<typeof entry>

    if (directoryA.hasFile(entry, 'mdx')) {
      expectTypeOf(entry).toMatchTypeOf<JavaScriptFile<MDXTypes>>()
    }
  })
})
