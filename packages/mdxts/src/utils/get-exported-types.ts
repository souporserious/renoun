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
import { processType, hasJsDocTag } from '@tsxmod/utils'

export type ExportedType = NonNullable<ReturnType<typeof processType>> & {
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
          Node.isInterfaceDeclaration(declaration) ||
          Node.isTypeAliasDeclaration(declaration) ||
          Node.isEnumDeclaration(declaration) ||
          Node.isClassDeclaration(declaration)
        ) {
          const filePath = declaration.getSourceFile().getFilePath()
          const processedType = processType(declaration.getType(), declaration)

          if (!processedType) {
            throw new Error(
              `[mdxts]: Could not process type documentation for: ${name}`
            )
          }

          return {
            slug: kebabCase(name),
            filePath: filePath as string,
            ...processedType,
          } satisfies ExportedType
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
            throw new Error(
              `[mdxts]: Unsupported declaration while processing type documentation for:\n(kind: ${declarationOrExpression.getKindName()}) ${declarationOrExpression.getText()}\n\nPlease file an issue to add support or mark as @internal.`
            )
          }

          const filePath = declaration.getSourceFile().getFilePath()
          const processedType = processType(declaration.getType(), declaration)

          if (!processedType) {
            throw new Error(
              `[mdxts]: Could not process type documentation for: ${name}`
            )
          }

          return {
            slug: kebabCase(name),
            filePath: filePath as string,
            ...processedType,
          } satisfies ExportedType
        }

        throw new Error(
          `[mdxts]: Unsupported declaration while processing type documentation for: (kind: ${declaration.getKindName()}) ${declaration.getText()}\n\nPlease file an issue to add support or mark as @internal.`
        )
      })
    )
    .filter(Boolean) as unknown as ExportedType[]
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
