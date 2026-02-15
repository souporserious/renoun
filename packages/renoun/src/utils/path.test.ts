import { describe, expect, test } from 'vitest'

import { isAbsolutePath, joinPaths, relativePath } from './path.ts'

describe('path utilities windows support', () => {
  test.concurrent('joinPaths normalizes backslashes', () => {
    expect(joinPaths('src\\components', 'Button\\index.tsx')).toBe(
      'src/components/Button/index.tsx'
    )
  })

  test.concurrent('relativePath handles windows separators', () => {
    expect(
      relativePath('src\\components\\Button', 'src\\utils\\index.ts')
    ).toBe('../../utils/index.ts')
  })

  test.concurrent('detects absolute paths across platforms', () => {
    expect(isAbsolutePath('/repo')).toBe(true)
    expect(isAbsolutePath('C:\\repo')).toBe(true)
    expect(isAbsolutePath('C:/repo')).toBe(true)
    expect(isAbsolutePath('\\\\server\\share\\repo')).toBe(true)
    expect(isAbsolutePath('./repo')).toBe(false)
    expect(isAbsolutePath('repo\\file')).toBe(false)
    expect(isAbsolutePath('../repo')).toBe(false)
  })
})
