import { visit } from 'unist-util-visit'
import { toString } from 'mdast-util-to-string'
import type { Root, Heading } from 'mdast'

import type { ContentSection } from '../remark/add-sections.js'
import { createSlug } from './create-slug.js'

interface FlatSection {
  id: string
  title: string
  depth: number
}

function buildNestedSections(flatSections: FlatSection[]): ContentSection[] {
  const result: ContentSection[] = []
  const stack: { section: ContentSection; depth: number }[] = []

  for (const flat of flatSections) {
    const section: ContentSection = {
      id: flat.id,
      title: flat.title,
      depth: flat.depth,
    }

    while (stack.length > 0 && stack[stack.length - 1]!.depth >= flat.depth) {
      stack.pop()
    }

    if (stack.length === 0) {
      result.push(section)
    } else {
      const parent = stack[stack.length - 1]!.section
      if (!parent.children) {
        parent.children = []
      }
      parent.children.push(section)
    }

    stack.push({ section, depth: flat.depth })
  }

  return result
}

export function collectSections(tree: Root): ContentSection[] {
  const flatSections: FlatSection[] = []
  const headingCounts = new Map<string, number>()

  visit(tree, 'heading', (node: Heading) => {
    const text = toString(node).trim()
    let slug = createSlug(text)

    if (headingCounts.has(slug)) {
      const count = headingCounts.get(slug)! + 1
      headingCounts.set(slug, count)
      slug = `${slug}-${count}`
    } else {
      headingCounts.set(slug, 1)
    }

    flatSections.push({ id: slug, depth: node.depth, title: text })
  })

  return buildNestedSections(flatSections)
}
