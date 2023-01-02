import { capitalCase, kebabCase } from 'case-anything'
import type { SourceFile } from 'ts-morph'
import { getSourceLink } from './get-source-link'

/** Generates common metadata from a source file. */
export function getMetaFromSourceFile(sourceFile: SourceFile) {
  let name = sourceFile.getBaseNameWithoutExtension()

  if (name === 'index') {
    name = sourceFile.getDirectory().getBaseName()
  }

  // Remove prefix from path name if it exists (e.g. 01. or 01-)
  const strippedName = name.replace(/^(\d+\.|-)/, '')
  const order = Number(name.split(/\.|-/)[0]) ?? 0

  return {
    basename: name,
    extension: sourceFile.getExtension(),
    name: capitalCase(strippedName).replace(/-/g, ' '),
    slug: kebabCase(strippedName),
    path: getSourceLink(sourceFile.getFilePath()),
    order,
  }
}
