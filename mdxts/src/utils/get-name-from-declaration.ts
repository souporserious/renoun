import type { Node } from 'ts-morph'
import { SyntaxKind } from 'ts-morph'

/** Returns the name of a function, variable, or class declaration. */
export function getNameFromDeclaration(declaration: Node): string | null {
  switch (declaration.getKind()) {
    case SyntaxKind.FunctionDeclaration:
      return (
        declaration.asKind(SyntaxKind.FunctionDeclaration)?.getName() ?? null
      )
    case SyntaxKind.VariableDeclaration:
      const initializer = declaration
        .asKind(SyntaxKind.VariableDeclaration)
        ?.getInitializer()
      if (
        initializer?.getKind() === SyntaxKind.ArrowFunction ||
        initializer?.getKind() === SyntaxKind.FunctionExpression
      ) {
        return (
          declaration.asKind(SyntaxKind.VariableDeclaration)?.getName() ?? null
        )
      }
      return null
    case SyntaxKind.ClassDeclaration:
      return declaration.asKind(SyntaxKind.ClassDeclaration)?.getName() ?? null
    default:
      throw new Error(
        `Unsupported declaration kind: ${declaration.getKindName()}`
      )
  }
}
