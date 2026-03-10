import type { SyntaxKind } from '../utils/ts-morph.ts'

import * as analysisClient from '../analysis/client.ts'

import type { AnalysisClientRuntimeOptions } from '../analysis/client.ts'
import type { GetSourceTextMetadataOptions } from '../analysis/query/source-text-metadata.ts'
import type { AnalysisServerRuntime } from '../analysis/runtime-env.ts'
import type { AnalysisOptions } from '../analysis/types.ts'
import type { ConfigurationOptions } from '../components/Config/types.ts'
import type { DistributiveOmit } from '../types.ts'
import type {
  ModuleExport,
  getFileExportMetadata as baseGetFileExportMetadata,
} from '../utils/get-file-exports.ts'
import type { OutlineRange } from '../utils/get-outline-ranges.ts'
import type { QuickInfoAtPosition } from '../utils/get-quick-info-at-position.ts'
import type { GetTokensOptions, TokenizedLines } from '../utils/get-tokens.ts'
import type { TypeFilter } from '../utils/resolve-type.ts'
import type { ResolvedTypeAtLocationResult } from '../utils/resolve-type-at-location.ts'

import type { ProjectOptions } from './types.ts'

export type { ProjectOptions } from './types.ts'

export type ProjectServerRuntime = AnalysisServerRuntime

export const getProjectClientRefreshVersion =
  analysisClient.getAnalysisClientRefreshVersion
export const onProjectClientRefreshVersionChange =
  analysisClient.onAnalysisClientRefreshVersionChange
export const getProjectClientBrowserRuntime =
  analysisClient.getAnalysisClientBrowserRuntime
export const onProjectClientBrowserRuntimeChange =
  analysisClient.onAnalysisClientBrowserRuntimeChange
export const onProjectClientBrowserRefreshNotification =
  analysisClient.onAnalysisClientBrowserRefreshNotification
export const setProjectClientBrowserRuntime =
  analysisClient.setAnalysisClientBrowserRuntime
export const retainProjectClientBrowserRuntime =
  analysisClient.retainAnalysisClientBrowserRuntime
export const hasRetainedProjectClientBrowserRuntime =
  analysisClient.hasRetainedAnalysisClientBrowserRuntime

export interface ProjectClientRuntimeOptions
  extends Omit<AnalysisClientRuntimeOptions, 'analysisCacheMaxEntries'> {
  projectCacheMaxEntries?: number
}

type ProjectSourceTextMetadataOptions = DistributiveOmit<
  GetSourceTextMetadataOptions,
  'project'
> & {
  projectOptions?: ProjectOptions
}

type ProjectTokensOptions = Omit<GetTokensOptions, 'highlighter' | 'project'> & {
  languages?: ConfigurationOptions['languages']
  projectOptions?: ProjectOptions
  waitForWarmResult?: boolean
  runtime?: ProjectServerRuntime
}

function toAnalysisOptions(projectOptions?: ProjectOptions): AnalysisOptions | undefined {
  if (!projectOptions) {
    return undefined
  }

  const analysisOptions: AnalysisOptions = {
    analysisScopeId: getProjectOptionsCacheKey(projectOptions),
  }

  if (projectOptions.compilerOptions !== undefined) {
    analysisOptions.compilerOptions = projectOptions.compilerOptions
  }

  if (projectOptions.tsConfigFilePath !== undefined) {
    analysisOptions.tsConfigFilePath = projectOptions.tsConfigFilePath
  }

  if (projectOptions.useInMemoryFileSystem === true) {
    analysisOptions.useInMemoryFileSystem = true
  }

  return analysisOptions
}

export function configureProjectClientRuntime(
  options: ProjectClientRuntimeOptions
): void {
  const nextOptions: AnalysisClientRuntimeOptions = {}

  if ('useRpcCache' in options) {
    nextOptions.useRpcCache = options.useRpcCache
  }

  if ('rpcCacheTtlMs' in options) {
    nextOptions.rpcCacheTtlMs = options.rpcCacheTtlMs
  }

  if ('consumeRefreshNotifications' in options) {
    nextOptions.consumeRefreshNotifications = options.consumeRefreshNotifications
  }

  if ('projectCacheMaxEntries' in options) {
    nextOptions.analysisCacheMaxEntries = options.projectCacheMaxEntries
  }

  analysisClient.configureAnalysisClientRuntime(nextOptions)
}

export function resetProjectClientRuntimeConfiguration(): void {
  analysisClient.resetAnalysisClientRuntimeConfiguration()
}

/**
 * Parses and normalizes source text metadata. This also optionally formats the
 * source text using the project's installed formatter.
 */
export async function getSourceTextMetadata(
  options: ProjectSourceTextMetadataOptions
) {
  const { projectOptions, ...sourceTextMetadataOptions } = options

  return analysisClient.getSourceTextMetadata({
    ...sourceTextMetadataOptions,
    analysisOptions: toAnalysisOptions(projectOptions),
  })
}

/**
 * Resolve quick info for a symbol position in a source file.
 */
