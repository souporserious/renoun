import type { Code, Node } from 'mdast'
import type { VFile } from 'vfile'
import { getEditorPath } from '../utils'

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
            value:
              process.env.NODE_ENV === 'development'
                ? `${file.path}:${node.position.start.line}`
                : undefined,
          },
          ...node.attributes,
        ]
      }
    })
  }
}
