import { Directory, withSchema, type ContentSection } from 'renoun'
import { z } from 'zod'

const mdxSchema = {
  sections: z.custom<ContentSection[]>(),
}

const docs = new Directory({
  path: 'docs',
  filter: '*.mdx',
  loader: {
    mdx: withSchema(mdxSchema, (path) => import(`@/docs/${path}.mdx`)),
  },
})
