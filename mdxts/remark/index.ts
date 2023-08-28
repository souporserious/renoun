import type Slugger from 'github-slugger'

let slugs: Slugger

import('github-slugger').then(({ default: Slugger }) => {
  slugs = new Slugger()
})

export type Headings = {
  id: any
  text: string
  depth: number
}[]

export function remarkPlugin() {
  return async (tree) => {
    slugs.reset()

    const { visit } = await import('unist-util-visit')
    const { toString } = await import('mdast-util-to-string')
    const headings = []

    /* Add default `lang` to code blocks. */
    visit(tree, 'code', (node) => {
      if (!node.lang) {
        node.lang = 'bash'
      }
    })

    visit(tree, 'heading', (node) => {
      const text = node.children.map((child) => toString(child)).join('')
      const heading = {
        text,
        id: slugs.slug(text),
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
