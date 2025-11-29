import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import { VFile } from 'vfile'

import addCodeBlock from './add-code-block'

function run(html: string, options?: { meta?: string; isMarkdown?: boolean }) {
  const file = new VFile({ value: html, path: 'test.html' })
  const processor = unified().use(rehypeParse, { fragment: true })

  if (options?.isMarkdown) {
    processor.data('isMarkdown', true)
  }

  processor.use(addCodeBlock)

  const tree = processor.parse(file)

  // Inject meta (simulating remark->rehype pipeline attaching meta to code node)
  if (options?.meta) {
    const queue: any[] = [tree]
    while (queue.length) {
      const node = queue.shift()
      if (node && node.type === 'element' && node.tagName === 'code') {
        node.data ??= {}
        node.data.meta = options.meta
        break
      }
      if (node && Array.isArray(node.children)) {
        queue.push(...node.children)
      }
    }
  }

  const out = processor.runSync(tree, file) as any
  return { tree: out, file }
}

function getFirstChild(root) {
  return Array.isArray(root.children) ? root.children[0] : undefined
}

function getAttribute(
  node: any,
  name: string
): { type: string; name: string; value: any } | undefined {
  return (node?.attributes ?? []).find((a: any) => a?.name === name)
}

describe('rehype/add-code-block', () => {
  it('transforms <pre><code> to <CodeBlock> with language and default shouldFormat=false', () => {
    const { tree } = run(
      '<pre><code class="language-tsx">const x = 1</code></pre>'
    )
    const node = getFirstChild(tree)
    expect(node?.type).toBe('mdxJsxFlowElement')
    expect(node?.name).toBe('CodeBlock')

    const language = getAttribute(node, 'language')
    const shouldFormat = getAttribute(node, 'shouldFormat')
    expect(language?.value).toBe('tsx')
    expect(shouldFormat?.value?.type).toBe('mdxJsxAttributeValueExpression')
    expect(shouldFormat?.value?.value).toBe('false')
  })

  it('parses meta string into props (flags, quoted, braced boolean/number) and overrides shouldFormat', () => {
    const meta = 'showLineNumbers title="Hello" tabSize={4} shouldFormat={true}'
    const { tree } = run('<pre><code class="language-tsx">x</code></pre>', {
      meta,
    })
    const node = getFirstChild(tree)
    expect(node?.type).toBe('mdxJsxFlowElement')
    expect(node?.name).toBe('CodeBlock')

    const showLineNumbers = getAttribute(node, 'showLineNumbers')
    const title = getAttribute(node, 'title')
    const tabSize = getAttribute(node, 'tabSize')
    const shouldFormat = getAttribute(node, 'shouldFormat')

    expect(showLineNumbers?.value?.type).toBe('mdxJsxAttributeValueExpression')
    expect(showLineNumbers?.value?.value).toBe('true')
    expect(title?.value).toBe('Hello')
    expect(tabSize?.value?.type).toBe('mdxJsxAttributeValueExpression')
    expect(tabSize?.value?.value).toBe('4')
    expect(shouldFormat?.value?.value).toBe('true')
  })

  it('derives path and language when class is "language-<path>.<ext>"', () => {
    const { tree } = run(
      '<pre><code class="language-getting-started.mdx">x</code></pre>'
    )
    const node = getFirstChild(tree)
    expect(node?.type).toBe('mdxJsxFlowElement')
    expect(node?.name).toBe('CodeBlock')

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
      isMarkdown: true,
      meta: 'showLineNumbers tabSize={4}',
    })
    const node = getFirstChild(tree)
    expect(node?.type).toBe('element')
    expect(node?.tagName).toBe('CodeBlock')
    expect(node?.properties?.language).toBe('tsx')
    expect(node?.properties?.shouldFormat).toBe(false)
    expect(node?.properties?.showLineNumbers).toBe(true)
    expect(node?.properties?.tabSize).toBe(4)
  })
})
