import { describe, expect, test } from 'vitest'

import {
  extractCodeFenceLanguagesFromMarkdown,
  extractCodeFenceSnippetsFromMarkdown,
  isMarkdownCodeFenceSourcePath,
} from './markdown-code-fence-languages.ts'

describe('markdown code fence language extraction', () => {
  test('extracts fenced languages from backticks and tildes', () => {
    const source = [
      '# Title',
      '',
      '```ts',
      'const value = 1',
      '```',
      '',
      '~~~bash',
      'echo "hello"',
      '~~~',
      '',
    ].join('\n')

    expect(extractCodeFenceLanguagesFromMarkdown(source)).toEqual(['ts', 'bash'])
  })

  test('normalizes language token variants', () => {
    const source = [
      '```language-tsx path="app/page.tsx"',
      'export default function Page() {}',
      '```',
      '',
      '```{.mjs}',
      'export const value = 1',
      '```',
      '',
      '```SHELL',
      'echo "ok"',
      '```',
    ].join('\n')

    expect(extractCodeFenceLanguagesFromMarkdown(source)).toEqual([
      'tsx',
      'js',
      'shell',
    ])
  })

  test('handles fences without language and keeps unique ordering', () => {
    const source = [
      '```',
      'no language',
      '```',
      '',
      '```ts',
      'const a = 1',
      '```',
      '',
      '```ts title="again"',
      'const b = 2',
      '```',
    ].join('\n')

    expect(extractCodeFenceLanguagesFromMarkdown(source)).toEqual(['ts'])
  })

  test('detects markdown source extensions', () => {
    expect(isMarkdownCodeFenceSourcePath('/a/b/file.md')).toBe(true)
    expect(isMarkdownCodeFenceSourcePath('/a/b/file.mdx')).toBe(true)
    expect(isMarkdownCodeFenceSourcePath('/a/b/file.ts')).toBe(false)
  })

  test('extracts code fence snippets with path and formatting metadata', () => {
    const source = [
      '```tsx path="app/page.tsx"',
      'export default function Page() {}',
      '```',
      '',
      '```ts shouldFormat={true} allowErrors',
      'const answer:number = 42',
      '```',
      '',
      '```',
      'plain text',
      '```',
    ].join('\n')

    expect(extractCodeFenceSnippetsFromMarkdown(source)).toEqual([
      {
        language: 'tsx',
        path: 'app/page.tsx',
        shouldFormat: false,
        value: 'export default function Page() {}',
      },
      {
        allowErrors: true,
        language: 'ts',
        shouldFormat: true,
        value: 'const answer:number = 42',
      },
      {
        shouldFormat: false,
        value: 'plain text',
      },
    ])
  })

  test('preserves allowErrors strings and showErrors flags from code fence meta', () => {
    const source = [
      '```tsx allowErrors="2307" showErrors={false}',
      "import { missing } from './missing'",
      '```',
    ].join('\n')

    expect(extractCodeFenceSnippetsFromMarkdown(source)).toEqual([
      {
        allowErrors: '2307',
        language: 'tsx',
        showErrors: false,
        shouldFormat: false,
        value: "import { missing } from './missing'",
      },
    ])
  })
})
