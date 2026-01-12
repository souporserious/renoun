import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import type { ContentSection } from '../remark/add-sections.js'
import { collectSections } from './collect-sections.js'
import { parseFrontmatter } from './parse-frontmatter.js'

const mdProcessor = unified().use(remarkParse)

export function getMarkdownSections(source: string): ContentSection[] {
  const { content } = parseFrontmatter(source)
  const tree = mdProcessor.parse(content)
  return collectSections(tree)
}

const mdxProcessor = mdProcessor.use(remarkMdx)

export function getMDXSections(source: string): ContentSection[] {
  const { content } = parseFrontmatter(source)
  const tree = mdxProcessor.parse(content)
  return collectSections(tree)
}
