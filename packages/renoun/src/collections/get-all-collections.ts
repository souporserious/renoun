import type { Project, ObjectLiteralExpression } from 'ts-morph'
import tsMorph from 'ts-morph'

import {
  resolveObjectLiteralExpression,
  isLiteralExpressionValue,
} from '../utils/resolve-expressions.js'
import type { CollectionOptions } from './index.js'

export function getAllCollections(project: Project) {
  const createCollectionSourceFile = project.createSourceFile(
    '__createCollection.ts',
    `import { createCollection } from 'renoun/collections';`
  )
  const allCollections: {
    filePattern: string
    optionsArgument: ObjectLiteralExpression
    options: Omit<CollectionOptions<any>, 'sort'> | undefined
  }[] = []

  createCollectionSourceFile
    .getFirstDescendantByKindOrThrow(tsMorph.SyntaxKind.Identifier)
    .findReferencesAsNodes()
    .forEach((node) => {
      const callExpression = node.getParentOrThrow()

      if (tsMorph.Node.isCallExpression(callExpression)) {
        let filePattern: string | undefined
        let options: Omit<CollectionOptions<any>, 'sort'> | undefined
        const filePatternArgument = callExpression.getArguments().at(0)

        if (tsMorph.Node.isStringLiteral(filePatternArgument)) {
          filePattern = filePatternArgument.getLiteralText()
        } else {
          throw new Error(
            `[renoun] Expected the first argument to be a string literal`
          )
        }

        let optionsArgument = callExpression
          .getArguments()
          .at(1) as ObjectLiteralExpression

        // Add empty object literal if no options are provided
        if (!tsMorph.Node.isObjectLiteralExpression(optionsArgument)) {
          optionsArgument = callExpression.addArgument(
            '{}'
          ) as ObjectLiteralExpression
        }

        const literalOptions = resolveObjectLiteralExpression(optionsArgument)

        if (isLiteralExpressionValue(literalOptions)) {
          options = literalOptions as Omit<CollectionOptions<any>, 'sort'>
        } else {
          throw new Error(
            `[renoun] Expected the second argument to "createCollection" to be an object literal`
          )
        }

        allCollections.push({
          filePattern: filePattern!,
          optionsArgument,
          options,
        })
      }
    })

  createCollectionSourceFile.delete()

  return allCollections
}
