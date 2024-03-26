import parseTitle from 'title'
import { dirname, join, sep } from 'node:path'
import { readPackageUpSync } from 'read-package-up'
import type { ExportedDeclarations, Project } from 'ts-morph'
import { Directory, SourceFile } from 'ts-morph'
import { getSymbolDescription, resolveExpression } from '@tsxmod/utils'

import { findCommonRootPath } from './find-common-root-path'
import { filePathToPathname } from './file-path-to-pathname'
import { getExamplesFromSourceFile } from './get-examples'
import { getExportedSourceFiles } from './get-exported-source-files'
import { getExportedTypes } from './get-exported-types'
import { getGitMetadata } from './get-git-metadata'
import { getMainExportDeclaration } from './get-main-export-declaration'
import { getNameFromDeclaration } from './get-name-from-declaration'
import { getSourcePath } from './get-source-path'

export type Pathname = string

export type ModuleImport = Promise<Record<string, any>>

export type AllModules = Record<Pathname, ModuleImport>

export type ModuleData = {
  title: string
  label: string
  description?: string
  order: number
  depth: number
  mdxPath?: string
  tsPath?: string
  pathname: string
  url: string
  previous?: { label: string; pathname: string }
  next?: { label: string; pathname: string }
  sourcePath: string
  executionEnvironment?: 'server' | 'client' | 'isomorphic'
  isMainExport?: boolean
  exportedTypes: (Omit<
    ReturnType<typeof getExportedTypes>[number],
    'filePath'
  > & {
    pathname: string
    sourcePath: string
    isMainExport: boolean
  })[]
  examples: ReturnType<typeof getExamplesFromSourceFile>
} & ReturnType<typeof getGitMetadata>

