import type { Project } from 'ts-morph'
import { Node, SyntaxKind } from 'ts-morph'
import { resolveExpression } from '@tsxmod/utils'

import type { CollectionOptions } from './index'

/** Finds all `createCollection` configurations. */
export function getCollectionConfigurations(project: Project) {
  const collectionConfigurations = new Map<
    string,
    Omit<CollectionOptions<any>, 'sort'> | undefined
  >()

  project
    .createSourceFile(
      '__createCollection.ts',
      `import { createCollection } from 'mdxts/collections';`,
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
            `[mdxts] Expected the first argument to be a string literal`
          )
        }

        const optionsArgument = callExpression.getArguments().at(1)

        if (Node.isObjectLiteralExpression(optionsArgument)) {
          options = resolveExpression(optionsArgument) as Omit<
            CollectionOptions<any>,
            'sort'
          >
        }

        collectionConfigurations.set(filePattern!, options)
      }
    })

  return collectionConfigurations
}
