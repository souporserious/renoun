import type { Root } from 'hast'
import type { VFile } from 'vfile'
import { valueToEstree } from 'estree-util-value-to-estree'
import { define } from 'unist-util-mdx-define'

/** Exports the reading time as a variable. */
export function addReadingTime() {
  return (tree: Root, file: VFile) => {
    const readingTime = file.data.meta?.readingTime

    if (!readingTime) {
      return
    }

    define(tree, file, {
      readingTime: valueToEstree(readingTime),
    })
  }
}
