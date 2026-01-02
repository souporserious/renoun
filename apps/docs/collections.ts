import { Directory, resolveFileFromEntry } from 'renoun'
import { z } from 'zod'

export const docs = new Directory({
  path: 'docs',
  basePathname: null,
  filter: '**/*.mdx',
  schema: {
    mdx: {
      headings: z.array(
        z.object({
          id: z.string(),
          level: z.number(),
          text: z.string(),
          summary: z.string().optional(),
          children: z.custom<NonNullable<React.ReactNode>>().optional(),
        })
      ),
      metadata: z.object({
        title: z.string(),
        order: z.number(),
        summary: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    },
  },
  loader: {
    mdx: (path) => import(`./docs/${path}.mdx`),
  },
  sort: 'metadata.order',
})

export const routes = docs.getEntries({ recursive: true }).then((entries) =>
  Promise.all(
    entries.map(async (doc) => {
      const file = await resolveFileFromEntry(doc, 'mdx')
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
