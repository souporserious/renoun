import parseTitle from 'title'
import { dirname, join, posix, sep } from 'node:path'
import type { ExportedDeclarations, Project } from 'ts-morph'
import { SourceFile } from 'ts-morph'
import { getSymbolDescription, resolveLiteralExpression } from '@tsxmod/utils'
import matter from 'gray-matter'

import { filePathToPathname } from './file-path-to-pathname'
import { getExamplesFromSourceFile } from './get-examples'
import { getEntrySourceFiles } from './get-entry-source-files'
import { getExportedSourceFiles } from './get-exported-source-files'
import { getExportedTypes, type ExportedType } from './get-exported-types'
import { getGitMetadata } from './get-git-metadata'
import { getMainExportDeclaration } from './get-main-export-declaration'
import { getNameFromDeclaration } from './get-name-from-declaration'
import { getSourceFilesOrderMap as getSourceFilesSortOrder } from './get-source-files-sort-order'
import { getSourcePath } from './get-source-path'
import { getSharedDirectoryPath } from './get-shared-directory-path'
import { getPackageMetadata } from './get-package-metadata'

type DistributiveOmit<Type, Key extends PropertyKey> = Type extends any
  ? Omit<Type, Key>
  : never

export type Pathname = string

export type ModuleImport = Promise<Record<string, any>>

export type AllModules = Record<Pathname, () => ModuleImport>

/** Exported types with additional metadata. */
export type ModuleExportedTypes = DistributiveOmit<
  ExportedType & {
    pathname: string
    sourcePath: string
    isMainExport: boolean
  },
  'filePath'
>[]

/** A module data object that represents a TypeScript or MDX module. */
export type ModuleData<Type extends { frontMatter: Record<string, any> }> = {
  /** The title of the module. */
  title: string

  /** The label used for navigation. */
  label: string

  /** The description of the module. */
  description?: string

  /** The order of the module. */
  order: string

  /** The depth of the module in the file system. */
  depth: number

  /** The path to the MDX file if it exists. */
  mdxPath?: string

  /** The path to the TypeScript file if it exists. */
  tsPath?: string

  /** The pathname of the module. */
  pathname: string

  /** The absolute URL of the module. */
  url: string

  /** The previous module if it exists at the current position. */
  previous?: { label: string; pathname: string }

  /** The next module if it exists at the current position. */
  next?: { label: string; pathname: string }

  /** Source path of the module to the Git repository in production and local file system in development. */
  sourcePath: string

  /** Where the module is executed. */
  executionEnvironment?: 'server' | 'client' | 'isomorphic'

  /** Whether the module is the main export of the package or not. */
  isMainExport?: boolean

  /** The exported types of the module. */
  exportedTypes: ModuleExportedTypes
  // exportedTypes: any[]

  /** The examples associated with the module. */
  examples: ReturnType<typeof getExamplesFromSourceFile>
} & ReturnType<typeof getGitMetadata> &
  ('frontMatter' extends keyof Type
    ? Type
    : {
        /** The front matter of the module. */
        frontMatter: Record<string, any>
      })

