import React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

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
  tokensByValue: Map<string, number>
  tokensByThemeKey: Map<string, number>
  tokensWarmRequests: number
}

const SHORT_SYMBOL_POSITION = 100
const LONG_SYMBOL_POSITION = 200
const RUNTIME: ProjectServerRuntime = { id: 'quick-info-browser-test', port: '43123' }
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
      tokensByValue: new Map(),
      tokensByThemeKey: new Map(),
      tokensWarmRequests: 0,
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

    constructor(_url: string, _protocol?: string | string[]) {
      super()
      queueMicrotask(() => {
        this.readyState = MockWebSocket.OPEN
        const event = new Event('open')
        this.dispatchEvent(event)
        this.onopen?.(event)
      })
    }

    send(rawPayload: string): void {
      const request = JSON.parse(rawPayload) as JsonRpcRequest
      const response = resolveMockRpcResponse(request, counters)

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

    close(): void {
      if (this.readyState === MockWebSocket.CLOSED) {
        return
      }

      this.readyState = MockWebSocket.CLOSED
      const event = new Event('close')
      this.dispatchEvent(event)
      this.onclose?.(event)
    }
  }

  return MockWebSocket as unknown as typeof WebSocket
}

function resolveMockRpcResponse(
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
