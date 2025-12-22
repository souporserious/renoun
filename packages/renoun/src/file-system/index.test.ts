import type { ComponentType } from 'react'
import { beforeAll, describe, test, expect, expectTypeOf, vi } from 'vitest'
import { runInNewContext } from 'node:vm'
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import * as gitExportMetadataModule from '../utils/get-local-git-export-metadata.ts'
import * as rootDirectoryModule from '../utils/get-root-directory.ts'
import * as v from 'valibot'
import { z } from 'zod'

import type { basename } from '#fixtures/utils/path.ts'
import type { MDXContent, Headings } from '../mdx'
import type { FileRegion } from '../utils/get-file-regions.ts'
import { removeExtension } from '../utils/path.ts'
import { NodeFileSystem } from './NodeFileSystem'
import { MemoryFileSystem } from './MemoryFileSystem'
import * as gitHostFileSystemModule from './GitHostFileSystem'
import {
  type FileSystemEntry,
  type InferModuleExports,
  File,
  Directory,
  JavaScriptFile,
  ModuleExport,
  MarkdownFile,
  MDXFile,
  Collection,
  Package,
  isDirectory,
  isFile,
  isJavaScriptFile,
  isJSONFile,
  resolveFileFromEntry,
  createSort,
  withSchema,
  FileNotFoundError,
  ModuleExportNotFoundError,
  JSONFile,
  Workspace,
  type FileStructure,
} from './index'
import type { Expect, Is, IsNotAny } from './types'
import type { Kind } from '../utils/resolve-type'

