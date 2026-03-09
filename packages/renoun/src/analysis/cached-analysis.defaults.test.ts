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
})
