import type { SourceFiles, SourceFile, Project } from 'mdxts'
import { bundle } from 'mdxts/bundle'
import { getMetadata } from 'mdxts/utils'

export default async function getDocs(sourceFiles: SourceFiles) {
  const topLevelDirectories = getTopLevelDirectories(sourceFiles)
  const workingDirectory = process.cwd() + '/docs'
  const mdxContents = await bundle({
    workingDirectory,
    entryPoints: sourceFiles.map((sourceFile) => sourceFile.getFilePath()),
  })

  function getDataForSourceFile(sourceFile: SourceFile) {
    const mdx = mdxContents.find((mdx) => mdx.path === sourceFile.getFilePath())

    if (mdx) {
      const metadata = getMetadata(sourceFile, workingDirectory)

      return {
        mdx: { code: mdx.code },
        // references,
        // examples,
        ...metadata,
      }
    }
  }

  // Recursively traverse all descendant directory source files and generate metadata.
  function getDataForDirectory(directory: Directory) {
    const sourceFiles = directory.getSourceFiles()
    const indexSourceFile = sourceFiles.find(
      (sourceFile) => sourceFile.getBaseName() === 'index'
    )
    const data = indexSourceFile
      ? getDataForSourceFile(indexSourceFile)
      : getMetadata(directory, workingDirectory)

    return {
      ...data,
      children: directory
        .getDirectories()
        .map(getDataForDirectory)
        .concat(
          sourceFiles
            .filter((sourceFile) => sourceFile.getBaseName() !== 'index')
            .map((sourceFile) => getDataForSourceFile(sourceFile))
        ),
    }
  }

  const data = topLevelDirectories.map(getDataForDirectory)

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
