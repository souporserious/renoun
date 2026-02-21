import type { SyntaxKind } from '../utils/ts-morph.ts'

import type { ConfigurationOptions } from '../components/Config/types.ts'
import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter.ts'
import type {
  ModuleExport,
  getFileExportMetadata as baseGetFileExportMetadata,
} from '../utils/get-file-exports.ts'
import type { GetTokensOptions, TokenizedLines } from '../utils/get-tokens.ts'
import type {
  GetSourceTextMetadataOptions,
  SourceTextMetadata,
} from '../utils/get-source-text-metadata.ts'
import type { OutlineRange } from '../utils/get-outline-ranges.ts'
import type { TypeFilter } from '../utils/resolve-type.ts'
import type {
  ResolvedTypeAtLocationResult,
} from '../utils/resolve-type-at-location.ts'
import type { DistributiveOmit } from '../types.ts'
import {
  getCachedFileExportText,
  getCachedFileExportMetadata,
  getCachedFileExportStaticValue,
  getCachedFileExports,
  getCachedOutlineRanges,
  getCachedSourceTextMetadata,
  getCachedTokens,
  invalidateRuntimeAnalysisCachePath,
  resolveCachedTypeAtLocationWithDependencies,
  transpileCachedSourceFile,
} from './cached-analysis.ts'
import { invalidateProjectFileCache } from './cache.ts'
import { WebSocketClient } from './rpc/client.ts'
import { getProject, invalidateProjectCachesByPath } from './get-project.ts'
import type { ProjectOptions } from './types.ts'

let client: WebSocketClient | undefined
const pendingRefreshInvalidationPaths = new Set<string>()
let isRefreshInvalidationFlushQueued = false

function getClient(): WebSocketClient | undefined {
  if (!client && process.env.RENOUN_SERVER_PORT) {
    client = new WebSocketClient(process.env.RENOUN_SERVER_ID!)
    if (shouldConsumeRefreshNotifications()) {
      client.on('notification', (message) => {
        if (!isRefreshNotification(message)) {
          return
        }

        queueRefreshInvalidation(message.data.filePath)
      })
    }
  }
  return client
}

function queueRefreshInvalidation(path: string): void {
  pendingRefreshInvalidationPaths.add(path)
  if (isRefreshInvalidationFlushQueued) {
    return
  }

  isRefreshInvalidationFlushQueued = true
  queueMicrotask(() => {
    isRefreshInvalidationFlushQueued = false
    const paths = Array.from(pendingRefreshInvalidationPaths)
    pendingRefreshInvalidationPaths.clear()
    for (const pendingPath of paths) {
      invalidateRuntimeAnalysisCachePath(pendingPath)
      invalidateProjectCachesByPath(pendingPath)
    }
  })
}

function shouldConsumeRefreshNotifications(): boolean {
  const override = parseBooleanEnv(process.env.RENOUN_PROJECT_REFRESH_NOTIFICATIONS)
  if (override !== undefined) {
    return override
  }

  return true
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true') {
    return true
  }

  if (normalized === '0' || normalized === 'false') {
    return false
  }

  return undefined
}

function isRefreshNotification(
  value: unknown
): value is { type: 'refresh'; data: { filePath: string } } {
  if (value === null || typeof value !== 'object') {
    return false
  }

  const candidate = value as { type?: unknown; data?: unknown }
  if (candidate.type !== 'refresh') {
    return false
  }

  if (candidate.data === null || typeof candidate.data !== 'object') {
    return false
  }

  const data = candidate.data as { filePath?: unknown }
  return typeof data.filePath === 'string' && data.filePath.length > 0
}

/**
 * Parses and normalizes source text metadata. This also optionally formats the
 * source text using the project's installed formatter.
 * @internal
 */
export async function getSourceTextMetadata(
  options: DistributiveOmit<GetSourceTextMetadataOptions, 'project'> & {
    projectOptions?: ProjectOptions
  }
): Promise<SourceTextMetadata> {
  const client = getClient()
  if (client) {
    return client.callMethod<
      DistributiveOmit<GetSourceTextMetadataOptions, 'project'> & {
        projectOptions?: ProjectOptions
      },
      SourceTextMetadata
    >('getSourceTextMetadata', options)
  }

  /* Switch to synchronous analysis when building for production to prevent timeouts. */
  const { projectOptions, ...getSourceTextMetadataOptions } = options
  const project = getProject(projectOptions)

  return getCachedSourceTextMetadata(project, getSourceTextMetadataOptions)
}

let currentHighlighter: { current: Highlighter | null } = { current: null }
let highlighterPromise: Promise<void> | null = null

/** Wait for the highlighter to be loaded. */
function untilHighlighterLoaded(
  options: Partial<Pick<ConfigurationOptions, 'theme' | 'languages'>>
): Promise<void> {
  if (highlighterPromise) {
    return highlighterPromise
  }

  highlighterPromise = createHighlighter({
    theme: options.theme,
    languages: options.languages,
  }).then((highlighter) => {
    currentHighlighter.current = highlighter
  })

  return highlighterPromise
}

/**
 * Resolve the type of an expression at a specific location.
 * @internal
 */
export async function resolveTypeAtLocationWithDependencies(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  filter?: TypeFilter,
  projectOptions?: ProjectOptions
): Promise<ResolvedTypeAtLocationResult> {
  const client = getClient()

  if (client) {
    return client.callMethod<
      {
        filePath: string
        position: number
        kind: SyntaxKind
        filter?: TypeFilter
        projectOptions?: ProjectOptions
      },
      ResolvedTypeAtLocationResult
    >('resolveTypeAtLocationWithDependencies', {
      filePath,
      position,
      kind,
      filter,
      projectOptions,
    })
  }

  const project = getProject(projectOptions)

  return resolveCachedTypeAtLocationWithDependencies(project, {
    filePath,
    position,
    kind,
    filter,
    isInMemoryFileSystem: projectOptions?.useInMemoryFileSystem,
  })
}

