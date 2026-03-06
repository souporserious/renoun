import { describe, expect, test } from 'vitest'

import { formatQuickInfoDisplayText } from './get-quick-info-at-position.ts'

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
})
