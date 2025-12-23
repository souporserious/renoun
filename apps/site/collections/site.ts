import { Directory, withSchema } from 'renoun'
import { z } from 'zod'

const mdxSchema = {
  metadata: z.object({
    title: z.string(),
    label: z.string().optional(),
    description: z.string(),
    tags: z.array(z.string()).optional(),
  }),
}

export const DocsDirectory = new Directory({
  path: 'docs',
  filter: '*.mdx',
  loader: {
    mdx: withSchema(mdxSchema, (path) => import(`@/docs/${path}.mdx`)),
  },
})

export const GuidesDirectory = new Directory({
  path: 'guides',
  filter: '*.mdx',
  loader: {
    mdx: withSchema(mdxSchema, (path) => import(`@/guides/${path}.mdx`)),
  },
})
