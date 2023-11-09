import type { Node } from 'mdast'
import type { VFile } from 'vfile'

/** Adds a cwd prop to all `Code` components. */
export function addWorkingDirectoryToCode() {
  return async function (tree: Node, file: VFile) {
    const { visit } = await import('unist-util-visit')

    visit(tree, 'mdxJsxFlowElement', (node: any) => {
      if (node.name === 'Code') {
        node.attributes = [
          {
            type: 'mdxJsxAttribute',
            name: 'workingDirectory',
            value: file.dirname,
          },
          ...node.attributes,
        ]
      }
    })
  }
}
