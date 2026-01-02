import { Directory, type ContentSection } from 'renoun'
import * as v from 'valibot'

const mdxSchema = v.object({
  sections: v.custom<ContentSection[]>((value) => Array.isArray(value)),
})

const docs = new Directory({
  path: 'docs',
  filter: '*.mdx',
  schema: { mdx: mdxSchema },
  loader: {
    mdx: (path) => import(`@/docs/${path}.mdx`),
  },
})
