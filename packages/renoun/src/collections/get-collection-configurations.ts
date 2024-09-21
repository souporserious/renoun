import type { Project } from 'ts-morph'
import { Node, SyntaxKind } from 'ts-morph'

import {
  resolveObjectLiteralExpression,
  isLiteralExpressionValue,
} from '../utils/resolve-expressions.js'
import type { CollectionOptions } from './index.js'

/**
 * Finds all `createCollection` configurations.
 * @internal
 */
export function getCollectionConfigurations(project: Project) {
  const collectionConfigurations = new Map<
    string,
    Omit<CollectionOptions<any>, 'sort'> | undefined
  >()

  project
    .createSourceFile(
      '__createCollection.ts',
      `import { createCollection } from 'renoun/collections';`,
      { overwrite: true }
    )
    .getFirstDescendantByKindOrThrow(SyntaxKind.Identifier)
    .findReferencesAsNodes()
    .forEach((node) => {
      const callExpression = node.getParent()

      if (Node.isCallExpression(callExpression)) {
        let filePattern: string | undefined
        let options: Omit<CollectionOptions<any>, 'sort'> | undefined
        const filePatternArgument = callExpression.getArguments().at(0)

        if (Node.isStringLiteral(filePatternArgument)) {
          filePattern = filePatternArgument.getLiteralText()
        } else {
          throw new Error(
            `[renoun] Expected the first argument to be a string literal`
          )
        }

        const optionsArgument = callExpression.getArguments().at(1)

        if (Node.isObjectLiteralExpression(optionsArgument)) {
          const literalOptions = resolveObjectLiteralExpression(optionsArgument)

          if (isLiteralExpressionValue(literalOptions)) {
            options = literalOptions as Omit<CollectionOptions<any>, 'sort'>
          } else {
            throw new Error(
              `[renoun] Expected the second argument to "createCollection" to be an object literal`
            )
          }
        }

        collectionConfigurations.set(filePattern!, options)
      }
    })

  return collectionConfigurations
}
