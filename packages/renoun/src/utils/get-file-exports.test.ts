import { describe, expect, test, vi } from 'vitest'

import { getTsMorph } from './ts-morph.ts'
import { getFileExports } from './get-file-exports.ts'

const { Project } = getTsMorph()

describe('getFileExports', () => {
  test('uses export symbols instead of exported declarations for barrel files', () => {
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

    expect(exportSymbolsSpy).toHaveBeenCalledTimes(1)
    expect(fileExports).toMatchObject([
      {
        name: 'foo',
        path: '/project/foo.ts',
      },
    ])

    exportSymbolsSpy.mockRestore()
    exportedDeclarationsSpy.mockRestore()
  })
})
