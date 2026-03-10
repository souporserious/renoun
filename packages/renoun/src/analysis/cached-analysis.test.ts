import { rmSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'

import { getTsMorph } from '../utils/ts-morph.ts'
import { isDetectAsyncLeaksEnabled } from '../utils/test.ts'
import { getFileExports } from '../utils/get-file-exports.ts'
import {
  collectTypeScriptMetadata,
  type GetTokensOptions,
} from '../utils/get-tokens.ts'
import { invalidateProgramFileCache } from './cache.ts'
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
import { getProgram, invalidateProgramCachesByPath } from './get-program.ts'

const { Project, ModuleKind, ModuleResolutionKind, ScriptTarget } =
  getTsMorph()

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

function createInMemoryTypeScriptProject(): InstanceType<typeof Project> {
  return new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      module: ModuleKind.ESNext,
      moduleResolution: ModuleResolutionKind.Bundler,
      target: ScriptTarget.ESNext,
    },
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function withDevelopmentLikeRuntime<T>(
  run: () => Promise<T>
): Promise<T> {
  const previousNodeEnv = process.env['NODE_ENV']
  const previousVitest = process.env['VITEST']
  const previousVitestWorkerId = process.env['VITEST_WORKER_ID']
  const previousArgv = process.argv

  process.env['NODE_ENV'] = 'development'
  delete process.env['VITEST']
  delete process.env['VITEST_WORKER_ID']
  process.argv = previousArgv.map((argument) =>
    argument.includes('vitest') ? argument.replaceAll('vitest', 'runner') : argument
  )

  try {
    return await run()
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env['NODE_ENV']
    } else {
      process.env['NODE_ENV'] = previousNodeEnv
    }

    if (previousVitest === undefined) {
      delete process.env['VITEST']
    } else {
      process.env['VITEST'] = previousVitest
    }

    if (previousVitestWorkerId === undefined) {
      delete process.env['VITEST_WORKER_ID']
    } else {
      process.env['VITEST_WORKER_ID'] = previousVitestWorkerId
    }

    process.argv = previousArgv
  }
}

function createDisposeHandle(dispose: () => void) {
  return {
    [Symbol.dispose]() {
      dispose()
    },
  }
}

