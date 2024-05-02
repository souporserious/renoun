import type { Root } from 'mdast'
import type { VFile } from 'vfile'

import { getSourcePath } from '../../utils/get-source-path'

/** Adds file meta data to all code blocks and `CodeBlock` components. */
export function addFileMetaToCodeBlock({
  gitSource,
  gitBranch,
}: {
  gitSource: string
  gitBranch: string
}) {
  return async function (tree: Root, file: VFile) {
    const { visit } = await import('unist-util-visit')

    visit(tree, 'code', (node) => {
      if (!node.position) {
        return
      }

      const sourcePath = getSourcePath(
        file.path,
        node.position.start.line,
        node.position.start.column,
        gitSource,
        gitBranch
      )
      const sourcePathMeta = [
        `sourcePath="${sourcePath}"`,
        `workingDirectory="${file.dirname}"`,
      ].join(' ')
      node.meta = node.meta ? `${node.meta} ${sourcePathMeta}` : sourcePathMeta
    })

    visit(tree, 'mdxJsxFlowElement', (node: any) => {
      if (node.name === 'CodeBlock') {
        const sourcePath = getSourcePath(
          file.path,
          node.position.start.line,
          node.position.start.column,
          gitSource,
          gitBranch
        )
        node.attributes = [
          {
            type: 'mdxJsxAttribute',
            name: 'sourcePath',
            value: sourcePath,
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
