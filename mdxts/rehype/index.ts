import type { Element } from 'hast'
import type { VFile } from 'vfile'
import { addCodeMetaProps } from './add-code-meta-props'
import { transformSymbolicLinks } from './transform-symbolic-links'

export function rehypePlugin() {
  return async function transformer(tree: Element, file: VFile) {
    await addCodeMetaProps(tree, file)
    await transformSymbolicLinks(tree)
  }
}
