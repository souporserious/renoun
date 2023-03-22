import path from 'node:path'
import { kebabCase } from 'case-anything'
import title from 'title'
import { Directory, SourceFile } from 'ts-morph'
import { getSourcePath } from './get-source-path'

/** Generates compiled examples and gathers common metadata for a source file. */
export function getMetadata(
  sourceFileOrDirectory: SourceFile | Directory,
  workingDirectory: string
) {
  const basename =
    sourceFileOrDirectory instanceof Directory
      ? sourceFileOrDirectory.getBaseName()
      : sourceFileOrDirectory.getBaseNameWithoutExtension()
  const path =
    sourceFileOrDirectory instanceof Directory
      ? sourceFileOrDirectory.getPath()
      : sourceFileOrDirectory.getFilePath()
  const pathSegments = getPathSegments(path, workingDirectory)
  const strippedName = stripOrderPrefix(basename)
  const order = Number(basename.split(/\.|-/)[0])

  return {
    name: title(strippedName.replace(/-/g, ' ')),
    slug: kebabCase(strippedName),
    order: isNaN(order) ? 0 : order,
    sourcePath: getSourcePath(path),
    pathname: `/${pathSegments.join('/')}`,
    pathSegments,
  }
}

/** Parses path segments from source file path. */
function getPathSegments(filePath: string, workingDirectory: string) {
  return filePath
    .replace(workingDirectory, '')
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) =>
      kebabCase(
        path.basename(stripOrderPrefix(segment), path.extname(filePath))
      )
    )
}

/** Remove order prefix from base name if it exists (e.g. 01. or 01-) */
function stripOrderPrefix(name: string) {
  return name.replace(/^(\d+\.|-)/, '')
}
