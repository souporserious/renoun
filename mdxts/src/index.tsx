import parseTitle from 'title'
import Slugger from 'github-slugger'
import type { ComponentType } from 'react'
import { kebabCase } from 'case-anything'
import { basename, join, resolve, sep } from 'node:path'
import { Node, SyntaxKind } from 'ts-morph'
import type { ExportedDeclarations, JSDoc, SourceFile, ts } from 'ts-morph'
import 'server-only'

import type { CodeBlocks } from './remark/add-code-blocks'
import type { Headings } from './remark/add-headings'
import { project } from './components/project'
import { getExportedTypes } from './utils/get-exported-types'
import { getExamplesFromDirectory } from './utils/get-examples'
import { getSourcePath } from './utils/get-source-path'

const typeSlugs = new Slugger()

export type Module = {
  Content?: ComponentType
  title: string
  description: string | null
  summary: string
  frontMatter?: Record<string, any>
  headings: Headings
  codeBlocks: CodeBlocks
  pathname: string
  sourcePath: string
  isServerOnly: boolean
  slug: string
  exportedTypes:
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

    if (moduleKey === undefined) {
      return null
    }

    const sourceFile = sourceFiles?.find((sourceFile) => {
      return (
        filePathToUrlPathname(sourceFile.getFilePath(), baseDirectory) ===
        pathname
      )
    })
    const isServerOnly = sourceFile
      ? sourceFile.getImportDeclarations().some((importDeclaration) => {
          const moduleSpecifier = importDeclaration.getModuleSpecifierValue()
          return moduleSpecifier === 'server-only'
        })
      : null
    /**
     * If there is a source file resolve the "main" export which will either be the default export
     * or an export with the exact same name as the filename.
     */
    const defaultExportSymbol = sourceFile?.getDefaultExportSymbol()
    const exportedDeclarations = sourceFile?.getExportedDeclarations()
    const mainExportDeclaration = (
      exportedDeclarations
        ? Array.from(exportedDeclarations)
            .find(([name, [declaration]]) => {
              const baseFilename = basename(cleanFilename(moduleKey))
              return (
                defaultExportSymbol === declaration.getSymbol() ||
                name === baseFilename ||
                kebabCase(name) === baseFilename // normalize camel case function name against kebab case filename
              )
            })
            ?.at(1) // Get the declaration
            ?.at(0) // Get the first node
        : null
    ) as ExportedDeclarations | null
    const exportedTypes = sourceFile
      ? getExportedTypes(sourceFile).map(({ filePath, ...fileExport }) => {
          const pathname = filePathToUrlPathname(filePath, baseDirectory)
          return {
            ...fileExport,
            pathname:
              basePath === pathname
                ? join(sep, basePath)
                : join(sep, basePath, pathname),
            sourcePath: getSourcePath(filePath),
          }
        })
      : null
    const examples = sourceFile
      ? getExamplesFromDirectory(sourceFile.getDirectory()).map(
          (sourceFile) => {
            const pathname = filePathToUrlPathname(
              sourceFile.getFilePath(),
              baseDirectory
            )
            const moduleKey = allModulesKeysByPathname[pathname]
            const module = allModules[moduleKey]
            const name = sourceFile.getBaseNameWithoutExtension()
            return {
              name,
              pathname: basePath === pathname ? join(sep, basePath) : pathname,
              module,
              slug: kebabCase(name),
              sourcePath: getSourcePath(sourceFile.getFilePath()),
            }
          }
        )
      : null
    const filename = cleanFilename(moduleKey.split(sep).pop() || '')
    const filenameTitle = /(readme|index)$/i.test(filename)
      ? parseTitle(moduleKey.split(sep).slice(-2, -1).pop() || '')
      : isPascalCase(filename)
        ? filename
        : parseTitle(filename)
    const {
      default: Content,
      headings,
      metadata,
      frontMatter,
      ...exports
    } = (await allModules[moduleKey]) || { default: null }
    let resolvedHeadings = headings || []

    /** Append component prop type links to headings data. */
    if (exportedTypes && exportedTypes.length > 0) {
      typeSlugs.reset()

      resolvedHeadings = [
        ...(headings || []),
        {
          text: 'Exports',
          id: 'exports',
          depth: 2,
        },
        ...exportedTypes.map((type) => ({
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
      isServerOnly,
      title:
        metadata?.title ||
        getHeadingTitle(headings) ||
        (mainExportDeclaration
          ? getNameFromDeclaration(mainExportDeclaration) || filenameTitle
          : filenameTitle),
      description:
        metadata?.description ||
        getDescriptionFromDeclaration(mainExportDeclaration),
      pathname:
        basePath === pathname
          ? join(sep, basePath)
          : join(sep, basePath, pathname),
      headings: resolvedHeadings,
      frontMatter: frontMatter || null,
      metadata,
      exportedTypes,
      examples,
      sourcePath: getSourcePath(resolve(process.cwd(), moduleKey)),
      ...exports,
    } as Module & Type
  }

  /** Returns the active and sibling data based on the active pathname. */
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
    const activeIndex = Object.keys(allModulesKeysByPathname).findIndex(
      (dataPathname) => dataPathname.includes(stringPathname)
    )

    function getSiblingPathname(startIndex: number, direction: number) {
      const siblingIndex = startIndex + direction
      const siblingPathname = Object.keys(allModulesKeysByPathname)[
        siblingIndex
      ]
      const moduleKey = allModulesKeysByPathname[siblingPathname]

      /** Skip readme and index files since they relate to the directory. */
      if (
        moduleKey &&
        /(readme|index)$/i.test(basename(cleanFilename(moduleKey)))
      ) {
        return undefined
      }

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
    async all(): Promise<Record<string, Module & Type>> {
      /** Filter out example modules */
      const filteredKeys = Object.keys(allModulesKeysByPathname).filter(
        (pathname) => {
          const moduleKey = allModulesKeysByPathname[pathname]
          return moduleKey
            ? moduleKey.includes('examples')
              ? !/ts(x)?/.test(moduleKey)
              : true
            : true
        }
      )
      const filteredModules = await Promise.all(
        filteredKeys.map((pathname) => parseModule(pathname))
      )
      return Object.fromEntries(
        filteredKeys.map((pathname, index) => [
          pathname,
          filteredModules[index],
        ])
      ) as Record<string, Module & Type>
    },

    /** Returns a tree of all modules. */
    async tree(): Promise<any[]> {
      const all = await this.all()
      return sourceFilesToTree(all, basePath)
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
      return Object.keys(allModulesKeysByPathname)
        .filter((pathname) => {
          /** Skip readme and index files since they relate to the directory. */
          if (/(readme|index)$/i.test(pathname)) {
            return false
          }

          return true
        })
        .map((pathname) =>
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

/** Returns the first JSDoc as a description from a variable, function, or class declaration. */
function getDescriptionFromDeclaration(
  declaration: ExportedDeclarations | null
) {
  if (declaration === null) {
    return null
  }

  let jsDocs: JSDoc[] = []

  if (Node.isFunctionDeclaration(declaration)) {
    const implementation = declaration.getImplementation()
    jsDocs = implementation
      ? implementation.getJsDocs()
      : declaration.getJsDocs()
  } else if (Node.isVariableDeclaration(declaration)) {
    const variableStatement = declaration.getFirstAncestorByKind(
      SyntaxKind.VariableStatement
    )
    jsDocs = variableStatement ? variableStatement.getJsDocs() : []
  }

  return jsDocs.length > 0 ? jsDocs[0].getDescription().trim() : null
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

/** Returns the name of a function, variable, or class declaration. */
function getNameFromDeclaration(declaration: Node): string | undefined {
  switch (declaration.getKind()) {
    case SyntaxKind.FunctionDeclaration:
      return declaration.asKind(SyntaxKind.FunctionDeclaration)?.getName()
    case SyntaxKind.VariableDeclaration:
      const initializer = declaration
        .asKind(SyntaxKind.VariableDeclaration)
        ?.getInitializer()
      if (
        initializer?.getKind() === SyntaxKind.ArrowFunction ||
        initializer?.getKind() === SyntaxKind.FunctionExpression
      ) {
        return declaration.asKind(SyntaxKind.VariableDeclaration)?.getName()
      }
      break
    case SyntaxKind.ClassDeclaration:
      return declaration.asKind(SyntaxKind.ClassDeclaration)?.getName()
    default:
      throw new Error(
        `Unsupported declaration kind: ${declaration.getKindName()}`
      )
  }
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
