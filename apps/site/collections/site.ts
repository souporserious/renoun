import { Directory, isFile, type FileSystemEntry } from 'renoun/file-system'
import type { MDXContent, Headings } from 'renoun/mdx'

interface DocsSchema {
  default: MDXContent
  headings: Headings
  metadata: {
    title: string
    label?: string
    description: string
    tags?: string[]
  }
}

export type DocsEntry = FileSystemEntry<DocsSchema>

export const DocsCollection = new Directory<{ mdx: DocsSchema }>({
  path: 'docs',
  basePath: 'docs',
})
  .withModule((path) => import(`@/docs/${path}`))
  .withFilter((entry) => isFile(entry, 'mdx'))

export const GuidesCollection = new Directory<{ mdx: DocsSchema }>({
  path: 'guides',
  basePath: 'guides',
})
  .withModule((path) => import(`@/guides/${path}`))
  .withFilter((entry) => isFile(entry, 'mdx'))
