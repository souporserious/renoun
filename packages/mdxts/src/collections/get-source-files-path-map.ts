import type { Directory } from 'ts-morph'

import { filePathToPathname } from '../utils/file-path-to-pathname'
import { getDirectorySourceFile } from './get-directory-source-file'

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
    const directorySourceFile = getDirectorySourceFile(directory)

    if (directorySourceFile) {
      const directorySourceFilePath = directorySourceFile.getFilePath()
      const pathname = filePathToPathname(
        directorySourceFilePath,
        options?.baseDirectory,
        options?.basePath,
        options?.packageName
      )
      sourcePathMap.set(directorySourceFilePath, pathname)
    } else {
      const directoryPath = directory.getPath()
      const directoryPathname = filePathToPathname(
        directoryPath,
        options?.baseDirectory,
        options?.basePath,
        options?.packageName
      )
      sourcePathMap.set(directoryPath, directoryPathname)
    }

    const sourceFiles = directory.getSourceFiles()
    for (const sourceFile of sourceFiles) {
      if (sourceFile === directorySourceFile) {
        continue
      }
      const sourceFilePath = sourceFile.getFilePath()
      const pathname = filePathToPathname(
        sourceFilePath,
        options?.baseDirectory,
        options?.basePath,
        options?.packageName
      )
      sourcePathMap.set(sourceFilePath, pathname)
    }

    for (const subDirectory of directory.getDirectories()) {
      collectSourceFiles(subDirectory)
    }
  }

  collectSourceFiles(baseDirectory)

  return sourcePathMap
}
