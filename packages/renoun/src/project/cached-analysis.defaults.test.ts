import { afterEach, describe, expect, test, vi } from 'vitest'

import { getTsMorph } from '../utils/ts-morph.ts'

const { Project } = getTsMorph()

const ORIGINAL_NODE_ENV = process.env['NODE_ENV']
const ORIGINAL_RUNTIME_CACHE = process.env['RENOUN_RUNTIME_ANALYSIS_CACHE']
const ORIGINAL_RUNTIME_PERSISTENCE =
  process.env['RENOUN_RUNTIME_ANALYSIS_PERSISTENCE']

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

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

describe('project cached analysis runtime defaults', () => {
  afterEach(() => {
    restoreEnv('NODE_ENV', ORIGINAL_NODE_ENV)
    restoreEnv('RENOUN_RUNTIME_ANALYSIS_CACHE', ORIGINAL_RUNTIME_CACHE)
    restoreEnv(
      'RENOUN_RUNTIME_ANALYSIS_PERSISTENCE',
      ORIGINAL_RUNTIME_PERSISTENCE
    )
    vi.restoreAllMocks()
    vi.resetModules()
    vi.doUnmock('./runtime-analysis-session.ts')
  })

  test('does not initialize runtime analysis session by default in production', async () => {
    process.env['NODE_ENV'] = 'production'
    delete process.env['RENOUN_RUNTIME_ANALYSIS_CACHE']
    delete process.env['RENOUN_RUNTIME_ANALYSIS_PERSISTENCE']

    const runtimeSessionSpy = vi.fn(async () => undefined)
    vi.doMock('./runtime-analysis-session.ts', () => ({
      getRuntimeAnalysisSession: runtimeSessionSpy,
    }))

    await readCachedSourceTextMetadata()

    expect(runtimeSessionSpy).not.toHaveBeenCalled()
  })

  test('initializes runtime analysis session by default in development', async () => {
    process.env['NODE_ENV'] = 'development'
    delete process.env['RENOUN_RUNTIME_ANALYSIS_CACHE']
    delete process.env['RENOUN_RUNTIME_ANALYSIS_PERSISTENCE']

    const runtimeSessionSpy = vi.fn(async () => undefined)
    vi.doMock('./runtime-analysis-session.ts', () => ({
      getRuntimeAnalysisSession: runtimeSessionSpy,
    }))

    await readCachedSourceTextMetadata()

    expect(runtimeSessionSpy).toHaveBeenCalledTimes(1)
  })
})
