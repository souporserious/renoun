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
 *   require.context('./docs', true, /\.mdx$/),
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
      .filter((key) => !key.startsWith('./'))
      .map((key) => {
        const parsedModule = parseModule(key, baseDirectory, context(key))
        return [parsedModule.pathname, parsedModule]
      })
  ) as Record<string, Module & Type>

  return {
    all() {
      return allModules
    },
    paths(): string[][] {
      return Object.values(allModules).map((module) =>
        module.pathname.split('/')
      )
    },
    get(pathname: string[]) {
      return getPathData(allModules, pathname)
    },
  }
}

/** Parses and attaches metadata to a module. */
function parseModule(filename: string, baseDirectory: string, module: any) {
  const { default: Component, codeBlocks, ...exports } = module
  const pathname = filename
    // Remove file extensions
    .replace(/\.[^/.]+$/, '')
    // Remove leading "./"
    .replace(/^\.\//, '')
    // Remove leading sorting number
    .replace(/\/\d+\./g, '/')
    // Remove base directory
    .replace(baseDirectory, '')
  const slug = pathname.split('/').pop()

  return {
    Component,
    title: module.metadata?.title || module.headings?.[0]?.text || title(slug),
    pathname,
    slug,
    ...exports,
  }
}

/** Returns the active and sibling data based on the active pathname. */
function getPathData(
  /** The collected data from a source. */
  data: Record<string, Module>,

  /** The pathname of the active page. */
  pathname: string[]
): {
  active?: Module
  previous?: Module
  next?: Module
} {
  const allData = Object.values(data) as Module[]
  const index = Object.keys(data).findIndex((dataPathname) =>
    dataPathname.includes(pathname.join('/'))
  )

  function getSiblingPath(startIndex: number, direction: number) {
    const siblingIndex = startIndex + direction
    const siblingPath = allData[siblingIndex]

    if (siblingPath?.pathname === null) {
      return getSiblingPath(siblingIndex, direction)
    }

    return siblingPath
  }

  return {
    active: allData[index],
    previous: getSiblingPath(index, -1),
    next: getSiblingPath(index, 1),
  }
}
