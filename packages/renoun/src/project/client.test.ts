import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { captureProcessEnv, restoreProcessEnv } from '../utils/test.ts'

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
    invalidateSharedFileTextPrefixCachePath: vi.fn(),
    configureProjectCacheRuntime: vi.fn(),
    resetProjectCacheRuntimeConfiguration: vi.fn(),
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
  configureProjectCacheRuntime: mocks.configureProjectCacheRuntime,
  invalidateProjectFileCache: mocks.invalidateProjectFileCache,
  resetProjectCacheRuntimeConfiguration:
    mocks.resetProjectCacheRuntimeConfiguration,
}))

vi.mock('./file-text-prefix-cache.ts', () => ({
  invalidateSharedFileTextPrefixCachePath:
    mocks.invalidateSharedFileTextPrefixCachePath,
}))

describe('project client transport guards', () => {
  const originalEnvironment = captureProcessEnv([
    'RENOUN_SERVER_PORT',
    'RENOUN_SERVER_HOST',
    'RENOUN_SERVER_ID',
    'RENOUN_SERVER_REFRESH_NOTIFICATIONS',
    'RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE',
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
    mocks.invalidateRuntimeAnalysisCachePath.mockClear()
    mocks.invalidateProjectCachesByPaths.mockClear()
    mocks.invalidateSharedFileTextPrefixCachePath.mockClear()
    mocks.configureProjectCacheRuntime.mockClear()
    mocks.resetProjectCacheRuntimeConfiguration.mockClear()
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

  test('disables client RPC cache by default when server refresh notifications are disabled', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'
    delete process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE']
    delete process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS']

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
        ready: vi.fn(async () => undefined),
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
    expect(second).toMatchObject({ resolveTypeCallCount: 2 })
    expect(callMethod).toHaveBeenCalledTimes(2)
  })

  test('disables client RPC cache when refresh notifications are effectively unavailable', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    delete process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS']
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE'] = '0'
    delete process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE']
    delete process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS']

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
        ready: vi.fn(async () => undefined),
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
    expect(second).toMatchObject({ resolveTypeCallCount: 2 })
    expect(callMethod).toHaveBeenCalledTimes(2)
  })

  test('resolveTypeAtLocation preserves the legacy public API shape', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE'] = '0'

    const resolvedType = { kind: 'mock-type' }
    const callMethod = vi.fn(async (method: string) => {
      if (method === 'resolveTypeAtLocationWithDependencies') {
        return {
          resolvedType,
          dependencies: ['/project/src/a.ts'],
        }
      }

      throw new Error(`Unexpected method: ${method}`)
    })

    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      return {
        callMethod,
        ready: vi.fn(async () => undefined),
      }
    })

    const module = await import('./client.ts')
    const result = await module.resolveTypeAtLocation(
      '/project/src/a.ts',
      0,
      0 as never
    )

    expect(result).toEqual(resolvedType)
    expect(callMethod).toHaveBeenCalledWith(
      'resolveTypeAtLocationWithDependencies',
      expect.objectContaining({
        filePath: '/project/src/a.ts',
        position: 0,
      })
    )
  })

  test('avoids requiring process.cwd for client RPC calls', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE'] = '0'

    const callMethod = vi.fn(
      async (method: string, params?: Record<string, unknown>) => {
        if (method === 'resolveTypeAtLocationWithDependencies') {
          return {
            resolvedType: { kind: 'mock-type' },
            dependencies: [String(params?.filePath ?? '')],
          }
        }

        throw new Error(`Unexpected method: ${method}`)
      }
    )

    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      return {
        callMethod,
        ready: vi.fn(async () => undefined),
      }
    })

    vi.stubGlobal(
      'process',
      {
        env: { ...process.env },
      } as unknown as NodeJS.Process
    )

    try {
      const module = await import('./client.ts')
      const result = await module.resolveTypeAtLocationWithDependencies(
        '/project/src/a.ts',
        0,
        0 as never
      )

      expect(result).toEqual({
        resolvedType: { kind: 'mock-type' },
        dependencies: ['/project/src/a.ts'],
      })
      expect(callMethod).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('subscribes to refresh notifications when they are enabled after the client already exists', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE'] = '0'

    const listeners = new Map<string, (payload: unknown) => void>()
    const on = vi.fn((eventName: string, listener: (payload: unknown) => void) => {
      listeners.set(eventName, listener)
    })
    const callMethod = vi.fn(async (method: string) => {
      if (method === 'getOutlineRanges') {
        return []
      }

      if (method === 'getRefreshInvalidationsSince') {
        return {
          nextCursor: 0,
          fullRefresh: false,
        }
      }

      throw new Error(`Unexpected method: ${method}`)
    })

    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      return {
        callMethod,
        ready: vi.fn(async () => undefined),
        on,
      }
    })

    const module = await import('./client.ts')

    await module.getOutlineRanges('/project/src/a.ts')
    expect(on).not.toHaveBeenCalled()

    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '1'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE'] = '1'

    await module.getOutlineRanges('/project/src/a.ts')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(on).toHaveBeenCalledTimes(2)
    expect(listeners.get('connected')).toBeTypeOf('function')
    expect(listeners.get('notification')).toBeTypeOf('function')
    expect(callMethod).toHaveBeenCalledWith('getRefreshInvalidationsSince', {
      sinceCursor: 0,
    })
  })

  test('recreates the websocket client when the active server runtime changes', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '1'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE'] = '1'

    const firstCallMethod = vi.fn(async (method: string) => {
      if (method === 'getOutlineRanges') {
        return ['first-client']
      }

      throw new Error(`Unexpected method: ${method}`)
    })
    const secondCallMethod = vi.fn(async (method: string) => {
      if (method === 'getOutlineRanges') {
        return ['second-client']
      }

      if (method === 'getRefreshInvalidationsSince') {
        return {
          nextCursor: 0,
          fullRefresh: false,
        }
      }

      throw new Error(`Unexpected method: ${method}`)
    })
    const firstClose = vi.fn()
    const secondClose = vi.fn()
    const firstRemoveAllListeners = vi.fn()
    const secondRemoveAllListeners = vi.fn()
    const firstOn = vi.fn()
    const secondOn = vi.fn()
    const clientInstances = [
      {
        callMethod: firstCallMethod,
        ready: vi.fn(async () => undefined),
        on: firstOn,
        close: firstClose,
        removeAllListeners: firstRemoveAllListeners,
      },
      {
        callMethod: secondCallMethod,
        ready: vi.fn(async () => undefined),
        on: secondOn,
        close: secondClose,
        removeAllListeners: secondRemoveAllListeners,
      },
    ]

    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      const nextClient = clientInstances.shift()
      if (!nextClient) {
        throw new Error('[renoun] Unexpected extra WebSocketClient creation')
      }

      return nextClient
    })

    const module = await import('./client.ts')
    const runtimeEnvModule = await import('./runtime-env.ts')

    const firstResult = await module.getOutlineRanges('/project/src/a.ts')
    expect(firstResult).toEqual(['first-client'])
    expect(mocks.WebSocketClient).toHaveBeenCalledTimes(1)

    process.env['RENOUN_SERVER_PORT'] = '5454'
    runtimeEnvModule.notifyServerRuntimeEnvChanged()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.WebSocketClient).toHaveBeenCalledTimes(2)
    expect(firstRemoveAllListeners).toHaveBeenCalledTimes(1)
    expect(firstClose).toHaveBeenCalledTimes(1)
    expect(secondCallMethod).toHaveBeenCalledWith('getRefreshInvalidationsSince', {
      sinceCursor: 0,
    })

    const secondResult = await module.getOutlineRanges('/project/src/a.ts')
    expect(secondResult).toEqual(['second-client'])
    expect(
      secondCallMethod.mock.calls.filter(([method]) => method === 'getOutlineRanges')
    ).toHaveLength(1)
    expect(secondOn).toHaveBeenCalledTimes(2)
    expect(secondClose).not.toHaveBeenCalled()
    expect(secondRemoveAllListeners).not.toHaveBeenCalled()
  })

  test('falls back to local analysis after the active server runtime is cleared', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'

    const callMethod = vi.fn(async (method: string) => {
      if (method === 'getSourceTextMetadata') {
        return {
          value: 'remote-result',
          language: 'txt',
        }
      }

      throw new Error(`Unexpected method: ${method}`)
    })
    const close = vi.fn()
    const removeAllListeners = vi.fn()

    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      return {
        callMethod,
        ready: vi.fn(async () => undefined),
        on: vi.fn(),
        close,
        removeAllListeners,
      }
    })

    const module = await import('./client.ts')
    const runtimeEnvModule = await import('./runtime-env.ts')

    const firstResult = await module.getSourceTextMetadata({
      value: 'const answer = 42',
      language: 'txt',
    })
    expect(firstResult).toEqual({
      value: 'remote-result',
      language: 'txt',
    })

    delete process.env['RENOUN_SERVER_PORT']
    runtimeEnvModule.notifyServerRuntimeEnvChanged()

    const secondResult = await module.getSourceTextMetadata({
      value: 'const answer = 42',
      language: 'txt',
    })
    expect(secondResult).toEqual({
      value: 'local-result',
      language: 'txt',
    })
    expect(close).toHaveBeenCalledTimes(1)
    expect(removeAllListeners).toHaveBeenCalledTimes(1)
    expect(callMethod).toHaveBeenCalledTimes(1)
    expect(mocks.getCachedSourceTextMetadata).toHaveBeenCalledTimes(1)
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
        ready: vi.fn(async () => undefined),
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
    expect(mocks.invalidateProjectCachesByPaths).toHaveBeenCalledWith([
      '/project/src/b.ts',
    ])
    expect(mocks.invalidateRuntimeAnalysisCachePath).toHaveBeenCalledWith(
      '/project/src/b.ts'
    )
    expect(mocks.invalidateSharedFileTextPrefixCachePath).toHaveBeenCalledWith(
      '/project/src/b.ts'
    )
  })

  test('does not cache getFileExportText results when includeDependencies is enabled', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS'] = 'false'

    let getFileExportTextCallCount = 0
    const callMethod = vi.fn(async (method: string) => {
      if (method === 'getFileExportText') {
        getFileExportTextCallCount += 1
        return `export-text-${getFileExportTextCallCount}`
      }

      throw new Error(`Unexpected method: ${method}`)
    })

    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      return {
        callMethod,
        ready: vi.fn(async () => undefined),
      }
    })

    const module = await import('./client.ts')
    const projectOptions = {
      tsConfigFilePath: '/project/tsconfig.json',
    }
    const first = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true,
      projectOptions
    )
    const second = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true,
      projectOptions
    )

    expect(first).toBe('export-text-1')
    expect(second).toBe('export-text-2')
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getFileExportText')
    ).toHaveLength(2)
  })

  test('caches getFileExportText with includeDependencies when refresh notifications are enabled', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS'] = 'true'

    const listeners = new Map<string, (payload: unknown) => void>()
    let getFileExportTextCallCount = 0
    const callMethod = vi.fn(
      async (method: string, params?: Record<string, unknown>) => {
        if (method === 'getFileExportText') {
          getFileExportTextCallCount += 1
          return {
            text: `export-text-${getFileExportTextCallCount}`,
            dependencies: [
              String(params?.filePath ?? ''),
              '/project/src/dep.ts',
            ],
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
        ready: vi.fn(async () => undefined),
        on: vi.fn((eventName: string, listener: (payload: unknown) => void) => {
          listeners.set(eventName, listener)
        }),
      }
    })

    const module = await import('./client.ts')
    const projectOptions = {
      tsConfigFilePath: '/project/tsconfig.json',
    }
    const first = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true,
      projectOptions
    )
    const second = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true,
      projectOptions
    )

    expect(first).toBe('export-text-1')
    expect(second).toBe('export-text-1')
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getFileExportText')
    ).toHaveLength(1)

    const notificationListener = listeners.get('notification')
    expect(notificationListener).toBeTypeOf('function')
    notificationListener!({
      type: 'refresh',
      data: {
        refreshCursor: 1,
        filePaths: ['/project/src/dep.ts'],
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    const third = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true,
      projectOptions
    )

    expect(third).toBe('export-text-2')
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getFileExportText')
    ).toHaveLength(2)
  })

  test('refresh notifications invalidate only matching includeDependencies export text cache entries', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS'] = 'true'

    const listeners = new Map<string, (payload: unknown) => void>()
    const getFileExportTextCallCountByFilePath = new Map<string, number>()
    const callMethod = vi.fn(
      async (method: string, params?: Record<string, unknown>) => {
        if (method === 'getFileExportText') {
          const filePath = String(params?.filePath ?? '')
          const nextCallCount =
            (getFileExportTextCallCountByFilePath.get(filePath) ?? 0) + 1
          getFileExportTextCallCountByFilePath.set(filePath, nextCallCount)
          return {
            text: `${filePath}::export-text-${nextCallCount}`,
            dependencies: [filePath, `${filePath}.dep.ts`],
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
        ready: vi.fn(async () => undefined),
        on: vi.fn((eventName: string, listener: (payload: unknown) => void) => {
          listeners.set(eventName, listener)
        }),
      }
    })

    const module = await import('./client.ts')
    const projectOptions = {
      tsConfigFilePath: '/project/tsconfig.json',
    }
    const firstA = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true,
      projectOptions
    )
    const secondA = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true,
      projectOptions
    )
    const firstB = await module.getFileExportText(
      '/project/src/b.ts',
      0,
      0 as never,
      true,
      projectOptions
    )

    expect(firstA).toBe('/project/src/a.ts::export-text-1')
    expect(secondA).toBe('/project/src/a.ts::export-text-1')
    expect(firstB).toBe('/project/src/b.ts::export-text-1')
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getFileExportText')
    ).toHaveLength(2)

    const notificationListener = listeners.get('notification')
    expect(notificationListener).toBeTypeOf('function')
    notificationListener!({
      type: 'refresh',
      data: {
        refreshCursor: 1,
        filePaths: ['/project/src/a.ts.dep.ts'],
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    const thirdA = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true,
      projectOptions
    )
    const secondB = await module.getFileExportText(
      '/project/src/b.ts',
      0,
      0 as never,
      true,
      projectOptions
    )

    expect(thirdA).toBe('/project/src/a.ts::export-text-2')
    expect(secondB).toBe('/project/src/b.ts::export-text-1')
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getFileExportText')
    ).toHaveLength(3)
  })

  test('caches getFileExportText results when includeDependencies is disabled', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS'] = 'false'

    let getFileExportTextCallCount = 0
    const callMethod = vi.fn(async (method: string) => {
      if (method === 'getFileExportText') {
        getFileExportTextCallCount += 1
        return `export-text-${getFileExportTextCallCount}`
      }

      throw new Error(`Unexpected method: ${method}`)
    })

    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      return {
        callMethod,
        ready: vi.fn(async () => undefined),
      }
    })

    const module = await import('./client.ts')
    const projectOptions = {
      tsConfigFilePath: '/project/tsconfig.json',
    }
    const first = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      false,
      projectOptions
    )
    const second = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      false,
      projectOptions
    )

    expect(first).toBe('export-text-1')
    expect(second).toBe('export-text-1')
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getFileExportText')
    ).toHaveLength(1)
  })

  test('refresh notifications invalidate transpileSourceFile cache conservatively', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS'] = 'true'

    const listeners = new Map<string, (payload: unknown) => void>()
    let transpileCallCount = 0
    const callMethod = vi.fn(async (method: string) => {
      if (method === 'transpileSourceFile') {
        transpileCallCount += 1
        return `transpiled-${transpileCallCount}`
      }

      if (method === 'getRefreshInvalidationsSince') {
        return { nextCursor: 0, fullRefresh: false }
      }

      throw new Error(`Unexpected method: ${method}`)
    })

    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      return {
        callMethod,
        ready: vi.fn(async () => undefined),
        on: vi.fn((eventName: string, listener: (payload: unknown) => void) => {
          listeners.set(eventName, listener)
        }),
      }
    })

    const module = await import('./client.ts')
    const projectOptions = {
      tsConfigFilePath: '/project/tsconfig.json',
    }
    const first = await module.transpileSourceFile(
      '/project/src/a.ts',
      projectOptions
    )
    const second = await module.transpileSourceFile(
      '/project/src/a.ts',
      projectOptions
    )

    expect(first).toBe('transpiled-1')
    expect(second).toBe('transpiled-1')
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'transpileSourceFile')
    ).toHaveLength(1)

    const notificationListener = listeners.get('notification')
    expect(notificationListener).toBeTypeOf('function')
    notificationListener!({
      type: 'refresh',
      data: {
        refreshCursor: 1,
        filePaths: ['/project/src/dep.ts'],
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    const third = await module.transpileSourceFile(
      '/project/src/a.ts',
      projectOptions
    )

    expect(third).toBe('transpiled-2')
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'transpileSourceFile')
    ).toHaveLength(2)
  })

  test('refresh notifications invalidate quick-info cache conservatively', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS'] = 'true'

    const listeners = new Map<string, (payload: unknown) => void>()
    let quickInfoCallCount = 0
    const callMethod = vi.fn(async (method: string) => {
      if (method === 'getQuickInfoAtPosition') {
        quickInfoCallCount += 1
        return { text: `quick-info-${quickInfoCallCount}` }
      }

      if (method === 'getRefreshInvalidationsSince') {
        return { nextCursor: 0, fullRefresh: false }
      }

      throw new Error(`Unexpected method: ${method}`)
    })

    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      return {
        callMethod,
        ready: vi.fn(async () => undefined),
        on: vi.fn((eventName: string, listener: (payload: unknown) => void) => {
          listeners.set(eventName, listener)
        }),
      }
    })

    const module = await import('./client.ts')
    const projectOptions = {
      tsConfigFilePath: '/project/tsconfig.json',
    }
    const first = await module.getQuickInfoAtPosition(
      '/project/src/a.ts',
      0,
      projectOptions
    )
    const second = await module.getQuickInfoAtPosition(
      '/project/src/a.ts',
      0,
      projectOptions
    )

    expect(first).toMatchObject({ text: 'quick-info-1' })
    expect(second).toMatchObject({ text: 'quick-info-1' })
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getQuickInfoAtPosition')
    ).toHaveLength(1)

    const notificationListener = listeners.get('notification')
    expect(notificationListener).toBeTypeOf('function')
    notificationListener!({
      type: 'refresh',
      data: {
        refreshCursor: 1,
        filePaths: ['/project/src/dep.ts'],
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    const third = await module.getQuickInfoAtPosition(
      '/project/src/a.ts',
      0,
      projectOptions
    )

    expect(third).toMatchObject({ text: 'quick-info-2' })
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getQuickInfoAtPosition')
    ).toHaveLength(2)
  })

  test('refresh notifications invalidate source metadata cache conservatively', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS'] = 'true'

    const listeners = new Map<string, (payload: unknown) => void>()
    let sourceMetadataCallCount = 0
    const callMethod = vi.fn(async (method: string) => {
      if (method === 'getSourceTextMetadata') {
        sourceMetadataCallCount += 1
        return {
          value: `remote-result-${sourceMetadataCallCount}`,
          language: 'tsx',
        }
      }

      if (method === 'getRefreshInvalidationsSince') {
        return { nextCursor: 0, fullRefresh: false }
      }

      throw new Error(`Unexpected method: ${method}`)
    })

    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      return {
        callMethod,
        ready: vi.fn(async () => undefined),
        on: vi.fn((eventName: string, listener: (payload: unknown) => void) => {
          listeners.set(eventName, listener)
        }),
      }
    })

    const module = await import('./client.ts')
    const request = {
      value: '<Button />',
      language: 'tsx' as const,
      projectOptions: {
        tsConfigFilePath: '/project/tsconfig.json',
      },
    }
    const first = await module.getSourceTextMetadata(request)
    const second = await module.getSourceTextMetadata(request)

    expect(first).toEqual({
      value: 'remote-result-1',
      language: 'tsx',
    })
    expect(second).toEqual({
      value: 'remote-result-1',
      language: 'tsx',
    })
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getSourceTextMetadata')
    ).toHaveLength(1)

    const notificationListener = listeners.get('notification')
    expect(notificationListener).toBeTypeOf('function')
    notificationListener!({
      type: 'refresh',
      data: {
        refreshCursor: 1,
        filePaths: ['/project/src/dep.ts'],
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    const third = await module.getSourceTextMetadata(request)

    expect(third).toEqual({
      value: 'remote-result-2',
      language: 'tsx',
    })
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getSourceTextMetadata')
    ).toHaveLength(2)
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
        ready: vi.fn(async () => undefined),
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
        ready: vi.fn(async () => undefined),
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
      '/project/src/b.ts',
    ])
  })

  test('refresh notifications invalidate export RPC cache entries by response dependencies', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_PROJECT_REFRESH_NOTIFICATIONS'] = 'true'

    const listeners = new Map<string, (payload: unknown) => void>()
    const callCountByMethod = new Map<string, number>()
    const nextCallCount = (method: string) => {
      const nextCount = (callCountByMethod.get(method) ?? 0) + 1
      callCountByMethod.set(method, nextCount)
      return nextCount
    }
    const callMethod = vi.fn(
      async (method: string, params?: Record<string, unknown>) => {
        if (method === 'getFileExports') {
          const callCount = nextCallCount(method)
          return {
            __renounClientRpcDependencies: true,
            value: [
              {
                name: `export-${callCount}`,
                path: String(params?.filePath ?? ''),
                position: callCount,
                kind: 0,
              },
            ],
            dependencies: [String(params?.filePath ?? ''), '/project/src/dep.ts'],
          }
        }

        if (method === 'getFileExportMetadata') {
          const callCount = nextCallCount(method)
          return {
            __renounClientRpcDependencies: true,
            value: {
              name: `metadata-${callCount}`,
              environment: 'isomorphic',
              jsDocMetadata: undefined,
              location: {
                filePath: String(params?.filePath ?? ''),
                position: {
                  start: { line: 1, column: 1 },
                  end: { line: 1, column: 1 },
                },
              },
            },
            dependencies: [String(params?.filePath ?? ''), '/project/src/dep.ts'],
          }
        }

        if (method === 'getFileExportStaticValue') {
          const callCount = nextCallCount(method)
          return {
            __renounClientRpcDependencies: true,
            value: `static-${callCount}`,
            dependencies: [String(params?.filePath ?? ''), '/project/src/dep.ts'],
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
        ready: vi.fn(async () => undefined),
        on: vi.fn((eventName: string, listener: (payload: unknown) => void) => {
          listeners.set(eventName, listener)
        }),
      }
    })

    const module = await import('./client.ts')
    const firstExports = await module.getFileExports('/project/src/a.ts')
    const secondExports = await module.getFileExports('/project/src/a.ts')
    const firstMetadata = await module.getFileExportMetadata(
      'value',
      '/project/src/a.ts',
      0,
      0 as never
    )
    const secondMetadata = await module.getFileExportMetadata(
      'value',
      '/project/src/a.ts',
      0,
      0 as never
    )
    const firstStatic = await module.getFileExportStaticValue(
      '/project/src/a.ts',
      0,
      0 as never
    )
    const secondStatic = await module.getFileExportStaticValue(
      '/project/src/a.ts',
      0,
      0 as never
    )

    expect(firstExports[0]?.name).toBe('export-1')
    expect(secondExports[0]?.name).toBe('export-1')
    expect(firstMetadata?.name).toBe('metadata-1')
    expect(secondMetadata?.name).toBe('metadata-1')
    expect(firstStatic).toBe('static-1')
    expect(secondStatic).toBe('static-1')
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getFileExports')
    ).toHaveLength(1)
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getFileExportMetadata')
    ).toHaveLength(1)
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getFileExportStaticValue')
    ).toHaveLength(1)

    const notificationListener = listeners.get('notification')
    expect(notificationListener).toBeTypeOf('function')
    notificationListener!({
      type: 'refresh',
      data: {
        refreshCursor: 1,
        filePaths: ['/project/src/dep.ts'],
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    const thirdExports = await module.getFileExports('/project/src/a.ts')
    const thirdMetadata = await module.getFileExportMetadata(
      'value',
      '/project/src/a.ts',
      0,
      0 as never
    )
    const thirdStatic = await module.getFileExportStaticValue(
      '/project/src/a.ts',
      0,
      0 as never
    )

    expect(thirdExports[0]?.name).toBe('export-2')
    expect(thirdMetadata?.name).toBe('metadata-2')
    expect(thirdStatic).toBe('static-2')
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getFileExports')
    ).toHaveLength(2)
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getFileExportMetadata')
    ).toHaveLength(2)
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getFileExportStaticValue')
    ).toHaveLength(2)
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
    let resolveFirstRequestStarted: (() => void) | undefined
    const firstRequestStarted = new Promise<void>((resolve) => {
      resolveFirstRequestStarted = resolve
    })
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
            resolveFirstRequestStarted?.()
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
        ready: vi.fn(async () => undefined),
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
    await firstRequestStarted

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
        ready: vi.fn(async () => undefined),
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
      '/project/src/a.ts',
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
          ready: vi.fn(async () => undefined),
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
        resolve(process.cwd()),
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
          ready: vi.fn(async () => undefined),
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
