import type { Root } from 'mdast'

/** Removes front matter from markdown content. */
export function removeFrontMatter() {
  return function (tree: Root) {
    let startIndex = -1
    let endIndex = -1

    // Bail if first element is not thematic break
    if (tree.children[0]?.type !== 'thematicBreak') {
      return
    }

    // Iterate over children to find the first two thematic breaks
    for (let index = 0; index < tree.children.length; index++) {
      if (tree.children[index].type === 'thematicBreak') {
        if (startIndex === -1) {
          startIndex = index
        } else {
          endIndex = index
          break
        }
      }
    }

    // If both a start and end index are found, remove the front matter
    if (startIndex > -1 && endIndex > -1) {
      tree.children.splice(startIndex, endIndex - startIndex + 1)
    }
  }
}
