import { unified } from 'unified'
import type {
  Code,
  Content,
  Heading,
  List,
  ListItem,
  Paragraph,
  Root,
  RootContent,
  PhrasingContent,
  Table,
} from 'mdast'
import type { VFileMessage } from 'vfile-message'
import type { VFile } from 'vfile'
import { VFile as VFileImpl } from 'vfile'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkGfm from 'remark-gfm'
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx'

import { parseFrontmatter } from './parse-frontmatter.js'

export type ExtractMdxTextFormat = 'text' | 'markdown'

export type ExtractMdxTextSyntax = 'md' | 'mdx'

export interface ExtractMdxTextOptions {
  source: string
  format?: ExtractMdxTextFormat
  componentHandlers?: Record<string, MdxComponentHandler>
  /**
   * How to treat unknown MDX components (those without a handler).
   * - `unwrap` (default): keep and transform children
   * - `drop`: remove the component and its children
   */
  unknownComponentHandling?: 'unwrap' | 'drop'
}

export interface ExtractMdxTextTreeOptions extends ExtractMdxTextOptions {
  syntax?: ExtractMdxTextSyntax
}

export interface ExtractMdxTextResult {
  content: string
  frontmatter?: Record<string, unknown>
  diagnostics: VFileMessage[]
}

export interface ExtractMdxTextTreeResult extends ExtractMdxTextResult {
  tree: Root
}

export type MdxComponentHandler = (context: {
  node: MdxJsxFlowElement | MdxJsxTextElement
  format: ExtractMdxTextFormat
  transformChildren: (children: PhrasingContent[]) => PhrasingContent[]
  transformChildrenBlocks?: (children: RootContent[]) => RootContent[]
}) => RootContent[]

const DEFAULT_COMPONENT_HANDLERS: Record<string, MdxComponentHandler> = {
  Note: unwrapComponent,
  Command: unwrapComponent,
  Card: unwrapComponent,
  Row: unwrapComponent,
  Preview: unwrapComponent,
}

const MEDIA_TAGS = new Set(['img', 'video', 'iframe', 'audio', 'embed'])
const WRAPPER_TAGS = new Set([
  'div',
  'span',
  'section',
  'article',
  'aside',
  'header',
  'footer',
  'main',
  'figure',
  'figcaption',
  'details',
  'summary',
])

export async function extractMDXText({
  source,
  format = 'text',
  componentHandlers,
  unknownComponentHandling,
}: ExtractMdxTextOptions): Promise<ExtractMdxTextResult> {
  const result = await extractMdxTextTree({
    source,
    format,
    componentHandlers,
    unknownComponentHandling,
    syntax: 'mdx',
  })

  return {
    content: result.content,
    frontmatter: result.frontmatter,
    diagnostics: result.diagnostics,
  }
}

export async function extractMdxTextTree({
  source,
  syntax = 'mdx',
  format = 'text',
  componentHandlers,
  unknownComponentHandling = 'unwrap',
}: ExtractMdxTextTreeOptions): Promise<ExtractMdxTextTreeResult> {
  const { content: rawContent, frontmatter } = parseFrontmatter(source)
  const file = new VFileImpl({ value: rawContent })

  const processor = unified().use(remarkParse).use(remarkGfm)
  if (syntax === 'mdx') {
    processor.use(remarkMdx)
  }

  const tree = (await processor.run(
    processor.parse(file) as Root,
    file
  )) as Root

  const handlers = {
    ...DEFAULT_COMPONENT_HANDLERS,
    ...(componentHandlers ?? {}),
  }

  const transformed = transformMdast(
    tree,
    file,
    handlers,
    format,
    unknownComponentHandling
  )
  const content = serializeMdast(transformed, format)

  return {
    tree: transformed,
    content,
    frontmatter,
    diagnostics: [...file.messages],
  }
}

function unwrapComponent({
  node,
  transformChildren,
  transformChildrenBlocks,
}: Parameters<MdxComponentHandler>[0]) {
  if (!Array.isArray(node.children)) {
    return []
  }

  if (node.type === 'mdxJsxFlowElement') {
    const blocks = transformChildrenBlocks
      ? transformChildrenBlocks(node.children as RootContent[])
      : (node.children as RootContent[])
    return blocks
  }

  const children = transformChildren(node.children as PhrasingContent[])
  if (!children.length) return []
  return [createParagraph(children)]
}

