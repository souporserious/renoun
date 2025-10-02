import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import { visit } from 'unist-util-visit'
import { toString } from 'mdast-util-to-string'
import type { Root, Heading } from 'mdast'

import type { Headings } from '../remark/add-headings.js'
import { createSlug } from './create-slug.js'

function collectHeadings(tree: Root): Headings {
  const headings: Headings = []
  const headingCounts = new Map<string, number>()

  visit(tree, 'heading', (node: Heading) => {
    const text = toString(node)
    let slug = createSlug(text)

    if (headingCounts.has(slug)) {
      const count = headingCounts.get(slug)! + 1
      headingCounts.set(slug, count)
      slug = `${slug}-${count}`
    } else {
      headingCounts.set(slug, 1)
    }

    headings.push({ id: slug, level: node.depth, text })
  })

  return headings
}

const mdProcessor = unified().use(remarkParse)

export function getMarkdownHeadings(source: string): Headings {
  const tree = mdProcessor.parse(source)
  return collectHeadings(tree)
}

const mdxProcessor = mdProcessor.use(remarkMdx)

export function getMDXHeadings(source: string): Headings {
  const tree = mdxProcessor.parse(source)
  return collectHeadings(tree)
}
