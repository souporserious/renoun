import type { Root } from 'mdast'

/** Wraps the first level one heading in a `ShouldRenderTitle` component imported from `mdxts`. */
export function addShouldRenderTitle() {
  return (tree: Root) => {
    for (let index = 0; index < tree.children.length; index++) {
      const node = tree.children[index]

      if (node.type === 'heading' && node.depth === 1) {
        tree.children[index] = {
          // @ts-expect-error
          type: 'mdxJsxFlowElement',
          name: 'ShouldRenderTitle',
          attributes: [
            {
              type: 'mdxJsxAttribute',
              name: 'renderTitle',
              value: {
                type: 'mdxJsxAttributeValueExpression',
                value: 'props.renderTitle',
                data: {
                  estree: {
                    type: 'Program',
                    sourceType: 'module',
                    body: [
                      {
                        type: 'ExpressionStatement',
                        expression: {
                          type: 'Identifier',
                          name: 'props.renderTitle',
                        },
                      },
                    ],
                    comments: [],
                  },
                },
              },
            },
          ],
          // @ts-expect-error
          children: [node],
        }

        tree.children.unshift({
          // @ts-expect-error
          type: 'mdxjsEsm',
          value:
            "import { ShouldRenderTitle } from 'mdxts/components/ShouldRenderTitle';",
          data: {
            // @ts-expect-error
            estree: {
              type: 'Program',
              body: [
                {
                  type: 'ImportDeclaration',
                  specifiers: [
                    {
                      type: 'ImportSpecifier',
                      imported: {
                        type: 'Identifier',
                        name: 'ShouldRenderTitle',
                      },
                      local: {
                        type: 'Identifier',
                        name: 'ShouldRenderTitle',
                      },
                    },
                  ],
                  source: {
                    type: 'Literal',
                    value: 'mdxts/components/ShouldRenderTitle',
                    raw: "'mdxts/components/ShouldRenderTitle'",
                  },
                },
              ],
              sourceType: 'module',
              comments: [],
            },
          },
        })

        break
      }
    }
  }
}
