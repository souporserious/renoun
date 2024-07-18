import type { Root, Heading } from 'mdast'

import { createSlug } from '../../utils/create-slug'

export type Headings = {
  id: any
  text: string
  depth: number
}[]

/** Adds an `id` to all headings and exports a `headings` prop. */
export function addHeadings() {
  return async function (tree: Root) {
    const { valueToEstree } = await import('estree-util-value-to-estree')
    const headings: Headings = []
    const headingCounts = new Map()

    const { visit } = await import('unist-util-visit')
    const { toString } = await import('mdast-util-to-string')

    visit(tree, 'heading', (node: Heading) => {
      const text = node.children.map((child) => toString(child)).join('')
      let id = createSlug(text)

      if (headingCounts.has(id)) {
        const count = headingCounts.get(id) + 1
        headingCounts.set(id, count)
        id = `${id}-${count}`
      } else {
        headingCounts.set(id, 1)
      }

      const heading = {
        text,
        id,
        depth: node.depth,
      }
      headings.push(heading)

      /* Add `id` to heading. */
      if (!node.data) {
        node.data = {}
      }
      if (!node.data.hProperties) {
        node.data.hProperties = {}
      }
      node.data.hProperties.id = heading.id
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

declare module 'mdast' {
  interface Data {
    hProperties?: Record<string, any>
  }
}
