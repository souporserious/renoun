import type { Project, NewExpression } from 'ts-morph'
import tsMorph from 'ts-morph'

export function getCollectionCallExpressions(project: Project) {
  const collectionSourceFile = project.createSourceFile(
    '__collection.ts',
    `import { Collection } from 'renoun/collections';`
  )
  const allCollections: NewExpression[] = []

  collectionSourceFile
    .getFirstDescendantByKindOrThrow(tsMorph.SyntaxKind.Identifier)
    .findReferencesAsNodes()
    .forEach((node) => {
      const newExpression = node.getParentOrThrow()

      if (tsMorph.Node.isNewExpression(newExpression)) {
        allCollections.push(newExpression)
      }
    })

  collectionSourceFile.delete()

  return allCollections
}
