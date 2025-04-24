import type { Root } from 'hast'
import type { VFile } from 'vfile'
import rehypeUnwrapImages from 'rehype-unwrap-images'

import rehypeAddPreMetaProps from './add-pre-meta-props.js'
import rehypeAddReadingTime from './add-reading-time.js'

/**
 * Apply a series of rehype plugins to the tree:
 *
 * - `rehypeAddPreMetaProps` adds code fence meta properties to the `pre` element.
 * - `rehypeAddReadingTime` exports the reading time as a `readingTime` variable.
 * - `rehypeUnwrapImages` unwraps images from their parent paragraphs.
 */
export default function rehypeRenoun() {
  const addPreMetaProps = rehypeAddPreMetaProps()
  const addReadingTime = rehypeAddReadingTime()
  const unwrapImages = rehypeUnwrapImages()

  return async function transformer(tree: Root, file: VFile) {
    addPreMetaProps(tree)
    addReadingTime(tree, file)
    unwrapImages(tree)
  }
}
