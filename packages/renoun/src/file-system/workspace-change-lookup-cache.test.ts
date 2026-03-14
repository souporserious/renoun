import { expect, test, vi } from 'vitest'

import { WorkspaceChangeLookupCache } from './workspace-change-lookup-cache.ts'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

function toArray(set: ReadonlySet<string> | null): string[] | null {
  return set ? Array.from(set) : null
}

test('awaits refreshed changed paths for the active key in swr mode', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

  try {
    let docsLookupCount = 0
    const cache = new WorkspaceChangeLookupCache({
      getWorkspaceTokenTtlMs: () => 0,
      getWorkspaceChangedPathsTtlMs: () => 5,
      normalizeRootPath: (rootPath) => rootPath,
      normalizeChangedPath: (changedPath) => changedPath,
      lookupWorkspaceToken: async () => null,
      lookupWorkspaceChangedPaths: async (_rootPath, previousToken) => {
        docsLookupCount += 1
        if (docsLookupCount === 1) {
          return [`${previousToken}:v1.ts`]
        }

        return [`${previousToken}:v2.ts`]
      },
      serveStaleWhileRevalidate: true,
    })

    const first = await cache.getWorkspaceChangedPathsSinceToken('docs', 'prev')
    expect(toArray(first)).toEqual(['prev:v1.ts'])

    vi.setSystemTime(Date.now() + 10)

    const refreshedPromise = cache.getWorkspaceChangedPathsSinceToken(
      'docs',
      'prev'
    )
    let resolvedImmediately = false
    void refreshedPromise.then(() => {
      resolvedImmediately = true
    })
    await Promise.resolve()
    expect(resolvedImmediately).toBe(false)

    await Promise.resolve()
    await Promise.resolve()

    expect(toArray(await refreshedPromise)).toEqual(['prev:v2.ts'])
  } finally {
    vi.useRealTimers()
  }
})

test('awaits refreshed workspace tokens after ttl expiry in swr mode', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

  try {
    const tokenRefreshGate = createDeferred<string | null>()
    let lookupCount = 0
    const cache = new WorkspaceChangeLookupCache({
      getWorkspaceTokenTtlMs: () => 5,
      getWorkspaceChangedPathsTtlMs: () => 0,
      normalizeRootPath: (rootPath) => rootPath,
      normalizeChangedPath: (changedPath) => changedPath,
      lookupWorkspaceToken: async (rootPath) => {
        lookupCount += 1
        if (lookupCount === 1) {
          return `${rootPath}:v1`
        }

        return tokenRefreshGate.promise
      },
      lookupWorkspaceChangedPaths: async () => null,
      serveStaleWhileRevalidate: true,
    })

    expect(await cache.getWorkspaceChangeToken('docs')).toBe('docs:v1')

    vi.setSystemTime(Date.now() + 10)

    const refreshedPromise = cache.getWorkspaceChangeToken('docs')
    const concurrentPromise = cache.getWorkspaceChangeToken('docs')
    let refreshedResolved = false
    let concurrentResolved = false
    void refreshedPromise.then(() => {
      refreshedResolved = true
    })
    void concurrentPromise.then(() => {
      concurrentResolved = true
    })

    await Promise.resolve()

    expect(refreshedResolved).toBe(false)
    expect(concurrentResolved).toBe(false)

    tokenRefreshGate.resolve('docs:v2')

    await expect(refreshedPromise).resolves.toBe('docs:v2')
    await expect(concurrentPromise).resolves.toBe('docs:v2')
    expect(lookupCount).toBe(2)
  } finally {
    vi.useRealTimers()
  }
})

test('evicts expired changed-path entries for other keys under swr', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

  try {
    const firstKeyRefreshGate = createDeferred<readonly string[] | null>()
    let firstKeyLookupCount = 0
    const cache = new WorkspaceChangeLookupCache({
      getWorkspaceTokenTtlMs: () => 0,
      getWorkspaceChangedPathsTtlMs: () => 5,
      normalizeRootPath: (rootPath) => rootPath,
      normalizeChangedPath: (changedPath) => changedPath,
      lookupWorkspaceToken: async () => null,
      lookupWorkspaceChangedPaths: async (_rootPath, previousToken) => {
        if (previousToken === 'first') {
          firstKeyLookupCount += 1
          if (firstKeyLookupCount === 1) {
            return ['first:v1.ts']
          }

          return firstKeyRefreshGate.promise
        }

        return ['second:v1.ts']
      },
      serveStaleWhileRevalidate: true,
    })

    expect(
      toArray(await cache.getWorkspaceChangedPathsSinceToken('docs', 'first'))
    ).toEqual(['first:v1.ts'])

    vi.setSystemTime(Date.now() + 10)

    expect(
      toArray(await cache.getWorkspaceChangedPathsSinceToken('docs', 'second'))
    ).toEqual(['second:v1.ts'])

    const refreshedFirstPromise = cache.getWorkspaceChangedPathsSinceToken(
      'docs',
      'first'
    )
    let resolvedImmediately = false
    void refreshedFirstPromise.then(() => {
      resolvedImmediately = true
    })
    await Promise.resolve()

    expect(resolvedImmediately).toBe(false)

    firstKeyRefreshGate.resolve(['first:v2.ts'])
    expect(toArray(await refreshedFirstPromise)).toEqual(['first:v2.ts'])
  } finally {
    vi.useRealTimers()
  }
})
