import type { Root } from 'hast'
import type { VFile } from 'vfile'

import { addCodeMetaProps } from './add-code-meta-props'
import { addReadingTime } from './add-reading-time'

export function rehypePlugin() {
  return async function (tree: Root, file: VFile) {
    await addCodeMetaProps()(tree)
    await addReadingTime()(tree, file)
  }
}
