import { Node } from 'ts-morph'

/** Returns the name of a function, variable, class, or type alias declaration if applicable. */
export function getNameFromDeclaration(declaration: Node): string | null {
  if (Node.isVariableDeclaration(declaration)) {
    const initializer = declaration.getInitializer()
    return Node.isArrowFunction(initializer) ||
      Node.isFunctionExpression(initializer)
      ? declaration.getName()
      : null
  } else if (
    Node.isFunctionDeclaration(declaration) ||
    Node.isClassDeclaration(declaration) ||
    Node.isTypeAliasDeclaration(declaration) ||
    Node.isInterfaceDeclaration(declaration) ||
    Node.isEnumDeclaration(declaration)
  ) {
    return declaration.getName() || null
  }

  throw new Error(
    `omnidoc: Unsupported declaration kind: ${declaration.getKindName()}`
  )
}
