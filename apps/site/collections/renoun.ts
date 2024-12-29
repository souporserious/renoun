import { Directory, isDirectory, isFile, withSchema } from 'renoun/file-system'
import { z } from 'zod'

export const CollectionsCollection = new Directory({
  path: '../../packages/renoun/src/collections',
  basePath: 'collections',
})

const collectionSchema = {
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
}

export const CollectionsDocsCollection = new Directory({
  path: '../../packages/renoun/src/collections/docs',
  basePath: 'collections',
  loaders: {
    mdx: withSchema(collectionSchema, (path) => {
      return import(`../../../packages/renoun/src/collections/docs/${path}.mdx`)
    }),
  },
  include: (entry) => isFile(entry, 'mdx'),
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
      collectionSchema,
      (path) => import(`../../../packages/renoun/src/components/${path}.mdx`)
    ),
  },
  include: async (entry) => {
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
  },
})
