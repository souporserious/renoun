import parseTitle from 'title'
import { basename, join, resolve, sep } from 'node:path'
import { readPackageUpSync } from 'read-package-up'
import type { SourceFile } from 'ts-morph'
import { getSymbolDescription, resolveExpression } from '@tsxmod/utils'

import { project } from '../components/project'
import { getSourcePath } from '../utils/get-source-path'
import { findCommonRootPath } from './find-common-root-path'
import { filePathToPathname } from './file-path-to-pathname'
import { getExamplesFromDirectory } from './get-examples'
import { getExportedSourceFiles } from './get-exported-source-files'
import { getExportedTypes } from './get-exported-types'
import { getMainExportDeclaration } from './get-main-export-declaration'
import { getNameFromDeclaration } from './get-name-from-declaration'

export type Pathname = string

export type ModuleImport = Promise<Record<string, any>>

export type AllModules = Record<Pathname, ModuleImport>

export function getAllData({
  allModules,
  globPattern,
  baseDirectory,
  basePath = '',
}: {
  /** A map of all MDX modules keyed by their pathname. */
  allModules: AllModules

  /** The glob pattern used to calculate `allModules`. */
  globPattern: string

  /** The base directory to use when calculating source paths. */
  baseDirectory?: string

  /** The base path to use when calculating navigation paths. */
  basePath?: string
}) {
  const typeScriptSourceFiles = /ts(x)?/.test(globPattern)
    ? project.addSourceFilesAtPaths(globPattern)
    : null
  const allPaths = [
    ...Object.keys(allModules),
    ...(typeScriptSourceFiles?.map((file) => file.getFilePath()) ?? []),
  ]
  const commonRootPath = findCommonRootPath(allPaths)
  const packageJson = readPackageUpSync({
    cwd: commonRootPath,
  })?.packageJson
  const hasMainExport = packageJson
    ? packageJson.exports
      ? Boolean((packageJson.exports as Record<string, any>)['.'])
      : false
    : false
  const packageName = hasMainExport ? packageJson!.name : undefined
  const entrySourceFiles = project.addSourceFilesAtPaths(
    packageJson?.exports
      ? /** If package.json exports found use that for calculating public paths. */
        Object.keys(packageJson.exports).map((key) =>
          join(resolve(commonRootPath, key), 'index.(ts|tsx)')
        )
      : /** Otherwise default to a root index file. */
        resolve(commonRootPath, '**/index.(ts|tsx)')
  )
  const exportedSourceFiles = getExportedSourceFiles(entrySourceFiles)
  const allPublicPaths = entrySourceFiles
    .concat(exportedSourceFiles)
    .map((sourceFile) => sourceFile.getFilePath() as string)
    .concat(Object.keys(allModules))
  const allData: Record<
    Pathname,
    {
      title?: string
      label?: string
      description?: string
      order?: number
      mdxPath?: string
      tsPath?: string
      sourcePath?: string
      isMainExport?: boolean
      isServerOnly?: boolean
      examples?: {
        name: string
        module?: ModuleImport
        filePath: string
        pathname: string
      }[]
      types?: (ReturnType<typeof getExportedTypes>[number] & {
        isMainExport: boolean
        pathname: string
      })[]
    }
  > = {}

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
      basePath,
      packageName
    )
    const order = getSortOrder(basename(path))
    const previouseData = allData[pathname]
    const sourceFile = project.addSourceFileAtPath(path)
    const sourceFileTitle = getSourceFileTitle(sourceFile)
    const sourcePath = getSourcePath(path)
    const metadata = getMetadata(sourceFile)
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
      const examples = getExamplesFromDirectory(sourceFile.getDirectory()).map(
        (sourceFile) => {
          const filePath = sourceFile.getFilePath()
          const pathname = filePathToPathname(filePath, baseDirectory)
          const module = allModules[filePath]
          const name = sourceFile.getBaseNameWithoutExtension()
          return {
            name,
            module,
            filePath,
            pathname: basePath === pathname ? join(sep, basePath) : pathname,
          }
        }
      )
      const types = getExportedTypes(sourceFile).map(
        ({ filePath, ...fileExport }) => {
          const pathname = filePathToPathname(filePath, baseDirectory)
          return {
            ...fileExport,
            filePath,
            isMainExport: filePath === path,
            pathname:
              basePath === pathname
                ? join(sep, basePath)
                : join(sep, basePath, pathname),
          }
        }
      )
      const isMainExport = pathname === packageName
      const isServerOnly = sourceFile
        .getImportDeclarations()
        .some((importDeclaration) => {
          const moduleSpecifier = importDeclaration.getModuleSpecifierValue()
          return moduleSpecifier === 'server-only'
        })
      const mainExportDeclaration = getMainExportDeclaration(sourceFile)
      const mainExportDeclarationSymbol = mainExportDeclaration?.getSymbol()

      if (mainExportDeclaration) {
        const declarationName = getNameFromDeclaration(mainExportDeclaration)
        if (declarationName) {
          title = declarationName
        }
      }

      if (mainExportDeclarationSymbol) {
        const symbolDescription = getSymbolDescription(
          mainExportDeclarationSymbol
        )
        if (symbolDescription) {
          description = symbolDescription
        }
      }

      allData[pathname] = {
        ...previouseData,
        title,
        label,
        description,
        isMainExport,
        isServerOnly,
        examples,
        types,
        sourcePath,
        tsPath: path,
      }
    }

    /** Handle MDX content */
    if (type === 'md') {
      allData[pathname] = {
        ...previouseData,
        title,
        label,
        description,
        order,
        sourcePath,
        mdxPath: path,
      }
    }
  })

  return Object.fromEntries(
    Object.entries(allData).sort((a, b) => {
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
  )
}

/** Returns the sorting order of a filename. */
function getSortOrder(filename: string) {
  const match = filename.match(/^\d+/)
  return match ? parseInt(match[0], 10) : undefined
}

/** Returns the title of a source file based on its filename. */
function getSourceFileTitle(sourceFile: SourceFile) {
  const filename = sourceFile.getBaseNameWithoutExtension()
  const title = /(readme|index)$/i.test(filename)
    ? parseTitle(sourceFile.getDirectory().getBaseName())
    : /^[A-Z][a-zA-Z0-9]*$/.test(filename) // don't parse if PascalCase
      ? filename
      : parseTitle(filename)
  return title.replace(/-/g, ' ') // replace dashes with spaces
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
    const metadata = resolveExpression(metadataExport.getInitializer()!)
    return metadata as Record<string, any>
  }
  return null
}