export function getAllData({
  allModules,
  globPattern,
  project,
  sourceDirectory = 'src',
  baseDirectory,
  basePathname = '',
}: {
  /** A map of all MDX modules keyed by their pathname. */
  allModules: AllModules

  /** The glob pattern used to calculate `allModules`. */
  globPattern: string

  /** The ts-morph project to use for parsing source files. */
  project: Project

  /** The source directory used to calculate package export paths. */
  sourceDirectory?: string

  /** The base directory to use when calculating source paths. */
  baseDirectory?: string

  /** The base path to use when calculating navigation paths. */
  basePathname?: string
}) {
  const typeScriptSourceFiles = /ts(x)?/.test(globPattern)
    ? project.addSourceFilesAtPaths(globPattern)
    : null
  const allPaths = [
    ...Object.keys(allModules),
    ...(typeScriptSourceFiles?.map((file) => file.getFilePath()) ?? []),
  ]

  if (allPaths.length === 0) {
    throw new Error(
      `mdxts: Could not find any files matching ${globPattern}. Please provide a valid file pattern.`
    )
  }

  const commonRootPath = findCommonRootPath(allPaths)
  const { packageJson, path: packageJsonPath } = readPackageUpSync({
    cwd: commonRootPath,
  }) || { packageJson: undefined, path: undefined }
  const hasMainExport = packageJson
    ? packageJson.exports
      ? Boolean((packageJson.exports as Record<string, any>)['.'])
      : false
    : false
  const packageName = hasMainExport ? packageJson!.name : undefined
  let entrySourceFiles = project.addSourceFilesAtPaths(
    packageJson?.exports
      ? /** If package.json exports found use that for calculating public paths. */
        Object.keys(packageJson.exports).map((key) =>
          join(
            dirname(packageJsonPath),
            sourceDirectory,
            key,
            'index.{js,jsx,ts,tsx}'
          )
        )
      : /** Otherwise default to a common root index file. */
        join(commonRootPath, 'index.{js,jsx,ts,tsx}')
  )

  /** If no root index files exist, assume the top-level directory files are public exports. */
  if (
    typeScriptSourceFiles &&
    !packageJson?.exports &&
    entrySourceFiles.length === 0
  ) {
    entrySourceFiles = project.addSourceFilesAtPaths(
      join(commonRootPath, '*.{js,jsx,ts,tsx}')
    )
  }

  const exportedSourceFiles = getExportedSourceFiles(entrySourceFiles)
  const allPublicPaths = entrySourceFiles
    .concat(exportedSourceFiles)
    .map((sourceFile) => sourceFile.getFilePath() as string)
    .concat(Object.keys(allModules))
    .filter((path) => !path.includes('.examples.tsx'))
  const allData: Record<Pathname, ModuleData> = {}
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
      packageName
    )
    const previouseData = allData[pathname]
    const sourceFile = project.addSourceFileAtPath(path)
    const sourceFileTitle = getSourceFileTitle(sourceFile)
    const sourcePath = getSourcePath(path)
    const metadata = getMetadata(sourceFile)
    const depth = pathname.split(sep).length - 2
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
      const exportedTypes = getExportedTypes(
        sourceFile,
        allPublicDeclarations.get(sourceFile)
      ).map(({ filePath, ...fileExport }) => {
        const isPublic = allPublicPaths.includes(filePath)
        const pathname = filePathToPathname(
          isPublic ? filePath : sourceFile.getFilePath(),
          baseDirectory,
          basePathname,
          packageName
        )
        return {
          ...fileExport,
          pathname,
          sourcePath: getSourcePath(filePath),
          isMainExport: mainExportDeclarationName
            ? mainExportDeclarationName === fileExport.name
            : false,
        }
      })
      const examples = getExamplesFromSourceFile(sourceFile, allModules)
      const isMainExport = packageName
        ? basePathname
          ? pathname === join(sep, basePathname, packageName)
          : pathname === join(sep, packageName)
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
        pathname: pathname,
        sourcePath,
      }
    }

    /** Handle MDX content */
    if (type === 'md') {
      allData[pathname] = {
        ...previouseData,
        mdxPath: path,
        exportedTypes: previouseData?.exportedTypes || [],
        examples: previouseData?.examples || [],
        description: previouseData?.description || description,
        title,
        label,
        depth,
        pathname: pathname,
        sourcePath,
      }
    }
  })

  // Add order, this must be done after all data has been collected and added to the project above
  const commonDirectory = project.addDirectoryAtPath(commonRootPath)
  const sourceFilesSortOrder = getDirectorySourceFilesOrder(
    commonDirectory,
    allPublicPaths
  )

  Object.values(allData).forEach((value) => {
    const sourcePath = (value.tsPath || value.mdxPath)!
    const isIndexOrReadme = /index|readme/i.test(sourcePath)

    if (value.isMainExport) {
      value.order = 0
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
    .sort((a, b) => {
      // Give the main export the highest priority
      if (a[1].isMainExport) {
        return -1
      }
      if (b[1].isMainExport) {
        return 1
      }

      // Sort by order if available
      if (a[1].order && b[1].order) {
        return a[1].order - b[1].order
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
    .filter(([, data]) => data.mdxPath || data.exportedTypes.length > 0)

  // Add previous/next data to each module
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

  return Object.fromEntries(parsedData) as Record<Pathname, ModuleData>
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
  const headingRegex = /(^|\n)#\s(.+)/
  const match = sourceFileText.match(headingRegex)
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
        const metadata = resolveExpression(metadataExport.getInitializer()!)
        metadataExport.replaceWithText(originalText)
        return metadata as Record<string, any>
      }
    } else {
      const metadata = resolveExpression(metadataExport.getInitializer()!)
      return metadata as Record<string, any>
    }
  }
  return null
}

/** Returns a map of source file paths to their sort order. */
function getDirectorySourceFilesOrder(
  directory: Directory,
  allPublicPaths: string[]
): Record<string, number> {
  const orderMap: Record<string, number> = {}
  traverseDirectory(directory, '', orderMap, new Set(), allPublicPaths)
  return orderMap
}

/** Recursively traverses a directory, adding each file to the order map. */
function traverseDirectory(
  directory: Directory,
  prefix: string,
  orderMap: Record<string, number>,
  seenBaseNames: Set<string>,
  allPublicPaths: string[]
) {
  const isRoot = prefix === ''
  let index = 1

  if (!isRoot) {
    orderMap[directory.getPath()] = parseFloat(prefix.slice(0, -1)) // Remove trailing dot from prefix and convert to float
  }

  const directories = directory
    .getDirectories()
    .sort((a, b) => a.getBaseName().localeCompare(b.getBaseName()))
  const files = directory
    .getSourceFiles()
    .filter((file) => allPublicPaths.includes(file.getFilePath()))

  // Iterate through all files in the current directory
  for (const file of files) {
    // Extract the base part of the file name up to the first period e.g. `Button` from `Button.test.tsx`
    const baseName = file.getBaseName().split('.').at(0)
    if (baseName && !seenBaseNames.has(baseName)) {
      orderMap[file.getFilePath()] = parseFloat(`${prefix}${index}`)
      seenBaseNames.add(baseName)
      index++
    } else {
      orderMap[file.getFilePath()] = parseFloat(`${prefix}${index - 1}`)
    }
  }

  // Iterate through subdirectories
  for (const subdirectory of directories) {
    traverseDirectory(
      subdirectory,
      `${prefix}${index}.`,
      orderMap,
      new Set(),
      allPublicPaths
    )
    index++
  }
}
