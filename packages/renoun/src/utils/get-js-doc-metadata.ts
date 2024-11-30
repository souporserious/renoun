import type { Node } from 'ts-morph'
import tsMorph from 'ts-morph'

/** Gets the description and tags from a JSDoc comment for a node. */
export function getJsDocMetadata(node: Node):
  | {
      description?: string
      tags?: {
        tagName: string
        text?: string
      }[]
    }
  | undefined {
  if (tsMorph.Node.isVariableDeclaration(node)) {
    const declarationList = node.getParent()

    if (tsMorph.Node.isVariableDeclarationList(declarationList)) {
      const statement = declarationList.getParent()

      if (tsMorph.Node.isVariableStatement(statement)) {
        if (statement.getDeclarations().length > 1) {
          throw new Error(
            'Multiple declarations not supported in `getJsDocMetadata`.'
          )
        }

        node = statement
      }
    }
  }

  if (tsMorph.Node.isJSDocable(node)) {
    const jsDocs = node.getJsDocs()
    const tags: { tagName: string; text?: string }[] = []
    let description = ''

    for (const doc of jsDocs) {
      const docDescription = doc.getDescription()

      if (docDescription) {
        description += (description ? '\n' : '') + docDescription
      }

      for (const tag of doc.getTags()) {
        tags.push({
          tagName: tag.getTagName(),
          text: tag.getCommentText(),
        })
      }
    }

    if (description || tags.length > 0) {
      return {
        description: description ? description.trim() : undefined,
        tags: tags.length > 0 ? tags : undefined,
      }
    }
  }
}
