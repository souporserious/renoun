import { createCollection, type MDXContent } from 'mdxts/collections'

type FrontMatter = {
  title: string
  date: Date
  summary?: string
  tags?: any
}

export const PostsCollection = createCollection<{
  default: MDXContent
  frontmatter: FrontMatter
}>('posts/*.mdx', {
  baseDirectory: 'posts',
  sort: async (a, b) => {
    if (a.isDirectory() || b.isDirectory()) {
      return 0
    }

    const aDate = await a
      .getNamedExport('frontmatter')
      .getValue()
      .then((frontMatter) => new Date(frontMatter.date))
    const bDate = await b
      .getNamedExport('frontmatter')
      .getValue()
      .then((frontMatter) => new Date(frontMatter.date))

    return bDate.getTime() - aDate.getTime()
  },
})