function transformMdast(
  tree: Root,
  file: VFile,
  handlers: Record<string, MdxComponentHandler>,
  format: ExtractMdxTextFormat,
  unknownComponentHandling: 'unwrap' | 'drop'
): Root {
  const transformChildren = (
    children: PhrasingContent[]
  ): PhrasingContent[] => {
    const result: PhrasingContent[] = []
    for (const child of children) {
      const transformed = transformNode(
        child,
        file,
        handlers,
        format,
        unknownComponentHandling,
        true
      )
      for (const node of transformed) {
        if (isPhrasingContent(node)) {
          result.push(node)
        }
      }
    }
    return result
  }

  const newChildren: RootContent[] = []
  for (const child of tree.children) {
    const transformed = transformNode(
      child,
      file,
      handlers,
      format,
      unknownComponentHandling,
      false
    )
    for (const node of transformed) {
      if (isRootContent(node)) {
        newChildren.push(node)
      }
    }
  }

  tree.children = newChildren
  return tree
}

function transformNode(
  node: RootContent | PhrasingContent,
  file: VFile,
  handlers: Record<string, MdxComponentHandler>,
  format: ExtractMdxTextFormat,
  unknownComponentHandling: 'unwrap' | 'drop',
  isInline: boolean
): Array<RootContent | PhrasingContent> {
  if (
    node.type === 'mdxjsEsm' ||
    node.type === 'mdxFlowExpression' ||
    node.type === 'mdxTextExpression'
  ) {
    return []
  }

  if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
    return transformMdxComponent(
      node,
      file,
      handlers,
      format,
      unknownComponentHandling,
      isInline
    )
  }

  if (node.type === 'html') {
    return htmlToParagraphs(node.value)
  }

  if (node.type === 'image' || node.type === 'imageReference') {
    return []
  }

  if (node.type === 'definition') {
    return []
  }

  if (node.type === 'table') {
    return tableToParagraphs(node)
  }

  if (node.type === 'code') {
    normalizeCodeFence(node, file)
    return [node]
  }

  if (node.type === 'paragraph') {
    const children = transformChildrenInline(
      node.children,
      file,
      handlers,
      format,
      unknownComponentHandling
    )
    if (!children.length) {
      return []
    }
    const paragraph: Paragraph = { ...node, children }
    return [paragraph]
  }

  if (node.type === 'heading') {
    const children = transformChildrenInline(
      node.children,
      file,
      handlers,
      format,
      unknownComponentHandling
    )
    if (!children.length) {
      return []
    }
    const heading: Heading = { ...node, children }
    return [heading]
  }

  if (node.type === 'list') {
    const list = node as List
    const items: ListItem[] = []
    for (const item of list.children) {
      const transformedItems = transformNode(
        item,
        file,
        handlers,
        format,
        unknownComponentHandling,
        false
      )
      for (const transformed of transformedItems) {
        if (transformed.type === 'listItem') {
          items.push(transformed as ListItem)
        }
      }
    }
    if (!items.length) {
      return []
    }
    return [{ ...list, children: items }]
  }

  if (node.type === 'listItem') {
    const listItem = node as ListItem
    const children: ListItem['children'] = []
    for (const child of listItem.children ?? []) {
      const transformed = transformNode(
        child,
        file,
        handlers,
        format,
        unknownComponentHandling,
        false
      )
      for (const result of transformed) {
        if (isRootContent(result)) {
          children.push(result as ListItem['children'][number])
        }
      }
    }
    if (!children.length) {
      return []
    }
    return [{ ...listItem, children }]
  }

  if ('children' in node && Array.isArray(node.children)) {
    if (isInline) {
      const children = transformChildrenInline(
        node.children as PhrasingContent[],
        file,
        handlers,
        format,
        unknownComponentHandling
      )
      return children.length ? [{ ...node, children } as PhrasingContent] : []
    }
    const children: RootContent[] = []
    for (const child of node.children as RootContent[]) {
      const transformed = transformNode(
        child,
        file,
        handlers,
        format,
        unknownComponentHandling,
        false
      )
      for (const result of transformed) {
        if (isRootContent(result)) {
          children.push(result)
        }
      }
    }
    return children.length ? [{ ...node, children } as RootContent] : []
  }

  return [node]
}

function transformChildrenInline(
  children: PhrasingContent[],
  file: VFile,
  handlers: Record<string, MdxComponentHandler>,
  format: ExtractMdxTextFormat,
  unknownComponentHandling: 'unwrap' | 'drop'
): PhrasingContent[] {
  const result: PhrasingContent[] = []
  for (const child of children) {
    const transformed = transformNode(
      child,
      file,
      handlers,
      format,
      unknownComponentHandling,
      true
    )
    for (const node of transformed) {
      if (isPhrasingContent(node)) {
        result.push(node)
      }
    }
  }
  return result
}

