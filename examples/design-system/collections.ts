import { createCollection, type FileSystemSource } from 'renoun/collections'

type ComponentSchema = Record<string, React.ComponentType>

export type ComponentSource = FileSystemSource<ComponentSchema>

export const ComponentsCollection = createCollection<ComponentSchema>(
  '@/components/**/{index,*.examples,examples/*}.{ts,tsx}',
  {
    baseDirectory: 'components',
    basePath: 'components',
  }
)
