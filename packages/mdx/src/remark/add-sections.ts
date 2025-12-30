import type React from 'react'
import type { Processor } from 'unified'
import type {
  Heading,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
} from 'mdast'
import type { Properties } from 'hast'
import type {
  Expression,
  ExpressionStatement,
  Literal,
  Program,
  JSXAttribute,
  JSXElement,
  JSXEmptyExpression,
  JSXExpressionContainer,
  JSXFragment,
  JSXSpreadAttribute,
  JSXSpreadChild,
  JSXText,
} from 'estree-jsx'
import type { VFile } from 'vfile'
import { define } from 'unist-util-mdx-define'
import { visit } from 'unist-util-visit'
import { toString } from 'mdast-util-to-string'
import type { MdxJsxAttributeValueExpression, MdxjsEsm } from 'mdast-util-mdx'
import 'mdast-util-mdx'

import { createSlug } from '../utils/create-slug.js'

declare module 'unified' {
  interface Data {
    isMarkdown?: boolean
  }
}

declare module 'mdast' {
  interface Data {
    hProperties?: Properties
  }
}

const MAX_SUMMARY_LENGTH = 300

type HeadingSection = {
  heading: Heading
  nodes: RootContent[]
}

type RegionSection = {
  start: RootContent
  title: string
  nodes: RootContent[]
}

export type ContentSection = {
  /** The slugified heading text. */
  id: string

  /** The stringified heading text. */
  title: string

  /** The heading level (1-6). */
  depth: number

  /** Concise summary derived from the section content. */
  summary?: string

  /** The heading content as JSX (preserves formatting like code, emphasis, etc.). */
  jsx?: React.ReactNode

  /** Nested child sections. */
  children?: ContentSection[]
}

export type HeadingComponentProps<
  Tag extends React.ElementType = React.ElementType,
> = {
  Tag: Tag
  id: string
} & React.ComponentPropsWithoutRef<Tag>

export type HeadingComponent<
  Tag extends React.ElementType = React.ElementType,
> = (props: HeadingComponentProps<Tag>) => React.ReactNode

export type SectionComponentProps = {
  id: string
  depth: number
  title: string
  children: React.ReactNode
}

export type SectionComponent = (
  props: SectionComponentProps
) => React.ReactNode

export type AddSectionsOptions = {
  /**
   * Additional JSX tag names to treat as headings.
   * These will be included in the sections export alongside native h1-h6 headings.
   */
  headingTags?: string[]

  /**
   * JSX tag names to treat as section containers.
   * The id and title will be extracted from attributes.
   */
  sectionTags?: string[]
}

const DEFAULT_HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']

interface FlatSection {
  /** The slugified heading text. */
  id: string

  /** The stringified heading text. */
  title: string

  /** The heading level (1-6). */
  depth: number

  /** Concise summary derived from the section content. */
  summary?: string

  /** ESTree representation of JSX content for the section. */
  estreeJsx?: any
}

interface NestedSection extends FlatSection {
  /** Nested child sections. */
  children?: NestedSection[]
}

function buildNestedSections(flatSections: FlatSection[]): NestedSection[] {
  const result: NestedSection[] = []
  const stack: { section: NestedSection; depth: number }[] = []

  for (const flat of flatSections) {
    const section: NestedSection = {
      id: flat.id,
      title: flat.title,
      depth: flat.depth,
    }

    if (flat.summary !== undefined) {
      section.summary = flat.summary
    }

    if (flat.estreeJsx !== undefined) {
      section.estreeJsx = flat.estreeJsx
    }

    // Pop sections from stack that are at same or deeper level
    while (stack.length > 0 && stack[stack.length - 1]!.depth >= flat.depth) {
      stack.pop()
    }

    if (stack.length === 0) {
      // This is a top-level section
      result.push(section)
    } else {
      // This is a child of the last item in the stack
      const parent = stack[stack.length - 1]!.section
      if (!parent.children) {
        parent.children = []
      }
      parent.children.push(section)
    }

    // Push this section onto the stack
    stack.push({ section, depth: flat.depth })
  }

  return result
}

