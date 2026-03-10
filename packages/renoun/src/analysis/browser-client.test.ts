import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AnalysisServerRuntime } from './runtime-env.ts'

interface PendingCall {
  method: string
  params: Record<string, unknown>
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

interface MockBrowserClientInstance {
  runtime: AnalysisServerRuntime | undefined
  callMethod: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  removeAllListeners: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  listeners: Map<string, (payload: unknown) => void>
  pendingCalls: PendingCall[]
}

const mocks = vi.hoisted(() => {
  return {
    WebSocketClient: vi.fn(),
    instances: [] as MockBrowserClientInstance[],
  }
})

vi.mock('./rpc/client.ts', () => ({
  WebSocketClient: mocks.WebSocketClient,
}))

describe('browser-client runtime transport', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.instances.length = 0
    mocks.WebSocketClient.mockReset()
    mocks.WebSocketClient.mockImplementation(
      function MockWebSocketClient(
        _serverId: string,
        runtime?: AnalysisServerRuntime
      ) {
        const pendingCalls: PendingCall[] = []
        const listeners = new Map<string, (payload: unknown) => void>()
        const instance: MockBrowserClientInstance = {
          runtime,
          listeners,
          pendingCalls,
          callMethod: vi.fn((method: string, params: Record<string, unknown>) => {
            return new Promise((resolve, reject) => {
              pendingCalls.push({
                method,
                params,
                resolve,
                reject,
              })
            })
          }),
          close: vi.fn(() => {
            while (pendingCalls.length > 0) {
              pendingCalls.shift()?.reject(
                new Error('[renoun] Mock browser client closed')
              )
            }
          }),
          on: vi.fn((eventName: string, listener: (payload: unknown) => void) => {
            listeners.set(eventName, listener)
          }),
          removeAllListeners: vi.fn(),
        }

        mocks.instances.push(instance)
        return instance
      }
    )
  })

  afterEach(async () => {
    const module = await import('./client.ts')
    module.setAnalysisClientBrowserRuntime(undefined)
    module.__TEST_ONLY__.clearAnalysisClientRpcState()
    module.__TEST_ONLY__.disposeAnalysisBrowserClient()
  })

  it('reuses the same client for repeated requests to the same runtime', async () => {
    const module = await import('./client.ts')
    const runtime: AnalysisServerRuntime = {
      id: 'runtime-a',
      port: '43123',
      host: '127.0.0.1',
    }

    const firstPromise = module.getQuickInfoAtPosition(
      '/project/src/a.ts',
      10,
      undefined,
      runtime
    )
    const secondPromise = module.getQuickInfoAtPosition(
      '/project/src/b.ts',
      20,
      undefined,
      runtime
    )
    await flushBrowserClientCallQueue()

    expect(mocks.instances).toHaveLength(1)
    const client = getMockBrowserClient(0)
    expect(client.runtime).toEqual(runtime)
    expect(client.close).not.toHaveBeenCalled()
    expect(client.callMethod).toHaveBeenCalledTimes(2)

    resolveNextPendingCall(client, { text: 'quick-info-a' })
    resolveNextPendingCall(client, { text: 'quick-info-b' })

    await expect(firstPromise).resolves.toEqual({ text: 'quick-info-a' })
    await expect(secondPromise).resolves.toEqual({ text: 'quick-info-b' })
  })

  it('replaces an idle client when a later request targets a different runtime', async () => {
    const module = await import('./client.ts')
    const primaryRuntime: AnalysisServerRuntime = {
      id: 'runtime-a',
      port: '43123',
      host: '127.0.0.1',
    }
    const secondaryRuntime: AnalysisServerRuntime = {
      id: 'runtime-b',
      port: '43124',
      host: '127.0.0.1',
    }

    const firstPromise = module.getQuickInfoAtPosition(
      '/project/src/a.ts',
      10,
      undefined,
      primaryRuntime
    )
    await flushBrowserClientCallQueue()
    const primaryClient = getMockBrowserClient(0)
    resolveNextPendingCall(primaryClient, { text: 'quick-info-a' })

    await expect(firstPromise).resolves.toEqual({ text: 'quick-info-a' })

    const secondPromise = module.getQuickInfoAtPosition(
      '/project/src/b.ts',
      20,
      undefined,
      secondaryRuntime
    )
    await flushBrowserClientCallQueue()

    expect(mocks.instances).toHaveLength(2)
    expect(primaryClient.close).toHaveBeenCalledTimes(1)

    const secondaryClient = getMockBrowserClient(1)
    expect(secondaryClient.runtime).toEqual(secondaryRuntime)

    resolveNextPendingCall(secondaryClient, { text: 'quick-info-b' })

    await expect(secondPromise).resolves.toEqual({ text: 'quick-info-b' })
  })

  it('invalidates cached explicit-runtime requests on relative refresh notifications', async () => {
    const module = await import('./client.ts')
    const runtime: AnalysisServerRuntime = {
      id: 'runtime-a',
      port: '43123',
      host: '127.0.0.1',
    }

    const firstPromise = module.getQuickInfoAtPosition(
      '/project/src/a.ts',
      10,
      undefined,
      runtime
    )
    await flushBrowserClientCallQueue()

    const client = getMockBrowserClient(0)
    resolveNextPendingCall(client, { text: 'quick-info-a' })
    await expect(firstPromise).resolves.toEqual({ text: 'quick-info-a' })

    const second = await module.getQuickInfoAtPosition(
      '/project/src/a.ts',
      10,
      undefined,
      runtime
    )
    expect(second).toEqual({ text: 'quick-info-a' })
    expect(client.callMethod).toHaveBeenCalledTimes(1)
    expect(client.on).toHaveBeenCalled()

    emitBrowserClientEvent(client, 'notification', {
      type: 'refresh',
      data: {
        refreshCursor: 1,
        filePaths: ['src/a.ts'],
      },
    })
    await Promise.resolve()
    await Promise.resolve()

    const thirdPromise = module.getQuickInfoAtPosition(
      '/project/src/a.ts',
      10,
      undefined,
      runtime
    )
    await flushBrowserClientCallQueue()

    expect(client.callMethod).toHaveBeenCalledTimes(2)
    resolveNextPendingCall(client, { text: 'quick-info-b' })
    await expect(thirdPromise).resolves.toEqual({ text: 'quick-info-b' })
  })

  it('scopes refresh invalidations to the runtime that emitted them', async () => {
    const module = await import('./client.ts')
    const retainedRuntime: AnalysisServerRuntime = {
      id: 'runtime-a',
      port: '43123',
      host: '127.0.0.1',
    }
    const explicitRuntime: AnalysisServerRuntime = {
      id: 'runtime-b',
      port: '43124',
      host: '127.0.0.1',
    }
    const originalWebSocket = globalThis.WebSocket
    if (originalWebSocket === undefined) {
      ;(globalThis as any).WebSocket = class MockWebSocket {}
    }

    const releaseRuntime =
      module.retainAnalysisClientBrowserRuntime(retainedRuntime)

    try {
      expect(mocks.instances).toHaveLength(1)
      const retainedClient = getMockBrowserClient(0)

      const firstRetainedPromise = module.getQuickInfoAtPosition(
        '/project/src/runtime-a.ts',
        10,
        undefined,
        retainedRuntime
      )
      await flushBrowserClientCallQueue()
      resolveNextPendingCall(retainedClient, { text: 'quick-info-a' })
      await expect(firstRetainedPromise).resolves.toEqual({
        text: 'quick-info-a',
      })

      const cachedRetained = await module.getQuickInfoAtPosition(
        '/project/src/runtime-a.ts',
        10,
        undefined,
        retainedRuntime
      )
      expect(cachedRetained).toEqual({ text: 'quick-info-a' })
      expect(retainedClient.callMethod).toHaveBeenCalledTimes(1)

      const firstExplicitPromise = module.getQuickInfoAtPosition(
        '/project/src/runtime-b.ts',
        20,
        undefined,
        explicitRuntime
      )
      await flushBrowserClientCallQueue()

      expect(mocks.instances).toHaveLength(2)
      const explicitClient = getMockBrowserClient(1)
      resolveNextPendingCall(explicitClient, { text: 'quick-info-b' })
      await expect(firstExplicitPromise).resolves.toEqual({
        text: 'quick-info-b',
      })

      const cachedExplicit = await module.getQuickInfoAtPosition(
        '/project/src/runtime-b.ts',
        20,
        undefined,
        explicitRuntime
      )
      expect(cachedExplicit).toEqual({ text: 'quick-info-b' })
      expect(explicitClient.callMethod).toHaveBeenCalledTimes(1)

      emitBrowserClientEvent(explicitClient, 'notification', {
        type: 'refresh',
        data: {
          refreshCursor: 1,
          filePaths: ['src/runtime-b.ts'],
        },
      })
      await Promise.resolve()
      await Promise.resolve()

      const retainedAfterRefresh = await module.getQuickInfoAtPosition(
        '/project/src/runtime-a.ts',
        10,
        undefined,
        retainedRuntime
      )
      expect(retainedAfterRefresh).toEqual({ text: 'quick-info-a' })
      expect(retainedClient.callMethod).toHaveBeenCalledTimes(1)

      const refreshedExplicitPromise = module.getQuickInfoAtPosition(
        '/project/src/runtime-b.ts',
        20,
        undefined,
        explicitRuntime
      )
      await flushBrowserClientCallQueue()
      expect(explicitClient.callMethod).toHaveBeenCalledTimes(2)
      resolveNextPendingCall(explicitClient, { text: 'quick-info-b-2' })
      await expect(refreshedExplicitPromise).resolves.toEqual({
        text: 'quick-info-b-2',
      })
    } finally {
      releaseRuntime()
      if (originalWebSocket === undefined) {
        delete (globalThis as { WebSocket?: typeof WebSocket }).WebSocket
      } else {
        ;(globalThis as { WebSocket?: typeof WebSocket }).WebSocket =
          originalWebSocket
      }
    }
  })
})

function resolveNextPendingCall(
  client: MockBrowserClientInstance | undefined,
  value: unknown
): void {
  const pendingCall = client?.pendingCalls.shift()
  if (!pendingCall) {
    throw new Error('[renoun] Expected a pending browser client call.')
  }

  pendingCall.resolve(value)
}

function getMockBrowserClient(index: number): MockBrowserClientInstance {
  const client = mocks.instances[index]
  if (!client) {
    throw new Error(`[renoun] Expected mock browser client ${index}.`)
  }

  return client
}

function emitBrowserClientEvent(
  client: MockBrowserClientInstance,
  eventName: string,
  payload: unknown
): void {
  const listener = client.listeners.get(eventName)
  if (!listener) {
    throw new Error(`[renoun] Expected browser client listener for ${eventName}.`)
  }

  listener(payload)
}

async function flushBrowserClientCallQueue(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}
