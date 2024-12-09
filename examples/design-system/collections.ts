import { Directory, type FileSystemEntry } from 'renoun/file-system'
import type { MDXContent } from 'renoun/mdx'

interface ComponentTypes {
  tsx: { [exportName: string]: React.ComponentType }
  mdx: { default: MDXContent }
}

export type ComponentEntry = FileSystemEntry<ComponentTypes>

export const ComponentsCollection = new Directory<ComponentTypes>({
  path: 'components',
  pathCasing: 'kebab',
})
  .withBasePath('components')
  .withModule((path) => import(`./components/${path}`))
