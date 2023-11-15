import type { Headings } from './add-headings'

/** Exports `headings` as a constant. */
export function exportHeadings({ headings }: { headings: Headings }) {
  return async (tree: any) => {
    tree.children.unshift({
      type: 'mdxjsEsm',
      data: {
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
                      name: 'headings',
                    },
                    init: {
                      type: 'ArrayExpression',
                      elements: headings.map((heading) => ({
                        type: 'ObjectExpression',
                        properties: [
                          {
                            type: 'Property',
                            method: false,
                            shorthand: false,
                            computed: false,
                            key: {
                              type: 'Identifier',
                              name: 'text',
                            },
                            value: {
                              type: 'Literal',
                              value: heading.text,
                              raw: `"${heading.text}"`,
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
                              name: 'id',
                            },
                            value: {
                              type: 'Literal',
                              value: heading.id,
                              raw: `"${heading.id}"`,
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
                              name: 'depth',
                            },
                            value: {
                              type: 'Literal',
                              value: heading.depth,
                              raw: `${heading.depth}`,
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
