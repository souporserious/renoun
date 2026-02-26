import { resolve } from 'node:path'
import type { SyntaxKind } from '../utils/ts-morph.ts'

import type { ConfigurationOptions } from '../components/Config/types.ts'
import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter.ts'
import { parseBooleanEnv } from '../utils/env.ts'
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
import type { ResolvedTypeAtLocationResult } from '../utils/resolve-type-at-location.ts'
import { hashString, stableStringify } from '../utils/stable-serialization.ts'
import {
  isAbsolutePath,
  normalizePathKey,
  normalizeSlashes,
} from '../utils/path.ts'
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
  invalidateRuntimeAnalysisCachePaths,
  resolveCachedTypeAtLocationWithDependencies,
  transpileCachedSourceFile,
} from './cached-analysis.ts'
import { invalidateProjectFileCache } from './cache.ts'
import { WebSocketClient } from './rpc/client.ts'
import {
  getProject,
  invalidateProjectCachesByPaths,
} from './get-project.ts'
import {
  type RefreshInvalidationsSinceRequest,
  type RefreshInvalidationsSinceResponse,
  getRefreshInvalidationPaths,
  isRefreshNotification,
  normalizeRefreshCursor,
} from './refresh-notifications.ts'
import type { ProjectOptions } from './types.ts'

let client: WebSocketClient | undefined
const pendingRefreshInvalidationPaths = new Set<string>()
let isRefreshInvalidationFlushQueued = false
let hasConnectedProjectServerClient = false
let refreshResyncQueue: Promise<void> = Promise.resolve()
let latestRefreshCursor = 0

type ClientCachedRpcMethod =
  | 'getSourceTextMetadata'
  | 'resolveTypeAtLocationWithDependencies'
  | 'getTokens'
  | 'getFileExports'
  | 'getOutlineRanges'
  | 'getFileExportMetadata'
  | 'getFileExportStaticValue'
  | 'getFileExportText'
  | 'transpileSourceFile'

interface ClientRpcCacheEntry {
  value: unknown
  expiresAt: number
  dependencyPaths: readonly string[]
}

interface ClientRpcInFlightEntry {
  promise: Promise<unknown>
  dependencyPaths: readonly string[]
  epoch: number
}

const CLIENT_CACHED_RPC_METHODS = new Set<ClientCachedRpcMethod>([
  'getSourceTextMetadata',
  'resolveTypeAtLocationWithDependencies',
  'getTokens',
  'getFileExports',
  'getOutlineRanges',
  'getFileExportMetadata',
  'getFileExportStaticValue',
  'getFileExportText',
  'transpileSourceFile',
])

const CLIENT_RPC_CACHE_MAX_ENTRIES = 500
const DEFAULT_CLIENT_RPC_CACHE_TTL_MS = 1_000
const clientRpcCacheByKey = new Map<string, ClientRpcCacheEntry>()
const clientRpcInFlightByKey = new Map<string, ClientRpcInFlightEntry>()
// Bumped on refresh invalidations so stale in-flight requests cannot repopulate cache.
let clientRpcInvalidationEpoch = 0

function shouldUseClientRpcCache(): boolean {
  const override = parseBooleanEnv(
    process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE']
  )
  if (override !== undefined) {
    return override
  }

  return true
}

function getClientRpcCacheTtlMs(): number {
  const configured = process.env['RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS']
  if (!configured) {
    return DEFAULT_CLIENT_RPC_CACHE_TTL_MS
  }

  const parsed = Number.parseInt(configured, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }

  return parsed
}

function normalizeRpcCacheKeyValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return `hash:${hashString(value)}`
  }

  if (value === null || typeof value !== 'object') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeRpcCacheKeyValue(entry))
  }

  const candidate = value as Record<string, unknown>
  const normalized: Record<string, unknown> = {}
  const keys = Object.keys(candidate).sort()
  for (const key of keys) {
    normalized[key] = normalizeRpcCacheKeyValue(candidate[key])
  }
  return normalized
}

function toClientRpcCacheKey(method: ClientCachedRpcMethod, params: unknown): string {
  return hashString(
    `${method}|${stableStringify(normalizeRpcCacheKeyValue(params))}`
  )
}

function toComparablePath(path: string): string {
  const normalized = normalizeSlashes(path)
  const absolutePath = isAbsolutePath(normalized) ? normalized : resolve(normalized)
  return normalizePathKey(absolutePath)
}

function pathsIntersect(firstPath: string, secondPath: string): boolean {
  if (firstPath === '.' || secondPath === '.') {
    return true
  }

  return (
    firstPath === secondPath ||
    firstPath.startsWith(`${secondPath}/`) ||
    secondPath.startsWith(`${firstPath}/`)
  )
}

