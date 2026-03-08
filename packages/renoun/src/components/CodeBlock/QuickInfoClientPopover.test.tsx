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
