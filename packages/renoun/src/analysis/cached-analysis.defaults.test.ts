import { resolve } from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

import { captureProcessEnv, restoreProcessEnv } from '../utils/test.ts'
import { getTsMorph } from '../utils/ts-morph.ts'

const { Project } = getTsMorph()

const ORIGINAL_ENV = captureProcessEnv(['NODE_ENV'])

async function readCachedSourceTextMetadata(): Promise<void> {
  const cachedAnalysis = await import('./cached-analysis.ts')
  const project = new Project({
    useInMemoryFileSystem: true,
  })

  await cachedAnalysis.getCachedSourceTextMetadata(project, {
    value: 'const value = 1',
    language: 'ts',
    shouldFormat: false,
  })
}

async function waitForQueuedColdStartTask(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
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

describe('analysis cached analysis runtime defaults', () => {
  afterEach(() => {
    restoreProcessEnv(ORIGINAL_ENV)
    vi.restoreAllMocks()
    vi.resetModules()
    vi.doUnmock('./runtime-analysis-session.ts')
  })

  test('initializes runtime analysis session by default in production', async () => {
    process.env['NODE_ENV'] = 'production'

    const runtimeSessionSpy = vi.fn(async () => undefined)
    vi.doMock('./runtime-analysis-session.ts', () => ({
      getRuntimeAnalysisSession: runtimeSessionSpy,
    }))

    await readCachedSourceTextMetadata()

    expect(runtimeSessionSpy).toHaveBeenCalledTimes(1)
  })

  test('initializes runtime analysis session by default in development', async () => {
    process.env['NODE_ENV'] = 'development'

    const runtimeSessionSpy = vi.fn(async () => undefined)
    vi.doMock('./runtime-analysis-session.ts', () => ({
      getRuntimeAnalysisSession: runtimeSessionSpy,
    }))

    await readCachedSourceTextMetadata()
    await waitForQueuedColdStartTask()

    expect(runtimeSessionSpy).toHaveBeenCalledTimes(1)
  })

  test('treats prewarmed scope ids as bootstrapped for matching project sessions', async () => {
    await withDevelopmentLikeRuntime(async () => {
      const runtimeSessionSpy = vi
        .fn()
        .mockResolvedValueOnce({
          session: {
            cache: {},
            snapshot: {},
          },
          fileSystem: {},
          scopePathKey: resolve('virtual-prewarm-scope'),
          analysisScopeId: 'scope-prewarm',
        })
        .mockResolvedValueOnce(undefined)
      vi.doMock('./runtime-analysis-session.ts', () => ({
        getRuntimeAnalysisSession: runtimeSessionSpy,
      }))

      const cachedAnalysis = await import('./cached-analysis.ts')
      const projectScope = await import('./project-scope.ts')
      const project = new Project({
        useInMemoryFileSystem: true,
      })
      const prewarmFilePath = 'virtual-prewarm-scope/example.ts'
      const filePath = resolve('virtual-prewarm-scope/example.ts')

      projectScope.setProjectAnalysisScopeId(project, 'scope-prewarm')

      await cachedAnalysis.prewarmRuntimeAnalysisSession({
        project,
        filePath: prewarmFilePath,
      })

      await cachedAnalysis.getCachedSourceTextMetadata(project, {
        value: 'export const value = 1\n',
        filePath,
        language: 'ts',
        shouldFormat: false,
      })

      expect(runtimeSessionSpy).toHaveBeenCalledTimes(2)
      expect(runtimeSessionSpy).toHaveBeenNthCalledWith(
        1,
        undefined,
        'virtual-prewarm-scope',
        'scope-prewarm'
      )
      expect(runtimeSessionSpy).toHaveBeenNthCalledWith(
        2,
        undefined,
        resolve('virtual-prewarm-scope'),
        'scope-prewarm'
      )
    })
  })
})
