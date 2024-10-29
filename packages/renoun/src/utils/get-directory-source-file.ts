import type { Directory, SourceFile } from 'ts-morph'

const indexFileNames = [
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'mjsx',
  'cjs',
  'cjsx',
  'mts',
  'mtsx',
  'cts',
  'ctsx',
  'md',
  'mdx',
].map((extension) => `index.${extension}`)

const readmeFileNames = ['md', 'mdx'].flatMap((extension) => [
  `readme.${extension}`,
  `README.${extension}`,
])

const directorySourceFileNames = indexFileNames.concat(readmeFileNames)

/**
 * Attempts to find a source file in a directory that matches one of the following:
 * - An index/readme file with a valid extension.
 * - The directory name with a valid extension.
 */
export function getDirectorySourceFile(
  directory: Directory,
  validExtensions: string[]
): SourceFile | undefined {
  const directoryName = directory.getBaseName()

  // Check for files with the same name as the directory, with valid extensions.
  for (const extension of validExtensions) {
    const exactMatchFileName = `${directoryName}.${extension}`
    const exactMatchFile = directory.getSourceFile(exactMatchFileName)
    if (exactMatchFile) {
      return exactMatchFile
    }
  }

  // Filter the default index/readme file names by valid extensions.
  const validFileNames = directorySourceFileNames.filter((fileName) =>
    validExtensions.some((extension) => fileName.endsWith(`.${extension}`))
  )

  // Check for index/readme files.
  for (const sourceFileName of validFileNames) {
    const directorySourceFile = directory.getSourceFile(sourceFileName)
    if (directorySourceFile) {
      return directorySourceFile
    }
  }
}
