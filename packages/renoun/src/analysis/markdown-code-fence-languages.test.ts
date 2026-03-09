import { describe, expect, test } from 'vitest'

import {
  extractCodeFenceLanguagesFromMarkdown,
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
})
