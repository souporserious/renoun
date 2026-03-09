function throwBrowserProjectClientServerError(methodName: string): never {
  throw new Error(
    `[renoun] ${methodName} is only available in server runtimes. Configure a project client runtime before calling it from the browser.`
  )
}

export function createHighlighter() {
  return throwBrowserProjectClientServerError('createHighlighter')
}

export function getQuickInfoAtPositionBase() {
  return throwBrowserProjectClientServerError('getQuickInfoAtPositionBase')
}

export function getCachedFileExportText() {
  return throwBrowserProjectClientServerError('getCachedFileExportText')
}

export function getCachedFileExportMetadata() {
  return throwBrowserProjectClientServerError('getCachedFileExportMetadata')
}

export function getCachedFileExportStaticValue() {
  return throwBrowserProjectClientServerError('getCachedFileExportStaticValue')
}

export function getCachedFileExports() {
  return throwBrowserProjectClientServerError('getCachedFileExports')
}

export function getCachedOutlineRanges() {
  return throwBrowserProjectClientServerError('getCachedOutlineRanges')
}

export function getCachedSourceTextMetadata() {
  return throwBrowserProjectClientServerError('getCachedSourceTextMetadata')
}

export function getCachedTokens() {
  return throwBrowserProjectClientServerError('getCachedTokens')
}

export function invalidateRuntimeAnalysisCachePath() {
  return throwBrowserProjectClientServerError('invalidateRuntimeAnalysisCachePath')
}

export function invalidateRuntimeAnalysisCachePaths() {
  return throwBrowserProjectClientServerError(
    'invalidateRuntimeAnalysisCachePaths'
  )
}

export function resolveCachedTypeAtLocationWithDependencies() {
  return throwBrowserProjectClientServerError(
    'resolveCachedTypeAtLocationWithDependencies'
  )
}

export function transpileCachedSourceFile() {
  return throwBrowserProjectClientServerError('transpileCachedSourceFile')
}

export function configureProjectCacheRuntime() {
  return throwBrowserProjectClientServerError('configureProjectCacheRuntime')
}

export function invalidateProjectFileCache() {
  return throwBrowserProjectClientServerError('invalidateProjectFileCache')
}

export function resetProjectCacheRuntimeConfiguration() {
  return throwBrowserProjectClientServerError(
    'resetProjectCacheRuntimeConfiguration'
  )
}

export function invalidateSharedFileTextPrefixCachePath() {
  return throwBrowserProjectClientServerError(
    'invalidateSharedFileTextPrefixCachePath'
  )
}

export function getProject() {
  return throwBrowserProjectClientServerError('getProject')
}

export function invalidateProjectCachesByPaths() {
  return throwBrowserProjectClientServerError('invalidateProjectCachesByPaths')
}
