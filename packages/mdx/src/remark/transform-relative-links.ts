import type { Root, Link } from 'mdast'
import { visit } from 'unist-util-visit'

/** Reformat all relative links that use ordered numbers and extensions. */
export default function transformRelativeLinks() {
  return (tree: Root) => {
    visit(tree, 'link', (node: Link) => {
      if (!/\d+.*\.(md|mdx)$/.test(node.url)) {
        return
      }

      const segments = node.url.replace(/\\/g, '/').split('/')

      for (let index = 0; index < segments.length; index++) {
        segments[index] = segments[index].replace(/^\d+\./, '')
      }

      node.url = segments.join('/').replace(/\.mdx?$/, '')
    })
  }
}
