import type { PluggableList } from 'unified'

import remarkAddFrontmatter from './add-frontmatter.js'
import remarkAddSections from './add-sections.js'
import remarkGfm from './gfm.js'
import remarkRemoveImmediateParagraphs from './remove-immediate-paragraphs.js'
import remarkTransformJSDocInlineTags from './transform-jsdoc-inline-tags.js'
import remarkTransformRelativeLinks from './transform-relative-links.js'
import remarkTypography from './typography.js'

export const remarkPlugins: PluggableList = [
  remarkAddFrontmatter,
  remarkAddSections,
  remarkGfm,
  remarkRemoveImmediateParagraphs,
  remarkTransformJSDocInlineTags,
  remarkTransformRelativeLinks,
  remarkTypography,
]
