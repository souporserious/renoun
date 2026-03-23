import type { AnalysisClientServerModules } from './client.server.types.ts'

function throwBrowserAnalysisClientServerError(methodName: string): never {
  throw new Error(
    `[renoun] ${methodName} is only available in server runtimes. Configure an analysis client runtime before calling it from the browser.`
  )
}

const browserAnalysisClientServerModules = {
  createHighlighter() {
    return throwBrowserAnalysisClientServerError('createHighlighter')
  },
  getQuickInfoAtPositionBase() {
    return throwBrowserAnalysisClientServerError('getQuickInfoAtPositionBase')
  },
  hydrateSourceTextMetadataSourceFile() {
    return throwBrowserAnalysisClientServerError(
      'hydrateSourceTextMetadataSourceFile'
    )
  },
  getCachedFileExportText() {
    return throwBrowserAnalysisClientServerError('getCachedFileExportText')
  },
  getCachedFileExportMetadata() {
    return throwBrowserAnalysisClientServerError(
      'getCachedFileExportMetadata'
    )
  },
  getCachedFileExportStaticValue() {
    return throwBrowserAnalysisClientServerError(
      'getCachedFileExportStaticValue'
    )
  },
  getCachedFileExports() {
    return throwBrowserAnalysisClientServerError('getCachedFileExports')
  },
  resolveCachedFileExportsWithDependencies() {
    return throwBrowserAnalysisClientServerError(
      'resolveCachedFileExportsWithDependencies'
    )
  },
  getCachedOutlineRanges() {
    return throwBrowserAnalysisClientServerError('getCachedOutlineRanges')
  },
  getCachedSourceTextMetadata() {
    return throwBrowserAnalysisClientServerError('getCachedSourceTextMetadata')
  },
  getCachedTokens() {
    return throwBrowserAnalysisClientServerError('getCachedTokens')
  },
  invalidateRuntimeAnalysisCachePath() {},
  invalidateRuntimeAnalysisCachePaths() {},
  resolveCachedTypeAtLocationWithDependencies() {
    return throwBrowserAnalysisClientServerError(
      'resolveCachedTypeAtLocationWithDependencies'
    )
  },
  transpileCachedSourceFile() {
    return throwBrowserAnalysisClientServerError('transpileCachedSourceFile')
  },
  configureAnalysisCacheRuntime() {},
  invalidateProgramFileCache() {},
  resetAnalysisCacheRuntimeConfiguration() {},
  invalidateSharedFileTextPrefixCachePath() {},
  getProgram() {
    return throwBrowserAnalysisClientServerError('getProgram')
  },
  invalidateProgramCachesByPaths() {
    return 0
  },
} satisfies AnalysisClientServerModules

export const {
  createHighlighter,
  getQuickInfoAtPositionBase,
  hydrateSourceTextMetadataSourceFile,
  getCachedFileExportText,
  getCachedFileExportMetadata,
  getCachedFileExportStaticValue,
  getCachedFileExports,
  resolveCachedFileExportsWithDependencies,
  getCachedOutlineRanges,
  getCachedSourceTextMetadata,
  getCachedTokens,
  invalidateRuntimeAnalysisCachePath,
  invalidateRuntimeAnalysisCachePaths,
  resolveCachedTypeAtLocationWithDependencies,
  transpileCachedSourceFile,
  configureAnalysisCacheRuntime,
  invalidateProgramFileCache,
  resetAnalysisCacheRuntimeConfiguration,
  invalidateSharedFileTextPrefixCachePath,
  getProgram,
  invalidateProgramCachesByPaths,
} = browserAnalysisClientServerModules
