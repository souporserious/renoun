import { Directory, withSchema } from 'renoun/file-system'
import { z } from 'zod'

export const docs = new Directory({
  path: 'docs',
  include: '*.mdx',
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
  sort: async (a, b) => {
    const aMetadata = await a.getExportValue('metadata')
    const bMetadata = await b.getExportValue('metadata')

    return aMetadata.order - bMetadata.order
  },
})

export const routes = docs.getEntries().then((entries) =>
  Promise.all(
    entries.map(async (doc) => ({
      path: doc.getPath(),
      title: (await doc.getExportValue('metadata')).title,
    }))
  )
)
