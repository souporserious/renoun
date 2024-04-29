import { Project, type Directory } from 'ts-morph'

import { getSourceFilesOrderMap } from './get-source-files-sort-order'

describe('getSourceFilesOrderMap', () => {
  let project: Project
  let rootDirectory: Directory

  beforeEach(() => {
    project = new Project({
      useInMemoryFileSystem: true,
    })

    rootDirectory = project.createDirectory('/src')

    const componentsDirectory = rootDirectory.createDirectory('components')

    componentsDirectory.createSourceFile('Button.tsx', '')
    componentsDirectory.createSourceFile('index.ts', '')

    const codeBlockDirectory = componentsDirectory.createDirectory('CodeBlock')
    codeBlockDirectory.createSourceFile('CodeBlock.tsx', '')

    rootDirectory.createDirectory('utils').createSourceFile('helpers.ts', '')
  })

  test('should return an empty object when no files or directories are present', () => {
    const emptyDirectory = project.createDirectory('/empty')
    const orderMap = getSourceFilesOrderMap(emptyDirectory, [])
    expect(orderMap).toEqual({})
  })

  test('should return the correct order for files and directories', () => {
    const allPublicPaths = [
      '/src/components/Button.tsx',
      '/src/components/CodeBlock/CodeBlock.tsx',
      '/src/utils/helpers.ts',
    ]

    const orderMap = getSourceFilesOrderMap(rootDirectory, allPublicPaths)

    const expectedOrderMap = {
      '/src/components': '01',
      '/src/components/Button.tsx': '01.01',
      '/src/components/CodeBlock': '01.02',
      '/src/components/CodeBlock/CodeBlock.tsx': '01.02.01',
      '/src/utils': '02',
      '/src/utils/helpers.ts': '02.01',
    }
    expect(orderMap).toEqual(expectedOrderMap)
  })
})
