import type { Root, Paragraph, Parent } from 'mdast'
import { visitParents } from 'unist-util-visit-parents'

/** Removes the paragraph element added around immediate JSX children. */
export default function removeImmediateParagraphs() {
  return function (tree: Root) {
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