describe('file system', () => {
  describe('File', () => {
    test('parses full file name', () => {
      const file = new File({ path: '02.generics.exercise.ts' })

      expect(file.getOrder()).toBe('02')
      expect(file.getBaseName()).toBe('generics')
      expect(file.getModifierName()).toBe('exercise')
      expect(file.getExtension()).toBe('ts')
    })

    test('without order', () => {
      const file = new File({ path: 'test.file.txt' })

      expect(file.getOrder()).toBeUndefined()
      expect(file.getBaseName()).toBe('test')
      expect(file.getModifierName()).toBe('file')
      expect(file.getExtension()).toBe('txt')
    })

    test('without modifier', () => {
      const file = new File({ path: '1-foo.txt' })

      expect(file.getOrder()).toBe('1')
      expect(file.getBaseName()).toBe('foo')
      expect(file.getModifierName()).toBeUndefined()
      expect(file.getExtension()).toBe('txt')
    })

    test('handles file names with only base', () => {
      const file = new File({ path: 'foo' })

      expect(file.getOrder()).toBeUndefined()
      expect(file.getName()).toBe('foo')
      expect(file.getBaseName()).toBe('foo')
      expect(file.getModifierName()).toBeUndefined()
      expect(file.getExtension()).toBeUndefined()
    })

    test('returns original name', () => {
      const file = new File({ path: '01.beep.boop.bop' })
      expect(file.getName()).toBe('01.beep.boop.bop')
    })

    test('applies string directory prefix when provided with relative path', () => {
      const file = new File({
        directory: 'packages/renoun/src/components',
        path: 'Link/Link.tsx',
      })

      expect(file.getRelativePathToWorkspace()).toBe(
        'packages/renoun/src/components/Link/Link.tsx'
      )
    })

    test('applies URL directory prefix when provided with relative path', () => {
      const file = new File({
        directory: new URL('../components', import.meta.url),
        path: 'Link/Link.tsx',
      })

      expect(file.getRelativePathToWorkspace()).toBe(
        'packages/renoun/src/components/Link/Link.tsx'
      )
    })

    test('applies directory instance prefix when provided with relative path', () => {
      const directory = new Directory({
        path: 'packages/renoun/src/components',
      })

      const file = new File({
        directory,
        path: 'Link/Link.tsx',
      })

      expect(file.getRelativePathToWorkspace()).toBe(
        'packages/renoun/src/components/Link/Link.tsx'
      )
    })
  })

  test('node file system read directory', async () => {
    const fileSystem = new NodeFileSystem()
    const entries = await fileSystem.readDirectory('fixtures/utils')
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('path.ts')
  })

  test('node file system prevents access outside workspace', () => {
    const fileSystem = new NodeFileSystem()
    const outsidePath = join(getRootDirectory(), '..', 'outside.txt')
    expect(() => fileSystem.readFileSync(outsidePath)).toThrowError(
      /outside of the workspace root/
    )
  })

  test('node file system supports binary, stream, and write operations', async () => {
    const fileSystem = new NodeFileSystem()
    const rootDirectory = getRootDirectory()
    const baseTmpDirectory = join(rootDirectory, 'tmp')
    mkdirSync(baseTmpDirectory, { recursive: true })
    const tempDirectory = mkdtempSync(join(baseTmpDirectory, 'fs-'))

    const textFilePath = join(tempDirectory, 'hello.txt')
    const binaryFilePath = join(tempDirectory, 'binary.bin')
    const streamFilePath = join(tempDirectory, 'stream.txt')
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    try {
      await fileSystem.writeFile(textFilePath, 'Hello World')
      expect(await fileSystem.readFile(textFilePath)).toBe('Hello World')

      const binary = await fileSystem.readFileBinary(textFilePath)
      expect(decoder.decode(binary)).toBe('Hello World')

      const readStream = fileSystem.readFileStream(textFilePath)
      const reader = readStream.getReader()
      const firstChunk = await reader.read()
      expect(firstChunk.done).toBe(false)
      expect(decoder.decode(firstChunk.value!)).toBe('Hello World')
      expect((await reader.read()).done).toBe(true)
      reader.releaseLock()

      await fileSystem.writeFile(binaryFilePath, new Uint8Array([0, 1, 2]))
      expect(await fileSystem.fileExists(binaryFilePath)).toBe(true)
      await fileSystem.deleteFile(binaryFilePath)
      expect(await fileSystem.fileExists(binaryFilePath)).toBe(false)

      const writer = fileSystem.writeFileStream(streamFilePath).getWriter()
      await writer.write(encoder.encode('Stream data'))
      await writer.close()

      expect(await fileSystem.readFile(streamFilePath)).toBe('Stream data')
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true })
    }
  })

  test('node file system supports creating, renaming, and copying paths', async () => {
    const fileSystem = new NodeFileSystem()
    const rootDirectory = getRootDirectory()
    const baseTmpDirectory = join(rootDirectory, 'tmp')
    mkdirSync(baseTmpDirectory, { recursive: true })
    const tempDirectory = mkdtempSync(join(baseTmpDirectory, 'fs-'))

    try {
      const nestedDirectory = join(tempDirectory, 'a/b')
      await fileSystem.createDirectory(nestedDirectory)
      expect(statSync(nestedDirectory).isDirectory()).toBe(true)

      const sourceFile = join(tempDirectory, 'a/source.txt')
      const conflictPath = join(tempDirectory, 'conflict.txt')
      await fileSystem.writeFile(sourceFile, 'source')
      await fileSystem.writeFile(conflictPath, 'existing')

      await expect(fileSystem.rename(sourceFile, conflictPath)).rejects.toThrow(
        /target already exists/
      )

      await fileSystem.rename(sourceFile, conflictPath, { overwrite: true })
      expect(await fileSystem.readFile(conflictPath)).toBe('source')

      const copyTarget = join(tempDirectory, 'copy/target.txt')
      await fileSystem.copy(conflictPath, copyTarget)
      expect(await fileSystem.readFile(copyTarget)).toBe('source')

      await expect(fileSystem.copy(conflictPath, copyTarget)).rejects.toThrow(
        /target already exists/
      )

      await fileSystem.copy(conflictPath, copyTarget, { overwrite: true })
      expect(await fileSystem.readFile(copyTarget)).toBe('source')

      const directorySource = join(tempDirectory, 'dir')
      const nestedFile = join(directorySource, 'inner/file.txt')
      await fileSystem.createDirectory(join(directorySource, 'inner'))
      await fileSystem.writeFile(nestedFile, 'dir source')
      const directoryCopy = join(tempDirectory, 'dir-copy')
      await fileSystem.copy(directorySource, directoryCopy)
      expect(
        await fileSystem.readFile(join(directoryCopy, 'inner/file.txt'))
      ).toBe('dir source')
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true })
    }
  })

  test('virtual file system read directory', async () => {
    const fileSystem = new MemoryFileSystem({ 'fixtures/utils/path.ts': '' })
    const entries = await fileSystem.readDirectory('fixtures/utils')
    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('path.ts')
  })

  test('memory file system supports binary, stream, and write operations', async () => {
    const fileSystem = new MemoryFileSystem({})
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()

    await fileSystem.writeFile('hello.txt', 'Hello Memory')
    expect(await fileSystem.readFile('hello.txt')).toBe('Hello Memory')

    const binary = await fileSystem.readFileBinary('hello.txt')
    expect(decoder.decode(binary)).toBe('Hello Memory')

    const writer = fileSystem.writeFileStream('stream.txt').getWriter()
    await writer.write(encoder.encode('Chunk '))
    await writer.write(encoder.encode('data'))
    await writer.close()

    const stream = fileSystem.readFileStream('stream.txt')
    const reader = stream.getReader()
    let text = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }
      text += decoder.decode(value)
    }
    reader.releaseLock()
    expect(text).toBe('Chunk data')

    expect(await fileSystem.readFile('stream.txt')).toBe('Chunk data')

    await fileSystem.deleteFile('stream.txt')
    expect(await fileSystem.fileExists('stream.txt')).toBe(false)
  })

  test('directory with no configuration', async () => {
    const directory = new Directory()
    const file = await directory.getFile('fixtures/docs/index', 'mdx')
    const Content = await file.getExportValue('default')

    type Tests = [Expect<Is<typeof Content, MDXContent>>]

    expectTypeOf(Content).toExtend<MDXContent>()
  })

  test('uses default MDX compiler when no loader is provided', async () => {
    const directory = new Directory({ path: 'fixtures/docs' })
    const file = (await directory.getFile('index', 'mdx')) as MDXFile<
      any,
      any,
      any
    >

    // The default remark plugins add a generated "headings" export
    const headings: any = await file.getExportValue('headings')
    expect(Array.isArray(headings)).toBe(true)
    expect(headings[0]).toMatchObject({
      id: 'docs',
      level: 1,
      text: 'Docs',
      children: 'Docs',
      summary: 'This is a test of the documentation system.',
    })

    // Default export is a renderable MDX component
    const Content = await file.getExportValue('default')
    expect(typeof Content).toBe('function')
  })

  test('directory resolves workspace protocol paths', async () => {
    const rootDirectory = getRootDirectory()
    const originalCwd = process.cwd()
    const siteDirectory = join(rootDirectory, 'apps/site')

    process.chdir(siteDirectory)

    try {
      const apps = new Directory({ path: 'workspace:apps' })
      expect(apps.getRelativePathToWorkspace()).toBe('apps')

      const docs = await apps.getDirectory('docs')
      expect(docs.getRelativePathToWorkspace()).toBe('apps/docs')
    } finally {
      process.chdir(originalCwd)
    }
  })

  test('uses default MDX compiler when no loader is provided for in-memory file', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.mdx': ['export const number = 42', '', '# Hello World'].join('\n'),
    })
    const directory = new Directory({ fileSystem })
    const file = (await directory.getFile('index', 'mdx')) as MDXFile<
      any,
      any,
      any
    >

    // Named exports come from the default MDX compiler runtime
    const number = await file.getExportValue('number')
    expect(number).toBe(42)

    // The default remark plugins add a generated "headings" export
    const headings: any = await file.getExportValue('headings')
    expect(Array.isArray(headings)).toBe(true)
    expect(headings[0]).toMatchObject({
      id: 'hello-world',
      level: 1,
      text: 'Hello World',
      children: 'Hello World',
    })

    // Default export is a renderable MDX component
    const Content = await file.getExportValue('default')
    expect(typeof Content).toBe('function')
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

  test('getEntries supports per-call filters', async () => {
    const fileSystem = new MemoryFileSystem({
      'page.mdx': '',
      'note.txt': '',
      'nested/page.mdx': '',
    })
    const directory = new Directory({ fileSystem })

    const filtered = await directory.getEntries({ filter: '*.mdx' })

    expect(
      filtered.map((entry) => entry.getRelativePathToWorkspace()).sort()
    ).toEqual(['page.mdx'])

    const recursiveFiltered = await directory.getEntries({
      filter: '**/*.mdx',
      recursive: true,
    })

    expect(
      recursiveFiltered
        .map((entry) => entry.getRelativePathToWorkspace())
        .sort()
    ).toEqual(['nested', 'nested/page.mdx', 'page.mdx'])
  })

  test('reuses cached snapshots for identical getEntries options', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.ts': '',
      'components/Button/index.tsx': '',
      'components/Button/Button.tsx': '',
    })
    const readDirectorySpy = vi.spyOn(fileSystem, 'readDirectory')
    const directory = new Directory({ fileSystem })

    await directory.getEntries({
      recursive: true,
      includeDirectoryNamedFiles: true,
      includeIndexAndReadmeFiles: true,
    })

    const callsAfterFirst = readDirectorySpy.mock.calls.length

    await directory.getEntries({
      recursive: true,
      includeDirectoryNamedFiles: true,
      includeIndexAndReadmeFiles: true,
    })

    expect(readDirectorySpy).toHaveBeenCalledTimes(callsAfterFirst)
    readDirectorySpy.mockRestore()
  })

  test('recursive entries', async () => {
    const directory = new Directory({ path: 'fixtures/project' })
    const entries = await directory.getEntries({
      recursive: true,
      includeIndexAndReadmeFiles: true,
    })

    expect(entries.map((entry) => entry.getPathname())).toMatchInlineSnapshot(`
      [
        "/project/rpc",
        "/project/rpc/client",
        "/project/rpc/server",
        "/project/server",
        "/project/types",
      ]
    `)
  })

  test('directory accepts URL path input', async () => {
    const projectUrl = new URL('../../fixtures/project', import.meta.url)
    const directory = new Directory({ path: projectUrl })
    const file = await directory.getFile('server', 'ts')

    expect(file).toBeInstanceOf(File)
    expect(file.getAbsolutePath()).toContain('/fixtures/project/server.ts')
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
      includeIndexAndReadmeFiles: true,
    })

    expect(entries.map((entry) => entry.getAbsolutePath()))
      .toMatchInlineSnapshot(`
        [
          "/index.ts",
          "/components",
          "/components/Button",
          "/components/Button/index.tsx",
          "/components/Link.tsx",
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

  test('filters out hidden files by default', async () => {
    const fileSystem = new MemoryFileSystem({
      '.gitkeep': '',
      '.hidden-config': '',
      'visible.ts': '',
    })
    const directory = new Directory({ fileSystem })
    const entries = await directory.getEntries()

    expect(entries).toHaveLength(1)
    expect(entries[0].getName()).toBe('visible.ts')
  })

  test('filters out hidden directories by default', async () => {
    const fileSystem = new MemoryFileSystem({
      '.hidden-dir/file.ts': '',
      'visible-dir/file.ts': '',
    })
    const directory = new Directory({ fileSystem })
    const entries = await directory.getEntries({ recursive: true })

    expect(entries.map((entry) => entry.getAbsolutePath())).toEqual([
      '/visible-dir',
      '/visible-dir/file.ts',
    ])
  })

  test('includes hidden files when includeHiddenFiles is true', async () => {
    const fileSystem = new MemoryFileSystem({
      '.gitkeep': '',
      '.hidden-config': '',
      'visible.ts': '',
    })
    const directory = new Directory({ fileSystem })
    const entries = await directory.getEntries({ includeHiddenFiles: true })

    expect(entries).toHaveLength(3)
    expect(entries.map((entry) => entry.getName()).sort()).toEqual([
      '.gitkeep',
      '.hidden-config',
      'visible.ts',
    ])
  })

  test('includes hidden directories when includeHiddenFiles is true', async () => {
    const fileSystem = new MemoryFileSystem({
      '.hidden-dir/file.ts': '',
      'visible-dir/file.ts': '',
    })
    const directory = new Directory({ fileSystem })
    const entries = await directory.getEntries({
      recursive: true,
      includeHiddenFiles: true,
    })

    expect(entries.map((entry) => entry.getAbsolutePath()).sort()).toEqual([
      '/.hidden-dir',
      '/.hidden-dir/file.ts',
      '/visible-dir',
      '/visible-dir/file.ts',
    ])
  })

  test('filters with schema', async () => {
    const directory = new Directory({
      path: 'fixtures/posts',
      loader: {
        mdx: withSchema(
          {
            frontmatter: z.object({
              title: z.string(),
              date: z.coerce.date(),
            }),
          },
          (path) => import(`#fixtures/posts/${path}.mdx`)
        ),
      },
      filter: async (entry) => {
        if (isFile(entry, 'mdx')) {
          const value = await entry
            .getExportValue('frontmatter')
            .catch((error) => {
              if (error instanceof ModuleExportNotFoundError) {
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
    const directory = new Directory({ fileSystem, slugCasing: 'none' })
    const entries = await directory.getEntries({ recursive: true })

    expect(entries.map((entry) => entry.getPathname())).toEqual([
      '/Button',
      '/Button/IconButton',
    ])
  })

  test('loaders', async () => {
    const directory = new Directory({
      path: 'fixtures/utils',
      loader: {
        ts: withSchema<{
          basename: typeof basename
        }>((path) => import(`#fixtures/utils/${path}.ts`)),
      },
    })
    const file = await directory.getFile('path', 'ts')
    const basenameFn = await file.getExportValue('basename')

    type Test = Expect<IsNotAny<typeof basenameFn>>

    expectTypeOf(basenameFn).toExtend<
      (path: string, extension?: string) => string
    >()
    expect(basenameFn('fixtures/utils/path.ts')).toBe('path.ts')
  })

  test('supports runtime loader functions for directories', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.ts': '',
      'guide.mdx': '# Guide',
    })
    const runtimeLoader = vi.fn(async (path: string, file: any) => ({
      default: `loaded:${path}:${file.getExtension()}`,
    }))

    const directory = new Directory({ fileSystem, loader: runtimeLoader })

    const tsFile = await directory.getFile('index', 'ts')
    const tsDefault = await tsFile.getExportValue('default')

    const mdxFile = await directory.getFile('guide', 'mdx')
    const mdxDefault = await mdxFile.getExportValue('default')

    expect(tsDefault).toBe(
      `loaded:${removeExtension(tsFile.getRelativePathToRoot())}:${tsFile.getExtension()}`
    )
    expect(mdxDefault).toBe(
      `loaded:${removeExtension(mdxFile.getRelativePathToRoot())}:${mdxFile.getExtension()}`
    )

    expect(runtimeLoader).toHaveBeenCalledWith(
      removeExtension(tsFile.getRelativePathToRoot()),
      tsFile
    )
    expect(runtimeLoader).toHaveBeenCalledWith(
      removeExtension(mdxFile.getRelativePathToRoot()),
      mdxFile
    )
  })

  describe('withSchema', () => {
    test('types only', async () => {
      const directory = new Directory({
        path: 'fixtures/docs',
        loader: {
          ts: withSchema<{ metadata?: { title: string } }>(
            (path) => import(`#fixtures/docs/${path}.ts`)
          ),
        },
      })
      const value = await (
        await directory.getFile('introduction', 'ts')
      ).getExportValue('metadata')

      type Test = Expect<IsNotAny<typeof value>>

      expectTypeOf(value).toExtend<{ title: string } | undefined>()
    })

    test('custom validator', async () => {
      const directory = new Directory({
        path: 'fixtures/docs',
        loader: {
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

      expectTypeOf(value).toExtend<{ title: string }>()
    })

    test('inferred validator', async () => {
      const directory = new Directory({
        path: 'fixtures/docs',
        loader: {
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

      expectTypeOf(value).toExtend<{ title: string } | undefined>()
    })

    test('valibot', async () => {
      const directory = new Directory({
        path: 'fixtures/docs',
        loader: {
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

      expectTypeOf(value).toExtend<{ title: string; date: Date } | undefined>()
    })

    test('zod', async () => {
      const directory = new Directory({
        path: 'fixtures/docs',
        loader: {
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

      expectTypeOf(value).toExtend<{ title: string; date?: Date } | undefined>()
    })
  })

  test('filter entries', async () => {
    type PostType = { frontmatter: { title: string } }
    const posts = new Directory({
      path: 'fixtures/posts',
      loader: {
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
      filter: (entry) => isFile(entry, 'mdx'),
    })
    const files = await posts.getEntries()

    expectTypeOf(files).toExtend<
      MDXFile<{ default: MDXContent } & PostType>[]
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
      loader: {
        mdx: withSchema<PostType>(),
      },
      filter: (entry) => isFile(entry, 'mdx'),
    })
    const files = await posts.getEntries()

    expectTypeOf(files).toExtend<
      MDXFile<{ default: MDXContent } & PostType>[]
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
      filter: async (entry) => {
        if (isFile(entry, 'tsx')) {
          const fileExports = await entry.getExports()

          for (const fileExport of fileExports) {
            const tags = fileExport.getTags()

            if (tags?.some((tag) => tag.name === 'internal')) {
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

  test('javascript file getExports filters @internal exports', async () => {
    const fileSystem = new MemoryFileSystem({
      'tsconfig.json': '{ "compilerOptions": { "stripInternal": true } }',
      'Button.tsx': '/** @internal */ export const Button = () => {}',
      'Link.tsx': 'export const Link = () => {}',
    })
    const directory = new Directory({ fileSystem })
    const internalOnlyFile = new JavaScriptFile({
      path: 'Button.tsx',
      directory,
    })
    const publicFile = new JavaScriptFile({
      path: 'Link.tsx',
      directory,
    })

    const internalExports = await internalOnlyFile.getExports()
    const publicExports = await publicFile.getExports()

    expect(internalExports).toHaveLength(0)
    expect(publicExports.map((fileExport) => fileExport.getName())).toEqual([
      'Link',
    ])
  })

  test('directory excludes files and folders with only internal exports', async () => {
    const fileSystem = new MemoryFileSystem({
      'tsconfig.json': '{ "compilerOptions": { "stripInternal": true } }',
      '.gitignore': '**/tsconfig.json\n**/.gitignore\n',
      'Button.tsx': '/** @internal */ export const Button = () => {}',
      'components/Foo.tsx': '/** @internal */ export const Foo = () => {}',
      'components/Bar.tsx': '/** @internal */ export const Bar = () => {}',
      'utils/helpers.ts': 'export const helper = () => {}',
    })
    const root = new Directory({ fileSystem })
    const entries = (await root.getEntries()).filter(
      (entry): entry is Directory<any> => entry instanceof Directory
    )

    // Should only include "utils" since "Button.tsx" is internal-only and "components" has only internal children
    expect(entries).toHaveLength(1)
    expect(entries[0]).toBeInstanceOf(Directory)
    expect(entries[0].getName()).toBe('utils')
  })

  test('string filter', async () => {
    const fileSystem = new MemoryFileSystem({
      'foo.ts': '',
      'bar.tsx': '',
      'baz.mdx': '',
    })
    const directory = new Directory({
      fileSystem,
      filter: '*.mdx',
    })
    const entries = await directory.getEntries()

    expectTypeOf(entries).toExtend<MDXFile[]>()

    expect(entries).toHaveLength(1)
  })

  test('sort entries', async () => {
    const fileSystem = new MemoryFileSystem({
      'foo.ts': '',
      'bar.ts': '',
    })
    const directory = new Directory({
      fileSystem,
      sort: 'name',
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
      'foo.ts': 'const order = 2',
      'bar.ts': 'const order = 1',
    })
    const imports = {
      'foo.ts': () => Promise.resolve({ order: 2 }),
      'bar.ts': () => Promise.resolve({ order: 1 }),
    }
    const directory = new Directory({
      fileSystem,
      loader: {
        ts: withSchema<{ order: number }>((path) => {
          const importPath = `${path}.ts` as keyof typeof imports
          return imports[importPath]()
        }),
      },
      filter: '*.ts',
      sort: 'order',
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
      filter(entry) {
        return isFile(entry, 'mdx')
      },
    })
    const entries = await docs.getEntries({ recursive: true })

    expect(entries.every((entry) => entry.getExtension() === 'mdx')).toBe(true)
    expect(entries).toHaveLength(4)
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

    expect(entries.map((entry) => entry.getPathname())).toMatchInlineSnapshot(
      `
      [
        "/button",
        "/code-block",
        "/tsconfig",
      ]
    `
    )
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

    expectTypeOf(file!).toExtend<File>()
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

  test('resolves package.json inside a directory named "package"', async () => {
    const fileSystem = new MemoryFileSystem({
      'examples/package/package.json': '{"name":"@examples/package"}',
      'examples/package/app/page.tsx': '',
    })
    const examples = new Directory({ path: 'examples', fileSystem })
    const packageDirectory = await examples.getDirectory('package')
    const packageJson = await packageDirectory.getFile('package', 'json')

    expect(packageJson).toBeInstanceOf(JSONFile)
    expect(packageJson.getAbsolutePath()).toBe('/examples/package/package.json')
  })

  test('prefers file over same-named directory when extension specified', async () => {
    const fileSystem = new MemoryFileSystem({
      'foo/package.json': '{"name":"foo"}',
      'foo/package/index.ts': '',
    })
    const root = new Directory({ path: 'foo', fileSystem })
    const packageJson = await root.getFile('package', 'json')

    expect(packageJson).toBeInstanceOf(JSONFile)
    expect(packageJson.getAbsolutePath()).toBe('/foo/package.json')
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
    expectTypeOf(file!).toExtend<JavaScriptFile<any>>()

    const jsFile = new JavaScriptFile({ path: 'fixtures/project/server.ts' })
    const jsFileExports = await jsFile.getExports()

    expect(jsFileExports).toHaveLength(1)
  })

  test('javascript file with runtime', async () => {
    const projectDirectory = new Directory({
      path: 'fixtures/project',
      loader: {
        ts: (path) => import(`#fixtures/project/${path}.ts`),
      },
    })
    const file = await projectDirectory.getFile('server', 'ts')

    expect(file).toBeInstanceOf(JavaScriptFile)
    expectTypeOf(file).toExtend<JavaScriptFile<any>>()
  })

  test('is javascript file with runtime', async () => {
    const projectDirectory = new Directory({
      path: 'fixtures/project',
      loader: {
        ts: (path) => import(`#fixtures/project/${path}.ts`),
      },
    })
    const entry = await projectDirectory.getEntry('server')

    expect(isJavaScriptFile(entry)).toBe(true)

    if (isJavaScriptFile(entry)) {
      expectTypeOf(entry).toExtend<JavaScriptFile<any>>()
    }
  })

  describe('file name with modifier', async () => {
    let fileSystem: MemoryFileSystem
    let directory: Directory<any>

    beforeAll(() => {
      fileSystem = new MemoryFileSystem({
        'components/Reference.examples.tsx': '',
        'components/Reference.tsx': '',
      })
      directory = new Directory({ fileSystem })
    })

    test('string path', async () => {
      const entry = await directory.getEntry('components/Reference/examples')

      expect(entry.getAbsolutePath()).toBe('/components/Reference.examples.tsx')

      const file = await directory.getFile('components/Reference/examples')

      expect(file.getAbsolutePath()).toBe('/components/Reference.examples.tsx')

      const fileWithExtension = await directory.getFile(
        'components/Reference/examples',
        'tsx'
      )

      expect(fileWithExtension.getAbsolutePath()).toBe(
        '/components/Reference.examples.tsx'
      )
    })

    test('array path', async () => {
      const entry = await directory.getEntry([
        'components',
        'Reference',
        'examples',
      ])

      expect(entry.getAbsolutePath()).toBe('/components/Reference.examples.tsx')

      const file = await directory.getFile([
        'components',
        'Reference',
        'examples',
      ])

      expect(file.getAbsolutePath()).toBe('/components/Reference.examples.tsx')

      const fileWithExtension = await directory.getFile(
        ['components', 'Reference', 'examples'],
        'tsx'
      )

      expect(fileWithExtension.getAbsolutePath()).toBe(
        '/components/Reference.examples.tsx'
      )
    })
  })

  test('prioritizes base file name over file name with modifier', async () => {
    const fileSystem = new MemoryFileSystem({
      'Reference.examples.tsx': '',
      'Reference.tsx': '',
    })
    const directory = new Directory({ fileSystem })
    const entry = await directory.getEntry('Reference')

    expect(entry.getAbsolutePath()).toBe('/Reference.tsx')
  })

  test('chooses entry with same name as directory when bare file path', async () => {
    const directory = new Directory({
      path: 'fixtures/components',
      basePathname: 'components',
    })
    const file = await directory.getFile('Box')

    expect(file.getRelativePathToRoot()).toBe('Box/Box.tsx')
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
    expect(file.getPathname()).toBe('/server')
    expect(file.getPathnameSegments()).toStrictEqual(['server'])
  })

  test('nested ordered files', async () => {
    const fileSystem = new MemoryFileSystem({
      '01.docs/01.getting-started.mdx': '',
      '01.getting-started.mdx': '',
    })
    const directory = new Directory({ fileSystem })
    const entries = await directory.getEntries({ recursive: true })

    expect(entries.map((entry) => entry.getPathname())).toMatchObject([
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
      slugCasing: 'kebab',
    })
    const file = await rootDirectory.getFile('button')

    expect(file.getPathname()).toBe('/button')

    const directory = await rootDirectory.getDirectory('card')

    expect(directory.getPathname()).toBe('/card')
  })

  test('deduplicate file path segments', async () => {
    const fileSystem = new MemoryFileSystem({
      'Button/Button.tsx': '',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('Button/Button', 'tsx')

    expect(file.getPathname()).toEqual('/button')
    expect(file.getPathnameSegments()).toStrictEqual(['button'])

    expect(file.getPathname({ includeDirectoryNamedSegment: true })).toEqual(
      '/button/button'
    )
    expect(
      file.getPathnameSegments({ includeDirectoryNamedSegment: true })
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
      loader: {
        ts: withSchema<{ useHover: Function }>(() => {
          return Promise.resolve({ useHover: () => {} })
        }),
      },
    })
    const file = await rootDirectory.getFile('use-hover', 'ts')
    const fileExport = await file.getExport('useHover')
    const value = await fileExport.getRuntimeValue()

    expectTypeOf(value).toExtend<Function>()
    expect(value).toBeInstanceOf(Function)
  })

  test('file export value types', async () => {
    const projectDirectory = new Directory({
      path: 'fixtures/project',
      loader: {
        ts: withSchema<{ createServer: () => void }>(
          (path) => import(`#fixtures/project/${path}.ts`)
        ),
      },
    })
    const file = await projectDirectory.getFile('server', 'ts')
    const fileExport = await file.getExport('createServer')
    const value = await fileExport.getRuntimeValue()

    expectTypeOf(value).toExtend<Function>()
  })

  test('file export schema', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.ts': 'export const metadata = 1',
    })
    const directory = new Directory({
      fileSystem,
      loader: {
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

  test('javascript file export static literal value', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.ts': [
        'export const number = 42',
        "export const string = 'hello world'",
        'export const booleanTrue = true',
        'export const booleanFalse = false',
        'export const nullValue = null',
        'export const reference = 123',
        'export const array = [1, "a", true]',
        "export const object = { a: 1, b: 'x' }",
        'export default 123',
      ].join('\n'),
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('index', 'ts')

    const numberExport = await file.getExport('number')
    const stringExport = await file.getExport('string')
    const booleanTrueExport = await file.getExport('booleanTrue')
    const booleanFalseExport = await file.getExport('booleanFalse')
    const nullExport = await file.getExport('nullValue')
    const referenceExport = await file.getExport('reference')
    const arrayExport = await file.getExport('array')
    const objectExport = await file.getExport('object')
    const defaultExport = await file.getExport('default')

    expect(await numberExport.getStaticValue()).toBe(42)
    expect(await stringExport.getStaticValue()).toBe('hello world')
    expect(await booleanTrueExport.getStaticValue()).toBe(true)
    expect(await booleanFalseExport.getStaticValue()).toBe(false)
    expect(await nullExport.getStaticValue()).toBeNull()
    expect(await referenceExport.getStaticValue()).toBe(123)
    expect(await arrayExport.getStaticValue()).toEqual([1, 'a', true])
    expect(await objectExport.getStaticValue()).toEqual({ a: 1, b: 'x' })
    expect(await defaultExport.getStaticValue()).toBe(123)
  })

  test('mdx file export static literal value', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.mdx': [
        'export const number = 42',
        "export const string = 'hello world'",
        'export const booleanTrue = true',
        'export const booleanFalse = false',
        'export const nullValue = null',
        'export const reference = 123',
        "export const array = [1, 'a', true, new Date('04/20/20')]",
        "export const object = { a: 1, b: 'x' }",
      ].join('\n'),
    })
    const directory = new Directory({ fileSystem })
    const file = (await directory.getFile('index', 'mdx')) as MDXFile<
      any,
      any,
      any
    >

    const numberExport = await file.getExport('number')
    const stringExport = await file.getExport('string')
    const booleanTrueExport = await file.getExport('booleanTrue')
    const booleanFalseExport = await file.getExport('booleanFalse')
    const nullExport = await file.getExport('nullValue')
    const referenceExport = await file.getExport('reference')
    const arrayExport = await file.getExport('array')
    const objectExport = await file.getExport('object')
    const getTextSpy = vi.spyOn(file, 'getText')

    expect(await numberExport.getStaticValue()).toBe(42)
    expect(await stringExport.getStaticValue()).toBe('hello world')
    expect(await booleanTrueExport.getStaticValue()).toBe(true)
    expect(await booleanFalseExport.getStaticValue()).toBe(false)
    expect(await nullExport.getStaticValue()).toBeNull()
    expect(await referenceExport.getStaticValue()).toBe(123)
    expect(await arrayExport.getStaticValue()).toEqual([
      1,
      'a',
      true,
      new Date('04/20/20'),
    ])
    expect(await objectExport.getStaticValue()).toEqual({ a: 1, b: 'x' })
    expect(getTextSpy).toHaveBeenCalledTimes(1)
  })

  test('mdx file provides chat urls with raw source', async () => {
    const source = ['# Hello', '', '## World'].join('\n')
    const fileSystem = new MemoryFileSystem({
      'index.mdx': source,
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('index.mdx')

    const chatGptUrl = await file.getChatGPTUrl()
    const claudeUrl = await file.getClaudeUrl()

    expect(chatGptUrl).toBe(
      `https://chat.openai.com/?${new URLSearchParams({
        hints: 'search',
        q: source,
      })}`
    )
    expect(claudeUrl).toBe(
      `https://claude.ai/new?${new URLSearchParams({
        hints: 'search',
        q: source,
      })}`
    )
  })

  test('markdown file default loader provides content and headings', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.md': '# Hello\n\n## World',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('index', 'md')

    expect(file).toBeInstanceOf(MarkdownFile)

    const Content = await file.getContent()
    expectTypeOf(Content).toExtend<MDXContent>()

    const headings = await file.getHeadings()
    expect(headings).toMatchObject([
      { id: 'hello', level: 1, text: 'Hello' },
      { id: 'world', level: 2, text: 'World' },
    ])
    expectTypeOf(headings).toExtend<Headings>()
  })

  test('json file getAll and get(path) with dot notation', async () => {
    const fileSystem = new MemoryFileSystem({
      'config.json': JSON.stringify({
        a: { b: { c: 123 } },
        arr: [1, 2, 3],
        flag: true,
        nested: { title: 'Hello' },
      }),
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('config.json')

    expectTypeOf(file).toExtend<JSONFile<any, any>>()

    expect(file).toBeInstanceOf(JSONFile)

    const all = await file.get()
    expect(all).toEqual({
      a: { b: { c: 123 } },
      arr: [1, 2, 3],
      flag: true,
      nested: { title: 'Hello' },
    })

    const c = await file.get('a.b.c')
    expect(c).toBe(123)

    const title = await file.get('nested.title')
    expect(title).toBe('Hello')

    const missing = await file.get('nested.missing' as never)
    expect(missing).toBeUndefined()
  })

  test('isJSONFile type guard and json filter', async () => {
    const fileSystem = new MemoryFileSystem({
      'data.json': '{"name":"renoun"}',
      'other.ts': '',
    })
    const directory = new Directory({ fileSystem })

    const entry = await directory.getEntry('data')
    expect(isJSONFile(entry)).toBe(true)
    if (isJSONFile(entry)) {
      const name = await entry.get('name')
      expect(name).toBe('renoun')
    }

    const jsonOnly = new Directory({ fileSystem, filter: '*.json' })
    const entries = await jsonOnly.getEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toBeInstanceOf(JSONFile)
  })

  test('markdown file caches parsed headings', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.md': '# Hello',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('index', 'md')
    const getTextSpy = vi.spyOn(file, 'getText')

    await file.getHeadings()
    await file.getHeadings()

    expect(getTextSpy).toHaveBeenCalledTimes(1)
  })

  test('markdown file provides chat urls with raw source', async () => {
    const source = ['# Hello', '', '## World'].join('\n')
    const fileSystem = new MemoryFileSystem({
      'index.md': source,
    })
    const directory = new Directory({ fileSystem })
    const file = (await directory.getFile('index', 'md')) as MarkdownFile

    const chatGptUrl = await file.getChatGPTUrl()
    const claudeUrl = await file.getClaudeUrl()

    expect(chatGptUrl).toBe(
      `https://chat.openai.com/?${new URLSearchParams({
        hints: 'search',
        q: source,
      })}`
    )
    expect(claudeUrl).toBe(
      `https://claude.ai/new?${new URLSearchParams({
        hints: 'search',
        q: source,
      })}`
    )
  })

  test('mdx file getContent/getHeadings alias exported values', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.mdx': '# Hello\n\n## World',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('index', 'mdx')

    expect(file).toBeInstanceOf(MDXFile)

    const Content = await file.getContent()
    expectTypeOf(Content).toExtend<MDXContent>()

    const headings = await file.getHeadings()
    expect(headings).toMatchObject([
      { id: 'hello', level: 1, text: 'Hello' },
      { id: 'world', level: 2, text: 'World' },
    ])
    expectTypeOf(headings).toExtend<Headings>()
  })

  test('mdx file getHeadings falls back to parsing when export missing', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.mdx': '# Hello\n\n## World',
    })
    const directory = new Directory({
      fileSystem,
      loader: {
        mdx: async () => ({ default: () => null }),
      },
    })
    const file = await directory.getFile('index', 'mdx')
    const headings = await file.getHeadings()

    expect(headings).toMatchObject([
      { id: 'hello', level: 1, text: 'Hello' },
      { id: 'world', level: 2, text: 'World' },
    ])
  })

  test('javascript file getSections builds an outline from regions and exports', async () => {
    const fileSystem = new MemoryFileSystem({
      'button.tsx': `
        //#region components
        export const Button = () => null
        export const IconButton = () => null
        //#endregion

        export function useButton() {}

        //#region hooks
        export function useDropdown() {}
        export function useMenu() {}
        //#endregion
      `,
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('button', 'tsx')

    expect(file).toBeInstanceOf(JavaScriptFile)

    const sections = await file.getSections()

    expect(
      sections.map((section) => ({
        title: section.title,
        items: section.items.map((fileExport) => fileExport.getName()),
      }))
    ).toEqual([
      {
        title: 'components',
        items: ['Button', 'IconButton'],
      },
      { title: 'useButton', items: ['useButton'] },
      { title: 'hooks', items: ['useDropdown', 'useMenu'] },
    ])
  })

  test('javascript file getRegions returns TypeScript regions', async () => {
    const fileSystem = new MemoryFileSystem({
      'file.ts': `//#region alpha
const a = 1
//#endregion

//#region beta
function b() {}
//#endregion`,
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('file', 'ts')

    expect(file).toBeInstanceOf(JavaScriptFile)

    const regions = await file.getRegions()

    expect(regions).toEqual([
      {
        autoCollapse: false,
        bannerText: 'alpha',
        hintSpan: { length: 40, start: 0 },
        kind: 'region',
        position: {
          end: { column: 13, line: 3 },
          start: { column: 1, line: 1 },
        },
        textSpan: { length: 40, start: 0 },
      },
      {
        autoCollapse: false,
        bannerText: 'beta',
        hintSpan: { length: 43, start: 42 },
        kind: 'region',
        position: {
          end: { column: 13, line: 7 },
          start: { column: 1, line: 5 },
        },
        textSpan: { length: 43, start: 42 },
      },
    ])
    expectTypeOf(regions).toExtend<FileRegion[]>()
  })

  test('schema transforms export value', async () => {
    const fileSystem = new MemoryFileSystem({
      'hello-world.ts': `export const metadata = { title: 'Hello, World!', date: '2022-01-01' }`,
    })
    const directory = new Directory({
      fileSystem,
      loader: {
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

    expect(fileExport).toBeInstanceOf(ModuleExport)
    expect(fileExport.getName()).toBe('hello')
    expect(fileExport.getDescription()).toBe('Say hello.')
    expect(fileExport.getTags()).toMatchObject([
      { name: 'category', text: 'greetings' },
    ])
    expect(await fileExport.getText()).toBe(statementText)
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

  test('getTags filters jsdoc template tags by default', async () => {
    const fileSystem = new MemoryFileSystem({
      'identity.ts': `/**
 * Identity function.
 * @template T the value type
 */
export function identity<T>(value: T) {
  return value
}`,
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('identity', 'ts')
    const fileExport = await file.getExport('identity')

    expect(fileExport.getTags()).toBeUndefined()

    const tagsWithTypes = fileExport.getTags({ includeTypes: true })

    expect(tagsWithTypes).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'template' })])
    )
  })

  test('barrel file export metadata', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.ts': `export { Button } from './Button.tsx'`,
      'Button.tsx': `/**\n * A button component.\n * @category components\n */\nexport function Button() {}`,
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('index', 'ts')
    const fileExport = await file.getExport('Button')

    expect(fileExport).toBeInstanceOf(ModuleExport)
    expect(fileExport.getName()).toBe('Button')
  })

  test('getFirstCommitDate uses git metadata provider when available', async () => {
    const firstCommitDate = new Date('2023-12-31T00:00:00.000Z')
    const spy = vi.fn().mockResolvedValue({
      firstCommitDate,
      lastCommitDate: new Date('2024-01-02T00:00:00.000Z'),
    })

    class GitAwareMemoryFileSystem extends MemoryFileSystem {
      async getGitExportMetadata(
        path: string,
        startLine: number,
        endLine: number
      ) {
        return spy(path, startLine, endLine)
      }
    }

    const fileSystem = new GitAwareMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('index', 'ts')
    const fileExport = await file.getExport('value')

    await expect(fileExport.getFirstCommitDate()).resolves.toEqual(
      firstCommitDate
    )
    expect(spy).toHaveBeenCalledWith('/index.ts', 1, 1)
  })

  test('getFirstCommitDate falls back to local git metadata when provider missing', async () => {
    const firstCommitDate = new Date('2022-01-01T00:00:00.000Z')
    const spy = vi
      .spyOn(gitExportMetadataModule, 'getLocalGitExportMetadata')
      .mockResolvedValue({ firstCommitDate, lastCommitDate: undefined })

    try {
      const fileSystem = new MemoryFileSystem({
        'index.ts': 'export const answer = 42',
      })
      const directory = new Directory({ fileSystem })
      const file = await directory.getFile('index', 'ts')
      const fileExport = await file.getExport('answer')

      await expect(fileExport.getFirstCommitDate()).resolves.toEqual(
        firstCommitDate
      )
      expect(spy).toHaveBeenCalledWith('/index.ts', 1, 1)
    } finally {
      spy.mockRestore()
    }
  })

  test('getLastCommitDate uses git metadata provider when available', async () => {
    const lastCommitDate = new Date('2024-01-02T00:00:00.000Z')
    const spy = vi.fn().mockResolvedValue({
      firstCommitDate: new Date('2023-12-31T00:00:00.000Z'),
      lastCommitDate,
    })

    class GitAwareMemoryFileSystem extends MemoryFileSystem {
      async getGitExportMetadata(
        path: string,
        startLine: number,
        endLine: number
      ) {
        return spy(path, startLine, endLine)
      }
    }

    const fileSystem = new GitAwareMemoryFileSystem({
      'index.ts': 'export const value = 1',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('index', 'ts')
    const fileExport = await file.getExport('value')

    await expect(fileExport.getLastCommitDate()).resolves.toEqual(
      lastCommitDate
    )
    expect(spy).toHaveBeenCalledWith('/index.ts', 1, 1)
  })

  test('getLastCommitDate falls back to local git metadata when provider missing', async () => {
    const lastCommitDate = new Date('2022-02-02T00:00:00.000Z')
    const spy = vi
      .spyOn(gitExportMetadataModule, 'getLocalGitExportMetadata')
      .mockResolvedValue({ firstCommitDate: undefined, lastCommitDate })

    try {
      const fileSystem = new MemoryFileSystem({
        'index.ts': 'export const answer = 42',
      })
      const directory = new Directory({ fileSystem })
      const file = await directory.getFile('index', 'ts')
      const fileExport = await file.getExport('answer')

      await expect(fileExport.getLastCommitDate()).resolves.toEqual(
        lastCommitDate
      )
      expect(spy).toHaveBeenCalledWith('/index.ts', 1, 1)
    } finally {
      spy.mockRestore()
    }
  })

  test('file export type reference', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.ts': 'export type Metadata = { title: string }',
    })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('index', 'ts')
    const fileExport = await file.getExport('Metadata')
    const type = (await fileExport.getType()) as Kind.TypeAlias

    expect(type).toBeDefined()

    expect(type!.kind).toBe('TypeAlias')
  })

  test('getRuntimeValue resolves export runtime value from extension module', async () => {
    const directory = new Directory({
      path: 'fixtures/utils',
      loader: {
        ts: (path) => import(`#fixtures/utils/${path}.ts`),
      },
    })
    const file = await directory.getFile('path', 'ts')

    expectTypeOf(file).toExtend<JavaScriptFile<any>>()
    expect(file).toBeInstanceOf(JavaScriptFile)

    const fileExport = await file.getExport('basename')

    expectTypeOf(fileExport).toHaveProperty('getRuntimeValue')
    expect(fileExport).toBeInstanceOf(ModuleExport)

    const basename = await fileExport.getRuntimeValue()

    expect(basename).toBeDefined()
    expect(basename('/path/to/file.ts', '.ts')).toBe('file')
  })

  test('getRuntimeValue resolves export runtime value from loader', async () => {
    const directory = new Directory({
      path: 'fixtures/utils',
      loader: {
        ts: (path) => import(`#fixtures/utils/${path}.ts`),
      },
    })
    const file = await directory.getFile('path', 'ts')

    expectTypeOf(file).toExtend<JavaScriptFile<any>>()
    expect(file).toBeInstanceOf(JavaScriptFile)

    const fileExport = await file.getExport('basename')

    expectTypeOf(fileExport).toHaveProperty('getRuntimeValue')
    expect(fileExport).toBeInstanceOf(ModuleExport)

    const basename = await fileExport.getRuntimeValue()

    expect(basename).toBeDefined()
    expect(basename('/path/to/file.ts', '.ts')).toBe('file')
  })

  test('loader factory returns loader map and is resolved once', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.ts': '',
      'foo.ts': '',
    })

    let factoryCalls = 0

    const directory = new Directory({
      fileSystem,
      loader: () => {
        factoryCalls++
        return {
          ts: () => ({ value: 42 }),
        }
      },
    })

    const indexFile = await directory.getFile('index', 'ts')
    const indexValue = await indexFile.getExportValue('value')
    expect(indexValue).toBe(42)

    const fooFile = await directory.getFile('foo', 'ts')
    const fooValue = await fooFile.getExportValue('value')
    expect(fooValue).toBe(42)

    expect(factoryCalls).toBe(1)
  })

  test('unwraps lazy loader functions returning a module promise', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.ts': '',
    })

    const directory = new Directory({
      fileSystem,
      loader: {
        ts: () => () => Promise.resolve({ answer: 7 }),
      },
    })

    const file = await directory.getFile('index', 'ts')
    const value = await file.getExportValue('answer')
    expect(value).toBe(7)
  })

  test('getExportValue', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.ts': 'export const metadata = { title: "Hello, World!" }',
    })
    const directory = new Directory({
      fileSystem,
      loader: {
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
      basePathname: 'project',
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
      const path = entry.getPathname()
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

  test('adds route base path to entry getPathname and getPathnameSegments', async () => {
    const projectDirectory = new Directory({
      path: 'fixtures/project',
      basePathname: 'renoun',
    })
    const file = await projectDirectory.getFile('server', 'ts')

    expect(file.getPathname()).toBe('/renoun/server')
    expect(file.getPathnameSegments()).toEqual(['renoun', 'server'])
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
      loader: {
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
      expectTypeOf(entry).toExtend<Directory<any>>()
    }

    const normalizedDirectory = isFile(entry) ? entry.getParent() : entry

    expect(isDirectory(normalizedDirectory)).toBe(true)

    const file = await normalizedDirectory.getFile('README', 'mdx')

    expect(isDirectory(file)).toBe(false)

    expectTypeOf(file).toExtend<
      MDXFile<{
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
      loader: {
        tsx: withSchema<Metadata>(),
      },
    })
    const file = await directory.getFile('Button')
    const hasTsxExtension = isFile(file, 'tsx')

    expect(hasTsxExtension).toBe(true)

    if (hasTsxExtension) {
      expectTypeOf(file).toExtend<JavaScriptFile<Metadata>>()
    }
  })

  test('isFile array', async () => {
    type Metadata = { title: string }
    const fileSystem = new MemoryFileSystem({ 'Button.tsx': '' })
    const directory = new Directory({
      fileSystem,
      loader: {
        ts: withSchema<Metadata>(),
        tsx: withSchema<Metadata>(),
      },
    })
    const file = await directory.getFile('Button')
    const hasTsLikeExtension = isFile(file, ['ts', 'tsx'])

    expect(hasTsLikeExtension).toBe(true)

    if (hasTsLikeExtension) {
      expectTypeOf(file).toExtend<JavaScriptFile<Metadata>>()
    }

    const hasCssExtension = isFile(file, ['css'])

    expect(hasCssExtension).toBe(false)

    if (hasCssExtension) {
      expectTypeOf(file).toExtend<File>()
    }
  })

  test('directory getPathname prepends basePathname', async () => {
    const docs = new Directory({ path: 'fixtures/docs' })

    expect(docs.getPathname()).toBe('/docs')

    expect((await docs.getFile('index', 'mdx')).getPathname()).toBe('/docs')

    expect((await docs.getFile('getting-started', 'mdx')).getPathname()).toBe(
      '/docs/getting-started'
    )

    const components = new Directory({ path: 'fixtures/components' })

    expect(components.getPathname()).toBe('/components')

    const file = await components.getFile('CodeBlock', 'tsx')

    expect(file.getPathname()).toBe('/components/code-block')

    const example = await components.getFile(
      'CodeBlock/examples/BasicUsage',
      'tsx'
    )

    expect(example.getPathname()).toBe(
      '/components/code-block/examples/basic-usage'
    )

    const fileSystem = new MemoryFileSystem({
      'guides/intro.mdx': '',
    })

    expect(new Directory({ path: 'guides', fileSystem }).getPathname()).toBe(
      '/guides'
    )

    const guides = new Directory({
      path: 'guides',
      basePathname: 'docs',
      fileSystem,
    })

    expect(guides.getPathname()).toBe('/docs')
    expect((await guides.getFile('intro')).getPathname()).toBe('/docs/intro')
  })

  test('prefers same-named sibling file as directory index', async () => {
    const fileSystem = new MemoryFileSystem({
      'integrations.mdx': '',
      'integrations/index.mdx': '',
      'integrations/stripe.mdx': '',
    })

    const directory = new Directory({ fileSystem })

    const file = await directory.getFile('integrations', 'mdx')

    expect(file).toBeInstanceOf(MDXFile)
    expect(file.getRelativePathToWorkspace()).toBe('integrations.mdx')

    const entry = await directory.getEntry('integrations')

    expect(entry).toBeInstanceOf(MDXFile)

    if (entry instanceof MDXFile) {
      expect(entry.getRelativePathToWorkspace()).toBe('integrations.mdx')
    }

    const nested = await directory.getFile('integrations/stripe', 'mdx')

    expect(nested.getRelativePathToWorkspace()).toBe('integrations/stripe.mdx')
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
      loader: {
        mdx: withSchema<FrontMatter>(),
      },
    })
    const docs = new Directory({
      path: 'fixtures/docs',
      loader: {
        mdx: withSchema<FrontMatter>(),
      },
    })
    const group = new Collection({
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
    expectTypeOf(jsFile).toExtend<JavaScriptFile<any>>()

    const mdxFile = await group.getFile(
      'posts/building-a-button-component',
      'mdx'
    )

    expect(mdxFile).toBeInstanceOf(MDXFile)
    expectTypeOf(mdxFile).toExtend<
      MDXFile<{ default: MDXContent } & InferModuleExports<FrontMatter>>
    >()

    const file = await group.getFile(['posts', 'meta'], 'js')
    const [previousEntry, nextEntry] = await file.getSiblings({
      collection: group,
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
    const group = new Collection({ entries: [docs, guides] })

    const directory = await group.getDirectory('guides')
    const [previousDirectoryEntry, nextDirectoryEntry] =
      await directory.getSiblings({ collection: group })

    expect(previousDirectoryEntry).toBeDefined()
    expect(previousDirectoryEntry!.getPathname()).toBe('/docs/next-steps')

    expect(nextDirectoryEntry).toBeDefined()
    expect(nextDirectoryEntry!.getPathname()).toBe('/guides/intro')

    const file = await group.getFile('guides/intro')
    const [previousFileEntry, nextFileEntry] = await file.getSiblings({
      collection: group,
    })

    expect(previousFileEntry).toBeDefined()
    expect(previousFileEntry!.getPathname()).toBe('/guides')

    expect(nextFileEntry).toBeDefined()
    expect(nextFileEntry!.getPathname()).toBe('/guides/next-steps')
  })

  test('multiple extensions in entry group', async () => {
    const fileSystem = new MemoryFileSystem({
      'components/Button.mdx': '',
      'components/Button.tsx': '',
    })
    const directory = new Directory({
      fileSystem,
    })
    const collection = new Collection({
      entries: [directory],
    })
    const directoryEntry = await directory.getFile(
      ['components', 'Button'],
      'tsx'
    )

    expect(directoryEntry).toBeDefined()
    expect(directoryEntry?.getExtension()).toBe('tsx')

    const groupEntry = await collection.getFile(
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
    const collection = new Collection({
      entries: [directoryOne, directoryTwo],
    })
    const componentEntry = await collection.getEntry(['docs', 'Button'])

    expect(componentEntry).toBeDefined()
    expect(componentEntry.getPathname()).toBe('/docs/button')

    const componentFile = await collection.getFile(['docs', 'Button'], 'mdx')

    expect(componentFile).toBeDefined()
    expect(componentFile.getPathname()).toBe('/docs/button')
  })

  test('has entry', async () => {
    type MDXTypes = { frontmatter: { title: string } }
    type TSXTypes = { metadata: { title: string } }

    const directoryA = new Directory({
      fileSystem: new MemoryFileSystem({ 'Button.mdx': '' }),
      loader: {
        mdx: withSchema<MDXTypes>(),
      },
    })
    const directoryB = new Directory({
      path: 'fixtures/components',
      loader: {
        tsx: withSchema<TSXTypes>(),
      },
    })
    const group = new Collection({
      entries: [directoryA, directoryB],
    })

    expectTypeOf(await group.getFile('Button.mdx')).toExtend<
      MDXFile<{ default: MDXContent } & MDXTypes>
    >()

    const file = await group.getFile('Button', 'mdx')

    expectTypeOf(file).toExtend<MDXFile<{ default: MDXContent } & MDXTypes>>()

    const entry = await group.getEntry('Button')

    expect(directoryA.hasEntry(entry)).toBe(true)

    expect(directoryA.hasFile(entry, 'mdx')).toBe(true)

    type Test = Expect<IsNotAny<typeof entry>>

    if (directoryA.hasFile(entry, 'mdx')) {
      expectTypeOf(entry).toExtend<
        MDXFile<{ default: MDXContent } & MDXTypes>
      >()
    }
  })

  test('entry group works with type abstractions', async () => {
    function Document(props: {
      file?: MDXFile<{
        default: MDXContent
        headings: Headings
        metadata: {
          title: string
          description: string
        }
      }>
      collection?: Collection<any>
    }) {
      return null
    }

    const directory = new Directory({
      path: 'fixtures/docs',
      loader: {
        mdx: withSchema(
          {
            headings: z.array(
              z.object({
                id: z.string(),
                level: z.number(),
                text: z.string(),
                children: z.custom<React.ReactNode>().optional(),
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
      filter: (entry) => isFile(entry, 'mdx'),
    })
    const collection = new Collection({
      entries: [directory],
    })
    const file = await directory.getFile('index', 'mdx')

    Document({ file, collection })
  })

  test('adds default MDXContent type to existing mdx loaders', async () => {
    const posts = new Directory({
      fileSystem: new MemoryFileSystem({
        'hello-world.mdx': `export const frontmatter = { title: 'Hello, World!' }\n\n# Hello, World!`,
      }),
      loader: {
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

      expectTypeOf(fileExportValue).toExtend<MDXContent>()

      const Content = await file.getExportValue('default')
      const frontmatter = await file.getExportValue('frontmatter')

      expectTypeOf(Content).toExtend<MDXContent>()
      expectTypeOf(frontmatter).toExtend<{ title: string }>()

      type Tests = [
        Expect<IsNotAny<typeof fileExportValue>>,
        Expect<IsNotAny<typeof Content>>,
      ]
    }
  })

  test('errors when trying to recursively get entries with a shallow filter pattern', async () => {
    const directory = new Directory({
      path: 'fixtures',
      filter: '*.mdx',
    })

    await expect(
      directory.getEntries({
        // @ts-expect-error
        recursive: true,
      })
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      [Error: [renoun] Cannot use recursive option with a shallow filter pattern.
      Method: Directory#getEntries
      Directory path: "./fixtures"
      Filter pattern: "*.mdx"
      Hint: Use a recursive pattern (e.g. "**/*.mdx") when "recursive" is enabled.]
    `)
  })

  test('allows recursive option with multi-level filter pattern', async () => {
    const directory = new Directory({
      path: 'fixtures',
      filter: '**/*.mdx',
    })

    await expect(
      directory.getEntries({
        recursive: true,
      })
    ).resolves.toBeDefined()
  })

  test('includes parent directories when using recursive file pattern', async () => {
    const fileSystem = new MemoryFileSystem({
      'docs/getting-started/index.mdx': '# Getting Started',
      'docs/advanced/examples/advanced.mdx': '# Advanced Example',
      'docs/advanced/examples/basic.mdx': '# Basic Example',
      'docs/advanced/README.mdx': '# Advanced Guide',
      'docs/empty-folder/README.txt': 'Not an MDX file',
    })
    const directory = new Directory({
      path: 'docs',
      filter: '**/*.mdx',
      fileSystem,
    })
    const entries = await directory.getEntries({ recursive: true })
    const paths = entries.map((entry) => entry.getPathname())

    expect(paths).toEqual([
      '/docs/advanced',
      '/docs/advanced/examples',
      '/docs/advanced/examples/advanced',
      '/docs/advanced/examples/basic',
    ])
    expect(paths).not.toContain('/docs/empty-folder')

    for (const entry of entries) {
      if (entry instanceof File) {
        expect(entry.getExtension()).toBe('mdx')
      }
    }

    const advancedDir = await directory.getDirectory('advanced')
    expect(advancedDir).toBeDefined()
    expect(advancedDir?.getPathname()).toBe('/docs/advanced')

    const examplesDir = await advancedDir?.getDirectory('examples')
    expect(examplesDir).toBeDefined()
    expect(examplesDir?.getPathname()).toBe('/docs/advanced/examples')

    const basicFile = await examplesDir?.getFile('basic', 'mdx')
    expect(basicFile).toBeDefined()
    expect(basicFile?.getPathname()).toBe('/docs/advanced/examples/basic')
  })

  test('gets all files from recursive filter pattern', async () => {
    const fileSystem = new MemoryFileSystem({
      'components/Box/Box.mdx': '# Box Component',
      'components/Box/examples/Basic.mdx': '# Basic Example',
      'components/Button/Button.mdx': '# Button Component',
    })
    const directory = new Directory({
      fileSystem,
      path: 'components',
      filter: '**/*.mdx',
    })
    const entries = await directory.getEntries({ recursive: true })
    const paths = entries.map((entry) => entry.getPathname())

    expect(paths).toEqual([
      '/components/box',
      '/components/box/examples',
      '/components/box/examples/basic',
      '/components/button',
    ])

    const boxFile = await directory.getFile('box/box', 'mdx')
    expect(boxFile).toBeDefined()
    expect(boxFile.getPathname()).toBe('/components/box')

    const basicFile = await directory.getFile('box/examples/basic', 'mdx')
    expect(basicFile).toBeDefined()
    expect(basicFile.getPathname()).toBe('/components/box/examples/basic')
  })

  test('nested directories with recursive filter pattern', async () => {
    const directory = new Directory({
      path: 'fixtures/docs',
      filter: '**/*.mdx',
    })
    const entries = await directory.getEntries({ recursive: true })
    const paths = entries.map((entry) => entry.getPathname())

    expect(paths).toEqual([
      '/docs/components',
      '/docs/components/accessibility',
      '/docs/components/accessibility/introduction',
      '/docs/components/authoring',
      '/docs/configuration',
      '/docs/getting-started',
    ])
  })

  test('filter recursive pattern includes directory type in sort callback and entries', async () => {
    const directory = new Directory({
      fileSystem: new MemoryFileSystem({}),
      filter: '**/*.mdx',
    })

    const entries = await directory.getEntries()

    for (const entry of entries) {
      if (isDirectory(entry)) {
        expect(entry).toBeInstanceOf(Directory)
        expectTypeOf(entry).toExtend<Directory<any>>()
      } else {
        expect(entry).toBeInstanceOf(MDXFile)
        expectTypeOf(entry).toExtend<MDXFile<{ default: MDXContent }>>()
      }
    }
  })

  test('sort descriptor', async () => {
    new Directory({
      loader: {
        mdx: withSchema<{
          frontmatter: {
            title: string
          }
        }>((path) => import(`#fixtures/posts/${path}.mdx`)),
      },
      filter: '**/*.mdx',
      // @ts-expect-error
      sort: 'non-existent',
    })

    new Directory<{
      mdx: {
        frontmatter: {
          date: Date
        }
      }
    }>({
      sort: 'frontmatter.date',
    })
  })

  test('order based on exported values', async () => {
    const fileSystem = new MemoryFileSystem({
      'features/ai-assistant.mdx': 'export const order = 1',
      'features/code-navigation.mdx': 'export const order = 2',
      'features/debugging.mdx': 'export const order = 3',
      'features/index.mdx': 'export const order = 3',
      'faq.mdx': 'export const order = 6',
      'integrations.mdx': 'export const order = 4',
      'installation.mdx': 'export const order = 2',
      'keyboard-shortcuts.mdx': 'export const order = 5',
      'troubleshooting.mdx': 'export const order = 7',
      'welcome.mdx': 'export const order = 1',
    })
    const directory = new Directory<{ mdx: { order: number } }>({
      filter: '**/*.mdx',
      sort: 'order',
      fileSystem,
    })
    const entries = await directory.getEntries({ recursive: true })
    const paths = entries.map((entry) => entry.getPathname())

    expect(paths).toEqual([
      '/welcome',
      '/installation',
      '/features',
      '/features/ai-assistant',
      '/features/code-navigation',
      '/features/debugging',
      '/integrations',
      '/keyboard-shortcuts',
      '/faq',
      '/troubleshooting',
    ])

    for (const entry of entries) {
      if (entry instanceof MDXFile) {
        // TODO: fix type error for directory getExportValue
        const order = await entry.getExportValue('order')
        expect(order).toBeDefined()
        expect(typeof order).toBe('number')
      }
    }
  })

  test('sort descriptor with direction', async () => {
    const fileSystem = new MemoryFileSystem({
      'features/ai-assistant.mdx': 'export const order = 1',
      'features/code-navigation.mdx': 'export const order = 2',
      'features/debugging.mdx': 'export const order = 3',
      'features/index.mdx': 'export const order = 3',
      'faq.mdx': 'export const order = 6',
      'integrations.mdx': 'export const order = 4',
      'installation.mdx': 'export const order = 2',
      'keyboard-shortcuts.mdx': 'export const order = 5',
      'troubleshooting.mdx': 'export const order = 7',
      'welcome.mdx': 'export const order = 1',
    })
    const directory = new Directory<{
      mdx: {
        order: number
      }
    }>({
      filter: '**/*.mdx',
      sort: { key: 'order', direction: 'descending' },
      fileSystem,
    })
    const entries = await directory.getEntries()
    const paths = entries.map((entry) => entry.getPathname())

    expect(paths).toEqual([
      '/troubleshooting',
      '/faq',
      '/keyboard-shortcuts',
      '/integrations',
      '/features',
      '/installation',
      '/welcome',
    ])
  })

  test('sort descriptor without directory types', async () => {
    new Directory({
      sort: 'name',
    })

    new Directory({
      // @ts-expect-error - should throw error since order is not a typed property
      sort: 'order',
    })
  })

  test('sort descriptor function with sync resolver', async () => {
    const fileSystem = new MemoryFileSystem({
      'zebra.ts': '',
      'alpha.ts': '',
      'beta.ts': '',
    })
    const directory = new Directory<{
      mdx: { order: number }
      ts: { metadata: { order: number } }
    }>({
      fileSystem,
      filter: '**/*.ts',
      sort: createSort(
        (entry) => entry.getBaseName(),
        (a, b) => a.localeCompare(b)
      ),
    })
    const entries = await directory.getEntries()
    const names = entries.map((entry) => entry.getBaseName())

    expect(names).toEqual(['alpha', 'beta', 'zebra'])
  })

  test('sort descriptor with recursive filter', async () => {
    new Directory({
      filter: '**/*.mdx',
      loader: {
        mdx: withSchema(
          { metadata: z.object({ order: z.number() }) },
          (path) => import(`./docs/${path}.mdx`)
        ),
      },
      sort: 'metadata.order',
    })

    new Directory({
      filter: '**/*.mdx',
      loader: {
        mdx: withSchema(
          { metadata: z.object({ order: z.number() }) },
          (path) => import(`./docs/${path}.mdx`)
        ),
      },
      // @ts-expect-error - should throw error since date is not a typed property
      sort: 'metadata.date',
    })
  })

  test('sort descriptor function with async resolver', async () => {
    const fileSystem = new MemoryFileSystem({
      'file1.ts': 'export const priority = 3',
      'file2.ts': 'export const priority = 1',
      'file3.ts': 'export const priority = 2',
    })
    const directory = new Directory({
      fileSystem,
      loader: {
        ts: withSchema<{ priority: number }>((path) => {
          switch (path) {
            case 'file1':
              return Promise.resolve({ priority: 3 })
            case 'file2':
              return Promise.resolve({ priority: 1 })
            case 'file3':
              return Promise.resolve({ priority: 2 })
          }
          return Promise.resolve({ priority: 0 })
        }),
      },
      sort: createSort(
        (entry) => {
          if (isFile(entry, 'ts')) {
            return entry.getExportValue('priority')
          }
          return 0
        },
        (a, b) => a - b
      ),
    })
    const entries = await directory.getEntries()
    const names = entries.map((entry) => entry.getBaseName())

    expect(names).toEqual(['file2', 'file3', 'file1'])
  })

  test('defaults to descending sort when key is Date', async () => {
    const directory = new Directory<{
      mdx: { frontmatter: { date: Date } }
    }>({
      filter: '*.mdx',
      sort: 'frontmatter.date',
      fileSystem: new MemoryFileSystem({
        'older.mdx': `export const frontmatter = { date: new Date("2022-01-01") }`,
        'newer.mdx': `export const frontmatter = { date: new Date("2023-01-01") }`,
      }),
    })
    const entries = await directory.getEntries()
    const names = entries.map((entry) => entry.getName())

    expect(names).toEqual(['newer.mdx', 'older.mdx'])
  })

  test('excludes directory-named files by default', async () => {
    const fileSystem = new MemoryFileSystem({
      'components/CodeBlock/CodeBlock.tsx': '',
      'components/CodeBlock/Tokens.tsx': '',
    })
    const componentsDirectory = new Directory({
      fileSystem,
      path: 'components',
    })
    const codeBlockDirectory =
      await componentsDirectory.getDirectory('CodeBlock')
    const entries = await codeBlockDirectory.getEntries()

    expect(entries.map((entry) => entry.getName())).toEqual(['Tokens.tsx'])
  })

  test('includes directory-named files when includeDirectoryNamedFiles is true', async () => {
    const fileSystem = new MemoryFileSystem({
      'components/CodeBlock/CodeBlock.tsx': '',
      'components/CodeBlock/Tokens.tsx': '',
    })
    const componentsDirectory = new Directory({
      fileSystem,
      path: 'components',
    })
    const codeBlockDirectory =
      await componentsDirectory.getDirectory('CodeBlock')
    const entries = await codeBlockDirectory.getEntries({
      includeDirectoryNamedFiles: true,
    })

    expect(entries.map((entry) => entry.getName())).toEqual([
      'CodeBlock.tsx',
      'Tokens.tsx',
    ])
  })

  test('getExportValue from FileSystemEntry with resolveFileFromEntry', () => {
    async function _0({
      entry,
    }: {
      entry: FileSystemEntry<{
        mdx: {
          metadata: {
            label?: string
            title?: string
          }
        }
      }>
    }) {
      const resolvedFile = await resolveFileFromEntry(entry, 'mdx')
      const metadata = resolvedFile
        ? await resolvedFile.getExportValue('metadata')
        : undefined

      metadata?.label

      // @ts-expect-error
      resolvedFile?.getExportValue('nonexistent')
    }

    async function _1({ entry }: { entry: FileSystemEntry }) {
      const resolvedFile = await resolveFileFromEntry<
        {
          mdx: {
            metadata: {
              label?: string
              title?: string
            }
          }
        },
        'mdx'
      >(entry, 'mdx')
      const metadata = resolvedFile
        ? await resolvedFile.getExportValue('metadata')
        : undefined

      metadata?.label

      // @ts-expect-error
      resolvedFile?.getExportValue('nonexistent')
    }
  })

  test('query path with modifier and separate extensions', async () => {
    const fileSystem = new MemoryFileSystem({
      'Button.examples.tsx': ``,
      'useHover.examples.ts': ``,
    })
    const directory = new Directory({
      fileSystem,
    })
    const buttonExamples = await directory.getFile('Button.examples', [
      'ts',
      'tsx',
    ])
    const useHoverExamples = await directory.getFile('useHover.examples', [
      'ts',
      'tsx',
    ])

    expect(buttonExamples).toBeDefined()
    expect(useHoverExamples).toBeDefined()

    expect(buttonExamples.getBaseName()).toBe('Button')
    expect(buttonExamples.getModifierName()).toBe('examples')
    expect(buttonExamples.getExtension()).toBe('tsx')

    expect(useHoverExamples.getBaseName()).toBe('useHover')
    expect(useHoverExamples.getModifierName()).toBe('examples')
    expect(useHoverExamples.getExtension()).toBe('ts')
  })

  test('default export runtime value', async () => {
    const fileSystem = new MemoryFileSystem({
      'index.ts': `export default 123`,
    })
    const directory = new Directory({
      fileSystem,
      loader: {
        ts: withSchema<{ default: number }>(() =>
          Promise.resolve({ default: 123 })
        ),
      },
    })
    const file = await directory.getFile('index', 'ts')
    const defaultExport = await file.getExport('default')

    expect(await defaultExport.getRuntimeValue()).toBe(123)
  })

  describe('Package', () => {
    test('getExports returns directories for package exports', () => {
      const fileSystem = new MemoryFileSystem({
        'node_modules/acme/package.json': JSON.stringify({
          name: 'acme',
          exports: {
            '.': './dist/index.ts',
            './components': './dist/components/index.ts',
            './components/*': './dist/components/*.ts',
            './hooks/*': './dist/hooks/*.ts',
            './package.json': './package.json',
          },
        }),
        'node_modules/acme/src/index.ts': '',
        'node_modules/acme/src/components/Button.tsx': '',
        'node_modules/acme/src/hooks/useFoo.ts': '',
      })

      const pkg = new Package({ name: 'acme', fileSystem })
      const exports = pkg.getExports()

      expect(exports).toHaveLength(3)
      expect(exports.map((entry) => entry.getExportPath())).toEqual([
        '.',
        './components',
        './hooks/*',
      ])
      expect(exports[0]).toBeInstanceOf(Directory)
      expect(exports[0].getAbsolutePath()).toBe('/node_modules/acme/src')
      expect(exports[1].getAbsolutePath()).toBe(
        '/node_modules/acme/src/components'
      )
      expect(exports[2].getAbsolutePath()).toBe('/node_modules/acme/src/hooks')
    })

    test('supports export overrides and custom directories', () => {
      const fileSystem = new MemoryFileSystem({
        'node_modules/acme/package.json': JSON.stringify({
          name: 'acme',
          exports: {
            '.': './dist/index.ts',
          },
        }),
        'node_modules/acme/src/index.ts': '',
        'node_modules/acme/src/custom/Button.tsx': '',
        'node_modules/acme/docs/intro.mdx': '',
      })

      const pkg = new Package({
        name: 'acme',
        exports: {
          './components': {
            path: 'src/custom',
            basePathname: 'components',
          },
          './guides': {
            path: 'docs',
          },
        },
        fileSystem,
      })

      const exports = pkg.getExports()
      const exportPaths = exports.map((entry) => entry.getExportPath())

      expect(exportPaths).toContain('.')
      expect(exportPaths).toContain('./components')
      expect(exportPaths).toContain('./guides')

      const components = exports.find(
        (entry) => entry.getExportPath() === './components'
      )
      const guides = exports.find(
        (entry) => entry.getExportPath() === './guides'
      )

      expect(components?.getAbsolutePath()).toBe(
        '/node_modules/acme/src/custom'
      )
      expect(guides?.getAbsolutePath()).toBe('/node_modules/acme/docs')
    })

    test('accepts explicit path and null sourcePath', () => {
      const fileSystem = new MemoryFileSystem({
        'packages/local/package.json': JSON.stringify({ name: 'local' }),
        'packages/local/index.ts': '',
      })

      const pkg = new Package({
        path: 'packages/local',
        sourcePath: null,
        fileSystem,
      })

      const exports = pkg.getExports()

      expect(exports).toHaveLength(1)
      expect(exports[0].getExportPath()).toBe('.')
      expect(exports[0].getAbsolutePath()).toBe('/packages/local')
      expect(pkg.getName()).toBe('local')
    })

    test('prefers workspace packages before node_modules', () => {
      const getRootSpy = vi
        .spyOn(rootDirectoryModule, 'getRootDirectory')
        .mockReturnValue('.')

      try {
        const fileSystem = new MemoryFileSystem({
          'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
          'packages/ui/package.json': JSON.stringify({
            name: 'ui',
            exports: '.',
          }),
          'packages/ui/src/index.ts': '',
          'node_modules/ui/package.json': JSON.stringify({ name: 'ui' }),
          'node_modules/ui/src/index.ts': '',
        })

        const pkg = new Package({ name: 'ui', fileSystem })
        const exports = pkg.getExports()

        expect(exports).toHaveLength(1)
        expect(exports[0].getAbsolutePath()).toBe('/packages/ui/src')
      } finally {
        getRootSpy.mockRestore()
      }
    })

    test('finds nearest node_modules relative to directory path', () => {
      const getRootSpy = vi
        .spyOn(rootDirectoryModule, 'getRootDirectory')
        .mockReturnValue('.')

      try {
        const fileSystem = new MemoryFileSystem({
          'apps/site/node_modules/acme/package.json': JSON.stringify({
            name: 'acme',
          }),
          'apps/site/node_modules/acme/src/index.ts': '',
          'node_modules/acme/package.json': JSON.stringify({ name: 'acme' }),
          'node_modules/acme/src/index.ts': '',
        })

        const pkg = new Package({
          name: 'acme',
          fileSystem,
          directory: 'apps/site',
        })

        const exports = pkg.getExports()
        expect(exports[0].getAbsolutePath()).toBe(
          '/apps/site/node_modules/acme/src'
        )
      } finally {
        getRootSpy.mockRestore()
      }
    })

    test('accepts Directory instance as directory option', () => {
      const getRootSpy = vi
        .spyOn(rootDirectoryModule, 'getRootDirectory')
        .mockReturnValue('.')

      try {
        const fileSystem = new MemoryFileSystem({
          'apps/site/node_modules/acme/package.json': JSON.stringify({
            name: 'acme',
          }),
          'apps/site/node_modules/acme/src/index.ts': '',
          'node_modules/acme/package.json': JSON.stringify({ name: 'acme' }),
          'node_modules/acme/src/index.ts': '',
        })

        const directory = new Directory({ path: 'apps/site', fileSystem })

        const pkg = new Package({
          name: 'acme',
          fileSystem,
          directory,
        })

        const exports = pkg.getExports()
        expect(exports[0].getAbsolutePath()).toBe(
          '/apps/site/node_modules/acme/src'
        )
      } finally {
        getRootSpy.mockRestore()
      }
    })

    test('falls back to repository when available', () => {
      const remoteFs = new MemoryFileSystem({
        'package.json': JSON.stringify({ name: 'remote', exports: '.' }),
        'src/index.ts': '',
      })
      const gitHostSpy = vi
        .spyOn(gitHostFileSystemModule, 'GitHostFileSystem')
        .mockImplementation(function (this: any, options: any) {
          expect(options.repository).toBe('souporserious/remote')
          return remoteFs as unknown as gitHostFileSystemModule.GitHostFileSystem
        } as any)

      try {
        const pkg = new Package({
          name: 'remote',
          repository: 'souporserious/remote',
        })
        const exports = pkg.getExports()

        expect(exports).toHaveLength(1)
        expect(exports[0].getAbsolutePath()).toBe('/src')
        expect(exports[0].getRepository().toString()).toContain(
          'souporserious/remote'
        )
      } finally {
        gitHostSpy.mockRestore()
      }
    })

    test('exposes manifest analysis for exports and imports', () => {
      const fileSystem = new MemoryFileSystem({
        'node_modules/acme/package.json': JSON.stringify({
          name: 'acme',
          exports: {
            '.': {
              import: './dist/index.mjs',
              require: './dist/index.cjs',
            },
            './components/*': './dist/components/*.ts',
          },
          imports: {
            '#internal/*': './src/internal/*.ts',
            '#pkg': 'lodash',
          },
        }),
        'node_modules/acme/src/index.ts': '',
        'node_modules/acme/src/components/Button.tsx': '',
        'node_modules/acme/src/internal/foo.ts': '',
      })

      const pkg = new Package({ name: 'acme', fileSystem })
      const exports = pkg.getExports()
      const imports = pkg.getImports()

      const rootExport = exports.find((entry) => entry.getExportPath() === '.')
      const componentsExport = exports.find(
        (entry) => entry.getExportPath() === './components/*'
      )
      const internalImport = imports.find(
        (entry) => entry.getImportPath() === '#internal/*'
      )
      const pkgImport = imports.find(
        (entry) => entry.getImportPath() === '#pkg'
      )

      expect(rootExport?.getAnalysis()?.manifestTarget?.kind).toBe('conditions')
      expect(rootExport?.getAnalysis()?.derivedAbsolutePath).toBe(
        '/node_modules/acme/src'
      )
      expect(componentsExport?.getAnalysis()?.manifestTarget?.kind).toBe('path')
      expect(
        (componentsExport?.getAnalysis()?.manifestTarget as any)?.absolutePath
      ).toBe('/node_modules/acme/dist/components/*.ts')

      expect(imports).toHaveLength(2)
      expect(internalImport?.getAnalysis()?.manifestTarget?.kind).toBe('path')
      expect(pkgImport?.getAnalysis()?.manifestTarget?.kind).toBe('specifier')
      expect(pkgImport?.getAnalysis()?.manifestTarget).toEqual({
        kind: 'specifier',
        specifier: 'lodash',
      })
    })

    test('analyzes exports from a local workspace package', async () => {
      const pkg = new Package({ name: '@renoun/mdx' })
      const addHeadingsEntry = await pkg.getExport('remark/add-headings')

      expect(isJavaScriptFile(addHeadingsEntry)).toBe(true)

      if (!isJavaScriptFile(addHeadingsEntry)) {
        throw new Error('Expected JavaScript file for MDX plugin export')
      }

      const addHeadingsExport = await addHeadingsEntry.getExport('default')
      const type = await addHeadingsExport.getType()

      expect(type).toBeDefined()
      expect(type!.kind).toBeDefined()
    })

    const expectRemarkAddHeadingsRuntime = async (
      addHeadingsEntry: JavaScriptFile<any, any, any, any>
    ) => {
      expect(isJavaScriptFile(addHeadingsEntry)).toBe(true)

      if (!isJavaScriptFile(addHeadingsEntry)) {
        throw new Error('Expected JavaScript file for MDX plugin export')
      }

      const addHeadingsExport = await addHeadingsEntry.getExport('default')
      const addHeadings = await addHeadingsExport.getRuntimeValue()

      expect(typeof addHeadings).toBe('function')

      const processor = {
        data(key: string) {
          if (key === 'isMarkdown') {
            return true
          }
          return undefined
        },
      }

      const transformer = addHeadings.call(processor, {
        allowGetHeadings: true,
      })
      const file = {
        message: vi.fn(() => ({ fatal: false })),
      }
      type TestRoot = {
        type: 'root'
        children: {
          type: 'heading'
          depth: number
          children: { type: 'text'; value: string }[]
          data?: { hProperties?: { id?: string } }
        }[]
      }
      const tree: TestRoot = {
        type: 'root',
        children: [
          {
            type: 'heading',
            depth: 1,
            children: [{ type: 'text', value: 'Hello World' }],
          },
        ],
      }

      await Promise.resolve(transformer(tree as any, file as any))

      expect(tree.children[0]?.data?.hProperties?.id).toBe('hello-world')
      expect(file.message).not.toHaveBeenCalled()
    }

    test('executes runtime value from package export using explicit loader map', async () => {
      const loader = vi.fn<
        () => Promise<typeof import('@renoun/mdx/remark/add-headings')>
      >(() => import('@renoun/mdx/remark/add-headings'))
      const pkg = new Package({
        name: '@renoun/mdx',
        loader: {
          'remark/add-headings': loader,
        },
      })
      const addHeadingsEntry = await pkg.getExport('remark/add-headings')
      const defaultExport = await addHeadingsEntry.getExport('default')

      type Test = Expect<IsNotAny<typeof defaultExport>>

      expectTypeOf(defaultExport).toExtend<
        ModuleExport<
          (typeof import('@renoun/mdx/remark/add-headings'))['default']
        >
      >()

      await expectRemarkAddHeadingsRuntime(addHeadingsEntry)
      expect(loader).toHaveBeenCalledWith('/remark/add-headings')
    })

    test('executes runtime value from package export using package loader resolver', async () => {
      const loader = vi.fn<(path: string) => Promise<any>>(
        (path) => import(`@renoun/mdx${path}`)
      )
      const pkg = new Package({
        name: '@renoun/mdx',
        loader,
      })
      const addHeadingsEntry = await pkg.getExport<
        typeof import('@renoun/mdx/remark/add-headings')
      >('remark/add-headings')
      const defaultExport = await addHeadingsEntry.getExport('default')

      type Test = Expect<IsNotAny<typeof defaultExport>>

      expectTypeOf(defaultExport).toExtend<
        ModuleExport<
          (typeof import('@renoun/mdx/remark/add-headings'))['default']
        >
      >()

      await expectRemarkAddHeadingsRuntime(addHeadingsEntry)
      expect(loader).toHaveBeenCalledWith('/remark/add-headings')
    })
  })

  test('throws when repository is not configured', () => {
    const directory = new Directory()
    expect(() => directory.getRepository()).toThrowError(
      /Git repository is not configured/
    )
  })

  test('allows passing repository to link methods', async () => {
    const fileSystem = new MemoryFileSystem({ 'foo.ts': '' })
    const directory = new Directory({ fileSystem })
    const file = await directory.getFile('foo', 'ts')

    expect(file.getSourceUrl({ repository: 'github:owner/repo@main' })).toBe(
      'https://github.com/owner/repo/blob/main/foo.ts'
    )
  })

  describe('Workspace', () => {
    test('exposes workspace metadata', () => {
      const fileSystem = new MemoryFileSystem({
        'pnpm-workspace.yaml': 'packages:\n  - packages/*',
        'pnpm-lock.yaml': '',
        'packages/foo/package.json': JSON.stringify({ name: 'foo' }),
        'packages/bar/package.json': JSON.stringify({ name: 'bar' }),
      })

      const workspace = new Workspace({ fileSystem, rootDirectory: '.' })

      expect(workspace.hasWorkspaces()).toBe(true)
      expect(workspace.getPackageManager()).toBe('pnpm')

      const packages = workspace.getPackages()
      const packageNames = packages
        .map((pkg) => pkg.getName())
        .filter((name): name is string => Boolean(name))

      expect(packageNames.sort()).toEqual(['bar', 'foo'])
      expect(workspace.getPackage('bar')?.getName()).toBe('bar')
    })
  })

  describe('getStructure', () => {
    test('workspace uses root package.json name', async () => {
      const fileSystem = new MemoryFileSystem({
        'package.json': JSON.stringify({ name: 'acme' }),
      })

      const workspace = new Workspace({
        fileSystem,
        rootDirectory: '.',
      })

      const structures = await workspace.getStructure()
      expect(structures[0]).toMatchObject({
        type: 'workspace',
        name: 'acme',
        slug: 'acme',
      })
    })

    test('directory yields directory and file entries with metadata', async () => {
      const fileSystem = new MemoryFileSystem({
        'docs/index.md': [
          '---',
          'description: Hello Docs',
          '---',
          '# Title',
          '',
        ].join('\n'),
      })
      const directory = new Directory({
        fileSystem,
        path: 'docs',
        basePathname: null,
      })
      const structures = await directory.getStructure()

      expect(structures.map((entry) => entry.type)).toEqual([
        'directory',
        'file',
      ])

      const fileEntry = structures[1] as FileStructure
      expect(fileEntry.relativePath).toBe('docs/index.md')
      expect(fileEntry.extension).toBe('md')
      expect(fileEntry.description).toBe('Hello Docs')
    })

    test('markdown file includes front matter and description', async () => {
      const fileSystem = new MemoryFileSystem({
        'docs/page.md': [
          '---',
          'description: Page Desc',
          '---',
          '# Heading',
        ].join('\n'),
      })
      const directory = new Directory({
        path: 'docs',
        fileSystem,
      })
      const file = await directory.getFile('page')
      const structure = await file.getStructure()

      expect(structure.type).toBe('file')
      expect(structure.frontMatter?.description).toBe('Page Desc')
      expect(structure.description).toBe('Page Desc')
      expect(structure.relativePath).toBe('docs/page.md')
    })
  })
})