function parseRegionStart(value: string): { title: string } | undefined {
  // Markdown/HTML comment: <!-- #region Title -->
  const htmlMatch = value.match(/<!--\s*#region\b([\s\S]*?)-->/i)
  if (htmlMatch) {
    return { title: (htmlMatch[1] ?? '').trim() }
  }
  // MDX/JSX comment expression: {/* #region Title */}
  const jsxMatch = value.match(/\/\*\s*#region\b([\s\S]*?)\*\//i)
  if (jsxMatch) {
    return { title: (jsxMatch[1] ?? '').trim() }
  }
  return undefined
}

function isRegionEnd(value: string): boolean {
  // Markdown/HTML comment: <!-- #endregion -->
  if (/<!--\s*#endregion\b[\s\S]*?-->/i.test(value)) return true
  // MDX/JSX comment expression: {/* #endregion */}
  return /\/\*\s*#endregion\b[\s\S]*?\*\//i.test(value)
}

function sectionToEstree(section: NestedSection): any {
  const properties: any[] = [
    {
      type: 'Property',
      key: { type: 'Identifier', name: 'id' },
      value: { type: 'Literal', value: section.id },
      kind: 'init',
    },
    {
      type: 'Property',
      key: { type: 'Identifier', name: 'title' },
      value: { type: 'Literal', value: section.title },
      kind: 'init',
    },
  ]

  if (section.depth !== undefined) {
    properties.push({
      type: 'Property',
      key: { type: 'Identifier', name: 'depth' },
      value: { type: 'Literal', value: section.depth },
      kind: 'init',
    })
  }

  if (section.summary !== undefined) {
    properties.push({
      type: 'Property',
      key: { type: 'Identifier', name: 'summary' },
      value: { type: 'Literal', value: section.summary },
      kind: 'init',
    })
  }

  if (section.estreeJsx !== undefined) {
    properties.push({
      type: 'Property',
      key: { type: 'Identifier', name: 'jsx' },
      value: section.estreeJsx,
      kind: 'init',
    })
  }

  if (section.children && section.children.length > 0) {
    properties.push({
      type: 'Property',
      key: { type: 'Identifier', name: 'children' },
      value: {
        type: 'ArrayExpression',
        elements: section.children.map(sectionToEstree),
      },
      kind: 'init',
    })
  }

  return {
    type: 'ObjectExpression',
    properties,
  }
}

export default function addSections(
  this: Processor,
  options: AddSectionsOptions = {}
) {
  const isMarkdown = this.data('isMarkdown') === true
  const customHeadingTags = options.headingTags ?? []
  const sectionTags = options.sectionTags ?? []

  // Build a set of all heading tag names (native + custom)
  const headingTagSet = new Set([...DEFAULT_HEADING_TAGS, ...customHeadingTags])

  // Map native heading tags to their depth
  const headingDepthMap = new Map<string, number>([
    ['h1', 1],
    ['h2', 2],
    ['h3', 3],
    ['h4', 4],
    ['h5', 5],
    ['h6', 6],
  ])

  return function (tree: Root, file: VFile) {
    const { headingSummaries, regionSummaries } = computeSectionSummaries(
      tree,
      file
    )
    const flatSections: FlatSection[] = []
    const headingCounts = new Map<string, number>()
    let hasSectionsExport = false
    let hasDefaultHeadingComponent = false
    let currentHeadingDepth = 0
    const regionDepthStack: number[] = []

    // Helper to ensure DefaultHeadingComponent is hoisted once
    function ensureDefaultHeadingComponent() {
      if (hasDefaultHeadingComponent || isMarkdown) {
        return
      }
      const defaultDeclaration = {
        type: 'mdxjsEsm',
        value: '',
        data: {
          estree: {
            type: 'Program',
            sourceType: 'module',
            body: [
              {
                type: 'VariableDeclaration',
                kind: 'const',
                declarations: [
                  {
                    type: 'VariableDeclarator',
                    id: {
                      type: 'Identifier',
                      name: 'DefaultHeadingComponent',
                    },
                    init: createDefaultHeadingComponent(),
                  },
                ],
              },
            ],
          },
        },
      } satisfies MdxjsEsm
      tree.children?.unshift(defaultDeclaration)
      hasDefaultHeadingComponent = true
    }

    // Helper to generate unique slug
    function generateSlug(baseSlug: string): string {
      if (headingCounts.has(baseSlug)) {
        const count = headingCounts.get(baseSlug)! + 1
        headingCounts.set(baseSlug, count)
        return `${baseSlug}-${count}`
      } else {
        headingCounts.set(baseSlug, 1)
        return baseSlug
      }
    }

    // Single visit to process all nodes in document order
    visit(tree, (node: any) => {
      // Handle HTML comment regions: <!-- #region Title --> ... <!-- #endregion -->
      if (
        node.type === 'html' ||
        node.type === 'mdxFlowExpression' ||
        node.type === 'mdxTextExpression'
      ) {
        const start =
          typeof node.value === 'string'
            ? parseRegionStart(node.value)
            : undefined
        if (start) {
          const title = start.title || 'Region'
          const baseDepth =
            regionDepthStack.length > 0
              ? regionDepthStack[regionDepthStack.length - 1]!
              : currentHeadingDepth
          const depth = Math.max(1, baseDepth + 1)
          const slug = generateSlug(createSlug(title))
          const summary = regionSummaries.get(node as RootContent)

          const section: FlatSection = {
            id: slug,
            title,
            depth,
          }
          if (summary !== undefined) {
            section.summary = summary
          }
          if (!isMarkdown) {
            section.estreeJsx = { type: 'Literal', value: title }
          }

          flatSections.push(section)
          regionDepthStack.push(depth)
          return
        }

        if (typeof node.value === 'string' && isRegionEnd(node.value)) {
          if (regionDepthStack.length === 0) {
            const message = file.message(
              '[`@renoun/mdx/remark/add-sections`] Found a region end marker without a matching start marker. Add a region start marker before this end marker (e.g. `<!-- #region ... -->` or `{/* #region ... */}`).',
              node
            )
            message.fatal = true
            return
          }
          regionDepthStack.pop()
          return
        }
      }

      // Handle markdown headings
      if (node.type === 'heading') {
        if (regionDepthStack.length > 0) {
          const message = file.message(
            '[`@renoun/mdx/remark/add-sections`] Regions cannot contain headings. Move the heading outside the region or close the region before the heading.',
            node
          )
          message.fatal = true
          return
        }

        const headingNode = node as Heading
        const text = toString(headingNode)
        const slug = generateSlug(createSlug(text))
        const summary = headingSummaries.get(headingNode)
        currentHeadingDepth = headingNode.depth

        const section: FlatSection = {
          id: slug,
          title: text,
          depth: headingNode.depth,
        }

        if (summary !== undefined) {
          section.summary = summary
        }

        // Capture JSX representation of heading content (preserves formatting)
        if (!isMarkdown) {
          section.estreeJsx = mdastNodesToJsxFragment(headingNode.children)
        }

        flatSections.push(section)

        headingNode.data ??= {}
        headingNode.data.hProperties ??= {}
        headingNode.data.hProperties.id = slug

        if (!isMarkdown) {
          ensureDefaultHeadingComponent()

          // Avoid conflicting anchors and inconsistent styling
          for (let index = 0; index < headingNode.children.length; index++) {
            const child = headingNode.children[index]
            if (child?.type === 'link') {
              const message = file.message(
                '[`@renoun/mdx/remark/add-sections`] Links inside headings are not supported. Remove the link to allow the `Heading` component to provide the section anchor.',
                headingNode
              )
              message.fatal = true
              return
            }
          }

          convertHeadingToComponent(headingNode, text)
        }
        return
      }

      // Handle JSX elements (heading and section tags)
      if (node.type === 'mdxJsxFlowElement' && !isMarkdown) {
        const tagName = node.name
        if (!tagName) return

        // Check if this is a heading tag (native or custom)
        if (headingTagSet.has(tagName)) {
          const id = getJsxAttributeValue(node, 'id')
          const title = getJsxTextContent(node)

          if (id && title) {
            const slug = generateSlug(id)
            const depth = headingDepthMap.get(tagName) ?? 2

            flatSections.push({
              id: slug,
              title,
              depth,
              estreeJsx: jsxElementChildrenToEstree(node),
            })
          }
        }

        // Check if this is a section tag
        if (sectionTags.includes(tagName)) {
          const id = getJsxAttributeValue(node, 'id')
          const title = getJsxAttributeValue(node, 'title')
          const depthValue = getJsxAttributeNumericValue(node, 'depth')

          if (id && title) {
            const slug = generateSlug(id)
            const depth = depthValue ?? 1

            flatSections.push({
              id: slug,
              title,
              depth,
            })
          }
        }
      }
    })

    visit(tree, (node) => {
      if (node.type !== 'mdxjsEsm') {
        return
      }

      const program = node.data?.estree

      if (!program || !Array.isArray(program.body)) {
        return
      }

      for (const statement of program.body) {
        if (statement.type !== 'ExportNamedDeclaration') continue
        if (statement.declaration) {
          const declaration = statement.declaration
          if (declaration.type === 'VariableDeclaration') {
            for (const declarator of declaration.declarations) {
              if (
                declarator.id?.type === 'Identifier' &&
                declarator.id.name === 'sections'
              ) {
                hasSectionsExport = true
                break
              }
            }
          }
        }
        if (Array.isArray(statement.specifiers)) {
          for (const specifier of statement.specifiers) {
            if (
              specifier.exported?.type === 'Identifier' &&
              specifier.exported.name === 'sections'
            ) {
              hasSectionsExport = true
              break
            }
          }
        }
      }
    })

    if (hasSectionsExport) {
      const message = file.message(
        '[renoun/mdx] Exporting "sections" directly is not supported. The "sections" export is automatically generated from headings.',
        undefined,
        'renoun-mdx:sections-export'
      )
      message.fatal = true
      return
    }

    if (!isMarkdown) {
      const nestedSections = buildNestedSections(flatSections)
      const sectionsExpression = {
        type: 'ArrayExpression',
        elements: nestedSections.map(sectionToEstree),
      } satisfies Expression

      define(tree, file, { sections: sectionsExpression })
    }

    if (regionDepthStack.length > 0) {
      const message = file.message(
        '[`@renoun/mdx/remark/add-sections`] A `<!-- #region ... -->` is missing a matching `<!-- #endregion -->`.',
        tree
      )
      message.fatal = true
      return
    }
  }
}

function computeSectionSummaries(
  tree: Root,
  file: VFile
): {
  headingSummaries: Map<Heading, string | undefined>
  regionSummaries: Map<RootContent, string | undefined>
} {
  const headingSummaries = new Map<Heading, string | undefined>()
  const regionSummaries = new Map<RootContent, string | undefined>()
  const headingStack: HeadingSection[] = []
  const regionStack: RegionSection[] = []

  for (const child of tree.children) {
    if (child.type === 'mdxjsEsm') {
      continue
    }

    if (
      child.type === 'html' ||
      child.type === 'mdxFlowExpression' ||
      child.type === 'mdxTextExpression'
    ) {
      const raw = child.value
      const start = typeof raw === 'string' ? parseRegionStart(raw) : undefined
      if (start) {
        regionStack.push({
          start: child,
          title: start.title,
          nodes: [],
        })
        continue
      }
      if (typeof raw === 'string' && isRegionEnd(raw)) {
        const current = regionStack.pop()
        if (!current) {
          const message = file.message(
            '[`@renoun/mdx/remark/add-sections`] Found a region end marker without a matching start marker. Add a region start marker before this end marker (e.g. `<!-- #region ... -->` or `{/* #region ... */}`).',
            child
          )
          message.fatal = true
          return { headingSummaries, regionSummaries }
        }
        regionSummaries.set(current.start, pickSummary(current.nodes))
        continue
      }
    }

    if (child.type === 'heading') {
      if (regionStack.length) {
        const message = file.message(
          '[`@renoun/mdx/remark/add-sections`] Regions cannot contain headings. Move the heading outside the region or close the region before the heading.',
          child
        )
        message.fatal = true
        return { headingSummaries, regionSummaries }
      }

      const headingNode = child as Heading

      while (
        headingStack.length &&
        headingStack[headingStack.length - 1]!.heading.depth >=
          headingNode.depth
      ) {
        const completed = headingStack.pop()!
        headingSummaries.set(completed.heading, pickSummary(completed.nodes))
      }

      headingStack.push({ heading: headingNode, nodes: [] })
      continue
    }

    if (regionStack.length) {
      regionStack[regionStack.length - 1]!.nodes.push(child as RootContent)
      continue
    }

    if (!headingStack.length) {
      continue
    }

    const currentSection = headingStack[headingStack.length - 1]!
    currentSection.nodes.push(child as RootContent)
  }

  if (regionStack.length) {
    const message = file.message(
      '[`@renoun/mdx/remark/add-sections`] A `<!-- #region ... -->` is missing a matching `<!-- #endregion -->`.',
      regionStack[regionStack.length - 1]!.start
    )
    message.fatal = true
    return { headingSummaries, regionSummaries }
  }

  while (headingStack.length) {
    const completed = headingStack.pop()!
    headingSummaries.set(completed.heading, pickSummary(completed.nodes))
  }

  return { headingSummaries, regionSummaries }
}

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }

function pickSummary(nodes: RootContent[]): string | undefined {
  const blocks = toBlocks(nodes)
  if (!blocks.length) {
    return undefined
  }

  const paragraphBlocks = blocks.filter(
    (block): block is Extract<Block, { type: 'paragraph' }> =>
      block.type === 'paragraph'
  )

  for (const block of paragraphBlocks) {
    if (countWords(block.text) >= 40) {
      return truncate(block.text, MAX_SUMMARY_LENGTH)
    }
  }

  if (paragraphBlocks.length) {
    const merged = cleanWhitespace(
      paragraphBlocks
        .slice(0, 2)
        .map((paragraph) => paragraph.text)
        .join(' ')
    )
    if (merged) {
      return truncate(merged, MAX_SUMMARY_LENGTH)
    }
  }

  const listBlock = blocks.find(
    (block): block is Extract<Block, { type: 'list' }> => block.type === 'list'
  )
  if (listBlock && listBlock.items.length) {
    const listText = cleanWhitespace(listBlock.items.slice(0, 2).join(' • '))
    if (listText) {
      return truncate(listText, MAX_SUMMARY_LENGTH)
    }
  }

  const fallbackText = cleanWhitespace(
    paragraphBlocks.map((paragraph) => paragraph.text).join(' ')
  )
  if (fallbackText) {
    const sentences = fallbackText.split(/(?<=\.)\s+/).filter(Boolean)
    if (sentences.length) {
      return truncate(sentences.slice(0, 2).join(' '), MAX_SUMMARY_LENGTH)
    }
    return truncate(fallbackText, MAX_SUMMARY_LENGTH)
  }

  return undefined
}

function toBlocks(nodes: RootContent[]): Block[] {
  const blocks: Block[] = []

  for (const node of nodes) {
    if (node.type === 'paragraph') {
      const text = paragraphToText(node)
      if (text) {
        blocks.push({ type: 'paragraph', text })
      }
    } else if (node.type === 'list') {
      const items = listToItems(node)
      if (items.length) {
        blocks.push({ type: 'list', items })
      }
    } else if (
      node.type === 'heading' ||
      node.type === 'code' ||
      node.type === 'blockquote'
    ) {
      continue
    }
  }

  return blocks
}

function paragraphToText(node: Paragraph): string {
  const parts = node.children
    .map((child) => phrasingToText(child))
    .filter((value): value is string => Boolean(value && value.trim()))
  return cleanWhitespace(parts.join(' '))
}

function listToItems(list: List): string[] {
  const items: string[] = []
  for (const item of list.children) {
    const text = listItemToText(item)
    if (text) {
      items.push(text)
    }
  }
  return items
}

function listItemToText(item: ListItem): string {
  const parts: string[] = []
  for (const child of item.children) {
    if (child.type === 'paragraph') {
      const text = paragraphToText(child)
      if (text) {
        parts.push(text)
      }
    }
  }
  return cleanWhitespace(parts.join(' '))
}

function phrasingToText(node: PhrasingContent | RootContent): string {
  switch (node.type) {
    case 'text':
      return node.value
    case 'inlineCode':
      return node.value
    case 'footnoteReference':
      return ''
    case 'emphasis':
    case 'strong':
    case 'delete':
    case 'link':
    case 'linkReference':
    case 'footnoteDefinition':
    case 'paragraph':
    case 'list':
      return node.children.map((child) => phrasingToText(child)).join(' ')
    case 'mdxTextExpression':
    case 'html':
    case 'mdxJsxTextElement':
      return ''
    case 'break':
      return ' '
    default:
      return ''
  }
}

function truncate(value: string, limit: number) {
  if (value.length <= limit) {
    return value
  }
  return value.slice(0, limit - 1).trimEnd() + '…'
}

function cleanWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function countWords(value: string) {
  if (!value) {
    return 0
  }
  return value.trim().split(/\s+/).length
}

function convertHeadingToComponent(node: Heading, title: string) {
  const tagName = `h${node.depth}`
  const properties = node.data?.hProperties ?? {}

  // Build <HeadingComponent Tag={_components.<tag> || '<tag>'} id={...} {...rest}>{children}</HeadingComponent>
  const headingComponentIdentifier = {
    type: 'Identifier',
    name: 'HeadingComponent',
  }

  const tagExpression = {
    type: 'LogicalExpression',
    operator: '||',
    left: {
      type: 'LogicalExpression',
      operator: '&&',
      left: { type: 'Identifier', name: 'C' },
      right: {
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'C' },
        property: { type: 'Identifier', name: tagName },
        computed: false,
        optional: false,
      },
    },
    right: { type: 'Literal', value: tagName },
  }

  const jsxChildrenExpression = mdastNodesToJsxFragment(node.children)
  const jsxChildNode =
    jsxChildrenExpression.type === 'JSXElement' ||
    jsxChildrenExpression.type === 'JSXFragment'
      ? jsxChildrenExpression
      : { type: 'JSXExpressionContainer', expression: jsxChildrenExpression }

  const spreadProps: any[] = []
  for (const [key, value] of Object.entries(properties)) {
    if (key === 'id') {
      continue
    }
    spreadProps.push({
      type: 'Property',
      kind: 'init',
      method: false,
      shorthand: false,
      computed: !isIdentifierName(key),
      key: isIdentifierName(key)
        ? { type: 'Identifier', name: key }
        : { type: 'Literal', value: key },
      value: toEstree(value),
    })
  }

  const headingElement = {
    type: 'JSXElement',
    openingElement: {
      type: 'JSXOpeningElement',
      name: { type: 'JSXIdentifier', name: 'HeadingComponent' },
      attributes: [
        {
          type: 'JSXAttribute',
          name: { type: 'JSXIdentifier', name: 'Tag' },
          value: { type: 'JSXExpressionContainer', expression: tagExpression },
        },
        {
          type: 'JSXAttribute',
          name: { type: 'JSXIdentifier', name: 'id' },
          value: { type: 'Literal', value: properties.id },
        },
        {
          type: 'JSXSpreadAttribute',
          argument: { type: 'ObjectExpression', properties: spreadProps },
        },
      ],
      selfClosing: false,
    },
    closingElement: {
      type: 'JSXClosingElement',
      name: { type: 'JSXIdentifier', name: 'HeadingComponent' },
    },
    children: [jsxChildNode],
  }

  const sectionElement = {
    type: 'JSXElement',
    openingElement: {
      type: 'JSXOpeningElement',
      name: { type: 'JSXIdentifier', name: 'SectionComponent' },
      attributes: [
        {
          type: 'JSXAttribute',
          name: { type: 'JSXIdentifier', name: 'id' },
          value: { type: 'Literal', value: properties.id },
        },
        {
          type: 'JSXAttribute',
          name: { type: 'JSXIdentifier', name: 'depth' },
          value: { type: 'Literal', value: node.depth },
        },
        {
          type: 'JSXAttribute',
          name: { type: 'JSXIdentifier', name: 'title' },
          value: { type: 'Literal', value: title },
        },
      ],
      selfClosing: false,
    },
    closingElement: {
      type: 'JSXClosingElement',
      name: { type: 'JSXIdentifier', name: 'SectionComponent' },
    },
    children: [headingElement],
  }

  const iife = {
    type: 'CallExpression',
    callee: {
      type: 'ArrowFunctionExpression',
      async: false,
      expression: false,
      params: [],
      body: {
        type: 'BlockStatement',
        body: [
          {
            type: 'VariableDeclaration',
            kind: 'const',
            declarations: [
              {
                // const C = ((typeof _components !== 'undefined') && _components) || (props.components || {})
                type: 'VariableDeclarator',
                id: { type: 'Identifier', name: 'C' },
                init: {
                  type: 'LogicalExpression',
                  operator: '||',
                  left: {
                    type: 'LogicalExpression',
                    operator: '&&',
                    left: {
                      type: 'BinaryExpression',
                      operator: '!==',
                      left: {
                        type: 'UnaryExpression',
                        operator: 'typeof',
                        prefix: true,
                        argument: { type: 'Identifier', name: '_components' },
                      },
                      right: { type: 'Literal', value: 'undefined' },
                    },
                    right: { type: 'Identifier', name: '_components' },
                  },
                  right: {
                    type: 'LogicalExpression',
                    operator: '||',
                    left: {
                      type: 'MemberExpression',
                      object: { type: 'Identifier', name: 'props' },
                      property: { type: 'Identifier', name: 'components' },
                      computed: false,
                      optional: false,
                    },
                    right: { type: 'ObjectExpression', properties: [] },
                  },
                },
              },
              {
                // const HeadingComponent = C.Heading || DefaultHeadingComponent
                type: 'VariableDeclarator',
                id: { type: 'Identifier', name: 'HeadingComponent' },
                init: {
                  type: 'LogicalExpression',
                  operator: '||',
                  left: {
                    type: 'MemberExpression',
                    object: { type: 'Identifier', name: 'C' },
                    property: { type: 'Identifier', name: 'Heading' },
                    computed: false,
                    optional: false,
                  },
                  right: {
                    type: 'Identifier',
                    name: 'DefaultHeadingComponent',
                  },
                },
              },
              {
                // const SectionComponent = C.Section || _Fragment
                type: 'VariableDeclarator',
                id: { type: 'Identifier', name: 'SectionComponent' },
                init: {
                  type: 'LogicalExpression',
                  operator: '||',
                  left: {
                    type: 'LogicalExpression',
                    operator: '&&',
                    left: { type: 'Identifier', name: 'C' },
                    right: {
                      type: 'MemberExpression',
                      object: { type: 'Identifier', name: 'C' },
                      property: { type: 'Identifier', name: 'Section' },
                      computed: false,
                      optional: false,
                    },
                  },
                  right: { type: 'Identifier', name: '_Fragment' },
                },
              },
            ],
          },
          {
            type: 'ReturnStatement',
            argument: sectionElement,
          },
        ],
      },
    },
    arguments: [],
  }

  Object.assign(node, {
    type: 'mdxFlowExpression',
    value: '',
    data: {
      estree: {
        type: 'Program',
        sourceType: 'module',
        body: [{ type: 'ExpressionStatement', expression: iife }],
      },
    },
  })

  // Remove the depth property now that it's been converted to a HeadingComponent
  delete (node as any).depth
}

function toEstree(value: unknown): any {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return { type: 'Literal', value }
  }

  if (Array.isArray(value)) {
    return {
      type: 'ArrayExpression',
      elements: value.map((item) => toEstree(item)),
    }
  }

  if (typeof value === 'object' && value) {
    return {
      type: 'ObjectExpression',
      properties: Object.entries(value).map(([key, item]) => ({
        type: 'Property',
        kind: 'init',
        method: false,
        shorthand: false,
        computed: false,
        key: isIdentifierName(key)
          ? { type: 'Identifier', name: key }
          : { type: 'Literal', value: key },
        value: toEstree(item),
      })),
    }
  }

  return { type: 'Literal', value: String(value) }
}

