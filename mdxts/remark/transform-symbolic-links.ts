import type { Node, Parent, Text } from 'mdast'

/** Replace all symbolic links `[[link]]` with markdown links `[link](/link)`. */
export function transformSymbolicLinks() {
  return async (tree: Node) => {
    const { visitParents } = await import('unist-util-visit-parents')

    visitParents(tree, 'text', (node: Text, ancestors: Parent[]) => {
      const matches = node.value.match(/\[\[(.+?)\]\]/g)

      if (!matches) {
        return
      }

      const splitNodes: any[] = []
      let lastIndex = 0

      for (const match of matches) {
        const index = node.value.indexOf(match, lastIndex)
        const linkText = match.slice(2, -2)

        splitNodes.push({
          type: 'text',
          value: node.value.slice(lastIndex, index),
        })

        // Creating a markdown link instead of an HTML element
        splitNodes.push({
          type: 'link',
          url: `/${linkText}`,
          children: [{ type: 'text', value: linkText }],
        })

        lastIndex = index + match.length
      }

      splitNodes.push({
        type: 'text',
        value: node.value.slice(lastIndex),
      })

      const lastParent = ancestors[ancestors.length - 1]
      const startIndex = lastParent.children.indexOf(node)

      lastParent.children.splice(startIndex, 1, ...splitNodes)
    })
  }
}
