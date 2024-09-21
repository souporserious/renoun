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

export const DocsCollection = createCollection<DocsSchema>('docs/**/*.mdx', {
  baseDirectory: 'docs',
  basePath: 'docs',
})

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
  'src/collections/*.tsx',
  {
    baseDirectory: 'collections',
    basePath: 'collections',
    filter: filterInternalSources,
    tsConfigFilePath: '../../packages/renoun/tsconfig.json',
  }
)

type ComponentSchema = Record<string, React.ComponentType>

export type ComponentSource = FileSystemSource<ComponentSchema>

export const ComponentsCollection = createCollection<ComponentSchema>(
  'src/components/**/*.{ts,tsx}',
  {
    baseDirectory: 'components',
    basePath: 'components',
    filter: filterInternalSources,
    tsConfigFilePath: '../../packages/renoun/tsconfig.json',
  }
)

export const ComponentsMDXCollection = createCollection<{
  default: MDXContent
}>('src/components/**/*.mdx', {
  baseDirectory: 'components',
  basePath: 'components',
  tsConfigFilePath: '../../packages/renoun/tsconfig.json',
})
