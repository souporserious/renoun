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
  sort: async (a, b) => {
    // Prioritize shallower depth first.
    const depthDifference = a.getDepth() - b.getDepth()
    if (depthDifference !== 0) {
      return depthDifference
    }

    // Compare explicit `order` metadata if present.
    const [aOrder, bOrder] = await Promise.all([
      a.getExportValue('metadata').then((metadata) => metadata.order),
      b.getExportValue('metadata').then((metadata) => metadata.order),
    ])
    if (aOrder !== null && bOrder !== null && aOrder !== bOrder) {
      return aOrder - bOrder
    }
    if (aOrder !== null && bOrder === null) {
      return -1
    }
    if (aOrder === null && bOrder !== null) {
      return 1
    }

    // When order is the same or missing, prefer directories before files so directory listings appear first.
    const aIsDirectory = a instanceof Directory
    const bIsDirectory = b instanceof Directory
    if (aIsDirectory && !bIsDirectory) {
      return -1
    }
    if (!aIsDirectory && bIsDirectory) {
      return 1
    }

    // Fallback to base name comparison.
    return a.getBaseName().localeCompare(b.getBaseName())
  },
})

export const routes = docs.getEntries({ recursive: true }).then((entries) =>
  Promise.all(
    entries.map(async (doc) => ({
      pathname: doc.getPathname(),
      segments: doc.getPathnameSegments({ includeBasePathname: false }),
      title: await doc
        .getExportValue('metadata')
        .then((metadata) => metadata.title),
    }))
  )
)