/**
 * Tokenize source text based on a language and return highlighted tokens.
 * @internal
 */
export async function getTokens(
  options: Omit<GetTokensOptions, 'highlighter' | 'project'> & {
    languages?: ConfigurationOptions['languages']
    projectOptions?: ProjectOptions
  }
): Promise<TokenizedLines> {
  const client = getClient()
  if (client) {
    return client.callMethod<
      Omit<GetTokensOptions, 'highlighter' | 'project'> & {
        projectOptions?: ProjectOptions
      },
      TokenizedLines
    >('getTokens', options)
  }

  const { projectOptions, languages, ...getTokensOptions } = options
  const project = getProject(projectOptions)
  await untilHighlighterLoaded({
    theme: getTokensOptions.theme,
    languages,
  })

  if (currentHighlighter.current === null) {
    throw new Error('[renoun] Highlighter is not initialized in "getTokens"')
  }

  return getCachedTokens(project, {
    ...getTokensOptions,
    highlighter: currentHighlighter.current,
  })
}

/**
 * Get the exports of a file.
 * @internal
 */
export async function getFileExports(
  filePath: string,
  projectOptions?: ProjectOptions
) {
  const client = getClient()
  if (client) {
    return client.callMethod<
      {
        filePath: string
        projectOptions?: ProjectOptions
      },
      ModuleExport[]
    >('getFileExports', {
      filePath,
      projectOptions,
    })
  }

  const project = getProject(projectOptions)
  return getCachedFileExports(project, filePath)
}

/**
 * Get outlining ranges for a file.
 * @internal
 */
export async function getOutlineRanges(
  filePath: string,
  projectOptions?: ProjectOptions
): Promise<OutlineRange[]> {
  const client = getClient()
  if (client) {
    return client.callMethod<
      { filePath: string; projectOptions?: ProjectOptions },
      OutlineRange[]
    >('getOutlineRanges', { filePath, projectOptions })
  }

  const project = getProject(projectOptions)
  return getCachedOutlineRanges(project, filePath)
}

/**
 * Get a specific file export in a source file.
 * @internal
 */
export async function getFileExportMetadata(
  name: string,
  filePath: string,
  position: number,
  kind: SyntaxKind,
  projectOptions?: ProjectOptions
) {
  const client = getClient()
  if (client) {
    return client.callMethod<
      {
        name: string
        filePath: string
        position: number
        kind: SyntaxKind
        projectOptions?: ProjectOptions
      },
      Awaited<ReturnType<typeof baseGetFileExportMetadata>>
    >('getFileExportMetadata', {
      name,
      filePath,
      position,
      kind,
      projectOptions,
    })
  }

  const project = getProject(projectOptions)
  return getCachedFileExportMetadata(project, {
    name,
    filePath,
    position,
    kind,
  })
}

/**
 * Attempt to get a statically analyzable literal value for a file export.
 * @internal
 */
export async function getFileExportStaticValue(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  projectOptions?: ProjectOptions
) {
  const client = getClient()
  if (client) {
    return client.callMethod<
      {
        filePath: string
        position: number
        kind: SyntaxKind
        projectOptions?: ProjectOptions
      },
      unknown
    >('getFileExportStaticValue', {
      filePath,
      position,
      kind,
      projectOptions,
    })
  }

  const project = getProject(projectOptions)
  return getCachedFileExportStaticValue(project, {
    filePath,
    position,
    kind,
  })
}

/**
 * Get a specific file export's text by identifier, optionally including its dependencies.
 * @internal
 */
export async function getFileExportText(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  includeDependencies?: boolean,
  projectOptions?: ProjectOptions
) {
  const client = getClient()
  if (client) {
    return client.callMethod<
      {
        filePath: string
        position: number
        kind: SyntaxKind
        includeDependencies?: boolean
        projectOptions?: ProjectOptions
      },
      string
    >('getFileExportText', {
      filePath,
      position,
      kind,
      includeDependencies,
      projectOptions,
    })
  }

  const project = getProject(projectOptions)
  return getCachedFileExportText(project, {
    filePath,
    position,
    kind,
    includeDependencies,
  })
}

/**
 * Create a source file in the project.
 * @internal
 */
export async function createSourceFile(
  filePath: string,
  sourceText: string,
  projectOptions?: ProjectOptions
) {
  const client = getClient()
  if (client) {
    return client.callMethod<
      {
        filePath: string
        sourceText: string
        projectOptions?: ProjectOptions
      },
      void
    >('createSourceFile', {
      filePath,
      sourceText,
      projectOptions,
    })
  }

  const project = getProject(projectOptions)
  project.createSourceFile(filePath, sourceText, { overwrite: true })
  invalidateProjectFileCache(project, filePath)
  invalidateRuntimeAnalysisCachePath(filePath)
}

/**
 * Transpile a source file.
 * @internal
 */
export async function transpileSourceFile(
  filePath: string,
  projectOptions?: ProjectOptions
) {
  const client = getClient()
  if (client) {
    return client.callMethod<
      {
        filePath: string
        projectOptions?: ProjectOptions
      },
      string
    >('transpileSourceFile', {
      filePath,
      projectOptions,
    })
  }

  const project = getProject(projectOptions)

  return transpileCachedSourceFile(project, filePath)
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
    for (const k in options.compilerOptions) {
      const value = options.compilerOptions[k]
      key += `${k}=${value};`
    }
  }

  return key
}
