import { Directory, withSchema } from 'renoun/file-system'
import { z } from 'zod'

export const BlogPostDirectory = new Directory({
  path: 'content/posts',
  filter: '*.mdx',
  basePathname: 'renoun',
  loader: {
    mdx: withSchema(
      {
        frontmatter: z.object({
          title: z.string(),
          date: z.coerce.date(),
          summary: z.string().optional(),
          category: z.string(),
          tags: z.array(z.string()).optional(),
        }),
      },
      (path) => import(`../content/posts/${path}.mdx`)
    ),
  },
  sort: 'frontmatter.date',
})