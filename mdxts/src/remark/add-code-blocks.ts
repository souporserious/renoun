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
                    init: {
                      type: 'ArrayExpression',
                      elements: codeBlocks.map((codeBlock) => ({
                        type: 'ObjectExpression',
                        properties: [
                          {
                            type: 'Property',
                            method: false,
                            shorthand: false,
                            computed: false,
                            key: {
                              type: 'Identifier',
                              name: 'value',
                            },
                            value: {
                              type: 'Literal',
                              value: codeBlock.value,
                              raw: '`' + codeBlock.value + '`',
                            },
                            kind: 'init',
                          },
                          {
                            type: 'Property',
                            method: false,
                            shorthand: false,
                            computed: false,
                            key: {
                              type: 'Identifier',
                              name: 'filename',
                            },
                            value: {
                              type: 'Literal',
                              value: codeBlock.filename,
                              raw: `"${codeBlock.filename}"`,
                            },
                            kind: 'init',
                          },
                        ],
                      })),
                    },
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
