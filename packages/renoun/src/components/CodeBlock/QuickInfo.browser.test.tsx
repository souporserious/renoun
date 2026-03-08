import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

import { getProjectClientBrowserRuntime } from '../../project/browser-runtime.ts'
import {
  retainProjectClientBrowserRuntime,
  setProjectClientBrowserRuntime,
} from '../../project/browser-client-sync.ts'
import type { ProjectServerRuntime } from '../../project/runtime-env.ts'
import type { ConfigurationOptions } from '../Config/types.ts'
import { QuickInfoClientPopover } from './QuickInfoClientPopover.tsx'
import { QuickInfoProvider } from './QuickInfoProvider.tsx'
import { Symbol } from './Symbol.tsx'

interface JsonRpcRequest {
  id: number
  method: string
  params?: {
    filePath?: string
    position?: number
    value?: string
    theme?: unknown
    waitForWarmResult?: unknown
  }
}

interface QuickInfoFixture {
  displayText: string
  documentationText: string
}

type RpcCallCounters = {
  quickInfoByPosition: Map<number, number>
  quickInfoFailuresByPosition: Map<number, number>
  quickInfoByRuntimeKey: Map<string, number>
  tokensByValue: Map<string, number>
  tokensFailuresByValue: Map<string, number>
  tokensByThemeKey: Map<string, number>
  tokensWarmRequests: number
  socketsOpened: number
  sockets: Set<MockWebSocketInstance>
}

interface MockWebSocketInstance {
  readyState: number
  emitServerMessage: (payload: Record<string, unknown>) => void
}

const SHORT_SYMBOL_POSITION = 100
const LONG_SYMBOL_POSITION = 200
const RUNTIME: ProjectServerRuntime = {
  id: 'quick-info-browser-test',
  port: '43123',
  host: '127.0.0.1',
}
const THEME_CONFIG: ConfigurationOptions['theme'] = {
  light: 'github-light',
  dark: 'github-dark',
}
const QUICK_INFO_THEME = {
  border: '#2f81f7',
  background: '#0b1726',
  foreground: '#dbe4f0',
  panelBorder: '#35506f',
  errorForeground: '#ff8080',
}
const QUICK_INFO_BY_POSITION = new Map<number, QuickInfoFixture>([
  [
    SHORT_SYMBOL_POSITION,
    {
      displayText:
        '(alias) const History: (props: HistoryProps) => React.JSX.Element\nimport History',
      documentationText:
        'Streams export history from a repository ' +
        '[source](https://renoun.dev/docs).',
    },
  ],
  [
    LONG_SYMBOL_POSITION,
    {
      displayText:
        '(alias) class Directory<Types extends Record<string, any>>\nimport Directory',
      documentationText:
        'A directory containing files and subdirectories.\n\n' +
        'This longer payload is used to verify popover height can grow and shrink\n' +
        'between hover transitions without keeping stale dimensions.',
    },
  ],
])

