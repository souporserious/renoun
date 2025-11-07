import { describe, expect, test } from 'vitest'
import { compile, evaluate } from '@mdx-js/mdx'

import addHeadings from './add-headings'

describe('addHeadings', () => {
  test('string heading', async () => {
    const result = await compile(`# Hello, world!`, {
      remarkPlugins: [addHeadings],
    })

    const code = String(result)
    expect(code).toContain('export const headings = [{')
    expect(code).not.toContain('export const Heading')
    expect(code).not.toContain('_missingMdxReference("Heading"')
  })

  test('code heading', async () => {
    const result = await compile(`# Hello, \`world\`!`, {
      remarkPlugins: [addHeadings],
    })

    const code = String(result)
    expect(code).toContain('export const headings = [{')
    expect(code).not.toContain('export const Heading')
    expect(code).toContain('_components.code')
    expect(code).not.toContain('_missingMdxReference("Heading"')
  })

  test('link heading', async () => {
    const result = await compile(`# [Hello, world!](https://example.com)`, {
      remarkPlugins: [addHeadings],
    })

    const code = String(result)
    expect(code).toContain('export const headings = [{')
    expect(code).not.toContain('export const Heading')
    // Links inside headings are unwrapped; external URL should not be rendered in children
    expect(code).not.toContain('https://example.com')
    expect(code).not.toContain('_missingMdxReference("Heading"')
  })

  test('image heading', async () => {
    const result = await compile(
      `# ![Hello, world!](https://example.com/image.png)`,
      { remarkPlugins: [addHeadings] }
    )

    const code = String(result)
    expect(code).toContain('export const headings = [{')
    expect(code).not.toContain('export const Heading')
    expect(code).toContain('_components.img')
    expect(code).not.toContain('_missingMdxReference("Heading"')
  })

  test('Heading can be overridden via MDX components provider', async () => {
    const mdxSource = `# Hello`
    const jsxRuntime = {
      Fragment: Symbol.for('react.fragment'),
      jsx: () => null,
      jsxs: () => null,
    }
    const mod = await evaluate(mdxSource, {
      remarkPlugins: [addHeadings],
      development: false,
      ...jsxRuntime,
    })
    // Should render with default without error
    expect(() => (mod as any).default({})).not.toThrow()
    // Should also render with an override without error
    const override = () => 'OVERRIDDEN'
    expect(() =>
      (mod as any).default({ components: { Heading: override } })
    ).not.toThrow()
  })

  test('Tag resolves through _components.h1 with fallback to "h1"', async () => {
    const result = await compile(`# Hello`, {
      remarkPlugins: [addHeadings],
    })
    const code = String(result)
    // Ensure Tag is selected via components map first, then intrinsic element
    expect(code).toContain('_components.h1 || "h1"')
  })

  test('wraps headings with getHeadings when exported', async () => {
    const mdxSource = `
export function getHeadings(headings) {
  return [
    ...headings,
    { id: 'extra', level: 2, text: 'Extra', children: 'Extra' }
  ]
}

# Hello
`

    // Minimal jsxRuntime stub to evaluate without React in tests
    const jsxRuntime = {
      Fragment: Symbol.for('react.fragment'),
      jsx: () => null,
      jsxs: () => null,
    }

    const result = await evaluate(mdxSource, {
      remarkPlugins: [[addHeadings, { allowGetHeadings: true }]],
      development: false,
      ...jsxRuntime,
    })

    const headings = (result as any).headings as Array<any>

    // Ensure the compiled module exports headings that are the result of calling getHeadings([...])
    expect(Array.isArray(headings)).toBe(true)
    expect(headings.length).toBe(2)
    expect(headings[0].id).toBe('hello')
    expect(headings[1].id).toBe('extra')
  })

  test('runtime validation that getHeadings must return an array', async () => {
    const mdxSource = `
export function getHeadings(headings) {
  return { pwnd: true }
}

# Hello
`

    const jsxRuntime = {
      Fragment: Symbol.for('react.fragment'),
      jsx: () => null,
      jsxs: () => null,
    }

    await expect(
      evaluate(mdxSource, {
        remarkPlugins: [[addHeadings, { allowGetHeadings: true }]],
        development: false,
        ...jsxRuntime,
      })
    ).rejects.toThrow(/getHeadings\(headings\) must return an array/)
  })

  test('throws when exporting headings directly with guidance', async () => {
    const mdxSource = `
export const headings = []

# Hello
`

    const vfile = await compile(mdxSource, {
      remarkPlugins: [[addHeadings, { allowGetHeadings: true }]],
    })
    const messages = (vfile as any).messages as Array<any>
    const hasFatal = messages.some(
      (message) =>
        message.fatal &&
        /Exporting \"headings\" directly is not supported/i.test(message.reason)
    )
    expect(hasFatal).toBe(true)
  })
})
