import type { Root, Paragraph } from 'mdast'

/**
 * Exports a `description` constant based on a stringified version of the first paragraph.
 * Replaces newlines with spaces and colons at the end with periods.
 */
export function addDescription() {
  return async function (tree: Root) {
    const { valueToEstree } = await import('estree-util-value-to-estree')
    const { visit, EXIT } = await import('unist-util-visit')
    const { toString } = await import('mdast-util-to-string')
    let description: string | null = null

    visit(tree, 'paragraph', (node: Paragraph) => {
      if (description) return EXIT
      description = node.children
        .map((child) => toString(child))
        .join('')
        .replace(/\n/g, ' ') // Replace newlines with spaces
        .replace(/:$/, '.') // Replace a colon at the end with a period
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
                      name: 'description',
                    },
                    init: valueToEstree(description),
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