describe('QuickInfo browser regression', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null
  let originalWebSocket: typeof WebSocket | undefined
  let counters: RpcCallCounters

  beforeEach(() => {
    counters = {
      quickInfoByPosition: new Map(),
      quickInfoFailuresByPosition: new Map(),
      quickInfoByRuntimeKey: new Map(),
      tokensByValue: new Map(),
      tokensFailuresByValue: new Map(),
      tokensByThemeKey: new Map(),
      tokensWarmRequests: 0,
      socketsOpened: 0,
      sockets: new Set(),
    }

    container = document.createElement('div')
    container.setAttribute('data-testid', 'quick-info-browser-root')
    document.body.appendChild(container)
    root = createRoot(container)
    document.documentElement.setAttribute('data-theme', 'dark')

    originalWebSocket = globalThis.WebSocket
    ;(globalThis as any).WebSocket = createMockWebSocket(counters)
  })

  afterEach(async () => {
    if (root) {
      root.unmount()
      root = null
    }

    if (container) {
      container.remove()
      container = null
    }

    document.body.querySelectorAll('.quick-info-popover').forEach((node) => {
      node.remove()
    })
    document.documentElement.removeAttribute('data-theme')
    setProjectClientBrowserRuntime(undefined)

    if (originalWebSocket) {
      ;(globalThis as any).WebSocket = originalWebSocket
    }
  })

  it('shows hover quick info quickly, applies theme token color, and reuses cache', async () => {
    renderQuickInfoFixture(root, 'baseline')
    const shortDisplayText = QUICK_INFO_BY_POSITION.get(
      SHORT_SYMBOL_POSITION
    )!.displayText

    await waitFor(
      () => Boolean(document.querySelector('[data-testid="symbol-short"]')),
      1_000
    )
    const symbol = getSymbolAnchor('symbol-short')
    const startMs = performance.now()
    hoverSymbol(symbol)

    await waitFor(() => {
      return getPopover()?.textContent?.includes(
        'Streams export history from a repository source.'
      )
    }, 1_000)
    const latencyMs = performance.now() - startMs
    expect(latencyMs).toBeLessThan(500)

    await waitFor(
      () => counters.tokensByValue.get(shortDisplayText) === 1,
      1_000
    )
    await waitFor(() => {
      const docsLink = getPopover()?.querySelector('a')
      return docsLink?.getAttribute('href') === 'https://renoun.dev/docs'
    }, 1_000)
    await waitFor(() => {
      const tokenNode = getPopover()?.querySelector('pre span')
      if (!tokenNode) {
        return false
      }

      return getComputedStyle(tokenNode as HTMLElement).color === 'rgb(0, 255, 0)'
    }, 1_000)
    const dividerNode = getPopover()?.querySelector(
      '[data-testid="quick-info-divider"]'
    )
    expect(dividerNode).toBeTruthy()
    expect(getComputedStyle(dividerNode as HTMLElement).backgroundColor).toBe(
      'rgb(53, 80, 111)'
    )

    const popoverNode = getPopover()
    expect(popoverNode).toBeTruthy()
    const popoverRect = (popoverNode as HTMLElement).getBoundingClientRect()
    const dividerRect = (dividerNode as HTMLElement).getBoundingClientRect()
    expect(Math.abs(dividerRect.left - popoverRect.left)).toBeLessThanOrEqual(2)
    expect(Math.abs(dividerRect.right - popoverRect.right)).toBeLessThanOrEqual(2)
    expect(popoverRect.width).toBeLessThan(460)

    const displayNode = getPopover()?.querySelector('[data-testid="quick-info-display"]')
    expect(displayNode).toBeTruthy()
    const displayStyles = getComputedStyle(displayNode as HTMLElement)
    expect(parseFloat(displayStyles.paddingTop)).toBeGreaterThanOrEqual(4)
    expect(parseFloat(displayStyles.paddingLeft)).toBeGreaterThanOrEqual(6)
    expect(parseFloat(displayStyles.paddingLeft)).toBeLessThanOrEqual(10)
    const docsLink = getPopover()?.querySelector('a')
    expect(docsLink?.textContent).toBe('source')

    leaveSymbol(symbol)
    await waitFor(() => !getPopover(), 1_000)

    hoverSymbol(symbol)
    await waitFor(() => Boolean(getPopover()), 1_000)

    expect(counters.quickInfoByPosition.get(SHORT_SYMBOL_POSITION)).toBe(1)
    expect(counters.tokensByValue.get(shortDisplayText)).toBe(1)
  })

  it('reuses the shared project client socket for follow-up token requests', async () => {
    renderQuickInfoFixture(root, 'socket-reuse')
    const shortDisplayText = QUICK_INFO_BY_POSITION.get(
      SHORT_SYMBOL_POSITION
    )!.displayText

    await waitFor(
      () => Boolean(document.querySelector('[data-testid="symbol-short"]')),
      1_000
    )
    const symbol = getSymbolAnchor('symbol-short')

    hoverSymbol(symbol)
    await waitFor(
      () => counters.quickInfoByPosition.get(SHORT_SYMBOL_POSITION) === 1,
      1_000
    )
    await waitFor(
      () =>
        counters.tokensByValue.get(
          QUICK_INFO_BY_POSITION.get(SHORT_SYMBOL_POSITION)!.displayText
        ) === 1,
      1_000
    )
    expect(counters.socketsOpened).toBe(2)
    document.documentElement.setAttribute('data-theme', 'light')
    await waitFor(
      () => counters.tokensByThemeKey.get(`${shortDisplayText}:light`) === 1,
      1_000
    )
    expect(counters.socketsOpened).toBe(2)
  })

  it('invalidates cached quick info when the rendered source signature changes', async () => {
    renderSignatureCacheFixture(root)

    await waitFor(
      () => Boolean(document.querySelector('[data-testid="symbol-signature-a"]')),
      1_000
    )
    await waitFor(
      () => Boolean(document.querySelector('[data-testid="symbol-signature-b"]')),
      1_000
    )

    const firstSymbol = getSymbolAnchor('symbol-signature-a')
    const secondSymbol = getSymbolAnchor('symbol-signature-b')

    hoverSymbol(firstSymbol)
    await waitFor(
      () => counters.quickInfoByPosition.get(SHORT_SYMBOL_POSITION) === 1,
      1_000
    )
    leaveSymbol(firstSymbol)
    await waitFor(() => !getPopover(), 1_000)

    hoverSymbol(secondSymbol)
    await waitFor(
      () => counters.quickInfoByPosition.get(SHORT_SYMBOL_POSITION) === 2,
      1_000
    )
  })

  it('re-highlights quick info when the active theme changes', async () => {
    renderQuickInfoFixture(root, 'theme-switch')
    const shortDisplayText = QUICK_INFO_BY_POSITION.get(
      SHORT_SYMBOL_POSITION
    )!.displayText
    await waitFor(
      () => Boolean(document.querySelector('[data-testid="symbol-short"]')),
      1_000
    )
    const symbol = getSymbolAnchor('symbol-short')

    hoverSymbol(symbol)
    await waitFor(() => {
      const tokenNode = getPopover()?.querySelector('pre span')
      if (!tokenNode) {
        return false
      }

      return getComputedStyle(tokenNode as HTMLElement).color === 'rgb(0, 255, 0)'
    }, 1_000)
    leaveSymbol(symbol)
    await waitFor(() => !getPopover(), 1_000)

    document.documentElement.setAttribute('data-theme', 'light')
    hoverSymbol(symbol)
    await waitFor(() => {
      const tokenNode = getPopover()?.querySelector('pre span')
      if (!tokenNode) {
        return false
      }

      return getComputedStyle(tokenNode as HTMLElement).color === 'rgb(255, 0, 0)'
    }, 1_000)

    expect(counters.quickInfoByPosition.get(SHORT_SYMBOL_POSITION)).toBe(1)
    expect(counters.tokensByThemeKey.get(`${shortDisplayText}:dark`)).toBe(1)
    expect(counters.tokensByThemeKey.get(`${shortDisplayText}:light`)).toBe(1)
    expect(counters.tokensWarmRequests).toBeGreaterThanOrEqual(2)
  })

  it('retries display tokenization after a transient transport failure', async () => {
    const shortDisplayText = QUICK_INFO_BY_POSITION.get(
      SHORT_SYMBOL_POSITION
    )!.displayText
    counters.tokensFailuresByValue.set(shortDisplayText, 1)
    renderQuickInfoFixture(root, 'token-transient-failure')

    await waitFor(
      () => Boolean(document.querySelector('[data-testid="symbol-short"]')),
      1_000
    )
    const symbol = getSymbolAnchor('symbol-short')

    hoverSymbol(symbol)
    await waitFor(
      () => counters.quickInfoByPosition.get(SHORT_SYMBOL_POSITION) === 1,
      1_000
    )
    await waitFor(() => counters.tokensByValue.get(shortDisplayText) === 1, 1_000)
    leaveSymbol(symbol)
    await waitFor(() => !getPopover(), 1_000)

    hoverSymbol(symbol)
    await waitFor(() => counters.tokensByValue.get(shortDisplayText) === 2, 1_000)
    await waitFor(() => {
      const tokenNode = getPopover()?.querySelector('pre span')
      if (!tokenNode) {
        return false
      }

      return getComputedStyle(tokenNode as HTMLElement).color === 'rgb(0, 255, 0)'
    }, 1_000)
  })

  it('re-highlights quick info when the active theme changes while the popover stays open', async () => {
    renderQuickInfoFixture(root, 'theme-switch-open')
    const shortDisplayText = QUICK_INFO_BY_POSITION.get(
      SHORT_SYMBOL_POSITION
    )!.displayText

    await waitFor(
      () => Boolean(document.querySelector('[data-testid="symbol-short"]')),
      1_000
    )
    const symbol = getSymbolAnchor('symbol-short')

    hoverSymbol(symbol)
    await waitFor(() => {
      const tokenNode = getPopover()?.querySelector('pre span')
      if (!tokenNode) {
        return false
      }

      return getComputedStyle(tokenNode as HTMLElement).color === 'rgb(0, 255, 0)'
    }, 1_000)

    document.documentElement.setAttribute('data-theme', 'light')
    await waitFor(() => {
      const tokenNode = getPopover()?.querySelector('pre span')
      if (!tokenNode) {
        return false
      }

      return getComputedStyle(tokenNode as HTMLElement).color === 'rgb(255, 0, 0)'
    }, 1_000)

    expect(counters.quickInfoByPosition.get(SHORT_SYMBOL_POSITION)).toBe(1)
    expect(counters.tokensByThemeKey.get(`${shortDisplayText}:dark`)).toBe(1)
    expect(counters.tokensByThemeKey.get(`${shortDisplayText}:light`)).toBe(1)
  })

  it('resizes between different hover targets without keeping stale dimensions', async () => {
    renderQuickInfoFixture(root, 'resize')

    await waitFor(
      () => Boolean(document.querySelector('[data-testid="symbol-short"]')),
      1_000
    )
    await waitFor(
      () => Boolean(document.querySelector('[data-testid="symbol-long"]')),
      1_000
    )
    const shortSymbol = getSymbolAnchor('symbol-short')
    const longSymbol = getSymbolAnchor('symbol-long')

    hoverSymbol(shortSymbol)
    await waitFor(() => {
      return getPopover()?.textContent?.includes(
        'Streams export history from a repository source.'
      )
    }, 1_000)
    const shortHeight = getPopoverHeight()
    const shortWidth = getPopoverWidth()

    hoverSymbol(longSymbol)
    await waitFor(() => {
      return getPopover()?.textContent?.includes(
        'This longer payload is used to verify popover height can grow and shrink'
      )
    }, 1_000)
    const longHeight = getPopoverHeight()
    const longWidth = getPopoverWidth()
    expect(longHeight).toBeGreaterThan(shortHeight + 24)

    hoverSymbol(shortSymbol)
    await waitFor(() => {
      return getPopover()?.textContent?.includes(
        'Streams export history from a repository source.'
      )
    }, 1_000)
    const shortHeightAgain = getPopoverHeight()
    const shortWidthAgain = getPopoverWidth()
    expect(shortHeightAgain).toBeLessThan(longHeight - 24)
    expect(shortWidthAgain).toBeLessThanOrEqual(shortWidth + 20)
  })

  it('re-fetches quick info after refresh invalidation without rerendering the code block', async () => {
    const releaseRuntime = retainProjectClientBrowserRuntime(RUNTIME)

    renderQuickInfoFixture(root, 'refresh-version')

    try {
      await waitFor(
        () => Boolean(document.querySelector('[data-testid="symbol-short"]')),
        1_000
      )
      const symbol = getSymbolAnchor('symbol-short')

      hoverSymbol(symbol)
      await waitFor(
        () => counters.quickInfoByPosition.get(SHORT_SYMBOL_POSITION) === 1,
        1_000
      )
      leaveSymbol(symbol)
      await waitFor(() => !getPopover(), 1_000)

      broadcastNotification(counters, {
        type: 'refresh',
        data: {
          refreshCursor: 1,
          filePaths: ['/tmp/history.refresh-version.ts'],
        },
      })

      hoverSymbol(symbol)
      await waitFor(
        () => counters.quickInfoByPosition.get(SHORT_SYMBOL_POSITION) === 2,
        1_000
      )
    } finally {
      releaseRuntime()
    }
  })

  it('retries quick info after a transient transport failure instead of caching an empty result', async () => {
    counters.quickInfoFailuresByPosition.set(SHORT_SYMBOL_POSITION, 1)
    renderQuickInfoFixture(root, 'transient-failure')

    await waitFor(
      () => Boolean(document.querySelector('[data-testid="symbol-short"]')),
      1_000
    )
    const symbol = getSymbolAnchor('symbol-short')

    hoverSymbol(symbol)
    await waitFor(
      () => counters.quickInfoByPosition.get(SHORT_SYMBOL_POSITION) === 1,
      1_000
    )
    await waitFor(() => {
      const popover = getPopover()
      return Boolean(
        popover && !popover.textContent?.includes('Loading symbol info...')
      )
    }, 1_000)

    leaveSymbol(symbol)
    await waitFor(() => !getPopover(), 1_000)

    hoverSymbol(symbol)
    await waitFor(
      () => counters.quickInfoByPosition.get(SHORT_SYMBOL_POSITION) === 2,
      1_000
    )
    await waitFor(() => {
      return getPopover()?.textContent?.includes(
        'Streams export history from a repository source.'
      )
    }, 1_000)
  })

  it('uses the updated active runtime for new hover requests without rerendering the code block', async () => {
    renderQuickInfoFixture(root, 'runtime-switch')

    await waitFor(
      () => Boolean(document.querySelector('[data-testid="symbol-short"]')),
      1_000
    )

    setProjectClientBrowserRuntime({
      id: 'quick-info-browser-test-updated',
      port: '43124',
      host: '::1',
    })

    const symbol = getSymbolAnchor('symbol-short')
    hoverSymbol(symbol)

    await waitFor(
      () =>
        counters.quickInfoByRuntimeKey.get(
          'quick-info-browser-test-updated@ws://[::1]:43124'
        ) === 1,
      1_000
    )
  })

  it('releases the active runtime when the popover unmounts', async () => {
    renderQuickInfoFixture(root, 'runtime-cleanup')

    await waitFor(
      () => Boolean(document.querySelector('[data-testid="symbol-short"]')),
      1_000
    )

    hoverSymbol(getSymbolAnchor('symbol-short'))

    await waitFor(
      () => getProjectClientBrowserRuntime()?.id === RUNTIME.id,
      1_000
    )
    expect(counters.sockets.size).toBe(2)

    root?.unmount()
    root = null

    await waitFor(() => getProjectClientBrowserRuntime() === undefined, 1_000)
    expect(counters.sockets.size).toBe(0)
  })
})

