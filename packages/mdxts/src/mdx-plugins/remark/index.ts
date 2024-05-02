import type { Root } from 'mdast'
import type { VFile } from 'vfile'

import { addCodeBlocks } from './add-code-blocks'
import { addHeadings } from './add-headings'
import { addDescription } from './add-description'
import { addFileMetaToCodeBlock } from './add-file-meta-to-code-block'
import { addShouldRenderTitle } from './add-should-render-title'
import { removeParagraphs } from './remove-paragraph'
import { transformRelativeLinks } from './transform-relative-links'
import { transformSymbolicLinks } from './transform-symbolic-links'

export function remarkPlugin(options: {
  gitSource: string
  gitBranch: string
}) {
  return async (tree: Root, file: VFile) => {
    addShouldRenderTitle()(tree)
    await Promise.all([
      addCodeBlocks()(tree, file),
      addHeadings()(tree),
      addDescription()(tree),
      addFileMetaToCodeBlock(options)(tree, file),
      removeParagraphs()(tree),
      transformRelativeLinks()(tree),
      transformSymbolicLinks()(tree),
    ])
  }
}
