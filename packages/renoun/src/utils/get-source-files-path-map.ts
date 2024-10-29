import { filePathToPathname } from '../utils/file-path-to-pathname.js'
import type { Directory } from 'ts-morph'

/** Returns a map of source file paths to their pathname. */
export function getSourceFilesPathMap(
  baseDirectory: Directory,
  options?: {
    baseDirectory?: string
    basePath?: string
  }
): Map<string, string> {
  const sourcePathMap = new Map<string, string>()

  function collectSourceFiles(directory: Directory) {
    const directoryPath = directory.getPath()
    const directoryPathname = filePathToPathname(
      directoryPath,
      options?.baseDirectory,
      options?.basePath
    )

    sourcePathMap.set(directoryPath, directoryPathname)

    const sourceFiles = directory.getSourceFiles()

    for (const sourceFile of sourceFiles) {
      const filePath = sourceFile.getFilePath()
      const filePathname = filePathToPathname(
        filePath,
        options?.baseDirectory,
        options?.basePath
      )

      sourcePathMap.set(filePath, filePathname)
    }

    for (const subDirectory of directory.getDirectories()) {
      collectSourceFiles(subDirectory)
    }
  }

  collectSourceFiles(baseDirectory)

  return sourcePathMap
}
