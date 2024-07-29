import type { Directory } from 'ts-morph'
import { filePathToPathname } from '../utils/file-path-to-pathname'

/** Returns a map of source file paths to their pathname. */
export function getSourceFilesPathnameMap(
  baseDirectory: Directory,
  options?: {
    baseDirectory?: string
    basePathname?: string
    packageName?: string
  }
): Map<string, string> {
  const sourceFilesPathnameMap = new Map<string, string>()

  function collectSourceFiles(directory: Directory) {
    const sourceFiles = directory.getSourceFiles()
    for (const sourceFile of sourceFiles) {
      const sourceFilePath = sourceFile.getFilePath()
      const pathname = filePathToPathname(
        sourceFilePath,
        options?.baseDirectory,
        options?.basePathname,
        options?.packageName
      )
      sourceFilesPathnameMap.set(sourceFilePath, pathname)
    }

    const subDirectories = directory.getDirectories()
    for (const subDirectory of subDirectories) {
      collectSourceFiles(subDirectory)
    }
  }

  collectSourceFiles(baseDirectory)

  return sourceFilesPathnameMap
}