export async function getQuickInfoAtPosition(
  filePath: string,
  position: number,
  projectOptions?: ProjectOptions,
  runtime?: ProjectServerRuntime,
  cacheKey?: string
): Promise<QuickInfoAtPosition | undefined> {
  return analysisClient.getQuickInfoAtPosition(
    filePath,
    position,
    toAnalysisOptions(projectOptions),
    runtime,
    cacheKey
  )
}

/**
 * Resolve the type of an expression at a specific location.
 */
export async function resolveTypeAtLocation(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  filter?: TypeFilter,
  projectOptions?: ProjectOptions
): Promise<ResolvedTypeAtLocationResult['resolvedType']> {
  return analysisClient.resolveTypeAtLocation(
    filePath,
    position,
    kind,
    filter,
    toAnalysisOptions(projectOptions)
  )
}

/**
 * Resolve the type of an expression at a specific location and include
 * dependency metadata for cache invalidation.
 */
export async function resolveTypeAtLocationWithDependencies(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  filter?: TypeFilter,
  projectOptions?: ProjectOptions
): Promise<ResolvedTypeAtLocationResult> {
  return analysisClient.resolveTypeAtLocationWithDependencies(
    filePath,
    position,
    kind,
    filter,
    toAnalysisOptions(projectOptions)
  )
}

/**
 * Tokenize source text based on a language and return highlighted tokens.
 */
export async function getTokens(
  options: ProjectTokensOptions
): Promise<TokenizedLines> {
  const { projectOptions, ...tokenOptions } = options

  return analysisClient.getTokens({
    ...tokenOptions,
    analysisOptions: toAnalysisOptions(projectOptions),
  })
}

/**
 * Get the exports of a file.
 */
export async function getFileExports(
  filePath: string,
  projectOptions?: ProjectOptions
): Promise<ModuleExport[]> {
  return analysisClient.getFileExports(filePath, toAnalysisOptions(projectOptions))
}

/**
 * Get outlining ranges for a file.
 */
export async function getOutlineRanges(
  filePath: string,
  projectOptions?: ProjectOptions
): Promise<OutlineRange[]> {
  return analysisClient.getOutlineRanges(filePath, toAnalysisOptions(projectOptions))
}

/**
 * Get a specific file export in a source file.
 */
export async function getFileExportMetadata(
  name: string,
  filePath: string,
  position: number,
  kind: SyntaxKind,
  projectOptions?: ProjectOptions
): Promise<Awaited<ReturnType<typeof baseGetFileExportMetadata>>> {
  return analysisClient.getFileExportMetadata(
    name,
    filePath,
    position,
    kind,
    toAnalysisOptions(projectOptions)
  )
}

/**
 * Attempt to get a statically analyzable literal value for a file export.
 */
export async function getFileExportStaticValue(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  projectOptions?: ProjectOptions
) {
  return analysisClient.getFileExportStaticValue(
    filePath,
    position,
    kind,
    toAnalysisOptions(projectOptions)
  )
}

/**
 * Get a specific file export's text by identifier, optionally including its dependencies.
 */
export async function getFileExportText(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  includeDependencies?: boolean,
  projectOptions?: ProjectOptions
) {
  return analysisClient.getFileExportText(
    filePath,
    position,
    kind,
    includeDependencies,
    toAnalysisOptions(projectOptions)
  )
}

/**
 * Create a source file in the project.
 */
export async function createSourceFile(
  filePath: string,
  sourceText: string,
  projectOptions?: ProjectOptions
) {
  return analysisClient.createSourceFile(
    filePath,
    sourceText,
    toAnalysisOptions(projectOptions)
  )
}

/**
 * Transpile a source file.
 */
export async function transpileSourceFile(
  filePath: string,
  projectOptions?: ProjectOptions
) {
  return analysisClient.transpileSourceFile(
    filePath,
    toAnalysisOptions(projectOptions)
  )
}

/**
 * Generate a cache key for a project's options.
 */
export function getProjectOptionsCacheKey(options?: ProjectOptions): string {
  if (!options) {
    return ''
  }

  let key = ''

  if (options.theme) {
    key += `t:${options.theme};`
  }
  if (options.siteUrl) {
    key += `u:${options.siteUrl};`
  }
  if (options.gitSource) {
    key += `s:${options.gitSource};`
  }
  if (options.gitBranch) {
    key += `b:${options.gitBranch};`
  }
  if (options.gitHost) {
    key += `h:${options.gitHost};`
  }
  if (options.projectId) {
    key += `i:${options.projectId};`
  }
  if (options.tsConfigFilePath) {
    key += `f:${options.tsConfigFilePath};`
  }

  key += `m:${options.useInMemoryFileSystem ? 1 : 0};`

  if (options.compilerOptions) {
    key += 'c:'
    for (const compilerOption of Object.keys(options.compilerOptions).sort()) {
      const value = options.compilerOptions[compilerOption]
      key += `${compilerOption}=${value};`
    }
  }

  return key
}

export const __TEST_ONLY__ = {
  clearProjectClientRpcState:
    analysisClient.__TEST_ONLY__.clearAnalysisClientRpcState,
  disposeProjectBrowserClient:
    analysisClient.__TEST_ONLY__.disposeAnalysisBrowserClient,
  setProjectClientRefreshVersion:
    analysisClient.__TEST_ONLY__.setAnalysisClientRefreshVersion,
}
