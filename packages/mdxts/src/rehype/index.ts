import type { Root } from 'hast'
import { addCodeMetaProps } from './add-code-meta-props'

export function rehypePlugin() {
  return async function (tree: Root) {
    await addCodeMetaProps()(tree)
  }
}
