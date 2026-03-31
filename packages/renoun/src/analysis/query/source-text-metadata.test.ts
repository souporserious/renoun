import { rmSync } from 'node:fs'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'

import { getTsMorph } from '../../utils/ts-morph.ts'
import {
  getSourceTextMetadata,
  getSourceTextMetadataFallback,
  hydrateSourceTextMetadataSourceFile,
} from './source-text-metadata.ts'
import { MAX_VIRTUAL_SNIPPET_REGISTRATIONS_PER_PROJECT } from './snippet-registry.ts'

const { Project } = getTsMorph()

async function createTemporaryWorkspace(
  files: Record<string, string>
): Promise<{
  workspacePath: string
  [Symbol.asyncDispose](): Promise<void>
}> {
  const cacheDirectory = join(process.cwd(), '.cache')
  await mkdir(cacheDirectory, { recursive: true })
  const workspacePath = await mkdtemp(
    join(cacheDirectory, 'source-text-metadata-')
  )

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = join(workspacePath, relativePath)
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, contents, 'utf8')
  }

  return {
    workspacePath,
    async [Symbol.asyncDispose]() {
      rmSync(workspacePath, { recursive: true, force: true })
    },
  }
}

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

  test('protects explicit snippet paths when a real source file already exists', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })

    project.createSourceFile(
      '/workspace/src/demo/example.ts',
      'export const real = 1\n',
      {
        overwrite: true,
      }
    )

    const result = getSourceTextMetadataFallback({
      project,
      value: 'export const snippet = 2',
      language: 'ts',
      filePath: 'demo/example.ts',
      baseDirectory: '/workspace/src',
      virtualizeFilePath: true,
    })

    expect(result.filePath).toContain(
      '/workspace/src/demo/example.__renoun_source.__renoun_snippet_'
    )
    expect(result.label).toBe('demo/example.ts')
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

    expect(first.value).toBe('const snippetValue = 1')
    expect(second.value).toBe('const snippetValue = 1')
    expect(firstSourceFile.getFullText()).toBe(
      'const snippetValue = 1\nexport {}\n'
    )
    expect(secondSourceFile.getFullText()).toBe(
      'const snippetValue = 1\nexport {}\n'
    )
    expect(firstSourceFile.getExportDeclarations()).toHaveLength(1)
    expect(secondSourceFile.getExportDeclarations()).toHaveLength(1)
    expect(
      project
        .getPreEmitDiagnostics()
        .filter((diagnostic) => diagnostic.getCode() === 2451)
    ).toHaveLength(0)
  })

  test(
    'rehydrates shimmed snippet source files without rewriting them when metadata omits the synthetic export',
    () => {
      const project = new Project({
        useInMemoryFileSystem: true,
      })
      const filePath = '_renoun/example.__renoun_snippet_sig.ts'
      const metadata = {
        value: 'const snippetValue = 1',
        language: 'ts' as const,
        filePath,
        valueSignature: 'sig',
      }

      hydrateSourceTextMetadataSourceFile(project, metadata)

      const initialSourceFile = project.getSourceFileOrThrow(filePath)
      const initialStableSourceFile = project.getSourceFileOrThrow(
        '_renoun/example.ts'
      )
      const createSourceFileSpy = vi.spyOn(project, 'createSourceFile')

      hydrateSourceTextMetadataSourceFile(project, metadata)

      expect(createSourceFileSpy).not.toHaveBeenCalled()
      expect(project.getSourceFile(filePath)).toBe(initialSourceFile)
      expect(project.getSourceFile('_renoun/example.ts')).toBe(
        initialStableSourceFile
      )
      expect(initialSourceFile.getFullText()).toBe(
        'const snippetValue = 1\nexport {}\n'
      )
      expect(initialStableSourceFile.getFullText()).toBe(
        'const snippetValue = 1\nexport {}\n'
      )
    }
  )

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

    expect(sourceModule.filePath).toContain('_renoun/posts.__renoun_snippet_')
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

  test('keeps anchored snippets local without overwriting the real source file', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })

    project.createSourceFile(
      '/workspace/src/dep.ts',
      'export const dep = 1\n',
      {
        overwrite: true,
      }
    )
    project.createSourceFile(
      '/workspace/src/foo.ts',
      'export const real = 1\n',
      {
        overwrite: true,
      }
    )

    const result = await getSourceTextMetadata({
      project,
      value: "import { dep } from './dep.ts'\ndep\n",
      language: 'ts',
      filePath: '/workspace/src/foo.ts',
      virtualizeFilePath: true,
      shouldFormat: false,
    })

    expect(result.filePath).toContain(
      '/workspace/src/foo.__renoun_source.__renoun_snippet_'
    )
    expect(project.getSourceFile('/workspace/src/foo.ts')?.getFullText()).toBe(
      'export const real = 1\n'
    )
    expect(
      project
        .getSourceFile('/workspace/src/foo.__renoun_source.ts')
        ?.getFullText()
    ).toBe(result.value)
    expect(
      project
        .getPreEmitDiagnostics()
        .filter((diagnostic) => diagnostic.getCode() === 2307)
    ).toHaveLength(0)
  })

  test('switches anchored snippets to the protected stable alias without removing a real source file already added to the program', async () => {
    await using workspace = await createTemporaryWorkspace({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/dep.ts': 'export const dep = 1\n',
    })

    const project = new Project({
      tsConfigFilePath: join(workspace.workspacePath, 'tsconfig.json'),
    })
    const filePath = join(workspace.workspacePath, 'src/foo.ts')

    const first = await getSourceTextMetadata({
      project,
      value: "import { dep } from './dep.ts'\ndep\n",
      language: 'ts',
      filePath,
      virtualizeFilePath: true,
      shouldFormat: false,
    })

    expect(first.filePath).toContain('/src/foo.__renoun_snippet_')

    await writeFile(filePath, 'export const real = 1\n', 'utf8')
    await project.getSourceFileOrThrow(filePath).refreshFromFileSystem()

    expect(project.getSourceFile(filePath)?.getFullText()).toBe(
      'export const real = 1\n'
    )

    const second = await getSourceTextMetadata({
      project,
      value: "import { dep } from './dep.ts'\ndep\n",
      language: 'ts',
      filePath,
      virtualizeFilePath: true,
      shouldFormat: false,
    })

    expect(second.filePath).toContain(
      '/src/foo.__renoun_source.__renoun_snippet_'
    )
    expect(project.getSourceFile(filePath)?.getFullText()).toBe(
      'export const real = 1\n'
    )
    expect(
      project.getSourceFile(
        join(workspace.workspacePath, 'src/foo.__renoun_source.ts')
      )
    ).toBeDefined()
  })

  test('promotes cached anchored snippets to the protected stable alias when an in-memory project later adds the real source file', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const filePath = '/workspace/src/foo.ts'

    const first = await getSourceTextMetadata({
      project,
      value: 'export const snippet = 1\n',
      language: 'ts',
      filePath,
      virtualizeFilePath: true,
      shouldFormat: false,
    })

    expect(first.filePath).toContain('/workspace/src/foo.__renoun_snippet_')

    project.createSourceFile(filePath, 'export const real = 1\n', {
      overwrite: true,
    })

    const second = await getSourceTextMetadata({
      project,
      value: 'export const snippet = 1\n',
      language: 'ts',
      filePath,
      virtualizeFilePath: true,
      shouldFormat: false,
    })

    expect(second.filePath).toContain(
      '/workspace/src/foo.__renoun_source.__renoun_snippet_'
    )
    expect(project.getSourceFile(filePath)?.getFullText()).toBe(
      'export const real = 1\n'
    )
    expect(
      project
        .getSourceFile('/workspace/src/foo.__renoun_source.ts')
        ?.getFullText()
    ).toBe(second.value)
  })

  test('promotes cached anchored snippets to the protected stable alias when an in-memory project later adds an identical real source file', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const filePath = '/workspace/src/foo.ts'
    const initialSnippetValue = 'export const snippet = 1\n'

    const first = await getSourceTextMetadata({
      project,
      value: initialSnippetValue,
      language: 'ts',
      filePath,
      virtualizeFilePath: true,
      shouldFormat: false,
    })

    expect(first.filePath).toContain('/workspace/src/foo.__renoun_snippet_')

    project.createSourceFile(filePath, initialSnippetValue, {
      overwrite: true,
    })

    const second = await getSourceTextMetadata({
      project,
      value: 'export const snippet = 2\n',
      language: 'ts',
      filePath,
      virtualizeFilePath: true,
      shouldFormat: false,
    })

    expect(second.filePath).toContain(
      '/workspace/src/foo.__renoun_source.__renoun_snippet_'
    )
    expect(project.getSourceFile(filePath)?.getFullText()).toBe(
      initialSnippetValue
    )
    expect(
      project
        .getSourceFile('/workspace/src/foo.__renoun_source.ts')
        ?.getFullText()
    ).toBe(second.value)
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

  test('rehydrates cached virtual snippets through the registry lifecycle', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const firstFilePath = '_renoun/posts.__renoun_snippet_sig_1.ts'
    const secondFilePath = '_renoun/posts.__renoun_snippet_sig_2.ts'

    hydrateSourceTextMetadataSourceFile(project, {
      value: 'export const first = 1\n',
      language: 'ts',
      filePath: firstFilePath,
      valueSignature: 'sig_1',
    })
    hydrateSourceTextMetadataSourceFile(project, {
      value: 'export const second = 2\n',
      language: 'ts',
      filePath: secondFilePath,
      valueSignature: 'sig_2',
    })

    expect(project.getSourceFile(firstFilePath)).toBeUndefined()
    expect(project.getSourceFile(secondFilePath)).toBeDefined()
    expect(project.getSourceFile('_renoun/posts.ts')?.getFullText()).toBe(
      'export const second = 2\n'
    )
  })

  test('prunes least recently used virtual snippets when the registry exceeds capacity', () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const filePaths: string[] = []

    for (
      let index = 0;
      index < MAX_VIRTUAL_SNIPPET_REGISTRATIONS_PER_PROJECT + 1;
      index += 1
    ) {
      const filePath = `_renoun/snippet-${index}.__renoun_snippet_sig_${index}.ts`

      filePaths.push(filePath)
      hydrateSourceTextMetadataSourceFile(project, {
        value: `export const snippet${index} = ${index}\n`,
        language: 'ts',
        filePath,
        valueSignature: `sig_${index}`,
      })
    }

    expect(project.getSourceFile(filePaths[0]!)).toBeUndefined()
    expect(project.getSourceFile('_renoun/snippet-0.ts')).toBeUndefined()
    expect(project.getSourceFile(filePaths.at(-1)!)).toBeDefined()
    expect(
      project
        .getSourceFiles()
        .filter((sourceFile) =>
          sourceFile.getFilePath().includes('.__renoun_snippet_')
        )
    ).toHaveLength(MAX_VIRTUAL_SNIPPET_REGISTRATIONS_PER_PROJECT)
  })

  test('refreshes snippet LRU order on warm hydration hits even when timestamps tie', () => {
    vi.useFakeTimers()

    try {
      const project = new Project({
        useInMemoryFileSystem: true,
      })
      const firstFilePath = '_renoun/a.__renoun_snippet_sig_a.ts'
      const secondFilePath = '_renoun/b.__renoun_snippet_sig_b.ts'

      hydrateSourceTextMetadataSourceFile(project, {
        value: 'export const a = 1\n',
        language: 'ts',
        filePath: firstFilePath,
        valueSignature: 'sig_a',
      })
      hydrateSourceTextMetadataSourceFile(project, {
        value: 'export const b = 2\n',
        language: 'ts',
        filePath: secondFilePath,
        valueSignature: 'sig_b',
      })
      hydrateSourceTextMetadataSourceFile(project, {
        value: 'export const a = 1\n',
        language: 'ts',
        filePath: firstFilePath,
        valueSignature: 'sig_a',
      })

      for (
        let index = 2;
        index <= MAX_VIRTUAL_SNIPPET_REGISTRATIONS_PER_PROJECT;
        index += 1
      ) {
        hydrateSourceTextMetadataSourceFile(project, {
          value: `export const snippet${index} = ${index}\n`,
          language: 'ts',
          filePath: `_renoun/snippet-${index}.__renoun_snippet_sig_${index}.ts`,
          valueSignature: `sig_${index}`,
        })
      }

      expect(project.getSourceFile(firstFilePath)).toBeDefined()
      expect(project.getSourceFile('_renoun/a.ts')).toBeDefined()
      expect(project.getSourceFile(secondFilePath)).toBeUndefined()
      expect(project.getSourceFile('_renoun/b.ts')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