async function createTemporaryWorkspace(
  files: Record<string, string>
): Promise<{
  workspacePath: string
  [Symbol.asyncDispose](): Promise<void>
}> {
  const cacheDirectory = join(process.cwd(), '.cache')
  await mkdir(cacheDirectory, { recursive: true })
  const workspacePath = await mkdtemp(join(cacheDirectory, 'cached-analysis-'))

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

describe('analysis cached analysis', () => {
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
    const createSourceFileCallsAfterFirstRun =
      createSourceFileSpy.mock.calls.length
    const second = await getCachedSourceTextMetadata(project, {
      value: source,
      language: 'ts',
      shouldFormat: false,
    })
    const createSourceFileCallsAfterSecondRun =
      createSourceFileSpy.mock.calls.length

    expect(first.value).toBe(second.value)
    expect(first.filePath).toBe(second.filePath)
    expect(createSourceFileCallsAfterFirstRun).toBeGreaterThanOrEqual(1)
    expect(createSourceFileCallsAfterSecondRun).toBe(
      createSourceFileCallsAfterFirstRun
    )
  })

  test('rehydrates missing source files on cached source text metadata hits', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const source = `const cachedMetadataValue = ${Date.now()}`

    const first = await getCachedSourceTextMetadata(project, {
      value: source,
      language: 'ts',
      shouldFormat: false,
    })
    const sourceFile = project.getSourceFileOrThrow(first.filePath!)
    project.removeSourceFile(sourceFile)

    expect(project.getSourceFile(first.filePath!)).toBeUndefined()

    const second = await getCachedSourceTextMetadata(project, {
      value: source,
      language: 'ts',
      shouldFormat: false,
    })

    const rehydratedSourceFile = project.getSourceFile(second.filePath!)

    expect(second.filePath).toBe(first.filePath)
    expect(rehydratedSourceFile).toBeDefined()
    expect(rehydratedSourceFile?.getExportDeclarations()).toHaveLength(1)
  })

  test('rehydrates cached virtual snippets without replacing the real source file', async () => {
    const project = createInMemoryTypeScriptProject()
    const filePath = '/workspace/src/foo.ts'
    const stableAliasPath = '/workspace/src/foo.__renoun_source.ts'
    const realSourceText = 'export const real = 1\n'
    const firstValue = 'export const first = 1\n'
    const secondValue = 'export const second = 2\n'

    project.createSourceFile(filePath, realSourceText, {
      overwrite: true,
    })

    const first = await getCachedSourceTextMetadata(project, {
      value: firstValue,
      language: 'ts',
      filePath,
      virtualizeFilePath: true,
      shouldFormat: false,
    })
    const second = await getCachedSourceTextMetadata(project, {
      value: secondValue,
      language: 'ts',
      filePath,
      virtualizeFilePath: true,
      shouldFormat: false,
    })

    expect(first.filePath).not.toBe(second.filePath)
    expect(project.getSourceFile(filePath)?.getFullText()).toBe(realSourceText)
    expect(project.getSourceFile(stableAliasPath)?.getFullText()).toBe(
      second.value
    )

    const secondVirtualSourceFile = project.getSourceFileOrThrow(second.filePath!)
    const stableAliasSourceFile = project.getSourceFileOrThrow(stableAliasPath)
    project.removeSourceFile(secondVirtualSourceFile)
    project.removeSourceFile(stableAliasSourceFile)

    const rehydratedFirst = await getCachedSourceTextMetadata(project, {
      value: firstValue,
      language: 'ts',
      filePath,
      virtualizeFilePath: true,
      shouldFormat: false,
    })

    expect(rehydratedFirst.filePath).toBe(first.filePath)
    expect(project.getSourceFile(filePath)?.getFullText()).toBe(realSourceText)
    expect(project.getSourceFile(first.filePath!)).toBeDefined()
    expect(project.getSourceFile(second.filePath!)).toBeUndefined()
    expect(project.getSourceFile(stableAliasPath)?.getFullText()).toBe(
      first.value
    )

    const firstVirtualSourceFile = project.getSourceFileOrThrow(first.filePath!)
    const firstStableAliasSourceFile =
      project.getSourceFileOrThrow(stableAliasPath)
    project.removeSourceFile(firstVirtualSourceFile)
    project.removeSourceFile(firstStableAliasSourceFile)

    const rehydratedSecond = await getCachedSourceTextMetadata(project, {
      value: secondValue,
      language: 'ts',
      filePath,
      virtualizeFilePath: true,
      shouldFormat: false,
    })

    expect(rehydratedSecond.filePath).toBe(second.filePath)
    expect(project.getSourceFile(filePath)?.getFullText()).toBe(realSourceText)
    expect(project.getSourceFile(first.filePath!)).toBeUndefined()
    expect(project.getSourceFile(second.filePath!)).toBeDefined()
    expect(project.getSourceFile(stableAliasPath)?.getFullText()).toBe(
      second.value
    )
  })

  test('serves source metadata fallback immediately on cold development reads', async () => {
    await withDevelopmentLikeRuntime(async () => {
      const project = new Project({
        useInMemoryFileSystem: true,
      })
      const source = `const devFallback = ${Date.now()}`
      const createSourceFileSpy = vi.spyOn(project, 'createSourceFile')

      const first = await getCachedSourceTextMetadata(project, {
        value: source,
        language: 'ts',
        shouldFormat: false,
      })

      expect(first.value).toBe(source)
      expect(createSourceFileSpy).toHaveBeenCalledTimes(0)

      await delay(400)

      const second = await getCachedSourceTextMetadata(project, {
        value: source,
        language: 'ts',
        shouldFormat: false,
      })

      expect(second.filePath).toBe(first.filePath)
      expect(createSourceFileSpy.mock.calls.length).toBeGreaterThanOrEqual(1)
    })
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

  test('does not reuse cached tokens across different metadata collectors', async () => {
    await using workspace = await createTemporaryWorkspace({
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

    const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
    const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
    const entrySource = await readFile(entryFilePath, 'utf8')
    const project = new Project({
      tsConfigFilePath,
    })
    const highlighter = createHighlighter()

    let firstCollectorCalls = 0
    const firstCollector: GetTokensOptions['metadataCollector'] = async (
      ...args
    ) => {
      firstCollectorCalls += 1
      return collectTypeScriptMetadata(...args)
    }

    let secondCollectorCalls = 0
    const secondCollector: GetTokensOptions['metadataCollector'] = async (
      ...args
    ) => {
      secondCollectorCalls += 1
      return collectTypeScriptMetadata(...args)
    }

    await getCachedTokens(project, {
      value: entrySource,
      language: 'ts',
      filePath: entryFilePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector: firstCollector,
      waitForWarmResult: true,
    })
    await getCachedTokens(project, {
      value: entrySource,
      language: 'ts',
      filePath: entryFilePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector: firstCollector,
      waitForWarmResult: true,
    })
    await getCachedTokens(project, {
      value: entrySource,
      language: 'ts',
      filePath: entryFilePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector: secondCollector,
      waitForWarmResult: true,
    })

    expect(firstCollectorCalls).toBe(1)
    expect(secondCollectorCalls).toBe(1)
  })

  test('does not reuse runtime-cached tokens across analysisScopeId changes', async () => {
    await using workspace = await createTemporaryWorkspace({
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

    const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
    const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
    const entrySource = await readFile(entryFilePath, 'utf8')
    const uniqueId = Date.now()
    const projectA = getProgram({
      tsConfigFilePath,
      analysisScopeId: `tokens-a-${uniqueId}`,
    })
    const projectB = getProgram({
      tsConfigFilePath,
      analysisScopeId: `tokens-b-${uniqueId}`,
    })
    const highlighter = createHighlighter()

    let metadataCalls = 0
    const metadataCollector: GetTokensOptions['metadataCollector'] = async (
      ...args
    ) => {
      metadataCalls += 1
      return collectTypeScriptMetadata(...args)
    }

    await getCachedTokens(projectA, {
      value: entrySource,
      language: 'ts',
      filePath: entryFilePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
      waitForWarmResult: true,
    })
    await getCachedTokens(projectA, {
      value: entrySource,
      language: 'ts',
      filePath: entryFilePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
      waitForWarmResult: true,
    })
    await getCachedTokens(projectB, {
      value: entrySource,
      language: 'ts',
      filePath: entryFilePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
      waitForWarmResult: true,
    })

    expect(projectB).not.toBe(projectA)
    expect(metadataCalls).toBe(2)
  })

  test('does not reuse runtime-cached tokens across separate ad hoc Project instances without analysisScopeId', async () => {
    const uniqueId = Date.now()
    const filePath = `/virtual-runtime-scope-${uniqueId}/src/index.ts`
    const dependencyPath = `/virtual-runtime-scope-${uniqueId}/src/dep.ts`
    const entrySource = "import { value } from './dep'\nvalue\n"
    const projectA = createInMemoryTypeScriptProject()
    const projectB = createInMemoryTypeScriptProject()
    const highlighter = createHighlighter()

    projectA.createSourceFile(filePath, entrySource, {
      overwrite: true,
    })
    projectA.createSourceFile(dependencyPath, "export const value = 'a'\n", {
      overwrite: true,
    })
    projectB.createSourceFile(filePath, entrySource, {
      overwrite: true,
    })
    projectB.createSourceFile(dependencyPath, "export const value = 'b'\n", {
      overwrite: true,
    })

    let metadataCalls = 0
    const metadataCollector: GetTokensOptions['metadataCollector'] = async (
      ...args
    ) => {
      metadataCalls += 1
      return collectTypeScriptMetadata(...args)
    }

    await getCachedTokens(projectA, {
      value: entrySource,
      language: 'ts',
      filePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
      waitForWarmResult: true,
    })
    await getCachedTokens(projectA, {
      value: entrySource,
      language: 'ts',
      filePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
      waitForWarmResult: true,
    })
    await getCachedTokens(projectB, {
      value: entrySource,
      language: 'ts',
      filePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
      waitForWarmResult: true,
    })

    expect(projectB).not.toBe(projectA)
    expect(metadataCalls).toBe(2)
  })

  test('separates cached tokens by quick-info deferral mode', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const filePath = `/project/src/token-cache-quick-info-${Date.now()}.ts`
    const source = [
      'const value = 1;',
      ...Array.from({ length: 170 }, () => 'value;'),
    ].join('\n')
    const highlighter: GetTokensOptions['highlighter'] = {
      async tokenize() {
        return [
          [
            createTextMateToken('const'),
            createTextMateToken(' '),
            createTextMateToken('value'),
            createTextMateToken(' '),
            createTextMateToken('='),
            createTextMateToken(' '),
            createTextMateToken('1'),
            createTextMateToken(';'),
          ],
          ...Array.from({ length: 170 }, () => [
            createTextMateToken('value'),
            createTextMateToken(';'),
          ]),
        ]
      },
      async *stream() {
        yield [
          createTextMateToken('const'),
          createTextMateToken(' '),
          createTextMateToken('value'),
          createTextMateToken(' '),
          createTextMateToken('='),
          createTextMateToken(' '),
          createTextMateToken('1'),
          createTextMateToken(';'),
        ]
        for (let index = 0; index < 170; index += 1) {
          yield [createTextMateToken('value'), createTextMateToken(';')]
        }
      },
    }

    project.createSourceFile(filePath, source, {
      overwrite: true,
    })

    let metadataCalls = 0
    const metadataCollector: GetTokensOptions['metadataCollector'] = async (
      ...args
    ) => {
      metadataCalls += 1
      return collectTypeScriptMetadata(...args)
    }

    const deferredTokens = await getCachedTokens(project, {
      value: source,
      language: 'ts',
      filePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
      deferQuickInfoUntilHover: true,
    })
    const eagerTokens = await getCachedTokens(project, {
      value: source,
      language: 'ts',
      filePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
      deferQuickInfoUntilHover: false,
    })

    const deferredQuickInfoCount = deferredTokens
      .flat()
      .filter((token) => token.value === 'value' && token.quickInfo).length
    const eagerQuickInfoCount = eagerTokens
      .flat()
      .filter((token) => token.value === 'value' && token.quickInfo).length

    expect(deferredQuickInfoCount).toBe(160)
    expect(eagerQuickInfoCount).toBeGreaterThan(160)
    expect(metadataCalls).toBe(2)
  })

  test('serves plain token fallback immediately on cold development reads', async () => {
    await withDevelopmentLikeRuntime(async () => {
      const project = new Project({
        useInMemoryFileSystem: true,
      })
      const filePath = `/project/src/token-fallback-${Date.now()}.ts`
      const source = 'const first = 1\nconst second = 2'

      project.createSourceFile(filePath, source, {
        overwrite: true,
      })

      const highlighter = createHighlighter()
      const metadataCollector = vi.fn(collectTypeScriptMetadata)

      const first = await getCachedTokens(project, {
        value: source,
        language: 'ts',
        filePath,
        theme: 'default',
        allowErrors: true,
        highlighter: null,
        highlighterLoader: async () => {
          await delay(40)
          return highlighter
        },
        metadataCollector,
      })

      expect(first).toHaveLength(2)
      expect(metadataCollector).toHaveBeenCalledTimes(0)

      await delay(180)

      const second = await getCachedTokens(project, {
        value: source,
        language: 'ts',
        filePath,
        theme: 'default',
        allowErrors: true,
        highlighter: null,
        highlighterLoader: async () => highlighter,
        metadataCollector,
      })

      expect(second).toHaveLength(1)
      expect(metadataCollector).toHaveBeenCalledTimes(1)
    })
  })

  test('skips dependency AST traversal work for warm token cache hits', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const filePath = `/project/src/token-cache-hit-${Date.now()}.ts`
    const source =
      "import { dependencyValue } from './dependency'\nexport const value = dependencyValue"

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

    expect(getSourceFileSpy.mock.calls.length).toBe(
      getSourceFileCallsAfterFirstRun
    )
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
    invalidateProgramFileCache(project, filePath)

    const refreshed = await getCachedFileExportStaticValue(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })

    expect(refreshed).toBe(2)
  })

  test('recomputes cached static export values after imported dependency invalidation in fallback mode', async () => {
    const project = createInMemoryTypeScriptProject()
    const dependencyPath = '/project/src/dep.ts'
    const filePath = '/project/src/index.ts'

    project.createSourceFile(dependencyPath, 'export const dep = 1\n', {
      overwrite: true,
    })
    project.createSourceFile(
      filePath,
      "import { dep } from './dep'\nexport const value = dep\n",
      {
        overwrite: true,
      }
    )

    const [fileExport] = getFileExports(filePath, project)
    if (!fileExport) {
      throw new Error('[renoun] Expected a file export in cached-analysis test')
    }

    const first = await getCachedFileExportStaticValue(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })
    expect(first).toBe(1)

    project.createSourceFile(dependencyPath, 'export const dep = 2\n', {
      overwrite: true,
    })
    invalidateProgramFileCache(project, dependencyPath)
    invalidateRuntimeAnalysisCachePath(dependencyPath)

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
    invalidateProgramFileCache(project, filePath)

    const refreshed = await getCachedFileExportText(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })

    expect(refreshed).toContain('value = 2')
  })

  test('recomputes cached transpiled output after imported dependency invalidation in fallback mode', async () => {
    const project = createInMemoryTypeScriptProject()
    const dependencyPath = '/project/src/dep.ts'
    const filePath = '/project/src/index.ts'

    project.createSourceFile(
      dependencyPath,
      'export const enum Flags { Value = 1 }\n',
      {
        overwrite: true,
      }
    )
    project.createSourceFile(
      filePath,
      "import { Flags } from './dep'\nexport const value = Flags.Value\n",
      {
        overwrite: true,
      }
    )

    const first = await transpileCachedSourceFile(project, filePath)
    expect(first).toContain('= 1')

    project.createSourceFile(
      dependencyPath,
      'export const enum Flags { Value = 2 }\n',
      {
        overwrite: true,
      }
    )
    invalidateProgramFileCache(project, dependencyPath)
    invalidateRuntimeAnalysisCachePath(dependencyPath)

    const refreshed = await transpileCachedSourceFile(project, filePath)
    expect(refreshed).toContain('= 2')
  })

  test('recomputes cached file exports immediately after explicit runtime invalidation', async () => {
    await using workspace = await createTemporaryWorkspace({
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

    const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
    const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
    const project = new Project({
      tsConfigFilePath,
    })
    const getSourceFileSpy = vi.spyOn(project, 'getSourceFile')

    await getCachedFileExports(project, entryFilePath)
    const getSourceFileCallsAfterFirstRun = getSourceFileSpy.mock.calls.length

    await getCachedFileExports(project, entryFilePath)
    const getSourceFileCallsAfterSecondRun = getSourceFileSpy.mock.calls.length
    expect(getSourceFileCallsAfterSecondRun).toBeGreaterThanOrEqual(
      getSourceFileCallsAfterFirstRun
    )

    await writeFile(entryFilePath, 'export const value = 2\n', 'utf8')
    await project.getSourceFileOrThrow(entryFilePath).refreshFromFileSystem()
    invalidateRuntimeAnalysisCachePath(entryFilePath)
    await delay(0)

    await getCachedFileExports(project, entryFilePath)
    expect(getSourceFileSpy.mock.calls.length).toBeGreaterThan(
      getSourceFileCallsAfterSecondRun
    )
  })

  test('refreshes inherited tsconfig changes without touching the root tsconfig file', async () => {
    await using workspace = await createTemporaryWorkspace({
      'package.json': JSON.stringify({
        name: 'cached-analysis-test',
        private: true,
      }),
      'tsconfig.base.json': JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
        },
      }),
      'tsconfig.json': JSON.stringify({
        extends: './tsconfig.base.json',
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
      'src/index.ts': 'const maybe = value ?? 1\nexport { maybe }\n',
    })

    const uniqueId = Date.now()
    const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
    const baseConfigPath = join(workspace.workspacePath, 'tsconfig.base.json')
    const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
    const analysisScopeId = `config-chain-${uniqueId}`
    const project = getProgram({
      tsConfigFilePath,
      analysisScopeId,
    })

    const first = await transpileCachedSourceFile(project, entryFilePath)
    expect(first).toContain('??')

    await writeFile(
      baseConfigPath,
      JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2019',
          },
        },
        null,
        2
      ),
      'utf8'
    )
    invalidateRuntimeAnalysisCachePath(baseConfigPath)
    invalidateProgramCachesByPath(baseConfigPath)

    const refreshedProject = getProgram({
      tsConfigFilePath,
      analysisScopeId,
    })
    const second = await transpileCachedSourceFile(
      refreshedProject,
      entryFilePath
    )

    expect(refreshedProject).not.toBe(project)
    expect(second).not.toContain('??')
  })

  test('hydrates source files for runtime-cached export metadata lookups', async () => {
    await using workspace = await createTemporaryWorkspace({
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
      'src/index.ts': '/** value */\nexport const value = 1\n',
    })

    const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
    const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
    const project = new Project({
      tsConfigFilePath,
    })

    const first = await getCachedFileExports(project, entryFilePath)
    const firstExport = first[0]
    if (!firstExport) {
      throw new Error('[renoun] Expected a file export in cached-analysis test')
    }

    const sourceFile = project.getSourceFileOrThrow(entryFilePath)
    project.removeSourceFile(sourceFile)
    expect(project.getSourceFile(entryFilePath)).toBeUndefined()

    await getCachedFileExports(project, entryFilePath)
    expect(project.getSourceFile(entryFilePath)).toBeDefined()

    const metadata = await getCachedFileExportMetadata(project, {
      name: firstExport.name,
      filePath: firstExport.path,
      position: firstExport.position,
      kind: firstExport.kind,
    })

    expect(metadata.name).toBe('value')
  })

  test('recomputes cached file export metadata immediately after explicit runtime invalidation', async () => {
    await using workspace = await createTemporaryWorkspace({
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

    expect(second.jsDocMetadata?.description).toBe(
      first.jsDocMetadata?.description
    )
    expect(getSourceFileSpy.mock.calls.length).toBe(
      sourceFileCallsAfterFirstRun
    )

    await writeFile(
      entryFilePath,
      '/** two */\nexport const value = 1\n',
      'utf8'
    )
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
  })

  test('recomputes cached outline ranges immediately after explicit runtime invalidation', async () => {
    await using workspace = await createTemporaryWorkspace({
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
  })

  test('invalidates fallback outline ranges after explicit runtime invalidation', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const filePath = '/project/src/fallback-outline-cache.ts'

    project.createSourceFile(
      filePath,
      'export function one() {\n  return 1\n}\n',
      {
        overwrite: true,
      }
    )

    const first = await getCachedOutlineRanges(project, filePath)
    const second = await getCachedOutlineRanges(project, filePath)
    expect(second).toEqual(first)

    project.createSourceFile(
      filePath,
      'export function one() {\n  return 1\n}\n\nexport function two() {\n  return 2\n}\n',
      {
        overwrite: true,
      }
    )
    invalidateRuntimeAnalysisCachePath(filePath)
    await delay(0)

    const refreshed = await getCachedOutlineRanges(project, filePath)
    expect(refreshed).not.toEqual(first)
  })

  test('recomputes cached static export values immediately after explicit runtime invalidation', async () => {
    await using workspace = await createTemporaryWorkspace({
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
  })

  test('recomputes cached static export values after imported dependency invalidation in the runtime cache', async () => {
    await using workspace = await createTemporaryWorkspace({
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
      'src/dep.ts': 'export const dep = 1\n',
      'src/index.ts': "import { dep } from './dep'\nexport const value = dep\n",
    })

    const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
    const dependencyPath = join(workspace.workspacePath, 'src/dep.ts')
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

    await writeFile(dependencyPath, 'export const dep = 2\n', 'utf8')
    await project.getSourceFileOrThrow(dependencyPath).refreshFromFileSystem()
    invalidateProgramFileCache(project, dependencyPath)
    invalidateRuntimeAnalysisCachePath(dependencyPath)
    await delay(0)

    const refreshed = await getCachedFileExportStaticValue(project, {
      filePath: entryFilePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })
    expect(refreshed).toBe(2)
  })

  test('recomputes transpiled output immediately after explicit runtime invalidation', async () => {
    await using workspace = await createTemporaryWorkspace({
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
  })

  test('recomputes transpiled output after imported dependency invalidation in the runtime cache', async () => {
    await using workspace = await createTemporaryWorkspace({
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
      'src/dep.ts': 'export const enum Flags { Value = 1 }\n',
      'src/index.ts':
        "import { Flags } from './dep'\nexport const value = Flags.Value\n",
    })

    const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
    const dependencyPath = join(workspace.workspacePath, 'src/dep.ts')
    const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
    const project = new Project({
      tsConfigFilePath,
    })

    const first = await transpileCachedSourceFile(project, entryFilePath)
    const second = await transpileCachedSourceFile(project, entryFilePath)
    expect(first).toContain('= 1')
    expect(second).toBe(first)

    await writeFile(
      dependencyPath,
      'export const enum Flags { Value = 2 }\n',
      'utf8'
    )
    await project.getSourceFileOrThrow(dependencyPath).refreshFromFileSystem()
    invalidateProgramFileCache(project, dependencyPath)
    invalidateRuntimeAnalysisCachePath(dependencyPath)
    await delay(0)

    const refreshed = await transpileCachedSourceFile(project, entryFilePath)
    expect(refreshed).not.toBe(first)
    expect(refreshed).toContain('= 2')
  })

  test('recomputes includeDependencies export text immediately after explicit runtime invalidation', async () => {
    await using workspace = await createTemporaryWorkspace({
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

    await writeFile(
      entryFilePath,
      'const helper = 2\nexport const value = helper\n'
    )
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
    invalidateProgramFileCache(project, dependencyPath)

    const refreshed = await resolveCachedTypeAtLocationWithDependencies(
      project,
      {
        filePath,
        position: fileExport.position,
        kind: fileExport.kind,
      }
    )

    expect(refreshed.dependencies).toContain(dependencyPath)
    expect(refreshed.resolvedType).toBeDefined()
  })

  test('recomputes cached type resolution immediately after explicit runtime invalidation', async () => {
    await using workspace = await createTemporaryWorkspace({
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
  }, 45_000)

  test('recomputes cached source metadata immediately after explicit runtime invalidation', async () => {
    await using workspace = await createTemporaryWorkspace({
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
        "import { middleValue } from './middle'\nexport const value = middleValue\n",
      'src/middle.ts':
        "import { leafValue } from './leaf'\nexport const middleValue = leafValue\n",
      'src/leaf.ts': "export const leafValue = 'one'\n",
    })

    const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
    const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
    const transitiveDependencyPath = join(
      workspace.workspacePath,
      'src/leaf.ts'
    )
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
    const createSourceFileCallsAfterFirstRun =
      createSourceFileSpy.mock.calls.length
    await getCachedSourceTextMetadata(project, {
      value: entrySource,
      filePath: entryFilePath,
      language: 'ts',
      shouldFormat: false,
    })
    const createSourceFileCallsAfterSecondRun =
      createSourceFileSpy.mock.calls.length

    expect(createSourceFileCallsAfterFirstRun).toBeGreaterThanOrEqual(1)
    expect(createSourceFileCallsAfterSecondRun).toBeGreaterThanOrEqual(
      createSourceFileCallsAfterFirstRun
    )

    if (isDetectAsyncLeaksEnabled) {
      expect(createSourceFileCallsAfterSecondRun).toBeGreaterThanOrEqual(1)
    } else {
      expect(
        createSourceFileCallsAfterSecondRun - createSourceFileCallsAfterFirstRun
      ).toBeLessThanOrEqual(1)
    }

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
    const createSourceFileCallsAfterInvalidation =
      createSourceFileSpy.mock.calls.length
    if (isDetectAsyncLeaksEnabled) {
      expect(createSourceFileCallsAfterInvalidation).toBeGreaterThanOrEqual(
        createSourceFileCallsAfterSecondRun
      )
    } else {
      expect(createSourceFileCallsAfterInvalidation).toBeGreaterThanOrEqual(
        createSourceFileCallsAfterSecondRun
      )
      expect(
        createSourceFileCallsAfterInvalidation -
          createSourceFileCallsAfterSecondRun
      ).toBeLessThanOrEqual(1)
    }
  }, 45_000)

  test('recomputes cached tokens immediately after explicit runtime invalidation', async () => {
    await using workspace = await createTemporaryWorkspace({
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
        "import { middleValue } from './middle'\nexport const value = middleValue\n",
      'src/middle.ts':
        "import { leafValue } from './leaf'\nexport const middleValue = leafValue\n",
      'src/leaf.ts': "export const leafValue = 'one'\n",
    })

    const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
    const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
    const transitiveDependencyPath = join(
      workspace.workspacePath,
      'src/leaf.ts'
    )
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
      waitForWarmResult: true,
    })
    const metadataCallsAfterFirstRun = metadataCalls
    await getCachedTokens(project, {
      value: entrySource,
      language: 'ts',
      filePath: entryFilePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
      waitForWarmResult: true,
    })
    const metadataCallsAfterSecondRun = metadataCalls
    expect(
      metadataCallsAfterSecondRun - metadataCallsAfterFirstRun
    ).toBeLessThanOrEqual(1)

    await writeFile(
      transitiveDependencyPath,
      "export const leafValue = 'two-updated'\n",
      'utf8'
    )
    await project
      .getSourceFileOrThrow(transitiveDependencyPath)
      .refreshFromFileSystem()
    invalidateRuntimeAnalysisCachePath(transitiveDependencyPath)

    await getCachedTokens(project, {
      value: entrySource,
      language: 'ts',
      filePath: entryFilePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
    })

    if (isDetectAsyncLeaksEnabled) {
      expect(metadataCalls).toBeGreaterThanOrEqual(metadataCallsAfterSecondRun)
    } else {
      expect(metadataCalls).toBeGreaterThan(metadataCallsAfterSecondRun)
    }
  }, 45_000)

  test(
    'invalidates cached source metadata when transitive TypeScript dependencies change on disk',
    async () => {
      await using workspace = await createTemporaryWorkspace({
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
          "import { middleValue } from './middle'\nexport const value = middleValue\n",
        'src/middle.ts':
          "import { leafValue } from './leaf'\nexport const middleValue = leafValue\n",
        'src/leaf.ts': "export const leafValue = 'one'\n",
      })

      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
      const transitiveDependencyPath = join(
        workspace.workspacePath,
        'src/leaf.ts'
      )
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
    },
    30_000
  )

  test(
    'invalidates cached virtualized source metadata when transitive TypeScript dependencies change on disk',
    async () => {
      await using workspace = await createTemporaryWorkspace({
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
        'src/dep.ts': "export const dep = 'one'\n",
      })

      const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
      const virtualSnippetPath = join(
        workspace.workspacePath,
        'src/snippets/example.ts'
      )
      const transitiveDependencyPath = join(
        workspace.workspacePath,
        'src/dep.ts'
      )
      const entrySource = "import { dep } from '../dep'\nexport const value = dep\n"
      const project = new Project({
        tsConfigFilePath,
      })
      const createSourceFileSpy = vi.spyOn(project, 'createSourceFile')
      await delay(1_100)

      const first = await getCachedSourceTextMetadata(project, {
        value: entrySource,
        filePath: virtualSnippetPath,
        language: 'ts',
        virtualizeFilePath: true,
        shouldFormat: false,
      })
      const createSourceFileCallsAfterFirstRun =
        createSourceFileSpy.mock.calls.length
      await getCachedSourceTextMetadata(project, {
        value: entrySource,
        filePath: virtualSnippetPath,
        language: 'ts',
        virtualizeFilePath: true,
        shouldFormat: false,
      })
      const createSourceFileCallsAfterSecondRun =
        createSourceFileSpy.mock.calls.length

      expect(first.filePath).toContain('.__renoun_snippet_')
      expect(createSourceFileCallsAfterSecondRun).toBe(
        createSourceFileCallsAfterFirstRun
      )

      await writeFile(
        transitiveDependencyPath,
        "export const dep = 'two-updated'\n",
        'utf8'
      )
      await project
        .getSourceFileOrThrow(transitiveDependencyPath)
        .refreshFromFileSystem()
      await delay(325)

      await getCachedSourceTextMetadata(project, {
        value: entrySource,
        filePath: virtualSnippetPath,
        language: 'ts',
        virtualizeFilePath: true,
        shouldFormat: false,
      })

      expect(createSourceFileSpy.mock.calls.length).toBeGreaterThan(
        createSourceFileCallsAfterSecondRun
      )
    },
    30_000
  )

  test('invalidates cached tokens when transitive TypeScript dependencies change on disk', async () => {
    await using workspace = await createTemporaryWorkspace({
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
        "import { middleValue } from './middle'\nexport const value = middleValue\n",
      'src/middle.ts':
        "import { leafValue } from './leaf'\nexport const middleValue = leafValue\n",
      'src/leaf.ts': "export const leafValue = 'one'\n",
    })

    const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
    const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
    const transitiveDependencyPath = join(
      workspace.workspacePath,
      'src/leaf.ts'
    )
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
  })

  test('invalidates cached tokens for virtualized snippets when transitive TypeScript dependencies change on disk', async () => {
    await using workspace = await createTemporaryWorkspace({
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
      'src/dep.ts': "export const dep = 'one'\n",
    })

    const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
    const virtualSnippetPath = join(
      workspace.workspacePath,
      'src/snippets/example.ts'
    )
    const transitiveDependencyPath = join(workspace.workspacePath, 'src/dep.ts')
    const entrySource = "import { dep } from '../dep'\nexport const value = dep\n"
    const project = new Project({
      tsConfigFilePath,
    })
    const highlighter = createHighlighter()
    await delay(1_100)

    const metadata = await getCachedSourceTextMetadata(project, {
      value: entrySource,
      filePath: virtualSnippetPath,
      language: 'ts',
      virtualizeFilePath: true,
      shouldFormat: false,
    })

    let metadataCalls = 0
    const metadataCollector: GetTokensOptions['metadataCollector'] = async (
      ...args
    ) => {
      metadataCalls += 1
      return collectTypeScriptMetadata(...args)
    }

    await getCachedTokens(project, {
      value: metadata.value,
      language: 'ts',
      filePath: metadata.filePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
    })
    await getCachedTokens(project, {
      value: metadata.value,
      language: 'ts',
      filePath: metadata.filePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
    })

    expect(metadataCalls).toBe(1)

    await writeFile(
      transitiveDependencyPath,
      "export const dep = 'two-updated'\n",
      'utf8'
    )
    await project
      .getSourceFileOrThrow(transitiveDependencyPath)
      .refreshFromFileSystem()
    await delay(325)

    await getCachedTokens(project, {
      value: metadata.value,
      language: 'ts',
      filePath: metadata.filePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
    })

    expect(metadataCalls).toBe(2)
  })

  test('does not invalidate cached tokens when transitive require dependencies change on disk', async () => {
    await using workspace = await createTemporaryWorkspace({
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
        "const { middleValue } = require('./middle')\nexport const value = middleValue\n",
      'src/middle.ts':
        "const { leafValue } = require('./leaf')\nexport const middleValue = leafValue\n",
      'src/leaf.ts': "export const leafValue = 'one'\n",
    })

    const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
    const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
    const transitiveDependencyPath = join(
      workspace.workspacePath,
      'src/leaf.ts'
    )
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
  })

  test('does not invalidate cached tokens when transitive dynamic import dependencies change on disk', async () => {
    await using workspace = await createTemporaryWorkspace({
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
        "import { loadMiddleValue } from './middle'\nexport async function loadValue() { return loadMiddleValue() }\n",
      'src/middle.ts':
        "export async function loadMiddleValue() { const leaf = await import('./leaf'); return leaf.leafValue }\n",
      'src/leaf.ts': "export const leafValue = 'one'\n",
    })

    const tsConfigFilePath = join(workspace.workspacePath, 'tsconfig.json')
    const entryFilePath = join(workspace.workspacePath, 'src/index.ts')
    const transitiveDependencyPath = join(
      workspace.workspacePath,
      'src/leaf.ts'
    )
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
  })

  test('does not warn when module specifiers cannot be statically analyzed', async () => {
    await using workspace = await createTemporaryWorkspace({
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
        "const target = './leaf'\nconst dependency = require(target)\nexport const value = dependency.leafValue\n",
      'src/leaf.ts': "export const leafValue = 'one'\n",
    })

    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)
    using _restoreConsoleWarnSpy = createDisposeHandle(() => {
      consoleWarnSpy.mockRestore()
    })

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
  })

  test('invalidates cached tokens when a previously unresolved import becomes resolvable', async () => {
    await using workspace = await createTemporaryWorkspace({
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
    const metadataCallsAfterFirstRun = metadataCalls
    await getCachedTokens(project, {
      value: entrySource,
      language: 'ts',
      filePath: entryFilePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
    })
    const metadataCallsAfterSecondRun = metadataCalls
    expect(
      metadataCallsAfterSecondRun - metadataCallsAfterFirstRun
    ).toBeLessThanOrEqual(1)

    await writeFile(dependencyPath, 'export const dep = 1\n', 'utf8')
    project.addSourceFileAtPath(dependencyPath)
    invalidateRuntimeAnalysisCachePath(dependencyPath)
    await delay(325)

    const metadataCallsBeforeInvalidationRefresh = metadataCalls
    await getCachedTokens(project, {
      value: entrySource,
      language: 'ts',
      filePath: entryFilePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
      waitForWarmResult: true,
    })

    if (isDetectAsyncLeaksEnabled) {
      expect(metadataCalls).toBeGreaterThanOrEqual(
        metadataCallsBeforeInvalidationRefresh
      )
    } else {
      expect(metadataCalls).toBeGreaterThan(
        metadataCallsBeforeInvalidationRefresh
      )
    }
  })

  test('invalidates cached tokens when imported package versions change', async () => {
    await using workspace = await createTemporaryWorkspace({
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
      'src/index.ts':
        "import { value as dependencyValue } from 'dep-lib'\nexport const localValue = dependencyValue\n",
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
  })

  test('does not invalidate cached tokens when imported package declaration files are rewritten without version changes', async () => {
    await using workspace = await createTemporaryWorkspace({
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
      'src/index.ts':
        "import { value as dependencyValue } from 'dep-lib'\nexport const localValue = dependencyValue\n",
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
  })
})
