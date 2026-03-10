import type { PluggableList } from 'unified'

import remarkAddFrontmatter from './add-frontmatter.ts'
import remarkAddSections from './add-sections.ts'
import remarkGfm from './gfm.ts'
import remarkRemoveImmediateParagraphs from './remove-immediate-paragraphs.ts'
import remarkTransformJSDocInlineTags from './transform-jsdoc-inline-tags.ts'
import remarkTransformRelativeLinks from './transform-relative-links.ts'
import remarkTypography from './typography.ts'

export const remarkPlugins: PluggableList = [
  remarkAddFrontmatter,
  remarkAddSections,
  remarkGfm,
  remarkRemoveImmediateParagraphs,
  remarkTransformJSDocInlineTags,
  remarkTransformRelativeLinks,
  remarkTypography,
]
