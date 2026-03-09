import { afterEach, describe, expect, it, vi } from 'vitest'

const mockGetQuickInfoAtPosition = vi.fn()
const mockGetTokens = vi.fn()

vi.mock('../../project/browser-client.ts', () => ({
  getQuickInfoAtPosition: (
    ...args: Parameters<typeof mockGetQuickInfoAtPosition>
  ) => mockGetQuickInfoAtPosition(...args),
  getTokens: (...args: Parameters<typeof mockGetTokens>) => mockGetTokens(...args),
}))

import { __TEST_ONLY__ } from './QuickInfoClientPopover.tsx'

type QuickInfoRequest = Parameters<
  (typeof __TEST_ONLY__)['getQuickInfoForRequest']
>[0]

const BASE_REQUEST: QuickInfoRequest = {
  filePath: '/tmp/history.ts',
  position: 42,
  projectVersion: 'quick-info-cache-test:0:0',
  runtime: {
    id: 'quick-info-cache-test',
    port: '43123',
    host: '127.0.0.1',
  },
}

describe('QuickInfoClientPopover cache behavior', () => {
  afterEach(() => {
    __TEST_ONLY__.clearQuickInfoClientPopoverCaches()
    mockGetQuickInfoAtPosition.mockReset()
    mockGetTokens.mockReset()
  })

  it('reuses cached quick info when cache invalidations are available', async () => {
    mockGetQuickInfoAtPosition
      .mockResolvedValueOnce({
        displayText: 'first-result',
        documentationText: 'First docs',
      })
      .mockResolvedValueOnce({
        displayText: 'second-result',
        documentationText: 'Second docs',
      })

    const first = await __TEST_ONLY__.getQuickInfoForRequest(BASE_REQUEST)
    const second = await __TEST_ONLY__.getQuickInfoForRequest(BASE_REQUEST)

    expect(first).toEqual({
      displayText: 'first-result',
      documentationText: 'First docs',
    })
    expect(second).toEqual(first)
    expect(mockGetQuickInfoAtPosition).toHaveBeenCalledTimes(1)
  })

  it('bypasses cached quick info when refresh invalidations are unavailable', async () => {
    mockGetQuickInfoAtPosition
      .mockResolvedValueOnce({
        displayText: 'first-result',
        documentationText: 'First docs',
      })
      .mockResolvedValueOnce({
        displayText: 'updated-result',
        documentationText: 'Updated docs',
      })

    const first = await __TEST_ONLY__.getQuickInfoForRequest({
      ...BASE_REQUEST,
      cacheDisabled: true,
    })
    const second = await __TEST_ONLY__.getQuickInfoForRequest({
      ...BASE_REQUEST,
      cacheDisabled: true,
    })

    expect(first).toEqual({
      displayText: 'first-result',
      documentationText: 'First docs',
    })
    expect(second).toEqual({
      displayText: 'updated-result',
      documentationText: 'Updated docs',
    })
    expect(mockGetQuickInfoAtPosition).toHaveBeenCalledTimes(2)
  })

  it('routes quick info requests through the runtime carried on the request', async () => {
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
      projectVersion: 'quick-info-cache-test:runtime',
      runtime,
    })

    expect(mockGetQuickInfoAtPosition).toHaveBeenCalledWith(
      '/tmp/history.ts',
      42,
      undefined,
      runtime
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
      __TEST_ONLY__.resolveQuickInfoRuntimeSelection(
        requestRuntime,
        retainedBrowserRuntime,
        true
      )
    ).toEqual({
      runtime: requestRuntime,
      usesSharedBrowserRuntime: false,
    })
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
      __TEST_ONLY__.resolveQuickInfoRuntimeSelection(
        requestRuntime,
        sharedBrowserRuntime,
        false
      )
    ).toEqual({
      runtime: sharedBrowserRuntime,
      usesSharedBrowserRuntime: true,
    })
  })

  it('does not derive a hover cache version from another runtime refresh cursor', () => {
    const requestRuntime = {
      id: 'quick-info-request-runtime',
      port: '43123',
      host: '127.0.0.1',
    }

    expect(
      __TEST_ONLY__.resolveQuickInfoProjectVersion({
        browserRuntime: {
          id: 'quick-info-page-runtime',
          port: '43124',
          host: '127.0.0.1',
        },
        selectedRuntime: requestRuntime,
        requestProjectVersion: 'quick-info-request-runtime:0:0',
        refreshVersion: '8:3',
      })
    ).toBe('quick-info-request-runtime:0:0')
  })

  it('derives a hover cache version from the retained runtime when it matches the request runtime', () => {
    const requestRuntime = {
      id: 'quick-info-request-runtime',
      port: '43123',
      host: '127.0.0.1',
    }

    expect(
      __TEST_ONLY__.resolveQuickInfoProjectVersion({
        browserRuntime: requestRuntime,
        selectedRuntime: requestRuntime,
        requestProjectVersion: 'quick-info-request-runtime:0:0',
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
      __TEST_ONLY__.resolveQuickInfoProjectVersion({
        browserRuntime: undefined,
        selectedRuntime: requestRuntime,
        requestProjectVersion: undefined,
        refreshVersion: '0:0',
      })
    ).toBe('quick-info-request-runtime:0:0')
  })
})
