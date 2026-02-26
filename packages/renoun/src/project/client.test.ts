import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { captureProcessEnv, restoreProcessEnv } from '../utils/test-process-env.ts'

const mocks = vi.hoisted(() => {
  return {
    WebSocketClient: vi.fn(),
    getProject: vi.fn(() => ({ mockedProject: true })),
    invalidateProjectCachesByPaths: vi.fn(() => 0),
    getCachedSourceTextMetadata: vi.fn(async () => ({
      value: 'local-result',
      language: 'txt',
    })),
    getCachedFileExportText: vi.fn(),
    getCachedFileExportMetadata: vi.fn(),
    getCachedFileExportStaticValue: vi.fn(),
    getCachedFileExports: vi.fn(),
    getCachedOutlineRanges: vi.fn(),
    getCachedTokens: vi.fn(),
    invalidateRuntimeAnalysisCachePath: vi.fn(),
    invalidateRuntimeAnalysisCachePaths: vi.fn(),
    resolveCachedTypeAtLocationWithDependencies: vi.fn(),
    transpileCachedSourceFile: vi.fn(),
    invalidateProjectFileCache: vi.fn(),
  }
})

vi.mock('./rpc/client.ts', () => ({
  WebSocketClient: mocks.WebSocketClient,
}))

vi.mock('./get-project.ts', () => ({
  getProject: mocks.getProject,
  invalidateProjectCachesByPaths: mocks.invalidateProjectCachesByPaths,
}))

vi.mock('./cached-analysis.ts', () => ({
  getCachedFileExportText: mocks.getCachedFileExportText,
  getCachedFileExportMetadata: mocks.getCachedFileExportMetadata,
  getCachedFileExportStaticValue: mocks.getCachedFileExportStaticValue,
  getCachedFileExports: mocks.getCachedFileExports,
  getCachedOutlineRanges: mocks.getCachedOutlineRanges,
  getCachedSourceTextMetadata: mocks.getCachedSourceTextMetadata,
  getCachedTokens: mocks.getCachedTokens,
  invalidateRuntimeAnalysisCachePath: mocks.invalidateRuntimeAnalysisCachePath,
  invalidateRuntimeAnalysisCachePaths:
    mocks.invalidateRuntimeAnalysisCachePaths,
  resolveCachedTypeAtLocationWithDependencies:
    mocks.resolveCachedTypeAtLocationWithDependencies,
  transpileCachedSourceFile: mocks.transpileCachedSourceFile,
}))

vi.mock('./cache.ts', () => ({
  invalidateProjectFileCache: mocks.invalidateProjectFileCache,
}))

