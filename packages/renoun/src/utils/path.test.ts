import { describe, expect, test } from 'vitest'

import { joinPaths, relativePath } from './path.js'

describe('path utilities windows support', () => {
  test('joinPaths normalizes backslashes', () => {
    expect(joinPaths('src\\components', 'Button\\index.tsx')).toBe(
      'src/components/Button/index.tsx'
    )
  })

  test('relativePath handles windows separators', () => {
    expect(
      relativePath('src\\components\\Button', 'src\\utils\\index.ts')
    ).toBe('../../utils/index.ts')
  })
})

