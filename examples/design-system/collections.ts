import { Collection, type FileSystemSource } from 'renoun/collections'

type ComponentSchema = Record<string, React.ComponentType>

export type ComponentSource = FileSystemSource<ComponentSchema>

export const ComponentsCollection = new Collection<ComponentSchema>(
  {
    filePattern: '**/{index,*.examples,examples/*}.{ts,tsx}',
    baseDirectory: 'components',
    basePath: 'components',
  },
  [
    (slug) => import(`./components/${slug}.ts`),
    (slug) => import(`./components/${slug}.tsx`),
  ]
)
