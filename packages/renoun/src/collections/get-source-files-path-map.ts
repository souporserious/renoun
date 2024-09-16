import type { Directory } from 'ts-morph'

import { filePathToPathname } from '../utils/file-path-to-pathname.js'

/** Returns a map of source file paths to their pathname. */
export function getSourcePathMap(
  baseDirectory: Directory,
  options?: {
    baseDirectory?: string
    basePath?: string
    packageName?: string
  }
): Map<string, string> {
  const sourcePathMap = new Map<string, string>()

  function collectSourceFiles(directory: Directory) {
    const directoryPath = directory.getPath()
    const directoryPathname = filePathToPathname(
      directoryPath,
      options?.baseDirectory,
      options?.basePath,
      options?.packageName
    )

    sourcePathMap.set(directoryPath, directoryPathname)

    const sourceFiles = directory.getSourceFiles()

    for (const sourceFile of sourceFiles) {
      const sourceFilePath = sourceFile.getFilePath()
      const pathname = filePathToPathname(
        sourceFilePath,
        options?.baseDirectory,
        options?.basePath,
        options?.packageName
      )

      const baseName = sourceFile.getBaseNameWithoutExtension().toLowerCase()

      // TODO: this can be removed once createSource is removed and filePathToPathname can be refactored
      if (baseName === 'index' || baseName === 'readme') {
        sourcePathMap.set(sourceFilePath, pathname + '/' + baseName)
      } else {
        sourcePathMap.set(sourceFilePath, pathname)
      }
    }

    for (const subDirectory of directory.getDirectories()) {
      collectSourceFiles(subDirectory)
    }
  }

  collectSourceFiles(baseDirectory)

  return sourcePathMap
}
