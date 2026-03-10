import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAnalysisClientRefreshVersion: vi.fn(() => '0:0'),
  onAnalysisClientRefreshVersionChange: vi.fn(),
  getAnalysisClientBrowserRuntime: vi.fn(),
  onAnalysisClientBrowserRuntimeChange: vi.fn(),
  onAnalysisClientBrowserRefreshNotification: vi.fn(),
  setAnalysisClientBrowserRuntime: vi.fn(),
  retainAnalysisClientBrowserRuntime: vi.fn(),
  hasRetainedAnalysisClientBrowserRuntime: vi.fn(() => false),
  configureAnalysisClientRuntime: vi.fn(),
  resetAnalysisClientRuntimeConfiguration: vi.fn(),
  getSourceTextMetadata: vi.fn(),
  getQuickInfoAtPosition: vi.fn(),
  resolveTypeAtLocation: vi.fn(),
  resolveTypeAtLocationWithDependencies: vi.fn(),
  getTokens: vi.fn(),
  getFileExports: vi.fn(),
  getOutlineRanges: vi.fn(),
  getFileExportMetadata: vi.fn(),
  getFileExportStaticValue: vi.fn(),
  getFileExportText: vi.fn(),
  createSourceFile: vi.fn(),
  transpileSourceFile: vi.fn(),
  __TEST_ONLY__: {
    clearAnalysisClientRpcState: vi.fn(),
    disposeAnalysisBrowserClient: vi.fn(),
    setAnalysisClientRefreshVersion: vi.fn(),
  },
}))

vi.mock('../analysis/client.ts', () => mocks)

describe('project client compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAnalysisClientRefreshVersion.mockReturnValue('0:0')
    mocks.hasRetainedAnalysisClientBrowserRuntime.mockReturnValue(false)
  })

  test('maps legacy projectOptions on getSourceTextMetadata to analysisOptions', async () => {
    mocks.getSourceTextMetadata.mockResolvedValue({
      value: 'formatted',
      language: 'tsx',
    })

    const module = await import('./client.ts')

    await module.getSourceTextMetadata({
      value: '<Button />',
      language: 'tsx',
      projectOptions: {
        theme: 'github-dark',
        projectId: 'docs',
        tsConfigFilePath: '/project/tsconfig.json',
      },
    })

    expect(mocks.getSourceTextMetadata).toHaveBeenCalledWith({
      value: '<Button />',
      language: 'tsx',
      analysisOptions: {
        analysisScopeId: 't:github-dark;i:docs;f:/project/tsconfig.json;m:0;',
        tsConfigFilePath: '/project/tsconfig.json',
      },
    })
  })

  test('maps legacy-only project scoping fields on getTokens to analysisOptions', async () => {
    mocks.getTokens.mockResolvedValue([])

    const module = await import('./client.ts')

    await module.getTokens({
      value: 'const value = 1',
      language: 'ts',
      theme: 'github-dark',
      projectOptions: {
        siteUrl: 'https://renoun.dev',
        gitSource: 'souporserious/renoun',
      },
    })

    expect(mocks.getTokens).toHaveBeenCalledWith({
      value: 'const value = 1',
      language: 'ts',
      theme: 'github-dark',
      analysisOptions: {
        analysisScopeId:
          'u:https://renoun.dev;s:souporserious/renoun;m:0;',
      },
    })
  })

  test('maps legacy project cache runtime options to analysis runtime options', async () => {
    const module = await import('./client.ts')

    module.configureProjectClientRuntime({
      useRpcCache: true,
      rpcCacheTtlMs: 1_000,
      consumeRefreshNotifications: false,
      projectCacheMaxEntries: 12,
    })

    expect(mocks.configureAnalysisClientRuntime).toHaveBeenCalledWith({
      useRpcCache: true,
      rpcCacheTtlMs: 1_000,
      consumeRefreshNotifications: false,
      analysisCacheMaxEntries: 12,
    })
  })

  test('preserves the legacy project options cache key shape', async () => {
    const module = await import('./client.ts')

    expect(
      module.getProjectOptionsCacheKey({
        theme: 'github-dark',
        siteUrl: 'https://renoun.dev',
        gitSource: 'souporserious/renoun',
        gitBranch: 'main',
        gitHost: 'github',
        projectId: 'docs',
        tsConfigFilePath: '/project/tsconfig.json',
        useInMemoryFileSystem: true,
        compilerOptions: {
          jsx: 4,
          strict: true,
        },
      })
    ).toBe(
      't:github-dark;u:https://renoun.dev;s:souporserious/renoun;b:main;h:github;i:docs;f:/project/tsconfig.json;m:1;c:jsx=4;strict=true;'
    )
  })
})
