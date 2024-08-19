import type { Parent } from 'unist'
import type { VFile } from 'vfile'

import { addCodeMetaProps } from './add-code-meta-props'
import { addReadingTime } from './add-reading-time'

export function rehypePlugin() {
  return async function (tree: Parent, file: VFile) {
    await Promise.all([addCodeMetaProps()(tree), addReadingTime()(tree, file)])
  }
}
