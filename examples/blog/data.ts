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
  sort: (a, b) => {
    return b.frontMatter.date.getTime() - a.frontMatter.date.getTime()
  },
})
