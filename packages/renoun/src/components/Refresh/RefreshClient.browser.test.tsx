import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

import { setProjectClientBrowserRuntime } from '../../project/client.ts'
import { getProjectClientBrowserRuntime } from '../../project/browser-runtime.ts'
import { RefreshClient } from './RefreshClient.tsx'

interface MockSocketCounters {
  openedUrls: string[]
  closedUrls: string[]
  sockets: MockWebSocketInstance[]
  activeSockets: Set<MockWebSocketInstance>
}

interface MockWebSocketInstance extends EventTarget {
  readonly sentMessages: string[]
  emitMessage(payload: unknown): void
  readyState: number
  close(): void
}

describe('RefreshClient browser lifecycle', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null
  let originalWebSocket: typeof WebSocket | undefined
  let counters: MockSocketCounters

  beforeEach(() => {
    counters = {
      openedUrls: [],
      closedUrls: [],
      sockets: [],
      activeSockets: new Set(),
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    originalWebSocket = globalThis.WebSocket
    ;(globalThis as any).WebSocket = createMockWebSocket(counters)
  })

  afterEach(() => {
    if (root) {
      root.unmount()
      root = null
    }

    if (container) {
      container.remove()
      container = null
    }

    setProjectClientBrowserRuntime(undefined)
    delete (window as any).nd
    ;(globalThis as any).WebSocket = originalWebSocket
  })

  it('releases the retained runtime and websocket on unmount', async () => {
    root?.render(
      <RefreshClient
        port="43123"
        id="refresh-browser-test"
        host="127.0.0.1"
      />
    )

    await waitFor(
      () => getProjectClientBrowserRuntime()?.id === 'refresh-browser-test',
      1_000
    )

    expect(getProjectClientBrowserRuntime()).toEqual({
      id: 'refresh-browser-test',
      port: '43123',
      host: '127.0.0.1',
    })
    expect(counters.openedUrls).toEqual(['ws://127.0.0.1:43123'])
    expect(counters.activeSockets.size).toBe(1)

    root?.unmount()
    root = null

    await waitFor(() => getProjectClientBrowserRuntime() === undefined, 1_000)
    expect(counters.closedUrls).toEqual(['ws://127.0.0.1:43123'])
    expect(counters.activeSockets.size).toBe(0)
  })

  it('reloads the page when reconnect resync fails', async () => {
    const hmrRefresh = vi.fn()
    ;(window as any).nd = {
      router: {
        hmrRefresh,
      },
    }

    root?.render(
      <RefreshClient
        port="43123"
        id="refresh-browser-test"
        host="127.0.0.1"
      />
    )

    await waitFor(
      () => getProjectClientBrowserRuntime()?.id === 'refresh-browser-test',
      1_000
    )
    await waitFor(() => counters.sockets.length === 1, 1_000)

    const initialSocket = counters.sockets[0]
    if (!initialSocket) {
      throw new Error('[renoun] expected initial refresh socket')
    }

    initialSocket.close()

    await waitFor(() => counters.sockets.length === 2, 1_000)
    const reconnectSocket = counters.sockets[1]
    if (!reconnectSocket) {
      throw new Error('[renoun] expected reconnect refresh socket')
    }

    await waitFor(() => reconnectSocket.sentMessages.length === 1, 1_000)
    const request = JSON.parse(reconnectSocket.sentMessages[0] ?? '{}') as {
      id?: number
      method?: string
    }
    expect(request.method).toBe('getRefreshInvalidationsSince')

    reconnectSocket.emitMessage({
      id: request.id,
      error: {
        message: 'server restarting',
      },
    })

    await waitFor(() => hmrRefresh.mock.calls.length === 1, 1_000)
  })
})

function createMockWebSocket(counters: MockSocketCounters): typeof WebSocket {
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
    sentMessages: string[] = []
    readonly #url: string

    constructor(url: string) {
      super()
      this.#url = url
      counters.openedUrls.push(url)
      counters.sockets.push(this)
      counters.activeSockets.add(this)

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

    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
      this.sentMessages.push(typeof data === 'string' ? data : '')
    }

    emitMessage(payload: unknown): void {
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
      counters.closedUrls.push(this.#url)
      counters.activeSockets.delete(this)
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
