import { describe, expect, test, vi } from 'vitest'

import { getTsMorph } from '../utils/ts-morph.ts'
import { coerceAnalysisDocumentSourceFileToModule } from './document.ts'

const { Project } = getTsMorph()

describe('coerceAnalysisDocumentSourceFileToModule', () => {
  test('coerces snippet files into modules without AST export insertion', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const sourceFile = project.createSourceFile(
      '/workspace/src/snippet.ts',
      'const value = 1\n',
      {
        overwrite: true,
      }
    )
    const addExportDeclarationSpy = vi.spyOn(sourceFile, 'addExportDeclaration')

    expect(() =>
      coerceAnalysisDocumentSourceFileToModule(sourceFile)
    ).not.toThrow()

    expect(addExportDeclarationSpy).not.toHaveBeenCalled()
    expect(sourceFile.getFullText()).toBe('const value = 1\nexport {}\n')
  })
})
