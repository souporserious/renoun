import { Directory, type ContentSection } from 'renoun'
import { type } from 'arktype'

const mdxSchema = {
  sections: type('unknown').narrow((value): value is ContentSection[] =>
    Array.isArray(value)
  ),
}

const docs = new Directory({
  path: 'docs',
  filter: '*.mdx',
  schema: { mdx: mdxSchema },
  loader: {
    mdx: (path) => import(`@/docs/${path}.mdx`),
  },
})
