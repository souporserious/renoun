import type { PluggableList } from 'unified'

import remarkAddFrontMatter from './add-front-matter.js'
import remarkAddHeadings from './add-headings.js'
import remarkGfm from './gfm.js'
import remarkRemoveImmediateParagraphs from './remove-immediate-paragraphs.js'
import remarkTransformRelativeLinks from './transform-relative-links.js'
import remarkTypography from './typography.js'

export const remarkPlugins: PluggableList = [
  remarkAddFrontMatter,
  remarkAddHeadings,
  remarkGfm,
  remarkRemoveImmediateParagraphs,
  remarkTransformRelativeLinks,
  remarkTypography,
]
