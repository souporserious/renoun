import rehypeUnwrapImages from 'rehype-unwrap-images'
import remarkGfm from 'remark-gfm'
import remarkSmartyPants from 'remark-smartypants'

import rehypeAddPreMetaProps from './rehype/add-pre-meta-props.js'
import rehypeAddReadingTime from './rehype/add-reading-time.js'
import remarkAddHeadings from './remark/add-headings.js'
import remarkRemoveImmediateParagraphs from './remark/remove-immediate-paragraphs.js'
import remarkTransformRelativeLinks from './remark/transform-relative-links.js'

export type { MDXComponents, MDXContent } from 'mdx/types.js'

export type { MDXReadingTime } from './rehype/add-reading-time.js'

export type { MDXHeadings } from './remark/add-headings.js'

export const rehypePlugins = [
  rehypeAddPreMetaProps,
  rehypeAddReadingTime,
  rehypeUnwrapImages,
]

export const remarkPlugins = [
  remarkGfm,
  [remarkSmartyPants, { dashes: 'oldschool' }] as any,
  remarkAddHeadings,
  remarkRemoveImmediateParagraphs,
  remarkTransformRelativeLinks,
]
