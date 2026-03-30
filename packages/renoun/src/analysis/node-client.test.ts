import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { captureProcessEnv, restoreProcessEnv } from '../utils/test.ts'

const mocks = vi.hoisted(() => {
  return {
    WebSocketClient: vi.fn(),
    getProgram: vi.fn(() => ({ mockedProject: true })),
    invalidateProgramCachesByPaths: vi.fn(() => 0),
    getCachedSourceTextMetadata: vi.fn(async () => ({
      value: 'local-result',
      language: 'txt',
    })),
    getQuickInfoAtPositionBase: vi.fn(),
    getCachedFileExportText: vi.fn(),
    getCachedFileExportMetadata: vi.fn(),
    getCachedFileExportStaticValue: vi.fn(),
    getCachedFileExports: vi.fn(),
    getCachedReferenceBaseArtifact: vi.fn(),
    getCachedOutlineRanges: vi.fn(),
    getCachedTokens: vi.fn(),
    invalidateRuntimeAnalysisCachePath: vi.fn(),
    invalidateRuntimeAnalysisCachePaths: vi.fn(),
    resolveCachedTypeAtLocationWithDependencies: vi.fn(),
    transpileCachedSourceFile: vi.fn(),
    invalidateProgramFileCache: vi.fn(),
    invalidateSharedFileTextPrefixCachePath: vi.fn(),
    createHighlighter: vi.fn(),
    configureAnalysisCacheRuntime: vi.fn(),
    resetAnalysisCacheRuntimeConfiguration: vi.fn(),
  }
})

vi.mock('./rpc/client.ts', () => ({
  WebSocketClient: mocks.WebSocketClient,
}))

vi.mock('./get-program.ts', () => ({
  getProgram: mocks.getProgram,
  invalidateProgramCachesByPaths: mocks.invalidateProgramCachesByPaths,
}))

vi.mock('./cached-analysis.ts', () => ({
  getCachedFileExportText: mocks.getCachedFileExportText,
  getCachedFileExportMetadata: mocks.getCachedFileExportMetadata,
  getCachedFileExportStaticValue: mocks.getCachedFileExportStaticValue,
  getCachedFileExports: mocks.getCachedFileExports,
  getCachedReferenceBaseArtifact: mocks.getCachedReferenceBaseArtifact,
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
  configureAnalysisCacheRuntime: mocks.configureAnalysisCacheRuntime,
  invalidateProgramFileCache: mocks.invalidateProgramFileCache,
  resetAnalysisCacheRuntimeConfiguration:
    mocks.resetAnalysisCacheRuntimeConfiguration,
}))

vi.mock('./file-text-prefix-cache.ts', () => ({
  invalidateSharedFileTextPrefixCachePath:
    mocks.invalidateSharedFileTextPrefixCachePath,
}))

vi.mock('./client.server.ts', () => ({
  configureAnalysisCacheRuntime: mocks.configureAnalysisCacheRuntime,
  createHighlighter: mocks.createHighlighter,
  getCachedFileExportMetadata: mocks.getCachedFileExportMetadata,
  getCachedFileExportStaticValue: mocks.getCachedFileExportStaticValue,
  getCachedFileExportText: mocks.getCachedFileExportText,
  getCachedFileExports: mocks.getCachedFileExports,
  getCachedReferenceBaseArtifact: mocks.getCachedReferenceBaseArtifact,
  getCachedOutlineRanges: mocks.getCachedOutlineRanges,
  getCachedSourceTextMetadata: mocks.getCachedSourceTextMetadata,
  getCachedTokens: mocks.getCachedTokens,
  getProgram: mocks.getProgram,
  getQuickInfoAtPositionBase: mocks.getQuickInfoAtPositionBase,
  invalidateProgramCachesByPaths: mocks.invalidateProgramCachesByPaths,
  invalidateProgramFileCache: mocks.invalidateProgramFileCache,
  invalidateRuntimeAnalysisCachePath: mocks.invalidateRuntimeAnalysisCachePath,
  invalidateRuntimeAnalysisCachePaths:
    mocks.invalidateRuntimeAnalysisCachePaths,
  invalidateSharedFileTextPrefixCachePath:
    mocks.invalidateSharedFileTextPrefixCachePath,
  resetAnalysisCacheRuntimeConfiguration:
    mocks.resetAnalysisCacheRuntimeConfiguration,
  resolveCachedTypeAtLocationWithDependencies:
    mocks.resolveCachedTypeAtLocationWithDependencies,
  transpileCachedSourceFile: mocks.transpileCachedSourceFile,
}))

