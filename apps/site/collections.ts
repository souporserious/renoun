import {
  createCollection,
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

export const DocsCollection = createCollection<DocsSchema>(
  {
    baseDirectory: 'docs',
    basePath: 'docs',
    importMap: [(slug) => import(`docs/${slug}.mdx`)],
    filePattern: 'docs/**/*.mdx'
  },
  (slug) => import(`docs/${slug}`)
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

export const CollectionsCollection = createCollection<CollectionsSchema>(

  {
    baseDirectory: 'collections',
    basePath: 'collections',
    filter: filterInternalSources,
    tsConfigFilePath: '../../packages/renoun/tsconfig.json',
    importMap: [
      (slug) => import(`../../packages/renoun/src/collections/${slug}.tsx`),
    ],
    filePattern: 'src/collections/*.tsx'
  },
  (slug) => import(`../../packages/renoun/src/collections/${slug}`)

)

type ComponentSchema = Record<string, React.ComponentType>

export type ComponentSource = FileSystemSource<ComponentSchema>

export const ComponentsCollection = createCollection<ComponentSchema>(

  {
    baseDirectory: 'components',
    basePath: 'components',
    filter: filterInternalSources,
    tsConfigFilePath: '../../packages/renoun/tsconfig.json',
    importMap: [
      (slug) => import(`../../packages/renoun/src/components/${slug}.ts`),
      (slug) => import(`../../packages/renoun/src/components/${slug}.tsx`),
    ],
    filePattern: 'src/components/**/*.{ts,tsx}'
  },
  (slug) => import(`../../packages/renoun/src/components/${slug}`)

)

export const ComponentsMDXCollection = createCollection<{
  default: MDXContent
  headings: Headings
}>(
  {
    baseDirectory: 'components',
    basePath: 'components',
    tsConfigFilePath: '../../packages/renoun/tsconfig.json',
    importMap: [
      (slug) => import(`../../packages/renoun/src/components/${slug}.mdx`),
    ],
    filePattern: 'src/components/**/*.mdx'
  },
  (slug) => import(`../../packages/renoun/src/components/${slug}`)
)
