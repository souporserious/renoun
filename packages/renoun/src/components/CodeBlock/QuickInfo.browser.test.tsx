import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

vi.mock('@renoun/mdx', async () => {
  const React = await import('react')

  return {
    getMarkdownContent: async ({ source }: { source: string }) => {
      return React.createElement('p', null, source)
    },
  }
})

vi.mock('@renoun/mdx/rehype', () => ({
  rehypePlugins: [],
}))

vi.mock('@renoun/mdx/remark', () => ({
  remarkPlugins: [],
}))

import {
  __TEST_ONLY__ as ANALYSIS_BROWSER_CLIENT_TEST_ONLY__,
  setAnalysisClientBrowserRuntime,
} from '../../analysis/browser-client.ts'
import type { AnalysisServerRuntime } from '../../analysis/runtime-env.ts'
import type { ConfigurationOptions } from '../Config/types.ts'
import {
  DefaultQuickInfoPopover,
  QuickInfoProvider,
} from './QuickInfoProvider.tsx'
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

type RpcCallCounters = {
  tokensByThemeKey: Map<string, number>
  quickInfoByRequestKey: Map<string, number>
}

const RUNTIME: AnalysisServerRuntime = {
  id: 'quick-info-browser-test',
  port: '43123',
  host: '127.0.0.1',
}

const THEME_CONFIG: ConfigurationOptions['theme'] = {
  light: 'github-light',
  dark: 'github-dark',
}
const SINGLE_THEME_CONFIG: ConfigurationOptions['theme'] = 'github-dark'

const QUICK_INFO_THEME = {
  border: '#2f81f7',
  background: '#0b1726',
  foreground: '#dbe4f0',
  panelBorder: '#35506f',
  errorForeground: '#ff8080',
}

const QUICK_INFO = {
  displayText:
    'const posts: Directory<{}, MergeRecord<DefaultModuleTypes, {}>, DirectoryLoader>',
  documentationText: '',
}
const TOKEN_CLASS_NAME = '\u00d7'

describe('QuickInfo browser integration', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null
  let styleElement: HTMLStyleElement | null = null
  let originalWebSocket: typeof WebSocket | undefined
  let counters: RpcCallCounters

  beforeEach(() => {
    counters = {
      tokensByThemeKey: new Map(),
      quickInfoByRequestKey: new Map(),
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    document.documentElement.setAttribute('data-theme', 'dark')
    styleElement = document.createElement('style')
    styleElement.textContent = `
      .${TOKEN_CLASS_NAME} {
        color: var(--0);
        font-style: var(--00);
        font-weight: var(--01);
        text-decoration: var(--02);
      }
      [data-theme="light"] .${TOKEN_CLASS_NAME} {
        --0: var(--0fg, inherit);
        --00: var(--0fs, normal);
        --01: var(--0fw, normal);
        --02: var(--0td, none);
      }
      [data-theme="dark"] .${TOKEN_CLASS_NAME} {
        --0: var(--1fg, inherit);
        --00: var(--1fs, normal);
        --01: var(--1fw, normal);
        --02: var(--1td, none);
      }
    `
    document.head.appendChild(styleElement)

    originalWebSocket = globalThis.WebSocket
    ;(globalThis as any).WebSocket = createMockWebSocket(counters)
    ANALYSIS_BROWSER_CLIENT_TEST_ONLY__.clearAnalysisClientRpcState()
    ANALYSIS_BROWSER_CLIENT_TEST_ONLY__.disposeAnalysisBrowserClient()
    ANALYSIS_BROWSER_CLIENT_TEST_ONLY__.setAnalysisClientRefreshVersion('0:0')
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
    if (styleElement) {
      styleElement.remove()
      styleElement = null
    }

    document.documentElement.removeAttribute('data-theme')
    setAnalysisClientBrowserRuntime(undefined)
    ANALYSIS_BROWSER_CLIENT_TEST_ONLY__.clearAnalysisClientRpcState()
    ANALYSIS_BROWSER_CLIENT_TEST_ONLY__.disposeAnalysisBrowserClient()
    ANALYSIS_BROWSER_CLIENT_TEST_ONLY__.setAnalysisClientRefreshVersion('0:0')
    ;(globalThis as any).WebSocket = originalWebSocket
  })

  it('applies themed token colors to quick info display text', async () => {
    renderQuickInfoFixture(root, {
      tokenThemeConfig: THEME_CONFIG,
    })

    const symbol = await waitForSymbol('symbol-short')
    hoverSymbol(symbol)

    await waitFor(() => {
      const popover = getPopover()
      const tokenNode = popover?.querySelector('pre span')
      if (!(tokenNode instanceof HTMLElement)) {
        return false
      }

      return (
        popover?.getAttribute('data-theme') === 'dark' &&
        getComputedStyle(tokenNode).color === 'rgb(0, 255, 0)'
      )
    }, 1_000)

    expect(counters.tokensByThemeKey.get(`${QUICK_INFO.displayText}:multi`)).toBe(
      1
    )

    leaveSymbol(symbol)
    await waitFor(() => !getPopover(), 1_000)

    const themeRoot = document.querySelector<HTMLElement>(
      '[data-testid="theme-root"]'
    )
    if (!themeRoot) {
      throw new Error('Expected themed quick info root to exist.')
    }

    themeRoot.setAttribute('data-theme', 'light')
    document.documentElement.setAttribute('data-theme', 'light')
    hoverSymbol(symbol)

    await waitFor(() => {
      const popover = getPopover()
      const tokenNode = popover?.querySelector('pre span')
      if (!(tokenNode instanceof HTMLElement)) {
        return false
      }

      return (
        popover?.getAttribute('data-theme') === 'light' &&
        getComputedStyle(tokenNode).color === 'rgb(255, 0, 0)'
      )
    }, 1_000)

    expect(counters.tokensByThemeKey.get(`${QUICK_INFO.displayText}:multi`)).toBe(
      1
    )
  })

  it('applies single-theme token colors to quick info display text', async () => {
    renderQuickInfoFixture(root, {
      tokenThemeConfig: SINGLE_THEME_CONFIG,
    })

    const symbol = await waitForSymbol('symbol-short')
    hoverSymbol(symbol)

    await waitFor(() => {
      const popover = getPopover()
      const tokenNode = popover?.querySelector('pre span')
      if (!(tokenNode instanceof HTMLElement)) {
        return false
      }

      return getComputedStyle(tokenNode).color === 'rgb(0, 255, 0)'
    }, 1_000)

    expect(counters.tokensByThemeKey.get(`${QUICK_INFO.displayText}:dark`)).toBe(
      1
    )
  })

  it('resolves request-only quick info on hover and reuses the cached result', async () => {
    renderQuickInfoFixture(root, {
      tokenThemeConfig: THEME_CONFIG,
      entries: [
        {
          id: 'symbol-short',
          request: {
            cacheKey: '/virtual/example.tsx:6',
            filePath: '/virtual/example.tsx',
            position: 6,
            sourceMetadata: {
              value: 'const Directory = 1',
              language: 'tsx',
            },
          },
        },
      ],
    })

    const symbol = await waitForSymbol('symbol-short')
    hoverSymbol(symbol)

    await waitFor(() => {
      const popover = getPopover()
      return Boolean(popover)
    }, 1_000)

    await waitFor(() => {
      const popover = getPopover()
      const tokenNode = popover?.querySelector('pre span')
      if (!(tokenNode instanceof HTMLElement)) {
        return false
      }

      return getComputedStyle(tokenNode).color === 'rgb(0, 255, 0)'
    }, 1_000)

    expect(counters.quickInfoByRequestKey.get('/virtual/example.tsx:6')).toBe(1)
    expect(counters.tokensByThemeKey.get(`${QUICK_INFO.displayText}:multi`)).toBe(
      1
    )

    leaveSymbol(symbol)
    await waitFor(() => !getPopover(), 1_000)

    hoverSymbol(symbol)

    await waitFor(() => {
      const popover = getPopover()
      const tokenNode = popover?.querySelector('pre span')
      if (!(tokenNode instanceof HTMLElement)) {
        return false
      }

      return getComputedStyle(tokenNode).color === 'rgb(0, 255, 0)'
    }, 1_000)

    expect(counters.quickInfoByRequestKey.get('/virtual/example.tsx:6')).toBe(1)
    expect(counters.tokensByThemeKey.get(`${QUICK_INFO.displayText}:multi`)).toBe(
      1
    )
  })
})

