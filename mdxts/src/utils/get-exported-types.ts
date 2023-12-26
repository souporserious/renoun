import { kebabCase } from 'case-anything'
import type { SourceFile } from 'ts-morph'
import { Node } from 'ts-morph'
import { getSymbolDescription, isJsxComponent } from '@tsxmod/utils'
import {
  getFunctionParameterTypes,
  type PropertyMetadata,
} from './get-function-parameter-types'

export type ExportedType = NonNullable<
  ReturnType<typeof getFunctionParameterTypes>
>

/** Gets all exported prop types from a source file. */
export function getExportedTypes(sourceFile: SourceFile) {
  return Array.from(sourceFile.getExportedDeclarations())
    .map(([name, [declaration]]) => {
      if (
        Node.isFunctionDeclaration(declaration) ||
        Node.isFunctionExpression(declaration) ||
        Node.isArrowFunction(declaration)
      ) {
        const filePath = declaration.getSourceFile().getFilePath()
        const types = getFunctionParameterTypes(declaration) || []
        const symbol = declaration.getSymbol()

        return {
          name,
          types: types as PropertyMetadata[],
          description: symbol ? getSymbolDescription(symbol) : null,
          isComponent: isJsxComponent(declaration),
          slug: kebabCase(name),
          filePath: filePath as string,
        }
      }
      return null
    })
    .filter(
      (
        source
      ): source is NonNullable<{
        name: string
        types: PropertyMetadata[]
        description: string | null
        isComponent: boolean
        slug: string
        filePath: string
      }> => {
        return Boolean(source)
      }
    )
}
