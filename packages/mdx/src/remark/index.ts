import type { Root } from 'mdast'
import type { VFile } from 'vfile'
import remarkGfm from 'remark-gfm'
import remarkSmartyPants from 'remark-smartypants'

import remarkAddHeadings from './add-headings.js'
import remarkRemoveImmediateParagraphs from './remove-immediate-paragraphs.js'
import remarkTransformRelativeLinks from './transform-relative-links.js'

export type { MDXHeadings } from './add-headings.js'

/**
 * Apply a series of remark plugins to the tree:
 *
 * - `remarkGfm` adds support for GFM (GitHub Flavored Markdown).
 * - `remarkSmartyPants` converts straight quotes to curly quotes.
 * - `remarkRemoveImmediateParagraphs` removes the paragraph element added around immediate JSX children.
 * - `remarkTransformRelativeLinks` reformat all relative links that use ordered numbers and extensions.
 * - `remarkAddHeadings` adds an `id` to all headings and exports a `headings` variable.
 */
export default function remarkRenoun() {
  const gfm = remarkGfm()
  // @ts-expect-error: `this` type is wrong
  const smartyPants = remarkSmartyPants({ dashes: 'oldschool' })
  const removeImmediateParagraphs = remarkRemoveImmediateParagraphs()
  const transformRelativeLinks = remarkTransformRelativeLinks()
  const addHeadings = remarkAddHeadings()

  return async function transformer(tree: Root, file: VFile) {
    if (gfm) {
      // @ts-expect-error: `gfm` is callable
      gfm(tree, file)
    }

    // @ts-expect-error: arguments type is wrong
    smartyPants(tree)

    removeImmediateParagraphs(tree)
    transformRelativeLinks(tree)
    addHeadings(tree, file)
  }
}
