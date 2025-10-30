import { Directory, withSchema } from 'renoun'
import { isValidElement } from 'react'
import * as v from 'valibot'

const mdxSchema = v.object({
  headings: v.array(
    v.object({
      id: v.string(),
      level: v.number(),
      children: v.custom<NonNullable<React.ReactNode>>(isValidElement),
      text: v.string(),
    })
  ),
})

const docs = new Directory({
  path: 'docs',
  filter: '*.mdx',
  loader: {
    mdx: withSchema(mdxSchema, (path) => import(`@/docs/${path}.mdx`)),
  },
})
