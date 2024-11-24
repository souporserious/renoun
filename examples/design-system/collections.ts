import { Directory, type FileSystemEntry } from 'renoun/file-system'
import type { MDXContent } from 'renoun/mdx'

interface ComponentSchema {
  [exportName: string]: React.ComponentType
}

export type ComponentEntry = FileSystemEntry<ComponentSchema>

export const ComponentsCollection = new Directory<{
  mdx: { default: MDXContent }
}>({
  path: 'components',
  basePath: 'components',
}).withModule((path) => import(`./components/${path}`))
