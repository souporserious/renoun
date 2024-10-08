import type { Project, CallExpression } from 'ts-morph'
import tsMorph from 'ts-morph'

export function getCollectionCallExpressions(project: Project) {
  const collectionSourceFile = project.createSourceFile(
    '__collection.ts',
    `import { collection } from 'renoun/collections';`
  )
  const allCollections: CallExpression[] = []

  collectionSourceFile
    .getFirstDescendantByKindOrThrow(tsMorph.SyntaxKind.Identifier)
    .findReferencesAsNodes()
    .forEach((node) => {
      const callExpression = node.getParentOrThrow()
      if (tsMorph.Node.isCallExpression(callExpression)) {
        const [firstArgument] = callExpression.getArguments()

        if (tsMorph.Node.isObjectLiteralExpression(firstArgument)) {
          allCollections.push(callExpression)
        }
      }
    })

  collectionSourceFile.delete()

  return allCollections
}
