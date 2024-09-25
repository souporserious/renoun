import { createCollection, type MDXContent } from 'renoun/collections'
import { z } from 'zod'

const frontmatterSchema = z.object({
  title: z.string(),
  date: z.coerce.date(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

export const PostsCollection = createCollection<{
  default: MDXContent
  frontmatter: z.infer<typeof frontmatterSchema>
}>(
  {
    filePattern: 'posts/*.mdx',
    baseDirectory: 'posts',
    schema: {
      frontmatter: frontmatterSchema.parse,
    },
    sort: async (a, b) => {
      if (a.isDirectory() || b.isDirectory()) {
        return 0
      }

      const aFrontmatter = await a.getNamedExport('frontmatter').getValue()
      const bFrontmatter = await b.getNamedExport('frontmatter').getValue()

      return bFrontmatter.date.getTime() - aFrontmatter.date.getTime()
    },
  },
  (slug) => import(`./posts/${slug}.mdx`)
)
