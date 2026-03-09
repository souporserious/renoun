import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectServerRuntime } from './runtime-env.ts'

interface PendingCall {
  method: string
  params: Record<string, unknown>
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

interface MockBrowserClientInstance {
  runtime: ProjectServerRuntime | undefined
  callMethod: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  removeAllListeners: ReturnType<typeof vi.fn>
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
        runtime?: ProjectServerRuntime
      ) {
        const pendingCalls: PendingCall[] = []
        const instance: MockBrowserClientInstance = {
          runtime,
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
          removeAllListeners: vi.fn(),
        }

        mocks.instances.push(instance)
        return instance
      }
    )
  })

  afterEach(async () => {
    const runtimeModule = await import('./browser-runtime.ts')
    runtimeModule.setProjectClientBrowserRuntime(undefined)

    const module = await import('./client.ts')
    module.__TEST_ONLY__.clearProjectClientRpcState()
    module.__TEST_ONLY__.disposeProjectBrowserClient()
  })

  it('reuses the same client for repeated requests to the same runtime', async () => {
    const module = await import('./client.ts')
    const runtime: ProjectServerRuntime = {
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
    const primaryRuntime: ProjectServerRuntime = {
      id: 'runtime-a',
      port: '43123',
      host: '127.0.0.1',
    }
    const secondaryRuntime: ProjectServerRuntime = {
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

async function flushBrowserClientCallQueue(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}