function isIdentifierName(value: string) {
  return /^[$A-Z_][0-9A-Z_$]*$/i.test(value)
}

function createDefaultHeadingComponent(): any {
  return {
    type: 'ArrowFunctionExpression',
    async: false,
    expression: true,
    params: [
      {
        type: 'ObjectPattern',
        properties: [
          {
            type: 'Property',
            kind: 'init',
            method: false,
            shorthand: true,
            computed: false,
            key: { type: 'Identifier', name: 'Tag' },
            value: { type: 'Identifier', name: 'Tag' },
          },
          {
            type: 'Property',
            kind: 'init',
            method: false,
            shorthand: true,
            computed: false,
            key: { type: 'Identifier', name: 'id' },
            value: { type: 'Identifier', name: 'id' },
          },
          {
            type: 'Property',
            kind: 'init',
            method: false,
            shorthand: true,
            computed: false,
            key: { type: 'Identifier', name: 'children' },
            value: { type: 'Identifier', name: 'children' },
          },
          {
            type: 'RestElement',
            argument: { type: 'Identifier', name: 'rest' },
          },
        ],
      },
    ],
    body: {
      type: 'JSXElement',
      openingElement: {
        type: 'JSXOpeningElement',
        name: { type: 'JSXIdentifier', name: 'Tag' },
        attributes: [
          {
            type: 'JSXAttribute',
            name: { type: 'JSXIdentifier', name: 'id' },
            value: {
              type: 'JSXExpressionContainer',
              expression: { type: 'Identifier', name: 'id' },
            },
          },
          {
            type: 'JSXSpreadAttribute',
            argument: { type: 'Identifier', name: 'rest' },
          },
        ],
        selfClosing: false,
      },
      closingElement: {
        type: 'JSXClosingElement',
        name: { type: 'JSXIdentifier', name: 'Tag' },
      },
      children: [
        {
          type: 'JSXElement',
          openingElement: {
            type: 'JSXOpeningElement',
            name: { type: 'JSXIdentifier', name: 'a' },
            attributes: [
              {
                type: 'JSXAttribute',
                name: { type: 'JSXIdentifier', name: 'href' },
                value: {
                  type: 'JSXExpressionContainer',
                  expression: {
                    type: 'TemplateLiteral',
                    expressions: [{ type: 'Identifier', name: 'id' }],
                    quasis: [
                      {
                        type: 'TemplateElement',
                        tail: false,
                        value: { raw: '#', cooked: '#' },
                      },
                      {
                        type: 'TemplateElement',
                        tail: true,
                        value: { raw: '', cooked: '' },
                      },
                    ],
                  },
                },
              },
            ],
            selfClosing: false,
          },
          closingElement: {
            type: 'JSXClosingElement',
            name: { type: 'JSXIdentifier', name: 'a' },
          },
          children: [
            {
              type: 'JSXExpressionContainer',
              expression: { type: 'Identifier', name: 'children' },
            },
          ],
        },
      ],
    },
  }
}