function renderQuickInfoFixture(root: Root | null, cacheScope: string) {
  if (!root) {
    throw new Error('Expected react root to exist.')
  }

  root.render(
    <QuickInfoProvider openDelay={0} closeDelay={0}>
      <div>
        <Symbol
          popover={
            <QuickInfoClientPopover
              request={{
                filePath: `/tmp/history.${cacheScope}.ts`,
                position: SHORT_SYMBOL_POSITION,
                runtime: RUNTIME,
                themeConfig: THEME_CONFIG,
              }}
              theme={QUICK_INFO_THEME}
              className="quick-info-popover"
            />
          }
        >
          <span data-testid="symbol-short">History</span>
        </Symbol>
        {'\n'}
        <Symbol
          popover={
            <QuickInfoClientPopover
              request={{
                filePath: `/tmp/directory.${cacheScope}.ts`,
                position: LONG_SYMBOL_POSITION,
                runtime: RUNTIME,
                themeConfig: THEME_CONFIG,
              }}
              theme={QUICK_INFO_THEME}
              className="quick-info-popover"
            />
          }
        >
          <span data-testid="symbol-long">Directory</span>
        </Symbol>
      </div>
    </QuickInfoProvider>
  )
}

function renderSignatureCacheFixture(root: Root | null) {
  if (!root) {
    throw new Error('Expected react root to exist.')
  }

  root.render(
    <QuickInfoProvider openDelay={0} closeDelay={0}>
      <div>
        <Symbol
          popover={
            <QuickInfoClientPopover
              request={{
                filePath: '/tmp/history.signature.ts',
                position: SHORT_SYMBOL_POSITION,
                runtime: RUNTIME,
                themeConfig: THEME_CONFIG,
                valueSignature: 'history-v1',
              }}
              theme={QUICK_INFO_THEME}
              className="quick-info-popover"
            />
          }
        >
          <span data-testid="symbol-signature-a">History A</span>
        </Symbol>
        {'\n'}
        <Symbol
          popover={
            <QuickInfoClientPopover
              request={{
                filePath: '/tmp/history.signature.ts',
                position: SHORT_SYMBOL_POSITION,
                runtime: RUNTIME,
                themeConfig: THEME_CONFIG,
                valueSignature: 'history-v2',
              }}
              theme={QUICK_INFO_THEME}
              className="quick-info-popover"
            />
          }
        >
          <span data-testid="symbol-signature-b">History B</span>
        </Symbol>
      </div>
    </QuickInfoProvider>
  )
}

