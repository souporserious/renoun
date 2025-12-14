import { getTsMorph } from './ts-morph.ts'
import type { Node } from './ts-morph.ts'

const tsMorph = getTsMorph()

/** Returns the name of a function, variable, class, or type alias declaration if applicable. */
export function getNameFromDeclaration(declaration: Node): string | null {
  if (tsMorph.Node.isVariableDeclaration(declaration)) {
    const initializer = declaration.getInitializer()
    return tsMorph.Node.isArrowFunction(initializer) ||
      tsMorph.Node.isFunctionExpression(initializer)
      ? declaration.getName()
      : null
  } else if (
    tsMorph.Node.isFunctionDeclaration(declaration) ||
    tsMorph.Node.isClassDeclaration(declaration) ||
    tsMorph.Node.isTypeAliasDeclaration(declaration) ||
    tsMorph.Node.isInterfaceDeclaration(declaration) ||
    tsMorph.Node.isEnumDeclaration(declaration)
  ) {
    return declaration.getName() || null
  }

  throw new Error(
    `renoun: Unsupported declaration kind: ${declaration.getKindName()}`
  )
}
