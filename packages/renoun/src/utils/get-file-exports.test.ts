import { describe, expect, test, vi } from 'vitest'

import { getTsMorph } from './ts-morph.ts'
import { getFileExports } from './get-file-exports.ts'

const { Project } = getTsMorph()

describe('getFileExports', () => {
  test('uses the raw re-export fast path for relative barrel files', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })

    project.createSourceFile('/project/foo.ts', 'export const foo = 1', {
      overwrite: true,
    })
    const sourceFile = project.createSourceFile(
      '/project/index.ts',
      "export { foo } from './foo'",
      {
        overwrite: true,
      }
    )

    const exportedDeclarationsSpy = vi
      .spyOn(sourceFile, 'getExportedDeclarations')
      .mockImplementation(() => {
        throw new Error('getExportedDeclarations should not be called')
      })
    const exportSymbolsSpy = vi.spyOn(sourceFile, 'getExportSymbols')

    const fileExports = getFileExports('/project/index.ts', project)

    expect(exportSymbolsSpy).not.toHaveBeenCalled()
    expect(fileExports).toMatchObject([
      {
        name: 'foo',
        path: '/project/foo.ts',
      },
    ])

    exportSymbolsSpy.mockRestore()
    exportedDeclarationsSpy.mockRestore()
  })

  test('uses the raw re-export fast path for mixed local and star barrel files', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })

    project.createSourceFile('/project/core.ts', 'export const foo = 1', {
      overwrite: true,
    })
    const sourceFile = project.createSourceFile(
      '/project/index.ts',
      "export * from './core'\nexport const local = 2",
      {
        overwrite: true,
      }
    )

    const exportSymbolsSpy = vi.spyOn(sourceFile, 'getExportSymbols')

    const fileExports = getFileExports('/project/index.ts', project)

    expect(exportSymbolsSpy).not.toHaveBeenCalled()
    expect(fileExports).toMatchObject([
      {
        name: 'foo',
        path: '/project/core.ts',
      },
      {
        name: 'local',
        path: '/project/index.ts',
      },
    ])

    exportSymbolsSpy.mockRestore()
  })

  test('falls back to export symbols for local-only files', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })

    const sourceFile = project.createSourceFile(
      '/project/index.ts',
      'export const foo = 1',
      {
        overwrite: true,
      }
    )

    const exportSymbolsSpy = vi.spyOn(sourceFile, 'getExportSymbols')

    const fileExports = getFileExports('/project/index.ts', project)

    expect(exportSymbolsSpy).toHaveBeenCalledTimes(1)
    expect(fileExports).toMatchObject([
      {
        name: 'foo',
        path: '/project/index.ts',
      },
    ])

    exportSymbolsSpy.mockRestore()
  })
})
