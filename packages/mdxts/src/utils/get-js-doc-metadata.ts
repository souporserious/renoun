import { Node } from 'ts-morph'

/** Gets the description and tags from a JSDoc comment for a node. */
export function getJsDocMetadata(node: Node): {
  description?: string
  tags?: {
    tagName: string
    text?: string
  }[]
} | null {
  if (Node.isVariableDeclaration(node)) {
    const declarationList = node.getParent()

    if (Node.isVariableDeclarationList(declarationList)) {
      const statement = declarationList.getParent()

      if (Node.isVariableStatement(statement)) {
        if (statement.getDeclarations().length > 1) {
          throw new Error(
            'Multiple declarations not supported in `getJsDocMetadata`.'
          )
        }

        node = statement
      }
    }
  }

  if (Node.isJSDocable(node)) {
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
        description: description || undefined,
        tags: tags.length > 0 ? tags : undefined,
      }
    }
  }

  return null
}
