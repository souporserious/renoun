import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import { VFile } from 'vfile'
import type { Element, Root } from 'hast'
import type {
  MdxJsxAttribute,
  MdxJsxAttributeValueExpression,
  MdxJsxFlowElement,
} from 'mdast-util-mdx'

import addCodeBlock from './add-code-block'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasChildren(value: unknown): value is { children: unknown[] } {
  return isRecord(value) && Array.isArray(value.children)
}

function isHastElement(node: unknown): node is Element {
  return (
    isRecord(node) &&
    node.type === 'element' &&
    typeof node.tagName === 'string' &&
    Array.isArray((node as { children?: unknown }).children)
  )
}

function isMdxJsxFlowElement(node: unknown): node is MdxJsxFlowElement {
  if (!isRecord(node)) return false
  if (node.type !== 'mdxJsxFlowElement') return false
  if (typeof node.name !== 'string') return false
  return (
    Array.isArray(node.attributes) &&
    node.attributes.every(
      (attribute) =>
        isRecord(attribute) &&
        attribute.type === 'mdxJsxAttribute' &&
        typeof attribute.name === 'string'
    )
  )
}

function run(html: string, options?: { meta?: string; isMarkdown?: boolean }) {
  const file = new VFile({ value: html, path: 'test.html' })
  const processor = unified().use(rehypeParse, { fragment: true })

  if (options?.isMarkdown) {
    processor.data('isMarkdown', true)
  }

  processor.use(addCodeBlock)

  const tree = processor.parse(file) as Root

  // Inject meta (simulating remark->rehype pipeline attaching meta to code node)
  if (options?.meta) {
    const queue: unknown[] = [tree]
    while (queue.length) {
      const node = queue.shift()
      if (isHastElement(node) && node.tagName === 'code') {
        const element = node as unknown as { data?: Record<string, unknown> }
        element.data ??= {}
        element.data.meta = options.meta
        break
      }
      if (hasChildren(node)) {
        queue.push(...node.children)
      }
    }
  }

  const out = processor.runSync(tree, file) as unknown
  return { tree: out, file }
}

function getFirstChild(root: unknown): unknown {
  return hasChildren(root) ? root.children[0] : undefined
}

function getAttribute(
  node: unknown,
  name: string
): MdxJsxAttribute | undefined {
  if (!isMdxJsxFlowElement(node)) return undefined
  return node.attributes.find(
    (attr): attr is MdxJsxAttribute =>
      isRecord(attr) && attr.type === 'mdxJsxAttribute' && attr.name === name
  )
}

describe('rehype/add-code-block', () => {
  it('transforms <pre><code> to <CodeBlock> with language and default shouldFormat=false', () => {
    const { tree } = run(
      '<pre><code class="language-tsx">const x = 1</code></pre>'
    )
    const node = getFirstChild(tree)
    expect(isMdxJsxFlowElement(node)).toBe(true)
    if (!isMdxJsxFlowElement(node))
      throw new Error('Expected mdxJsxFlowElement')
    expect(node.name).toBe('CodeBlock')

    const language = getAttribute(node, 'language')
    const shouldFormat = getAttribute(node, 'shouldFormat')
    expect(language?.value).toBe('tsx')
    expect(
      (shouldFormat?.value as MdxJsxAttributeValueExpression | undefined)?.type
    ).toBe('mdxJsxAttributeValueExpression')
    expect(
      (shouldFormat?.value as MdxJsxAttributeValueExpression | undefined)?.value
    ).toBe('false')
  })

  it('parses meta string into props (flags, quoted, braced boolean/number) and overrides shouldFormat', () => {
    const meta = 'showLineNumbers title="Hello" tabSize={4} shouldFormat={true}'
    const { tree } = run('<pre><code class="language-tsx">x</code></pre>', {
      meta,
    })
    const node = getFirstChild(tree)
    expect(isMdxJsxFlowElement(node)).toBe(true)
    if (!isMdxJsxFlowElement(node))
      throw new Error('Expected mdxJsxFlowElement')
    expect(node.name).toBe('CodeBlock')

    const showLineNumbers = getAttribute(node, 'showLineNumbers')
    const title = getAttribute(node, 'title')
    const tabSize = getAttribute(node, 'tabSize')
    const shouldFormat = getAttribute(node, 'shouldFormat')

    expect(
      (showLineNumbers?.value as MdxJsxAttributeValueExpression | undefined)
        ?.type
    ).toBe('mdxJsxAttributeValueExpression')
    expect(
      (showLineNumbers?.value as MdxJsxAttributeValueExpression | undefined)
        ?.value
    ).toBe('true')
    expect(title?.value).toBe('Hello')
    expect(
      (tabSize?.value as MdxJsxAttributeValueExpression | undefined)?.type
    ).toBe('mdxJsxAttributeValueExpression')
    expect(
      (tabSize?.value as MdxJsxAttributeValueExpression | undefined)?.value
    ).toBe('4')
    expect(
      (shouldFormat?.value as MdxJsxAttributeValueExpression | undefined)?.value
    ).toBe('true')
  })

  it('derives path and language when class is "language-<path>.<ext>"', () => {
    const { tree } = run(
      '<pre><code class="language-getting-started.mdx">x</code></pre>'
    )
    const node = getFirstChild(tree)
    expect(isMdxJsxFlowElement(node)).toBe(true)
    if (!isMdxJsxFlowElement(node))
      throw new Error('Expected mdxJsxFlowElement')
    expect(node.name).toBe('CodeBlock')

    expect(getAttribute(node, 'path')?.value).toBe('getting-started.mdx')
    expect(getAttribute(node, 'language')?.value).toBe('mdx')
  })

  it('throws on invalid meta (unquoted/unbraced value)', () => {
    expect(() =>
      run('<pre><code class="language-ts">x</code></pre>', {
        meta: 'title=Hello',
      })
    ).toThrow(/Invalid meta prop/i)
  })

  it('replaces <pre><code> with a CodeBlock element when processor data.isMarkdown=true', () => {
    const { tree } = run('<pre><code class="language-tsx">x</code></pre>', {
      meta: 'showLineNumbers tabSize={4}',
      isMarkdown: true,
    })
    const node = getFirstChild(tree)
    expect(isHastElement(node)).toBe(true)
    if (!isHastElement(node)) throw new Error('Expected hast element')
    expect(node.tagName).toBe('CodeBlock')
    const properties = isRecord(node.properties)
      ? (node.properties as Record<string, unknown>)
      : {}
    expect(properties.language).toBe('tsx')
    expect(properties.shouldFormat).toBe(false)
    expect(properties.showLineNumbers).toBe(true)
    expect(properties.tabSize).toBe(4)
  })
})
