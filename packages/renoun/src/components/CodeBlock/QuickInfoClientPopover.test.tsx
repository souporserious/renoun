import React from 'react'
import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetQuickInfoAtPosition = vi.fn()
const mockGetTokens = vi.fn()

vi.mock('../../analysis/browser-client.ts', () => ({
  getAnalysisClientBrowserRuntime: () => undefined,
  getAnalysisClientRefreshVersion: () => '0:0',
  getAnalysisClientRetainedBrowserRuntimeActivationKey: () => undefined,
  getQuickInfoAtPosition: (
    ...args: Parameters<typeof mockGetQuickInfoAtPosition>
  ) => mockGetQuickInfoAtPosition(...args),
  getTokens: (...args: Parameters<typeof mockGetTokens>) => mockGetTokens(...args),
  hasRetainedAnalysisClientBrowserRuntime: () => false,
  onAnalysisClientBrowserRuntimeRetentionChange: () => () => {},
  onAnalysisClientBrowserRefreshNotification: () => () => {},
  onAnalysisClientBrowserRuntimeChange: () => () => {},
  onAnalysisClientRefreshVersionChange: () => () => {},
}))

import { __TEST_ONLY__ } from './QuickInfoClientState.tsx'
import { __TEST_ONLY__ as QUICK_INFO_CLIENT_POPOVER_TEST_ONLY__ } from './QuickInfoClientPopover.tsx'

type QuickInfoRequest = Parameters<
  (typeof __TEST_ONLY__)['getQuickInfoForRequest']
>[0]

const BASE_REQUEST: QuickInfoRequest = {
  filePath: '/tmp/history.ts',
  position: 42,
  analysisVersion: 'quick-info-cache-test:0:0',
  runtime: {
    id: 'quick-info-cache-test',
    port: '43123',
    host: '127.0.0.1',
  },
}

