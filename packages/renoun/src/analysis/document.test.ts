import { describe, expect, test } from 'vitest'

import { getTsMorph } from '../utils/ts-morph.ts'
import {
  hydrateAnalysisDocumentSourceFile,
  resolveAnalysisDocument,
  resolveVirtualizedAnalysisDocumentStableFilePath,
} from './document.ts'

const { Project } = getTsMorph()

describe('analysis document', () => {
  for (const extension of ['cjs', 'cts', 'mts'] as const) {
    test(`treats .${extension} inline snippets as JavaScript-like`, () => {
      const document = resolveAnalysisDocument({
        value: 'export const value = 1',
        language: extension,
      })

      expect(document.isJavaScriptLikeLanguage).toBe(true)
      expect(document.filePath).toMatch(new RegExp(`\\.${extension}$`))
    })

    test(`hydrates .${extension} source files into ts-morph`, () => {
      const project = new Project({
        useInMemoryFileSystem: true,
      })
      const filePath = `/virtual/source.${extension}`

      hydrateAnalysisDocumentSourceFile(project, {
        value: 'export const value = 1',
        filePath,
      })

      expect(project.getSourceFile(filePath)).toBeDefined()
    })
  }

  test('preserves generated Windows snippet paths when virtualizing', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const generatedFilePath = 'C:\\repo\\_renoun\\snippet.tsx'

    project.createSourceFile(generatedFilePath, 'export const value = 1', {
      overwrite: true,
    })

    expect(
      resolveVirtualizedAnalysisDocumentStableFilePath(project, generatedFilePath)
    ).toBe(generatedFilePath)
  })

  test('matches existing Windows source files for relative virtualized snippet paths', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    project.createSourceFile('C:\\repo\\src\\file.ts', 'export const value = 1', {
      overwrite: true,
    })

    expect(
      resolveVirtualizedAnalysisDocumentStableFilePath(project, 'src\\file.ts')
    ).toBe('src\\file.__renoun_source.ts')
  })
})
