import { describe, expect, test } from 'vitest'

import {
  isAbsolutePath,
  joinPaths,
  normalizePathKey,
  normalizeWorkspaceRelativePath,
  relativePath,
  trimLeadingCurrentDirPrefix,
  trimLeadingDotPrefix,
  trimLeadingDotsSegment,
  trimLeadingDotSlash,
  trimLeadingSlashes,
} from './path.ts'

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

describe('normalizePathKey', () => {
  test.concurrent('normalizes root-like values to dot', () => {
    expect(normalizePathKey('')).toBe('.')
    expect(normalizePathKey('/')).toBe('.')
    expect(normalizePathKey('./')).toBe('.')
  })

  test.concurrent('normalizes slashes and trims outer separators', () => {
    expect(normalizePathKey('\\src\\components\\')).toBe('src/components')
    expect(normalizePathKey('///src/components///')).toBe('src/components')
    expect(normalizePathKey('./\\src\\components\\')).toBe('src/components')
  })

  test.concurrent('keeps additional leading dot segments after first trim', () => {
    expect(normalizePathKey('././src/file.ts')).toBe('./src/file.ts')
  })
})

describe('shared path trimming helpers', () => {
  test.concurrent('trimLeadingDotSlash strips one leading current-directory segment', () => {
    expect(trimLeadingDotSlash('./src/file.ts')).toBe('src/file.ts')
    expect(trimLeadingDotSlash('././src/file.ts')).toBe('./src/file.ts')
    expect(trimLeadingDotSlash('.///src/file.ts')).toBe('src/file.ts')
    expect(trimLeadingDotSlash('../src/file.ts')).toBe('../src/file.ts')
  })

  test.concurrent('trimLeadingCurrentDirPrefix removes only a single ./ prefix', () => {
    expect(trimLeadingCurrentDirPrefix('./src/file.ts')).toBe('src/file.ts')
    expect(trimLeadingCurrentDirPrefix('.//src/file.ts')).toBe('/src/file.ts')
    expect(trimLeadingCurrentDirPrefix('../src/file.ts')).toBe('../src/file.ts')
  })

  test.concurrent('trimLeadingSlashes removes all leading forward slashes', () => {
    expect(trimLeadingSlashes('///src/file.ts')).toBe('src/file.ts')
    expect(trimLeadingSlashes('/')).toBe('')
    expect(trimLeadingSlashes('src/file.ts')).toBe('src/file.ts')
  })

  test.concurrent('trimLeadingDotPrefix removes a leading dot marker', () => {
    expect(trimLeadingDotPrefix('./src/file.ts')).toBe('src/file.ts')
    expect(trimLeadingDotPrefix('.src/file.ts')).toBe('src/file.ts')
    expect(trimLeadingDotPrefix('.')).toBe('')
    expect(trimLeadingDotPrefix('../src/file.ts')).toBe('./src/file.ts')
  })

  test.concurrent('trimLeadingDotsSegment removes one leading all-dot segment', () => {
    expect(trimLeadingDotsSegment('./src/file.ts')).toBe('src/file.ts')
    expect(trimLeadingDotsSegment('../src/file.ts')).toBe('src/file.ts')
    expect(trimLeadingDotsSegment('.../src/file.ts')).toBe('src/file.ts')
    expect(trimLeadingDotsSegment('src/file.ts')).toBe('src/file.ts')
  })

  test.concurrent('normalizeWorkspaceRelativePath keeps absolute roots and trims current-dir prefixes', () => {
    expect(normalizeWorkspaceRelativePath('')).toBe('')
    expect(normalizeWorkspaceRelativePath('.')).toBe('')
    expect(normalizeWorkspaceRelativePath('./')).toBe('')
    expect(normalizeWorkspaceRelativePath('./src/file.ts')).toBe('src/file.ts')
    expect(normalizeWorkspaceRelativePath('/src/file.ts')).toBe('/src/file.ts')
  })
})
