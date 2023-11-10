import type { Node } from 'mdast'
import type { VFile } from 'vfile'

/** Adds a `codeString` prop to `Playground` components. */
export function addCodeString() {
  return async function (tree: Node, file: VFile) {
    const { visit } = await import('unist-util-visit')

    visit(tree, 'mdxJsxFlowElement', (node: any) => {
      if (node.name === 'Playground') {
        const [firstChild] = node.children
        node.attributes = [
          {
            type: 'mdxJsxAttribute',
            name: 'codeString',
            value: file
              .toString()
              .slice(
                firstChild.position.start.offset,
                firstChild.position.end.offset
              ),
          },
          ...node.attributes,
        ]
      }
    })
  }
}