/** Convert an array of mdast nodes into a text node or JSX fragment. */
function mdastNodesToJsxFragment(nodes: any[]): any {
  const jsxChildren = nodes.map((node) => mdastNodeToJsxChild(node))

  if (jsxChildren.length === 1) {
    const child = jsxChildren[0]

    if (child.type === 'JSXText') {
      return {
        type: 'Literal',
        value: child.value,
      }
    }

    return child
  }

  return {
    type: 'JSXFragment',
    openingFragment: {
      type: 'JSXOpeningFragment',
      attributes: [],
      selfClosing: false,
    },
    closingFragment: { type: 'JSXClosingFragment' },
    children: jsxChildren,
  }
}

/**
 * Convert an mdast inline node into its corresponding ESTree JSX AST node.
 * This function covers:
 *
 * - text
 * - strong, emphasis, delete, inlineCode
 * - break (line break)
 * - link, image
 */
function mdastNodeToJsxChild(node: any): any {
  switch (node.type) {
    case 'text':
      return { type: 'JSXText', value: node.value }
    case 'strong':
      return makeJsxElement('strong', node.children)
    case 'emphasis':
      return makeJsxElement('em', node.children)
    case 'inlineCode':
      return makeJsxElement('code', [{ type: 'JSXText', value: node.value }])
    case 'delete':
      return makeJsxElement('del', node.children)
    case 'break':
      return {
        type: 'JSXElement',
        openingElement: {
          type: 'JSXOpeningElement',
          name: { type: 'JSXIdentifier', name: 'br' },
          attributes: [],
          selfClosing: true,
        },
        closingElement: null,
        children: [],
      }
    case 'image':
      return makeSafeImage(node)
    case 'link':
      return mdastNodesToJsxFragment(node.children)
    default:
      return { type: 'JSXText', value: toString(node) }
  }
}

