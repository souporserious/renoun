import type { PluggableList } from 'unified'
import remarkGfm from 'remark-gfm'
import remarkSmartyPants from 'remark-smartypants'

import remarkAddHeadings from './add-headings.js'
import remarkRemoveImmediateParagraphs from './remove-immediate-paragraphs.js'
import remarkTransformRelativeLinks from './transform-relative-links.js'

export const remarkPlugins: PluggableList = [
  remarkGfm,
  [remarkSmartyPants, { dashes: 'oldschool' }] as any,
  remarkAddHeadings,
  remarkRemoveImmediateParagraphs,
  remarkTransformRelativeLinks,
]
