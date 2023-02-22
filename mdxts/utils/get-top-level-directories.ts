import type { Directory, SourceFile } from 'ts-morph'

/** Get the top level directories for a collection of source files. */
export function getTopLevelDirectories(sourceFiles: SourceFile[]) {
  const allDirectories = new Set<Directory>()

  sourceFiles.forEach((sourceFile) => {
    allDirectories.add(sourceFile.getDirectory())
  })

  const topLevelDirectories = Array.from(allDirectories).filter((directory) => {
    return !allDirectories.has(directory.getParent())
  })

  return topLevelDirectories
}
