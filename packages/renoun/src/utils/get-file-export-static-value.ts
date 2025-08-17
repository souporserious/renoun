import type { Project } from 'ts-morph'
import tsMorph from 'ts-morph'

import { getFileExportDeclaration } from './get-file-exports.js'
import {
  resolveLiteralExpression,
  isLiteralExpressionValue,
  type LiteralExpressionValue,
} from './resolve-expressions.js'

/** Attempt to get a statically analyzable literal value for a file export. */
export async function getFileExportStaticValue(
  filePath: string,
  position: number,
  kind: tsMorph.SyntaxKind,
  project: Project
): Promise<LiteralExpressionValue> {
  let sourceFile = project.getSourceFile(filePath)

  if (!sourceFile) {
    sourceFile = project.addSourceFileAtPath(filePath)
  }

  if (!sourceFile) {
    throw new Error(`[renoun] Source file not found: ${filePath}`)
  }

  const exportDeclaration = getFileExportDeclaration(
    filePath,
    position,
    kind,
    project
  )
  let expression: tsMorph.Expression | undefined

  if (tsMorph.Node.isVariableDeclaration(exportDeclaration)) {
    expression = exportDeclaration.getInitializer()
  } else if (tsMorph.Node.isVariableStatement(exportDeclaration)) {
    const declarations = exportDeclaration
      .getDeclarationList()
      .getDeclarations()

    if (declarations.length > 1) {
      throw new Error(
        `[renoun] Multiple variable declarations found in variable statement which is not currently supported: ${exportDeclaration.getText()}`
      )
    }

    expression = declarations.at(0)!.getInitializer()
  } else if (tsMorph.Node.isExportAssignment(exportDeclaration)) {
    expression = exportDeclaration.getExpression()
  } else if (
    tsMorph.Node.isPropertyAssignment(exportDeclaration) ||
    tsMorph.Node.isShorthandPropertyAssignment(exportDeclaration)
  ) {
    expression = exportDeclaration.getInitializer()
  } else if (
    tsMorph.Node.isFunctionDeclaration(exportDeclaration) ||
    tsMorph.Node.isClassDeclaration(exportDeclaration)
  ) {
    // Not a literal-bearing declaration
    return undefined
  } else {
    // Not a supported literal-bearing declaration (types/interfaces/etc)
    return undefined
  }

  if (!expression) {
    return undefined
  }

  const value = resolveLiteralExpression(expression)
  return isLiteralExpressionValue(value) ? value : undefined
}
