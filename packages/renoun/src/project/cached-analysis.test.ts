import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'

import { getTsMorph } from '../utils/ts-morph.ts'
import { getFileExports } from '../utils/get-file-exports.ts'
import {
  collectTypeScriptMetadata,
  type GetTokensOptions,
} from '../utils/get-tokens.ts'
import { invalidateProjectFileCache } from './cache.ts'
import {
  getCachedFileExports,
  getCachedFileExportMetadata,
  getCachedFileExportStaticValue,
  getCachedFileExportText,
  getCachedOutlineRanges,
  getCachedSourceTextMetadata,
  getCachedTokens,
  invalidateRuntimeAnalysisCachePath,
  resolveCachedTypeAtLocationWithDependencies,
  transpileCachedSourceFile,
} from './cached-analysis.ts'

const { Project } = getTsMorph()

function createTextMateToken(value: string) {
  const isWhiteSpace = /^\s+$/.test(value)
  return {
    value,
    start: 0,
    end: value.length,
    style: {
      color: '',
      backgroundColor: '',
      fontStyle: '',
      fontWeight: '',
      textDecoration: '',
    },
    hasTextStyles: false,
    isBaseColor: true,
    isWhiteSpace,
  }
}

function createHighlighter(): NonNullable<GetTokensOptions['highlighter']> {
  return {
    async tokenize(value: string) {
      return [[createTextMateToken(value)]]
    },
    async *stream(value: string) {
      yield [createTextMateToken(value)]
    },
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function createTemporaryWorkspace(
  files: Record<string, string>
): Promise<{
  workspacePath: string
  cleanup: () => Promise<void>
}> {
  const workspacePath = await mkdtemp(
    join(process.cwd(), '.tmp-cached-analysis-')
  )

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = join(workspacePath, relativePath)
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, contents, 'utf8')
  }

  return {
    workspacePath,
    cleanup: async () => {
      await rm(workspacePath, { recursive: true, force: true })
    },
  }
}

