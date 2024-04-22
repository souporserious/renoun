import type { SourceFile } from 'ts-morph'
import { Node, SyntaxKind } from 'ts-morph'

/* Get the bounding rectangle of all module import specifiers and identifiers in a source file. */
export function getSymbolBounds(sourceFile: SourceFile, isJsxOnly: boolean) {
  const importSpecifiers = isJsxOnly
    ? []
    : sourceFile
        .getImportDeclarations()
        .map((importDeclaration) => importDeclaration.getModuleSpecifier())
  const identifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)
  const importCount = sourceFile.getImportDeclarations().length
  const allNodes = [...importSpecifiers, ...identifiers]
  const bounds = allNodes
    .filter((node) => {
      const parent = node.getParent()
      const isJsxOnlyImport = isJsxOnly
        ? parent?.getKind() === SyntaxKind.ImportSpecifier ||
          parent?.getKind() === SyntaxKind.ImportClause
        : false

      return (
        !Node.isJSDocTag(parent) && !Node.isJSDoc(parent) && !isJsxOnlyImport
      )
    })
    .map((node) => {
      const start = node.getStart()
      const { line, column } = sourceFile.getLineAndColumnAtPos(start)
      const yOffset = isJsxOnly ? importCount + 2 : 1

      return {
        start,
        top: line - yOffset,
        left: column - 1,
        width: node.getWidth(),
      }
    })

  return bounds
}
