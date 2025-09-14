import { Directory, isFile, withSchema } from 'renoun'
import { z } from 'zod'

const mdxSchema = {
  headings: z.array(
    z.object({
      id: z.string(),
      level: z.number(),
      children: z.custom<NonNullable<React.ReactNode>>(),
      text: z.string(),
    })
  ),
  metadata: z.object({
    title: z.string(),
    label: z.string().optional(),
    description: z.string(),
    tags: z.array(z.string()).optional(),
  }),
}

export const DocsDirectory = new Directory({
  path: 'docs',
  loader: {
    mdx: withSchema(mdxSchema, (path) => import(`@/docs/${path}.mdx`)),
  },
  filter: (entry) => isFile(entry, 'mdx'),
})

export const GuidesDirectory = new Directory({
  path: 'guides',
  loader: {
    mdx: withSchema(mdxSchema, (path) => import(`@/guides/${path}.mdx`)),
  },
  filter: (entry) => isFile(entry, 'mdx'),
})
