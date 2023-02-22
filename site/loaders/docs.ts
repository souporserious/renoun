import type { SourceFiles, SourceFile, Project } from 'mdxts'
import { bundle } from 'mdxts/bundle'
import { getMetadata } from 'mdxts/utils'

export default async function getDocs(sourceFiles: SourceFiles) {
  const topLevelDirectories = getTopLevelDirectories(sourceFiles)
  const bundledFiles = await bundle({
    entryPoints: sourceFiles.map((sourceFile) => sourceFile.getFilePath()),
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

type Directory = ReturnType<Project['getDirectory']>

/** Get the top level directories for a collection of source files. */
function getTopLevelDirectories(sourceFiles: SourceFiles) {
  const allDirectories = new Set<Directory>()

  sourceFiles.forEach((sourceFile) => {
    allDirectories.add(sourceFile.getDirectory())
  })

  const topLevelDirectories = Array.from(allDirectories).filter((directory) => {
    return !allDirectories.has(directory.getParent())
  })

  return topLevelDirectories
}

/** Recursively sort children by order property. */
function sortChildren(children) {
  children.sort((a, b) => a.order - b.order)
  children.forEach((child) => {
    if (!child.children) return
    sortChildren(child.children)
  })
}
