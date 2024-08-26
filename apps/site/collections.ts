import { createCollection, type FileSystemSource } from 'mdxts/collections'

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
