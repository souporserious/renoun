import {
  collection,
  isExportSource,
  isFileSystemSource,
  type FileSystemSource,
  type ExportSource,
  type MDXContent,
} from 'renoun/collections'
import type { Headings } from '@renoun/mdx'

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