describe('analysis node client transport guards', () => {
  const originalEnvironment = captureProcessEnv([
    'NODE_ENV',
    'RENOUN_SERVER_PORT',
    'RENOUN_SERVER_HOST',
    'RENOUN_SERVER_ID',
    'RENOUN_SERVER_CLIENT_RPC_CACHE',
    'RENOUN_SERVER_CLIENT_RPC_CACHE_TTL_MS',
    'RENOUN_SERVER_CLIENT_REFRESH_NOTIFICATIONS',
    'RENOUN_SERVER_REFRESH_NOTIFICATIONS',
    'RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE',
    'RENOUN_ANALYSIS_CLIENT_RPC_CACHE',
    'RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS',
    'RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS',
  ])

  beforeEach(() => {
    vi.resetModules()
    mocks.WebSocketClient.mockClear()
    mocks.getProgram.mockClear()
    mocks.getCachedSourceTextMetadata.mockClear()
    mocks.getQuickInfoAtPositionBase.mockClear()
    mocks.invalidateRuntimeAnalysisCachePaths.mockClear()
    mocks.invalidateRuntimeAnalysisCachePath.mockClear()
    mocks.invalidateProgramCachesByPaths.mockClear()
    mocks.invalidateProgramFileCache.mockClear()
    mocks.getCachedReferenceBaseArtifact.mockClear()
    mocks.invalidateSharedFileTextPrefixCachePath.mockClear()
    mocks.createHighlighter.mockClear()
    mocks.configureAnalysisCacheRuntime.mockClear()
    mocks.resetAnalysisCacheRuntimeConfiguration.mockClear()
  })

  afterEach(() => {
    restoreProcessEnv(originalEnvironment)
  })

  test('falls back to local analysis when server id is missing', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    delete process.env['RENOUN_SERVER_ID']

    const module = await import('./node-client.ts')
    const result = await module.getSourceTextMetadata({
      value: 'const answer = 42',
      language: 'txt',
    })

    expect(mocks.WebSocketClient).not.toHaveBeenCalled()
    expect(mocks.getProgram).toHaveBeenCalledTimes(1)
    expect(mocks.getCachedSourceTextMetadata).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      value: 'local-result',
      language: 'txt',
    })
  })

  test('uses the shared reference base artifact for local file exports fallback', async () => {
    delete process.env['RENOUN_SERVER_PORT']
    delete process.env['RENOUN_SERVER_ID']

    mocks.getCachedReferenceBaseArtifact.mockResolvedValue({
      exportMetadata: [
        {
          name: 'answer',
          path: '/project/src/a.ts',
          position: 1,
          kind: 0,
        },
      ],
      gitMetadataByName: {},
      fileGitMetadata: {
        authors: [],
      },
    })

    const module = await import('./node-client.ts')
    const exports = await module.getFileExports('/project/src/a.ts')

    expect(mocks.getProgram).toHaveBeenCalledTimes(1)
    expect(mocks.getCachedReferenceBaseArtifact).toHaveBeenCalledWith(
      expect.anything(),
      {
        filePath: '/project/src/a.ts',
        stripInternal: false,
      }
    )
    expect(mocks.getCachedFileExports).not.toHaveBeenCalled()
    expect(exports).toEqual([
      {
        name: 'answer',
        path: '/project/src/a.ts',
        position: 1,
        kind: 0,
      },
    ])
  })

  test('retries loading server modules after a preload failure', async () => {
    const module = await import('./node-client.ts')
    const transientError = new Error('transient preload failure')

    mocks.configureAnalysisCacheRuntime
      .mockImplementationOnce(() => {
        throw transientError
      })
      .mockImplementation(() => undefined)

    module.configureAnalysisClientRuntime({
      analysisCacheMaxEntries: 32,
    })

    await expect(
      module.getSourceTextMetadata({
        value: 'const answer = 42',
        language: 'txt',
      })
    ).rejects.toThrow(transientError)

    const result = await module.getSourceTextMetadata({
      value: 'const answer = 42',
      language: 'txt',
    })

    expect(mocks.configureAnalysisCacheRuntime).toHaveBeenCalledTimes(2)
    expect(mocks.getProgram).toHaveBeenCalledTimes(1)
    expect(mocks.getCachedSourceTextMetadata).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      value: 'local-result',
      language: 'txt',
    })
  })

  test('does not preload local analysis modules for RPC-only calls', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE'] = '0'

    const callMethod = vi.fn(async (method: string) => {
      if (method === 'getSourceTextMetadata') {
        return {
          value: 'remote-result',
          language: 'txt',
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

    const module = await import('./node-client.ts')
    module.configureAnalysisClientRuntime({
      analysisCacheMaxEntries: 32,
    })
    const result = await module.getSourceTextMetadata({
      value: 'const answer = 42',
      language: 'txt',
    })

    expect(result).toEqual({
      value: 'remote-result',
      language: 'txt',
    })
    expect(callMethod).toHaveBeenCalledTimes(1)
    expect(mocks.configureAnalysisCacheRuntime).not.toHaveBeenCalled()
    expect(mocks.getProgram).not.toHaveBeenCalled()
  })

  test('disables client RPC cache by default when server refresh notifications are disabled', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'
    delete process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE']
    delete process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS']

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

    const module = await import('./node-client.ts')
    module.configureAnalysisClientRuntime({
      analysisCacheMaxEntries: 32,
    })
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
    delete process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE']
    delete process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS']

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

    const module = await import('./node-client.ts')
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

    const module = await import('./node-client.ts')
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
      const module = await import('./node-client.ts')
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

    const module = await import('./node-client.ts')

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
    process.env['RENOUN_SERVER_HOST'] = '127.0.0.1'
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

    const module = await import('./node-client.ts')
    const runtimeEnvModule = await import('./runtime-env.ts')

    const firstResult = await module.getOutlineRanges('/project/src/a.ts')
    expect(firstResult).toEqual(['first-client'])
    expect(mocks.WebSocketClient).toHaveBeenCalledTimes(1)
    expect(mocks.WebSocketClient).toHaveBeenNthCalledWith(1, 'server-id', {
      id: 'server-id',
      port: '4545',
      host: '127.0.0.1',
      emitRefreshNotifications: true,
    })

    process.env['RENOUN_SERVER_PORT'] = '5454'
    process.env['RENOUN_SERVER_HOST'] = 'localhost'
    runtimeEnvModule.notifyServerRuntimeEnvChanged()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.WebSocketClient).toHaveBeenCalledTimes(2)
    expect(mocks.WebSocketClient).toHaveBeenNthCalledWith(2, 'server-id', {
      id: 'server-id',
      port: '5454',
      host: 'localhost',
      emitRefreshNotifications: true,
    })
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

    const module = await import('./node-client.ts')
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

  test('does not load local analysis modules when source updates only need RPC invalidation', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'false'

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

    const module = await import('./node-client.ts')
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
    expect(mocks.configureAnalysisCacheRuntime).not.toHaveBeenCalled()
    expect(mocks.invalidateProgramCachesByPaths).not.toHaveBeenCalled()
    expect(mocks.invalidateRuntimeAnalysisCachePath).not.toHaveBeenCalled()
    expect(
      mocks.invalidateSharedFileTextPrefixCachePath
    ).not.toHaveBeenCalled()
  })

  test('invalidates dependency-aware RPC cache entries after source updates', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'false'

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

    const module = await import('./node-client.ts')
    module.configureAnalysisClientRuntime({
      analysisCacheMaxEntries: 32,
    })
    await preloadLocalAnalysisRuntime(module)
    const project = {
      createSourceFile: vi.fn(),
    }
    mocks.getProgram.mockReturnValue(project as never)
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
    expect(project.createSourceFile).toHaveBeenCalledWith(
      '/project/src/b.ts',
      'export const b = 2',
      { overwrite: true }
    )
    expect(mocks.invalidateProgramFileCache).toHaveBeenCalledWith(
      project,
      '/project/src/b.ts'
    )
    expect(mocks.invalidateProgramCachesByPaths).toHaveBeenCalledWith([
      '/project/src/b.ts',
    ])
    expect(mocks.invalidateRuntimeAnalysisCachePath).toHaveBeenCalledWith(
      '/project/src/b.ts'
    )
    expect(mocks.invalidateSharedFileTextPrefixCachePath).toHaveBeenCalledWith(
      '/project/src/b.ts'
    )
    expect(mocks.configureAnalysisCacheRuntime).toHaveBeenCalledWith({
      maxEntries: 32,
    })
  })

  test('advances refresh version after local source updates without RPC', async () => {
    delete process.env['RENOUN_SERVER_PORT']
    delete process.env['RENOUN_SERVER_ID']

    const project = {
      createSourceFile: vi.fn(),
    }
    mocks.getProgram.mockReturnValueOnce(project as never)

    const module = await import('./node-client.ts')
    const refreshVersionListener = vi.fn()
    const unsubscribe = module.onAnalysisClientRefreshVersionChange(
      refreshVersionListener
    )

    try {
      expect(module.getAnalysisClientRefreshVersion()).toBe('0:0')

      await module.createSourceFile('/project/src/b.ts', 'export const b = 2')

      expect(project.createSourceFile).toHaveBeenCalledWith(
        '/project/src/b.ts',
        'export const b = 2',
        { overwrite: true }
      )
      expect(module.getAnalysisClientRefreshVersion()).toBe('0:1')
      expect(refreshVersionListener).toHaveBeenCalledWith('0:1')
      expect(mocks.invalidateProgramFileCache).toHaveBeenCalledWith(
        project,
        '/project/src/b.ts'
      )
      expect(mocks.invalidateRuntimeAnalysisCachePath).toHaveBeenCalledWith(
        '/project/src/b.ts'
      )
      expect(
        mocks.invalidateSharedFileTextPrefixCachePath
      ).toHaveBeenCalledWith('/project/src/b.ts')
    } finally {
      unsubscribe()
    }
  })

  test('does not cache getFileExportText results when includeDependencies is enabled', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'false'

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

    const module = await import('./node-client.ts')
    const analysisOptions = {
      tsConfigFilePath: '/project/tsconfig.json',
    }
    const first = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true,
      analysisOptions
    )
    const second = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true,
      analysisOptions
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
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

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

    const module = await import('./node-client.ts')
    const analysisOptions = {
      tsConfigFilePath: '/project/tsconfig.json',
    }
    const first = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true,
      analysisOptions
    )
    const second = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true,
      analysisOptions
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
        filePaths: ['src/dep.ts'],
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    const third = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true,
      analysisOptions
    )

    expect(third).toBe('export-text-2')
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getFileExportText')
    ).toHaveLength(2)
  })

  test('refresh notifications invalidate only matching includeDependencies export text cache entries', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

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

    const module = await import('./node-client.ts')
    const analysisOptions = {
      tsConfigFilePath: '/project/tsconfig.json',
    }
    const firstA = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true,
      analysisOptions
    )
    const secondA = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true,
      analysisOptions
    )
    const firstB = await module.getFileExportText(
      '/project/src/b.ts',
      0,
      0 as never,
      true,
      analysisOptions
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
      analysisOptions
    )
    const secondB = await module.getFileExportText(
      '/project/src/b.ts',
      0,
      0 as never,
      true,
      analysisOptions
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
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'false'

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

    const module = await import('./node-client.ts')
    const analysisOptions = {
      tsConfigFilePath: '/project/tsconfig.json',
    }
    const first = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      false,
      analysisOptions
    )
    const second = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      false,
      analysisOptions
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
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

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

    const module = await import('./node-client.ts')
    const analysisOptions = {
      tsConfigFilePath: '/project/tsconfig.json',
    }
    const first = await module.transpileSourceFile(
      '/project/src/a.ts',
      analysisOptions
    )
    const second = await module.transpileSourceFile(
      '/project/src/a.ts',
      analysisOptions
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
      analysisOptions
    )

    expect(third).toBe('transpiled-2')
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'transpileSourceFile')
    ).toHaveLength(2)
  })

  test('refresh notifications invalidate quick-info cache conservatively', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

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

    const module = await import('./node-client.ts')
    const analysisOptions = {
      tsConfigFilePath: '/project/tsconfig.json',
    }
    const first = await module.getQuickInfoAtPosition(
      '/project/src/a.ts',
      0,
      analysisOptions
    )
    const second = await module.getQuickInfoAtPosition(
      '/project/src/a.ts',
      0,
      analysisOptions
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
      analysisOptions
    )

    expect(third).toMatchObject({ text: 'quick-info-2' })
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getQuickInfoAtPosition')
    ).toHaveLength(2)
  })

  test('refresh notifications invalidate conservative quick-info cache without process.cwd or analysisOptions', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

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

    vi.stubGlobal(
      'process',
      {
        env: { ...process.env },
      } as unknown as NodeJS.Process
    )

    try {
      const module = await import('./node-client.ts')
      const first = await module.getQuickInfoAtPosition('/project/src/a.ts', 0)
      const second = await module.getQuickInfoAtPosition('/project/src/a.ts', 0)

      expect(first).toMatchObject({ text: 'quick-info-1' })
      expect(second).toMatchObject({ text: 'quick-info-1' })
      expect(
        callMethod.mock.calls.filter(
          ([method]) => method === 'getQuickInfoAtPosition'
        )
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

      const third = await module.getQuickInfoAtPosition('/project/src/a.ts', 0)

      expect(third).toMatchObject({ text: 'quick-info-2' })
      expect(
        callMethod.mock.calls.filter(
          ([method]) => method === 'getQuickInfoAtPosition'
        )
      ).toHaveLength(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('refresh notifications invalidate source metadata cache conservatively', async () => {
    process.env['NODE_ENV'] = 'production'
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

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

    const module = await import('./node-client.ts')
    const request = {
      value: '<Button />',
      language: 'tsx' as const,
      analysisOptions: {
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

  test('keeps colliding source metadata inputs in distinct RPC cache entries', async () => {
    process.env['NODE_ENV'] = 'production'
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'false'

    const callMethod = vi.fn(
      async (method: string, params?: Record<string, unknown>) => {
        if (method === 'getSourceTextMetadata') {
          return {
            value: String(params?.value ?? ''),
            language: 'txt',
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

    const module = await import('./node-client.ts')
    const firstRequest = {
      value: 'dKpCCVlY',
      language: 'txt' as const,
    }
    const secondRequest = {
      value: 'nQE6EsIK',
      language: 'txt' as const,
    }

    const first = await module.getSourceTextMetadata(firstRequest)
    const second = await module.getSourceTextMetadata(secondRequest)
    const third = await module.getSourceTextMetadata(firstRequest)

    expect(first).toEqual({
      value: 'dKpCCVlY',
      language: 'txt',
    })
    expect(second).toEqual({
      value: 'nQE6EsIK',
      language: 'txt',
    })
    expect(third).toEqual({
      value: 'dKpCCVlY',
      language: 'txt',
    })
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getSourceTextMetadata')
    ).toHaveLength(2)
  })

  test('falls back to default RPC cache TTL when env value is invalid', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = 'invalid'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'false'

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

    const module = await import('./node-client.ts')
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

  test('uses server runtime RPC cache TTL when no client override env is set', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE'] = '0'
    process.env['RENOUN_SERVER_CLIENT_RPC_CACHE_TTL_MS'] = '0'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'

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

    const module = await import('./node-client.ts')
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

  test('refresh notifications invalidate dependency-aware RPC cache entries by response dependencies', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

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

    const module = await import('./node-client.ts')
    await preloadLocalAnalysisRuntime(module)
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
    expect(mocks.invalidateProgramCachesByPaths).toHaveBeenCalledWith([
      '/project/src/b.ts',
    ])
  })

  test('refresh notifications do not import local analysis modules when only RPC caches are loaded', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

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

    const module = await import('./node-client.ts')
    module.configureAnalysisClientRuntime({
      analysisCacheMaxEntries: 32,
    })
    const first = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true
    )
    const second = await module.getFileExportText(
      '/project/src/a.ts',
      0,
      0 as never,
      true
    )

    expect(first).toBe('export-text-1')
    expect(second).toBe('export-text-1')
    expect(mocks.configureAnalysisCacheRuntime).not.toHaveBeenCalled()

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
      true
    )

    expect(third).toBe('export-text-2')
    expect(mocks.configureAnalysisCacheRuntime).not.toHaveBeenCalled()
    expect(mocks.invalidateRuntimeAnalysisCachePaths).not.toHaveBeenCalled()
    expect(mocks.invalidateProgramCachesByPaths).not.toHaveBeenCalled()
  })

  test('refresh notifications invalidate token cache conservatively', async () => {
    process.env['NODE_ENV'] = 'production'
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

    const listeners = new Map<string, (payload: unknown) => void>()
    let tokenCallCount = 0
    const callMethod = vi.fn(async (method: string) => {
      if (method === 'getTokens') {
        tokenCallCount += 1
        return [
          [
            {
              value: `token-${tokenCallCount}`,
              start: 0,
              end: 7,
              hasTextStyles: false,
              isBaseColor: true,
              isDeprecated: false,
              isSymbol: false,
              isWhiteSpace: false,
              style: {},
            },
          ],
        ]
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

    const module = await import('./node-client.ts')
    const options = {
      value: 'const value = helper()',
      language: 'ts' as const,
      filePath: '/project/src/a.ts',
      theme: 'github-dark',
      analysisOptions: {
        tsConfigFilePath: '/project/tsconfig.json',
      },
    }
    const first = await module.getTokens(options)
    const second = await module.getTokens(options)

    expect(first[0]?.[0]?.value).toBe('token-1')
    expect(second[0]?.[0]?.value).toBe('token-1')
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getTokens')
    ).toHaveLength(1)

    const notificationListener = listeners.get('notification')
    expect(notificationListener).toBeTypeOf('function')
    notificationListener!({
      type: 'refresh',
      data: {
        refreshCursor: 1,
        filePaths: ['/project/src/types.ts'],
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    const third = await module.getTokens(options)

    expect(third[0]?.[0]?.value).toBe('token-2')
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getTokens')
    ).toHaveLength(2)
  })

  test('does not memoize source metadata RPC responses outside production', async () => {
    process.env['NODE_ENV'] = 'development'
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

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

    const module = await import('./node-client.ts')
    const request = {
      value: '<Button />',
      language: 'tsx' as const,
      analysisOptions: {
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
      value: 'remote-result-2',
      language: 'tsx',
    })
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getSourceTextMetadata')
    ).toHaveLength(2)
  })

  test('does not memoize token RPC responses outside production', async () => {
    process.env['NODE_ENV'] = 'development'
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

    const listeners = new Map<string, (payload: unknown) => void>()
    let tokenCallCount = 0
    const callMethod = vi.fn(async (method: string) => {
      if (method === 'getTokens') {
        tokenCallCount += 1
        return [
          [
            {
              value: `token-${tokenCallCount}`,
              start: 0,
              end: 7,
              hasTextStyles: false,
              isBaseColor: true,
              isDeprecated: false,
              isSymbol: false,
              isWhiteSpace: false,
              style: {},
            },
          ],
        ]
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

    const module = await import('./node-client.ts')
    const options = {
      value: 'const value = helper()',
      language: 'ts' as const,
      filePath: '/project/src/a.ts',
      theme: 'github-dark',
      analysisOptions: {
        tsConfigFilePath: '/project/tsconfig.json',
      },
    }

    const first = await module.getTokens(options)
    const second = await module.getTokens(options)

    expect(first[0]?.[0]?.value).toBe('token-1')
    expect(second[0]?.[0]?.value).toBe('token-2')
    expect(
      callMethod.mock.calls.filter(([method]) => method === 'getTokens')
    ).toHaveLength(2)
  })

  test('refresh notifications invalidate export RPC cache entries by response dependencies', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

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

    const module = await import('./node-client.ts')
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

  test('revives git metadata dates for reference base artifacts returned over RPC', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE'] = '0'

    const callMethod = vi.fn(async (method: string) => {
      if (
        method === 'readFreshReferenceBaseArtifact' ||
        method === 'getReferenceBaseArtifact'
      ) {
        return {
          exportMetadata: [],
          gitMetadataByName: {
            exportedValue: {
              firstCommitDate: '2024-01-01T00:00:00.000Z',
              lastCommitDate: '2024-01-02T00:00:00.000Z',
              firstCommitHash: 'a1',
              lastCommitHash: 'b1',
            },
          },
          fileGitMetadata: {
            authors: [
              {
                name: 'Ada',
                commitCount: 1,
                firstCommitDate: '2024-01-01T00:00:00.000Z',
                lastCommitDate: '2024-01-02T00:00:00.000Z',
              },
            ],
            firstCommitDate: '2024-01-01T00:00:00.000Z',
            lastCommitDate: '2024-01-02T00:00:00.000Z',
          },
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

    const module = await import('./node-client.ts')
    const fresh = await module.readFreshReferenceBaseArtifact(
      '/project/src/a.ts',
      false
    )
    const cached = await module.getReferenceBaseArtifact(
      '/project/src/a.ts',
      false
    )

    expect(fresh?.fileGitMetadata.lastCommitDate).toBeInstanceOf(Date)
    expect(fresh?.gitMetadataByName.exportedValue?.firstCommitDate).toBeInstanceOf(
      Date
    )
    expect(cached.fileGitMetadata.firstCommitDate).toBeInstanceOf(Date)
    expect(cached.fileGitMetadata.lastCommitDate?.toISOString()).toBe(
      '2024-01-02T00:00:00.000Z'
    )
    expect(cached.fileGitMetadata.authors[0]?.lastCommitDate).toBeInstanceOf(
      Date
    )
    expect(
      cached.gitMetadataByName.exportedValue?.lastCommitDate?.toISOString()
    ).toBe('2024-01-02T00:00:00.000Z')
  })

  test('refresh notifications prevent stale in-flight dependency-aware RPC results from being cached', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

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

    const module = await import('./node-client.ts')
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
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
    process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

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

    const module = await import('./node-client.ts')
    await preloadLocalAnalysisRuntime(module)
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
    expect(mocks.invalidateProgramCachesByPaths).toHaveBeenCalledWith([
      '/project/src/a.ts',
    ])
  })

  test('refresh resync retries and falls back to conservative invalidation when exhausted', async () => {
    vi.useFakeTimers()
    try {
      process.env['RENOUN_SERVER_PORT'] = '4545'
      process.env['RENOUN_SERVER_ID'] = 'server-id'
      process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
      process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
      process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

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

      const module = await import('./node-client.ts')
      await preloadLocalAnalysisRuntime(module)

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
      expect(mocks.invalidateProgramCachesByPaths).toHaveBeenCalledTimes(1)
      expect(mocks.invalidateProgramCachesByPaths.mock.calls[0]?.[0]).toEqual([
        resolve(process.cwd()),
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  test('ignores refresh resync results from a stale client after runtime replacement', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_HOST'] = '127.0.0.1'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

    const firstListeners = new Map<string, (payload: unknown) => void>()
    let resolveFirstResync!: (value: {
      nextCursor: number
      fullRefresh: boolean
      filePaths: string[]
    }) => void
    const firstResync = new Promise<{
      nextCursor: number
      fullRefresh: boolean
      filePaths: string[]
    }>((resolve) => {
      resolveFirstResync = resolve
    })
    const firstCallMethod = vi.fn(async (method: string) => {
        if (method === 'getOutlineRanges') {
          return ['first-client']
        }

        if (method === 'getRefreshInvalidationsSince') {
          return firstResync
        }

        throw new Error(`Unexpected method: ${method}`)
      })
    const secondCallMethod = vi.fn(async (method: string) => {
        if (method === 'getOutlineRanges') {
          return ['second-client']
        }

        if (method === 'getRefreshInvalidationsSince') {
          return {
            nextCursor: 2,
            fullRefresh: false,
            filePaths: ['src/fresh.ts'],
          }
        }

        throw new Error(`Unexpected method: ${method}`)
      })
    const clientInstances = [
      {
        callMethod: firstCallMethod,
        ready: vi.fn(async () => undefined),
        on: vi.fn((eventName: string, listener: (payload: unknown) => void) => {
          firstListeners.set(eventName, listener)
        }),
        close: vi.fn(),
        removeAllListeners: vi.fn(),
      },
      {
        callMethod: secondCallMethod,
        ready: vi.fn(async () => undefined),
        on: vi.fn(),
        close: vi.fn(),
        removeAllListeners: vi.fn(),
      },
    ]

    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      const nextClient = clientInstances.shift()
      if (!nextClient) {
        throw new Error('[renoun] Unexpected extra WebSocketClient creation')
      }

      return nextClient
    })

    const module = await import('./node-client.ts')
    const runtimeEnvModule = await import('./runtime-env.ts')
    await preloadLocalAnalysisRuntime(module)

    expect(await module.getOutlineRanges('/project/src/a.ts')).toEqual([
      'first-client',
    ])

    const firstConnectedListener = firstListeners.get('connected')
    expect(firstConnectedListener).toBeTypeOf('function')
    firstConnectedListener!({})
    firstConnectedListener!({})

    process.env['RENOUN_SERVER_PORT'] = '5454'
    process.env['RENOUN_SERVER_HOST'] = 'localhost'
    runtimeEnvModule.notifyServerRuntimeEnvChanged()
    await new Promise((resolve) => setTimeout(resolve, 0))

    resolveFirstResync({
      nextCursor: 1,
      fullRefresh: false,
      filePaths: ['src/stale.ts'],
    })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(await module.getOutlineRanges('/project/src/b.ts')).toEqual([
      'second-client',
    ])

    const invalidatedPaths = mocks.invalidateRuntimeAnalysisCachePaths.mock.calls
      .flatMap(([paths]) => (paths as string[]) ?? [])

    expect(invalidatedPaths).toContain(resolve(process.cwd(), 'src/fresh.ts'))
    expect(invalidatedPaths).not.toContain(resolve(process.cwd(), 'src/stale.ts'))
    expect(secondCallMethod).toHaveBeenCalledWith(
      'getRefreshInvalidationsSince',
      { sinceCursor: 0 }
    )
  })

  test('does not carry ready-probe backoff across client replacement', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    process.env['RENOUN_SERVER_HOST'] = '127.0.0.1'
    process.env['RENOUN_SERVER_ID'] = 'server-id'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE'] = '0'

    let rejectFirstReady!: (error: Error) => void
    const firstReadyPromise = new Promise<void>((_, reject) => {
      rejectFirstReady = reject
    })
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

      throw new Error(`Unexpected method: ${method}`)
    })
    const clientInstances = [
      {
        callMethod: firstCallMethod,
        ready: vi.fn(() => firstReadyPromise),
        on: vi.fn(),
        close: vi.fn(),
        removeAllListeners: vi.fn(),
      },
      {
        callMethod: secondCallMethod,
        ready: vi.fn(async () => undefined),
        on: vi.fn(),
        close: vi.fn(),
        removeAllListeners: vi.fn(),
      },
    ]

    mocks.getCachedOutlineRanges.mockResolvedValueOnce(['local-fallback'])
    mocks.WebSocketClient.mockImplementation(function MockWebSocketClient() {
      const nextClient = clientInstances.shift()
      if (!nextClient) {
        throw new Error('[renoun] Unexpected extra WebSocketClient creation')
      }

      return nextClient
    })

    const module = await import('./node-client.ts')
    const runtimeEnvModule = await import('./runtime-env.ts')

    const firstRequest = module.getOutlineRanges('/project/src/a.ts')

    process.env['RENOUN_SERVER_PORT'] = '5454'
    process.env['RENOUN_SERVER_HOST'] = 'localhost'
    runtimeEnvModule.notifyServerRuntimeEnvChanged()
    rejectFirstReady(new Error('server restarting'))

    expect(await firstRequest).toEqual(['local-fallback'])
    expect(await module.getOutlineRanges('/project/src/b.ts')).toEqual([
      'second-client',
    ])
    expect(secondCallMethod).toHaveBeenCalledWith('getOutlineRanges', {
      filePath: '/project/src/b.ts',
      analysisOptions: undefined,
    })
  })

  test('refresh resync fallback invalidates observed project roots outside cwd', async () => {
    vi.useFakeTimers()
    try {
      process.env['RENOUN_SERVER_PORT'] = '4545'
      process.env['RENOUN_SERVER_ID'] = 'server-id'
      process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE'] = 'true'
      process.env['RENOUN_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS'] = '60000'
      process.env['RENOUN_ANALYSIS_REFRESH_NOTIFICATIONS'] = 'true'

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

      const module = await import('./node-client.ts')
      const externalProjectRoot = resolve('/tmp/renoun-external-project')
      await preloadLocalAnalysisRuntime(module)

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

async function preloadLocalAnalysisRuntime(
  module: typeof import('./node-client.ts')
): Promise<void> {
  const serverPort = process.env['RENOUN_SERVER_PORT']
  const serverHost = process.env['RENOUN_SERVER_HOST']
  const serverId = process.env['RENOUN_SERVER_ID']

  delete process.env['RENOUN_SERVER_PORT']
  delete process.env['RENOUN_SERVER_HOST']
  delete process.env['RENOUN_SERVER_ID']

  try {
    await module.getSourceTextMetadata({
      value: 'const local = true',
      language: 'txt',
    })
  } finally {
    restoreEnvValue('RENOUN_SERVER_PORT', serverPort)
    restoreEnvValue('RENOUN_SERVER_HOST', serverHost)
    restoreEnvValue('RENOUN_SERVER_ID', serverId)
  }

  mocks.getProgram.mockClear()
  mocks.getCachedSourceTextMetadata.mockClear()
  mocks.invalidateProgramFileCache.mockClear()
  mocks.invalidateProgramCachesByPaths.mockClear()
  mocks.invalidateRuntimeAnalysisCachePath.mockClear()
  mocks.invalidateRuntimeAnalysisCachePaths.mockClear()
  mocks.invalidateSharedFileTextPrefixCachePath.mockClear()
}

function restoreEnvValue(
  key: keyof NodeJS.ProcessEnv,
  value: string | undefined
): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}
