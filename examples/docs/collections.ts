import { Directory, isFile, isDirectory, withSchema } from 'renoun/file-system'
import { z } from 'zod'
import { getEntryTitle } from '@/utils'

export const docs = new Directory({
  path: 'docs',
  basePathname: null,
  include: (entry) => {
    if (isDirectory(entry) || isFile(entry, 'mdx')) {
      return true
    }
    return false
  },
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
})

export const routes = docs.getEntries({ recursive: true }).then((entries) =>
  Promise.all(
    entries.map(async (doc) => ({
      pathname: doc.getPathname(),
      segments: doc.getPathnameSegments({ includeBasePathname: false }),
      title: await getEntryTitle(doc),
    }))
  )
)
