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
  getCachedReferenceBaseArtifact() {
    return throwBrowserAnalysisClientServerError(
      'getCachedReferenceBaseArtifact'
    )
  },
  getCachedReferenceResolvedTypesArtifact() {
    return throwBrowserAnalysisClientServerError(
      'getCachedReferenceResolvedTypesArtifact'
    )
  },
  getCachedReferenceSectionsArtifact() {
    return throwBrowserAnalysisClientServerError(
      'getCachedReferenceSectionsArtifact'
    )
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
  getCachedTypeScriptDependencyPaths() {
    return throwBrowserAnalysisClientServerError(
      'getCachedTypeScriptDependencyPaths'
    )
  },
  getCachedTokens() {
    return throwBrowserAnalysisClientServerError('getCachedTokens')
  },
  readFreshCachedReferenceBaseArtifact() {
    return throwBrowserAnalysisClientServerError(
      'readFreshCachedReferenceBaseArtifact'
    )
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
  getCachedReferenceBaseArtifact,
  getCachedReferenceResolvedTypesArtifact,
  getCachedReferenceSectionsArtifact,
  resolveCachedFileExportsWithDependencies,
  getCachedOutlineRanges,
  getCachedSourceTextMetadata,
  getCachedTypeScriptDependencyPaths,
  getCachedTokens,
  readFreshCachedReferenceBaseArtifact,
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
