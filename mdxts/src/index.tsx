import parseTitle from 'title'
import Slugger from 'github-slugger'
import type { ComponentType } from 'react'
import { kebabCase } from 'case-anything'
import { join, resolve, sep } from 'node:path'
import { Node } from 'ts-morph'
import type { SourceFile, ts } from 'ts-morph'
import 'server-only'

import type { CodeBlocks } from './remark/add-code-blocks'
import type { Headings } from './remark/add-headings'
import { project } from './components/project'
import { getExportedTypes } from './utils/get-exported-types'
import { getSourcePath } from './utils/get-source-path'
import { getAllData } from './utils/get-all-data'

const typeSlugs = new Slugger()

export type Module = {
  Content?: ComponentType
  title: string
  label: string
  description: string | null
  summary: string
  frontMatter?: Record<string, any>
  headings: Headings
  codeBlocks: CodeBlocks
  pathname: string
  sourcePath: string
  isServerOnly: boolean
  slug: string
  types:
    | (ReturnType<typeof getExportedTypes>[number] & {
        pathname: string
        sourcePath: string
      })[]
    | null
  examples:
    | {
        name: string
        slug: string
        module: Promise<Record<string, any>>
        pathname: string
        sourcePath: string
      }[]
    | null
  metadata?: { title: string; description: string }
}

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

    /** The base path to use for calculating navigation paths. */
    basePath?: string
  } = {}
) {
  let allModules = pattern as unknown as Record<
    string,
    Promise<{ default: any } & Record<string, any>> | null
  >

  if (typeof allModules === 'string') {
    throw new Error(
      'mdxts: createDataSource requires that the mdxts/loader package is configured as a Webpack loader.'
    )
  }

  const globPattern = options as unknown as string
  const { baseDirectory = '', basePath = '' } = (arguments[2] ||
    {}) as unknown as {
    baseDirectory: string
    basePath: string
  }
  const allData = getAllData({
    allModules,
    globPattern,
    baseDirectory,
    basePath,
  })

  /** Analyze TypeScript source files. */
  const sourceFiles = /ts(x)?/.test(globPattern)
    ? project.addSourceFilesAtPaths(globPattern)
    : null

  /** Merge in TypeSript source file paths and check if there's a matching MDX file */
  if (sourceFiles) {
    const exportedSourceFilePaths = getExportedSourceFilePaths(
      sourceFiles,
      baseDirectory
    )
    allModules = {
      ...allModules,
      ...Object.fromEntries(
        exportedSourceFilePaths.map((filePath) => {
          const mdxPath = resolve(
            process.cwd(),
            filePath.replace(/\.tsx?$/, '.mdx')
          )
          const mdxModuleKey = Object.keys(allModules).find((key) => {
            const resolvedKey = resolve(process.cwd(), key)
            return resolvedKey === mdxPath
          })

          if (mdxModuleKey && mdxModuleKey in allModules) {
            return [filePath, allModules[mdxModuleKey]]
          }

          return [filePath, null]
        })
      ),
    }
  }

  const allModulesKeysByPathname = Object.fromEntries(
    Object.keys(allModules)
      .sort()
      .map((key) => {
        const pathname = filePathToUrlPathname(key, baseDirectory)
        const normalizedPathname = pathname.replace(
          /^(index|readme)$/,
          basePath
        )
        const normalizedKey = key.replace(/index\.tsx?$/, 'README.mdx')
        return [normalizedPathname, normalizedKey]
      })
      .filter(Boolean) as [string, string][]
  )

  /** Parses and attaches metadata to a module. */
  async function parseModule(pathname?: string) {
    if (pathname === undefined) {
      return null
    }

    const moduleKey = allModulesKeysByPathname[pathname]
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
    } = (await allModules[moduleKey]) || { default: null }

    /** Append component prop type links to headings data. */
    if (data.types && data.types.length > 0) {
      typeSlugs.reset()

      headings = [
        ...(headings || []),
        {
          text: 'Exports',
          id: 'exports',
          depth: 2,
        },
        ...data.types.map((type) => ({
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
      title: data.title,
      label: data.label,
      description: data.description,
      pathname:
        basePath === pathname
          ? join(sep, basePath)
          : join(sep, basePath, pathname),
      headings,
      frontMatter: frontMatter || null,
      metadata,
      types: data.types,
      examples: data.examples,
      sourcePath: getSourcePath(resolve(process.cwd(), moduleKey)),
      ...exports,
    } as Module & Type
  }

  async function getPathData(
    /** The pathname of the active page. */
    pathname: string | string[]
  ): Promise<
    | (Module & {
        previous?: Module
        next?: Module
      })
    | null
  > {
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
      parseModule(stringPathname),
      parseModule(getSiblingPathname(activeIndex, -1)),
      parseModule(getSiblingPathname(activeIndex, 1)),
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
    async all(): Promise<any> {
      return allData
    },

    /** Returns a tree of all modules. */
    async tree(): Promise<any[]> {
      return sourceFilesToTree(allData, basePath)
    },

    /** Returns a module by pathname including metadata, examples, and previous/next modules. Defaults to `basePath` if `pathname` is undefined. */
    async get(pathname: string | string[] | undefined) {
      if (pathname === undefined) {
        pathname = basePath
      }

      const data = await getPathData(pathname)
      return data
    },

    /** Returns paths for all modules calculated from file system paths. */
    paths(): string[][] {
      return Object.keys(allData).map((pathname) =>
        pathname
          // Split pathname into an array
          .split(sep)
          // Remove empty strings
          .filter(Boolean)
      )
    },
  }
}

/** Converts a file system path to a URL-friendly pathname. */
function filePathToUrlPathname(filePath: string, baseDirectory?: string) {
  const parsedFilePath = filePath
    // Remove leading separator "./"
    .replace(/^\.\//, '')
    // Remove leading sorting number "01."
    .replace(/\/\d+\./g, sep)
    // Remove working directory
    .replace(
      baseDirectory
        ? `${resolve(process.cwd(), baseDirectory)}/`
        : process.cwd(),
      ''
    )
    // Remove base directory
    .replace(baseDirectory ? `${baseDirectory}/` : '', '')
    // Remove file extensions
    .replace(/\.[^/.]+$/, '')
    // Remove trailing "/readme" or "/index"
    .replace(/\/(readme|index)$/i, '')

  // Convert component names to kebab case for case-insensitive paths
  const segments = parsedFilePath.split(sep)

  return segments
    .map((segment) => (/[A-Z]/.test(segment[0]) ? kebabCase(segment) : segment))
    .filter(Boolean)
    .join(sep)
}

/** Cleans a filename for use as a slug or title. */
function cleanFilename(filename: string) {
  return (
    filename
      // Remove leading sorting number
      .replace(/^\d+\./, '')
      // Remove file extensions
      .replace(/\.[^/.]+$/, '')
  )
}

/** Determines if a string is in PascalCase. */
function isPascalCase(str: string) {
  const regex = /^[A-Z][a-zA-Z0-9]*$/
  return regex.test(str)
}

/** Determines if a symbol is private or not based on the JSDoc tag. */
function hasPrivateTag(node: Node<ts.Node> | null) {
  if (node && Node.isJSDocable(node)) {
    const jsDocTags = node.getJsDocs().flatMap((doc) => doc.getTags())
    return jsDocTags.some((tag) => tag.getTagName() === 'private')
  }
  return null
}

/** Returns the first heading title from top-level heading if present. */
function getHeadingTitle(headings: Headings) {
  const heading = headings?.at(0)
  return heading?.depth === 1 ? heading.text : null
}

/** Returns the source file paths that are exported from the index file. */
function getExportedSourceFilePaths(
  sourceFiles: SourceFile[],
  baseDirectory: string
) {
  const indexFiles = new Map()

  return sourceFiles
    .filter((sourceFile) => {
      const directory = sourceFile.getDirectory()
      let exportedModules = indexFiles.get(directory)

      if (!exportedModules) {
        exportedModules = new Set()
        indexFiles.set(directory, exportedModules)

        const indexFile =
          directory.addSourceFileAtPathIfExists('index.ts') ||
          directory.addSourceFileAtPathIfExists('index.tsx')

        if (indexFile) {
          indexFile.getExportedDeclarations().forEach((declarations) => {
            declarations.forEach((declaration) => {
              exportedModules.add(declaration.getSourceFile().getFilePath())
            })
          })
        }
      }

      sourceFile.getExportedDeclarations().forEach((declarations) => {
        declarations.forEach((declaration) => {
          const symbol = declaration.getSymbol()
          if (symbol && hasPrivateTag(declaration)) {
            exportedModules.delete(sourceFile.getFilePath())
          }
        })
      })

      return exportedModules.has(sourceFile.getFilePath())
    })
    .map((sourceFile) => {
      return sourceFile
        .getFilePath()
        .replace(resolve(process.cwd(), baseDirectory), baseDirectory)
    })
}

type AllSourceFiles = Awaited<
  ReturnType<ReturnType<typeof createDataSource>['all']>
>

/** Turns a collection of source files into a tree. */
function sourceFilesToTree(sourceFiles: AllSourceFiles, basePath: string) {
  const paths = Object.keys(sourceFiles)
  const tree: any[] = []

  for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    const currentPath = paths[pathIndex]
    const pathParts = currentPath.split(sep)
    const allPaths: Record<string, any> = {}
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
          pathname: join(sep, basePath, pathname),
          title: parseTitle(segment),
          children: [],
        }

        const sourceFile = sourceFiles[pathname]

        if (sourceFile) {
          Object.assign(node, sourceFile)
        }

        nodes.push(node)
      }

      allPaths[pathname] = node
      nodes = node.children
    }
  }

  return tree
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
