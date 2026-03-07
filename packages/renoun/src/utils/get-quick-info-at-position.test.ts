import { describe, expect, test } from 'vitest'

import {
  formatQuickInfoDisplayText,
  formatQuickInfoDocumentationText,
} from './get-quick-info-at-position.ts'

describe('formatQuickInfoDisplayText', () => {
  test('formats paths relative to the current working directory first', () => {
    expect(
      formatQuickInfoDisplayText(
        'import("/Users/test/Code/renoun/packages/renoun/src/types").Foo',
        {
          rootDirectory: '/Users/test/Code/renoun',
          currentWorkingDirectory: '/Users/test/Code/renoun/packages/renoun',
        }
      )
    ).toBe('import("./src/types").Foo')
  })

  test('falls back to workspace-root shortening for sibling workspace paths', () => {
    expect(
      formatQuickInfoDisplayText(
        'import("/Users/test/Code/renoun/apps/site/src/types").Foo',
        {
          rootDirectory: '/Users/test/Code/renoun',
          currentWorkingDirectory: '/Users/test/Code/renoun/packages/renoun',
        }
      )
    ).toBe('import("./apps/site/src/types").Foo')
  })

  test('does not strip unrelated renoun path segments', () => {
    expect(
      formatQuickInfoDisplayText('import("/tmp/renoun/generated/types").Foo', {
        rootDirectory: '/Users/test/Code/renoun',
        currentWorkingDirectory: '/Users/test/Code/renoun/packages/renoun',
      })
    ).toBe('import("/tmp/renoun/generated/types").Foo')
  })

  test('matches forward-slash display text against windows-style cwd values', () => {
    expect(
      formatQuickInfoDisplayText('import("C:/repo/packages/renoun/src/types").Foo', {
        rootDirectory: 'C:\\repo',
        currentWorkingDirectory: 'C:\\repo\\packages\\renoun',
      })
    ).toBe('import("./src/types").Foo')
  })

  test('does not rewrite literal path strings outside import specifiers', () => {
    expect(
      formatQuickInfoDisplayText('const ROOT: "/Users/test/Code/renoun"', {
        rootDirectory: '/Users/test/Code/renoun',
        currentWorkingDirectory: '/Users/test/Code/renoun/packages/renoun',
      })
    ).toBe('const ROOT: "/Users/test/Code/renoun"')
  })
})

describe('formatQuickInfoDocumentationText', () => {
  test('formats linkText parts as markdown links', () => {
    expect(
      formatQuickInfoDocumentationText([
        { kind: 'text', text: 'See ' },
        { kind: 'linkText', text: 'https://example.com docs' },
        { kind: 'link', text: '' },
        { kind: 'text', text: ' for more.' },
      ])
    ).toBe('See [docs](https://example.com) for more.')
  })

  test('keeps linkName parts working as a compatibility fallback', () => {
    expect(
      formatQuickInfoDocumentationText([
        { kind: 'text', text: 'See ' },
        { kind: 'linkName', text: 'https://example.com docs' },
        { kind: 'link', text: '' },
        { kind: 'text', text: ' for more.' },
      ])
    ).toBe('See [docs](https://example.com) for more.')
  })
})
