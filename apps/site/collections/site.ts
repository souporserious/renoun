import { Directory, isFile, withSchema } from 'renoun/file-system'
import { z } from 'zod'

const mdxSchema = {
  headings: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      depth: z.number(),
    })
  ),
  metadata: z.object({
    title: z.string(),
    label: z.string().optional(),
    description: z.string(),
    tags: z.array(z.string()).optional(),
  }),
}

export const DocsCollection = new Directory({
  path: 'docs',
  baseRoutePath: 'docs',
  loaders: {
    mdx: withSchema(mdxSchema, (path) => import(`@/docs/${path}.mdx`)),
  },
  include: (entry) => isFile(entry, 'mdx'),
})

export const GuidesCollection = new Directory({
  path: 'guides',
  baseRoutePath: 'guides',
  loaders: {
    mdx: withSchema(mdxSchema, (path) => import(`@/guides/${path}.mdx`)),
  },
  include: (entry) => isFile(entry, 'mdx'),
})
