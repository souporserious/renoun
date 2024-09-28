import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkSmartyPants from 'remark-smartypants'
import remarkStripBadges from 'remark-strip-badges'
import remarkSqueezeParagraphs from 'remark-squeeze-paragraphs'
import remarkUnwrapImages from 'remark-unwrap-images'
import rehypeInferReadingTimeMeta from 'rehype-infer-reading-time-meta'

import { addCodeMetaProps } from './rehype/add-code-meta-props.js'
import { addReadingTime } from './rehype/add-reading-time.js'
import { addHeadings } from './remark/add-headings.js'
import { removeParagraphs } from './remark/remove-paragraphs.js'
import { transformRelativeLinks } from './remark/transform-relative-links.js'

export type { Headings } from './remark/add-headings.js'

export type { MDXComponents, MDXContent } from 'mdx/types.js'

export const remarkPlugins = [
  remarkFrontmatter,
  remarkMdxFrontmatter as any,
  remarkGfm,
  [remarkSmartyPants, { dashes: 'oldschool' }] as any,
  remarkStripBadges,
  remarkSqueezeParagraphs,
  remarkUnwrapImages,
  removeParagraphs,
  transformRelativeLinks,
  addHeadings,
]

export const rehypePlugins = [
  rehypeInferReadingTimeMeta,
  addReadingTime,
  addCodeMetaProps,
]
