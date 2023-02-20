import type { SourceFiles } from 'mdxts'
import { bundle } from 'mdxts/bundle'
import { getMetadata } from 'mdxts/utils'

export default async function getDocs(sourceFiles: SourceFiles) {
  const workingDirectory = process.cwd() + '/docs'
  const mdxContents = await bundle({
    workingDirectory,
    entryPoints: sourceFiles.map((sourceFile) => sourceFile.getFilePath()),
  })
  const directories = getDirectories(sourceFiles)

  function getDataForSourceFile(sourceFile: SourceFiles[number]) {
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

  /** Recursively generate metadata for source files nested by directory. */
  function getDataForDirectory(
    directory: ReturnType<SourceFiles[number]['getDirectory']>
  ) {
    const sourceFiles = directory.getSourceFiles()
    const indexSourceFile = sourceFiles.find(
      (sourceFile) => sourceFile.getBaseName() === 'index'
    )
    const data = indexSourceFile
      ? getDataForSourceFile(indexSourceFile)
      : getMetadata(directory, workingDirectory)

    return {
      ...data,
      children: sourceFiles
        .filter((sourceFile) => sourceFile.getBaseName() !== 'index')
        .map(getDataForSourceFile),
    }
  }

  const [root, ...descendants] = directories.map(getDataForDirectory)
  // @ts-expect-error
  const allChildren = root.children.concat(descendants)

  sortChildren(allChildren)

  return allChildren
}

/** Get unique directories from source files. */
function getDirectories(sourceFiles: SourceFiles) {
  const directories = new Set<ReturnType<SourceFiles[number]['getDirectory']>>()

  sourceFiles.forEach((sourceFile) => {
    directories.add(sourceFile.getDirectory())
  })

  return Array.from(directories)
}

/** Recursively sort children by order property. */
function sortChildren(children) {
  children.sort((a, b) => a.order - b.order)
  children.forEach((child) => {
    if (!child.children) return
    sortChildren(child.children)
  })
}
