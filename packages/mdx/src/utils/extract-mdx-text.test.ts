import { describe, expect, test } from 'vitest'

import {
  extractMdxTextTree,
  type MdxComponentHandler,
} from './extract-mdx-text.js'

describe('extractMdxTextTree', () => {
  test.concurrent(
    'produces deterministic markdown for headings and nested lists',
    async () => {
      const source = [
        '# Title',
        '',
        '- A',
        '  - A1',
        '  - A2',
        '- B',
        '',
        '1. One',
        '   1. One-A',
        '2. Two',
      ].join('\n')

      const result = await extractMdxTextTree({
        source,
        syntax: 'md',
        format: 'markdown',
      })

      expect(result.diagnostics).toEqual([])

      // The output is intentionally normalized by the serializer (indent + bullet styles).
      expect(result.content).toBe(
        [
          '# Title',
          '',
          '- A',
          '    - A1',
          '    - A2',
          '- B',
          '',
          '1. One',
          '     1. One-A',
          '1. Two',
        ].join('\n')
      )
    }
  )

  test.concurrent('drops inline JSX, ESM, and { } expressions', async () => {
    const source = [
      'export const X = 1',
      '',
      '# Hello <Badge />',
      '',
      'Text {1 + 1} end.',
      '',
      '{/* flow expression */}',
    ].join('\n')

    const result = await extractMdxTextTree({
      source,
      syntax: 'mdx',
      format: 'text',
    })

    const normalized = result.content.replace(/\s+/g, ' ').trim()
    expect(normalized).toContain('Hello')
    expect(normalized).toContain('Text end.')
    expect(result.content).not.toContain('<Badge')
    expect(result.content).not.toContain('export const')
    expect(result.content).not.toContain('1 + 1')
    expect(result.content).not.toContain('flow expression')
  })

  test.concurrent(
    'normalizes code fence meta and reports invalid meta without throwing',
    async () => {
      const source = [
        '```ts showLineNumbers foo="bar" bad=nope baz={2}',
        'console.log(1)',
        '```',
      ].join('\n')

      const result = await extractMdxTextTree({
        source,
        syntax: 'md',
        format: 'markdown',
      })

      expect(result.content).toContain(
        '```ts baz={2} foo="bar" showLineNumbers'
      )
      expect(result.content).not.toContain('bad=nope')

      expect(result.diagnostics.length).toBeGreaterThan(0)
      expect(result.diagnostics[0]?.message).toContain(
        'Invalid code fence meta'
      )
    }
  )

  test.concurrent(
    'unwraps callouts via component handlers (flow + inline)',
    async () => {
      const source = [
        '<Note>',
        '',
        '- A',
        '- B',
        '',
        '</Note>',
        '',
        'Inline: <Note>Inside</Note>.',
      ].join('\n')

      const result = await extractMdxTextTree({
        source,
        syntax: 'mdx',
        format: 'markdown',
      })

      // Flow callout keeps block children.
      expect(result.content).toContain('- A')
      expect(result.content).toContain('- B')

      // Inline callout keeps phrasing children.
      expect(result.content).toContain('Inline: Inside.')
    }
  )

  test.concurrent(
    'supports configured unknown component fallback: unwrap vs drop',
    async () => {
      const source = [
        '<Widget>',
        '',
        '- A',
        '',
        '</Widget>',
        '',
        'Inline <Widget>Hi</Widget>.',
      ].join('\n')

      const unwrap = await extractMdxTextTree({
        source,
        syntax: 'mdx',
        format: 'text',
        unknownComponentHandling: 'unwrap',
      })

      expect(unwrap.content).toContain('A')
      expect(unwrap.content).toContain('Hi')

      const drop = await extractMdxTextTree({
        source,
        syntax: 'mdx',
        format: 'text',
        unknownComponentHandling: 'drop',
      })

      expect(drop.content).not.toContain('A')
      expect(drop.content).not.toContain('Hi')
    }
  )

  test.concurrent(
    'extracts readable text from HTML tables and <details>/<summary> blocks',
    async () => {
      const source = [
        '<table><tr><td>A</td><td>B</td></tr></table>',
        '',
        '<details><summary>Sum</summary>Body</details>',
      ].join('\n')

      const result = await extractMdxTextTree({
        source,
        syntax: 'md',
        format: 'text',
      })

      expect(result.content).toContain('A | B')
      expect(result.content).toContain('Sum')
      expect(result.content).toContain('Body')
    }
  )

  test.concurrent(
    'keeps readable text for MDX <details>/<summary> wrapper components',
    async () => {
      const source = [
        '<details>',
        '  <summary>Sum</summary>',
        '  Body',
        '</details>',
      ].join('\n')

      const result = await extractMdxTextTree({
        source,
        syntax: 'mdx',
        format: 'text',
      })

      expect(result.content).toContain('Sum')
      expect(result.content).toContain('Body')
    }
  )

  test.concurrent(
    'strips embedded media (markdown + html + MDX tags)',
    async () => {
      const source = [
        '![alt](./x.png)',
        '',
        '<img src="/x.png" alt="x" />',
        '',
        '<video src="/x.mp4" />',
        '',
        '<img />',
      ].join('\n')

      const result = await extractMdxTextTree({
        source,
        syntax: 'mdx',
        format: 'text',
      })

      expect(result.content).not.toContain('img')
      expect(result.content).not.toContain('video')
      expect(result.content).not.toContain('alt')
    }
  )

  test.concurrent(
    'allows custom component handlers to rewrite output',
    async () => {
      const Callout: MdxComponentHandler = ({ node, transformChildren }) => {
        const children = Array.isArray(node.children)
          ? transformChildren(node.children as any)
          : []

        return [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: 'CALLOUT: ' }, ...children],
          } as any,
        ]
      }

      const source = '<Callout>Hello</Callout>'

      const result = await extractMdxTextTree({
        source,
        syntax: 'mdx',
        format: 'text',
        componentHandlers: { Callout },
      })

      expect(result.content).toContain('CALLOUT: Hello')
    }
  )
})
