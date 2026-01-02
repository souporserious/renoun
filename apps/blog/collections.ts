import { Directory } from 'renoun'
import { z } from 'zod'

export const posts = new Directory({
  path: 'posts',
  filter: '*.mdx',
  basePathname: null,
  schema: {
    mdx: {
      frontmatter: z.object({
        title: z.string(),
        date: z.coerce.date(),
        summary: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    },
  },
  loader: {
    mdx: (path) => import(`./posts/${path}.mdx`),
  },
  sort: 'frontmatter.date',
})
