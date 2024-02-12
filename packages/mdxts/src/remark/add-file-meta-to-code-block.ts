import type { Node } from 'mdast'
import type { VFile } from 'vfile'

/** Adds file meta data to all code blocks and `CodeBlock` components. */
export function addFileMetaToCodeBlock() {
  return async function (tree: Node, file: VFile) {
    const { visit } = await import('unist-util-visit')

    visit(tree, 'code', (node: any) => {
      const sourcePathMeta = [
        `sourcePath="${file.path}"`,
        `sourcePathLine="${node.position.start.line - 2}"`,
        `sourcePathColumn="${node.position.start.column}"`,
        `workingDirectory="${file.dirname}"`,
      ].join(' ')
      node.meta = node.meta ? `${node.meta} ${sourcePathMeta}` : sourcePathMeta
    })

    visit(tree, 'mdxJsxFlowElement', (node: any) => {
      if (node.name === 'CodeBlock') {
        node.attributes = [
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
