import type { Directory, SourceFile } from "ts-morph";

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

/** Get the source file of a directory if it exists. */
export function getDirectorySourceFile(directory: Directory) {
  let directorySourceFile: SourceFile | undefined

  for (const sourceFileName of directorySourceFileNames) {
    directorySourceFile = directory.getSourceFile(sourceFileName)

    if (directorySourceFile) {
      return directorySourceFile
    }
  }
}
