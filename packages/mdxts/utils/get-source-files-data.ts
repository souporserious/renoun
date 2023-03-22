import type { Directory, SourceFile } from 'ts-morph'
import { bundle } from '../bundle'
import { getMetadata } from './get-metadata'
import { getTopLevelDirectories } from './get-top-level-directories'
import { sortChildren } from './sort-children'

/** Get data for all source files starting from top-level directories. */
export async function getSourceFilesData(
  sourceFiles: SourceFile[],
  { theme }: { theme: string }
) {
  const topLevelDirectories = getTopLevelDirectories(sourceFiles)
  const bundledFiles = await bundle({
    entryPoints: sourceFiles.map((sourceFile) => sourceFile.getFilePath()),
    theme,
  })

  function getDataForSourceFile(
    sourceFile: SourceFile,
    workingDirectory?: string
  ) {
    const result = bundledFiles.find(
      (file) => file.path === sourceFile.getFilePath()
    )

    if (result) {
      const metadata = getMetadata(sourceFile, workingDirectory)

      return {
        code: result.code,
        // references,
        // examples,
        ...metadata,
      }
    }
  }

  // Recursively traverse all descendant directory source files and generate metadata.
  function getDataForDirectory(directory: Directory, workingDirectory: string) {
    const sourceFiles = directory.getSourceFiles()
    const indexSourceFile = sourceFiles.find(
      (sourceFile) => sourceFile.getBaseNameWithoutExtension() === 'index'
    )
    const directorySourceFiles = sourceFiles.filter(
      (sourceFile) => sourceFile.getBaseNameWithoutExtension() !== 'index'
    )
    let data = indexSourceFile
      ? getDataForSourceFile(indexSourceFile, workingDirectory)
      : getMetadata(directory, workingDirectory)

    if (indexSourceFile) {
      const directoryMetadata = getMetadata(directory, workingDirectory)

      Object.assign(data, directoryMetadata, { sourcePath: data.sourcePath })
    }

    return {
      ...data,
      children: directory
        .getDirectories()
        .map((directory) => getDataForDirectory(directory, workingDirectory))
        .concat(
          directorySourceFiles.map((sourceFile) =>
            getDataForSourceFile(sourceFile, workingDirectory)
          )
        ),
    }
  }

  const data = topLevelDirectories.map((directory) =>
    getDataForDirectory(directory, directory.getPath())
  )

  sortChildren(data)

  return data
}
