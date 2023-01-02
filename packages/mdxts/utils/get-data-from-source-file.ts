import { capitalCase, kebabCase } from 'case-anything'
import type { SourceFile } from 'ts-morph'
import { getSourcePath } from './get-source-path'

/** Generates compiled examples and gathers common metadata for a source file. */
export function getDataFromSourceFile(sourceFile: SourceFile) {
  let name = sourceFile.getBaseNameWithoutExtension()

  if (name === 'index') {
    name = sourceFile.getDirectory().getBaseName()
  }

  // Remove order prefix from path name if it exists (e.g. 01. or 01-)
  const strippedName = name.replace(/^(\d+\.|-)/, '')
  const order = Number(name.split(/\.|-/)[0]) ?? 0

  return {
    basename: name,
    extension: sourceFile.getExtension(),
    name: capitalCase(strippedName).replace(/-/g, ' '),
    slug: kebabCase(strippedName),
    path: getSourcePath(sourceFile.getFilePath()),
    order,
  }
}
