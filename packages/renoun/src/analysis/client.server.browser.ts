function throwBrowserAnalysisClientServerError(methodName: string): never {
  throw new Error(
    `[renoun] ${methodName} is only available in server runtimes. Configure an analysis client runtime before calling it from the browser.`
  )
}

export function createHighlighter() {
  return throwBrowserAnalysisClientServerError('createHighlighter')
}

export function getQuickInfoAtPositionBase() {
  return throwBrowserAnalysisClientServerError('getQuickInfoAtPositionBase')
}

export function getCachedFileExportText() {
  return throwBrowserAnalysisClientServerError('getCachedFileExportText')
}

export function getCachedFileExportMetadata() {
  return throwBrowserAnalysisClientServerError('getCachedFileExportMetadata')
}

export function getCachedFileExportStaticValue() {
  return throwBrowserAnalysisClientServerError('getCachedFileExportStaticValue')
}

export function getCachedFileExports() {
  return throwBrowserAnalysisClientServerError('getCachedFileExports')
}

export function getCachedOutlineRanges() {
  return throwBrowserAnalysisClientServerError('getCachedOutlineRanges')
}

export function getCachedSourceTextMetadata() {
  return throwBrowserAnalysisClientServerError('getCachedSourceTextMetadata')
}

export function getCachedTokens() {
  return throwBrowserAnalysisClientServerError('getCachedTokens')
}

export function invalidateRuntimeAnalysisCachePath() {
  return throwBrowserAnalysisClientServerError('invalidateRuntimeAnalysisCachePath')
}

export function invalidateRuntimeAnalysisCachePaths() {
  return throwBrowserAnalysisClientServerError(
    'invalidateRuntimeAnalysisCachePaths'
  )
}

export function resolveCachedTypeAtLocationWithDependencies() {
  return throwBrowserAnalysisClientServerError(
    'resolveCachedTypeAtLocationWithDependencies'
  )
}

export function transpileCachedSourceFile() {
  return throwBrowserAnalysisClientServerError('transpileCachedSourceFile')
}

export function configureAnalysisCacheRuntime() {
  return throwBrowserAnalysisClientServerError('configureAnalysisCacheRuntime')
}

export function invalidateProgramFileCache() {
  return throwBrowserAnalysisClientServerError('invalidateProgramFileCache')
}

export function resetAnalysisCacheRuntimeConfiguration() {
  return throwBrowserAnalysisClientServerError(
    'resetAnalysisCacheRuntimeConfiguration'
  )
}

export function invalidateSharedFileTextPrefixCachePath() {
  return throwBrowserAnalysisClientServerError(
    'invalidateSharedFileTextPrefixCachePath'
  )
}

export function getProgram() {
  return throwBrowserAnalysisClientServerError('getProgram')
}

export function invalidateProgramCachesByPaths() {
  return throwBrowserAnalysisClientServerError('invalidateProgramCachesByPaths')
}
