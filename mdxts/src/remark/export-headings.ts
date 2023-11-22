import type { Headings } from './add-headings'

/** Exports `headings` as a constant. */
export function exportHeadings({ headings }: { headings: Headings }) {
  return async (tree: any) => {
    const { valueToEstree } = await import('estree-util-value-to-estree')

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
                    init: valueToEstree(headings),
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
