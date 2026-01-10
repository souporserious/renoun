import { describe, test, expect } from 'vitest'
import { getTsMorph } from './ts-morph.ts'

const { Project } = getTsMorph()

import { getDirectorySourceFile } from './get-directory-source-file'

describe('getDirectorySourceFile', () => {
  test.concurrent('returns index file', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const directory = project.createDirectory('Button')
    const sourceFile = directory.createSourceFile('index.ts')
    const result = getDirectorySourceFile(directory, ['ts'])

    expect(result).toBe(sourceFile)
  })

  test.concurrent('returns README file', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const directory = project.createDirectory('Button')
    const sourceFile = directory.createSourceFile('README.md')
    const result = getDirectorySourceFile(directory, ['md'])

    expect(result).toBe(sourceFile)
  })

  test.concurrent('returns file with the same name as the directory', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const directory = project.createDirectory('Button')
    const sourceFile = directory.createSourceFile('Button.mdx')
    const result = getDirectorySourceFile(directory, ['mdx'])

    expect(result).toBe(sourceFile)
  })

  test.concurrent('gives priority to the directory-named file over index or README', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const directory = project.createDirectory('Button')
    directory.createSourceFile('index.ts')
    directory.createSourceFile('README.md')
    const sourceFile = directory.createSourceFile('Button.mdx')
    const result = getDirectorySourceFile(directory, ['ts', 'md', 'mdx'])

    expect(result).toBe(sourceFile)
  })

  test.concurrent('returns undefined if no files match the valid extensions', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const directory = project.createDirectory('Button')
    directory.createSourceFile('index.js')
    directory.createSourceFile('README.txt')
    const result = getDirectorySourceFile(directory, ['ts', 'md'])

    expect(result).toBeUndefined()
  })

  test.concurrent('returns the first matching file if multiple valid files exist', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const directory = project.createDirectory('Button')
    const indexFile = directory.createSourceFile('index.ts')
    directory.createSourceFile('README.md')
    const result = getDirectorySourceFile(directory, ['ts', 'md'])

    expect(result).toBe(indexFile)
  })

  test.concurrent('handles case-sensitive file names correctly', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const directory = project.createDirectory('Button')
    const readmeFile = directory.createSourceFile('readme.md')
    const result = getDirectorySourceFile(directory, ['md'])

    expect(result).toBe(readmeFile)
  })

  test.concurrent('returns undefined for an empty directory', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const directory = project.createDirectory('Button')
    const result = getDirectorySourceFile(directory, ['ts', 'md'])

    expect(result).toBeUndefined()
  })
})
