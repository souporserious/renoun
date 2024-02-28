import { Node } from 'ts-morph'

/** Determines if a node has a specific JSDoc tag present. */
export function hasJsDocTag(node: Node, tagName: string) {
  let declaration = node

  if (Node.isVariableDeclaration(node)) {
    const ancestor = node.getFirstAncestor(
      (ancestor) => !Node.isSourceFile(ancestor) && Node.isJSDocable(ancestor)
    )
    if (ancestor) {
      declaration = ancestor
    }
  }

  if (Node.isJSDocable(declaration)) {
    const jsDocTags = declaration.getJsDocs().flatMap((doc) => doc.getTags())
    return jsDocTags.some((tag) => tag.getTagName() === tagName)
  }

  return false
}

/** Determines if a declaration is internal or not based on JSDoc tag presence. */
export function hasInternalJsDocTag(node: Node) {
  return hasJsDocTag(node, 'internal')
}
