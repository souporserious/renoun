import { describe, expect, test } from 'vitest'

import { getTsMorph } from './ts-morph.ts'
import { getSourceTextMetadataFallback } from './get-source-text-metadata.ts'

const { Project } = getTsMorph()

describe('getSourceTextMetadataFallback', () => {
  test('returns deterministic generated metadata for inline TypeScript', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const sourceText = 'const value = 1'

    const first = getSourceTextMetadataFallback({
      project,
      value: sourceText,
      language: 'ts',
    })
    const second = getSourceTextMetadataFallback({
      project,
      value: sourceText,
      language: 'ts',
    })

    expect(first.value).toBe(sourceText)
    expect(first.language).toBe('ts')
    expect(first.filePath).toBe(second.filePath)
    expect(first.filePath?.startsWith('_renoun/')).toBe(true)
    expect(first.label).toBeUndefined()
  })

  test('resolves explicit relative paths against baseDirectory', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })

    const result = getSourceTextMetadataFallback({
      project,
      value: 'export const x = 1',
      language: 'ts',
      filePath: 'demo/example.ts',
      baseDirectory: '/workspace/src',
    })

    expect(result.filePath).toBe('/workspace/src/demo/example.ts')
    expect(result.label).toBe('demo/example.ts')
  })
})
