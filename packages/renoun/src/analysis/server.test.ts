import { mkdirSync, watch } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'

import * as bestEffortModule from '../utils/best-effort.ts'
import { captureProcessEnv, restoreProcessEnv } from '../utils/test.ts'
import * as rootDirectoryModule from '../utils/get-root-directory.ts'
import * as cachedAnalysis from './cached-analysis.ts'
import { WebSocketClient } from './rpc/client.ts'
import { TestWebSocket } from './rpc/test-websocket.ts'
import type { RefreshInvalidationsSinceResponse } from './refresh-notifications.ts'
import type { AnalysisOptions } from './types.ts'
import { createServer } from './server.ts'
import * as getProgramModule from './get-program.ts'
import * as highlighterModule from '../utils/create-highlighter.ts'
import * as quickInfoModule from '../utils/get-quick-info-at-position.ts'
import * as fileTextPrefixCacheModule from './file-text-prefix-cache.ts'
import * as sourceTextMetadataModule from './query/source-text-metadata.ts'

const WEBSOCKET_READY_TIMEOUT_MS = 30_000
const REFRESH_NOTIFICATION_TIMEOUT_MS = 5_000

function createDeferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<Value>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return {
    promise,
    resolve,
    reject,
  }
}

const watcherState = vi.hoisted(() => {
  return {
    callback:
      undefined as
        | ((
            eventType: string,
            fileName: string | Buffer | null
          ) => void)
        | undefined,
  }
})

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')

  return {
    ...actual,
    watch: vi.fn((...args: unknown[]) => {
      const callback =
        typeof args[1] === 'function' ? args[1] : args[2]
      if (typeof callback === 'function') {
        watcherState.callback = callback as (
          eventType: string,
          fileName: string | Buffer | null
        ) => void
      }

      return {
        close: vi.fn(),
      } as unknown as import('node:fs').FSWatcher
    }),
  }
})

const originalEnvironment = captureProcessEnv([
  'RENOUN_SERVER_PORT',
  'RENOUN_SERVER_HOST',
  'RENOUN_SERVER_ID',
  'RENOUN_SERVER_CLIENT_RPC_CACHE',
  'RENOUN_SERVER_CLIENT_RPC_CACHE_TTL_MS',
  'RENOUN_SERVER_CLIENT_REFRESH_NOTIFICATIONS',
  'RENOUN_SERVER_REFRESH_NOTIFICATIONS',
  'RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE',
  'NODE_ENV',
])

