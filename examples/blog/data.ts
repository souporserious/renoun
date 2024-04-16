import { createSource } from 'mdxts'

export const allPosts = createSource<{
  frontMatter: {
    title: string
    date: Date
    summary?: string
    tags?: any
  }
}>('posts/*.mdx', {
  baseDirectory: 'posts',
})
