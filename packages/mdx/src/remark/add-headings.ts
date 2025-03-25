import 'mdast-util-mdx'
import type { Root, Heading } from 'mdast'
import type { VFile } from 'vfile'
import { valueToEstree } from 'estree-util-value-to-estree'
import { define } from 'unist-util-mdx-define'
import { toString } from 'mdast-util-to-string'
import { visit } from 'unist-util-visit'

declare module 'mdast' {
  interface Data {
    hProperties?: Record<string, any>
  }
}

/** An array of headings metadata. */
export type MDXHeadings = {
  id: any
  text: string
  depth: number
}[]

/** Adds an `id` to all headings and exports a `headings` prop. */
export default function addHeadings() {
  return function (tree: Root, file: VFile) {
    const headings: MDXHeadings = []
    const headingCounts = new Map()

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

    define(tree, file, {
      headings: valueToEstree(headings),
    })
  }
}

/** Create a slug from a string. */
function createSlug(input: string) {
  return input
    .replace(/([a-z])([A-Z])/g, '$1-$2') // Add a hyphen between lower and upper case letters
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2') // Add a hyphen between consecutive upper case letters followed by a lower case letter
    .replace(/[_\s]+/g, '-') // Replace underscores and spaces with a hyphen
    .toLowerCase() // Convert the entire string to lowercase
}
