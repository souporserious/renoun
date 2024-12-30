import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkSmartyPants from 'remark-smartypants'
import remarkStripBadges from 'remark-strip-badges'
import remarkSqueezeParagraphs from 'remark-squeeze-paragraphs'
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
  remarkFrontmatter,
  remarkMdxFrontmatter as any,
  remarkGfm,
  [remarkSmartyPants, { dashes: 'oldschool' }] as any,
  remarkStripBadges,
  remarkSqueezeParagraphs,
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
