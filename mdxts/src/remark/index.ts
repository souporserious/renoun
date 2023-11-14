import type { Root } from 'mdast'
import type { VFile } from 'vfile'
import { addCodeBlocks } from './add-code-blocks'
import { addHeadings } from './add-heading-ids'
import { addWorkingDirectoryToCode } from './add-working-directory-to-code'
import { transformSymbolicLinks } from './transform-symbolic-links'

export * from './add-code-blocks'
export * from './add-heading-ids'
export * from './add-working-directory-to-code'
export * from './export-headings'
export * from './transform-symbolic-links'

export function remarkPlugin() {
  return async (tree: Root, file: VFile) => {
    await addCodeBlocks()(tree, file)
    await addHeadings()(tree)
    await addWorkingDirectoryToCode()(tree, file)
    await transformSymbolicLinks()(tree)
  }
}
