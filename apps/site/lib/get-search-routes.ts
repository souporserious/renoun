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
}

type InternalRoute = SearchRoute & { order?: number; position: number }

async function getEntryMetadata(entry: FileSystemEntry<any>) {
  if (!(isJavaScriptFile(entry) || isMDXFile(entry))) return undefined
  try {
    return (await entry.getExportValue('metadata')) as
      | { title?: string; label?: string; order?: number }
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
  return { title, order }
}

export const getSearchRoutes = cache(async () => {
  const entries = await RootCollection.getEntries({ recursive: true })

  const routes = await Promise.all(
    entries.map(async (entry, index): Promise<InternalRoute | null> => {
      const pathname = entry.getPathname()

      if (!pathname) {
        return null
      }

      if (pathname === '/') {
        return null
      }

      const { title, order } = await getRouteTitle(entry)

      if (!title) return null

      // Omit top-level directory entries that just duplicate their category header.
      const segs = pathname.split('/').filter(Boolean)
      if (
        segs.length === 1 &&
        'getEntries' in entry &&
        title.trim().toLowerCase() === segs[0].toLowerCase()
      ) {
        return null
      }

      return { pathname, title, order, position: index }
    })
  )

  const deduped = new Map<string, InternalRoute>()

  for (const route of routes) {
    if (!route) continue

    if (!deduped.has(route.pathname)) {
      deduped.set(route.pathname, route)
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

  return sorted.map(({ pathname, title }) => ({ pathname, title }))
})
