import type { Node, Link } from 'mdast'

/** Reformat all relative links that use ordered numbers and extensions. */
export function transformRelativeLinks() {
  return async (tree: Node) => {
    const { visit } = await import('unist-util-visit')

    visit(tree, 'link', (node: Link) => {
      // Check if URL is relative and contains a numbered filename
      if (/^(\/|\.\/)\d+/.test(node.url)) {
        // Replace the prefixed number and extension in the URL
        node.url = node.url.replace(
          /^((\/|\.\/)?\d+\.(.*?))(\.mdx?|\.md)?$/,
          (_match, _p1, p2, p3) => `${p2 || ''}${p3}`
        )
      }
    })
  }
}
