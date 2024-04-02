import type { Root, Link } from 'mdast'
import { sep } from 'node:path'

/** Reformat all relative links that use ordered numbers and extensions. */
export function transformRelativeLinks() {
  return async (tree: Root) => {
    const { visit } = await import('unist-util-visit')

    visit(tree, 'link', (node: Link) => {
      if (!/\d+.*\.(md|mdx)$/.test(node.url)) {
        return
      }

      const segments = node.url.split(sep)
      for (let index = 0; index < segments.length; index++) {
        segments[index] = segments[index].replace(/^\d+\./, '')
      }
      node.url = segments.join(sep).replace(/\.mdx?$/, '')
    })
  }
}