function transformMdxComponent(
  node: MdxJsxFlowElement | MdxJsxTextElement,
  file: VFile,
  handlers: Record<string, MdxComponentHandler>,
  format: ExtractMdxTextFormat,
  unknownComponentHandling: 'unwrap' | 'drop',
  isInline: boolean
): Array<RootContent | PhrasingContent> {
  const name = node.name ?? ''

  const transformChildrenBlocks = (children: RootContent[]): RootContent[] => {
    const result: RootContent[] = []
    for (const child of children) {
      const transformed = transformNode(
        child,
        file,
        handlers,
        format,
        unknownComponentHandling,
        false
      )
      for (const node of transformed) {
        if (isRootContent(node)) {
          result.push(node)
        }
      }
    }
    return result
  }

  if (!name) {
    if (!Array.isArray(node.children)) {
      return []
    }

    if (node.type === 'mdxJsxFlowElement') {
      return transformChildrenBlocks(node.children as RootContent[])
    }

    return transformChildrenInline(
      node.children as PhrasingContent[],
      file,
      handlers,
      format,
      unknownComponentHandling
    )
  }

  if (MEDIA_TAGS.has(name)) {
    return []
  }

  const handler = handlers[name]
  if (handler) {
    const handled = handler({
      node,
      format,
      transformChildren: (children) =>
        transformChildrenInline(
          children,
          file,
          handlers,
          format,
          unknownComponentHandling
        ),
      transformChildrenBlocks,
    })

    if (isInline) {
      return blocksToPhrasing(handled)
    }

    return handled
  }

  if (WRAPPER_TAGS.has(name)) {
    if (!Array.isArray(node.children)) {
      return []
    }

    if (node.type === 'mdxJsxFlowElement') {
      return transformChildrenBlocks(node.children as RootContent[])
    }

    return transformChildrenInline(
      node.children as PhrasingContent[],
      file,
      handlers,
      format,
      unknownComponentHandling
    )
  }

  if (unknownComponentHandling === 'drop') {
    return []
  }

  if (Array.isArray(node.children) && node.children.length > 0) {
    if (node.type === 'mdxJsxFlowElement') {
      return transformChildrenBlocks(node.children as RootContent[])
    }

    const children = transformChildrenInline(
      node.children as PhrasingContent[],
      file,
      handlers,
      format,
      unknownComponentHandling
    )

    if (!children.length) {
      return []
    }

    if (isInline) {
      return children
    }

    return [createParagraph(children)]
  }

  return []
}

function blocksToPhrasing(nodes: RootContent[]): PhrasingContent[] {
  const result: PhrasingContent[] = []
  for (const node of nodes) {
    if (node.type === 'paragraph') {
      result.push(...node.children)
      continue
    }
    const text = normalizeWhitespace(toText(node))
    if (text) {
      result.push({ type: 'text', value: text } as PhrasingContent)
    }
  }
  return result
}

function normalizeCodeFence(node: Code, file: VFile) {
  if (!node.meta) {
    return
  }

  const { properties, diagnostics } = parseCodeFenceMeta(node.meta)
  for (const message of diagnostics) {
    const diagnostic = file.message(message, node)
    diagnostic.fatal = false
  }

  const normalizedMeta = serializeMetaProperties(properties)
  if (normalizedMeta) {
    node.meta = normalizedMeta
  }
}

