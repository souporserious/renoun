import { Directory, resolveFileFromEntry, withSchema } from 'renoun'
import { z } from 'zod'

export const docs = new Directory({
  path: 'docs',
  basePathname: null,
  filter: '**/*.mdx',
  loader: {
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
    entries.map(async (doc) => {
      const file = await resolveFileFromEntry(doc)
      const metadata = file ? await file.getExportValue('metadata') : undefined

      if (!metadata) {
        throw new Error(`Metadata export not defined for ${doc.getPathname()}`)
      }

      return {
        pathname: doc.getPathname(),
        segments: doc.getPathnameSegments({ includeBasePathname: false }),
        title: metadata.title,
        order: metadata.order,
      }
    })
  )
)
