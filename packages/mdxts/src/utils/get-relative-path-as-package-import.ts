import { join, relative, resolve } from 'node:path'
import type { ImportDeclaration } from 'ts-morph'
import { minimatch } from 'minimatch'

import { getPackageMetadata } from './get-package-metadata'

/**
 * Returns the relative path as a package import specifier.
 * Converts paths from distribution files to their source equivalents based on package exports.
 */
export function getPathRelativeToPackage(
  importDeclaration: ImportDeclaration,
  sourceDirectory: string = 'src',
  outputDirectory: string = 'dist/src'
) {
  const sourceFile = importDeclaration.getSourceFile()
  const packageSourcePath = resolve(
    sourceFile.getDirectoryPath(),
    importDeclaration.getModuleSpecifierValue()
  )
  const packageOutputPath = packageSourcePath.replace(
    sourceDirectory,
    outputDirectory
  )
  // TODO: this can be slow to call for every import
  const packageMetadata = getPackageMetadata(packageSourcePath)

  if (!packageMetadata) {
    return importDeclaration.getModuleSpecifierValue()
  }

  const relativePackageOutputPath = relative(
    packageMetadata.directory,
    packageOutputPath
  )

  if (packageMetadata.exports) {
    for (const [key, value] of Object.entries(packageMetadata.exports)) {
      // Use join to normalize relative paths
      const exportPattern = join(
        typeof value === 'string' ? value : value?.import
      )
      const exportPath = resolve(packageMetadata.directory, exportPattern)

      if (
        exportPath === packageOutputPath ||
        exportPath === `${packageOutputPath}/index.js` ||
        minimatch(relativePackageOutputPath, exportPattern) ||
        minimatch(`${relativePackageOutputPath}/index.js`, exportPattern)
      ) {
        return key.replace('.', packageMetadata.name)
      }
    }
  }

  return importDeclaration.getModuleSpecifierValue()
}
