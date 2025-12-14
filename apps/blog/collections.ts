import { Directory, withSchema } from 'renoun'
import { z } from 'zod'

export const posts = new Directory({
  path: 'posts',
  filter: '*.mdx',
  basePathname: null,
  loader: {
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