describe('project cached analysis', () => {
  test('reuses cached source text metadata for identical inputs', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })

    const createSourceFileSpy = vi.spyOn(project, 'createSourceFile')
    const source = `const cachedMetadataValue = ${Date.now()}`

    const first = await getCachedSourceTextMetadata(project, {
      value: source,
      language: 'ts',
      shouldFormat: false,
    })
    const second = await getCachedSourceTextMetadata(project, {
      value: source,
      language: 'ts',
      shouldFormat: false,
    })

    expect(first.value).toBe(second.value)
    expect(first.filePath).toBe(second.filePath)
    expect(createSourceFileSpy).toHaveBeenCalledTimes(1)
  })

  test('reuses cached tokens for identical inputs', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const filePath = `/project/src/token-cache-${Date.now()}.ts`
    const source = 'const value = 1'

    project.createSourceFile(filePath, source, {
      overwrite: true,
    })

    const highlighter: GetTokensOptions['highlighter'] = {
      async tokenize() {
        return [[createTextMateToken(source)]]
      },
      async *stream() {
        yield [createTextMateToken(source)]
      },
    }

    let metadataCalls = 0
    const metadataCollector: GetTokensOptions['metadataCollector'] = async (
      ...args
    ) => {
      metadataCalls += 1
      return collectTypeScriptMetadata(...args)
    }

    await getCachedTokens(project, {
      value: source,
      language: 'ts',
      filePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
    })
    await getCachedTokens(project, {
      value: source,
      language: 'ts',
      filePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
    })

    expect(metadataCalls).toBe(1)
  })

  test('skips dependency AST traversal work for warm token cache hits', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const filePath = `/project/src/token-cache-hit-${Date.now()}.ts`
    const source = "import { dependencyValue } from './dependency'\nexport const value = dependencyValue"

    project.createSourceFile(
      '/project/src/dependency.ts',
      'export const dependencyValue = 1',
      {
        overwrite: true,
      }
    )
    project.createSourceFile(filePath, source, {
      overwrite: true,
    })

    const getSourceFileSpy = vi.spyOn(project, 'getSourceFile')

    await getCachedTokens(project, {
      value: source,
      language: 'plaintext',
      filePath,
      theme: 'default',
      allowErrors: true,
      highlighter: null,
    })

    const getSourceFileCallsAfterFirstRun = getSourceFileSpy.mock.calls.length

    await getCachedTokens(project, {
      value: source,
      language: 'plaintext',
      filePath,
      theme: 'default',
      allowErrors: true,
      highlighter: null,
    })

    expect(getSourceFileSpy.mock.calls.length).toBe(getSourceFileCallsAfterFirstRun)
  })

  test('recomputes cached static export values after file invalidation', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const filePath = '/project/src/index.ts'

    project.createSourceFile(filePath, 'export const value = 1', {
      overwrite: true,
    })

    const [fileExport] = getFileExports(filePath, project)
    if (!fileExport) {
      throw new Error('[renoun] Expected a file export in cached-analysis test')
    }

    const first = await getCachedFileExportStaticValue(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })
    const second = await getCachedFileExportStaticValue(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })

    expect(first).toBe(1)
    expect(second).toBe(1)

    project.createSourceFile(filePath, 'export const value = 2', {
      overwrite: true,
    })
    invalidateProjectFileCache(project, filePath)

    const refreshed = await getCachedFileExportStaticValue(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })

    expect(refreshed).toBe(2)
  })

  test('recomputes cached file export text after file invalidation', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const filePath = '/project/src/index.ts'

    project.createSourceFile(filePath, 'export const value = 1', {
      overwrite: true,
    })

    const [fileExport] = getFileExports(filePath, project)
    if (!fileExport) {
      throw new Error('[renoun] Expected a file export in cached-analysis test')
    }

    const first = await getCachedFileExportText(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })
    const second = await getCachedFileExportText(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })

    expect(first).toContain('value = 1')
    expect(second).toContain('value = 1')

    project.createSourceFile(filePath, 'export const value = 2', {
      overwrite: true,
    })
    invalidateProjectFileCache(project, filePath)

    const refreshed = await getCachedFileExportText(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })

    expect(refreshed).toContain('value = 2')
  })

  test('recomputes cached file exports immediately after explicit runtime invalidation', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify({
        name: 'cached-analysis-test',
        private: true,
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': 'export const value = 1\n',
    })

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const project = new Project({
        tsConfigFilePath,
      })
      const getSourceFileSpy = vi.spyOn(project, 'getSourceFile')

      await getCachedFileExports(project, entryFilePath)
      const getSourceFileCallsAfterFirstRun = getSourceFileSpy.mock.calls.length

      await getCachedFileExports(project, entryFilePath)
      expect(getSourceFileSpy.mock.calls.length).toBe(
        getSourceFileCallsAfterFirstRun
      )

      await writeFile(entryFilePath, 'export const value = 2\n', 'utf8')
      await project.getSourceFileOrThrow(entryFilePath).refreshFromFileSystem()
      invalidateRuntimeAnalysisCachePath(entryFilePath)
      await delay(0)

      await getCachedFileExports(project, entryFilePath)
      expect(getSourceFileSpy.mock.calls.length).toBeGreaterThan(
        getSourceFileCallsAfterFirstRun
      )
    } finally {
      await workspace.cleanup()
    }
  })

  test('recomputes cached file export metadata immediately after explicit runtime invalidation', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify({
        name: 'cached-analysis-test',
        private: true,
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': '/** one */\nexport const value = 1\n',
    })

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const project = new Project({
        tsConfigFilePath,
      })

      const [fileExport] = getFileExports(entryFilePath, project)
      if (!fileExport) {
        throw new Error('[renoun] Expected a file export in cached-analysis test')
      }

      const getSourceFileSpy = vi.spyOn(project, 'getSourceFile')

      const first = await getCachedFileExportMetadata(project, {
        name: fileExport.name,
        filePath: entryFilePath,
        position: fileExport.position,
        kind: fileExport.kind,
      })
      const sourceFileCallsAfterFirstRun = getSourceFileSpy.mock.calls.length

      const second = await getCachedFileExportMetadata(project, {
        name: fileExport.name,
        filePath: entryFilePath,
        position: fileExport.position,
        kind: fileExport.kind,
      })

      expect(second.jsDocMetadata?.description).toBe(first.jsDocMetadata?.description)
      expect(getSourceFileSpy.mock.calls.length).toBe(sourceFileCallsAfterFirstRun)

      await writeFile(entryFilePath, '/** two */\nexport const value = 1\n', 'utf8')
      await project.getSourceFileOrThrow(entryFilePath).refreshFromFileSystem()
      invalidateRuntimeAnalysisCachePath(entryFilePath)
      await delay(0)

      const refreshed = await getCachedFileExportMetadata(project, {
        name: fileExport.name,
        filePath: entryFilePath,
        position: fileExport.position,
        kind: fileExport.kind,
      })

      expect(refreshed.jsDocMetadata?.description).toBe('two')
      expect(getSourceFileSpy.mock.calls.length).toBeGreaterThan(
        sourceFileCallsAfterFirstRun
      )
    } finally {
      await workspace.cleanup()
    }
  })

  test('recomputes cached outline ranges immediately after explicit runtime invalidation', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify({
        name: 'cached-analysis-test',
        private: true,
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts':
        'export function one() {\n  if (true) {\n    return 1\n  }\n}\n',
    })

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const project = new Project({
        tsConfigFilePath,
      })

      const first = await getCachedOutlineRanges(project, entryFilePath)
      const second = await getCachedOutlineRanges(project, entryFilePath)
      expect(second).toEqual(first)

      await writeFile(
        entryFilePath,
        'export function one() {\n  if (true) {\n    return 1\n  }\n}\n\nexport function two() {\n  return 2\n}\n',
        'utf8'
      )
      await project.getSourceFileOrThrow(entryFilePath).refreshFromFileSystem()
      invalidateRuntimeAnalysisCachePath(entryFilePath)
      await delay(0)

      const refreshed = await getCachedOutlineRanges(project, entryFilePath)
      expect(refreshed).not.toEqual(first)
    } finally {
      await workspace.cleanup()
    }
  })

  test('recomputes cached static export values immediately after explicit runtime invalidation', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify({
        name: 'cached-analysis-test',
        private: true,
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': 'export const value = 1\n',
    })

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const project = new Project({
        tsConfigFilePath,
      })

      const [fileExport] = getFileExports(entryFilePath, project)
      if (!fileExport) {
        throw new Error('[renoun] Expected a file export in cached-analysis test')
      }

      const first = await getCachedFileExportStaticValue(project, {
        filePath: entryFilePath,
        position: fileExport.position,
        kind: fileExport.kind,
      })
      const second = await getCachedFileExportStaticValue(project, {
        filePath: entryFilePath,
        position: fileExport.position,
        kind: fileExport.kind,
      })
      expect(first).toBe(1)
      expect(second).toBe(1)

      await writeFile(entryFilePath, 'export const value = 2\n', 'utf8')
      await project.getSourceFileOrThrow(entryFilePath).refreshFromFileSystem()
      invalidateRuntimeAnalysisCachePath(entryFilePath)
      await delay(0)

      const refreshed = await getCachedFileExportStaticValue(project, {
        filePath: entryFilePath,
        position: fileExport.position,
        kind: fileExport.kind,
      })
      expect(refreshed).toBe(2)
    } finally {
      await workspace.cleanup()
    }
  })

  test('recomputes transpiled output immediately after explicit runtime invalidation', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify({
        name: 'cached-analysis-test',
        private: true,
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': 'export const value = 1 as const\n',
    })

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const project = new Project({
        tsConfigFilePath,
      })

      const first = await transpileCachedSourceFile(project, entryFilePath)
      const second = await transpileCachedSourceFile(project, entryFilePath)
      expect(second).toBe(first)
      expect(first).toContain('value = 1')

      await writeFile(entryFilePath, 'export const value = 2 as const\n', 'utf8')
      await project.getSourceFileOrThrow(entryFilePath).refreshFromFileSystem()
      invalidateRuntimeAnalysisCachePath(entryFilePath)
      await delay(0)

      const refreshed = await transpileCachedSourceFile(project, entryFilePath)
      expect(refreshed).not.toBe(first)
      expect(refreshed).toContain('value = 2')
    } finally {
      await workspace.cleanup()
    }
  })

  test('recomputes includeDependencies export text immediately after explicit runtime invalidation', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify({
        name: 'cached-analysis-test',
        private: true,
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': 'const helper = 1\nexport const value = helper\n',
    })

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const project = new Project({
        tsConfigFilePath,
      })

      const [fileExport] = getFileExports(entryFilePath, project)
      if (!fileExport) {
        throw new Error('[renoun] Expected a file export in cached-analysis test')
      }

      const getSourceFileOrThrowSpy = vi.spyOn(project, 'getSourceFileOrThrow')

      const first = await getCachedFileExportText(project, {
        filePath: entryFilePath,
        position: fileExport.position,
        kind: fileExport.kind,
        includeDependencies: true,
      })
      expect(first).toContain('helper = 1')
      const sourceFileCallsAfterFirstRun =
        getSourceFileOrThrowSpy.mock.calls.length

      const second = await getCachedFileExportText(project, {
        filePath: entryFilePath,
        position: fileExport.position,
        kind: fileExport.kind,
        includeDependencies: true,
      })
      expect(second).toContain('helper = 1')
      expect(getSourceFileOrThrowSpy.mock.calls.length).toBe(
        sourceFileCallsAfterFirstRun
      )

      await writeFile(entryFilePath, 'const helper = 2\nexport const value = helper\n')
      await project.getSourceFileOrThrow(entryFilePath).refreshFromFileSystem()
      invalidateRuntimeAnalysisCachePath(entryFilePath)
      await delay(0)

      const refreshed = await getCachedFileExportText(project, {
        filePath: entryFilePath,
        position: fileExport.position,
        kind: fileExport.kind,
        includeDependencies: true,
      })
      expect(refreshed).toContain('helper = 2')
      expect(getSourceFileOrThrowSpy.mock.calls.length).toBeGreaterThan(
        sourceFileCallsAfterFirstRun
      )
    } finally {
      await workspace.cleanup()
    }
  })

  test('tracks dependency files for cached type resolution and refreshes after dependency invalidation', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const filePath = '/project/src/index.ts'
    const dependencyPath = '/project/src/types.ts'

    project.createSourceFile(
      dependencyPath,
      'export interface Data { title: string }',
      {
        overwrite: true,
      }
    )
    project.createSourceFile(
      filePath,
      "import type { Data } from './types'\nexport const value: Data = { title: 'hello' }",
      {
        overwrite: true,
      }
    )

    const [fileExport] = getFileExports(filePath, project)
    if (!fileExport) {
      throw new Error('[renoun] Expected a file export in cached-analysis test')
    }

    const first = await resolveCachedTypeAtLocationWithDependencies(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })

    expect(first.dependencies).toContain(filePath)
    expect(first.dependencies).toContain(dependencyPath)
    expect(first.resolvedType).toBeDefined()

    project.createSourceFile(
      dependencyPath,
      'export interface Data { title: string; count: number }',
      {
        overwrite: true,
      }
    )
    invalidateProjectFileCache(project, dependencyPath)

    const refreshed = await resolveCachedTypeAtLocationWithDependencies(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })

    expect(refreshed.dependencies).toContain(dependencyPath)
    expect(refreshed.resolvedType).toBeDefined()
  })

  test('recomputes cached type resolution immediately after explicit runtime invalidation', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify({
        name: 'cached-analysis-test',
        private: true,
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts':
        "import type { Data } from './types'\nexport const value: Data = { title: 'one' }\n",
      'src/types.ts': 'export interface Data { title: string }\n',
    })

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const dependencyPath = join(workspace.workspacePath, 'src/types.ts')
      const project = new Project({
        tsConfigFilePath,
      })

      const [fileExport] = getFileExports(entryFilePath, project)
      if (!fileExport) {
        throw new Error('[renoun] Expected a file export in cached-analysis test')
      }

      const addSourceFileSpy = vi.spyOn(project, 'addSourceFileAtPath')

      await resolveCachedTypeAtLocationWithDependencies(project, {
        filePath: entryFilePath,
        position: fileExport.position,
        kind: fileExport.kind,
      })
      const addSourceFileCallsAfterFirstRun = addSourceFileSpy.mock.calls.length

      await resolveCachedTypeAtLocationWithDependencies(project, {
        filePath: entryFilePath,
        position: fileExport.position,
        kind: fileExport.kind,
      })
      expect(addSourceFileSpy.mock.calls.length).toBe(
        addSourceFileCallsAfterFirstRun
      )

      await writeFile(
        dependencyPath,
        'export interface Data { title: string; count: number }\n',
        'utf8'
      )
      await project.getSourceFileOrThrow(dependencyPath).refreshFromFileSystem()
      invalidateRuntimeAnalysisCachePath(dependencyPath)
      await delay(0)

      const refreshed = await resolveCachedTypeAtLocationWithDependencies(
        project,
        {
          filePath: entryFilePath,
          position: fileExport.position,
          kind: fileExport.kind,
        }
      )

      expect(refreshed.dependencies).toContain(dependencyPath)
      expect(addSourceFileSpy.mock.calls.length).toBeGreaterThan(
        addSourceFileCallsAfterFirstRun
      )
    } finally {
      await workspace.cleanup()
    }
  })

  test('recomputes cached source metadata immediately after explicit runtime invalidation', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify({
        name: 'cached-analysis-test',
        private: true,
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': "import { middleValue } from './middle'\nexport const value = middleValue\n",
      'src/middle.ts': "import { leafValue } from './leaf'\nexport const middleValue = leafValue\n",
      'src/leaf.ts': "export const leafValue = 'one'\n",
    })

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const transitiveDependencyPath = join(workspace.workspacePath, 'src/leaf.ts')
      const entrySource = await readFile(entryFilePath, 'utf8')
      const project = new Project({
        tsConfigFilePath,
      })
      const createSourceFileSpy = vi.spyOn(project, 'createSourceFile')

      await getCachedSourceTextMetadata(project, {
        value: entrySource,
        filePath: entryFilePath,
        language: 'ts',
        shouldFormat: false,
      })
      await getCachedSourceTextMetadata(project, {
        value: entrySource,
        filePath: entryFilePath,
        language: 'ts',
        shouldFormat: false,
      })

      expect(createSourceFileSpy).toHaveBeenCalledTimes(1)

      await writeFile(
        transitiveDependencyPath,
        "export const leafValue = 'two-updated'\n",
        'utf8'
      )
      await project
        .getSourceFileOrThrow(transitiveDependencyPath)
        .refreshFromFileSystem()
      invalidateRuntimeAnalysisCachePath(transitiveDependencyPath)
      await delay(0)

      await getCachedSourceTextMetadata(project, {
        value: entrySource,
        filePath: entryFilePath,
        language: 'ts',
        shouldFormat: false,
      })

      expect(createSourceFileSpy).toHaveBeenCalledTimes(2)
    } finally {
      await workspace.cleanup()
    }
  })

  test('recomputes cached tokens immediately after explicit runtime invalidation', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify({
        name: 'cached-analysis-test',
        private: true,
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': "import { middleValue } from './middle'\nexport const value = middleValue\n",
      'src/middle.ts': "import { leafValue } from './leaf'\nexport const middleValue = leafValue\n",
      'src/leaf.ts': "export const leafValue = 'one'\n",
    })

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const transitiveDependencyPath = join(workspace.workspacePath, 'src/leaf.ts')
      const entrySource = await readFile(entryFilePath, 'utf8')
      const project = new Project({
        tsConfigFilePath,
      })
      const highlighter = createHighlighter()

      let metadataCalls = 0
      const metadataCollector: GetTokensOptions['metadataCollector'] = async (
        ...args
      ) => {
        metadataCalls += 1
        return collectTypeScriptMetadata(...args)
      }

      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })
      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })

      expect(metadataCalls).toBe(1)

      await writeFile(
        transitiveDependencyPath,
        "export const leafValue = 'two-updated'\n",
        'utf8'
      )
      await project
        .getSourceFileOrThrow(transitiveDependencyPath)
        .refreshFromFileSystem()
      invalidateRuntimeAnalysisCachePath(transitiveDependencyPath)
      await delay(0)

      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })

      expect(metadataCalls).toBe(2)
    } finally {
      await workspace.cleanup()
    }
  })

  test('invalidates cached source metadata when transitive TypeScript dependencies change on disk', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify({
        name: 'cached-analysis-test',
        private: true,
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': "import { middleValue } from './middle'\nexport const value = middleValue\n",
      'src/middle.ts': "import { leafValue } from './leaf'\nexport const middleValue = leafValue\n",
      'src/leaf.ts': "export const leafValue = 'one'\n",
    })

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const transitiveDependencyPath = join(workspace.workspacePath, 'src/leaf.ts')
      const entrySource = await readFile(entryFilePath, 'utf8')
      const project = new Project({
        tsConfigFilePath,
      })
      const createSourceFileSpy = vi.spyOn(project, 'createSourceFile')
      await delay(1_100)

      await getCachedSourceTextMetadata(project, {
        value: entrySource,
        filePath: entryFilePath,
        language: 'ts',
        shouldFormat: false,
      })
      await getCachedSourceTextMetadata(project, {
        value: entrySource,
        filePath: entryFilePath,
        language: 'ts',
        shouldFormat: false,
      })

      expect(createSourceFileSpy).toHaveBeenCalledTimes(1)

      await writeFile(
        transitiveDependencyPath,
        "export const leafValue = 'two-updated'\n",
        'utf8'
      )
      await project
        .getSourceFileOrThrow(transitiveDependencyPath)
        .refreshFromFileSystem()
      await delay(325)

      await getCachedSourceTextMetadata(project, {
        value: entrySource,
        filePath: entryFilePath,
        language: 'ts',
        shouldFormat: false,
      })

      expect(createSourceFileSpy).toHaveBeenCalledTimes(2)
    } finally {
      await workspace.cleanup()
    }
  })

  test('invalidates cached tokens when transitive TypeScript dependencies change on disk', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify({
        name: 'cached-analysis-test',
        private: true,
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': "import { middleValue } from './middle'\nexport const value = middleValue\n",
      'src/middle.ts': "import { leafValue } from './leaf'\nexport const middleValue = leafValue\n",
      'src/leaf.ts': "export const leafValue = 'one'\n",
    })

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const transitiveDependencyPath = join(workspace.workspacePath, 'src/leaf.ts')
      const entrySource = await readFile(entryFilePath, 'utf8')
      const project = new Project({
        tsConfigFilePath,
      })
      const highlighter = createHighlighter()
      await delay(1_100)

      let metadataCalls = 0
      const metadataCollector: GetTokensOptions['metadataCollector'] = async (
        ...args
      ) => {
        metadataCalls += 1
        return collectTypeScriptMetadata(...args)
      }

      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })
      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })

      expect(metadataCalls).toBe(1)

      await writeFile(
        transitiveDependencyPath,
        "export const leafValue = 'two-updated'\n",
        'utf8'
      )
      await project
        .getSourceFileOrThrow(transitiveDependencyPath)
        .refreshFromFileSystem()
      await delay(325)

      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })

      expect(metadataCalls).toBe(2)
    } finally {
      await workspace.cleanup()
    }
  })

  test('does not invalidate cached tokens when transitive require dependencies change on disk', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify({
        name: 'cached-analysis-test',
        private: true,
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': "const { middleValue } = require('./middle')\nexport const value = middleValue\n",
      'src/middle.ts': "const { leafValue } = require('./leaf')\nexport const middleValue = leafValue\n",
      'src/leaf.ts': "export const leafValue = 'one'\n",
    })

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const transitiveDependencyPath = join(workspace.workspacePath, 'src/leaf.ts')
      const entrySource = await readFile(entryFilePath, 'utf8')
      const project = new Project({
        tsConfigFilePath,
      })
      const highlighter = createHighlighter()
      await delay(1_100)

      let metadataCalls = 0
      const metadataCollector: GetTokensOptions['metadataCollector'] = async (
        ...args
      ) => {
        metadataCalls += 1
        return collectTypeScriptMetadata(...args)
      }

      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })
      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })

      expect(metadataCalls).toBe(1)

      await writeFile(
        transitiveDependencyPath,
        "export const leafValue = 'two-updated'\n",
        'utf8'
      )
      const transitiveSourceFile = project.getSourceFile(transitiveDependencyPath)
      if (transitiveSourceFile) {
        await transitiveSourceFile.refreshFromFileSystem()
      }
      await delay(325)

      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })

      expect(metadataCalls).toBe(1)
    } finally {
      await workspace.cleanup()
    }
  })

  test('does not invalidate cached tokens when transitive dynamic import dependencies change on disk', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify({
        name: 'cached-analysis-test',
        private: true,
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': "import { loadMiddleValue } from './middle'\nexport async function loadValue() { return loadMiddleValue() }\n",
      'src/middle.ts': "export async function loadMiddleValue() { const leaf = await import('./leaf'); return leaf.leafValue }\n",
      'src/leaf.ts': "export const leafValue = 'one'\n",
    })

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const transitiveDependencyPath = join(workspace.workspacePath, 'src/leaf.ts')
      const entrySource = await readFile(entryFilePath, 'utf8')
      const project = new Project({
        tsConfigFilePath,
      })
      const highlighter = createHighlighter()
      await delay(1_100)

      let metadataCalls = 0
      const metadataCollector: GetTokensOptions['metadataCollector'] = async (
        ...args
      ) => {
        metadataCalls += 1
        return collectTypeScriptMetadata(...args)
      }

      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })
      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })

      expect(metadataCalls).toBe(1)

      await writeFile(
        transitiveDependencyPath,
        "export const leafValue = 'two-updated'\n",
        'utf8'
      )
      const transitiveSourceFile = project.getSourceFile(transitiveDependencyPath)
      if (transitiveSourceFile) {
        await transitiveSourceFile.refreshFromFileSystem()
      }
      await delay(325)

      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })

      expect(metadataCalls).toBe(1)
    } finally {
      await workspace.cleanup()
    }
  })

  test('does not warn when module specifiers cannot be statically analyzed', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify({
        name: 'cached-analysis-test',
        private: true,
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': "const target = './leaf'\nconst dependency = require(target)\nexport const value = dependency.leafValue\n",
      'src/leaf.ts': "export const leafValue = 'one'\n",
    })

    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const entrySource = await readFile(entryFilePath, 'utf8')
      const project = new Project({
        tsConfigFilePath,
      })
      const highlighter = createHighlighter()
      await delay(1_100)

      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
      })

      expect(
        consoleWarnSpy.mock.calls.some(([warning]) =>
          String(warning).includes('Unable to statically analyze')
        )
      ).toBe(false)
    } finally {
      consoleWarnSpy.mockRestore()
      await workspace.cleanup()
    }
  })

  test('invalidates cached tokens when a previously unresolved import becomes resolvable', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify({
        name: 'cached-analysis-test',
        private: true,
      }),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': "import { dep } from './dep'\nexport const value = dep\n",
    })

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const dependencyPath = join(workspace.workspacePath, 'src/dep.ts')
      const entrySource = await readFile(entryFilePath, 'utf8')
      const project = new Project({
        tsConfigFilePath,
      })
      const highlighter = createHighlighter()

      let metadataCalls = 0
      const metadataCollector: GetTokensOptions['metadataCollector'] = async (
        ...args
      ) => {
        metadataCalls += 1
        return collectTypeScriptMetadata(...args)
      }

      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })
      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })

      expect(metadataCalls).toBe(1)

      await writeFile(dependencyPath, 'export const dep = 1\n', 'utf8')
      project.addSourceFileAtPath(dependencyPath)
      invalidateRuntimeAnalysisCachePath(dependencyPath)
      await delay(0)

      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })

      expect(metadataCalls).toBe(2)
    } finally {
      await workspace.cleanup()
    }
  })

  test('invalidates cached tokens when imported package versions change', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify(
        {
          name: 'cached-analysis-test',
          private: true,
          dependencies: {
            'dep-lib': '^1.0.0',
          },
        },
        null,
        2
      ),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': "import { value as dependencyValue } from 'dep-lib'\nexport const localValue = dependencyValue\n",
      'node_modules/dep-lib/package.json': JSON.stringify(
        {
          name: 'dep-lib',
          version: '1.0.0',
          types: 'index.d.ts',
        },
        null,
        2
      ),
      'node_modules/dep-lib/index.d.ts': 'export const value: number\n',
    })

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const packageJsonPath = join(workspace.workspacePath, 'package.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const entrySource = await readFile(entryFilePath, 'utf8')
      const project = new Project({
        tsConfigFilePath,
      })
      const highlighter = createHighlighter()
      await delay(1_100)

      let metadataCalls = 0
      const metadataCollector: GetTokensOptions['metadataCollector'] = async (
        ...args
      ) => {
        metadataCalls += 1
        return collectTypeScriptMetadata(...args)
      }

      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })
      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })

      expect(metadataCalls).toBe(1)

      await writeFile(
        packageJsonPath,
        JSON.stringify(
          {
            name: 'cached-analysis-test',
            private: true,
            dependencies: {
              'dep-lib': '^2.0.0',
            },
          },
          null,
          2
        ),
        'utf8'
      )
      await delay(325)

      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })

      expect(metadataCalls).toBe(2)
    } finally {
      await workspace.cleanup()
    }
  })

  test('does not invalidate cached tokens when imported package declaration files are rewritten without version changes', async () => {
    const workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify(
        {
          name: 'cached-analysis-test',
          private: true,
          dependencies: {
            'dep-lib': '^1.0.0',
          },
        },
        null,
        2
      ),
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ESNext',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': "import { value as dependencyValue } from 'dep-lib'\nexport const localValue = dependencyValue\n",
      'node_modules/dep-lib/package.json': JSON.stringify(
        {
          name: 'dep-lib',
          version: '1.0.0',
          types: 'index.d.ts',
        },
        null,
        2
      ),
      'node_modules/dep-lib/index.d.ts': 'export const value: number\n',
    })

    try {
      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const dependencyDeclarationFilePath = join(
        workspace.workspacePath,
        'node_modules/dep-lib/index.d.ts'
      )
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const entrySource = await readFile(entryFilePath, 'utf8')
      const project = new Project({
        tsConfigFilePath,
      })
      const highlighter = createHighlighter()
      await delay(1_100)

      let metadataCalls = 0
      const metadataCollector: GetTokensOptions['metadataCollector'] = async (
        ...args
      ) => {
        metadataCalls += 1
        return collectTypeScriptMetadata(...args)
      }

      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })
      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })

      expect(metadataCalls).toBe(1)

      await writeFile(
        dependencyDeclarationFilePath,
        'export const value: number\n',
        'utf8'
      )
      await delay(325)

      await getCachedTokens(project, {
        value: entrySource,
        language: 'ts',
        filePath: entryFilePath,
        theme: 'default',
        allowErrors: true,
        highlighter,
        metadataCollector,
      })

      expect(metadataCalls).toBe(1)
    } finally {
      await workspace.cleanup()
    }
  })
})
