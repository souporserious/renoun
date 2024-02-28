import { kebabCase } from 'case-anything'
import type {
  ExportedDeclarations,
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
  hasJsDocTag,
  isJsxComponent,
} from '@tsxmod/utils'

export type ExportedType = {
  name: string
  description: string | null
  types: NonNullable<ReturnType<typeof getTypeDocumentation>>
  isComponent: boolean
  slug: string
  filePath: string
}

/** Gets all exported types from a source file. */
export function getExportedTypes(
  /** The source file to get exported types from. */
  sourceFile: SourceFile,

  /** Public declarations to filter by. */
  publicDeclarations?: ExportedDeclarations[]
): ExportedType[] {
  return Array.from(sourceFile.getExportedDeclarations())
    .filter(([, allDeclarations]) =>
      allDeclarations.every(
        (declaration) => !hasJsDocTag(declaration, 'internal')
      )
    )
    .flatMap(([name, allDeclarations]) =>
      allDeclarations.flatMap((declaration) => {
        if (publicDeclarations && !publicDeclarations.includes(declaration)) {
          return null
        }

        if (
          Node.isFunctionDeclaration(declaration) ||
          Node.isVariableDeclaration(declaration)
        ) {
          const declarationOrExpression = Node.isVariableDeclaration(
            declaration
          )
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
          } satisfies ExportedType
        }

        return null
      })
    )
    .filter(Boolean) as ExportedType[]
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
