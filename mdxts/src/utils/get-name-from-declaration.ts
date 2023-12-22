import type { Node } from 'ts-morph'
import { SyntaxKind } from 'ts-morph'

/** Returns the name of a function, variable, or class declaration. */
export function getNameFromDeclaration(declaration: Node): string | undefined {
  switch (declaration.getKind()) {
    case SyntaxKind.FunctionDeclaration:
      return declaration.asKind(SyntaxKind.FunctionDeclaration)?.getName()
    case SyntaxKind.VariableDeclaration:
      const initializer = declaration
        .asKind(SyntaxKind.VariableDeclaration)
        ?.getInitializer()
      if (
        initializer?.getKind() === SyntaxKind.ArrowFunction ||
        initializer?.getKind() === SyntaxKind.FunctionExpression
      ) {
        return declaration.asKind(SyntaxKind.VariableDeclaration)?.getName()
      }
      break
    case SyntaxKind.ClassDeclaration:
      return declaration.asKind(SyntaxKind.ClassDeclaration)?.getName()
    default:
      throw new Error(
        `Unsupported declaration kind: ${declaration.getKindName()}`
      )
  }
}
