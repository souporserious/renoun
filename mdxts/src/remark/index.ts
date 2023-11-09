import type { Node } from 'mdast'
import type { VFile } from 'vfile'
import { addWorkingDirectoryToCode } from './add-working-directory-to-code'
import { addHeadingIds, type Headings } from './add-heading-ids'
import { exportHeadings } from './export-headings'
import { transformSymbolicLinks } from './transform-symbolic-links'

export * from './add-working-directory-to-code'
export * from './add-heading-ids'
export * from './export-headings'
export * from './transform-symbolic-links'

export function remarkPlugin() {
  return async (tree: Node, file: VFile) => {
    const headings: Headings = []
    await addWorkingDirectoryToCode()(tree, file)
    await addHeadingIds({ headings })(tree)
    await exportHeadings({ headings })(tree)
    await transformSymbolicLinks()(tree)
  }
}
