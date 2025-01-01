import {
  Directory,
  isDirectory,
  isFile,
  withSchema,
  type FileSystemEntry,
} from 'renoun/file-system'
import { z } from 'zod'

async function filterInternalExports(entry: FileSystemEntry<any>) {
  if (isFile(entry, ['ts', 'tsx'])) {
    const fileExports = await entry.getExports()
    const allTags = await Promise.all(
      fileExports.map((exportSource) => exportSource.getTags())
    )
    const allInternal = fileExports.every((_, index) => {
      const tags = allTags[index]
      return tags?.every((tag) => tag.tagName === 'internal')
    })

    if (allInternal) {
      return false
    }

    return true
  }

  return isDirectory(entry) || isFile(entry, 'mdx')
}

export const FileSystemCollection = new Directory({
  path: '../../packages/renoun/src/file-system',
  tsConfigPath: '../../packages/renoun/tsconfig.json',
  basePath: 'utilities',
  loaders: {
    mdx: withSchema(
      (path) => import(`../../../packages/renoun/src/file-system/${path}.mdx`)
    ),
  },
  include: filterInternalExports,
})

type ComponentSchema = Record<string, React.ComponentType>

export const ComponentsCollection = new Directory({
  path: '../../packages/renoun/src/components',
  tsConfigPath: '../../packages/renoun/tsconfig.json',
  basePath: 'components',
  loaders: {
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
            text: z.string(),
            depth: z.number(),
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
