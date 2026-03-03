import { afterEach, describe, expect, test, vi } from 'vitest'

import { captureProcessEnv, restoreProcessEnv } from '../utils/test.ts'
import * as rootDirectoryModule from '../utils/get-root-directory.ts'
import * as cachedAnalysis from './cached-analysis.ts'
import { WebSocketClient } from './rpc/client.ts'
import { TestWebSocket } from './rpc/test-websocket.ts'
import type { RefreshInvalidationsSinceResponse } from './refresh-notifications.ts'
import { createServer } from './server.ts'
import * as highlighterModule from '../utils/create-highlighter.ts'

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
  'RENOUN_SERVER_ID',
  'RENOUN_SERVER_REFRESH_NOTIFICATIONS',
  'NODE_ENV',
])

describe('project server refresh invalidations', () => {
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
    await client.ready(2_000)

    const response = await client.callMethod<
      { sinceCursor: number },
      RefreshInvalidationsSinceResponse
    >('getRefreshInvalidationsSince', {
      sinceCursor: 5,
    })

    expect(response.fullRefresh).toBe(true)
    expect(response.nextCursor).toBe(0)
    expect(response.filePaths?.length).toBe(1)
    expect(response.filePath).toBe(response.filePaths?.[0])
  })

  test('publishes the effective refresh notification mode to process env', async () => {
    process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS'] = '1'
    server = await createServer({
      host: '127.0.0.1',
      emitRefreshNotifications: false,
    })

    expect(process.env['RENOUN_SERVER_REFRESH_NOTIFICATIONS']).toBe('0')
  })

  test('does not initialize the highlighter during development startup without request config', async () => {
    process.env['NODE_ENV'] = 'development'
    vi.spyOn(cachedAnalysis, 'prewarmRuntimeAnalysisSession').mockResolvedValue()
    vi.spyOn(cachedAnalysis, 'getCachedSourceTextMetadata').mockResolvedValue(
      null as unknown as Awaited<
        ReturnType<typeof cachedAnalysis.getCachedSourceTextMetadata>
      >
    )
    const createHighlighterSpy = vi
      .spyOn(highlighterModule, 'createHighlighter')
      .mockResolvedValue({
        tokenize: async () => [],
      } as Awaited<ReturnType<typeof highlighterModule.createHighlighter>>)

    server = await createServer({ host: '127.0.0.1' })
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(createHighlighterSpy).not.toHaveBeenCalled()
  })

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
    await client.ready(2_000)

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
      }, 1_000)

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
    expect(notification.data?.filePaths).toEqual(
      expect.arrayContaining([`${rootDirectory}/src/example.ts`])
    )
  })
})
