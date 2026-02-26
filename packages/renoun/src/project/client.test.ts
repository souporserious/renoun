import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  return {
    WebSocketClient: vi.fn(),
    getProject: vi.fn(() => ({ mockedProject: true })),
    invalidateProjectCachesByPaths: vi.fn(() => 0),
    getCachedSourceTextMetadata: vi.fn(async () => ({
      value: 'local-result',
      language: 'txt',
    })),
    getCachedFileExportText: vi.fn(),
    getCachedFileExportMetadata: vi.fn(),
    getCachedFileExportStaticValue: vi.fn(),
    getCachedFileExports: vi.fn(),
    getCachedOutlineRanges: vi.fn(),
    getCachedTokens: vi.fn(),
    invalidateRuntimeAnalysisCachePath: vi.fn(),
    invalidateRuntimeAnalysisCachePaths: vi.fn(),
    resolveCachedTypeAtLocationWithDependencies: vi.fn(),
    transpileCachedSourceFile: vi.fn(),
    invalidateProjectFileCache: vi.fn(),
  }
})

vi.mock('./rpc/client.ts', () => ({
  WebSocketClient: mocks.WebSocketClient,
}))

vi.mock('./get-project.ts', () => ({
  getProject: mocks.getProject,
  invalidateProjectCachesByPaths: mocks.invalidateProjectCachesByPaths,
}))

vi.mock('./cached-analysis.ts', () => ({
  getCachedFileExportText: mocks.getCachedFileExportText,
  getCachedFileExportMetadata: mocks.getCachedFileExportMetadata,
  getCachedFileExportStaticValue: mocks.getCachedFileExportStaticValue,
  getCachedFileExports: mocks.getCachedFileExports,
  getCachedOutlineRanges: mocks.getCachedOutlineRanges,
  getCachedSourceTextMetadata: mocks.getCachedSourceTextMetadata,
  getCachedTokens: mocks.getCachedTokens,
  invalidateRuntimeAnalysisCachePath: mocks.invalidateRuntimeAnalysisCachePath,
  invalidateRuntimeAnalysisCachePaths:
    mocks.invalidateRuntimeAnalysisCachePaths,
  resolveCachedTypeAtLocationWithDependencies:
    mocks.resolveCachedTypeAtLocationWithDependencies,
  transpileCachedSourceFile: mocks.transpileCachedSourceFile,
}))

vi.mock('./cache.ts', () => ({
  invalidateProjectFileCache: mocks.invalidateProjectFileCache,
}))

describe('project client transport guards', () => {
  const previousServerPort = process.env['RENOUN_SERVER_PORT']
  const previousServerId = process.env['RENOUN_SERVER_ID']

  beforeEach(() => {
    vi.resetModules()
    mocks.WebSocketClient.mockClear()
    mocks.getProject.mockClear()
    mocks.getCachedSourceTextMetadata.mockClear()
  })

  afterEach(() => {
    if (previousServerPort === undefined) {
      delete process.env['RENOUN_SERVER_PORT']
    } else {
      process.env['RENOUN_SERVER_PORT'] = previousServerPort
    }

    if (previousServerId === undefined) {
      delete process.env['RENOUN_SERVER_ID']
    } else {
      process.env['RENOUN_SERVER_ID'] = previousServerId
    }
  })

  test('falls back to local analysis when server id is missing', async () => {
    process.env['RENOUN_SERVER_PORT'] = '4545'
    delete process.env['RENOUN_SERVER_ID']

    const module = await import('./client.ts')
    const result = await module.getSourceTextMetadata({
      value: 'const answer = 42',
      language: 'txt',
    })

    expect(mocks.WebSocketClient).not.toHaveBeenCalled()
    expect(mocks.getProject).toHaveBeenCalledTimes(1)
    expect(mocks.getCachedSourceTextMetadata).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      value: 'local-result',
      language: 'txt',
    })
  })
})