/**
 * Check if a URL is safe.
 * It checks if the URL has a valid protocol and is not a data URI.
 */
function isSafeUrl(url: string) {
  try {
    const parsed = new URL(url, 'http://example.com')
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

/**
 * Convert an mdast image node into its corresponding ESTree JSX AST node.
 * It builds an element like <img src={url} alt={alt} title={title} />.
 */
function makeSafeImage(node: any) {
  const attributes = []

  if (isSafeUrl(node.url)) {
    attributes.push({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'src' },
      value: { type: 'Literal', value: node.url },
    })
  }
  if (node.alt)
    attributes.push({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'alt' },
      value: { type: 'Literal', value: node.alt },
    })
  if (node.title)
    attributes.push({
      type: 'JSXAttribute',
      name: { type: 'JSXIdentifier', name: 'title' },
      value: { type: 'Literal', value: node.title },
    })
  return {
    type: 'JSXElement',
    openingElement: {
      type: 'JSXOpeningElement',
      name: { type: 'JSXIdentifier', name: 'img' },
      attributes,
      selfClosing: true,
    },
    closingElement: null,
    children: [],
  }
}

/**
 * Helper to create a simple JSXElement.
 * It builds an element like <tagName>{...children}</tagName>.
 */
function makeJsxElement(tagName: string, mdastChildren: any[]): any {
  return {
    type: 'JSXElement',
    openingElement: {
      type: 'JSXOpeningElement',
      name: { type: 'JSXIdentifier', name: tagName },
      attributes: [],
      selfClosing: false,
    },
    closingElement: {
      type: 'JSXClosingElement',
      name: { type: 'JSXIdentifier', name: tagName },
    },
    children: mdastChildren.map((child) => mdastNodeToJsxChild(child)),
  }
}

