export { createHighlighter } from '../utils/create-highlighter.ts'
export {
  getQuickInfoAtPosition as getQuickInfoAtPositionBase,
} from '../utils/get-quick-info-at-position.ts'
export {
  getCachedFileExportText,
  getCachedFileExportMetadata,
  getCachedFileExportStaticValue,
  getCachedFileExports,
  getCachedOutlineRanges,
  getCachedSourceTextMetadata,
  getCachedTokens,
  invalidateRuntimeAnalysisCachePath,
  invalidateRuntimeAnalysisCachePaths,
  resolveCachedTypeAtLocationWithDependencies,
  transpileCachedSourceFile,
} from './cached-analysis.ts'
export {
  configureAnalysisCacheRuntime,
  invalidateProgramFileCache,
  resetAnalysisCacheRuntimeConfiguration,
} from './cache.ts'
export { invalidateSharedFileTextPrefixCachePath } from './file-text-prefix-cache.ts'
export { getProgram, invalidateProgramCachesByPaths } from './get-program.ts'