function getPopover(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('.quick-info-popover')
}

function getPopoverHeight(): number {
  const popover = getPopover()
  if (!popover) {
    throw new Error('Expected quick info popover to be visible.')
  }

  return popover.getBoundingClientRect().height
}

function getPopoverWidth(): number {
  const popover = getPopover()
  if (!popover) {
    throw new Error('Expected quick info popover to be visible.')
  }

  return popover.getBoundingClientRect().width
}

function getSymbolAnchor(testId: string): HTMLElement {
  const label = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
  if (!label) {
    throw new Error(`Unable to find symbol label ${testId}.`)
  }

  const anchor = label.closest('span[id]')
  if (!(anchor instanceof HTMLElement)) {
    throw new Error(`Unable to resolve symbol anchor for ${testId}.`)
  }

  return anchor
}

function hoverSymbol(element: HTMLElement): void {
  element.dispatchEvent(
    new PointerEvent('pointerover', { bubbles: true, cancelable: true })
  )
  element.dispatchEvent(
    new MouseEvent('mouseover', { bubbles: true, cancelable: true })
  )
}

function leaveSymbol(element: HTMLElement): void {
  element.dispatchEvent(
    new PointerEvent('pointerout', { bubbles: true, cancelable: true })
  )
  element.dispatchEvent(
    new MouseEvent('mouseout', { bubbles: true, cancelable: true })
  )
}