/**
 * Extract a string attribute value from a JSX element node.
 * Handles both literal values and simple expression containers.
 */
function getJsxAttributeValue(node: any, name: string): string | undefined {
  if (!node.attributes) return undefined

  for (const attr of node.attributes) {
    if (attr.type === 'mdxJsxAttribute' && attr.name === name) {
      // Handle string literal: id="value"
      if (typeof attr.value === 'string') {
        return attr.value
      }

      // Handle expression container: id={"value"} or id={value}
      if (
        attr.value?.type === 'mdxJsxAttributeValueExpression' &&
        attr.value.data?.estree?.body?.[0]?.expression
      ) {
        const expr = attr.value.data.estree.body[0].expression
        if (expr.type === 'Literal' && typeof expr.value === 'string') {
          return expr.value
        }
      }
    }
  }

  return undefined
}

/**
 * Extract text content from a JSX element's children.
 */
function getJsxTextContent(node: any): string {
  if (!node.children) return ''

  const parts: string[] = []

  for (const child of node.children) {
    if (child.type === 'text') {
      parts.push(child.value)
    } else if (
      child.type === 'mdxJsxTextElement' ||
      child.type === 'mdxJsxFlowElement'
    ) {
      // Recursively get text from nested elements
      parts.push(getJsxTextContent(child))
    } else if (child.type === 'paragraph') {
      parts.push(toString(child))
    }
  }

  return parts.join('').trim()
}

