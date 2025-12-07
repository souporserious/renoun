import type { PluggableList } from 'unified'
import remarkGfm from 'remark-gfm'

import remarkAddFrontMatter from './add-front-matter.js'
import remarkAddHeadings from './add-headings.js'
import remarkRemoveImmediateParagraphs from './remove-immediate-paragraphs.js'
import remarkTransformRelativeLinks from './transform-relative-links.js'
import remarkTypography from './typography.js'

export const remarkPlugins: PluggableList = [
  remarkGfm,
  remarkAddFrontMatter,
  remarkAddHeadings,
  remarkRemoveImmediateParagraphs,
  remarkTransformRelativeLinks,
  remarkTypography,
]
