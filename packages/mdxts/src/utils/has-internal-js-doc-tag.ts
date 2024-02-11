import { Node } from 'ts-morph'

/** Determines if a declaration is internal or not based on JSDoc tag presence. */
export function hasInternalJsDocTag(node: Node) {
  if (Node.isJSDocable(node)) {
    const jsDocTags = node.getJsDocs().flatMap((doc) => doc.getTags())
    return jsDocTags.some((tag) => tag.getTagName() === 'internal')
  }
  return false
}
