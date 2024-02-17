import parseTitle from 'title'
import type { ComponentType } from 'react'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import 'server-only'

import { project } from './components/project'
import type { CodeBlocks } from './remark/add-code-blocks'
import type { Headings } from './remark/add-headings'
import type { AllModules, ModuleData } from './utils/get-all-data'
import { getAllData } from './utils/get-all-data'

type Compute<Type> = Type extends object
  ? {
      [Key in keyof Type]: Type[Key] extends object
        ? Compute<Type[Key]>
        : Type[Key]
    } & {}
  : Type

export type Module = Compute<
  {
    Content?: ComponentType
    examples: (Awaited<ModuleData['examples']>[number] & { pathname: string })[]
    pathname: string
    codeBlocks: CodeBlocks
    frontMatter?: Record<string, any>
    headings: Headings
    metadata?: { title: string; description: string }
  } & Omit<ModuleData, 'mdxPath' | 'tsPath' | 'examples'>
>

export type SourceTreeItem = {
  segment: string
  pathname: string
  label: string
  depth: number
  hasData: boolean
  children: SourceTreeItem[]
}

/**
 * Loads content and metadata related to MDX and TypeScript files.
 *
 * @example
 * export const allDocs = createSource('./docs/*.mdx', { baseDirectory: 'docs' })
 * export const allComponents = createSource('./components/**\/index.ts')
 */
export function createSource<Type>(
  /** A glob pattern to match source files. */
  pattern: string,

  /** Options for configuring the source. */
  options: {
    /**
     * The base directory to use for calculating source paths. This is useful in monorepos where
     * source files can be located outside of the workspace.
     */
    baseDirectory?: string

    /**
     * The base pathname to use for calculating navigation paths. This includes everything after
     * the hostname (e.g. `/docs` in `https://mdxts.com/docs`).
     */
    basePathname?: string
  } = {}
) {
  let allModules = pattern as unknown as AllModules

  if (typeof allModules === 'string') {
    throw new Error(
      'mdxts: createSource requires that the mdxts/loader package is configured as a Webpack loader.'
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
      const tree: SourceTreeItem[] = []

      for (
        let pathIndex = 0;
        pathIndex < filteredDataKeys.length;
        pathIndex++
      ) {
        const currentPath = filteredDataKeys[pathIndex]
        const pathParts = currentPath.split(sep).filter(Boolean)
        let nodes = tree

        for (
          let pathPartIndex = 0;
          pathPartIndex < pathParts.length;
          pathPartIndex++
        ) {
          const pathname = join(
            sep,
            pathParts.slice(0, pathPartIndex + 1).join(sep)
          )
          const segment = pathParts[pathPartIndex]
          let node = nodes.find((node) => node.segment === segment)

          if (!node) {
            const sourceFileData = allData[pathname]
            const hasData = sourceFileData !== undefined

            node = {
              segment,
              pathname,
              hasData,
              label: hasData ? sourceFileData.label : parseTitle(segment),
              depth: pathPartIndex,
              children: [],
            }

            if (!hasData) {
              /** If no data for this pathname, find the next available pathname. */
              for (
                let index = pathIndex;
                index < filteredDataKeys.length;
                index++
              ) {
                const nextPathname = filteredDataKeys[index]
                if (
                  nextPathname.startsWith(pathname) &&
                  allData[nextPathname] !== undefined
                ) {
                  node.pathname = join(sep, nextPathname)
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

      if (pathname === undefined) {
        return
      }

      const stringPathname = join(
        sep,
        Array.isArray(pathname) ? pathname.join(sep) : pathname
      )
      const data = allData[stringPathname]

      if (data === undefined) {
        return
      }

      let {
        default: Content,
        headings = [],
        description,
        metadata = {},
        frontMatter,
        ...moduleExports
      } = data.mdxPath
        ? await allModules[data.mdxPath]
        : {
            default: undefined,
            description: undefined,
            metadata: undefined,
            frontMatter: undefined,
          }

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
            text: 'API Reference',
            id: 'api-reference',
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
        description: data.description ?? description,
        order: data.order,
        depth: data.depth,
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
      const dataSlug = slug.slice(0, -1)
      const dataItem = await this.get(dataSlug)

      if (dataItem === undefined) {
        return
      }

      const exampleSlug = slug.slice(-1).at(0)!
      return dataItem.examples.find((example) => example.slug === exampleSlug)
    },
  }
}

/** Merges multiple sources into a single source. */
export function mergeSources(...sources: ReturnType<typeof createSource>[]) {
  function all() {
    const combinedEntries = sources.flatMap((dataSource) =>
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
    return sources.flatMap((dataSource) => dataSource.tree())
  }

  function paths() {
    return sources.flatMap((dataSource) => dataSource.paths())
  }

  async function examplePaths() {
    return await Promise.all(
      sources.flatMap((dataSource) => dataSource.examplePaths())
    )
  }

  async function get(pathname: string | string[]) {
    let result

    for (const dataSource of sources) {
      result = await dataSource.get(pathname)
      if (result) break
    }

    if (!result) {
      return
    }

    const allEntries = Object.entries(all())
    const stringPathname = join(
      sep,
      Array.isArray(pathname) ? pathname.join(sep) : pathname
    )
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
    for (const dataSource of sources) {
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