async function waitFor(
  predicate: () => unknown,
  timeoutMs: number
): Promise<void> {
  const startedAt = performance.now()

  while (performance.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return
    }
    await sleep(16)
  }

  throw new Error(`Condition did not resolve within ${timeoutMs}ms.`)
}

function sleep(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs)
  })
}

function broadcastNotification(
  counters: RpcCallCounters,
  payload: Record<string, unknown>
): void {
  for (const socket of counters.sockets) {
    socket.emitServerMessage(payload)
  }
}

function createMockWebSocket(counters: RpcCallCounters): typeof WebSocket {
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
    readonly #runtimeKey: string

    constructor(url: string, protocol?: string | string[]) {
      super()
      const resolvedProtocol = Array.isArray(protocol)
        ? protocol[0]
        : protocol
      this.#runtimeKey = `${resolvedProtocol ?? 'unknown'}@${url}`
      counters.socketsOpened += 1
      counters.sockets.add(this)
      queueMicrotask(() => {
        this.readyState = MockWebSocket.OPEN
        const event = new Event('open')
        this.dispatchEvent(event)
        this.onopen?.(event)
      })
    }

    send(rawPayload: string): void {
      const request = JSON.parse(rawPayload) as JsonRpcRequest
      const response = resolveMockRpcResponse(this.#runtimeKey, request, counters)

      queueMicrotask(() => {
        if (this.readyState !== MockWebSocket.OPEN) {
          return
        }

        const event = new MessageEvent('message', {
          data: JSON.stringify(response),
        })
        this.dispatchEvent(event)
        this.onmessage?.(event)
      })
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
      counters.sockets.delete(this)
      const event = new Event('close')
      this.dispatchEvent(event)
      this.onclose?.(event)
    }
  }

  return MockWebSocket as unknown as typeof WebSocket
}

