import { describe, test, expect } from 'vitest'
import { Project } from 'ts-morph'

import { getDirectorySourceFile } from './get-directory-source-file'

describe('getDirectorySourceFile', () => {
  test('returns index file', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const directory = project.createDirectory('Button')
    const sourceFile = directory.createSourceFile('index.ts')
    const result = getDirectorySourceFile(directory, ['ts'])

    expect(result).toBe(sourceFile)
  })

  test('returns README file', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const directory = project.createDirectory('Button')
    const sourceFile = directory.createSourceFile('README.md')
    const result = getDirectorySourceFile(directory, ['md'])

    expect(result).toBe(sourceFile)
  })

  test('returns file with the same name as the directory', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const directory = project.createDirectory('Button')
    const sourceFile = directory.createSourceFile('Button.mdx')
    const result = getDirectorySourceFile(directory, ['mdx'])

    expect(result).toBe(sourceFile)
  })

  test('gives priority to the directory-named file over index or README', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const directory = project.createDirectory('Button')
    directory.createSourceFile('index.ts')
    directory.createSourceFile('README.md')
    const sourceFile = directory.createSourceFile('Button.mdx')
    const result = getDirectorySourceFile(directory, ['ts', 'md', 'mdx'])

    expect(result).toBe(sourceFile)
  })

  test('returns undefined if no files match the valid extensions', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const directory = project.createDirectory('Button')
    directory.createSourceFile('index.js')
    directory.createSourceFile('README.txt')
    const result = getDirectorySourceFile(directory, ['ts', 'md'])

    expect(result).toBeUndefined()
  })

  test('returns the first matching file if multiple valid files exist', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const directory = project.createDirectory('Button')
    const indexFile = directory.createSourceFile('index.ts')
    directory.createSourceFile('README.md')
    const result = getDirectorySourceFile(directory, ['ts', 'md'])

    expect(result).toBe(indexFile)
  })

  test('handles case-sensitive file names correctly', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const directory = project.createDirectory('Button')
    const readmeFile = directory.createSourceFile('readme.md')
    const result = getDirectorySourceFile(directory, ['md'])

    expect(result).toBe(readmeFile)
  })

  test('returns undefined for an empty directory', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const directory = project.createDirectory('Button')
    const result = getDirectorySourceFile(directory, ['ts', 'md'])

    expect(result).toBeUndefined()
  })
})
