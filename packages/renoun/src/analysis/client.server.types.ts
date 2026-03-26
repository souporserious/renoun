import type { createHighlighter } from '../utils/create-highlighter.ts'
import type { getQuickInfoAtPosition } from '../utils/get-quick-info-at-position.ts'
import type { hydrateSourceTextMetadataSourceFile } from './query/source-text-metadata.ts'
import type {
  configureAnalysisCacheRuntime,
  invalidateProgramFileCache,
  resetAnalysisCacheRuntimeConfiguration,
} from './cache.ts'
import type {
  getCachedFileExportMetadata,
  getCachedFileExportStaticValue,
  getCachedFileExportText,
  getCachedFileExports,
  getCachedOutlineRanges,
  getCachedReferenceBaseArtifact,
  getCachedReferenceResolvedTypesArtifact,
  getCachedReferenceSectionsArtifact,
  getCachedSourceTextMetadata,
  getCachedTypeScriptDependencyPaths,
  getCachedTokens,
  invalidateRuntimeAnalysisCachePath,
  invalidateRuntimeAnalysisCachePaths,
  readFreshCachedReferenceBaseArtifact,
  resolveCachedFileExportsWithDependencies,
  resolveCachedTypeAtLocationWithDependencies,
  transpileCachedSourceFile,
} from './cached-analysis.ts'
import type { invalidateSharedFileTextPrefixCachePath } from './file-text-prefix-cache.ts'
import type {
  getProgram,
  invalidateProgramCachesByPaths,
} from './get-program.ts'

export interface AnalysisClientServerModules {
  createHighlighter: typeof createHighlighter
  getQuickInfoAtPositionBase: typeof getQuickInfoAtPosition
  hydrateSourceTextMetadataSourceFile: typeof hydrateSourceTextMetadataSourceFile
  getCachedFileExportText: typeof getCachedFileExportText
  getCachedFileExportMetadata: typeof getCachedFileExportMetadata
  getCachedFileExportStaticValue: typeof getCachedFileExportStaticValue
  getCachedFileExports: typeof getCachedFileExports
  getCachedOutlineRanges: typeof getCachedOutlineRanges
  getCachedReferenceBaseArtifact: typeof getCachedReferenceBaseArtifact
  getCachedReferenceResolvedTypesArtifact:
    typeof getCachedReferenceResolvedTypesArtifact
  getCachedReferenceSectionsArtifact:
    typeof getCachedReferenceSectionsArtifact
  getCachedSourceTextMetadata: typeof getCachedSourceTextMetadata
  getCachedTypeScriptDependencyPaths: typeof getCachedTypeScriptDependencyPaths
  getCachedTokens: typeof getCachedTokens
  invalidateRuntimeAnalysisCachePath: typeof invalidateRuntimeAnalysisCachePath
  invalidateRuntimeAnalysisCachePaths: typeof invalidateRuntimeAnalysisCachePaths
  readFreshCachedReferenceBaseArtifact:
    typeof readFreshCachedReferenceBaseArtifact
  resolveCachedFileExportsWithDependencies:
    typeof resolveCachedFileExportsWithDependencies
  resolveCachedTypeAtLocationWithDependencies:
    typeof resolveCachedTypeAtLocationWithDependencies
  transpileCachedSourceFile: typeof transpileCachedSourceFile
  configureAnalysisCacheRuntime: typeof configureAnalysisCacheRuntime
  invalidateProgramFileCache: typeof invalidateProgramFileCache
  resetAnalysisCacheRuntimeConfiguration:
    typeof resetAnalysisCacheRuntimeConfiguration
  invalidateSharedFileTextPrefixCachePath:
    typeof invalidateSharedFileTextPrefixCachePath
  getProgram: typeof getProgram
  invalidateProgramCachesByPaths: typeof invalidateProgramCachesByPaths
}
