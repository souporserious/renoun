import type { Root, Code } from 'mdast'
import type { VFile } from 'vfile'

export type CodeBlocks = {
  filename: string
  value: string
  props: Record<string, any>
}[]

/** Adds a `codeBlock` prop to `Playground` components and exports a `codeBlocks` constant. */
export function addCodeBlocks() {
  return async function (tree: Root, file: VFile) {
    const { valueToEstree } = await import('estree-util-value-to-estree')
    const { visit } = await import('unist-util-visit')

    visit(tree, 'mdxJsxFlowElement', (node: any) => {
      if (node.name === 'Playground') {
        const [firstChild] = node.children
        node.attributes = [
          {
            type: 'mdxJsxAttribute',
            name: 'codeBlock',
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

    const codeBlocks: Array<{
      filename: string
      value: string
      props: Record<string, any>
    }> = []

    visit(tree, 'code', (node: Code) => {
      const isJavaScriptLanguage = ['js', 'jsx', 'ts', 'tsx'].some(
        (extension) => extension === node.lang
      )

      if (isJavaScriptLanguage) {
        const props: Record<string, any> = {}

        node.meta?.split(' ').forEach((prop) => {
          const [key, value] = prop.split('=')
          props[key] =
            typeof value === 'undefined'
              ? true
              : value.replace(/^["']|["']$/g, '')
        })

        codeBlocks.push({
          filename: props.filename || `${file.path}.${codeBlocks.length}.tsx`,
          value: node.value,
          props,
        })
      }
    })

    tree.children.unshift({
      // @ts-expect-error
      type: 'mdxjsEsm',
      value: '',
      data: {
        // @ts-expect-error
        estree: {
          type: 'Program',
          body: [
            {
              type: 'ExportNamedDeclaration',
              declaration: {
                type: 'VariableDeclaration',
                declarations: [
                  {
                    type: 'VariableDeclarator',
                    id: {
                      type: 'Identifier',
                      name: 'codeBlocks',
                    },
                    init: valueToEstree(codeBlocks),
                  },
                ],
                kind: 'const',
              },
              specifiers: [],
              source: null,
            },
          ],
          sourceType: 'module',
          comments: [],
        },
      },
    })
  }
}
