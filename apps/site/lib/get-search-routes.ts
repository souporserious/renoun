import { cache } from 'react'
import {
  ModuleExportNotFoundError,
  isJavaScriptFile,
  isMDXFile,
  isDirectory,
  resolveFileFromEntry,
  type FileSystemEntry,
} from 'renoun'

import { RootCollection } from '@/collections'

export type SearchRoute = {
  pathname: string
  title: string
  keywords?: string[]
}

type InternalRoute = SearchRoute & { order?: number; position: number }

async function getEntryMetadata(entry: FileSystemEntry<any>) {
  if (!(isJavaScriptFile(entry) || isMDXFile(entry))) return undefined
  try {
    return (await entry.getExportValue('metadata')) as
      | { title?: string; label?: string; order?: number; tags?: string[] }
      | undefined
  } catch (error) {
    if (error instanceof ModuleExportNotFoundError) return undefined
    throw error
  }
}

async function getFileLabel(entry: FileSystemEntry<any>) {
  const name = entry.getBaseName()
  if (name.includes('-') && isJavaScriptFile(entry)) {
    try {
      const fileExports: any[] = await (entry as any).getExports()
      const firstExport = fileExports[0]
      if (firstExport) return firstExport.getName()
    } catch {
      // ignore export resolution errors
    }
  }
  return name
}

function getDirectoryLabel(entry: FileSystemEntry<any>) {
  return entry.getBaseName()
}

async function getRouteTitle(entry: FileSystemEntry<any>) {
  const metadata = await getEntryMetadata(entry)
  let title: string
  if (metadata?.label) title = metadata.label
  else if (metadata?.title) title = metadata.title
  else if (isDirectory(entry)) title = getDirectoryLabel(entry)
  else if (isJavaScriptFile(entry)) title = await getFileLabel(entry)
  else title = entry.getBaseName()
  let order = metadata?.order ?? (entry as any).getOrder?.()
  if (order === undefined) {
    try {
      const file = await resolveFileFromEntry(entry)
      if (file && typeof (file as any).getOrder === 'function') {
        order = (file as any).getOrder()
      }
    } catch {
      // ignore inability to resolve file
    }
  }
  const keywords = new Set<string>()
  keywords.add(title)
  if (metadata?.tags) {
    for (const tag of metadata.tags) {
      keywords.add(tag)
    }
  }
  if (metadata?.label) {
    keywords.add(metadata.label)
  }
  const segments =
    typeof (entry as any).getPathnameSegments === 'function'
      ? (entry as any)
          .getPathnameSegments({ includeBasePathname: false })
          .filter(Boolean)
      : []
  for (const segment of segments) {
    const normalized = segment.replace(/[-_]/g, ' ')
    keywords.add(segment)
    if (normalized && normalized !== segment) {
      keywords.add(normalized)
    }
  }
  return { title, order, keywords }
}

async function getApiRoutes(
  entry: FileSystemEntry<any>,
  {
    pathname,
    parentTitle,
    order,
    position,
  }: {
    pathname: string
    parentTitle: string
    order?: number
    position: number
  }
) {
  if (!isJavaScriptFile(entry)) return []

  // Skip modifier files such as *.examples.tsx which do not render reference sections.
  if (typeof entry.getModifierName === 'function' && entry.getModifierName()) {
    return []
  }

  let exports
  try {
    exports = await entry.getExports()
  } catch {
    return []
  }

  const routes: InternalRoute[] = []

  for (const [index, fileExport] of exports.entries()) {
    const tags = fileExport.getTags?.()
    if (tags?.some((tag) => tag.name === 'internal')) {
      continue
    }

    const exportName = fileExport.getName?.()
    if (!exportName) continue

    const exportTitle = fileExport.getTitle?.() ?? exportName
    const keywords = new Set<string>()
    keywords.add(exportTitle)
    keywords.add(exportName)
    if (typeof fileExport.getSlug === 'function') {
      keywords.add(fileExport.getSlug())
    }
    keywords.add(parentTitle)
    keywords.add('api')
    keywords.add('api reference')

    const encodedAnchor = encodeURIComponent(exportName)

    routes.push({
      pathname: `${pathname}#${encodedAnchor}`,
      title: `${exportTitle} · ${parentTitle}`,
      keywords: Array.from(keywords),
      order,
      position: position + (index + 1) / (exports.length + 1),
    })
  }

  return routes
}

export const getSearchRoutes = cache(async () => {
  const entries = await RootCollection.getEntries({ recursive: true })

  const routes = await Promise.all(
    entries.map(async (entry, index): Promise<(InternalRoute | null)[]> => {
      const pathname = entry.getPathname()

      if (!pathname) {
        return [null]
      }

      if (pathname === '/') {
        return [null]
      }

      const { title, order, keywords } = await getRouteTitle(entry)

      if (!title) return [null]

      // Omit top-level directory entries that just duplicate their category header.
      const segments = pathname.split('/').filter(Boolean)
      if (
        segments.length === 1 &&
        'getEntries' in entry &&
        title.trim().toLowerCase() === segments[0].toLowerCase()
      ) {
        return [null]
      }

      const apiRoutes = await getApiRoutes(entry, {
        pathname,
        parentTitle: title,
        order,
        position: index,
      })

      return [
        {
          pathname,
          title,
          order,
          position: index,
          keywords: Array.from(keywords),
        },
        ...apiRoutes,
      ]
    })
  )

  const deduped = new Map<string, InternalRoute>()

  for (const routeGroup of routes) {
    for (const route of routeGroup) {
      if (!route) continue

      if (!deduped.has(route.pathname)) {
        deduped.set(route.pathname, route)
      }
    }
  }

  const sorted = Array.from(deduped.values()).sort((a, b) => {
    const aHas = typeof a.order === 'number'
    const bHas = typeof b.order === 'number'
    if (aHas && bHas && a.order !== b.order) {
      return (a.order as number) - (b.order as number)
    }
    if (aHas && !bHas) return -1
    if (!aHas && bHas) return 1
    // Preserve original traversal order (mirrors sidebar) when no explicit order
    if (a.position !== b.position) return a.position - b.position
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  })

  return sorted.map(({ pathname, title, keywords }) => ({
    pathname,
    title,
    keywords,
  }))
})
