import type { Project, CallExpression } from 'ts-morph'
import tsMorph from 'ts-morph'

export function getCollectionCallExpressions(project: Project) {
  const createCollectionSourceFile = project.createSourceFile(
    '__createCollection.ts',
    `import { createCollection } from 'renoun/collections';`
  )
  const allCollections: CallExpression[] = []

  createCollectionSourceFile
    .getFirstDescendantByKindOrThrow(tsMorph.SyntaxKind.Identifier)
    .findReferencesAsNodes()
    .forEach((node) => {
      const callExpression = node.getParentOrThrow()

      if (tsMorph.Node.isCallExpression(callExpression)) {
        allCollections.push(callExpression)
      }
    })

  createCollectionSourceFile.delete()

  return allCollections
}
