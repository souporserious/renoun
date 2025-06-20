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
  sort: 'frontmatter.date',
})