describe('analysis server refresh invalidations', () => {
  const originalWebSocket = globalThis.WebSocket
  let client: WebSocketClient | undefined
  let server: Awaited<ReturnType<typeof createServer>> | undefined

  afterEach(async () => {
    const activeClient = client
    if (activeClient) {
      await new Promise<void>((resolve) => {
        activeClient.once('disconnected', () => resolve())
        activeClient.close()
      })
      activeClient.removeAllListeners()
    }
    server?.cleanup()
    client = undefined
    server = undefined

    globalThis.WebSocket = originalWebSocket
    vi.useRealTimers()
    vi.restoreAllMocks()
    watcherState.callback = undefined
    restoreProcessEnv(originalEnvironment)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  test('forces full refresh when requested cursor is ahead of the server cursor', async () => {
    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'

    server = await createServer({ host: '127.0.0.1' })
    client = new WebSocketClient(server.getId())
    await client.ready(WEBSOCKET_READY_TIMEOUT_MS)

    const response = await client.callMethod<
      { sinceCursor: number },
      RefreshInvalidationsSinceResponse
    >('getRefreshInvalidationsSince', {
      sinceCursor: 5,
    })

    expect(response.fullRefresh).toBe(true)
    expect(response.nextCursor).toBe(0)
    expect(response.filePaths).toEqual(['.'])
    expect(response.filePath).toBe('.')
  })

  test('resyncs from the cursor immediately before retained refresh history', async () => {
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '1'
    server = await createServer({ host: '127.0.0.1' })

    const callback = watcherState.callback
    expect(typeof callback).toBe('function')

    if (!callback) {
      throw new Error('[renoun] expected root watcher callback to be defined')
    }

    vi.useFakeTimers()

    try {
      for (let index = 1; index <= 251; index += 1) {
        callback('change', `src/retained-history-${index}.ts`)
        await vi.advanceTimersByTimeAsync(60)
      }
    } finally {
      vi.useRealTimers()
    }

    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket
    client = new WebSocketClient(server.getId())
    await client.ready(WEBSOCKET_READY_TIMEOUT_MS)

    const response = await client.callMethod<
      { sinceCursor: number },
      RefreshInvalidationsSinceResponse
    >('getRefreshInvalidationsSince', {
      sinceCursor: 1,
    })

    expect(response.fullRefresh).toBe(false)
    expect(response.nextCursor).toBe(251)
    expect(response.filePath).toBe(response.filePaths?.[0])
    expect(response.filePaths).toHaveLength(250)
    expect(response.filePaths).toEqual(
      expect.arrayContaining([
        'src/retained-history-2.ts',
        'src/retained-history-251.ts',
      ])
    )
  })

  test('publishes refresh invalidations for virtual source updates', async () => {
    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'

    server = await createServer({ host: '127.0.0.1' })
    client = new WebSocketClient(server.getId())
    await client.ready(WEBSOCKET_READY_TIMEOUT_MS)

    const uniqueId = Date.now()
    const relativeFilePath =
      `packages/renoun/src/analysis/virtual-source-update-${uniqueId}.ts`
    const filePath = join(process.cwd(), relativeFilePath)

    const refreshNotificationPromise = new Promise<{
      data?: {
        filePath?: string
        filePaths?: string[]
      }
      type?: string
    }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('[renoun] expected refresh notification'))
      }, REFRESH_NOTIFICATION_TIMEOUT_MS)

      client?.once('notification', (message) => {
        clearTimeout(timeout)
        resolve(
          message as {
            data?: {
              filePath?: string
              filePaths?: string[]
            }
            type?: string
          }
        )
      })
    })

    await client.callMethod<
      {
        filePath: string
        sourceText: string
      },
      void
    >('createSourceFile', {
      filePath,
      sourceText: 'export const value = 1\n',
    })

    const notification = await refreshNotificationPromise
    expect(notification.type).toBe('refresh')
    expect(notification.data?.filePath).toBe(relativeFilePath)
    expect(notification.data?.filePaths).toEqual([relativeFilePath])

    const response = await client.callMethod<
      { sinceCursor: number },
      RefreshInvalidationsSinceResponse
    >('getRefreshInvalidationsSince', {
      sinceCursor: 0,
    })

    expect(response.fullRefresh).toBe(false)
    expect(response.nextCursor).toBe(1)
    expect(response.filePath).toBe(relativeFilePath)
    expect(response.filePaths).toEqual([relativeFilePath])
  })

  test('normalizes virtual source update paths from nested package cwd values', async () => {
    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'

    const uniqueId = Date.now()
    const originalCwd = process.cwd()
    const rootDirectory = join('/tmp', `renoun-analysis-server-${uniqueId}`)
    const packageDirectory = join(rootDirectory, 'packages/renoun')
    const tsConfigFilePath = join(packageDirectory, 'tsconfig.json')
    const workspaceRelativeFilePath =
      `packages/renoun/src/virtual-source-update-${uniqueId}.ts`
    const duplicatedFilePath = join(
      packageDirectory,
      workspaceRelativeFilePath
    )

    vi.spyOn(rootDirectoryModule, 'getRootDirectory').mockReturnValue(
      rootDirectory
    )
    mkdirSync(packageDirectory, { recursive: true })

    try {
      process.chdir(packageDirectory)

      server = await createServer({ host: '127.0.0.1' })
      client = new WebSocketClient(server.getId())
      await client.ready(WEBSOCKET_READY_TIMEOUT_MS)

      const refreshNotificationPromise = new Promise<{
        data?: {
          filePath?: string
          filePaths?: string[]
        }
        type?: string
      }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('[renoun] expected refresh notification'))
        }, REFRESH_NOTIFICATION_TIMEOUT_MS)

        client?.once('notification', (message) => {
          clearTimeout(timeout)
          resolve(
            message as {
              data?: {
                filePath?: string
                filePaths?: string[]
              }
              type?: string
            }
          )
        })
      })

      await client.callMethod<
        {
          filePath: string
          sourceText: string
          analysisOptions?: AnalysisOptions
        },
        void
      >('createSourceFile', {
        filePath: duplicatedFilePath,
        sourceText: 'export const value = 1\n',
        analysisOptions: {
          tsConfigFilePath,
        },
      })

      const notification = await refreshNotificationPromise
      expect(notification.type).toBe('refresh')
      expect(notification.data?.filePath).toBe(workspaceRelativeFilePath)
      expect(notification.data?.filePaths).toEqual([workspaceRelativeFilePath])

      const transpiled = await client.callMethod<
        {
          filePath: string
          analysisOptions?: AnalysisOptions
        },
        string
      >('transpileSourceFile', {
        filePath: join(rootDirectory, workspaceRelativeFilePath),
        analysisOptions: {
          tsConfigFilePath,
        },
      })

      expect(transpiled).toContain('export const value = 1')
    } finally {
      process.chdir(originalCwd)
    }
  })

  test('publishes the effective refresh notification mode to process env', async () => {
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '1'
    server = await createServer({
      host: '127.0.0.1',
      emitRefreshNotifications: false,
      clientRuntime: {
        rpcCacheTtlMs: 45_000,
      },
    })

    expect(process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS']).toBe('1')
    expect(process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE']).toBe(
      '0'
    )
    expect(process.env['RENOUN_SERVER_CLIENT_RPC_CACHE_TTL_MS']).toBe('45000')
  })

  test('does not treat effective refresh mode as the next server override', async () => {
    process.env['NODE_ENV'] = 'development'
    delete process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS']
    delete process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE']

    const originalCwd = process.cwd()
    const runtimeCwd = join(
      originalCwd,
      '.renoun',
      'server-refresh-notification-mode'
    )
    mkdirSync(runtimeCwd, { recursive: true })
    let firstServer: Awaited<ReturnType<typeof createServer>> | undefined
    let secondServer: Awaited<ReturnType<typeof createServer>> | undefined

    try {
      process.chdir(runtimeCwd)
      firstServer = await createServer({ host: '127.0.0.1' })
      firstServer.cleanup()
      firstServer = undefined
      expect(process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE']).toBe(
        undefined
      )

      process.chdir(originalCwd)
      secondServer = await createServer({ host: '127.0.0.1' })
      secondServer.cleanup()
      secondServer = undefined
      expect(process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE']).toBe(
        undefined
      )
    } finally {
      firstServer?.cleanup()
      secondServer?.cleanup()
      process.chdir(originalCwd)
    }
  })

  test('restores the previous server runtime env when the current server is cleaned up', async () => {
    const firstServer = await createServer({
      host: '127.0.0.1',
      emitRefreshNotifications: false,
      clientRuntime: {
        rpcCacheTtlMs: 60_000,
      },
    })
    const firstPort = String(await firstServer.getPort())

    expect(process.env['RENOUN_SERVER_PORT']).toBe(firstPort)
    expect(process.env['RENOUN_SERVER_HOST']).toBe('127.0.0.1')
    expect(process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE']).toBe(
      '0'
    )
    expect(process.env['RENOUN_SERVER_CLIENT_RPC_CACHE_TTL_MS']).toBe('60000')

    const secondServer = await createServer({
      host: '127.0.0.1',
      emitRefreshNotifications: true,
      clientRuntime: {
        rpcCacheTtlMs: 120_000,
      },
    })
    const secondPort = String(await secondServer.getPort())

    expect(process.env['RENOUN_SERVER_PORT']).toBe(secondPort)
    expect(process.env['RENOUN_SERVER_HOST']).toBe('127.0.0.1')
    expect(process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE']).toBe(
      '1'
    )
    expect(process.env['RENOUN_SERVER_CLIENT_RPC_CACHE_TTL_MS']).toBe('120000')

    secondServer.cleanup()

    expect(process.env['RENOUN_SERVER_PORT']).toBe(firstPort)
    expect(process.env['RENOUN_SERVER_HOST']).toBe('127.0.0.1')
    expect(process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE']).toBe(
      '0'
    )
    expect(process.env['RENOUN_SERVER_CLIENT_RPC_CACHE_TTL_MS']).toBe('60000')

    firstServer.cleanup()
  })

  test('clears the active runtime env when the last server is cleaned up', async () => {
    const activeServer = await createServer({
      host: '127.0.0.1',
      emitRefreshNotifications: false,
      clientRuntime: {
        rpcCacheTtlMs: 60_000,
      },
    })

    expect(process.env['RENOUN_SERVER_PORT']).toBeDefined()
    expect(process.env['RENOUN_SERVER_HOST']).toBe('127.0.0.1')
    expect(process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE']).toBe(
      '0'
    )
    expect(process.env['RENOUN_SERVER_CLIENT_RPC_CACHE_TTL_MS']).toBe('60000')

    activeServer.cleanup()

    expect(process.env['RENOUN_SERVER_PORT']).toBeUndefined()
    expect(process.env['RENOUN_SERVER_HOST']).toBeUndefined()
    expect(process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE']).toBe(
      undefined
    )
    expect(process.env['RENOUN_SERVER_CLIENT_RPC_CACHE_TTL_MS']).toBeUndefined()
  })

  test('does not scan markdown or initialize the highlighter during development startup without request config', async () => {
    process.env['NODE_ENV'] = 'development'
    vi.spyOn(rootDirectoryModule, 'getRootDirectory').mockReturnValue(
      '/virtual-dev-startup-root.mdx'
    )
    vi.spyOn(cachedAnalysis, 'prewarmRuntimeAnalysisSession').mockResolvedValue()
    vi.spyOn(cachedAnalysis, 'getCachedSourceTextMetadata').mockResolvedValue(
      null as unknown as Awaited<
        ReturnType<typeof cachedAnalysis.getCachedSourceTextMetadata>
      >
    )
    const getSharedFileTextPrefixSpy = vi
      .spyOn(fileTextPrefixCacheModule, 'getSharedFileTextPrefix')
      .mockResolvedValue(undefined)
    const createHighlighterSpy = vi
      .spyOn(highlighterModule, 'createHighlighter')
      .mockResolvedValue({
        tokenize: async () => [],
      } as Awaited<ReturnType<typeof highlighterModule.createHighlighter>>)

    server = await createServer({ host: '127.0.0.1' })
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(createHighlighterSpy).not.toHaveBeenCalled()
    expect(getSharedFileTextPrefixSpy).not.toHaveBeenCalled()
  })

  test('does not memoize quick info RPC responses for identical params in development', async () => {
    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket
    process.env['NODE_ENV'] = 'development'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'

    const quickInfoSpy = vi
      .spyOn(quickInfoModule, 'getQuickInfoAtPosition')
      .mockReturnValueOnce({
        displayText: 'first-result',
        documentationText: '',
      })
      .mockReturnValueOnce({
        displayText: 'second-result',
        documentationText: '',
      })

    server = await createServer({ host: '127.0.0.1' })
    client = new WebSocketClient(server.getId())
    await client.ready(WEBSOCKET_READY_TIMEOUT_MS)

    const params = {
      filePath: `${process.cwd()}/packages/renoun/src/analysis/server.ts`,
      position: 0,
    }
    const first = await client.callMethod<typeof params, unknown>(
      'getQuickInfoAtPosition',
      params
    )
    const second = await client.callMethod<typeof params, unknown>(
      'getQuickInfoAtPosition',
      params
    )

    expect(first).toEqual({
      displayText: 'first-result',
      documentationText: '',
    })
    expect(second).toEqual({
      displayText: 'second-result',
      documentationText: '',
    })
    expect(quickInfoSpy).toHaveBeenCalledTimes(2)
  }, 45_000)

  test('does not memoize source text metadata RPC responses outside production', async () => {
    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket
    process.env['NODE_ENV'] = 'test'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'

    const sourceTextMetadataSpy = vi
      .spyOn(cachedAnalysis, 'getCachedSourceTextMetadata')
      .mockResolvedValueOnce({
        section: 'first-result',
      } as unknown as Awaited<
        ReturnType<typeof cachedAnalysis.getCachedSourceTextMetadata>
      >)
      .mockResolvedValueOnce({
        section: 'second-result',
      } as unknown as Awaited<
        ReturnType<typeof cachedAnalysis.getCachedSourceTextMetadata>
      >)

    server = await createServer({ host: '127.0.0.1' })
    client = new WebSocketClient(server.getId())
    await client.ready(WEBSOCKET_READY_TIMEOUT_MS)

    const params = {
      value: 'const value = 1\n',
      language: 'ts' as const,
      shouldFormat: false,
    }
    const first = await client.callMethod<typeof params, unknown>(
      'getSourceTextMetadata',
      params
    )
    const second = await client.callMethod<typeof params, unknown>(
      'getSourceTextMetadata',
      params
    )

    expect(first).toEqual({
      section: 'first-result',
    })
    expect(second).toEqual({
      section: 'second-result',
    })
    expect(sourceTextMetadataSpy).toHaveBeenCalledTimes(2)
  }, 45_000)

  test('does not memoize token RPC responses outside production', async () => {
    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket
    process.env['NODE_ENV'] = 'test'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'

    const getTokensSpy = vi
      .spyOn(cachedAnalysis, 'getCachedTokens')
      .mockResolvedValueOnce([
        [{ value: 'first-result' }],
      ] as unknown as Awaited<ReturnType<typeof cachedAnalysis.getCachedTokens>>)
      .mockResolvedValueOnce([
        [{ value: 'second-result' }],
      ] as unknown as Awaited<ReturnType<typeof cachedAnalysis.getCachedTokens>>)

    server = await createServer({ host: '127.0.0.1' })
    client = new WebSocketClient(server.getId())
    await client.ready(WEBSOCKET_READY_TIMEOUT_MS)

    const params = {
      value: 'const value = 1\n',
      language: 'ts' as const,
      theme: 'default' as const,
    }
    const first = await client.callMethod<typeof params, unknown>(
      'getTokens',
      params
    )
    const second = await client.callMethod<typeof params, unknown>(
      'getTokens',
      params
    )

    expect(first).toEqual([[{ value: 'first-result' }]])
    expect(second).toEqual([[{ value: 'second-result' }]])
    expect(getTokensSpy).toHaveBeenCalledTimes(2)
  }, 45_000)

  test('hydrates synthetic snippet source metadata before resolving deferred quick info', async () => {
    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket
    process.env['NODE_ENV'] = 'development'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'

    const hydrateSpy = vi.spyOn(
      sourceTextMetadataModule,
      'hydrateSourceTextMetadataSourceFile'
    )
    const quickInfoSpy = vi
      .spyOn(quickInfoModule, 'getQuickInfoAtPosition')
      .mockReturnValue({
        displayText: 'snippet-result',
        documentationText: '',
      })

    server = await createServer({ host: '127.0.0.1' })
    client = new WebSocketClient(server.getId())
    await client.ready(WEBSOCKET_READY_TIMEOUT_MS)

    const params = {
      filePath: '_renoun/history.__renoun_snippet_sig_1.ts',
      position: 0,
      sourceMetadata: {
        value: 'const History = 1',
        language: 'ts',
      },
    }
    const result = await client.callMethod<typeof params, unknown>(
      'getQuickInfoAtPosition',
      params
    )

    expect(result).toEqual({
      displayText: 'snippet-result',
      documentationText: '',
    })
    expect(hydrateSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filePath: '_renoun/history.__renoun_snippet_sig_1.ts',
        value: 'const History = 1',
        language: 'ts',
      })
    )
    expect(quickInfoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '_renoun/history.__renoun_snippet_sig_1.ts',
        position: 0,
      })
    )
  }, 45_000)

  test('does not drop refresh invalidations when root ancestors include ignored segment names', async () => {
    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '1'

    const uniqueId = Date.now()
    const rootDirectory = `/virtual-refresh-roots/build/project-${uniqueId}`

    vi.spyOn(rootDirectoryModule, 'getRootDirectory').mockReturnValue(
      rootDirectory
    )

    server = await createServer({ host: '127.0.0.1' })
    client = new WebSocketClient(server.getId())
    await client.ready(WEBSOCKET_READY_TIMEOUT_MS)

    const callback = watcherState.callback
    expect(typeof callback).toBe('function')

    if (!callback) {
      throw new Error('[renoun] expected root watcher callback to be defined')
    }

    const refreshNotificationPromise = new Promise<{
      data?: {
        filePaths?: string[]
      }
      type?: string
    }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('[renoun] expected refresh notification'))
      }, REFRESH_NOTIFICATION_TIMEOUT_MS)

      client?.once('notification', (message) => {
        clearTimeout(timeout)
        resolve(
          message as {
            data?: {
              filePaths?: string[]
            }
            type?: string
          }
        )
      })
    })

    callback('change', 'src/example.ts')
    const notification = await refreshNotificationPromise

    expect(notification.type).toBe('refresh')
    expect(notification.data?.filePaths).toEqual(['src/example.ts'])
  })

  test('falls back to disabled refresh notifications when watcher setup throws', async () => {
    process.env['NODE_ENV'] = 'development'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '1'

    const unsubscribe = vi.fn()
    const reportBestEffortErrorSpy = vi
      .spyOn(bestEffortModule, 'reportBestEffortError')
      .mockImplementation(() => {})
    const onRuntimeAnalysisBackgroundRefreshSpy = vi
      .spyOn(cachedAnalysis, 'onRuntimeAnalysisBackgroundRefresh')
      .mockReturnValue(unsubscribe)
    vi.mocked(watch).mockImplementationOnce(() => {
      throw new Error('watch unavailable')
    })

    server = await createServer({ host: '127.0.0.1' })

    expect(onRuntimeAnalysisBackgroundRefreshSpy).toHaveBeenCalledTimes(1)
    expect(process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS_EFFECTIVE']).toBe(
      '0'
    )
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(reportBestEffortErrorSpy).toHaveBeenCalledWith(
      'analysis/server',
      expect.objectContaining({
        message: 'watch unavailable',
      })
    )
  })

  test('does not continue startup markdown warmup after cleanup', async () => {
    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket
    process.env['NODE_ENV'] = 'development'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'

    vi.spyOn(rootDirectoryModule, 'getRootDirectory').mockReturnValue(
      '/virtual-dev-startup-cleanup-root.mdx'
    )
    vi.spyOn(cachedAnalysis, 'prewarmRuntimeAnalysisSession').mockResolvedValue()

    let startedMetadataCalls = 0
    let resolveMetadataStarted: (() => void) | undefined
    const metadataStarted = new Promise<void>((resolve) => {
      resolveMetadataStarted = resolve
    })
    const metadataWaiters: Array<() => void> = []

    vi.spyOn(cachedAnalysis, 'getCachedSourceTextMetadata').mockImplementation(
      async () => {
        startedMetadataCalls += 1
        if (startedMetadataCalls >= 2) {
          resolveMetadataStarted?.()
        }

        await new Promise<void>((resolve) => {
          metadataWaiters.push(resolve)
        })

        return null as unknown as Awaited<
          ReturnType<typeof cachedAnalysis.getCachedSourceTextMetadata>
        >
      }
    )

    const tokenizeSpy = vi.fn(async () => [])
    vi.spyOn(highlighterModule, 'createHighlighter').mockResolvedValue({
      tokenize: tokenizeSpy,
    } as Awaited<ReturnType<typeof highlighterModule.createHighlighter>>)
    vi.spyOn(getProgramModule, 'getProgram').mockReturnValue({} as never)
    vi.spyOn(cachedAnalysis, 'getCachedTokens').mockResolvedValue([])
    const getSharedFileTextPrefixSpy = vi
      .spyOn(fileTextPrefixCacheModule, 'getSharedFileTextPrefix')
      .mockResolvedValue(undefined)

    server = await createServer({
      host: '127.0.0.1',
      emitRefreshNotifications: false,
    })
    client = new WebSocketClient(server.getId())
    await client.ready(WEBSOCKET_READY_TIMEOUT_MS)
    await metadataStarted

    await client.callMethod<
      {
        value: string
        language: 'ts'
        theme: 'default'
      },
      unknown
    >('getTokens', {
      value: 'const answer = 42',
      language: 'ts',
      theme: 'default',
    })

    server.cleanup()
    server = undefined

    for (const resolveMetadata of metadataWaiters) {
      resolveMetadata()
    }
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(getSharedFileTextPrefixSpy).not.toHaveBeenCalled()
    expect(tokenizeSpy).not.toHaveBeenCalled()
  })

  test('does not serialize git-scoped file export type requests for different files', async () => {
    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket
    process.env['NODE_ENV'] = 'production'
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '0'

    const firstRequest = createDeferred<Awaited<
      ReturnType<typeof cachedAnalysis.resolveCachedFileExportsWithDependencies>
    >>()
    const secondRequest = createDeferred<Awaited<
      ReturnType<typeof cachedAnalysis.resolveCachedFileExportsWithDependencies>
    >>()
    const startedFilePaths: string[] = []

    vi.spyOn(getProgramModule, 'getProgram').mockReturnValue({} as never)
    vi.spyOn(
      cachedAnalysis,
      'resolveCachedFileExportsWithDependencies'
    ).mockImplementation(async (_project, options) => {
      startedFilePaths.push(options.filePath)

      if (options.filePath.endsWith('nodes.ts')) {
        return firstRequest.promise
      }

      if (options.filePath.endsWith('arrays.ts')) {
        return secondRequest.promise
      }

      throw new Error(`Unexpected filePath: ${options.filePath}`)
    })

    server = await createServer({ host: '127.0.0.1' })
    client = new WebSocketClient(server.getId())
    await client.ready(WEBSOCKET_READY_TIMEOUT_MS)

    const analysisOptions: AnalysisOptions = {
      analysisScopeId: 'git:owner/repo',
    }
    const firstCall = client.callMethod(
      'resolveFileExportsWithDependencies',
      {
        filePath: '/repo/nodes.ts',
        analysisOptions,
      }
    )
    const secondCall = client.callMethod(
      'resolveFileExportsWithDependencies',
      {
        filePath: '/repo/arrays.ts',
        analysisOptions,
      }
    )

    await expect(
      Promise.race([
        (async () => {
          while (startedFilePaths.length < 2) {
            await new Promise((resolve) => setTimeout(resolve, 10))
          }
        })(),
        new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  'expected both git-scoped file export requests to start'
                )
              ),
            250
          )
        ),
      ])
    ).resolves.toBeUndefined()

    firstRequest.resolve({
      resolvedTypes: [],
      dependencies: ['/repo/nodes.ts'],
    })
    secondRequest.resolve({
      resolvedTypes: [],
      dependencies: ['/repo/arrays.ts'],
    })

    await expect(firstCall).resolves.toEqual({
      resolvedTypes: [],
      dependencies: ['/repo/nodes.ts'],
    })
    await expect(secondCall).resolves.toEqual({
      resolvedTypes: [],
      dependencies: ['/repo/arrays.ts'],
    })
  }, 45_000)
})
