import {
  Directory,
  isDirectory,
  isFile,
  type FileSystemEntry,
} from 'renoun/file-system'
import type { MDXContent, Headings } from 'renoun/mdx'
import { z } from 'zod'

// function filterInternalSources(
//   source: ExportSource<any> | FileSystemSource<ComponentSchema>
// ) {
//   if (isFileSystemSource(source)) {
//     if (source.isFile()) {
//       const allInternal = source
//         .getExports()
//         .every((exportSource) =>
//           exportSource.getTags()?.every((tag) => tag.tagName === 'internal')
//         )

//       if (allInternal) {
//         return false
//       }
//     }
//   }

//   if (isExportSource(source)) {
//     if (source.getTags()?.find((tag) => tag.tagName === 'internal')) {
//       return false
//     }
//   }

//   return true
// }

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
  .withFilter(
    (entry) => isDirectory(entry) || isFile(entry, ['mdx', 'ts', 'tsx'])
  )