function parseCodeFenceMeta(meta: string): {
  properties: Record<string, string | boolean | number>
  diagnostics: string[]
} {
  const properties: Record<string, string | boolean | number> = {}
  const diagnostics: string[] = []
  const parts = meta.split(/\s+/).filter(Boolean)

  for (const part of parts) {
    const equalsIndex = part.indexOf('=')

    if (equalsIndex === -1) {
      properties[part] = true
      continue
    }

    const key = part.slice(0, equalsIndex)
    const raw = part.slice(equalsIndex + 1)

    if (/^(['"])(.*)\1$/.test(raw)) {
      properties[key] = raw.slice(1, -1)
      continue
    }

    const match = raw.match(/^\{(.+)\}$/)
    if (match) {
      const value = match[1]
      if (/^(['"])(.*)\1$/.test(value)) {
        properties[key] = value.slice(1, -1)
      } else if (value === 'true' || value === 'false') {
        properties[key] = value === 'true'
      } else {
        const number = Number(value)
        properties[key] = Number.isNaN(number) ? value : number
      }
      continue
    }

    diagnostics.push(
      `[@renoun/mdx/utils/extract-mdx-text] Invalid code fence meta “${part}”: values must be either a bare flag (foo), a quoted string ("…"/'…'), or braced ({…}).`
    )
  }

  return { properties, diagnostics }
}

function serializeMetaProperties(
  properties: Record<string, string | boolean | number>
): string {
  const keys = Object.keys(properties).sort()
  if (!keys.length) {
    return ''
  }

  const parts: string[] = []
  for (const key of keys) {
    const value = properties[key]
    if (value === true) {
      parts.push(key)
    } else if (typeof value === 'string') {
      parts.push(`${key}=${JSON.stringify(value)}`)
    } else {
      parts.push(`${key}={${String(value)}}`)
    }
  }
  return parts.join(' ')
}

function tableToParagraphs(node: Table): RootContent[] {
  const rows = node.children ?? []
  const paragraphs: RootContent[] = []
  for (const row of rows) {
    const cells = row.children ?? []
    const cellTexts = cells.map((cell) => normalizeWhitespace(toText(cell)))
    const line = cellTexts.filter(Boolean).join(' | ')
    if (!line) {
      continue
    }
    paragraphs.push(createParagraph([{ type: 'text', value: line }]))
  }
  return paragraphs
}

function htmlToParagraphs(value: string): RootContent[] {
  const trimmed = value.trim()
  if (!trimmed) {
    return []
  }

  if (/<\/?(img|video|iframe|audio|embed)\b/i.test(trimmed)) {
    const text = stripHtml(trimmed)
    if (!text) {
      return []
    }
    return [createParagraph([{ type: 'text', value: text }])]
  }

  if (/<table\b/i.test(trimmed)) {
    const rows = extractHtmlTableRows(trimmed)
    if (rows.length) {
      return rows.map((line) =>
        createParagraph([{ type: 'text', value: line }])
      )
    }
  }

  if (/<details\b/i.test(trimmed) || /<summary\b/i.test(trimmed)) {
    const lines = extractHtmlDetails(trimmed)
    if (lines.length) {
      return lines.map((line) =>
        createParagraph([{ type: 'text', value: line }])
      )
    }
  }

  const text = stripHtml(trimmed)
  if (!text) {
    return []
  }
  return [createParagraph([{ type: 'text', value: text }])]
}

function extractHtmlTableRows(value: string): string[] {
  const rows = value.match(/<tr[\s\S]*?<\/tr>/gi) ?? []
  const lines: string[] = []
  for (const row of rows) {
    const cells = row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []
    const cellTexts = cells
      .map((cell) => stripHtml(cell))
      .map((text) => normalizeWhitespace(text))
      .filter(Boolean)
    const line = cellTexts.join(' | ')
    if (line) {
      lines.push(line)
    }
  }

  if (lines.length) {
    return lines
  }

  const fallback = normalizeWhitespace(stripHtml(value))
  return fallback ? [fallback] : []
}

function extractHtmlDetails(value: string): string[] {
  const summaryMatch = value.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)
  const summaryText = summaryMatch
    ? normalizeWhitespace(stripHtml(summaryMatch[1]))
    : ''
  const withoutSummary = summaryMatch
    ? value.replace(summaryMatch[0], '')
    : value
  const detailsText = normalizeWhitespace(stripHtml(withoutSummary))
  const lines = [summaryText, detailsText].filter(Boolean)
  return lines
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(
      /<\/(p|div|section|article|li|tr|table|thead|tbody|tfoot|details|summary|h[1-6]|ul|ol)>/gi,
      '\n'
    )
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim()
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

function createParagraph(children: PhrasingContent[]): Paragraph {
  return { type: 'paragraph', children }
}

function isRootContent(node: Content): node is RootContent {
  return !isPhrasingContent(node)
}

function isPhrasingContent(node: Content): node is PhrasingContent {
  return (
    node.type === 'text' ||
    node.type === 'emphasis' ||
    node.type === 'strong' ||
    node.type === 'inlineCode' ||
    node.type === 'link' ||
    node.type === 'delete' ||
    node.type === 'break' ||
    node.type === 'mdxJsxTextElement'
  )
}

function serializeMdast(tree: Root, format: ExtractMdxTextFormat): string {
  const blocks = tree.children
    .map((node) => serializeBlock(node, format, 0))
    .filter(Boolean)
  return blocks.join('\n\n').trim()
}

function serializeBlock(
  node: RootContent,
  format: ExtractMdxTextFormat,
  indentLevel: number
): string {
  switch (node.type) {
    case 'paragraph':
      return serializeInline(node.children, format)
    case 'heading': {
      const text = serializeInline(node.children, format)
      if (!text) return ''
      return format === 'markdown' ? `${'#'.repeat(node.depth)} ${text}` : text
    }
    case 'list':
      return serializeList(node, format, indentLevel)
    case 'blockquote': {
      const inner = node.children
        .map((child) => serializeBlock(child, format, indentLevel))
        .filter(Boolean)
        .join('\n\n')
      if (!inner) return ''
      return inner
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    }
    case 'code':
      return serializeCodeBlock(node, format)
    case 'thematicBreak':
      return format === 'markdown' ? '---' : '---'
    case 'table': {
      const lines = tableToParagraphs(node).map((paragraph) =>
        serializeBlock(paragraph, format, indentLevel)
      )
      return lines.filter(Boolean).join('\n')
    }
    default:
      if ('children' in node && Array.isArray(node.children)) {
        const nested = node.children
          .map((child) => serializeBlock(child, format, indentLevel))
          .filter(Boolean)
        return nested.join('\n\n')
      }
      return ''
  }
}

function serializeList(
  node: List,
  format: ExtractMdxTextFormat,
  indentLevel: number
): string {
  const indent = '  '.repeat(indentLevel)
  const bullet = node.ordered ? '1.' : '-'
  const lines: string[] = []

  for (const item of node.children ?? []) {
    const itemLines = serializeListItem(
      item,
      format,
      indent,
      bullet,
      indentLevel
    )
    if (itemLines.length) {
      lines.push(...itemLines)
    }
  }

  return lines.join('\n')
}

function serializeListItem(
  item: ListItem,
  format: ExtractMdxTextFormat,
  indent: string,
  bullet: string,
  indentLevel: number
): string[] {
  const prefix = `${indent}${bullet} `
  const continuationIndent = `${indent}${' '.repeat(bullet.length + 1)}`
  const children = item.children ?? []
  if (!children.length) {
    return [prefix.trimEnd()]
  }

  const [first, ...rest] = children
  const lines: string[] = []

  if (first.type === 'paragraph') {
    lines.push(prefix + serializeInline(first.children, format))
  } else {
    lines.push(prefix.trimEnd())
    const firstBlock = serializeBlock(first, format, indentLevel + 1)
    if (firstBlock) {
      lines.push(
        ...firstBlock.split('\n').map((line) => `${continuationIndent}${line}`)
      )
    }
  }

  for (const child of rest) {
    const block = serializeBlock(child, format, indentLevel + 1)
    if (!block) continue
    lines.push(
      ...block.split('\n').map((line) => `${continuationIndent}${line}`)
    )
  }

  return lines
}

function serializeCodeBlock(node: Code, format: ExtractMdxTextFormat): string {
  if (format === 'text') {
    return node.value ?? ''
  }

  const info = [node.lang, node.meta].filter(Boolean).join(' ').trim()
  const fence = '```'
  const value = node.value?.replace(/\n$/, '') ?? ''
  const header = info ? `${fence}${info}` : fence
  return `${header}\n${value}\n${fence}`
}

function serializeInline(
  children: PhrasingContent[],
  format: ExtractMdxTextFormat
): string {
  return children
    .map((child) => serializeInlineNode(child, format))
    .join('')
    .trim()
}

function serializeInlineNode(
  node: PhrasingContent,
  format: ExtractMdxTextFormat
): string {
  switch (node.type) {
    case 'text':
      return node.value
    case 'emphasis': {
      const text = serializeInline(node.children, format)
      return format === 'markdown' ? `*${text}*` : text
    }
    case 'strong': {
      const text = serializeInline(node.children, format)
      return format === 'markdown' ? `**${text}**` : text
    }
    case 'delete': {
      const text = serializeInline(node.children, format)
      return format === 'markdown' ? `~~${text}~~` : text
    }
    case 'inlineCode': {
      if (format === 'text') {
        return node.value
      }
      const fence = getInlineCodeFence(node.value)
      return `${fence}${node.value}${fence}`
    }
    case 'link': {
      const text = serializeInline(node.children, format) || node.url
      if (format === 'markdown') {
        return `[${text}](${node.url})`
      }
      if (!node.url) {
        return text
      }
      if (text.includes(node.url)) {
        return text
      }
      return `${text} (${node.url})`
    }
    case 'break':
      return '\n'
    default:
      return ''
  }
}

function getInlineCodeFence(value: string): string {
  const matches = value.match(/`+/g)
  const max = matches ? Math.max(...matches.map((match) => match.length)) : 0
  return '`'.repeat(max + 1)
}

function toText(node: RootContent | PhrasingContent): string {
  if ('children' in node && Array.isArray(node.children)) {
    return node.children.map((child) => toText(child)).join('')
  }
  if ('value' in node && typeof node.value === 'string') {
    return node.value
  }
  return ''
}