export function getAllData<Type extends { frontMatter: Record<string, any> }>({
  allModules,
  globPattern,
  project,
  baseDirectory,
  basePathname = '',
  sourceDirectory = 'src',
  outputDirectory = 'dist',
  sort,
}: {
  /** A map of all MDX modules keyed by their pathname. */
  allModules: AllModules

  /** The glob pattern used to calculate `allModules`. */
  globPattern: string

  /** The ts-morph project to use for parsing source files. */
  project: Project

  /** The base directory to use when calculating source paths. */
  baseDirectory?: string

  /** The base path to use when calculating navigation paths. */
  basePathname?: string

  /** The source directory used to calculate package export paths. */
  sourceDirectory?: string

  /** The output directory or directories for built files used to calculate package export paths. */
  outputDirectory?: string | string[]

  /** A custom sort function to use when sorting the modules. */
  sort?: (a: ModuleData<Type>, b: ModuleData<Type>) => number
}) {
  const typeScriptSourceFiles = /ts(x)?/.test(globPattern)
    ? project.addSourceFilesAtPaths(globPattern.split(sep).join(posix.sep))
    : null
  const allModulePaths = Object.keys(allModules)
  const allPaths = [
    ...allModulePaths,
    ...(typeScriptSourceFiles?.map((file) => file.getFilePath()) ?? []),
  ]

  if (allPaths.length === 0) {
    throw new Error(
      `mdxts: Could not find any files matching ${globPattern}. Please provide a valid file pattern.`
    )
  }

  const sharedDirectoryPath = getSharedDirectoryPath(...allPaths)
  const packageMetadata = getPackageMetadata(...allPaths)
  const entrySourceFiles = getEntrySourceFiles(
    project,
    allPaths,
    sourceDirectory,
    outputDirectory
  )
  const exportedSourceFiles = getExportedSourceFiles(entrySourceFiles)
  const allPublicPaths = entrySourceFiles
    .concat(exportedSourceFiles)
    .map((sourceFile) => sourceFile.getFilePath() as string)
    .concat(allModulePaths)
    .filter((path) => !path.includes('.examples.tsx'))
  const allData: Record<Pathname, ModuleData<Type>> = {}
  const allPublicDeclarations: WeakMap<SourceFile, ExportedDeclarations[]> =
    new WeakMap()

  allPublicPaths.forEach((path) => {
    const type =
      path.endsWith('.ts') || path.endsWith('.tsx')
        ? 'ts'
        : path.endsWith('.md') || path.endsWith('.mdx')
          ? 'md'
          : null
    const pathname = filePathToPathname(
      path,
      baseDirectory,
      basePathname,
      packageMetadata?.name
    )
    const previouseData = allData[pathname]
    const sourceFile = project.addSourceFileAtPath(path)
    const sourceFileTitle = getSourceFileTitle(sourceFile)
    const sourcePath = getSourcePath(path)
    const metadata = getMetadata(sourceFile)
    const depth = pathname.split(posix.sep).length - 2
    let title =
      type === 'md'
        ? findFirstHeading(sourceFile.getText()) || sourceFileTitle
        : sourceFileTitle
    let label
    let description

    if (metadata?.title) {
      title = metadata.title
    }

    if (metadata?.label) {
      label = metadata.label
    } else {
      label = title
    }

    if (metadata?.description) {
      description = metadata.description
    }

    /** Handle TypeScript source files */
    if (type === 'ts') {
      const isIndex = sourceFile.getBaseNameWithoutExtension() === 'index'

      /** Cache all public declarations for later use when processing re-exported source files below */
      if (isIndex) {
        Array.from(sourceFile.getExportedDeclarations()).forEach(
          ([, declarations]) => {
            declarations.forEach((declaration) => {
              const publicDeclarations = allPublicDeclarations.get(
                declaration.getSourceFile()
              )

              if (publicDeclarations) {
                publicDeclarations.push(declaration)
              } else {
                allPublicDeclarations.set(declaration.getSourceFile(), [
                  declaration,
                ])
              }
            })
          }
        )
      }

      const mainExportDeclaration = getMainExportDeclaration(sourceFile)
      const mainExportDeclarationSymbol = mainExportDeclaration?.getSymbol()
      const mainExportDeclarationName = mainExportDeclarationSymbol?.getName()
      const sourceFilePath = sourceFile.getFilePath()
      const exportedTypes = getExportedTypes(
        sourceFile,
        allPublicDeclarations.get(sourceFile)
      ).map(({ filePath, ...exportedType }) => {
        const isPublic = allPublicPaths.includes(filePath)
        const pathname = filePathToPathname(
          isPublic ? filePath : sourceFilePath,
          baseDirectory,
          basePathname,
          packageMetadata?.name
        )
        return {
          ...exportedType,
          pathname,
          sourcePath: getSourcePath(filePath),
          isMainExport: mainExportDeclarationName
            ? mainExportDeclarationName === exportedType.name
            : false,
        }
      })
      const examples = getExamplesFromSourceFile(
        sourceFile,
        pathname,
        allModules
      )
      const isMainExport = packageMetadata?.name
        ? basePathname
          ? pathname === join(posix.sep, basePathname, packageMetadata.name)
          : pathname === join(posix.sep, packageMetadata.name)
        : false
      const importDeclarations = sourceFile.getImportDeclarations()
      const isServerOnly = importDeclarations.some((importDeclaration) => {
        const moduleSpecifier = importDeclaration.getModuleSpecifierValue()
        return moduleSpecifier === 'server-only'
      })
      const isClientOnly = importDeclarations.some((importDeclaration) => {
        const moduleSpecifier = importDeclaration.getModuleSpecifierValue()
        return moduleSpecifier === 'client-only'
      })
      const executionEnvironment = isServerOnly
        ? 'server'
        : isClientOnly
          ? 'client'
          : 'isomorphic'

      if (mainExportDeclaration) {
        const declarationName = getNameFromDeclaration(mainExportDeclaration)
        if (declarationName) {
          title = declarationName
        }
      }

      if (!description && mainExportDeclarationSymbol) {
        const symbolDescription = getSymbolDescription(
          mainExportDeclarationSymbol
        )
        if (symbolDescription) {
          description = symbolDescription
        }
      }

      allData[pathname] = {
        ...previouseData,
        tsPath: path,
        exportedTypes,
        examples,
        title,
        label,
        description,
        depth,
        executionEnvironment,
        isMainExport,
        pathname,
        sourcePath,
      }
    }

    /** Handle MDX content */
    if (type === 'md') {
      const { data } = matter(sourceFile.getText())

      allData[pathname] = {
        ...previouseData,
        mdxPath: path,
        exportedTypes: previouseData?.exportedTypes || [],
        examples: previouseData?.examples || [],
        description: previouseData?.description || description,
        frontMatter: data,
        title,
        label,
        depth,
        pathname,
        sourcePath,
      }
    }
  })

  // Add order, this must be done after all data has been collected and added to the project above
  const sharedDirectory = project.addDirectoryAtPath(sharedDirectoryPath)
  const sourceFilesSortOrder = getSourceFilesSortOrder(
    sharedDirectory,
    allPublicPaths
  )

  Object.values(allData).forEach((value) => {
    const sourcePath = (value.tsPath || value.mdxPath)!
    const isIndexOrReadme = /index|readme/i.test(sourcePath)

    if (value.isMainExport) {
      value.order = '0'
    } else if (isIndexOrReadme) {
      const directoryPath = dirname(sourcePath)
      if (directoryPath in sourceFilesSortOrder) {
        value.order = sourceFilesSortOrder[directoryPath]
      }
    } else {
      if (sourcePath in sourceFilesSortOrder) {
        value.order = sourceFilesSortOrder[sourcePath]
      }
    }
  })

  const sortedAndFilteredData = Object.entries(allData)
    .filter(
      // Filter out TypeScript modules that have no MDX content or exported types
      ([, data]) => data.mdxPath || data.exportedTypes.length > 0
    )
    .sort((a, b) => {
      // Give the main export the highest priority
      if (a[1].isMainExport) {
        return -1
      }
      if (b[1].isMainExport) {
        return 1
      }

      // Sort by order next if available
      if (a[1].order && b[1].order) {
        return a[1].order.localeCompare(b[1].order, undefined, {
          numeric: true,
        })
      }
      if (a[1].order) {
        return -1
      }
      if (b[1].order) {
        return 1
      }

      // Fallback to alphabetical order
      return a[0].localeCompare(b[0])
    })

  // Sort the data if a custom sort function is provided
  if (sort) {
    sortedAndFilteredData.sort((a, b) => sort(a[1], b[1]))
  }

  // Add previous/next data to each module now that they're sorted
  sortedAndFilteredData.forEach(([, data], index) => {
    const previousData = sortedAndFilteredData[index - 1]
    const nextData = sortedAndFilteredData[index + 1]
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

  // Calculate aggregate git metadata for MDX and TypeScript modules
  const parsedData = sortedAndFilteredData.map(([pathname, data]) => {
    let gitMetadata: ReturnType<typeof getGitMetadata> | null = null

    // Only calculate git metadata if it's requested
    const lazyGitMetadata = () => {
      if (gitMetadata === null) {
        gitMetadata = getGitMetadata(
          [data.tsPath, data.mdxPath].filter(Boolean) as string[]
        )
      }
      return gitMetadata
    }

    return [
      pathname,
      {
        ...data,
        get createdAt() {
          return lazyGitMetadata().createdAt
        },
        get updatedAt() {
          return lazyGitMetadata().updatedAt
        },
        get authors() {
          return lazyGitMetadata().authors
        },
        get url() {
          const siteUrl = process.env.MDXTS_SITE_URL
          if (!siteUrl) {
            throw new Error(
              '[mdxts] The `siteUrl` option in the `mdxts/next` plugin is required to generate the `url` field.'
            )
          }
          return `${siteUrl}${pathname}`
        },
      },
    ]
  })

  return Object.fromEntries(parsedData) as Record<Pathname, ModuleData<Type>>
}

/** Returns the title of a source file based on its filename. */
function getSourceFileTitle(sourceFile: SourceFile) {
  const baseName = sourceFile
    .getBaseNameWithoutExtension()
    .replace(/\d+\.?/g, '')
  return parseTitleFromBaseName(
    /(readme|index)$/i.test(baseName)
      ? sourceFile.getDirectory().getBaseName()
      : baseName
  )
}

/** Parses a title from a base name. */
function parseTitleFromBaseName(baseName: string) {
  // preserve PascalCase and camelCase names
  if (/^[A-Za-z][a-zA-Z0-9]*$/.test(baseName)) {
    return baseName
  }
  return parseTitle(baseName).replace(/-/g, ' ') // replace dashes with spaces
}

/** Returns the first h1 heading in a Markdown string. */
function findFirstHeading(sourceFileText: string) {
  const cleanSourceFileText = sourceFileText.replace(/```[\s\S]*?```/g, '')
  const headingRegex = /(^|\n)#\s(.+)/
  const match = cleanSourceFileText.match(headingRegex)
  if (match) {
    return match[2]
  }
  return null
}

/** Returns the metadata from a source file. */
function getMetadata(sourceFile: SourceFile) {
  const metadataExport = sourceFile.getVariableDeclaration('metadata')
  if (metadataExport) {
    if (sourceFile.getExtension() === '.mdx') {
      // since we're working with MDX and not a TypeScript file we need to trim the export to remove any trailing MDX that might be present
      const trailingCurlyBraceIndex = metadataExport.getText().lastIndexOf('}')

      if (trailingCurlyBraceIndex > -1) {
        const originalText = metadataExport.getText()
        metadataExport.replaceWithText(
          metadataExport.getText().slice(0, trailingCurlyBraceIndex + 1)
        )
        const metadata = resolveLiteralExpression(
          metadataExport.getInitializer()!
        )
        metadataExport.replaceWithText(originalText)
        return metadata as Record<string, any>
      }
    } else {
      const metadata = resolveLiteralExpression(
        metadataExport.getInitializer()!
      )
      return metadata as Record<string, any>
    }
  }
  return null
}
