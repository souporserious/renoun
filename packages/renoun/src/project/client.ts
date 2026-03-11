import type { SyntaxKind } from '../utils/ts-morph.ts'

import type { Languages as GrammarLanguage } from '../grammars/index.ts'
import type {
  ModuleExport,
  getFileExportMetadata as baseGetFileExportMetadata,
} from '../utils/get-file-exports.ts'
import type { GetTokensOptions, TokenizedLines } from '../utils/get-tokens.ts'
import type {
  GetSourceTextMetadataOptions,
  SourceTextMetadata,
} from '../analysis/query/source-text-metadata.ts'
import type { OutlineRange } from '../utils/get-outline-ranges.ts'
import type { Kind, TypeFilter } from '../utils/resolve-type.ts'
import type { DistributiveOmit } from '../types.ts'
import type { AnalysisOptions } from '../analysis/types.ts'
import * as analysisClient from '../analysis/client.ts'
import type { ProjectOptions } from './types.ts'

function toAnalysisOptions(
  projectOptions?: ProjectOptions
): AnalysisOptions | undefined {
  if (!projectOptions) {
    return undefined
  }

  const {
    gitBranch: _gitBranch,
    gitHost: _gitHost,
    gitSource: _gitSource,
    projectId,
    siteUrl: _siteUrl,
    theme: _theme,
    ...analysisOptions
  } = projectOptions

  return projectId
    ? {
        ...analysisOptions,
        analysisScopeId: projectId,
      }
    : analysisOptions
}

// Keep the legacy project-shaped helpers together while the implementation
// lives under `analysis`.
export async function getSourceTextMetadata(
  options: DistributiveOmit<GetSourceTextMetadataOptions, 'project'> & {
    projectOptions?: ProjectOptions
  }
): Promise<SourceTextMetadata> {
  const { projectOptions, ...sourceTextMetadataOptions } = options

  return analysisClient.getSourceTextMetadata({
    ...sourceTextMetadataOptions,
    analysisOptions: toAnalysisOptions(projectOptions),
  })
}

export async function getTokens(
  options: Omit<GetTokensOptions, 'highlighter' | 'project'> & {
    languages?: GrammarLanguage[]
    projectOptions?: ProjectOptions
  }
): Promise<TokenizedLines> {
  const { projectOptions, ...tokenOptions } = options

  return analysisClient.getTokens({
    ...tokenOptions,
    analysisOptions: toAnalysisOptions(projectOptions),
  })
}

export async function resolveTypeAtLocation(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  filter?: TypeFilter,
  projectOptions?: ProjectOptions
): Promise<Kind | undefined> {
  return analysisClient.resolveTypeAtLocation(
    filePath,
    position,
    kind,
    filter,
    toAnalysisOptions(projectOptions)
  )
}

export async function getFileExports(
  filePath: string,
  projectOptions?: ProjectOptions
): Promise<ModuleExport[]> {
  return analysisClient.getFileExports(
    filePath,
    toAnalysisOptions(projectOptions)
  )
}

export async function getOutlineRanges(
  filePath: string,
  projectOptions?: ProjectOptions
): Promise<OutlineRange[]> {
  return analysisClient.getOutlineRanges(
    filePath,
    toAnalysisOptions(projectOptions)
  )
}

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

export async function createSourceFile(
  filePath: string,
  sourceText: string,
  projectOptions?: ProjectOptions
): Promise<void> {
  return analysisClient.createSourceFile(
    filePath,
    sourceText,
    toAnalysisOptions(projectOptions)
  )
}

export async function transpileSourceFile(
  filePath: string,
  projectOptions?: ProjectOptions
): Promise<string> {
  return analysisClient.transpileSourceFile(
    filePath,
    toAnalysisOptions(projectOptions)
  )
}

/**
 * Generate a cache key for a project's options.
 * @internal
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
    for (const keyName in options.compilerOptions) {
      const value = options.compilerOptions[keyName]
      key += `${keyName}=${value};`
    }
  }

  return key
}
