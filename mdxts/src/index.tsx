import title from 'title'
import type { ComponentType } from 'react'
import type { CodeBlocks } from './remark/add-code-blocks'
import type { Headings } from './remark/add-headings'

export type Module = {
  Component: ComponentType
  title: string
  pathname: string
  slug: string
  headings: Headings
  codeBlocks: CodeBlocks
  summary: string
  metadata?: { title: string; description: string }
}

/**
 * Loads modules and parses metadata from Webpack `require.context`.
 *
 * @example
 * export const allDocs = loadModules(
 *   require.context('./docs', true, /\.mdx$/, 'lazy'),
 *   'docs'
 * )
 */
export function loadModules<Type>(
  context: __WebpackModuleApi.RequireContext,
  baseDirectory: string = ''
) {
  const allModules = Object.fromEntries(
    context
      .keys()
      // Filter out duplicates
      .filter((key) => !key.startsWith('./'))
      .map((key) => {
        const pathname = key
          // Remove file extensions
          .replace(/\.[^/.]+$/, '')
          // Remove leading "./"
          .replace(/^\.\//, '')
          // Remove leading sorting number
          .replace(/\/\d+\./g, '/')
          // Remove base directory
          .replace(baseDirectory ? `${baseDirectory}/` : '', '')
          // Remove trailing "/README" or "/index"
          .replace(/\/(README|index)$/, '')
          // Convert to lowercase for case-insensitive routes
          .toLowerCase()
        const parsedModule = parseModule(pathname, context(key))
        return [pathname, parsedModule]
      })
  ) as Record<string, Promise<Module & Type>>

  return {
    all() {
      return allModules
    },
    paths(): string[][] {
      return Object.keys(allModules).map((pathname) =>
        pathname
          // Split pathname into an array
          .split('/')
          // Remove empty strings
          .filter(Boolean)
      )
    },
    get(pathname: string[]) {
      return getPathData<Type>(allModules, pathname)
    },
  }
}

/** Parses and attaches metadata to a module. */
async function parseModule(pathname: string, module: any) {
  const { default: Component, headings, metadata, ...exports } = await module
  const slug = pathname.split('/').pop()

  return {
    Component,
    title: metadata?.title || headings?.[0]?.text || title(slug),
    pathname: `/${pathname}`,
    headings,
    metadata,
    ...exports,
  }
}

/** Returns the active and sibling data based on the active pathname. */
async function getPathData<Type>(
  /** The collected data from a source. */
  data: Record<string, Promise<Module>>,

  /** The pathname of the active page. */
  pathname: string[]
): Promise<{
  active?: Module
  previous?: Module
  next?: Module
}> {
  const allKeys = Object.keys(data)
  const allData = Object.values(data) as Promise<Module>[]
  const activeIndex = Object.keys(data).findIndex((dataPathname) =>
    dataPathname.includes(pathname.join('/'))
  )
  const activeData = allData[activeIndex]

  if (activeData === undefined) {
    return null
  }

  function getSiblingPath(startIndex: number, direction: number) {
    const siblingIndex = startIndex + direction
    const siblingPathname = allKeys[siblingIndex]

    if (siblingPathname === null) {
      return getSiblingPath(siblingIndex, direction)
    }

    return allData[siblingIndex]
  }

  const modulePromises = await Promise.all([
    activeData,
    getSiblingPath(activeIndex, -1),
    getSiblingPath(activeIndex, 1),
  ])

  return {
    active: modulePromises[0],
    previous: modulePromises[1],
    next: modulePromises[2],
  } as Record<'active' | 'previous' | 'next', Module & Type>
}
