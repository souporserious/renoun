import { join, resolve, sep } from 'node:path'
import { readPackageUpSync } from 'read-package-up'

import { project } from '../components/project'
import { findCommonRootPath } from './find-common-root-path'
import { filePathToPathname } from './file-path-to-pathname'
import { getExamplesFromDirectory } from './get-examples'
import { getExportedSourceFiles } from './get-exported-source-files'
import { getExportedTypes } from './get-exported-types'

type Pathname = string
type ModuleImport = Promise<{ default: any } & Record<string, any>>

export function createDataSource({
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
      mdxPath?: string
      tsPath?: string
      isServerOnly?: boolean
      examples?: {
        name: string
        module: ModuleImport | null
        filePath: string
        pathname: string
      }[]
      exportedTypes?: (ReturnType<typeof getExportedTypes>[number] & {
        isMainExport: boolean
        pathname: string
      })[]
    }
  > = {}

  allPublicPaths.forEach((path) => {
    const pathname = filePathToPathname(path, baseDirectory, basePath)
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
      const exportedTypes = getExportedTypes(sourceFile).map(
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

      allData[pathname] = {
        ...previouseData,
        tsPath: path,
        isServerOnly,
        examples,
        exportedTypes,
      }
    }

    /** Handle MDX content */
    if (path.endsWith('.md') || path.endsWith('.mdx')) {
      // const mdxModule = allAbsoluteMdxModules[path]
      allData[pathname] = {
        ...previouseData,
        mdxPath: path,
      }
    }
  })

  console.log(allData)
}
