import { createCollection, type FileSystemSource } from 'mdxts/collections'

type CollectionsSchema = Record<string, React.ComponentType>

export type CollectionsSource = FileSystemSource<CollectionsSchema>

export const CollectionsCollection = createCollection<CollectionsSchema>(
  'src/collections/**/*.{ts,tsx}',
  {
    baseDirectory: 'collections',
    basePath: 'collections',
    tsConfigFilePath: '../../packages/mdxts/tsconfig.json',
  }
)

type ComponentSchema = Record<string, React.ComponentType>

export type ComponentSource = FileSystemSource<ComponentSchema>

export const ComponentsCollection = createCollection<ComponentSchema>(
  'src/components/**/*.{ts,tsx}',
  {
    baseDirectory: 'components',
    basePath: 'components',
    tsConfigFilePath: '../../packages/mdxts/tsconfig.json',
  }
)
