import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  retainProjectClientBrowserRuntime,
  setProjectClientBrowserRuntime,
} from './browser-client-sync.ts'
import {
  getProjectClientBrowserRuntime,
  getProjectClientBrowserRefreshVersion,
  setProjectClientBrowserRefreshVersion,
} from './browser-runtime.ts'

interface JsonRpcRequest {
  id: number
  method: string
  params?: {
    sinceCursor?: number
  }
}

interface MockSocketController {
  openedUrls: string[]
  closedUrls: string[]
  instances: MockWebSocketInstance[]
}

interface MockWebSocketInstance {
  readyState: number
  sentRequests: JsonRpcRequest[]
  emitServerMessage: (payload: Record<string, unknown>) => void
  close: () => void
}

describe('browser-client-sync', () => {
  let originalWebSocket: typeof WebSocket | undefined
  let controller: MockSocketController

  beforeEach(() => {
    controller = {
      openedUrls: [],
      closedUrls: [],
      instances: [],
    }

    originalWebSocket = globalThis.WebSocket
    ;(globalThis as any).WebSocket = createMockWebSocket(controller)
    setProjectClientBrowserRuntime(undefined)
    setProjectClientBrowserRefreshVersion('0:0')
  })

  afterEach(() => {
    setProjectClientBrowserRuntime(undefined)
    setProjectClientBrowserRefreshVersion('0:0')
    ;(globalThis as any).WebSocket = originalWebSocket
  })

  it('resets the cursor when switching runtimes', async () => {
    setProjectClientBrowserRefreshVersion('7:3')
    setProjectClientBrowserRuntime({
      id: 'runtime-a',
      port: '43123',
      host: '127.0.0.1',
    })

    await waitFor(() => controller.instances.length === 1, 1_000)
    expect(getProjectClientBrowserRefreshVersion()).toBe('7:3')

    setProjectClientBrowserRuntime({
      id: 'runtime-b',
      port: '43124',
      host: '127.0.0.1',
    })

    await waitFor(() => controller.instances.length === 2, 1_000)

    expect(getProjectClientBrowserRefreshVersion()).toBe('0:4')
    expect(controller.openedUrls).toEqual([
      'ws://127.0.0.1:43123',
      'ws://127.0.0.1:43124',
    ])
    expect(controller.closedUrls).toEqual(['ws://127.0.0.1:43123'])
  })

  it('syncs to a lower cursor after a full refresh resync', async () => {
    setProjectClientBrowserRefreshVersion('5:2')
    setProjectClientBrowserRuntime({
      id: 'runtime-resync',
      port: '43123',
      host: '127.0.0.1',
    })

    await waitFor(() => controller.instances.length === 1, 1_000)
    controller.instances[0]?.close()

    await waitFor(() => controller.instances.length === 2, 1_000)

    const reconnectSocket = controller.instances[1]
    await waitFor(() => reconnectSocket.sentRequests.length === 1, 1_000)

    expect(reconnectSocket.sentRequests[0]).toMatchObject({
      method: 'getRefreshInvalidationsSince',
      params: {
        sinceCursor: 5,
      },
    })

    reconnectSocket.emitServerMessage({
      id: reconnectSocket.sentRequests[0]?.id,
      result: {
        nextCursor: 0,
        fullRefresh: true,
      },
    })

    await waitFor(
      () => getProjectClientBrowserRefreshVersion() === '0:3',
      1_000
    )

    reconnectSocket.close()
    await waitFor(() => controller.instances.length === 3, 1_000)

    const secondReconnectSocket = controller.instances[2]
    await waitFor(
      () => secondReconnectSocket.sentRequests.length === 1,
      1_000
    )

    expect(secondReconnectSocket.sentRequests[0]).toMatchObject({
      method: 'getRefreshInvalidationsSince',
      params: {
        sinceCursor: 0,
      },
    })

    secondReconnectSocket.emitServerMessage({
      id: secondReconnectSocket.sentRequests[0]?.id,
      result: {
        nextCursor: 0,
        fullRefresh: false,
      },
    })
  })

  it('does not discard retained runtimes when clearing the explicit runtime', async () => {
    const releaseRuntime = retainProjectClientBrowserRuntime({
      id: 'runtime-retained',
      port: '43123',
      host: '127.0.0.1',
    })

    try {
      await waitFor(
        () => getProjectClientBrowserRuntime()?.id === 'runtime-retained',
        1_000
      )
      await waitFor(() => controller.instances.length === 1, 1_000)

      setProjectClientBrowserRuntime(undefined)

      await waitFor(
        () => getProjectClientBrowserRuntime()?.id === 'runtime-retained',
        1_000
      )
      expect(controller.openedUrls).toEqual(['ws://127.0.0.1:43123'])
      expect(controller.closedUrls).toEqual([])
    } finally {
      releaseRuntime()
    }
  })
})

function createMockWebSocket(
  controller: MockSocketController
): typeof WebSocket {
  class MockWebSocket extends EventTarget {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3

    readyState = MockWebSocket.CONNECTING
    onopen: ((event: Event) => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: ((event: Event) => void) | null = null
    onclose: ((event: Event) => void) | null = null
    readonly #url: string
    readonly sentRequests: JsonRpcRequest[] = []

    constructor(url: string) {
      super()
      this.#url = url
      controller.openedUrls.push(url)
      controller.instances.push(this)

      queueMicrotask(() => {
        if (this.readyState !== MockWebSocket.CONNECTING) {
          return
        }

        this.readyState = MockWebSocket.OPEN
        const event = new Event('open')
        this.dispatchEvent(event)
        this.onopen?.(event)
      })
    }

    send(rawPayload: string): void {
      this.sentRequests.push(JSON.parse(rawPayload) as JsonRpcRequest)
    }

    emitServerMessage(payload: Record<string, unknown>): void {
      if (this.readyState !== MockWebSocket.OPEN) {
        return
      }

      const event = new MessageEvent('message', {
        data: JSON.stringify(payload),
      })
      this.dispatchEvent(event)
      this.onmessage?.(event)
    }

    close(): void {
      if (this.readyState === MockWebSocket.CLOSED) {
        return
      }

      this.readyState = MockWebSocket.CLOSED
      controller.closedUrls.push(this.#url)
      const event = new Event('close')
      this.dispatchEvent(event)
      this.onclose?.(event)
    }
  }

  return MockWebSocket as unknown as typeof WebSocket
}

async function waitFor(
  predicate: () => boolean | undefined,
  timeoutMs: number
): Promise<void> {
  const startMs = performance.now()

  while (performance.now() - startMs < timeoutMs) {
    if (predicate()) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  throw new Error('[renoun] Timed out waiting for browser assertion')
}
