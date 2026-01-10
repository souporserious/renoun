import { describe, expect, test } from 'vitest'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { visit } from 'unist-util-visit'
import type { ReactElement, ReactNode } from 'react'
import type { Element as HastElement, Root as HastRoot } from 'hast'
import type { Root as MdastRoot, Paragraph, Text } from 'mdast'

import {
  getMarkdownContent,
  type MarkdownContentOptions,
} from './get-markdown-content.js'
import addCodeBlock from '../rehype/add-code-block.js'

const runtime: MarkdownContentOptions['runtime'] = { Fragment, jsx, jsxs }

type PropsWithChildren = Record<string, unknown> & { children?: ReactNode }

function isReactElement(
  value: unknown
): value is ReactElement<PropsWithChildren> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'props' in value
  )
}

function asElement(value: unknown): ReactElement<PropsWithChildren> {
  if (!isReactElement(value)) {
    throw new Error('Expected a React element')
  }
  return value
}

function isHastElement(node: unknown): node is HastElement {
  if (typeof node !== 'object' || node === null) return false
  if (!('type' in node)) return false
  return (node as { type?: unknown }).type === 'element'
}

function childrenToArray(children: ReactNode): ReactNode[] {
  if (Array.isArray(children)) return children
  if (
    children === null ||
    children === undefined ||
    typeof children === 'boolean'
  ) {
    return []
  }
  return [children]
}

function stripEmptyText(nodes: ReactNode[]): ReactNode[] {
  return nodes.filter(
    (node) => !(typeof node === 'string' && node.trim() === '')
  )
}

function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean')
    return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (isReactElement(node)) {
    const children = (node.props as PropsWithChildren).children
    return nodeText(children as ReactNode)
  }
  return ''
}

function unwrapFragmentChildren(node: unknown): ReactNode {
  // `toJsxRuntime` returns a Fragment root for a HAST Root.
  if (isReactElement(node) && node.type === Fragment) {
    return (node.props as PropsWithChildren).children as ReactNode
  }

  return node as ReactNode
}

describe('getMarkdownContent', () => {
  test.concurrent('compiles basic markdown into JSX', async () => {
    const element = await getMarkdownContent({
      source: '# Hello',
      runtime,
    })

    const root = asElement(element)
    expect(root.type).toBe(Fragment)

    const child = asElement(
      stripEmptyText(childrenToArray(unwrapFragmentChildren(root)))[0]
    )
    expect(child.type).toBe('h1')
    expect((child.props as PropsWithChildren).children).toBe('Hello')
  })

  test.concurrent('uses custom components when provided', async () => {
    const H1 = (props: Record<string, unknown>) => jsx('h2', props)

    const element = await getMarkdownContent({
      source: '# Hello',
      runtime,
      components: {
        h1: H1,
      },
    })

    const root = asElement(element)
    const child = asElement(
      stripEmptyText(childrenToArray(unwrapFragmentChildren(root)))[0]
    )
    expect(child.type).toBe(H1)

    // Ensure the original text still flows through.
    expect((child.props as PropsWithChildren).children).toBe('Hello')
  })

  test.concurrent('sanitizes unsafe URL protocols in markdown links', async () => {
    const element = await getMarkdownContent({
      source: '[x](javascript:alert(1))',
      runtime,
    })

    const root = asElement(element)
    const paragraph = asElement(
      stripEmptyText(childrenToArray(unwrapFragmentChildren(root)))[0]
    )
    expect(paragraph.type).toBe('p')

    const link = asElement((paragraph.props as PropsWithChildren).children)
    expect(link.type).toBe('a')
    expect((link.props as Record<string, unknown>).href).toBe('')
    expect((link.props as PropsWithChildren).children).toBe('x')
  })

  test.concurrent('stringifies raw HTML instead of rendering it', async () => {
    const element = await getMarkdownContent({
      source: 'Hello <span>world</span>',
      runtime,
    })

    const root = asElement(element)
    const paragraph = asElement(
      stripEmptyText(childrenToArray(unwrapFragmentChildren(root)))[0]
    )
    expect(paragraph.type).toBe('p')

    const children = (paragraph.props as PropsWithChildren)
      .children as ReactNode
    expect(nodeText(children)).toBe('Hello <span>world</span>')
  })

  test.concurrent('applies remarkPlugins and rehypePlugins', async () => {
    const remarkAppendParagraph = () => {
      return (tree: MdastRoot) => {
        const tailText: Text = { type: 'text', value: 'TAIL' }
        const tailParagraph: Paragraph = {
          type: 'paragraph',
          children: [tailText],
        }
        tree.children.push(tailParagraph)
      }
    }

    const rehypeAddDataAttr = () => {
      return (tree: HastRoot) => {
        visit(tree, (node) => {
          if (isHastElement(node) && node.tagName === 'p') {
            node.properties = { ...(node.properties ?? {}), ['data-x']: '1' }
          }
        })
      }
    }

    const element = await getMarkdownContent({
      source: 'head',
      runtime,
      remarkPlugins: [remarkAppendParagraph],
      rehypePlugins: [rehypeAddDataAttr],
    })

    const root = asElement(element)
    const children = stripEmptyText(
      childrenToArray(unwrapFragmentChildren(root))
    )
    expect(children).toHaveLength(2)

    const first = asElement(children[0])
    expect(first.type).toBe('p')
    expect((first.props as Record<string, unknown>)['data-x']).toBe('1')
    expect((first.props as PropsWithChildren).children).toBe('head')

    const second = asElement(children[1])
    expect(second.type).toBe('p')
    expect((second.props as Record<string, unknown>)['data-x']).toBe('1')
    expect((second.props as PropsWithChildren).children).toBe('TAIL')
  })

  test.concurrent('works with rehype plugin addCodeBlock', async () => {
    type CodeBlockProps = React.ComponentPropsWithoutRef<'pre'> & {
      shouldFormat?: boolean
      language?: string
    }

    const CodeBlock = (props: CodeBlockProps) => jsx('pre', props)
    const element = await getMarkdownContent({
      source: ['```tsx', 'const x = 1', '```'].join('\n'),
      runtime,
      rehypePlugins: [addCodeBlock],
      components: { CodeBlock },
    })

    const root = asElement(element)
    const children = stripEmptyText(
      childrenToArray(unwrapFragmentChildren(root))
    )

    expect(children).toHaveLength(1)

    const codeBlock = asElement(children[0])
    expect(codeBlock.type).toBe(CodeBlock)
    const props = codeBlock.props as unknown as CodeBlockProps
    expect(props.shouldFormat).toBe(false)
    expect(props.language).toBe('tsx')

    // `addCodeBlock` moves the original code node children under CodeBlock.
    expect(nodeText(props.children)).toContain('const x = 1')
  })
})
