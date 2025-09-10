import {
  Directory,
  isDirectory,
  isFile,
  withSchema,
  type FileSystemEntry,
  type MDXHeadings,
} from 'renoun'
import { z } from 'zod'

async function filterInternalExports(entry: FileSystemEntry<any>) {
  if (isFile(entry, ['ts', 'tsx'])) {
    const fileExports = await entry.getExports()
    const allTags = await Promise.all(
      fileExports.map((exportSource) => exportSource.getTags())
    )
    const allInternal = fileExports.every((_, index) => {
      const tags = allTags[index]
      return tags?.every((tag) => tag.name === 'internal')
    })

    if (allInternal) {
      return false
    }

    return true
  }

  // Only include directories that have a representative TS/TSX file
  if (isDirectory(entry)) {
    const children = await entry.getEntries({
      includeDirectoryNamedFiles: true,
      includeIndexAndReadmeFiles: true,
    })
    const baseName = entry.getBaseName().toLowerCase()
    for (const child of children) {
      if (isFile(child, ['ts', 'tsx'])) {
        const childBaseName = child.getBaseName().toLowerCase()
        if (
          childBaseName === baseName ||
          childBaseName === 'index' ||
          childBaseName === 'readme'
        ) {
          return true
        }
      }
    }
    return false
  }

  return isFile(entry, 'mdx')
}

export const FileSystemDirectory = new Directory({
  path: '../../packages/renoun/src/file-system',
  basePathname: 'utilities',
  repository: {
    baseUrl: 'https://github.com/souporserious/renoun',
    provider: 'github',
  },
  loader: {
    mdx: withSchema<{
      headings: MDXHeadings
    }>(
      (path) => import(`../../../packages/renoun/src/file-system/${path}.mdx`)
    ),
  },
  include: filterInternalExports,
})

type ComponentSchema = Record<string, React.ComponentType>

export const ComponentsDirectory = new Directory({
  path: '../../packages/renoun/src/components',
  repository: {
    baseUrl: 'https://github.com/souporserious/renoun',
    provider: 'github',
  },
  loader: {
    ts: withSchema<ComponentSchema>(
      (path) => import(`../../../packages/renoun/src/components/${path}.ts`)
    ),
    tsx: withSchema<ComponentSchema>(
      (path) => import(`../../../packages/renoun/src/components/${path}.tsx`)
    ),
    mdx: withSchema(
      {
        headings: z.array(
          z.object({
            id: z.string(),
            level: z.number(),
            children: z.custom<NonNullable<React.ReactNode>>(),
            text: z.string(),
          })
        ),
        metadata: z.object({
          title: z.string(),
          description: z.string(),
        }),
      },
      (path) => import(`../../../packages/renoun/src/components/${path}.mdx`)
    ),
  },
  include: filterInternalExports,
})

type HookSchema = Record<string, unknown>

export const HooksDirectory = new Directory({
  path: '../../packages/renoun/src/hooks',
  repository: {
    baseUrl: 'https://github.com/souporserious/renoun',
    provider: 'github',
  },
  loader: {
    ts: withSchema<HookSchema>(
      (path) => import(`../../../packages/renoun/src/hooks/${path}.ts`)
    ),
    tsx: withSchema<HookSchema>(
      (path) => import(`../../../packages/renoun/src/hooks/${path}.tsx`)
    ),
    mdx: withSchema(
      {
        headings: z.array(
          z.object({
            id: z.string(),
            level: z.number(),
            children: z.custom<NonNullable<React.ReactNode>>(),
            text: z.string(),
          })
        ),
        metadata: z.object({
          title: z.string(),
          description: z.string(),
        }),
      },
      (path) => import(`../../../packages/renoun/src/hooks/${path}.mdx`)
    ),
  },
  include: filterInternalExports,
})
