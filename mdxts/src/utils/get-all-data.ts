import parseTitle from 'title'
import { basename, join, resolve, sep } from 'node:path'
import { readPackageUpSync } from 'read-package-up'
import type { SourceFile } from 'ts-morph'
import { getSymbolDescription, resolveExpression } from '@tsxmod/utils'

import { project } from '../components/project'
import { findCommonRootPath } from './find-common-root-path'
import { filePathToPathname } from './file-path-to-pathname'
import { getExamplesFromDirectory } from './get-examples'
import { getExportedSourceFiles } from './get-exported-source-files'
import { getExportedTypes } from './get-exported-types'
import { getMainExportDeclaration } from './get-main-export-declaration'
import { getNameFromDeclaration } from './get-name-from-declaration'

type Pathname = string
type ModuleImport = Promise<{ default: any } & Record<string, any>>

export function getAllData({
  allModules,
  globPattern,
  baseDirectory,
  basePath = '',
}: {
  /** A map of all MDX modules keyed by their pathname. */
  allModules: Record<Pathname, ModuleImport | null>

  /** The glob pattern used to calculate `allModules`. */
  globPattern: string

  /** The base directory to use when calculating source paths. */
  baseDirectory?: string

  /** The base path to use when calculating navigation paths. */
  basePath?: string
}) {
  const allAbsoluteModules = Object.fromEntries(
    Object.entries(allModules).map(([pathname, module]) => [
      resolve(process.cwd(), pathname), // use absolute paths for all modules
      module,
    ])
  )
  const typeScriptSourceFiles = /ts(x)?/.test(globPattern)
    ? project.addSourceFilesAtPaths(globPattern)
    : null
  const allPaths = [
    ...Object.keys(allAbsoluteModules),
    ...(typeScriptSourceFiles?.map((file) => file.getFilePath()) ?? []),
  ]
  const commonRootPath = findCommonRootPath(allPaths)
  const packageJsonExports = readPackageUpSync({
    cwd: commonRootPath,
  })?.packageJson.exports
  const entrySourceFiles = project.addSourceFilesAtPaths(
    packageJsonExports
      ? /** If package.json exports found use that for calculating public paths. */
        Object.keys(packageJsonExports).map((key) =>
          join(resolve(commonRootPath, key), 'index.(ts|tsx)')
        )
      : /** Otherwise default to a root index file. */
        resolve(commonRootPath, '**/index.(ts|tsx)')
  )
  const exportedSourceFiles = getExportedSourceFiles(entrySourceFiles)
  const allPublicPaths = entrySourceFiles
    .concat(exportedSourceFiles)
    .map((sourceFile) => sourceFile.getFilePath() as string)
    .concat(Object.keys(allAbsoluteModules))
  const allData: Record<
    Pathname,
    {
      title: string | null
      description: string | null
      order: number | null
      mdxPath?: string
      tsPath?: string
      isServerOnly?: boolean
      examples?: {
        name: string
        module: ModuleImport | null
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
    const pathname = filePathToPathname(path, baseDirectory, basePath)
    const order = getSortOrder(basename(path))
    const previouseData = allData[pathname]

    /** Handle TypeScript source files */
    if (path.endsWith('.ts') || path.endsWith('.tsx')) {
      const sourceFile = project.getSourceFileOrThrow(path)
      const examples = getExamplesFromDirectory(sourceFile.getDirectory()).map(
        (sourceFile) => {
          const filePath = sourceFile.getFilePath()
          const pathname = filePathToPathname(filePath, baseDirectory)
          const module = allAbsoluteModules[filePath]
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
      const isServerOnly = sourceFile
        .getImportDeclarations()
        .some((importDeclaration) => {
          const moduleSpecifier = importDeclaration.getModuleSpecifierValue()
          return moduleSpecifier === 'server-only'
        })
      const mainExportDeclaration = getMainExportDeclaration(sourceFile)
      const mainExportDeclarationSymbol = mainExportDeclaration?.getSymbol()
      const filename = sourceFile.getBaseNameWithoutExtension()
      const filenameTitle = /(readme|index)$/i.test(filename)
        ? parseTitle(sourceFile.getDirectory().getBaseName())
        : /^[A-Z][a-zA-Z0-9]*$/.test(filename) // don't parse if PascalCase
          ? filename
          : parseTitle(filename)
      const title = mainExportDeclaration
        ? getNameFromDeclaration(mainExportDeclaration) ?? filenameTitle
        : filenameTitle
      const description = mainExportDeclarationSymbol
        ? getSymbolDescription(mainExportDeclarationSymbol)
        : null

      allData[pathname] = {
        ...previouseData,
        title: title.replace(/-/g, ' '),
        description,
        isServerOnly,
        examples,
        types,
        tsPath: path,
      }
    }

    /** Handle MDX content */
    if (path.endsWith('.md') || path.endsWith('.mdx')) {
      const sourceFile = project.addSourceFileAtPath(path)
      const metadata = getMetadata(sourceFile)
      let title = findFirstHeading(sourceFile.getText())
      let description = null

      if (metadata?.title) {
        title = metadata.title
      }

      if (metadata?.description) {
        description = metadata.description
      }

      allData[pathname] = {
        ...previouseData,
        title,
        description,
        order,
        mdxPath: path,
      }
    }
  })

  return Object.fromEntries(
    Object.entries(allData).sort((a, b) => {
      if (a[1].order !== null && b[1].order !== null) {
        return a[1].order - b[1].order
      }
      return a[0].localeCompare(b[0])
    })
  )
}

/** Returns the sorting order of a filename. */
function getSortOrder(filename: string) {
  const match = filename.match(/^\d+/)
  return match ? parseInt(match[0], 10) : null
}

/** Returns the first heading in a Markdown string. */
function findFirstHeading(sourceFileText: string) {
  const headingRegex = /(^|\n)#+\s(.+)/
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
