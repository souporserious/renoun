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
    expect(first.valueSignature).toBe(second.valueSignature)
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

  test('virtualizes explicit snippet paths by source content while preserving labels', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })

    const first = getSourceTextMetadataFallback({
      project,
      value: 'export const first = 1',
      language: 'ts',
      filePath: 'demo/example.ts',
      baseDirectory: '/workspace/src',
      virtualizeFilePath: true,
    })
    const second = getSourceTextMetadataFallback({
      project,
      value: 'export const second = 2',
      language: 'ts',
      filePath: 'demo/example.ts',
      baseDirectory: '/workspace/src',
      virtualizeFilePath: true,
    })

    expect(first.filePath).toContain(
      '/workspace/src/demo/example.__renoun_snippet_'
    )
    expect(first.filePath).not.toBe(second.filePath)
    expect(first.label).toBe('demo/example.ts')
    expect(second.label).toBe('demo/example.ts')
    expect(first.valueSignature).not.toBe(second.valueSignature)
  })
})
