import type { Paragraph, Parent, Node } from 'mdast'

/** Removes the paragraph element added around list items and component children. */
export function removeParagraphs() {
  return async function (tree: Node) {
    const { visitParents } = await import('unist-util-visit-parents')

    visitParents(tree, 'paragraph', (node: Paragraph, ancestors: Parent[]) => {
      const { children } = node
      const [firstChild] = children
      const ancestor = ancestors[ancestors.length - 1]

      if (ancestor.type === 'listItem') {
        const { children } = node
        const startIndex = ancestor.children.indexOf(node)
        ancestor.children.splice(startIndex, 1, ...children)
      }

      if (
        ancestor.type === 'mdxJsxFlowElement' &&
        firstChild?.type === 'text' &&
        ancestor.position &&
        node.position
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
