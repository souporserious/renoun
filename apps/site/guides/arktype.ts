import { Directory, withSchema, type ContentSection } from 'renoun'
import { type } from 'arktype'

const mdxSchema = {
  sections: type('unknown').narrow(
    (value): value is ContentSection[] => Array.isArray(value)
  ),
}

const docs = new Directory({
  path: 'docs',
  filter: '*.mdx',
  loader: {
    mdx: withSchema(mdxSchema, (path) => import(`@/docs/${path}.mdx`)),
  },
})
