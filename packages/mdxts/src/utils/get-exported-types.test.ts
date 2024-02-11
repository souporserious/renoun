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
      `export { MDXComponents } from './MDXComponents'`,
      { overwrite: true }
    )
    const [types] = getExportedTypes(sourceFile)

    expect(types.name).toEqual('useMDXComponents')
  })
})
