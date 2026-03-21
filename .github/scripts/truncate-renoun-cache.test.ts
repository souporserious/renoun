import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

describe('truncate-renoun-cache script', () => {
  test('covers root, app, and example Next cache databases before saving', () => {
    const scriptSource = readFileSync(
      '.github/scripts/truncate-renoun-cache.sh',
      'utf8'
    )

    expect(scriptSource).toContain('.next/cache/renoun/fs-cache.sqlite')
    expect(scriptSource).toContain('.renoun/cache/fs-cache.sqlite')
    expect(scriptSource).toContain('apps/*/.next/cache/renoun/fs-cache.sqlite')
    expect(scriptSource).toContain('apps/*/.renoun/cache/fs-cache.sqlite')
    expect(scriptSource).toContain('examples/*/.next/cache/renoun/fs-cache.sqlite')
    expect(scriptSource).toContain('examples/*/.renoun/cache/fs-cache.sqlite')
  })
})
