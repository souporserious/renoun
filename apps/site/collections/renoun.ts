import {
  Directory,
  isDirectory,
  isFile,
  withSchema,
  type FileSystemEntry,
  type Headings,
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
    return !allInternal
  }

  if (isDirectory(entry)) {
    const children = await entry.getEntries({
      includeDirectoryNamedFiles: true,
      includeIndexAndReadmeFiles: true,
      includeTsConfigExcludedFiles: true,
    })
    for (const child of children) {
      if (isFile(child, ['ts', 'tsx'])) {
        const fileExports = await child.getExports()
        const allTags = await Promise.all(
          fileExports.map((exportSource) => exportSource.getTags())
        )
        const allInternal = fileExports.every((_, index) => {
          const tags = allTags[index]
          return tags?.every((tag) => tag.name === 'internal')
        })
        if (!allInternal) return true
      }
    }
    return false
  }

  return isFile(entry, 'mdx')
}

export const FileSystemDirectory = new Directory({
  path: '../../packages/renoun/src/file-system',
  basePathname: 'utilities',
  loader: {
    mdx: withSchema<{
      headings: Headings
    }>(
      (path) => import(`../../../packages/renoun/src/file-system/${path}.mdx`)
    ),
  },
  filter: filterInternalExports,
})

type ComponentSchema = Record<string, React.ComponentType>

export const ComponentsDirectory = new Directory({
  path: '../../packages/renoun/src/components',
  repository: 'souporserious/renoun',
  loader: {
    ts: withSchema<ComponentSchema>(
      (path) =>
        import(
          /* webpackExclude: /\.test\.ts$/ */
          `../../../packages/renoun/src/components/${path}.ts`
        )
    ),
    tsx: withSchema<ComponentSchema>(
      (path) =>
        import(
          /* webpackExclude: /\.test\.tsx$/ */
          `../../../packages/renoun/src/components/${path}.tsx`
        )
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
  filter: filterInternalExports,
})

type HookSchema = Record<string, unknown>

export const HooksDirectory = new Directory({
  path: '../../packages/renoun/src/hooks',
  loader: {
    ts: withSchema<HookSchema>(
      (path) =>
        import(
          /* webpackExclude: /\.test\.ts$/ */
          `../../../packages/renoun/src/hooks/${path}.ts`
        )
    ),
    tsx: withSchema<HookSchema>(
      (path) =>
        import(
          /* webpackExclude: /\.test\.tsx$/ */
          `../../../packages/renoun/src/hooks/${path}.tsx`
        )
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
  filter: filterInternalExports,
})
