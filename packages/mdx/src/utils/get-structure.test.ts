import { describe, expect, test } from 'vitest'

import { getMarkdownStructure, getMDXStructure } from './get-structure.js'
import { getMarkdownSections, getMDXSections } from './get-sections.js'

describe('getStructure', () => {
  test.concurrent(
    'extracts text and collects nested sections for markdown',
    async () => {
      const source = [
        '---',
        'title: Example',
        '---',
        '',
        '# A',
        '',
        'Intro',
        '',
        '## B',
        '',
        'Body',
        '',
        '## B',
        '',
        'More',
        '',
        '### C',
        '',
        'Tail',
      ].join('\n')

      const result = await getMarkdownStructure({ source, format: 'text' })

      // Sections match the existing section collector behavior.
      expect(result.sections).toEqual(getMarkdownSections(source))

      // Frontmatter is parsed out and not included in extracted content.
      expect(result.frontmatter).toEqual({ title: 'Example' })

      // Text format should not include markdown heading markers.
      expect(result.content).toContain('A')
      expect(result.content).toContain('Intro')
      expect(result.content).not.toContain('# A')

      // Duplicate heading slugs are deduped.
      expect(result.sections[0]?.id).toBe('a')
      expect(result.sections[0]?.children?.[0]?.id).toBe('b')
      expect(result.sections[0]?.children?.[1]?.id).toBe('b-2')
      expect(result.sections[0]?.children?.[1]?.children?.[0]?.id).toBe('c')
    }
  )

  test.concurrent(
    'handles MDX: strips JSX/media, normalizes code meta, and collects sections',
    async () => {
      const source = [
        '---',
        'title: Example',
        '---',
        '',
        '# Hello <Badge />',
        '',
        '<Note>Inside</Note>',
        '',
        '<img src="/x.png" alt="x" />',
        '',
        '```ts showLineNumbers foo="bar"',
        'console.log(1)',
        '```',
        '',
        '# Hello World',
        '',
        'Some content.',
      ].join('\n')

      const result = await getMDXStructure({ source, format: 'markdown' })
      //   console.log(JSON.stringify(result, null, 2))

      // Sections match the existing section collector behavior (for headings).
      expect(result.sections).toEqual(getMDXSections(source))

      // Inline JSX in headings is removed from the title.
      expect(result.sections[0]?.title).toBe('Hello')
      expect(result.sections[0]?.id).toBe('hello')

      // Note is unwrapped, media tags are dropped.
      expect(result.content).toContain('Inside')
      expect(result.content).not.toContain('<img')

      // Code fence meta is sorted (alphabetical).
      expect(result.content).toContain('```ts foo="bar" showLineNumbers')
    }
  )
})