function resolveMockRpcResponse(
  runtimeKey: string,
  request: JsonRpcRequest,
  counters: RpcCallCounters
): Record<string, unknown> {
  if (request.method === 'getQuickInfoAtPosition') {
    const position = Number(request.params?.position)
    const quickInfo = QUICK_INFO_BY_POSITION.get(position)
    counters.quickInfoByPosition.set(
      position,
      (counters.quickInfoByPosition.get(position) ?? 0) + 1
    )
    counters.quickInfoByRuntimeKey.set(
      runtimeKey,
      (counters.quickInfoByRuntimeKey.get(runtimeKey) ?? 0) + 1
    )

    const remainingFailures =
      counters.quickInfoFailuresByPosition.get(position) ?? 0
    if (remainingFailures > 0) {
      counters.quickInfoFailuresByPosition.set(position, remainingFailures - 1)
      return {
        id: request.id,
        error: {
          code: -32000,
          message: 'Transient quick info failure',
        },
      }
    }

    return {
      id: request.id,
      result: quickInfo ?? null,
    }
  }

  if (request.method === 'getTokens') {
    const displayText = String(request.params?.value ?? '')
    const requestedThemeMode = getRequestedThemeMode(request.params?.theme)
    if (request.params?.waitForWarmResult === true) {
      counters.tokensWarmRequests += 1
    }
    counters.tokensByValue.set(
      displayText,
      (counters.tokensByValue.get(displayText) ?? 0) + 1
    )
    const tokenThemeKey = `${displayText}:${requestedThemeMode}`
    counters.tokensByThemeKey.set(
      tokenThemeKey,
      (counters.tokensByThemeKey.get(tokenThemeKey) ?? 0) + 1
    )

    const remainingFailures = counters.tokensFailuresByValue.get(displayText) ?? 0
    if (remainingFailures > 0) {
      counters.tokensFailuresByValue.set(displayText, remainingFailures - 1)
      return {
        id: request.id,
        error: {
          code: -32000,
          message: 'Transient getTokens failure',
        },
      }
    }

    return {
      id: request.id,
      result: displayText.split('\n').map((line) => {
        return [
          {
            value: line,
            style:
              requestedThemeMode === 'light'
                ? { color: 'rgb(255, 0, 0)' }
                : requestedThemeMode === 'dark'
                  ? { color: 'rgb(0, 255, 0)' }
                  : {
                      '--0fg': 'rgb(255, 0, 0)',
                      '--1fg': 'rgb(0, 255, 0)',
                    },
          },
        ]
      }),
    }
  }

  return {
    id: request.id,
    error: {
      code: -32601,
      message: `Unknown method: ${request.method}`,
    },
  }
}

function getRequestedThemeMode(theme: unknown): 'light' | 'dark' | 'unknown' {
  if (typeof theme === 'string') {
    if (theme.includes('light')) {
      return 'light'
    }

    if (theme.includes('dark')) {
      return 'dark'
    }

    return 'unknown'
  }

  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) {
    return 'unknown'
  }

  const mode = Object.keys(theme)[0]
  if (mode === 'light' || mode === 'dark') {
    return mode
  }

  return 'unknown'
}
