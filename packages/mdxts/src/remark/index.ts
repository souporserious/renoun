import type { Root } from 'mdast'
import type { VFile } from 'vfile'
import { addCodeBlocks } from './add-code-blocks'
import { addHeadings } from './add-headings'
import { addDescription } from './add-description'
import { addFileMetaToCodeBlock } from './add-file-meta-to-code-block'
import { removeParagraphs } from './remove-paragraph'
import { transformSymbolicLinks } from './transform-symbolic-links'

export function remarkPlugin() {
  return async (tree: Root, file: VFile) => {
    await addCodeBlocks()(tree, file)
    await addHeadings()(tree)
    await addDescription()(tree)
    await addFileMetaToCodeBlock()(tree, file)
    await removeParagraphs()(tree)
    await transformSymbolicLinks()(tree)
  }
}
