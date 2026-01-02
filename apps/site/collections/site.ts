import { Directory } from 'renoun'
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
  schema: { mdx: mdxSchema },
  loader: {
    mdx: (path) => import(`@/docs/${path}.mdx`),
  },
})

export const GuidesDirectory = new Directory({
  path: 'guides',
  filter: '*.mdx',
  schema: { mdx: mdxSchema },
  loader: {
    mdx: (path) => import(`@/guides/${path}.mdx`),
  },
})
