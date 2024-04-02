import type { Root } from 'mdast'
import type { VFile } from 'vfile'
import { addCodeBlocks } from './add-code-blocks'
import { addHeadings } from './add-headings'
import { addDescription } from './add-description'
import { addFileMetaToCodeBlock } from './add-file-meta-to-code-block'
import { removeFrontMatter } from './remove-front-matter'
import { removeParagraphs } from './remove-paragraph'
import { transformRelativeLinks } from './transform-relative-links'
import { transformSymbolicLinks } from './transform-symbolic-links'

export function remarkPlugin() {
  return async (tree: Root, file: VFile) => {
    removeFrontMatter()(tree)
    await Promise.all([
      addCodeBlocks()(tree, file),
      addHeadings()(tree),
      addDescription()(tree),
      addFileMetaToCodeBlock()(tree, file),
      removeParagraphs()(tree),
      transformRelativeLinks()(tree),
      transformSymbolicLinks()(tree),
    ])
  }
}