function renderQuickInfoFixture(
  root: Root | null,
  options: {
    tokenThemeConfig: ConfigurationOptions['theme']
    entries?: Array<Record<string, unknown>>
  }
) {
  if (!root) {
    throw new Error('Expected react root to exist.')
  }

  root.render(
    <QuickInfoProvider
      openDelay={0}
      closeDelay={0}
      entries={
        options.entries ?? [
          {
            id: 'symbol-short',
            quickInfo: QUICK_INFO,
          },
        ]
      }
      popoverTheme={QUICK_INFO_THEME}
      PopoverComponent={(props) => (
        <DefaultQuickInfoPopover {...props} className="quick-info-popover" />
      )}
      tokenThemeConfig={options.tokenThemeConfig}
      tokenRuntime={RUNTIME}
      tokenLanguages={['typescript']}
    >
      <div data-testid="theme-root" data-theme="dark">
        <Symbol quickInfoId="symbol-short">
          <span data-testid="symbol-short">Directory</span>
        </Symbol>
      </div>
    </QuickInfoProvider>
  )
}

function getPopover(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('.quick-info-popover')
}

async function waitForSymbol(testId: string): Promise<HTMLElement> {
  await waitFor(
    () => Boolean(document.querySelector(`[data-testid="${testId}"]`)),
    1_000
  )
  return getSymbolAnchor(testId)
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
    await new Promise((resolve) => setTimeout(resolve, 16))
  }

  throw new Error(`Condition did not resolve within ${timeoutMs}ms.`)
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
    const filePath = String(request.params?.filePath ?? '')
    const position = Number(request.params?.position ?? -1)
    const requestKey = `${filePath}:${position}`

    counters.quickInfoByRequestKey.set(
      requestKey,
      (counters.quickInfoByRequestKey.get(requestKey) ?? 0) + 1
    )

    return {
      id: request.id,
      result: QUICK_INFO,
    }
  }

  if (request.method === 'getTokens') {
    const displayText = String(request.params?.value ?? '')
    const requestedThemeMode = getRequestedThemeMode(request.params?.theme)
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
              requestedThemeMode === 'multi'
                ? {
                    '--0fg': 'rgb(255, 0, 0)',
                    '--1fg': 'rgb(0, 255, 0)',
                  }
                : requestedThemeMode === 'light'
                  ? { color: 'rgb(255, 0, 0)' }
                  : { color: 'rgb(0, 255, 0)' },
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

function getRequestedThemeMode(
  theme: unknown
): 'light' | 'dark' | 'multi' | 'unknown' {
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

  const themeKeys = Object.keys(theme)
  if (themeKeys.length > 1) {
    return 'multi'
  }

  const mode = themeKeys[0]
  if (mode === 'light' || mode === 'dark') {
    return mode
  }

  return 'unknown'
}