/**
 * Convert JSX element children to ESTree JSX nodes.
 * This handles mdxJsxTextElement, text nodes, and other JSX-related nodes.
 */
function jsxElementChildrenToEstree(node: any): any {
  if (!node.children || node.children.length === 0) {
    return { type: 'Literal', value: '' }
  }

  const jsxChildren = node.children
    .map((child: any) => jsxChildToEstree(child))
    .filter((child: any) => child !== null)

  if (jsxChildren.length === 0) {
    return { type: 'Literal', value: '' }
  }

  if (jsxChildren.length === 1) {
    const child = jsxChildren[0]
    // If it's just text, return as a literal
    if (child.type === 'JSXText') {
      return { type: 'Literal', value: child.value }
    }
    return child
  }

  return {
    type: 'JSXFragment',
    openingFragment: {
      type: 'JSXOpeningFragment',
      attributes: [],
      selfClosing: false,
    },
    closingFragment: { type: 'JSXClosingFragment' },
    children: jsxChildren,
  }
}

/**
 * Convert a single JSX child node to ESTree.
 */
function jsxChildToEstree(
  node: RootContent | PhrasingContent
): JsxChildNode | null {
  switch (node.type) {
    case 'text':
      return { type: 'JSXText', value: node.value, raw: node.value }

    case 'mdxJsxTextElement':
    case 'mdxJsxFlowElement': {
      const tagName = node.name
      if (!tagName) return null

      const attributes: Array<JSXAttribute | JSXSpreadAttribute> = []
      if (node.attributes) {
        for (const attribute of node.attributes) {
          if (attribute.type === 'mdxJsxAttribute') {
            let value: JSXAttribute['value'] = null
            if (typeof attribute.value === 'string') {
              value = {
                type: 'Literal',
                value: attribute.value,
              }
            } else if (
              attribute.value?.type === 'mdxJsxAttributeValueExpression'
            ) {
              const expression = getMdxAttributeExpression(attribute.value)
              value = {
                type: 'JSXExpressionContainer',
                expression: (expression ??
                  ({ type: 'Literal', value: null } satisfies Literal)) as
                  | Expression
                  | JSXEmptyExpression,
              } satisfies JSXExpressionContainer
            }

            attributes.push({
              type: 'JSXAttribute',
              name: { type: 'JSXIdentifier', name: attribute.name },
              value,
            })
          }
        }
      }

      const children = node.children
        ? node.children
            .map((child) => jsxChildToEstree(child))
            .filter((child): child is JsxChildNode => child !== null)
        : []

      return {
        type: 'JSXElement',
        openingElement: {
          type: 'JSXOpeningElement',
          name: { type: 'JSXIdentifier', name: tagName },
          attributes,
          selfClosing: children.length === 0,
        },
        closingElement:
          children.length === 0
            ? null
            : {
                type: 'JSXClosingElement',
                name: { type: 'JSXIdentifier', name: tagName },
              },
        children,
      } satisfies JSXElement
    }

    case 'paragraph':
      // For paragraphs inside JSX, extract the text content
      return {
        type: 'JSXText',
        value: toString(node),
        raw: toString(node),
      }

    default:
      return null
  }
}

