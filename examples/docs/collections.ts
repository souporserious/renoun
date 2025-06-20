import { Directory, withSchema } from 'renoun/file-system'
import { z } from 'zod'

export const docs = new Directory({
  path: 'docs',
  basePathname: null,
  include: '**/*.mdx',
  loaders: {
    mdx: withSchema(
      {
        metadata: z.object({
          title: z.string(),
          order: z.number(),
          summary: z.string().optional(),
          tags: z.array(z.string()).optional(),
        }),
      },
      (path) => import(`./docs/${path}.mdx`)
    ),
  },
  sort: 'metadata.order',
})

export const routes = docs.getEntries({ recursive: true }).then((entries) =>
  Promise.all(
    entries.map(async (doc) => ({
      pathname: doc.getPathname(),
      segments: doc.getPathnameSegments({ includeBasePathname: false }),
      title: await doc
        .getExportValue('metadata')
        .then((metadata) => metadata.title),
      depth: doc.getDepth(),
      order: await doc
        .getExportValue('metadata')
        .then((metadata) => metadata.order),
    }))
  )
)
