import type { Node } from 'mdast'
import type { VFile } from 'vfile'

/** Adds file meta data to all `Code` components. */
export function addFileMetaToCode() {
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
          {
            type: 'mdxJsxAttribute',
            name: 'sourcePath',
            value: file.path,
          },
          {
            type: 'mdxJsxAttribute',
            name: 'sourcePathLine',
            value: node.position.start.line,
          },
          {
            type: 'mdxJsxAttribute',
            name: 'sourcePathColumn',
            value: node.position.start.column,
          },
          ...node.attributes,
        ]
      }
    })
  }
}
