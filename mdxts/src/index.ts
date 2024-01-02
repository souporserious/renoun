import parseTitle from 'title'
import type { ComponentType } from 'react'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import 'server-only'

import { project } from './components/project'
import type { CodeBlocks } from './remark/add-code-blocks'
import type { Headings } from './remark/add-headings'
import type { AllModules, ModuleData } from './utils/get-all-data'
import { getAllData } from './utils/get-all-data'

export type Module = {
  Content?: ComponentType
  examples: (Awaited<ModuleData['examples']>[number] & { pathname: string })[]
  pathname: string
  codeBlocks: CodeBlocks
  frontMatter?: Record<string, any>
  headings: Headings
  summary: string
  metadata?: { title: string; description: string }
} & Omit<ModuleData, 'mdxPath' | 'tsPath' | 'examples'>

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
    project,
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

  return {
    /** Returns all modules. */
    all() {
      return Object.fromEntries(
        filteredDataKeys.map((pathname) => [pathname, allData[pathname]])
      )
    },

    /** Returns a tree of all module metadata related to navigation. */
    tree() {
      const allData = this.all()
      const tree: {
        segment: string
        pathname: string
        label: string
        hasData: boolean
        children: any[]
      }[] = []

      for (
        let pathIndex = 0;
        pathIndex < filteredDataKeys.length;
        pathIndex++
      ) {
        const currentPath = filteredDataKeys[pathIndex]
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
            const sourceFileData = allData[pathname]

            node = {
              segment,
              pathname: join(sep, basePathname, pathname),
              label: parseTitle(segment),
              hasData: sourceFileData !== undefined,
              children: [],
            }

            if (sourceFileData) {
              Object.assign(node, sourceFileData)
            } else {
              /** If no data for this pathname, find the next available pathname. */
              for (
                let index = pathIndex;
                index < filteredDataKeys.length;
                index++
              ) {
                const nextPath = filteredDataKeys[index]
                if (
                  nextPath.startsWith(pathname) &&
                  allData[nextPath] !== undefined
                ) {
                  node.pathname = join(sep, basePathname, nextPath)
                  break
                }
              }
            }

            nodes.push(node)
          }

          nodes = node.children
        }
      }

      return tree
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

    /** Returns paths for all module examples. */
    async examplePaths() {
      const allData = this.all()
      const allPaths = this.paths()
      const allExamples = await Promise.all(
        Object.values(allData).map((data) => data.examples)
      )
      return allExamples.flatMap((examples, index) =>
        examples.map((example) => [...allPaths[index], example.slug])
      )
    },

    /** Returns a module by pathname including metadata, examples, and previous/next modules. Defaults to `basePathname` if `pathname` is `undefined`. */
    async get(pathname: string | string[] | undefined) {
      const allData = this.all()

      if (pathname === undefined) {
        pathname = basePathname
      }

      const stringPathname = Array.isArray(pathname)
        ? pathname.join(sep)
        : pathname
      if (pathname === undefined) {
        return
      }

      const data = allData[stringPathname]

      if (data === undefined) {
        return
      }

      let {
        default: Content,
        headings = [],
        metadata,
        frontMatter,
        ...moduleExports
      } = data.mdxPath
        ? await allModules[data.mdxPath]
        : { default: undefined, metadata: undefined, frontMatter: undefined }

      /** Append example links to headings data. */
      const examples = (await data.examples).map((example) => ({
        ...example,
        pathname: join(stringPathname, example.slug),
      }))
      if (examples.length > 0) {
        headings = [
          ...(headings || []),
          {
            text: 'Examples',
            id: 'examples',
            depth: 2,
          },
          ...examples.map((example) => ({
            text: example.name,
            id: example.slug,
            depth: 3,
          })),
        ]
      }

      /** Append component prop type links to headings data. */
      if (data.exportedTypes.length > 0) {
        headings = [
          ...(headings || []),
          {
            text: 'Exports',
            id: 'exports',
            depth: 2,
          },
          ...data.exportedTypes.map((type) => ({
            text: type.name,
            id: type.slug,
            depth: 3,
          })),
        ]
      }

      /** Merge front matter data into metadata. */
      if (frontMatter) {
        Object.assign(metadata, frontMatter)
      }

      return {
        isServerOnly: data.isServerOnly,
        isMainExport: data.isMainExport,
        title: data.title,
        label: data.label,
        description: data.description,
        exportedTypes: data.exportedTypes,
        pathname: data.pathname,
        sourcePath: data.sourcePath,
        previous: data.previous,
        next: data.next,
        Content,
        examples,
        frontMatter,
        headings,
        metadata,
        ...moduleExports,
      } as Module & Type
    },

    /**
     * Returns a module example by pathname. Note, the pathname must include the source module
     * pathname as well. For example, to get the `basic` example from the `button` module, the
     * pathname would be `['components', 'button', 'examples', 'basic']`.
     */
    async getExample(slug: string[]) {
      const dataSlug = slug.slice(0, 2)
      const dataItem = await this.get(dataSlug)

      if (dataItem === undefined) {
        return
      }

      const exampleSlug = slug.slice(2).at(0)!
      return dataItem.examples.find((example) => example.slug === exampleSlug)
    },
  }
}

/** Merges multiple data sources into a single data source. */
export function mergeDataSources(
  ...dataSources: ReturnType<typeof createDataSource>[]
) {
  function all() {
    const combinedEntries = dataSources.flatMap((dataSource) =>
      Object.entries(dataSource.all())
    )
    combinedEntries.forEach(([, data], index) => {
      const previousData = combinedEntries[index - 1]
      const nextData = combinedEntries[index + 1]
      if (previousData) {
        data.previous = {
          label: previousData[1].label,
          pathname: previousData[1].pathname,
        }
      }
      if (nextData) {
        data.next = {
          label: nextData[1].label,
          pathname: nextData[1].pathname,
        }
      }
    })
    return Object.fromEntries(combinedEntries)
  }

  function tree() {
    return dataSources.flatMap((dataSource) => dataSource.tree())
  }

  function paths() {
    return dataSources.flatMap((dataSource) => dataSource.paths())
  }

  async function examplePaths() {
    return await Promise.all(
      dataSources.flatMap((dataSource) => dataSource.examplePaths())
    )
  }

  async function get(pathname: string | string[]) {
    let result

    for (const dataSource of dataSources) {
      result = await dataSource.get(pathname)
      if (result) break
    }

    if (!result) {
      return
    }

    const allEntries = Object.entries(all())
    const stringPathname = Array.isArray(pathname)
      ? pathname.join(sep)
      : pathname
    const currentIndex = allEntries.findIndex(
      ([path]) => path === stringPathname
    )
    const previousEntry = allEntries[currentIndex - 1]
    const nextEntry = allEntries[currentIndex + 1]

    if (previousEntry) {
      result.previous = {
        label: previousEntry[1].label,
        pathname: previousEntry[1].pathname,
      }
    }

    if (nextEntry) {
      result.next = {
        label: nextEntry[1].label,
        pathname: nextEntry[1].pathname,
      }
    }

    return result
  }

  async function getExample(slug: string[]) {
    for (const dataSource of dataSources) {
      const result = await dataSource.getExample(slug)
      if (result) return result
    }
  }

  return {
    all,
    tree,
    paths,
    examplePaths,
    get,
    getExample,
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
