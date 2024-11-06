import { describe, test, expect, expectTypeOf } from 'vitest'

import {
  Collection,
  isFile,
  File,
  JavaScriptFile,
  type FileSystemEntry,
} from './index'

describe('collections', () => {
  test('returns generic file', async () => {
    const RootCollection = new Collection({ fileExtensions: ['json'] })
    const file = await RootCollection.getFile('tsconfig', 'json')

    expectTypeOf(file!).toMatchTypeOf<File>()
    expect(file!).toBeInstanceOf(File)
  })

  test('returns javascript file', async () => {
    const ProjectCollection = new Collection({
      fileExtensions: ['ts'],
      baseDirectory: 'src/project',
    })
    const file = await ProjectCollection.getFile('server', 'ts')

    expect(file!).toBeInstanceOf(JavaScriptFile)
    expectTypeOf(file!).toMatchTypeOf<JavaScriptFile<any>>()
  })

  test.skip('getRuntimeValue is only typed when getModule is defined', async () => {
    const ProjectCollection = new Collection({
      fileExtensions: ['ts', 'tsx'],
      baseDirectory: 'src/project',
      tsConfigFilePath: 'tsconfig.json',
      getModule: (path) => import(`../project/${path}`),
    })
    const file = await ProjectCollection.getFile('server', 'ts')
    const fileExports = await file!.getExports()
  })

  test('uses collection file extensions when no file extension present', async () => {
    const ProjectCollection = new Collection({
      fileExtensions: ['ts'],
      baseDirectory: 'src/project',
    })
    const file = await ProjectCollection.getFile('server')

    expect(file).toBeDefined()
  })

  test('generating sibling navigation from file', async () => {
    const ProjectCollection = new Collection({
      fileExtensions: ['ts'],
      baseDirectory: 'src/project',
    })
    const file = await ProjectCollection.getFile('server', 'ts')
    const [previousEntry, nextEntry] = await file!.getSiblings()

    expect(previousEntry?.getName()).toBe('rpc')
    expect(nextEntry?.getName()).toBe('types')
  })

  test('generating tree navigation', async () => {
    const ComponentsCollection = new Collection<{ ts: object; tsx: object }>({
      fileExtensions: ['ts', 'tsx'],
      baseDirectory: 'src/project',
      tsConfigFilePath: 'tsconfig.json',
      getModule: (path) => import(`./components/${path}`),
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

    const sources = await ComponentsCollection.getEntries()
    const tree = await Promise.all(sources.map(buildTreeNavigation))

    expect(tree).toMatchInlineSnapshot(`
      [
        {
          "name": "client",
          "path": "client.ts",
        },
        {
          "name": "get-project",
          "path": "get-project.ts",
        },
        {
          "name": "refresh",
          "path": "refresh.ts",
        },
        {
          "children": [
            {
              "name": "client",
              "path": "rpc/client.ts",
            },
            {
              "name": "server",
              "path": "rpc/server.ts",
            },
          ],
          "name": "rpc",
          "path": "rpc",
        },
        {
          "name": "server",
          "path": "server.ts",
        },
        {
          "name": "types",
          "path": "types.ts",
        },
      ]
    `)
  })
})
