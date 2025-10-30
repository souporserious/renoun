import { Directory, withSchema } from 'renoun'
import { isValidElement } from 'react'
import { z } from 'zod'

const mdxSchema = {
  headings: z.array(
    z.object({
      id: z.string(),
      level: z.number(),
      children: z.custom<React.ReactElement>(isValidElement),
      text: z.string(),
    })
  ),
}

const docs = new Directory({
  path: 'docs',
  filter: '*.mdx',
  loader: {
    mdx: withSchema(mdxSchema, (path) => import(`@/docs/${path}.mdx`)),
  },
})
