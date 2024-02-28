import { Project } from 'ts-morph'
import { getExportedTypes } from './get-exported-types'

describe('getExportedTypes', () => {
  const project = new Project()

  it('gets exported types from source file', () => {
    const sourceFile = project.createSourceFile(
      'src/MDXComponents.ts',
      `export const MDXComponents = {}\n\nexport function useMDXComponents() {}`,
      { overwrite: true }
    )
    const [types] = getExportedTypes(sourceFile)

    expect(types.name).toEqual('useMDXComponents')
  })

  it('gets exported types from index source file', () => {
    project.createSourceFile(
      'src/MDXComponents.ts',
      `export const MDXComponents = {}\n\nexport function useMDXComponents() {}`,
      { overwrite: true }
    )
    const sourceFile = project.createSourceFile(
      'src/index.ts',
      `export { useMDXComponents } from './MDXComponents'`,
      { overwrite: true }
    )
    const [types] = getExportedTypes(sourceFile)

    expect(types.name).toEqual('useMDXComponents')
  })

  it('accounts for internal JSDoc tag for function declarations', () => {
    project.createSourceFile(
      'src/MDXComponents.ts',
      `/** @internal */\nexport function useMDXComponents() {}`,
      { overwrite: true }
    )
    const sourceFile = project.createSourceFile(
      'src/index.ts',
      `export { useMDXComponents } from './MDXComponents'`,
      { overwrite: true }
    )
    const exportedTypes = getExportedTypes(sourceFile)

    expect(exportedTypes).toHaveLength(0)
  })

  it('accounts for internal JSDoc tag for variable declarations', () => {
    project.createSourceFile(
      'src/MDXComponents.ts',
      `/** @internal */\nexport const useMDXComponents = () => {}`,
      { overwrite: true }
    )
    const sourceFile = project.createSourceFile(
      'src/index.ts',
      `export { useMDXComponents } from './MDXComponents'`,
      { overwrite: true }
    )
    const exportedTypes = getExportedTypes(sourceFile)

    expect(exportedTypes).toHaveLength(0)
  })

  it('uses index exports to determine implicit internal exports', () => {
    const sourceFile = project.createSourceFile(
      'src/MDXComponents.ts',
      `export const MDXComponents = {}\n\nexport function useMDXComponents() {}`,
      { overwrite: true }
    )
    const indexSourceFile = project.createSourceFile(
      'src/index.ts',
      `export { MDXComponents } from './MDXComponents'`,
      { overwrite: true }
    )
    const indexExportedDeclarations = Array.from(
      indexSourceFile.getExportedDeclarations()
    ).flatMap(([, allDeclarations]) => allDeclarations)
    const exportedTypes = getExportedTypes(
      sourceFile,
      indexExportedDeclarations
    )

    expect(exportedTypes).toHaveLength(0)
  })
})
