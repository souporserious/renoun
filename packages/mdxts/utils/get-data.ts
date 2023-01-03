import { capitalCase, kebabCase } from 'case-anything'
import type { SourceFile } from 'ts-morph'
import { getSourcePath } from './get-source-path'

// Common metadata for an MDX/TSX source file.
// - name: Capitalized name of the source file.
// - slug: Kebab-cased name of the source file.
// - path: Path to the source file in the local IDE or git repository.
// - order: Order of the source file in the directory.
// - basename: Base name of the source file.
// - extension: Extension of the source file.
// - source: Original source file.
// - compiled: Compiled source file.
// - examples: Examples for the source file.
// - references: References for the source file.
// - exports: Exports for the source file.

/** Generates compiled examples and gathers common metadata for a source file. */
export function getData(sourceFile: SourceFile) {
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
