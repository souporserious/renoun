import parseTitle from 'title'
import * as React from 'react'
import type { ComponentType } from 'react'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { Feed } from 'feed'
import { Project } from 'ts-morph'
import { getDiagnosticMessageText } from '@tsxmod/utils'
import 'server-only'

import { project } from './components/project'
import type { CodeBlocks } from './mdx-plugins/remark/add-code-blocks'
import type { Headings } from './mdx-plugins/remark/add-headings'
import type { AllModules, ModuleData } from './utils/get-all-data'
import { getAllData } from './utils/get-all-data'

type FeedOptions = Omit<
  ConstructorParameters<typeof Feed>[0],
  'generator' | 'link' | 'id'
>

type Compute<Type> = Type extends object
  ? {
      [Key in keyof Type]: Type[Key] extends object
        ? Compute<Type[Key]>
        : Type[Key]
    } & {}
  : Type

export type Module<Type extends { frontMatter: Record<string, any> }> = Compute<
  {
    Content?: ComponentType<{ renderTitle?: boolean }>
    examples: (Awaited<ModuleData<Type>['examples']>[number] & {
      pathname: string
    })[]
    pathname: string
    codeBlocks: CodeBlocks
    headings: Headings
    frontMatter?: Record<string, any>
    readingTime?: {
      /** Minimum reading time in minutes and seconds. */
      minimum: { minutes: number; seconds: number }

      /** Maximum reading time in minutes and seconds. */
      maximum: { minutes: number; seconds: number }

      /** Average reading time in minutes and seconds. */
      average: { minutes: number; seconds: number }

      /** The ISO duration for the average reading time. */
      duration: string
    }
    /** The ISO timestamp when the module was first created. */
    createdAt?: string
    /** The ISO timestamp when the module was last updated. */
    updatedAt?: string
    /** The authors that contributed to the module. */
    authors?: string[]
    metadata?: { title: string; description: string }
  } & Omit<ModuleData<Type>, 'mdxPath' | 'tsPath' | 'gitMeta' | 'examples'>
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
export function createSource<Type extends { frontMatter: Record<string, any> }>(
  /** A glob pattern to match source files. */
  globPattern: string,

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
  let allModules = arguments[2] as AllModules

  if (allModules === undefined) {
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

  const { baseDirectory = '', basePathname = '' } = options || {}
  const allData = getAllData<Type>({
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
  const allFilteredData = Object.fromEntries(
    filteredDataKeys.map((pathname) => [pathname, allData[pathname]])
  )

  /** Validate front matter types. */
  const frontMatterType = arguments[3] as string

  if (frontMatterType) {
    const allModuleData = Object.values(allFilteredData)
    let contents = `type frontMatter = ${frontMatterType};\n`

    allModuleData.forEach((post) => {
      const entries = Object.entries(post.frontMatter).map(([key, value]) => {
        return `${key}: ${formatFrontMatterValue(value)}`
      })
      contents += `({${entries.join(', ')}}) satisfies frontMatter;\n`
    })

    const frontMatterDiagnostics = new Project({ useInMemoryFileSystem: true })
      .createSourceFile('frontMatter.ts', contents)
      .getPreEmitDiagnostics()
      .map((diagnostic) => {
        const index = diagnostic.getLineNumber()! - 2
        const data = allModuleData[index]
        const message = getDiagnosticMessageText(diagnostic.getMessageText())
        return `[${data.mdxPath?.replace(process.cwd(), '')}] ${message}`
      })

    if (frontMatterDiagnostics.length > 0) {
      throw new Error(
        `Front matter data is incorrect or missing\n${frontMatterDiagnostics.join('\n')}`
      )
    }
  }

  return {
    /** Returns all modules. */
    all() {
      return Object.values(allFilteredData)
    },

    /** Returns a tree of all module metadata related to navigation. */
    tree() {
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
            const sourceFileData = allFilteredData[pathname]
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
                  allFilteredData[nextPathname] !== undefined
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
        allData.map((data) => data.examples)
      )
      return allExamples.flatMap((examples, index) =>
        examples.map((example) => [...allPaths[index], example.slug])
      )
    },

    /** Returns a module by pathname including metadata, examples, and previous/next modules. Defaults to `basePathname` if `pathname` is `undefined`. */
    async get(pathname: string | string[] | undefined) {
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
      const data = allFilteredData[stringPathname]

      if (data === undefined) {
        return
      }

      let {
        default: Content,
        headings = [],
        description,
        metadata = {},
        readingTime,
        ...moduleExports
      } = data.mdxPath
        ? await allModules[data.mdxPath]
        : {
            default: undefined,
            description: undefined,
            metadata: undefined,
            readingTime: undefined,
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

      /** Merge title and description into metadata if nothing was found. */
      if (!metadata.title) {
        metadata.title = data.title
      }
      if (!metadata.description) {
        metadata.description = description
      }

      return {
        title: data.title,
        label: data.label,
        description: data.description,
        order: data.order,
        depth: data.depth,
        exportedTypes: data.exportedTypes,
        executionEnvironment: data.executionEnvironment,
        pathname: data.pathname,
        sourcePath: data.sourcePath,
        previous: data.previous,
        next: data.next,
        isMainExport: data.isMainExport,
        updatedAt: data.updatedAt,
        createdAt: data.createdAt,
        authors: data.authors,
        frontMatter: data.frontMatter as Type['frontMatter'],
        readingTime: readingTime ? parseReadingTime(readingTime) : undefined,
        Content: async (props: { renderTitle?: boolean }) => {
          if (Content === undefined) {
            return null
          }
          if (process.env.NODE_ENV === 'development') {
            const { ContentRefresh } = await import(
              './components/ContentRefresh'
            )
            return React.createElement(
              React.Fragment,
              null,
              React.createElement(ContentRefresh, {
                mdxPath: data.mdxPath,
                tsPath: data.tsPath,
              }),
              React.createElement(Content, props)
            )
          }
          return React.createElement(Content, props)
        },
        examples,
        headings,
        metadata,
        ...moduleExports,
      }
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

    /** Returns an RSS feed based on all module metadata. */
    rss(options: FeedOptions) {
      return generateRssFeed<Type>(this.all(), options)
    },
  }
}

/** Merges multiple sources into a single source. */
export function mergeSources(...sources: ReturnType<typeof createSource>[]) {
  function all() {
    const combinedData = sources.flatMap((dataSource) => dataSource.all())

    combinedData.forEach((data, index) => {
      const previousData = combinedData[index - 1]
      const nextData = combinedData[index + 1]
      if (previousData) {
        data.previous = {
          label: previousData.label,
          pathname: previousData.pathname,
        }
      }
      if (nextData) {
        data.next = {
          label: nextData.label,
          pathname: nextData.pathname,
        }
      }
    })

    return combinedData
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

    const allData = all()
    const stringPathname = join(
      sep,
      Array.isArray(pathname) ? pathname.join(sep) : pathname
    )
    const currentIndex = allData.findIndex(
      (data) => data.pathname === stringPathname
    )
    const previousEntry = allData[currentIndex - 1]
    const nextEntry = allData[currentIndex + 1]

    if (previousEntry) {
      result.previous = {
        label: previousEntry.label,
        pathname: previousEntry.pathname,
      }
    }

    if (nextEntry) {
      result.next = {
        label: nextEntry.label,
        pathname: nextEntry.pathname,
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

  function rss(options: FeedOptions) {
    return generateRssFeed(all(), options)
  }

  return {
    all,
    tree,
    paths,
    examplePaths,
    get,
    getExample,
    rss,
  }
}

/** Formats a value for front matter. */
function formatFrontMatterValue(value: any): string {
  if (value instanceof Date) {
    return `new Date('${value}')`
  } else if (typeof value === 'boolean' || typeof value === 'number') {
    return `${value}`
  } else if (Array.isArray(value)) {
    return `[${value.map((item) => formatFrontMatterValue(item)).join(', ')}]`
  } else if (typeof value === 'object') {
    return `{${Object.entries(value)
      .map(([subKey, subValue]) => {
        return `${subKey}: ${formatFrontMatterValue(subValue)}`
      })
      .join(', ')}}`
  }
  return `"${value}"`
}

/** Formats reading time into a human-readable string. */
function formatReadingTime(value: number) {
  const minutes = Math.floor(value)
  const seconds = Math.round((value - minutes) * 60)
  return { minutes, seconds }
}

/** Converts reading time into ISO 8601 duration. */
function readingTimeToDuration({
  minutes,
  seconds,
}: {
  minutes: number
  seconds: number
}) {
  let duration = 'PT'
  if (minutes > 0) {
    duration += `${minutes}M`
  }
  if (seconds > 0) {
    duration += `${seconds}S`
  }
  return duration
}

/** Parses reading time into minutes and seconds. */
function parseReadingTime(readingTime: [number, number]) {
  const [minimum, maximum] = readingTime

  if (minimum === 0 && maximum === 0) {
    return
  }

  const averageReadingTime = formatReadingTime((minimum + maximum) / 2)

  return {
    minimum: formatReadingTime(minimum),
    maximum: formatReadingTime(maximum),
    average: averageReadingTime,
    duration: readingTimeToDuration(averageReadingTime),
  }
}

/** Generate an RSS feed based on `createSource` or `mergeSources` data. */
function generateRssFeed<Type extends { frontMatter: Record<string, any> }>(
  allData: ModuleData<Type>[],
  options: FeedOptions
) {
  if (process.env.MDXTS_SITE_URL === undefined) {
    throw new Error(
      '[mdxts] The `siteUrl` option in the `mdxts/next` plugin is required to generate an RSS feed.'
    )
  }

  const feed = new Feed({
    language: 'en',
    generator: 'MDXTS',
    link: process.env.MDXTS_SITE_URL,
    id: process.env.MDXTS_SITE_URL,
    ...options,
    feedLinks: {
      rss: new URL('/rss.xml', process.env.MDXTS_SITE_URL).href,
      ...options.feedLinks,
    },
  })

  allData.forEach((data) => {
    const url = new URL(data.pathname, process.env.MDXTS_SITE_URL).href
    const lastUpdatedDate = data.updatedAt || data.createdAt

    if (lastUpdatedDate) {
      feed.addItem({
        title: data.title,
        description: data.description,
        date: new Date(lastUpdatedDate),
        link: url,
        id: url,
      })
    }
  })

  return feed.rss2()
}

let theme: any = null

/**
 * Sets the current theme.
 * @internal
 */
export function setTheme(newTheme: any) {
  theme = newTheme
}

/**
 * Returns the current theme.
 * @internal
 */
export function getTheme() {
  return theme
}
