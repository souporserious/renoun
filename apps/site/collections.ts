import {
  collection,
  isExportSource,
  isFileSystemSource,
  type FileSystemSource,
  type ExportSource,
  type MDXContent,
} from 'renoun/collections'
import type { Headings } from 'renoun/mdx'
import { z } from 'zod'

type DocsSchema = {
  default: MDXContent
  headings: Headings
  metadata: {
    title: string
    description: string
  }
}

export type DocsSource = FileSystemSource<DocsSchema>

export const DocsCollection = collection<DocsSchema>(
  {
    filePattern: 'docs/**/*.mdx',
    baseDirectory: 'docs',
    basePath: 'docs',
  },
  (slug) => import(`./docs/${slug}.mdx`)
)

export const GuidesCollection = collection<DocsSchema>(
  {
    filePattern: 'guides/**/*.mdx',
    baseDirectory: 'guides',
    basePath: 'guides',
  },
  (slug) => import(`./guides/${slug}.mdx`)
)

function filterInternalSources(
  source: ExportSource<any> | FileSystemSource<ComponentSchema>
) {
  if (isFileSystemSource(source)) {
    if (source.isFile()) {
      const allInternal = source
        .getExports()
        .every((exportSource) =>
          exportSource.getTags()?.every((tag) => tag.tagName === 'internal')
        )

      if (allInternal) {
        return false
      }
    }
  }

  if (isExportSource(source)) {
    if (source.getTags()?.find((tag) => tag.tagName === 'internal')) {
      return false
    }
  }

  return true
}

type CollectionsSchema = Record<string, React.ComponentType>

export type CollectionsSource = FileSystemSource<CollectionsSchema>

export const CollectionsCollection = collection<CollectionsSchema>(
  {
    filePattern: 'src/collections/*.tsx',
    baseDirectory: 'collections',
    basePath: 'collections',
    filter: filterInternalSources,
    tsConfigFilePath: '../../packages/renoun/tsconfig.json',
  },
  (slug) => import(`../../packages/renoun/src/collections/${slug}.tsx`)
)

const metadataSchema = z.object({
  title: z.string(),
  description: z.string(),
})

type CollectionsDocsSchema = {
  default: MDXContent
  metadata: z.infer<typeof metadataSchema>
  headings: Headings
}

export const CollectionsDocsCollection = collection<CollectionsDocsSchema>(
  {
    filePattern: 'src/collections/docs/*.mdx',
    baseDirectory: 'src/collections/docs',
    basePath: 'collections',
    schema: {
      metadata: metadataSchema.parse,
    },
    tsConfigFilePath: '../../packages/renoun/tsconfig.json',
  },
  (slug) => import(`../../packages/renoun/src/collections/docs/${slug}.mdx`)
)

type ComponentSchema = Record<string, React.ComponentType>

export type ComponentSource = FileSystemSource<ComponentSchema>

export const ComponentsCollection = collection<ComponentSchema>(
  {
    filePattern: 'src/components/**/*.{ts,tsx}',
    baseDirectory: 'components',
    basePath: 'components',
    filter: filterInternalSources,
    tsConfigFilePath: '../../packages/renoun/tsconfig.json',
  },
  [
    (slug) => import(`../../packages/renoun/src/components/${slug}.ts`),
    (slug) => import(`../../packages/renoun/src/components/${slug}.tsx`),
  ]
)

export const ComponentsMDXCollection = collection<{
  default: MDXContent
  headings: Headings
}>(
  {
    filePattern: 'src/components/**/*.mdx',
    baseDirectory: 'components',
    basePath: 'components',
    tsConfigFilePath: '../../packages/renoun/tsconfig.json',
  },
  (slug) => import(`../../packages/renoun/src/components/${slug}.mdx`)
)
