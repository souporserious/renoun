import type { Node } from 'mdast'
import type { VFile } from 'vfile'
import { addCodeString } from './add-code-string'
import { addWorkingDirectoryToCode } from './add-working-directory-to-code'
import { addHeadingIds, type Headings } from './add-heading-ids'
import { exportHeadings } from './export-headings'
import { transformSymbolicLinks } from './transform-symbolic-links'

export * from './add-code-string'
export * from './add-working-directory-to-code'
export * from './add-heading-ids'
export * from './export-headings'
export * from './transform-symbolic-links'

export function remarkPlugin() {
  return async (tree: Node, file: VFile) => {
    const headings: Headings = []
    await addCodeString()(tree, file)
    await addWorkingDirectoryToCode()(tree, file)
    await addHeadingIds({ headings })(tree)
    await exportHeadings({ headings })(tree)
    await transformSymbolicLinks()(tree)
  }
}
