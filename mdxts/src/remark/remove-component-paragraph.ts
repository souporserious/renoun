import type { Paragraph, Parent, Node } from 'mdast'

/** Removes the paragraph wrapper around an immediate component child. */
export function removeComponentParagraph() {
  return async function (tree: Node) {
    const { visitParents } = await import('unist-util-visit-parents')

    visitParents(tree, 'paragraph', (node: Paragraph, ancestors: Parent[]) => {
      const { children } = node
      const [firstChild] = children
      const ancestor = ancestors[ancestors.length - 1]

      if (
        ancestor.type === 'mdxJsxFlowElement' &&
        firstChild?.type === 'text'
      ) {
        const componentStartLine = ancestor.position.start.line
        const paragraphStartLine = node.position.start.line
        const isAncestorComponent = /^[A-Z]/.test((ancestor as any).name)
        const isImmediateChild = componentStartLine === paragraphStartLine - 1

        if (isAncestorComponent && isImmediateChild) {
          const startIndex = ancestor.children.indexOf(node)
          ancestor.children.splice(startIndex, 1, ...children)
        }
      }
    })
  }
}
