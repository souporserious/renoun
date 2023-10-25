import type { Node, Heading } from 'mdast'
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

/** Adds `id` to all headings. */
export function addHeadingIds({ headings = [] }: { headings?: Headings }) {
  return async function (tree: Node) {
    slugs.reset()

    const { visit } = await import('unist-util-visit')
    const { toString } = await import('mdast-util-to-string')

    visit(tree, 'heading', (node: Heading) => {
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
  }
}

declare module 'mdast' {
  interface Data {
    hProperties?: Record<string, any>
  }
}