function hasPathDependencyIntersection(
  dependencyPaths: readonly string[],
  normalizedPath: string
): boolean {
  return dependencyPaths.some((dependencyPath) =>
    pathsIntersect(dependencyPath, normalizedPath)
  )
}

function getCandidatePath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined
  }

  return toComparablePath(value)
}

function collectClientRpcDependencyPaths(
  method: ClientCachedRpcMethod,
  params: unknown
): string[] {
  const candidate = params as {
    filePath?: unknown
    sourcePath?: unknown
    projectOptions?: {
      tsConfigFilePath?: unknown
    }
  }
  const dependencyPaths = new Set<string>()

  const filePath = getCandidatePath(candidate.filePath)
  if (filePath) {
    dependencyPaths.add(filePath)
  }

  if (method === 'getTokens') {
    const sourcePath = getCandidatePath(candidate.sourcePath)
    if (sourcePath) {
      dependencyPaths.add(sourcePath)
    }
  }

  const tsConfigFilePath = getCandidatePath(
    candidate.projectOptions?.tsConfigFilePath
  )
  if (tsConfigFilePath) {
    dependencyPaths.add(tsConfigFilePath)
  }

  return Array.from(dependencyPaths)
}

function pruneExpiredClientRpcCacheEntries(now = Date.now()): void {
  for (const [cacheKey, entry] of clientRpcCacheByKey) {
    if (entry.expiresAt <= now) {
      clientRpcCacheByKey.delete(cacheKey)
    }
  }
}

function trimClientRpcCache(): void {
  while (clientRpcCacheByKey.size > CLIENT_RPC_CACHE_MAX_ENTRIES) {
    const oldestKey = clientRpcCacheByKey.keys().next().value as
      | string
      | undefined
    if (!oldestKey) {
      return
    }

    clientRpcCacheByKey.delete(oldestKey)
  }
}

function invalidateClientRpcStateByPath(path: string): void {
  const normalizedPath = toComparablePath(path)
  let invalidated = false

  for (const [cacheKey, entry] of clientRpcCacheByKey) {
    if (hasPathDependencyIntersection(entry.dependencyPaths, normalizedPath)) {
      clientRpcCacheByKey.delete(cacheKey)
      invalidated = true
    }
  }

  for (const [cacheKey, entry] of clientRpcInFlightByKey) {
    if (hasPathDependencyIntersection(entry.dependencyPaths, normalizedPath)) {
      clientRpcInFlightByKey.delete(cacheKey)
      invalidated = true
    }
  }

  if (invalidated) {
    clientRpcInvalidationEpoch += 1
  }
}

function invalidateAllClientRpcState(): void {
  clientRpcInvalidationEpoch += 1
  clientRpcCacheByKey.clear()
  clientRpcInFlightByKey.clear()
}

function applyRefreshInvalidations(paths: string[]): void {
  invalidateAllClientRpcState()
  invalidateRuntimeAnalysisCachePaths(paths)
  invalidateProjectCachesByPaths(paths)
}

async function callClientMethod<
  Params extends Record<string, unknown>,
  Value,
>(
  activeClient: WebSocketClient,
  method: string,
  params: Params
): Promise<Value> {
  if (
    !shouldUseClientRpcCache() ||
    !CLIENT_CACHED_RPC_METHODS.has(method as ClientCachedRpcMethod)
  ) {
    return activeClient.callMethod<Params, Value>(method, params)
  }

  const ttlMs = getClientRpcCacheTtlMs()
  if (ttlMs <= 0) {
    return activeClient.callMethod<Params, Value>(method, params)
  }

  const typedMethod = method as ClientCachedRpcMethod
  const cacheKey = toClientRpcCacheKey(typedMethod, params)
  const requestEpoch = clientRpcInvalidationEpoch
  const now = Date.now()
  pruneExpiredClientRpcCacheEntries(now)
  const cached = clientRpcCacheByKey.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    clientRpcCacheByKey.delete(cacheKey)
    clientRpcCacheByKey.set(cacheKey, cached)
    return cached.value as Value
  }

  const inFlight = clientRpcInFlightByKey.get(cacheKey)
  if (inFlight) {
    if (inFlight.epoch === requestEpoch) {
      return inFlight.promise as Promise<Value>
    }
    clientRpcInFlightByKey.delete(cacheKey)
  }

  const dependencyPaths = collectClientRpcDependencyPaths(typedMethod, params)
  const request = activeClient
    .callMethod<Params, Value>(method, params)
    .then((value) => {
      if (requestEpoch === clientRpcInvalidationEpoch) {
        clientRpcCacheByKey.set(cacheKey, {
          value,
          expiresAt: Date.now() + ttlMs,
          dependencyPaths,
        })
        trimClientRpcCache()
      }
      return value
    })
    .finally(() => {
      const latest = clientRpcInFlightByKey.get(cacheKey)
      if (latest?.promise === request) {
        clientRpcInFlightByKey.delete(cacheKey)
      }
    })
  clientRpcInFlightByKey.set(cacheKey, {
    promise: request as Promise<unknown>,
    dependencyPaths,
    epoch: requestEpoch,
  })

  return request
}

