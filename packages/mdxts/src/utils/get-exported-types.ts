import { kebabCase } from 'case-anything'
import type {
  FunctionDeclaration,
  FunctionExpression,
  ArrowFunction,
  TaggedTemplateExpression,
  CallExpression,
  SourceFile,
} from 'ts-morph'
import { Node } from 'ts-morph'
import {
  getTypeDocumentation,
  getSymbolDescription,
  isJsxComponent,
} from '@tsxmod/utils'

/** Gets all exported types from a source file. */
export function getExportedTypes(sourceFile: SourceFile) {
  return Array.from(sourceFile.getExportedDeclarations())
    .map(([name, [declaration]]) => {
      if (
        Node.isFunctionDeclaration(declaration) ||
        Node.isVariableDeclaration(declaration)
      ) {
        const declarationOrExpression = Node.isVariableDeclaration(declaration)
          ? declaration.getInitializerOrThrow()
          : declaration

        if (!isDeclarationOrExpression(declarationOrExpression)) {
          return null
        }

        const filePath = declaration.getSourceFile().getFilePath()
        const symbol = declaration.getSymbol()

        return {
          name,
          description: symbol ? getSymbolDescription(symbol) : null,
          types: getTypeDocumentation(declarationOrExpression) || [],
          isComponent: isJsxComponent(declaration),
          slug: kebabCase(name),
          filePath: filePath as string,
        }
      }

      return null
    })
    .filter((node): node is NonNullable<typeof node> => Boolean(node))
}

function isDeclarationOrExpression(
  node: Node
): node is
  | FunctionDeclaration
  | FunctionExpression
  | ArrowFunction
  | TaggedTemplateExpression
  | CallExpression {
  return (
    Node.isFunctionDeclaration(node) ||
    Node.isFunctionExpression(node) ||
    Node.isArrowFunction(node) ||
    Node.isTaggedTemplateExpression(node) ||
    Node.isCallExpression(node)
  )
}
