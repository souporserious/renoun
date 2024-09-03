import { createCollection, type FileSystemSource } from 'omnidoc/collections'

type CollectionsSchema = Record<string, React.ComponentType>

export type CollectionsSource = FileSystemSource<CollectionsSchema>

export const CollectionsCollection = createCollection<CollectionsSchema>(
  'src/collections/**/*.{ts,tsx}',
  {
    baseDirectory: 'collections',
    basePath: 'collections',
    tsConfigFilePath: '../../packages/omnidoc/tsconfig.json',
  }
)

type ComponentSchema = Record<string, React.ComponentType>

export type ComponentSource = FileSystemSource<ComponentSchema>

export const ComponentsCollection = createCollection<ComponentSchema>(
  'src/components/**/*.{ts,tsx}',
  {
    baseDirectory: 'components',
    basePath: 'components',
    filter: (source) => {
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
      return true
    },
    tsConfigFilePath: '../../packages/omnidoc/tsconfig.json',
  }
)
