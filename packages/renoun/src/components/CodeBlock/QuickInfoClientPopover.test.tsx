import { describe, expect, it, vi } from 'vitest'

const mockGetQuickInfoAtPosition = vi.fn()
const mockGetTokens = vi.fn()

vi.mock('../../analysis/client.ts', () => ({
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
      'quick-info-cache-test:runtime::/tmp/history.ts:42'
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
})
