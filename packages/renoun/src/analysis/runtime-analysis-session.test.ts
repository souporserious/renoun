import { afterEach, describe, expect, test } from 'vitest'

import {
  getRuntimeAnalysisSession,
  getRuntimeAnalysisSessions,
  resetRuntimeAnalysisSessionsForTests,
} from './runtime-analysis-session.ts'

describe('runtime analysis session', () => {
  afterEach(() => {
    resetRuntimeAnalysisSessionsForTests()
  })

  test('reuses the same session for identical scope paths', async () => {
    const scopePath = `${process.cwd()}/.cache/runtime-analysis/session-same-scope`

    const first = await getRuntimeAnalysisSession(undefined, scopePath)
    const second = await getRuntimeAnalysisSession(undefined, scopePath)

    expect(first?.session).toBe(second?.session)
  })

  test('isolates sessions between different scope paths', async () => {
    const basePath = `${process.cwd()}/.cache/runtime-analysis/session-isolation-${Date.now()}`
    const firstScopePath = `${basePath}/first`
    const secondScopePath = `${basePath}/second`

    const first = await getRuntimeAnalysisSession(undefined, firstScopePath)
    const second = await getRuntimeAnalysisSession(undefined, secondScopePath)

    expect(first?.session).not.toBe(second?.session)
  })

  test('isolates sessions between different analysis scopes for the same path', async () => {
    const scopePath = `${process.cwd()}/.cache/runtime-analysis/session-analysis-scope-${Date.now()}`

    const first = await getRuntimeAnalysisSession(
      undefined,
      scopePath,
      'scope-a'
    )
    const second = await getRuntimeAnalysisSession(
      undefined,
      scopePath,
      'scope-b'
    )

    expect(first?.session).not.toBe(second?.session)
  })

  test('returns only intersecting sessions when filtering by paths', async () => {
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

  test('evicts least recently used scoped sessions when the cache grows too large', async () => {
    const basePath = `${process.cwd()}/.cache/runtime-analysis/session-eviction-${Date.now()}`

    const firstScopePath = `${basePath}/scope-0`
    const firstSession = await getRuntimeAnalysisSession(
      undefined,
      firstScopePath
    )

    for (let index = 1; index < 80; ++index) {
      await getRuntimeAnalysisSession(
        undefined,
        `${basePath}/scope-${index}`
      )
    }

    const refreshedFirstSession = await getRuntimeAnalysisSession(
      undefined,
      firstScopePath
    )

    expect(refreshedFirstSession?.session).not.toBe(firstSession?.session)
  })
})
