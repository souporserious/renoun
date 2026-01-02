import { Directory, type ContentSection } from 'renoun'
import { z } from 'zod'

const mdxSchema = {
  sections: z.custom<ContentSection[]>(),
}

const docs = new Directory({
  path: 'docs',
  filter: '*.mdx',
  schema: { mdx: mdxSchema },
  loader: {
    mdx: (path) => import(`@/docs/${path}.mdx`),
  },
})