function queueRefreshResync(activeClient: WebSocketClient): void {
  refreshResyncQueue = refreshResyncQueue
    .catch(() => {})
    .then(async () => {
      const response = await activeClient.callMethod<
        RefreshInvalidationsSinceRequest,
        RefreshInvalidationsSinceResponse
      >('getRefreshInvalidationsSince', {
        sinceCursor: latestRefreshCursor,
      })

      const nextCursor = normalizeRefreshCursor(response.nextCursor)
      if (nextCursor !== undefined) {
        latestRefreshCursor = Math.max(latestRefreshCursor, nextCursor)
      }

      const paths = getRefreshInvalidationPaths(response)
      for (const path of paths) {
        queueRefreshInvalidation(path)
      }
    })
    .catch(() => {})
}

function getClient(): WebSocketClient | undefined {
  if (!client && process.env.RENOUN_SERVER_PORT) {
    client = new WebSocketClient(process.env.RENOUN_SERVER_ID!)
    const createdClient = client
    if (shouldConsumeRefreshNotifications()) {
      createdClient.on('connected', () => {
        if (!hasConnectedProjectServerClient) {
          hasConnectedProjectServerClient = true
          return
        }

        queueRefreshResync(createdClient)
      })
      createdClient.on('notification', (message) => {
        if (!isRefreshNotification(message)) {
          return
        }

        const refreshCursor = normalizeRefreshCursor(message.data.refreshCursor)
        if (refreshCursor !== undefined) {
          latestRefreshCursor = Math.max(latestRefreshCursor, refreshCursor)
        }

        const paths = getRefreshInvalidationPaths(message.data)
        for (const path of paths) {
          queueRefreshInvalidation(path)
        }
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
    if (paths.length === 0) {
      return
    }

    applyRefreshInvalidations(paths)
  })
}

function shouldConsumeRefreshNotifications(): boolean {
  const override = parseBooleanEnv(
    process.env.RENOUN_PROJECT_REFRESH_NOTIFICATIONS
  )
  if (override !== undefined) {
    return override
  }

  return true
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
    return callClientMethod<
      DistributiveOmit<GetSourceTextMetadataOptions, 'project'> & {
        projectOptions?: ProjectOptions
      },
      SourceTextMetadata
    >(client, 'getSourceTextMetadata', options)
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
    return callClientMethod<
      {
        filePath: string
        position: number
        kind: SyntaxKind
        filter?: TypeFilter
        projectOptions?: ProjectOptions
      },
      ResolvedTypeAtLocationResult
    >(client, 'resolveTypeAtLocationWithDependencies', {
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
    return callClientMethod<
      Omit<GetTokensOptions, 'highlighter' | 'project'> & {
        projectOptions?: ProjectOptions
      },
      TokenizedLines
    >(client, 'getTokens', options)
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
    return callClientMethod<
      {
        filePath: string
        projectOptions?: ProjectOptions
      },
      ModuleExport[]
    >(client, 'getFileExports', {
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
    return callClientMethod<
      { filePath: string; projectOptions?: ProjectOptions },
      OutlineRange[]
    >(client, 'getOutlineRanges', { filePath, projectOptions })
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
    return callClientMethod<
      {
        name: string
        filePath: string
        position: number
        kind: SyntaxKind
        projectOptions?: ProjectOptions
      },
      Awaited<ReturnType<typeof baseGetFileExportMetadata>>
    >(client, 'getFileExportMetadata', {
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
    return callClientMethod<
      {
        filePath: string
        position: number
        kind: SyntaxKind
        projectOptions?: ProjectOptions
      },
      unknown
    >(client, 'getFileExportStaticValue', {
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
    return callClientMethod<
      {
        filePath: string
        position: number
        kind: SyntaxKind
        includeDependencies?: boolean
        projectOptions?: ProjectOptions
      },
      string
    >(client, 'getFileExportText', {
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
    await client.callMethod<
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
    invalidateClientRpcStateByPath(filePath)
    return
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
    return callClientMethod<
      {
        filePath: string
        projectOptions?: ProjectOptions
      },
      string
    >(client, 'transpileSourceFile', {
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
