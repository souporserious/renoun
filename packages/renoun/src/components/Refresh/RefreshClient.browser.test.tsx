import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

import { setProjectClientBrowserRuntime } from '../../project/browser-client-sync.ts'
import { getProjectClientBrowserRuntime } from '../../project/browser-runtime.ts'
import { RefreshClient } from './RefreshClient.tsx'

interface MockSocketCounters {
  openedUrls: string[]
  closedUrls: string[]
  sockets: Set<EventTarget>
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
      sockets: new Set(),
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
    expect(counters.sockets.size).toBe(1)

    root?.unmount()
    root = null

    await waitFor(() => getProjectClientBrowserRuntime() === undefined, 1_000)
    expect(counters.closedUrls).toEqual(['ws://127.0.0.1:43123'])
    expect(counters.sockets.size).toBe(0)
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
    readonly #url: string

    constructor(url: string) {
      super()
      this.#url = url
      counters.openedUrls.push(url)
      counters.sockets.add(this)

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

    send(): void {}

    close(): void {
      if (this.readyState === MockWebSocket.CLOSED) {
        return
      }

      this.readyState = MockWebSocket.CLOSED
      counters.closedUrls.push(this.#url)
      counters.sockets.delete(this)
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
