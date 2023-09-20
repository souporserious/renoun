import type { Node } from 'mdast'
import { addHeadingIds, type Headings } from './add-heading-ids'
import { exportHeadings } from './export-headings'
import { transformSymbolicLinks } from './transform-symbolic-links'

export * from './add-heading-ids'
export * from './export-headings'
export * from './transform-symbolic-links'

export function remarkPlugin() {
  return async (tree: Node) => {
    const headings: Headings = []
    await addHeadingIds({ headings })(tree)
    await exportHeadings({ headings })(tree)
    await transformSymbolicLinks()(tree)
  }
}
