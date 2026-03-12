import { describe, expect, test } from 'vitest'

import { getTsMorph } from '../utils/ts-morph.ts'
import {
  hydrateAnalysisDocumentSourceFile,
  resolveAnalysisDocument,
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
})
