import { Directory, withSchema } from 'renoun/file-system'
import { z } from 'zod'

export const posts = new Directory({
  path: 'posts',
  include: '*.mdx',
  loaders: {
    mdx: withSchema(
      {
        frontmatter: z.object({
          title: z.string(),
          date: z.coerce.date(),
          summary: z.string().optional(),
          tags: z.array(z.string()).optional(),
        }),
      },
      (path) => import(`./posts/${path}.mdx`)
    ),
  },
  sort: async (a, b) => {
    const aFrontmatter = await a.getExportValue('frontmatter')
    const bFrontmatter = await b.getExportValue('frontmatter')

    return bFrontmatter.date.getTime() - aFrontmatter.date.getTime()
  },
})
