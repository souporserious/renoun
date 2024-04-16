import { createSource } from 'mdxts'

export const posts = createSource<{
  frontMatter: {
    title: string
    date: Date
    summary: string
    tags?: string[]
  }
}>('./*.mdx', {
  baseDirectory: 'app',
})
