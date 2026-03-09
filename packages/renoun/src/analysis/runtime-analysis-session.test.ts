import { afterEach, describe, expect, test, vi } from 'vitest'

import { disposeDefaultCacheStorePersistence } from '../file-system/CacheSqlite.ts'

async function loadRuntimeAnalysisSessionModule() {
  vi.resetModules()
  return import('./runtime-analysis-session.ts')
}

describe('runtime analysis session', () => {
  afterEach(async () => {
    const { resetRuntimeAnalysisSessionsForTests } = await import(
      './runtime-analysis-session.ts'
    )
    resetRuntimeAnalysisSessionsForTests()
    disposeDefaultCacheStorePersistence()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  test('reuses the same session for identical scope paths', async () => {
    const { getRuntimeAnalysisSession } = await loadRuntimeAnalysisSessionModule()
    const scopePath = `${process.cwd()}/.cache/runtime-analysis/session-same-scope`

    const first = await getRuntimeAnalysisSession(undefined, scopePath)
    const second = await getRuntimeAnalysisSession(undefined, scopePath)

    expect(first?.session).toBe(second?.session)
  })

  test('isolates sessions between different scope paths', async () => {
    const { getRuntimeAnalysisSession } = await loadRuntimeAnalysisSessionModule()
    const basePath = `${process.cwd()}/.cache/runtime-analysis/session-isolation-${Date.now()}`
    const firstScopePath = `${basePath}/first`
    const secondScopePath = `${basePath}/second`

    const first = await getRuntimeAnalysisSession(undefined, firstScopePath)
    const second = await getRuntimeAnalysisSession(undefined, secondScopePath)

    expect(first?.session).not.toBe(second?.session)
  })

  test('returns only intersecting sessions when filtering by paths', async () => {
    const { getRuntimeAnalysisSession, getRuntimeAnalysisSessions } =
      await loadRuntimeAnalysisSessionModule()
    const basePath = `${process.cwd()}/.cache/runtime-analysis/session-filter-${Date.now()}`
    const firstScopePath = `${basePath}/first`
    const secondScopePath = `${basePath}/second`

    const first = await getRuntimeAnalysisSession(undefined, firstScopePath)
    const second = await getRuntimeAnalysisSession(undefined, secondScopePath)
    const selected = await getRuntimeAnalysisSessions([
      `${firstScopePath}/src/index.ts`,
    ])

    expect(selected.some((session) => session.session === first?.session)).toBe(
      true
    )
    expect(selected.some((session) => session.session === second?.session)).toBe(
      false
    )
  })

  test('does not include the default session when filtering by paths', async () => {
    const { getRuntimeAnalysisSession, getRuntimeAnalysisSessions } =
      await loadRuntimeAnalysisSessionModule()
    const basePath = `${process.cwd()}/.cache/runtime-analysis/session-default-filter-${Date.now()}`
    const scopedPath = `${basePath}/scoped`

    const defaultSession = await getRuntimeAnalysisSession()
    const scopedSession = await getRuntimeAnalysisSession(undefined, scopedPath)
    const selected = await getRuntimeAnalysisSessions([
      `${scopedPath}/src/index.ts`,
    ])

    expect(
      selected.some((session) => session.session === defaultSession?.session)
    ).toBe(false)
    expect(
      selected.some((session) => session.session === scopedSession?.session)
    ).toBe(true)
  })
})
