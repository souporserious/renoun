import { join, resolve } from 'path'
import { Project, SourceFile } from 'ts-morph'

import { getPackageMetadata } from './get-package-metadata'
import { getSharedDirectoryPath } from './get-shared-directory-path'

const extensionPatterns = [
  '.{js,jsx,ts,tsx}',
  '.{examples,test}.{js,jsx,ts,tsx}',
]

/**
 * Filters paths and returns TypeScript source files based on the following entry points:
 * - Package.json exports
 * - Root index file
 * - Top-level directory files
 */
export function getEntrySourceFiles(
  project: Project,
  allPaths: string[],
  sourceDirectory: string = 'src',
  outputDirectory: string | string[] = 'dist'
): SourceFile[] {
  if (typeof outputDirectory === 'string') {
    outputDirectory = [outputDirectory]
  }

  const sharedDirectoryPath = getSharedDirectoryPath(...allPaths)
  const packageMetadata = getPackageMetadata(...allPaths)
  let entrySourceFiles: SourceFile[] = []

  // Use package.json exports for calculating public paths if they exist.
  if (packageMetadata?.exports) {
    for (const exportKey in packageMetadata.exports) {
      const exportValue = packageMetadata.exports[exportKey]
      let exportPath = exportValue

      if (typeof exportValue === 'object') {
        exportPath = exportValue.import
      }

      const sourceFilePaths = extensionPatterns
        .flatMap((pattern, index) =>
          (outputDirectory as string[]).map((directory) => {
            if (!exportPath.includes(directory)) {
              return
            }
            const exportPattern = exportPath
              .replace(directory, sourceDirectory)
              .replace(/\.js$/, pattern)
            const sourcePathPattern = resolve(
              packageMetadata.directory,
              exportPattern
            )
            // Include the first pattern and exclude examples and tests.
            return index === 0 ? sourcePathPattern : `!${sourcePathPattern}`
          })
        )
        .filter(Boolean) as string[]

      entrySourceFiles.push(...project.addSourceFilesAtPaths(sourceFilePaths))
    }
  } else {
    // Otherwise default to a common root index file.
    const defaultSourcePath = join(sharedDirectoryPath, 'index.{js,jsx,ts,tsx}')

    entrySourceFiles.push(...project.addSourceFilesAtPaths(defaultSourcePath))

    // If no root index files exist, assume the top-level directory files are all public exports.
    if (entrySourceFiles.length === 0) {
      entrySourceFiles = project.addSourceFilesAtPaths(
        extensionPatterns.map((pattern, index) => {
          const sourcePathPattern = join(sharedDirectoryPath, `*${pattern}`)
          return index === 0 ? sourcePathPattern : `!${sourcePathPattern}`
        })
      )
    }
  }

  return entrySourceFiles
}