describe('project client transport guards', () => {
  const originalEnvironment = captureProcessEnv([
    'RENOUN_SERVER_PORT',
    'RENOUN_SERVER_ID',
    'RENOUN_PROJECT_CLIENT_RPC_CACHE',
    'RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS',
    'RENOUN_PROJECT_REFRESH_NOTIFICATIONS',
  ])

  beforeEach(() => {
    vi.resetModules()
    mocks.WebSocketClient.mockClear()
    mocks.getProject.mockClear()
    mocks.getCachedSourceTextMetadata.mockClear()
    mocks.invalidateRuntimeAnalysisCachePaths.mockClear()
    mocks.invalidateProjectCachesByPaths.mockClear()
  })

  afterEach(() => {
    restoreProcessEnv(originalEnvironment)
  })

  test('falls back to local analysis when server id is missing', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    delete process.env['RENOUN_SERVER_ID']

    const module = await import('./client.ts')
    const result = await module.getSourceTextMetadata({
      value: 'const answer = 42',
      language: 'txt',
    })

    expect(mocks.WebSocketClient).not.toHaveBeenCalled()
    expect(mocks.getProject).toHaveBeenCalledTimes(1)
    expect(mocks.getCachedSourceTextMetadata).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      value: 'local-result',
      language: 'txt',
    })
  })

  test('invalidates dependency-aware RPC cache entries after source updates', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS'] = 'false'

    let resolveTypeCallCount = 0
    const callMethod = vi.fn(async (method: string) => {
      if (method === 'resolveTypeAtLocationWithDependencies') {
        return { resolveTypeCallCount: ++resolveTypeCallCount }
      }
      if (method === 'createSourceFile') {
        return
      }

      throw new Error(`Unexpected method: ${method}`)
    })

    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      return {
        callMethod,
      }
    })

    const module = await import('./client.ts')
    const first = await module.resolveTypeAtLocationWithDependencies(
      '/project/src/a.ts',
      0,
      0 as never
    )

    await module.createSourceFile('/project/src/b.ts', 'export const b = 2')

    const second = await module.resolveTypeAtLocationWithDependencies(
      '/project/src/a.ts',
      0,
      0 as never
    )

    expect(first).toMatchObject({ resolveTypeCallCount: 1 })
    expect(second).toMatchObject({ resolveTypeCallCount: 2 })
  })

  test('falls back to default RPC cache TTL when env value is invalid', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS'] = 'invalid'
    process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS'] = 'false'

    let resolveTypeCallCount = 0
    const callMethod = vi.fn(async (method: string) => {
      if (method === 'resolveTypeAtLocationWithDependencies') {
        return { resolveTypeCallCount: ++resolveTypeCallCount }
      }

      throw new Error(`Unexpected method: ${method}`)
    })

    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      return {
        callMethod,
      }
    })

    const module = await import('./client.ts')
    const first = await module.resolveTypeAtLocationWithDependencies(
      '/project/src/a.ts',
      0,
      0 as never
    )
    const second = await module.resolveTypeAtLocationWithDependencies(
      '/project/src/a.ts',
      0,
      0 as never
    )

    expect(first).toMatchObject({ resolveTypeCallCount: 1 })
    expect(second).toMatchObject({ resolveTypeCallCount: 1 })
    expect(callMethod).toHaveBeenCalledTimes(1)
  })

  test('refresh notifications invalidate dependency-aware RPC cache entries by response dependencies', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS'] = 'true'

    const listeners = new Map<string, (payload: unknown) => void>()
    let resolveTypeCallCount = 0
    const callMethod = vi.fn(
      async (method: string, params?: Record<string, unknown>) => {
        if (method === 'resolveTypeAtLocationWithDependencies') {
          const filePath = String(params?.filePath ?? '')
          return {
            filePath,
            resolveTypeCallCount: ++resolveTypeCallCount,
            dependencies: [filePath, '/project/src/b.ts'],
          }
        }

        if (method === 'getRefreshInvalidationsSince') {
          return { nextCursor: 0, fullRefresh: false }
        }

        throw new Error(`Unexpected method: ${method}`)
      }
    )

    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      return {
        callMethod,
        on: vi.fn((eventName: string, listener: (payload: unknown) => void) => {
          listeners.set(eventName, listener)
        }),
      }
    })

    const module = await import('./client.ts')
    const first = await module.resolveTypeAtLocationWithDependencies(
      '/project/src/a.ts',
      0,
      0 as never
    )
    const second = await module.resolveTypeAtLocationWithDependencies(
      '/project/src/a.ts',
      0,
      0 as never
    )

    expect(first).toMatchObject({ resolveTypeCallCount: 1 })
    expect(second).toMatchObject({ resolveTypeCallCount: 1 })
    expect(callMethod).toHaveBeenCalledTimes(1)

    const notificationListener = listeners.get('notification')
    expect(notificationListener).toBeTypeOf('function')
    notificationListener!({
      type: 'refresh',
      data: {
        refreshCursor: 1,
        filePaths: ['/project/src/b.ts'],
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    const third = await module.resolveTypeAtLocationWithDependencies(
      '/project/src/a.ts',
      0,
      0 as never
    )

    expect(third).toMatchObject({ resolveTypeCallCount: 2 })
    expect(callMethod).toHaveBeenCalledTimes(2)
    expect(mocks.invalidateRuntimeAnalysisCachePaths).toHaveBeenCalledWith([
      '/project/src/b.ts',
    ])
    expect(mocks.invalidateProjectCachesByPaths).toHaveBeenCalledWith([
      'project/src/b.ts',
    ])
  })

  test('refresh notifications prevent stale in-flight dependency-aware RPC results from being cached', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS'] = 'true'

    const listeners = new Map<string, (payload: unknown) => void>()
    let resolveTypeCallCount = 0
    let resolveFirst:
      | ((value: {
          filePath: string
          resolveTypeCallCount: number
          dependencies: string[]
        }) => void)
      | undefined
    const firstResponse = new Promise<{
      filePath: string
      resolveTypeCallCount: number
      dependencies: string[]
    }>((resolve) => {
      resolveFirst = resolve
    })

    const callMethod = vi.fn(
      async (method: string, params?: Record<string, unknown>) => {
        if (method === 'resolveTypeAtLocationWithDependencies') {
          const filePath = String(params?.filePath ?? '')
          const response = {
            filePath,
            resolveTypeCallCount: ++resolveTypeCallCount,
            dependencies: [filePath, '/project/src/b.ts'],
          }
          if (resolveTypeCallCount === 1) {
            return firstResponse
          }
          return response
        }

        if (method === 'getRefreshInvalidationsSince') {
          return { nextCursor: 0, fullRefresh: false }
        }

        throw new Error(`Unexpected method: ${method}`)
      }
    )

    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      return {
        callMethod,
        on: vi.fn((eventName: string, listener: (payload: unknown) => void) => {
          listeners.set(eventName, listener)
        }),
      }
    })

    const module = await import('./client.ts')
    const firstPending = module.resolveTypeAtLocationWithDependencies(
      '/project/src/a.ts',
      0,
      0 as never
    )

    const notificationListener = listeners.get('notification')
    expect(notificationListener).toBeTypeOf('function')
    notificationListener!({
      type: 'refresh',
      data: {
        refreshCursor: 1,
        filePaths: ['/project/src/b.ts'],
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    resolveFirst!({
      filePath: '/project/src/a.ts',
      resolveTypeCallCount: 1,
      dependencies: ['/project/src/a.ts', '/project/src/b.ts'],
    })

    const first = await firstPending
    const second = await module.resolveTypeAtLocationWithDependencies(
      '/project/src/a.ts',
      0,
      0 as never
    )

    expect(first).toMatchObject({ resolveTypeCallCount: 1 })
    expect(second).toMatchObject({ resolveTypeCallCount: 2 })
    expect(callMethod).toHaveBeenCalledTimes(2)
  })

  test('refresh notifications invalidate only matching dependency-aware RPC cache entries', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS'] = 'true'

    const listeners = new Map<string, (payload: unknown) => void>()
    const resolveTypeCallCountByFilePath = new Map<string, number>()
    const callMethod = vi.fn(
      async (method: string, params?: Record<string, unknown>) => {
        if (method === 'resolveTypeAtLocationWithDependencies') {
          const filePath = String(params?.filePath ?? '')
          const nextCallCount =
            (resolveTypeCallCountByFilePath.get(filePath) ?? 0) + 1
          resolveTypeCallCountByFilePath.set(filePath, nextCallCount)
          return { filePath, resolveTypeCallCount: nextCallCount }
        }

        if (method === 'getRefreshInvalidationsSince') {
          return { nextCursor: 0, fullRefresh: false }
        }

        throw new Error(`Unexpected method: ${method}`)
      }
    )

    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      return {
        callMethod,
        on: vi.fn((eventName: string, listener: (payload: unknown) => void) => {
          listeners.set(eventName, listener)
        }),
      }
    })

    const module = await import('./client.ts')
    const firstA = await module.resolveTypeAtLocationWithDependencies(
      '/project/src/a.ts',
      0,
      0 as never
    )
    const secondA = await module.resolveTypeAtLocationWithDependencies(
      '/project/src/a.ts',
      0,
      0 as never
    )
    const firstB = await module.resolveTypeAtLocationWithDependencies(
      '/project/src/b.ts',
      0,
      0 as never
    )

    expect(firstA).toMatchObject({ filePath: '/project/src/a.ts' })
    expect(secondA).toMatchObject({ resolveTypeCallCount: 1 })
    expect(firstB).toMatchObject({ filePath: '/project/src/b.ts' })
    expect(callMethod).toHaveBeenCalledTimes(2)

    const notificationListener = listeners.get('notification')
    expect(notificationListener).toBeTypeOf('function')
    notificationListener!({
      type: 'refresh',
      data: {
        refreshCursor: 1,
        filePaths: ['/project/src/a.ts'],
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    const thirdA = await module.resolveTypeAtLocationWithDependencies(
      '/project/src/a.ts',
      0,
      0 as never
    )
    const secondB = await module.resolveTypeAtLocationWithDependencies(
      '/project/src/b.ts',
      0,
      0 as never
    )

    expect(thirdA).toMatchObject({ resolveTypeCallCount: 2 })
    expect(secondB).toMatchObject({ resolveTypeCallCount: 1 })
    expect(callMethod).toHaveBeenCalledTimes(3)
    expect(mocks.invalidateRuntimeAnalysisCachePaths).toHaveBeenCalledWith([
      '/project/src/a.ts',
    ])
    expect(mocks.invalidateProjectCachesByPaths).toHaveBeenCalledWith([
      'project/src/a.ts',
    ])
  })

  test('refresh resync retries and falls back to conservative invalidation when exhausted', async () => {
    vi.useFakeTimers()
    try {
      process.env['RENOUN_SERVER_PORT'] = '4545'
      process.env['RENOUN_SERVER_ID'] = 'server-id'
      process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE'] = 'true'
      process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
      process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS'] = 'true'

      const listeners = new Map<string, (payload: unknown) => void>()
      const callMethod = vi.fn(
        async (method: string, params?: Record<string, unknown>) => {
          if (method === 'resolveTypeAtLocationWithDependencies') {
            return {
              filePath: String(params?.filePath ?? ''),
              resolveTypeCallCount: 1,
              dependencies: [String(params?.filePath ?? '')],
            }
          }

          if (method === 'getRefreshInvalidationsSince') {
            throw new Error('resync failed')
          }

          throw new Error(`Unexpected method: ${method}`)
        }
      )

      mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
        return {
          callMethod,
          on: vi.fn((eventName: string, listener: (payload: unknown) => void) => {
            listeners.set(eventName, listener)
          }),
        }
      })

      const module = await import('./client.ts')

      await module.resolveTypeAtLocationWithDependencies(
        '/project/src/a.ts',
        0,
        0 as never
      )

      const connectedListener = listeners.get('connected')
      expect(connectedListener).toBeTypeOf('function')

      // First connection marks the client as connected; second triggers resync.
      connectedListener!({})
      connectedListener!({})

      await vi.runAllTimersAsync()
      await Promise.resolve()
      await Promise.resolve()

      expect(callMethod).toHaveBeenCalledWith(
        'getRefreshInvalidationsSince',
        expect.objectContaining({ sinceCursor: 0 })
      )
      expect(
        callMethod.mock.calls.filter(([method]) => method === 'getRefreshInvalidationsSince')
      ).toHaveLength(3)
      expect(mocks.invalidateRuntimeAnalysisCachePaths).toHaveBeenCalledTimes(1)
      expect(
        mocks.invalidateRuntimeAnalysisCachePaths.mock.calls[0]?.[0]
      ).toEqual([resolve(process.cwd())])
      expect(mocks.invalidateProjectCachesByPaths).toHaveBeenCalledTimes(1)
      expect(mocks.invalidateProjectCachesByPaths.mock.calls[0]?.[0]).toEqual([
        resolve(process.cwd()).replace(/^\/+/, ''),
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  test('refresh resync fallback invalidates observed project roots outside cwd', async () => {
    vi.useFakeTimers()
    try {
      process.env['RENOUN_SERVER_PORT'] = '4545'
      process.env['RENOUN_SERVER_ID'] = 'server-id'
      process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE'] = 'true'
      process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
      process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS'] = 'true'

      const listeners = new Map<string, (payload: unknown) => void>()
      const callMethod = vi.fn(
        async (method: string, params?: Record<string, unknown>) => {
          if (method === 'resolveTypeAtLocationWithDependencies') {
            return {
              filePath: String(params?.filePath ?? ''),
              resolveTypeCallCount: 1,
              dependencies: [String(params?.filePath ?? '')],
            }
          }

          if (method === 'getRefreshInvalidationsSince') {
            throw new Error('resync failed')
          }

          throw new Error(`Unexpected method: ${method}`)
        }
      )

      mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
        return {
          callMethod,
          on: vi.fn((eventName: string, listener: (payload: unknown) => void) => {
            listeners.set(eventName, listener)
          }),
        }
      })

      const module = await import('./client.ts')
      const externalProjectRoot = resolve('/tmp/renoun-external-project')

      await module.resolveTypeAtLocationWithDependencies(
        `${externalProjectRoot}/src/a.ts`,
        0,
        0 as never,
        undefined,
        {
          tsConfigFilePath: `${externalProjectRoot}/tsconfig.json`,
        }
      )

      const connectedListener = listeners.get('connected')
      expect(connectedListener).toBeTypeOf('function')

      // First connection marks the client as connected; second triggers resync.
      connectedListener!({})
      connectedListener!({})

      await vi.runAllTimersAsync()
      await Promise.resolve()
      await Promise.resolve()

      expect(mocks.invalidateRuntimeAnalysisCachePaths).toHaveBeenCalledTimes(1)
      expect(
        mocks.invalidateRuntimeAnalysisCachePaths.mock.calls[0]?.[0]
      ).toEqual(expect.arrayContaining([externalProjectRoot]))
    } finally {
      vi.useRealTimers()
    }
  })
})