type JsxChildNode =
  | JSXText
  | JSXExpressionContainer
  | JSXSpreadChild
  | JSXElement
  | JSXFragment

function getMdxAttributeExpression(
  value: MdxJsxAttributeValueExpression
): Expression | undefined {
  const program = value.data?.estree as Program | undefined
  const statement = program?.body?.[0]
  if (!statement || statement.type !== 'ExpressionStatement') {
    return undefined
  }
  return (statement as ExpressionStatement).expression
}

/**
 * Extract a numeric attribute value from a JSX element node.
 * Handles both literal values (depth="1") and expression containers (depth={1}).
 */
function getJsxAttributeNumericValue(
  node: any,
  name: string
): number | undefined {
  if (!node.attributes) return undefined

  for (const attribute of node.attributes) {
    if (attribute.type === 'mdxJsxAttribute' && attribute.name === name) {
      // Handle string literal: depth="1"
      if (typeof attribute.value === 'string') {
        const parsed = parseInt(attribute.value, 10)
        return isNaN(parsed) ? undefined : parsed
      }

      // Handle expression container: depth={1}
      if (
        attribute.value?.type === 'mdxJsxAttributeValueExpression' &&
        attribute.value.data?.estree?.body?.[0]?.expression
      ) {
        const expr = attribute.value.data.estree.body[0].expression
        if (expr.type === 'Literal' && typeof expr.value === 'number') {
          return expr.value
        }
      }
    }
  }

  return undefined
}
