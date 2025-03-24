import remarkGfm from 'remark-gfm'
import remarkSmartyPants from 'remark-smartypants'
import rehypeInferReadingTimeMeta from 'rehype-infer-reading-time-meta'
import rehypeUnwrapImages from 'rehype-unwrap-images'

import { addCodeMetaProps } from './rehype/add-code-meta-props.js'
import { addReadingTime } from './rehype/add-reading-time.js'
import { addHeadings } from './remark/add-headings.js'
import { removeImmediateParagraphs } from './remark/remove-immediate-paragraphs.js'
import { transformRelativeLinks } from './remark/transform-relative-links.js'

export type { MDXHeadings } from './remark/add-headings.js'

export type { MDXComponents, MDXContent } from 'mdx/types.js'

export const remarkPlugins = [
  remarkGfm,
  [remarkSmartyPants, { dashes: 'oldschool' }] as any,
  removeImmediateParagraphs,
  transformRelativeLinks,
  addHeadings,
]

export const rehypePlugins = [
  rehypeInferReadingTimeMeta,
  rehypeUnwrapImages,
  addReadingTime,
  addCodeMetaProps,
]
