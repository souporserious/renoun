import type { Root, Link } from 'mdast'
import { posix } from 'node:path'

/** Reformat all relative links that use ordered numbers and extensions. */
export function transformRelativeLinks() {
  return async (tree: Root) => {
    const { visit } = await import('unist-util-visit')

    visit(tree, 'link', (node: Link) => {
      if (!/\d+.*\.(md|mdx)$/.test(node.url)) {
        return
      }

      const segments = node.url.split(posix.sep)
      for (let index = 0; index < segments.length; index++) {
        segments[index] = segments[index].replace(/^\d+\./, '')
      }
      node.url = segments.join(posix.sep).replace(/\.mdx?$/, '')
    })
  }
}
