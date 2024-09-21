import { describe, test, expect, beforeEach } from 'vitest'
import { Project, type Directory } from 'ts-morph'

import { getSourceFilesOrderMap } from './get-source-files-sort-order.js'

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

  test('should return the correct order for files and directories', () => {
    const orderMap = getSourceFilesOrderMap(rootDirectory)
    const expectedOrderMap = new Map([
      ['/src', '00'],
      ['/src/components', '01'],
      ['/src/components/Button.tsx', '01.01'],
      ['/src/components/CodeBlock', '01.02'],
      ['/src/components/CodeBlock/CodeBlock.tsx', '01.02.01'],
      ['/src/components/index.ts', '01.03'],
      ['/src/utils', '02'],
      ['/src/utils/helpers.ts', '02.01'],
    ])
    expect(Array.from(orderMap.keys()).sort()).toEqual(
      Array.from(expectedOrderMap.keys()).sort()
    )
  })
})
