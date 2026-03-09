import { describe, expect, test } from 'vitest'

import { getTsMorph } from '../../utils/ts-morph.ts'
import {
  getSourceTextMetadata,
  getSourceTextMetadataFallback,
} from './source-text-metadata.ts'

const { Project } = getTsMorph()

describe('getSourceTextMetadataFallback', () => {
  test('returns deterministic generated metadata for inline TypeScript', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const sourceText = 'const value = 1'

    const first = getSourceTextMetadataFallback({
      project,
      value: sourceText,
      language: 'ts',
    })
    const second = getSourceTextMetadataFallback({
      project,
      value: sourceText,
      language: 'ts',
    })

    expect(first.value).toBe(sourceText)
    expect(first.language).toBe('ts')
    expect(first.filePath).toBe(second.filePath)
    expect(first.filePath?.startsWith('_renoun/')).toBe(true)
    expect(first.label).toBeUndefined()
    expect(first.valueSignature).toBe(second.valueSignature)
  })

  test('resolves explicit relative paths against baseDirectory', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })

    const result = getSourceTextMetadataFallback({
      project,
      value: 'export const x = 1',
      language: 'ts',
      filePath: 'demo/example.ts',
      baseDirectory: '/workspace/src',
    })

    expect(result.filePath).toBe('/workspace/src/demo/example.ts')
    expect(result.label).toBe('demo/example.ts')
  })

  test('virtualizes explicit snippet paths by source content while preserving labels', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })

    const first = getSourceTextMetadataFallback({
      project,
      value: 'export const first = 1',
      language: 'ts',
      filePath: 'demo/example.ts',
      baseDirectory: '/workspace/src',
      virtualizeFilePath: true,
    })
    const second = getSourceTextMetadataFallback({
      project,
      value: 'export const second = 2',
      language: 'ts',
      filePath: 'demo/example.ts',
      baseDirectory: '/workspace/src',
      virtualizeFilePath: true,
    })

    expect(first.filePath).toContain(
      '/workspace/src/demo/example.__renoun_snippet_'
    )
    expect(first.filePath).not.toBe(second.filePath)
    expect(first.label).toBe('demo/example.ts')
    expect(second.label).toBe('demo/example.ts')
    expect(first.valueSignature).not.toBe(second.valueSignature)
  })

  test('preserves absolute explicit file paths when baseDirectory is undefined', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })

    const result = getSourceTextMetadataFallback({
      project,
      value: 'export const x = 1',
      language: 'ts',
      filePath: '/workspace/src/demo/example.ts',
    })

    expect(result.filePath).toBe('/workspace/src/demo/example.ts')
    expect(result.filePath?.startsWith('_renoun/')).toBe(false)
  })
})

describe('getSourceTextMetadata', () => {
  test('keeps virtualized explicit snippets in module scope after normalization', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const value = 'const snippetValue = 1\n'

    const first = await getSourceTextMetadata({
      project,
      value,
      language: 'ts',
      filePath: 'demo/one.ts',
      baseDirectory: '/workspace/src',
      virtualizeFilePath: true,
      shouldFormat: false,
    })
    const second = await getSourceTextMetadata({
      project,
      value,
      language: 'ts',
      filePath: 'demo/two.ts',
      baseDirectory: '/workspace/src',
      virtualizeFilePath: true,
      shouldFormat: false,
    })

    const firstSourceFile = project.getSourceFileOrThrow(first.filePath!)
    const secondSourceFile = project.getSourceFileOrThrow(second.filePath!)

    expect(firstSourceFile.getExportDeclarations()).toHaveLength(1)
    expect(secondSourceFile.getExportDeclarations()).toHaveLength(1)
    expect(
      project
        .getPreEmitDiagnostics()
        .filter((diagnostic) => diagnostic.getCode() === 2451)
    ).toHaveLength(0)
  })

  test('keeps stable explicit snippet paths available for relative imports', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })

    const sourceModule = await getSourceTextMetadata({
      project,
      value: 'export const posts = 1\n',
      language: 'ts',
      filePath: 'posts.ts',
      virtualizeFilePath: true,
      shouldFormat: false,
    })

    expect(sourceModule.filePath).toContain(
      '_renoun/posts.__renoun_snippet_'
    )
    expect(project.getSourceFile('_renoun/posts.ts')).toBeDefined()

    await getSourceTextMetadata({
      project,
      value: "import { posts } from './posts.ts'\nposts\n",
      language: 'ts',
      shouldFormat: false,
    })

    expect(
      project
        .getPreEmitDiagnostics()
        .filter((diagnostic) => diagnostic.getCode() === 2307)
    ).toHaveLength(0)
  })

  test('rewrites the stable alias with the final normalized snippet content', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const value = 'export const answer={value:1}\n'

    const result = await getSourceTextMetadata({
      project,
      value,
      language: 'ts',
      filePath: 'answers.ts',
      virtualizeFilePath: true,
    })

    expect(result.value).not.toBe(value)
    expect(project.getSourceFile('_renoun/answers.ts')?.getFullText()).toBe(
      result.value
    )
    const virtualSnippetPaths = project
      .getSourceFiles()
      .map((sourceFile) => sourceFile.getFilePath())
      .filter((filePath) => filePath.includes('.__renoun_snippet_'))

    expect(virtualSnippetPaths).toHaveLength(1)
    expect(virtualSnippetPaths[0]?.endsWith(result.filePath!)).toBe(true)
  })

  test('evicts the previous virtual snippet source file when content changes', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })

    const first = await getSourceTextMetadata({
      project,
      value: 'export const first = 1\n',
      language: 'ts',
      filePath: 'posts.ts',
      virtualizeFilePath: true,
      shouldFormat: false,
    })

    const second = await getSourceTextMetadata({
      project,
      value: 'export const second = 2\n',
      language: 'ts',
      filePath: 'posts.ts',
      virtualizeFilePath: true,
      shouldFormat: false,
    })

    expect(second.filePath).not.toBe(first.filePath)
    expect(project.getSourceFile(first.filePath!)).toBeUndefined()
    expect(project.getSourceFile(second.filePath!)).toBeDefined()
    expect(project.getSourceFile('_renoun/posts.ts')?.getFullText()).toBe(
      second.value
    )
  })
})
