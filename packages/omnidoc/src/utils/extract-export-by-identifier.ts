import type { SourceFile } from 'ts-morph'
import { Node, ts } from 'ts-morph'

/** Extract a single export and its local dependencies from a source file. */
export function extractExportByIdentifier(
  sourceFile: SourceFile,
  identifier: string
) {
  /** Copy the source file so it isn't mutated. */
  const baseName = sourceFile.getBaseNameWithoutExtension()

  sourceFile = sourceFile.copy(
    sourceFile.getFilePath().replace(baseName, `${baseName}.copy`)
  )

  /** Remove named exports: export { useHover } from 'hooks' */
  sourceFile.getExportDeclarations().forEach((declaration) => {
    declaration.remove()
  })

  /** Collect remaining exports and remove any declarations that don't have references. */
  sourceFile.getExportedDeclarations().forEach((declarations) => {
    declarations.forEach((declaration) => {
      if (Node.isSourceFile(declaration) || Node.isExpression(declaration)) {
        return
      }

      const exportIdentifier = declaration.getFirstDescendantByKind(
        ts.SyntaxKind.Identifier
      )!

      if (exportIdentifier.getText() !== identifier) {
        declaration.remove()
      }
    })
  })

  /** Finally, fix missing references until we have an equal result. */
  let lastFullText

  while (lastFullText !== sourceFile.getFullText()) {
    lastFullText = sourceFile.getFullText()
    sourceFile.fixUnusedIdentifiers()
  }

  /** Remove the copy now that we have the source text. */
  sourceFile.delete()

  return lastFullText.trim()
}
