import type { Node } from 'ts-morph'
import tsMorph from 'ts-morph'

/** Extract a single export and its local dependencies from a source file. */
export function getExportDeclarationTextWithDependencies(
  exportDeclaration: Node
) {
  const identifier = exportDeclaration
    .getFirstDescendantByKindOrThrow(tsMorph.ts.SyntaxKind.Identifier)
    .getText()
  let sourceFile = exportDeclaration.getSourceFile()

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
      if (
        tsMorph.Node.isSourceFile(declaration) ||
        tsMorph.Node.isExpression(declaration)
      ) {
        return
      }

      const exportIdentifier = declaration.getFirstDescendantByKindOrThrow(
        tsMorph.ts.SyntaxKind.Identifier
      )

      if (exportIdentifier.getText() === identifier) {
        let node: Node = declaration

        if (tsMorph.Node.isVariableDeclaration(node)) {
          const declarationList = node.getParent()

          if (tsMorph.Node.isVariableDeclarationList(declarationList)) {
            const statement = declarationList.getParent()

            if (tsMorph.Node.isVariableStatement(statement)) {
              if (statement.getDeclarations().length > 1) {
                throw new Error(
                  '[renoun] Multiple declarations not supported in `getExportDeclarationTextWithDependencies`.'
                )
              }

              node = statement
            }
          }
        }

        /** Remove JSDoc comments if the declaration is JSDocable. */
        if (tsMorph.Node.isJSDocable(node)) {
          node.getJsDocs().forEach((jsDoc) => {
            jsDoc.remove()
          })
        }
      } else {
        /** Remove unrelated export declarations. */
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