async function renderToStringAsync(
  element: React.ReactElement,
  timeoutMs = 30_000
) {
  return new Promise<string>((resolve, reject) => {
    const stream = new PassThrough()
    const chunks: Buffer[] = []
    let settled = false
    const finish = (error?: unknown) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      if (error) {
        reject(error)
      } else {
        resolve(Buffer.concat(chunks).toString('utf8'))
      }
    }

    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    stream.on('error', (error) => finish(error))
    stream.on('end', () => finish())

    const { pipe, abort } = renderToPipeableStream(element, {
      onAllReady() {
        pipe(stream)
      },
      onShellError(error) {
        finish(error)
      },
      onError(error) {
        finish(error)
      },
    })

    const timeout = setTimeout(() => {
      try {
        abort()
      } catch {
        // ignore
      }
      finish(new Error(`renderToStringAsync timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })
}

beforeEach(() => {
  QUICK_INFO_CLIENT_POPOVER_TEST_ONLY__.clearQuickInfoDocumentationContentCache()
})

describe('QuickInfoClientPopover cache behavior', () => {
  it('routes quick info requests through the runtime carried on the request', async () => {
    mockGetQuickInfoAtPosition.mockReset()
    const runtime = {
      id: 'quick-info-cache-test-secondary',
      port: '43124',
      host: '::1',
    } as const

    mockGetQuickInfoAtPosition.mockResolvedValueOnce({
      displayText: 'runtime-specific',
      documentationText: 'Runtime specific docs',
    })

    await __TEST_ONLY__.getQuickInfoForRequest({
      ...BASE_REQUEST,
      analysisVersion: 'quick-info-cache-test:runtime',
      runtime,
    })

    expect(mockGetQuickInfoAtPosition).toHaveBeenCalledWith(
      '/tmp/history.ts',
      42,
      undefined,
      runtime,
      '["quick-info-cache-test:runtime","quick-info-cache-test-secondary:::1:43124","","/tmp/history.ts",42]',
      undefined
    )
  })

  it('forwards synthetic snippet source metadata with deferred quick info requests', async () => {
    mockGetQuickInfoAtPosition.mockReset()
    mockGetQuickInfoAtPosition.mockResolvedValueOnce({
      displayText: 'runtime-specific',
      documentationText: 'Runtime specific docs',
    })

    await __TEST_ONLY__.getQuickInfoForRequest({
      ...BASE_REQUEST,
      filePath: '/tmp/history.__renoun_snippet_sig_1.ts',
      valueSignature: 'sig-1',
      sourceMetadata: {
        value: 'History',
        language: 'ts',
      },
    })

    expect(mockGetQuickInfoAtPosition).toHaveBeenCalledWith(
      '/tmp/history.__renoun_snippet_sig_1.ts',
      42,
      undefined,
      BASE_REQUEST.runtime,
      '["quick-info-cache-test:0:0","quick-info-cache-test:127.0.0.1:43123","sig-1","/tmp/history.__renoun_snippet_sig_1.ts",42]',
      {
        value: 'History',
        language: 'ts',
      }
    )
  })

  it('scopes deferred quick info request keys to the full runtime endpoint', async () => {
    mockGetQuickInfoAtPosition.mockReset()
    mockGetQuickInfoAtPosition.mockResolvedValue({
      displayText: 'runtime-specific',
      documentationText: 'Runtime specific docs',
    })

    await __TEST_ONLY__.getQuickInfoForRequest(BASE_REQUEST)
    await __TEST_ONLY__.getQuickInfoForRequest({
      ...BASE_REQUEST,
      runtime: {
        ...BASE_REQUEST.runtime,
        port: '43124',
        host: '::1',
      },
    })

    expect(mockGetQuickInfoAtPosition).toHaveBeenCalledTimes(2)
    expect(mockGetQuickInfoAtPosition.mock.calls[0]?.[4]).toBe(
      '["quick-info-cache-test:0:0","quick-info-cache-test:127.0.0.1:43123","","/tmp/history.ts",42]'
    )
    expect(mockGetQuickInfoAtPosition.mock.calls[1]?.[4]).toBe(
      '["quick-info-cache-test:0:0","quick-info-cache-test:::1:43124","","/tmp/history.ts",42]'
    )
    expect(mockGetQuickInfoAtPosition.mock.calls[0]?.[4]).not.toBe(
      mockGetQuickInfoAtPosition.mock.calls[1]?.[4]
    )
  })
})

describe('QuickInfoClientPopover runtime selection', () => {
  it('keeps hover requests scoped to their own runtime when a retained page runtime is active', () => {
    const requestRuntime = {
      id: 'quick-info-request-runtime',
      port: '43123',
      host: '127.0.0.1',
    }
    const retainedBrowserRuntime = {
      id: 'quick-info-page-runtime',
      port: '43124',
      host: '127.0.0.1',
    }

    expect(
      __TEST_ONLY__.resolveQuickInfoRuntime(
        requestRuntime,
        retainedBrowserRuntime,
        true
      )
    ).toEqual(requestRuntime)
  })

  it('follows the shared browser runtime when no retained page runtime is active', () => {
    const requestRuntime = {
      id: 'quick-info-request-runtime',
      port: '43123',
      host: '127.0.0.1',
    }
    const sharedBrowserRuntime = {
      id: 'quick-info-updated-runtime',
      port: '43124',
      host: '::1',
    }

    expect(
      __TEST_ONLY__.resolveQuickInfoRuntime(
        requestRuntime,
        sharedBrowserRuntime,
        false
      )
    ).toEqual(sharedBrowserRuntime)
  })

  it('re-selects the shared runtime after the retained page runtime changes', () => {
    const requestRuntime = {
      id: 'quick-info-request-runtime',
      port: '43123',
      host: '127.0.0.1',
    }
    const updatedRetainedBrowserRuntime = {
      id: 'quick-info-page-runtime',
      port: '43125',
      host: '::1',
    }

    expect(
      __TEST_ONLY__.resolveQuickInfoRuntime(
        requestRuntime,
        updatedRetainedBrowserRuntime,
        true,
        'quick-info-page-runtime:127.0.0.1:43124'
      )
    ).toEqual(updatedRetainedBrowserRuntime)
  })

  it('rebuilds the hover cache version from the selected runtime refresh state', () => {
    const requestRuntime = {
      id: 'quick-info-request-runtime',
      port: '43123',
      host: '127.0.0.1',
    }

    expect(
      __TEST_ONLY__.resolveQuickInfoAnalysisVersion({
        selectedRuntime: requestRuntime,
        requestAnalysisVersion: 'quick-info-request-runtime:0:0',
        refreshVersion: '8:3',
      })
    ).toBe('quick-info-request-runtime:8:3')
  })

  it('stabilizes the initial hover cache version before the shared runtime is retained', () => {
    const requestRuntime = {
      id: 'quick-info-request-runtime',
      port: '43123',
      host: '127.0.0.1',
    }

    expect(
      __TEST_ONLY__.resolveQuickInfoAnalysisVersion({
        selectedRuntime: requestRuntime,
        requestAnalysisVersion: undefined,
        refreshVersion: '0:0',
      })
    ).toBe('quick-info-request-runtime:0:0')
  })

  it('drops a stale request analysis version when the runtime changes', () => {
    expect(
      __TEST_ONLY__.resolveQuickInfoAnalysisVersion({
        selectedRuntime: {
          id: 'quick-info-updated-runtime',
          port: '43124',
          host: '::1',
        },
        requestAnalysisVersion: 'quick-info-request-runtime:0:0',
        refreshVersion: '0:0',
      })
    ).toBe('quick-info-updated-runtime:0:0')
  })

  it('reuses hydrated quick info only while the derived request key stays stable', () => {
    expect(
      __TEST_ONLY__.shouldReuseHydratedQuickInfo({
        quickInfo: {
          displayText: 'History',
          documentationText: 'Server rendered quick info',
        },
        canRequestQuickInfo: true,
        requestKey:
          '["quick-info-request-runtime:0:0","quick-info-request-runtime:127.0.0.1:43123","","/tmp/history.ts",42]',
        hydratedRequestKey:
          '["quick-info-request-runtime:0:0","quick-info-request-runtime:127.0.0.1:43123","","/tmp/history.ts",42]',
      })
    ).toBe(true)

    expect(
      __TEST_ONLY__.shouldReuseHydratedQuickInfo({
        quickInfo: {
          displayText: 'History',
          documentationText: 'Server rendered quick info',
        },
        canRequestQuickInfo: true,
        requestKey:
          '["quick-info-request-runtime:1:0","quick-info-request-runtime:127.0.0.1:43123","","/tmp/history.ts",42]',
        hydratedRequestKey:
          '["quick-info-request-runtime:0:0","quick-info-request-runtime:127.0.0.1:43123","","/tmp/history.ts",42]',
      })
    ).toBe(false)
  })

  it('drops hydrated quick info when the runtime endpoint changes without a new runtime id', () => {
    expect(
      __TEST_ONLY__.shouldReuseHydratedQuickInfo({
        quickInfo: {
          displayText: 'History',
          documentationText: 'Server rendered quick info',
        },
        canRequestQuickInfo: true,
        requestKey:
          '["quick-info-request-runtime:0:0","quick-info-request-runtime:::1:43124","","/tmp/history.ts",42]',
        hydratedRequestKey:
          '["quick-info-request-runtime:0:0","quick-info-request-runtime:127.0.0.1:43123","","/tmp/history.ts",42]',
      })
    ).toBe(false)
  })
})

describe('QuickInfoClientPopover documentation markdown', () => {
  it('renders fenced code blocks with the client-safe code block renderer', async () => {
    const content =
      await QUICK_INFO_CLIENT_POPOVER_TEST_ONLY__.getQuickInfoDocumentationContent(
        '```ts path="history.ts"\nconst history = createHistory()\n```'
      )
    const html = await renderToStringAsync(<>{content}</>)

    expect(html).toContain('Copy code to clipboard')
    expect(html).toContain('history.ts')
    expect(html).toContain('<pre')
    expect(html).toContain('createHistory')
    expect(html).not.toContain('<codeblock')
  }, 60_000)

  it('bounds cached documentation content and evicts the least recently used entry', async () => {
    const maxEntries =
      QUICK_INFO_CLIENT_POPOVER_TEST_ONLY__.MAX_QUICK_INFO_DOCUMENTATION_CACHE_ENTRIES
    const documentationTexts = Array.from(
      { length: maxEntries + 1 },
      (_, index) => `Documentation entry ${index}`
    )

    for (const documentationText of documentationTexts.slice(0, -1)) {
      await QUICK_INFO_CLIENT_POPOVER_TEST_ONLY__.getQuickInfoDocumentationContent(
        documentationText
      )
    }

    await QUICK_INFO_CLIENT_POPOVER_TEST_ONLY__.getQuickInfoDocumentationContent(
      documentationTexts[0]!
    )
    await QUICK_INFO_CLIENT_POPOVER_TEST_ONLY__.getQuickInfoDocumentationContent(
      documentationTexts.at(-1)!
    )

    expect(
      QUICK_INFO_CLIENT_POPOVER_TEST_ONLY__.getQuickInfoDocumentationContentCacheSize()
    ).toBe(maxEntries)
    expect(
      QUICK_INFO_CLIENT_POPOVER_TEST_ONLY__.hasQuickInfoDocumentationContent(
        documentationTexts[0]!
      )
    ).toBe(true)
    expect(
      QUICK_INFO_CLIENT_POPOVER_TEST_ONLY__.hasQuickInfoDocumentationContent(
        documentationTexts[1]!
      )
    ).toBe(false)
    expect(
      QUICK_INFO_CLIENT_POPOVER_TEST_ONLY__.hasQuickInfoDocumentationContent(
        documentationTexts.at(-1)!
      )
    ).toBe(true)
  })
})
