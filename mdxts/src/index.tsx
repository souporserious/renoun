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
  const allContextKeys = Object.fromEntries(
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
        return [pathname, key]
      })
  ) as Record<string, string>

  /** Parses and attaches metadata to a module. */
  async function parseModule(pathname: string) {
    if (pathname === undefined) {
      return null
    }

    const contextKey = allContextKeys[pathname]

    if (contextKey === undefined) {
      return null
    }

    const {
      default: Component,
      headings,
      metadata,
      ...exports
    } = await context(contextKey)
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
    /** The pathname of the active page. */
    pathname: string[]
  ): Promise<{
    active?: Module
    previous?: Module
    next?: Module
  }> {
    const activeIndex = Object.keys(allContextKeys).findIndex((dataPathname) =>
      dataPathname.includes(pathname.join('/'))
    )

    function getSiblingPathname(startIndex: number, direction: number) {
      const siblingIndex = startIndex + direction
      const siblingPathname = allContextKeys[siblingIndex]
      if (siblingPathname === null) {
        return getSiblingPathname(siblingIndex, direction)
      }
      return siblingPathname
    }

    const [active, previous, next] = await Promise.all([
      parseModule(pathname.join('/')),
      parseModule(getSiblingPathname(activeIndex, -1)),
      parseModule(getSiblingPathname(activeIndex, 1)),
    ])

    if (active === null) {
      return null
    }

    return { active, previous, next } as Record<
      'active' | 'previous' | 'next',
      Module & Type
    >
  }

  return {
    async all() {
      const allModules = await Promise.all(
        Object.keys(allContextKeys).map((pathname) => parseModule(pathname))
      )
      return Object.fromEntries(
        Object.keys(allContextKeys).map((pathname, index) => [
          pathname,
          allModules[index],
        ])
      ) as Record<string, Promise<Module & Type>>
    },
    paths(): string[][] {
      return Object.keys(allContextKeys).map((pathname) =>
        pathname
          // Split pathname into an array
          .split('/')
          // Remove empty strings
          .filter(Boolean)
      )
    },
    async get(pathname: string[]) {
      const data = await getPathData<Type>(pathname)
      return data
    },
  }
}
