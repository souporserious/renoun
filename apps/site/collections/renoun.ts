import {
  Directory,
  isDirectory,
  isFile,
  type FileSystemEntry,
} from 'renoun/file-system'
import type { MDXContent, Headings } from 'renoun/mdx'
import { z } from 'zod'

function getRenounImport(path: string) {
  return import(`../../../packages/renoun/src/${path}`)
}

type CollectionsSchema = Record<string, React.ComponentType>

export const CollectionsCollection = new Directory<{ tsx: CollectionsSchema }>(
  '../../packages/renoun/src/collections'
)
  .withBasePath('collections')
  .withFilter((entry) => isFile(entry, 'tsx'))

const metadataSchema = z.object({
  title: z.string(),
  description: z.string(),
})

type CollectionsDocsSchema = {
  default: MDXContent
  metadata: z.infer<typeof metadataSchema>
  headings: Headings
}

export const CollectionsDocsCollection = new Directory<{
  mdx: CollectionsDocsSchema
}>('../../packages/renoun/src/collections/docs')
  .withBasePath('collections')
  .withSchema('mdx', { metadata: metadataSchema.parse })
  .withModule((path) => getRenounImport(`collections/docs/${path}`))
  .withFilter((entry) => isFile(entry, 'mdx'))

type ComponentSchema = Record<string, React.ComponentType>

type ComponentTypes = {
  ts: ComponentSchema
  tsx: ComponentSchema
}

export type ComponentSource = FileSystemEntry<ComponentTypes>

export const ComponentsCollection = new Directory<
  ComponentTypes & {
    mdx: {
      default: MDXContent
      headings: Headings
    }
  }
>({
  path: '../../packages/renoun/src/components',
  tsConfigPath: '../../packages/renoun/tsconfig.json',
})
  .withBasePath('components')
  .withModule((path) => getRenounImport(`components/${path}`))
  .withFilter(async (entry) => {
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
  })
