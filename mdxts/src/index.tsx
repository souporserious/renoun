import parseTitle from 'title'
import Slugger from 'github-slugger'
import type { ComponentType } from 'react'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import 'server-only'

import type { CodeBlocks } from './remark/add-code-blocks'
import type { Headings } from './remark/add-headings'
import type { AllModules, ModuleData } from './utils/get-all-data'
import { getAllData } from './utils/get-all-data'

const typeSlugs = new Slugger()

export type Module = {
  Content?: ComponentType
  codeBlocks: CodeBlocks
  frontMatter?: Record<string, any>
  headings: Headings
  summary: string
  pathname: string
  metadata?: { title: string; description: string }
} & Omit<ModuleData, 'mdxPath' | 'tsPath'>

/**
 * Loads content and metadata related to MDX and TypeScript files.
 *
 * @example
 * export const allDocs = createDataSource('./docs/*.mdx', { baseDirectory: 'docs' })
 * export const allComponents = createDataSource('./components/**\/index.ts')
 */
export function createDataSource<Type>(
  /** A glob pattern to match files. */
  pattern: string,

  /** Options for configuring the data source. */
  options: {
    /** The base directory to use for calculating source paths. */
    baseDirectory?: string

    /** The base pathname to use for calculating navigation paths. */
    basePathname?: string
  } = {}
) {
  let allModules = pattern as unknown as AllModules

  if (typeof allModules === 'string') {
    throw new Error(
      'mdxts: createDataSource requires that the mdxts/loader package is configured as a Webpack loader.'
    )
  }

  /** Convert all modules to absolute paths. */
  allModules = Object.fromEntries(
    Object.entries(allModules).map(([pathname, moduleImport]) => [
      resolve(process.cwd(), pathname),
      moduleImport,
    ])
  )

  const globPattern = options as unknown as string
  const { baseDirectory = '', basePathname = '' } = (arguments[2] ||
    {}) as unknown as {
    baseDirectory: string
    basePathname: string
  }
  const allData = getAllData({
    allModules,
    globPattern,
    baseDirectory,
    basePathname,
  })
  const filteredDataKeys = Object.keys(allData).filter((pathname) => {
    const moduleData = allData[pathname]
    if (moduleData?.tsPath) {
      const isExtensionExample = basename(
        moduleData.tsPath,
        extname(moduleData.tsPath)
      ).endsWith('.examples')
      const isDirectoryExample = dirname(moduleData.tsPath).endsWith('examples')
      return !isExtensionExample && !isDirectoryExample
    }
    return true
  })

  /** Parses and attaches metadata to a module. */
  async function getModule(pathname?: string) {
    if (pathname === undefined) {
      return null
    }

    const data = allData[pathname]

    if (data === undefined) {
      return null
    }

    let {
      default: Content,
      headings = [],
      metadata,
      frontMatter,
      ...exports
    } = data.mdxPath
      ? await allModules[data.mdxPath]
      : { default: undefined, metadata: undefined, frontMatter: undefined }

    /** Append component prop type links to headings data. */
    if (data.exportedTypes.length > 0) {
      typeSlugs.reset()

      headings = [
        ...(headings || []),
        {
          text: 'Exports',
          id: 'exports',
          depth: 2,
        },
        ...data.exportedTypes.map((type) => ({
          text: type.name,
          id: typeSlugs.slug(type.name),
          depth: 3,
        })),
      ]
    }

    /** Merge front matter data into metadata. */
    if (frontMatter) {
      Object.assign(metadata, frontMatter)
    }

    return {
      Content,
      isServerOnly: data.isServerOnly,
      isMainExport: data.isMainExport,
      title: data.title,
      label: data.label,
      description: data.description,
      exportedTypes: data.exportedTypes,
      examples: data.examples,
      sourcePath: data.sourcePath,
      pathname:
        basePathname === pathname
          ? join(sep, basePathname)
          : join(sep, basePathname, pathname),
      headings,
      frontMatter,
      metadata,
      ...exports,
    } as Module & Type
  }

  async function getPathData(
    /** The pathname of the active page. */
    pathname: string | string[]
  ): Promise<(Module & { previous?: Module; next?: Module }) | null> {
    const stringPathname = Array.isArray(pathname)
      ? pathname.join(sep)
      : pathname
    const activeIndex = Object.keys(allData).findIndex((dataPathname) =>
      dataPathname.includes(stringPathname)
    )

    function getSiblingPathname(startIndex: number, direction: number) {
      const siblingIndex = startIndex + direction
      const siblingPathname = Object.keys(allData)[siblingIndex]

      if (siblingPathname === null) {
        return getSiblingPathname(siblingIndex, direction)
      }
      return siblingPathname
    }

    const [active, previous, next] = await Promise.all([
      getModule(stringPathname),
      getModule(getSiblingPathname(activeIndex, -1)),
      getModule(getSiblingPathname(activeIndex, 1)),
    ])

    if (active === null) {
      return null
    }

    return Object.assign(active, { previous, next }) as Module &
      Type & {
        previous?: Module & Type
        next?: Module & Type
      }
  }

  return {
    /** Returns all modules. */
    async all() {
      return Object.fromEntries(
        filteredDataKeys.map((pathname) => [pathname, allData[pathname]])
      )
    },

    /** Returns a tree of all module metadata. */
    async tree() {
      const paths = filteredDataKeys
      const tree: {
        segment: string
        pathname: string
        label: string
        children: any[]
      }[] = []

      for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
        const currentPath = paths[pathIndex]
        const pathParts = currentPath.split(sep)
        let nodes = tree

        for (
          let pathPartIndex = 0;
          pathPartIndex < pathParts.length;
          pathPartIndex++
        ) {
          const pathname = pathParts.slice(0, pathPartIndex + 1).join(sep)
          const segment = pathParts[pathPartIndex]
          let node = nodes.find((node) => node.segment === segment)

          if (!node) {
            node = {
              segment,
              pathname: join(sep, basePathname, pathname),
              label: parseTitle(segment),
              children: [],
            }

            const sourceFileData = allData[pathname]

            if (sourceFileData) {
              Object.assign(node, sourceFileData)
            }

            nodes.push(node)
          }

          nodes = node.children
        }
      }

      return tree
    },

    /** Returns a module by pathname including metadata, examples, and previous/next modules. Defaults to `basePathname` if `pathname` is undefined. */
    async get(pathname: string | string[] | undefined) {
      if (pathname === undefined) {
        pathname = basePathname
      }

      const data = await getPathData(pathname)
      return data
    },

    /** Returns paths for all modules calculated from file system paths. */
    paths() {
      return filteredDataKeys.map((pathname) =>
        pathname
          // Split pathname into an array
          .split(sep)
          // Remove empty strings
          .filter(Boolean)
      )
    },
  }
}

let theme: any = null

/** Sets the current theme. */
export function setTheme(newTheme: any) {
  theme = newTheme
}

/** Returns the current theme. */
export function getTheme() {
  return theme
}
