import type { ComponentType } from 'react'
import { describe, test, expect, expectTypeOf } from 'vitest'
import { runInNewContext } from 'node:vm'
import * as v from 'valibot'
import { z } from 'zod'

import type { basename } from '#fixtures/utils/path.ts'
import type { MDXContent, MDXHeadings } from '../mdx'
import { NodeFileSystem } from './NodeFileSystem'
import { MemoryFileSystem } from './MemoryFileSystem'
import {
  type FileSystemEntry,
  type InferModuleExports,
  File,
  Directory,
  JavaScriptFile,
  JavaScriptFileExport,
  EntryGroup,
  isDirectory,
  isFile,
  isJavaScriptFile,
  withSchema,
  FileNotFoundError,
  FileExportNotFoundError,
} from './index'
import type { Expect, Is, IsNotAny } from './types'
import { title } from 'node:process'

describe('file system', () => {
  describe('File', () => {
    test('parses full filename', () => {
      const file = new File({ path: '02.generics.exercise.ts' })

      expect(file.getOrder()).toBe('02')
      expect(file.getBaseName()).toBe('generics')
      expect(file.getModifier()).toBe('exercise')
      expect(file.getExtension()).toBe('ts')
    })

    test('without order', () => {
      const file = new File({ path: 'test.file.txt' })

      expect(file.getOrder()).toBeUndefined()
      expect(file.getBaseName()).toBe('test')
      expect(file.getModifier()).toBe('file')
      expect(file.getExtension()).toBe('txt')
    })

    test('without modifier', () => {
      const file = new File({ path: '1-foo.txt' })

      expect(file.getOrder()).toBe('1')
      expect(file.getBaseName()).toBe('foo')
      expect(file.getModifier()).toBeUndefined()
      expect(file.getExtension()).toBe('txt')
    })

    test('handles filenames with only base', () => {
      const file = new File({ path: 'foo' })

      expect(file.getOrder()).toBeUndefined()
      expect(file.getName()).toBe('foo')
      expect(file.getBaseName()).toBe('foo')
      expect(file.getModifier()).toBeUndefined()
      expect(file.getExtension()).toBeUndefined()
    })

    test('returns original name', () => {
      const file = new File({ path: '01.beep.boop.bop' })
      expect(file.getName()).toBe('01.beep.boop.bop')
    })
  })

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

  test('directory with no configuration', async () => {
    const directory = new Directory()
    const file = await directory.getFile('fixtures/docs/index', 'mdx')
    const Content = await file.getExportValue('default')

    type Tests = [Expect<Is<typeof Content, MDXContent>>]

    expectTypeOf(Content).toMatchTypeOf<MDXContent>()
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
    expect(file?.getName()).toBe('server.ts')
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

  test('filters with schema', async () => {
    const directory = new Directory({
      path: 'fixtures/posts',
      loaders: {
        mdx: withSchema(
          {
            frontmatter: z.object({
              title: z.string(),
              date: z.coerce.date(),
            }),
          },
          (path) => import(`./posts/${path}.mdx`)
        ),
      },
      include: async (entry) => {
        if (isFile(entry, 'mdx')) {
          const value = await entry
            .getExportValue('frontmatter')
            .catch((error) => {
              if (error instanceof FileExportNotFoundError) {
                return undefined
              }
              throw error
            })

          type Test = Expect<IsNotAny<typeof value>>

          value satisfies
            | {
                title: string
                date: Date
              }
            | undefined

          return true
        }

        return false
      },
    })
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
        ts: withSchema<{
          basename: typeof basename
        }>((path) => import(`#fixtures/utils/${path}.ts`)),
      },
    })
    const file = await directory.getFile('path', 'ts')
    const basenameFn = await file.getExportValue('basename')

    type Test = Expect<IsNotAny<typeof basenameFn>>

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
        await directory.getFile('introduction', 'ts')
      ).getExportValue('metadata')

      type Test = Expect<IsNotAny<typeof value>>

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
        await directory.getFile('introduction', 'ts')
      ).getExportValue('metadata')

      type Test = Expect<IsNotAny<typeof value>>

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
        await directory.getFile('introduction', 'ts')
      ).getExportValue('metadata')

      type Test = Expect<IsNotAny<typeof value>>

      expectTypeOf(value).toMatchTypeOf<{ title: string } | undefined>()
    })

    test('valibot', async () => {
      const directory = new Directory({
        path: 'fixtures/docs',
        loaders: {
          ts: withSchema(
            {
              metadata: v.object({
                title: v.string(),
                date: v.date(),
              }),
            },
            (path) => import(`#fixtures/docs/${path}.ts`)
          ),
        },
      })
      const value = await (
        await directory.getFile('introduction', 'ts')
      ).getExportValue('metadata')

      type Test = Expect<IsNotAny<typeof value>>

      expectTypeOf(value).toMatchTypeOf<
        { title: string; date: Date } | undefined
      >()
    })

    test('zod', async () => {
      const directory = new Directory({
        path: 'fixtures/docs',
        loaders: {
          ts: withSchema(
            {
              metadata: z.object({
                title: z.string(),
                date: z.date().optional(),
              }),
            },
            (path) => import(`#fixtures/docs/${path}.ts`)
          ),
        },
      })
      const value = await (
        await directory.getFile('introduction', 'ts')
      ).getExportValue('metadata')

      type Test = Expect<IsNotAny<typeof value>>

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

    expectTypeOf(files).toMatchTypeOf<
      JavaScriptFile<{ default: MDXContent } & PostType>[]
    >()
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

    expectTypeOf(files).toMatchTypeOf<
      JavaScriptFile<{ default: MDXContent } & PostType>[]
    >()
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

    expectTypeOf(entries).toMatchTypeOf<
      JavaScriptFile<{ default: MDXContent }>[]
    >()

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
        "bar.ts",
        "foo.ts",
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
        const aSort = await a.getExportValue('sort')
        const bSort = await b.getExportValue('sort')
        return aSort - bSort
      },
    })
    const entries = await directory.getEntries()

    expect(entries.map((entry) => entry.getName())).toMatchInlineSnapshot(`
      [
        "bar.ts",
        "foo.ts",
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

    expect(fileEntry.getBaseName()).toBe('Button')
    expect(fileEntry.getExtension()).toBe('tsx')

    const directoryEntry = entries.at(1) as Directory<any>

    expect(directoryEntry.getBaseName()).toBe('CodeBlock')
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
      await (await fixturesDirectory.getDirectory('project')).getEntry('server')
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

    const tsConfigFile = new File({
      path: 'tsconfig.json',
    })

    expect(tsConfigFile.getName()).toBe('tsconfig.json')
  })

  test('file path with extension', async () => {
    const rootDirectory = new Directory()
    const file = await rootDirectory.getFile('tsconfig.json')

    expect(file).toBeInstanceOf(File)
    expect(file.getName()).toBe('tsconfig.json')
  })

  test('relative file', async () => {
    const rootDirectory = new Directory()
    const file = await rootDirectory.getFile('./tsconfig.json')

    expect(file).toBeInstanceOf(File)
    expect(file.getName()).toBe('tsconfig.json')
  })

  test('nested file', async () => {
    const rootDirectory = new Directory()
    const nestedFile = await rootDirectory.getFile(
      'fixtures/project/rpc/server',
      'ts'
    )

    expect(nestedFile).toBeInstanceOf(File)

    const directory = new Directory({
      path: 'components',
      fileSystem: new MemoryFileSystem({
        'components/CodeBlock/CodeBlock.tsx': '',
        'components/CodeBlock/CodeBlock.mdx': '',
        'components/CodeBlock/CopyButton.tsx': '',
      }),
    })

    await expect(
      directory.getFile(['CodeBlock', 'CopyButton'], 'mdx')
    ).rejects.toThrowError(FileNotFoundError)
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

    const jsFile = new JavaScriptFile({ path: 'fixtures/project/server.ts' })
    const jsFileExports = await jsFile.getExports()

    expect(jsFileExports).toHaveLength(1)
  })

  test('javascript file with runtime', async () => {
    const projectDirectory = new Directory({
      path: 'fixtures/project',
      loaders: {
        ts: (path) => import(`#fixtures/project/${path}.ts`),
      },
    })
    const file = await projectDirectory.getFile('server', 'ts')

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
    const entry = await projectDirectory.getEntry('server')

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
    const entry = await directory.getEntry(['APIReference', 'examples'])

    expect(entry.getAbsolutePath()).toBe('/APIReference.examples.tsx')
  })

  test('prioritizes base file name over file name with modifier', async () => {
    const fileSystem = new MemoryFileSystem({
      'APIReference.examples.tsx': '',
      'APIReference.tsx': '',
    })
    const directory = new Directory({ fileSystem })
    const entry = await directory.getEntry('APIReference')

    expect(entry.getAbsolutePath()).toBe('/APIReference.tsx')
  })

  test('chooses entry with same name as directory when bare file path', async () => {
    const directory = new Directory({
      path: 'fixtures/components',
      basePath: 'components',
    })
    const file = await directory.getFile('Box')

    expect(file.getRelativePath()).toBe('Box/Box.tsx')
  })

  test('finds file with specific extension starting at directory', async () => {
    const fileSystem = new MemoryFileSystem({
      'PackageInstall/index.ts': '',
      'PackageInstall/PackageInstall.mdx': '',
      'PackageInstall/PackageInstall.tsx': '',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('PackageInstall', 'mdx')

    expect(file).toBeInstanceOf(File)
    expect(file.getExtension()).toBe('mdx')
  })

  test('removes order prefix from file name and path', async () => {
    const fileSystem = new MemoryFileSystem({
      '01.server.ts': '',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('server', 'ts')

    expect(file).toBeInstanceOf(File)
    expect(file.getName()).toBe('01.server.ts')
    expect(file.getBaseName()).toBe('server')
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
    const file = await rootDirectory.getFile('button')

    expect(file.getPath()).toBe('/button')

    const directory = await rootDirectory.getDirectory('card')

    expect(directory.getPath()).toBe('/card')
  })

  test('deduplicate file path segments', async () => {
    const fileSystem = new MemoryFileSystem({
      'Button/Button.tsx': '',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('Button/Button', 'tsx')

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
    const file = await projectDirectory.getFile('server', 'ts')
    const fileExports = await file.getExports()
    const fileExport = fileExports.at(0)!

    expect(fileExport.getName()).toMatch('createServer')
  })

  test('all virtual file exports', async () => {
    const fileSystem = new MemoryFileSystem({
      'use-hover.ts': 'export const useHover = () => {}',
    })
    const rootDirectory = new Directory({ fileSystem })
    const file = await rootDirectory.getFile('use-hover', 'ts')
    const fileExports = (await file.getExports()).map((fileExport) => ({
      name: fileExport.getName(),
    }))

    expect(fileExports).toMatchObject([{ name: 'useHover' }])
  })

  test('deduplicates file exports', async () => {
    const directory = new Directory({ path: 'fixtures' })
    const file = await directory.getFile('components/CodeBlock', 'tsx')
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
    const file = await rootDirectory.getFile('use-hover', 'ts')
    const fileExport = await file.getExport('useHover')
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
    const file = await projectDirectory.getFile('server', 'ts')
    const fileExport = await file.getExport('createServer')
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
              type Test = Expect<IsNotAny<typeof value>>

              value satisfies { title: string }

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
    const file = await directory.getFile('index', 'ts')
    const fileExport = await file.getExport('metadata')

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
    const file = await directory.getFile('hello-world', 'ts')
    const fileExport = await file.getExport('metadata')
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
    const file = await directory.getFile('index', 'ts')
    const fileExport = await file.getExport('default')

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
    const file = await directory.getFile('index', 'ts')
    const fileExport = await file.getExport('Button')

    expect(fileExport).toBeInstanceOf(JavaScriptFileExport)
    expect(fileExport.getName()).toBe('Button')
  })

  test('file export type reference', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.ts': 'export type Metadata = { title: string }',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('index', 'ts')
    const fileExport = await file.getExport('Metadata')
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
    const file = await directory.getFile('path', 'ts')

    expectTypeOf(file).toMatchTypeOf<JavaScriptFile<any>>()
    expect(file).toBeInstanceOf(JavaScriptFile)

    const fileExport = await file.getExport('basename')

    expectTypeOf(fileExport).toHaveProperty('getRuntimeValue')
    expect(fileExport).toBeInstanceOf(JavaScriptFileExport)

    const basename = await fileExport.getRuntimeValue()

    expect(basename).toBeDefined()
    expect(basename('/path/to/file.ts', '.ts')).toBe('file')
  })

  test('getRuntimeValue resolves export runtime value from loader', async () => {
    const directory = new Directory({
      path: 'fixtures/utils',
      loaders: {
        ts: (path) => import(`#fixtures/utils/${path}.ts`),
      },
    })
    const file = await directory.getFile('path', 'ts')

    expectTypeOf(file).toMatchTypeOf<JavaScriptFile<any>>()
    expect(file).toBeInstanceOf(JavaScriptFile)

    const fileExport = await file.getExport('basename')

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
    const file = await directory.getFile('index', 'ts')
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
    const file = await projectDirectory.getFile('server', 'ts')
    const [previousEntry, nextEntry] = await file.getSiblings()

    expect(previousEntry?.getBaseName()).toBe('rpc')
    expect(nextEntry?.getBaseName()).toBe('types')
  })

  test('generates sibling navigation from directory', async () => {
    const projectDirectory = new Directory({ path: 'fixtures/project' })
    const directory = await projectDirectory.getDirectory('rpc')
    const [previousEntry, nextEntry] = await directory.getSiblings()

    expect(previousEntry).toBeUndefined()
    expect(nextEntry?.getBaseName()).toBe('server')
  })

  test('generates sibling navigation from index as directory', async () => {
    const fileSystem = new MemoryFileSystem({
      'components/index.ts': '',
      'utils/index.ts': '',
    })
    const rootDirectory = new Directory({ fileSystem })
    const indexFile = await rootDirectory.getFile('components/index')
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
              "name": "client.ts",
              "path": "/project/rpc/client",
            },
            {
              "depth": 1,
              "name": "server.ts",
              "path": "/project/rpc/server",
            },
          ],
          "depth": 0,
          "name": "rpc",
          "path": "/project/rpc",
        },
        {
          "depth": 0,
          "name": "server.ts",
          "path": "/project/server",
        },
        {
          "depth": 0,
          "name": "types.ts",
          "path": "/project/types",
        },
      ]
    `)
  })

  test('uses directory name when index or readme file', async () => {
    const projectDirectory = new Directory({ path: 'fixtures/components' })
    const indexFile = await projectDirectory.getFile('index')
    const readmeFile = await projectDirectory.getFile('README')

    expect(indexFile.getParent().getBaseName()).toBe('components')
    expect(readmeFile.getParent().getBaseName()).toBe('components')
  })

  test('adds base path to entry getPath and getPathSegments', async () => {
    const projectDirectory = new Directory({
      path: 'fixtures/project',
      basePath: 'renoun',
    })

    expect(projectDirectory.getBasePath()).toBe('renoun')

    const file = await projectDirectory.getFile('server', 'ts')

    expect(file.getPath()).toBe('/renoun/server')
    expect(file.getPathSegments()).toEqual(['renoun', 'server'])

    const directory = await projectDirectory.getDirectory('rpc')

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
    const file = await directory.getFile('index', 'ts')
    const fileExport = await file.getExport('default')

    expect(fileExport.getName()).toBe(file.getBaseName())
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
        tsx: withSchema<{
          default: ComponentType
        }>,
        mdx: withSchema<{
          frontmatter: { title: string }
        }>(() => {
          return Promise.resolve<any>({
            default: () => {},
          })
        }),
      },
    })
    const entry = await directory.getEntry('Button')

    expect(isDirectory(entry)).toBe(false)
    expect(isFile(entry)).toBe(true)

    if (isDirectory(entry)) {
      expectTypeOf(entry).toMatchTypeOf<Directory<any>>()
    }

    const normalizedDirectory = isFile(entry) ? entry.getParent() : entry

    expect(isDirectory(normalizedDirectory)).toBe(true)

    const file = await normalizedDirectory.getFile('README', 'mdx')

    expect(isDirectory(file)).toBe(false)

    expectTypeOf(file).toMatchTypeOf<
      JavaScriptFile<{
        default: MDXContent
        frontmatter: {
          title: string
        }
      }>
    >()
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
    const file = await directory.getFile('Button')
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
    const file = await directory.getFile('Button')
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
    expect(entry?.getBaseName()).toBe('building-a-button-component')

    const directory = await group.getDirectory('docs')

    expect(directory).toBeInstanceOf(Directory)

    const jsFile = await group.getFile('posts/meta', 'js')

    expect(jsFile).toBeInstanceOf(JavaScriptFile)
    expectTypeOf(jsFile).toMatchTypeOf<JavaScriptFile<any>>()

    const mdxFile = await group.getFile(
      'posts/building-a-button-component',
      'mdx'
    )

    expect(mdxFile).toBeInstanceOf(JavaScriptFile)
    expectTypeOf(mdxFile).toMatchTypeOf<
      JavaScriptFile<{ default: MDXContent } & InferModuleExports<FrontMatter>>
    >()

    const file = await group.getFile(['posts', 'meta'], 'js')
    const [previousEntry, nextEntry] = await file.getSiblings({
      entryGroup: group,
    })

    expect(previousEntry?.getBaseName()).toBe('building-a-button-component')
    expect(nextEntry?.getBaseName()).toBe('docs')
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

    const directory = await group.getDirectory('guides')
    const [previousDirectoryEntry, nextDirectoryEntry] =
      await directory.getSiblings({ entryGroup: group })

    expect(previousDirectoryEntry).toBeDefined()
    expect(previousDirectoryEntry!.getPath()).toBe('/docs/next-steps')

    expect(nextDirectoryEntry).toBeDefined()
    expect(nextDirectoryEntry!.getPath()).toBe('/guides/intro')

    const file = await group.getFile('guides/intro')
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
    const directoryEntry = await directory.getFile(
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
    const componentEntry = await entryGroup.getEntry(['docs', 'Button'])

    expect(componentEntry).toBeDefined()
    expect(componentEntry.getPath()).toBe('/docs/button')

    const componentFile = await entryGroup.getFile(['docs', 'Button'], 'mdx')

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
    const file = await group.getFile('Button', 'mdx')

    expectTypeOf(file).toMatchTypeOf<
      JavaScriptFile<{ default: MDXContent } & MDXTypes>
    >()

    const entry = await group.getEntry('Button')

    expect(directoryA.hasEntry(entry)).toBe(true)

    expect(directoryA.hasFile(entry, 'mdx')).toBe(true)

    type Test = Expect<IsNotAny<typeof entry>>

    if (directoryA.hasFile(entry, 'mdx')) {
      expectTypeOf(entry).toMatchTypeOf<
        JavaScriptFile<{ default: MDXContent } & MDXTypes>
      >()
    }
  })

  test('entry group works with type abstractions', async () => {
    function Document(props: {
      file?: JavaScriptFile<{
        default: MDXContent
        headings: MDXHeadings
        metadata: {
          title: string
          description: string
        }
      }>
      entryGroup?: EntryGroup<any>
    }) {
      return null
    }

    const directory = new Directory({
      path: 'fixtures/docs',
      loaders: {
        mdx: withSchema(
          {
            headings: z.array(
              z.object({
                id: z.string(),
                text: z.string(),
                depth: z.number(),
              })
            ),
            metadata: z.object({
              title: z.string(),
              label: z.string().optional(),
              description: z.string(),
              tags: z.array(z.string()).optional(),
            }),
          },
          (path) => Promise.resolve<any>({})
        ),
      },
      include: (entry) => isFile(entry, 'mdx'),
    })
    const entryGroup = new EntryGroup({
      entries: [directory],
    })
    const file = await directory.getFile('index', 'mdx')

    Document({ file, entryGroup })
  })

  test('adds default MDXContent type to existing mdx loaders', async () => {
    const posts = new Directory({
      fileSystem: new MemoryFileSystem({
        'hello-world.mdx': `export const frontmatter = { title: 'Hello, World!' }\n\n# Hello, World!`,
      }),
      loaders: {
        mdx: withSchema<{ frontmatter: { title: string } }>(() => {
          return {
            default: async () => {
              return null
            },
            frontmatter: {
              title: 'Hello, World!',
            },
          } as any
        }),
      },
    })
    const file = await posts.getFile('hello-world', 'mdx')

    if (file) {
      const fileExport = await file.getExport('default')
      const fileExportValue = await fileExport.getRuntimeValue()

      expectTypeOf(fileExportValue).toMatchTypeOf<MDXContent>()

      const Content = await file.getExportValue('default')
      const frontmatter = await file.getExportValue('frontmatter')

      expectTypeOf(Content).toMatchTypeOf<MDXContent>()
      expectTypeOf(frontmatter).toMatchTypeOf<{ title: string }>()

      type Tests = [
        Expect<IsNotAny<typeof fileExportValue>>,
        Expect<IsNotAny<typeof Content>>,
      ]
    }
  })
})
