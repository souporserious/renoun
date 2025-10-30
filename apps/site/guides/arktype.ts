import { Directory, withSchema } from 'renoun'
import { isValidElement } from 'react'
import { type } from 'arktype'

const mdxSchema = {
  headings: type({
    id: 'string',
    level: 'number',
    children: type('unknown').narrow((value): value is React.ReactElement =>
      isValidElement(value)
    ),
    text: 'string',
  }).array(),
}

const docs = new Directory({
  path: 'docs',
  filter: '*.mdx',
  loader: {
    mdx: withSchema(mdxSchema, (path) => import(`@/docs/${path}.mdx`)),
  },
})
