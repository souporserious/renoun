import { dirname, resolve } from 'node:path'
import type { SyntaxKind } from '../utils/ts-morph.ts'

import type { ConfigurationOptions } from '../components/Config/types.ts'
import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter.ts'
import { collapseInvalidationPaths } from '../utils/collapse-invalidation-paths.ts'
import { reportBestEffortError } from '../utils/best-effort.ts'
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
import type { QuickInfoAtPosition } from '../utils/get-quick-info-at-position.ts'
import { getQuickInfoAtPosition as getQuickInfoAtPositionBase } from '../utils/get-quick-info-at-position.ts'
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
import {
  configureProjectCacheRuntime,
  invalidateProjectFileCache,
  resetProjectCacheRuntimeConfiguration,
} from './cache.ts'
import {
  getProjectClientBrowserRuntime as getSharedProjectClientBrowserRuntime,
  onProjectClientBrowserRefreshVersionChange as onSharedProjectClientBrowserRefreshVersionChange,
  onProjectClientBrowserRuntimeChange as onSharedProjectClientBrowserRuntimeChange,
  setProjectClientBrowserRefreshVersion as setSharedProjectClientBrowserRefreshVersion,
  setProjectClientBrowserRuntime as setSharedProjectClientBrowserRuntime,
} from './browser-runtime.ts'
import { invalidateSharedFileTextPrefixCachePath } from './file-text-prefix-cache.ts'
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
import {
  getServerRuntimeFromProcessEnv,
  onServerRuntimeEnvChange,
  resolveProjectClientRpcCacheEnabledFromEnv,
  resolveProjectClientRpcCacheTtlMsFromEnv,
  resolveProjectRefreshNotificationsEnvOverride,
  resolveServerRefreshNotificationsEffectiveFromEnv,
  resolveServerRefreshNotificationsEnvOverride,
} from './runtime-env.ts'
import type { ProjectServerRuntime } from './runtime-env.ts'
import type { ProjectOptions } from './types.ts'

let client: WebSocketClient | undefined
let clientRuntimeKey: string | undefined
let hasAttachedClientRefreshSubscriptions = false
let hasSubscribedToServerRuntimeEnvChanges = false
const pendingRefreshInvalidationPaths = new Set<string>()
let isRefreshInvalidationFlushQueued = false
let hasConnectedProjectServerClient = false
let refreshResyncQueue: Promise<void> = Promise.resolve()
let latestRefreshCursor = 0
let clientReadyProbePromise: Promise<boolean> | null = null
let clientRpcUnavailableUntil = 0

type ClientCachedRpcMethod =
  | 'getQuickInfoAtPosition'
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

interface GetFileExportTextRpcResponse {
  text: string
  dependencies?: string[]
}

interface ClientRpcValueWithDependenciesResponse<Value> {
  __renounClientRpcDependencies: true
  value: Value
  dependencies?: string[]
}

const CLIENT_CACHED_RPC_METHODS = new Set<ClientCachedRpcMethod>([
  'getQuickInfoAtPosition',
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

const CLIENT_RPC_METHODS_WITH_CONSERVATIVE_ROOT_DEPENDENCY =
  new Set<ClientCachedRpcMethod>([
    'getQuickInfoAtPosition',
    'getSourceTextMetadata',
    'transpileSourceFile',
  ])

const CLIENT_RPC_CACHE_MAX_ENTRIES = 1_000
const DEFAULT_CLIENT_RPC_CACHE_TTL_MS = 30_000
const SERVER_RPC_READY_TIMEOUT_MS = 500
const SERVER_RPC_UNAVAILABLE_BACKOFF_MS = 5_000
const REFRESH_RESYNC_MAX_ATTEMPTS = 3
const REFRESH_RESYNC_RETRY_BASE_DELAY_MS = 100
const clientRpcCacheByKey = new Map<string, ClientRpcCacheEntry>()
const clientRpcInFlightByKey = new Map<string, ClientRpcInFlightEntry>()
const observedProjectRootCandidates = new Set<string>()
// Bumped on refresh invalidations so stale in-flight requests cannot repopulate cache.
let clientRpcInvalidationEpoch = 0

/**
 * A monotonic version that advances as refresh notifications invalidate client
 * runtime state. UI caches can include this to avoid stale data after edits.
 */
export function getProjectClientRefreshVersion(): string {
  return `${latestRefreshCursor}:${clientRpcInvalidationEpoch}`
}

function notifyProjectClientRefreshVersionChanged(): void {
  setSharedProjectClientBrowserRefreshVersion(getProjectClientRefreshVersion())
}

function setLatestRefreshCursor(value: number): void {
  const normalizedValue = Math.max(0, Math.floor(value))
  if (latestRefreshCursor === normalizedValue) {
    return
  }

  latestRefreshCursor = normalizedValue
  notifyProjectClientRefreshVersionChanged()
}

function bumpLatestRefreshCursor(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    return
  }

  setLatestRefreshCursor(Math.max(latestRefreshCursor, Math.floor(value)))
}

export function onProjectClientRefreshVersionChange(
  listener: (version: string) => void
): () => void {
  return onSharedProjectClientBrowserRefreshVersionChange(listener)
}

export function getProjectClientBrowserRuntime():
  | ProjectServerRuntime
  | undefined {
  return getSharedProjectClientBrowserRuntime()
}

export function onProjectClientBrowserRuntimeChange(
  listener: (runtime: ProjectServerRuntime | undefined) => void
): () => void {
  return onSharedProjectClientBrowserRuntimeChange(listener)
}

export function setProjectClientBrowserRuntime(
  runtime?: ProjectServerRuntime
): void {
  const normalizedRuntime = runtime
    ? {
        id: String(runtime.id),
        port: String(runtime.port),
        ...(typeof runtime.host === 'string' && runtime.host.trim().length > 0
          ? { host: runtime.host.trim() }
          : {}),
      }
    : undefined
  const currentRuntime = getSharedProjectClientBrowserRuntime()
  const currentRuntimeKey = currentRuntime
    ? toServerRuntimeKey(currentRuntime)
    : undefined
  const nextRuntimeKey = normalizedRuntime
    ? toServerRuntimeKey(normalizedRuntime)
    : undefined

  if (currentRuntimeKey === nextRuntimeKey) {
    return
  }

  setSharedProjectClientBrowserRuntime(normalizedRuntime)

  if (typeof window === 'undefined') {
    return
  }

  if (!normalizedRuntime) {
    disposeActiveClient()
    return
  }

  if (!client) {
    const nextClient = createClientForRuntime(normalizedRuntime)
    attachClientRefreshSubscriptions(nextClient)
    return
  }

  if (clientRuntimeKey !== nextRuntimeKey) {
    replaceClientForRuntime(normalizedRuntime, {
      resyncImmediately: true,
    })
    return
  }

  attachClientRefreshSubscriptions(client)
}

export interface ProjectClientRuntimeOptions {
  useRpcCache?: boolean
  rpcCacheTtlMs?: number
  consumeRefreshNotifications?: boolean
  projectCacheMaxEntries?: number
}

const projectClientRuntimeOptions: ProjectClientRuntimeOptions = {}

export function configureProjectClientRuntime(
  options: ProjectClientRuntimeOptions
): void {
  if ('useRpcCache' in options) {
    projectClientRuntimeOptions.useRpcCache = options.useRpcCache
  }

  if ('rpcCacheTtlMs' in options) {
    projectClientRuntimeOptions.rpcCacheTtlMs = options.rpcCacheTtlMs
  }

  if ('consumeRefreshNotifications' in options) {
    projectClientRuntimeOptions.consumeRefreshNotifications =
      options.consumeRefreshNotifications
  }

  if ('projectCacheMaxEntries' in options) {
    configureProjectCacheRuntime({
      maxEntries: options.projectCacheMaxEntries,
    })
  }
}

export function resetProjectClientRuntimeConfiguration(): void {
  projectClientRuntimeOptions.useRpcCache = undefined
  projectClientRuntimeOptions.rpcCacheTtlMs = undefined
  projectClientRuntimeOptions.consumeRefreshNotifications = undefined
  resetProjectCacheRuntimeConfiguration()
}

function getActiveProjectServerRuntime(): ProjectServerRuntime | undefined {
  if (typeof window !== 'undefined') {
    const browserRuntime = getSharedProjectClientBrowserRuntime()
    if (browserRuntime) {
      return browserRuntime
    }
  }

  return getServerRuntimeFromProcessEnv()
}

function shouldUseClientRpcCache(): boolean {
  if (typeof projectClientRuntimeOptions.useRpcCache === 'boolean') {
    return projectClientRuntimeOptions.useRpcCache
  }

  const override = resolveProjectClientRpcCacheEnabledFromEnv()
  if (override !== undefined) {
    return override
  }

  if (!shouldConsumeRefreshNotifications()) {
    return false
  }

  return true
}

function getClientRpcCacheTtlMs(): number {
  if (typeof projectClientRuntimeOptions.rpcCacheTtlMs === 'number') {
    const normalizedTtl = Math.floor(projectClientRuntimeOptions.rpcCacheTtlMs)
    return Number.isFinite(normalizedTtl) && normalizedTtl > 0
      ? normalizedTtl
      : 0
  }

  return resolveProjectClientRpcCacheTtlMsFromEnv(DEFAULT_CLIENT_RPC_CACHE_TTL_MS)
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

function toRuntimeInvalidationPath(path: string): string {
  const normalized = normalizeSlashes(path)
  return isAbsolutePath(normalized) ? normalized : resolve(normalized)
}

function getDefaultProjectRootCandidate(): string | undefined {
  if (typeof process === 'undefined' || typeof process.cwd !== 'function') {
    return undefined
  }

  return resolve(process.cwd())
}

function getProjectRootCandidates(params: unknown): readonly string[] {
  const roots = new Set<string>()
  const defaultRootCandidate = getDefaultProjectRootCandidate()
  if (defaultRootCandidate) {
    roots.add(defaultRootCandidate)
  }

  if (!params || typeof params !== 'object') {
    return Array.from(roots)
  }

  const candidate = params as {
    projectOptions?: {
      tsConfigFilePath?: unknown
    }
  }
  const tsConfigFilePath = candidate.projectOptions?.tsConfigFilePath
  if (typeof tsConfigFilePath === 'string' && tsConfigFilePath.length > 0) {
    roots.add(resolve(dirname(tsConfigFilePath)))
  }

  return Array.from(roots)
}

function rememberProjectRootCandidates(params: unknown): void {
  for (const rootCandidate of getProjectRootCandidates(params)) {
    observedProjectRootCandidates.add(rootCandidate)
  }
}

function getCandidatePaths(
  value: unknown,
  rootCandidates: readonly string[]
): readonly string[] {
  if (typeof value !== 'string' || value.length === 0) {
    return []
  }

  const normalized = normalizeSlashes(value)
  if (isAbsolutePath(normalized)) {
    return [normalizePathKey(normalized)]
  }

  const resolvedCandidates = new Set<string>()
  for (const rootCandidate of rootCandidates) {
    resolvedCandidates.add(normalizePathKey(resolve(rootCandidate, normalized)))
  }

  return Array.from(resolvedCandidates)
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

function collectClientRpcDependencyPaths(
  method: ClientCachedRpcMethod,
  params: unknown
): string[] {
  const candidate = params as {
    filePath?: unknown
    sourcePath?: unknown
    includeDependencies?: unknown
    projectOptions?: {
      tsConfigFilePath?: unknown
    }
  }
  const dependencyPaths = new Set<string>()
  const rootCandidates = getProjectRootCandidates(params)

  for (const filePath of getCandidatePaths(candidate.filePath, rootCandidates)) {
    dependencyPaths.add(filePath)
  }

  if (method === 'getTokens') {
    for (const sourcePath of getCandidatePaths(
      candidate.sourcePath,
      rootCandidates
    )) {
      dependencyPaths.add(sourcePath)
    }
  }

  for (const tsConfigFilePath of getCandidatePaths(
    candidate.projectOptions?.tsConfigFilePath,
    rootCandidates
  )) {
    dependencyPaths.add(tsConfigFilePath)
  }

  const shouldAddConservativeRootDependency =
    CLIENT_RPC_METHODS_WITH_CONSERVATIVE_ROOT_DEPENDENCY.has(method)
  if (shouldAddConservativeRootDependency) {
    for (const rootCandidate of rootCandidates) {
      dependencyPaths.add(toComparablePath(rootCandidate))
    }
  }

  return Array.from(dependencyPaths)
}

function collectClientRpcResponseDependencyPaths(
  method: ClientCachedRpcMethod,
  params: unknown,
  value: unknown
): string[] {
  const rootCandidates = getProjectRootCandidates(params)
  const dependencyPaths = new Set<string>()
  let responseValue = value

  if (
    method === 'getFileExportText' &&
    (params as { includeDependencies?: unknown }).includeDependencies !== true
  ) {
    return []
  }

  if (isClientRpcValueWithDependenciesResponse(responseValue)) {
    addCandidateResponseDependencyPaths(
      responseValue.dependencies,
      rootCandidates,
      dependencyPaths
    )
    responseValue = responseValue.value
  }

  if (
    method === 'resolveTypeAtLocationWithDependencies' ||
    method === 'getFileExportText'
  ) {
    addCandidateResponseDependencyPaths(
      (responseValue as { dependencies?: unknown }).dependencies,
      rootCandidates,
      dependencyPaths
    )
  }

  if (method === 'getFileExports') {
    const candidate = responseValue as Array<{ path?: unknown }>
    if (Array.isArray(candidate)) {
      for (const fileExport of candidate) {
        for (const dependencyPath of getCandidatePaths(
          fileExport.path,
          rootCandidates
        )) {
          dependencyPaths.add(dependencyPath)
        }
      }
    }
  }

  if (method === 'getFileExportMetadata') {
    const candidate = responseValue as {
      location?: {
        filePath?: unknown
      }
    }
    for (const dependencyPath of getCandidatePaths(
      candidate.location?.filePath,
      rootCandidates
    )) {
      dependencyPaths.add(dependencyPath)
    }
  }

  return Array.from(dependencyPaths)
}

function addCandidateResponseDependencyPaths(
  dependencies: unknown,
  rootCandidates: readonly string[],
  dependencyPaths: Set<string>
): void {
  if (!Array.isArray(dependencies)) {
    return
  }

  for (const dependency of dependencies) {
    for (const dependencyPath of getCandidatePaths(dependency, rootCandidates)) {
      dependencyPaths.add(dependencyPath)
    }
  }
}

function isClientRpcValueWithDependenciesResponse<Value>(
  value: unknown
): value is ClientRpcValueWithDependenciesResponse<Value> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const candidate = value as {
    __renounClientRpcDependencies?: unknown
  }

  return candidate.__renounClientRpcDependencies === true
}

function toClientRpcResponseValue<Value>(
  value: Value | ClientRpcValueWithDependenciesResponse<Value>
): Value {
  if (isClientRpcValueWithDependenciesResponse<Value>(value)) {
    return value.value
  }

  return value
}

function toGetFileExportTextRpcValueText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  const candidate = value as GetFileExportTextRpcResponse
  if (typeof candidate?.text === 'string') {
    return candidate.text
  }

  throw new Error('[renoun] Invalid getFileExportText RPC response payload.')
}

function shouldBypassClientRpcCache(
  method: ClientCachedRpcMethod,
  params: unknown
): boolean {
  if (method === 'getFileExportText') {
    const candidate = params as { includeDependencies?: unknown }
    return (
      candidate.includeDependencies === true &&
      !shouldConsumeRefreshNotifications()
    )
  }

  return false
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

interface NormalizedInvalidationPaths {
  comparablePaths: string[]
  runtimePaths: string[]
}

function normalizeInvalidationPaths(
  paths: Iterable<string>
): NormalizedInvalidationPaths {
  const runtimePathByComparablePath = new Map<string, string>()
  for (const path of paths) {
    if (typeof path !== 'string' || path.length === 0) {
      continue
    }

    const runtimePath = toRuntimeInvalidationPath(path)
    const comparablePath = toComparablePath(runtimePath)
    if (!runtimePathByComparablePath.has(comparablePath)) {
      runtimePathByComparablePath.set(comparablePath, runtimePath)
    }
  }

  const comparablePaths = collapseInvalidationPaths(
    runtimePathByComparablePath.keys()
  )
  const runtimePaths = comparablePaths.map((comparablePath) => {
    return runtimePathByComparablePath.get(comparablePath) ?? comparablePath
  })

  return { comparablePaths, runtimePaths }
}

function hasPathDependencyIntersectionWithAnyPath(
  dependencyPaths: readonly string[],
  normalizedPaths: readonly string[]
): boolean {
  return normalizedPaths.some((normalizedPath) =>
    hasPathDependencyIntersection(dependencyPaths, normalizedPath)
  )
}

function invalidateClientRpcStateByNormalizedPaths(
  normalizedPaths: readonly string[]
): void {
  // Refresh events can reference transitive dependencies that are only known
  // after in-flight RPC responses resolve, so always advance the epoch.
  clientRpcInvalidationEpoch += 1
  notifyProjectClientRefreshVersionChanged()

  for (const [cacheKey, entry] of clientRpcCacheByKey) {
    if (
      hasPathDependencyIntersectionWithAnyPath(
        entry.dependencyPaths,
        normalizedPaths
      )
    ) {
      clientRpcCacheByKey.delete(cacheKey)
    }
  }

  for (const [cacheKey, entry] of clientRpcInFlightByKey) {
    if (
      hasPathDependencyIntersectionWithAnyPath(
        entry.dependencyPaths,
        normalizedPaths
      )
    ) {
      clientRpcInFlightByKey.delete(cacheKey)
    }
  }
}

function invalidateAllClientRpcState(): void {
  clientRpcInvalidationEpoch += 1
  clientRpcCacheByKey.clear()
  clientRpcInFlightByKey.clear()
  notifyProjectClientRefreshVersionChanged()
}

function collectConservativeRefreshFallbackPaths(): string[] {
  if (observedProjectRootCandidates.size === 0) {
    const defaultRootCandidate = getDefaultProjectRootCandidate()
    if (defaultRootCandidate) {
      return [defaultRootCandidate]
    }
  }

  return Array.from(observedProjectRootCandidates)
}

function applyRefreshInvalidations(paths: string[]): void {
  const { comparablePaths, runtimePaths } = normalizeInvalidationPaths(paths)
  if (comparablePaths.length === 0) {
    return
  }

  invalidateClientRpcStateByNormalizedPaths(comparablePaths)
  invalidateRuntimeAnalysisCachePaths(runtimePaths)
  invalidateProjectCachesByPaths(runtimePaths)
}

async function callClientMethod<
  Params extends Record<string, unknown>,
  Value,
>(
  activeClient: WebSocketClient,
  method: string,
  params: Params
): Promise<Value> {
  rememberProjectRootCandidates(params)

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
  if (shouldBypassClientRpcCache(typedMethod, params)) {
    return activeClient.callMethod<Params, Value>(method, params)
  }

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

  const requestDependencyPaths = collectClientRpcDependencyPaths(
    typedMethod,
    params
  )
  const request = activeClient
    .callMethod<Params, Value>(method, params)
    .then((value) => {
      const dependencyPaths = new Set(requestDependencyPaths)
      for (const dependencyPath of collectClientRpcResponseDependencyPaths(
        typedMethod,
        params,
        value
      )) {
        dependencyPaths.add(dependencyPath)
      }
      const resolvedDependencyPaths = Array.from(dependencyPaths)

      if (requestEpoch === clientRpcInvalidationEpoch) {
        clientRpcCacheByKey.set(cacheKey, {
          value,
          expiresAt: Date.now() + ttlMs,
          dependencyPaths: resolvedDependencyPaths,
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
    dependencyPaths: requestDependencyPaths,
    epoch: requestEpoch,
  })

  return request
}

function queueRefreshResync(activeClient: WebSocketClient): void {
  refreshResyncQueue = refreshResyncQueue
    .catch(() => {})
    .then(async () => {
      for (
        let attempt = 1;
        attempt <= REFRESH_RESYNC_MAX_ATTEMPTS;
        attempt += 1
      ) {
        try {
          const response = await activeClient.callMethod<
            RefreshInvalidationsSinceRequest,
            RefreshInvalidationsSinceResponse
          >('getRefreshInvalidationsSince', {
            sinceCursor: latestRefreshCursor,
          })

          const nextCursor = normalizeRefreshCursor(response.nextCursor)
          if (nextCursor !== undefined) {
            if (response.fullRefresh) {
              setLatestRefreshCursor(nextCursor)
            } else {
              bumpLatestRefreshCursor(nextCursor)
            }
          }

          const paths = getRefreshInvalidationPaths(response)
          for (const path of paths) {
            queueRefreshInvalidation(path)
          }
          return
        } catch {
          if (attempt >= REFRESH_RESYNC_MAX_ATTEMPTS) {
            // Conservative fallback: clear client-side RPC caches and invalidate
            // runtime/project caches for all observed project roots.
            const fallbackPaths = collectConservativeRefreshFallbackPaths()
            invalidateAllClientRpcState()
            applyRefreshInvalidations(fallbackPaths)
            setLatestRefreshCursor(0)
            return
          }

          await new Promise((resolveDelay) =>
            setTimeout(
              resolveDelay,
              REFRESH_RESYNC_RETRY_BASE_DELAY_MS * attempt
            )
          )
        }
      }
    })
    .catch(() => {})
}

function attachClientRefreshSubscriptions(
  activeClient: WebSocketClient,
  options: {
    resyncImmediately?: boolean
  } = {}
): void {
  if (
    hasAttachedClientRefreshSubscriptions ||
    !shouldConsumeRefreshNotifications()
  ) {
    return
  }

  hasAttachedClientRefreshSubscriptions = true
  activeClient.on('connected', () => {
    clientRpcUnavailableUntil = 0

    if (!hasConnectedProjectServerClient) {
      hasConnectedProjectServerClient = true
      return
    }

    queueRefreshResync(activeClient)
  })
  activeClient.on('notification', (message) => {
    if (!isRefreshNotification(message)) {
      return
    }

    const refreshCursor = normalizeRefreshCursor(message.data.refreshCursor)
    if (refreshCursor !== undefined) {
      bumpLatestRefreshCursor(refreshCursor)
    }

    const paths = getRefreshInvalidationPaths(message.data)
    for (const path of paths) {
      queueRefreshInvalidation(path)
    }
  })

  if (options.resyncImmediately) {
    hasConnectedProjectServerClient = true
    queueRefreshResync(activeClient)
  }
}

function toServerRuntimeKey(runtime: ProjectServerRuntime): string {
  return `${runtime.id}:${runtime.host ?? 'localhost'}:${runtime.port}`
}

function disposeActiveClient(): void {
  if (!client) {
    clientRuntimeKey = undefined
    hasAttachedClientRefreshSubscriptions = false
    clientReadyProbePromise = null
    clientRpcUnavailableUntil = 0
    invalidateAllClientRpcState()
    return
  }

  const activeClient = client
  client = undefined
  clientRuntimeKey = undefined
  hasAttachedClientRefreshSubscriptions = false
  clientReadyProbePromise = null
  clientRpcUnavailableUntil = 0
  invalidateAllClientRpcState()

  try {
    activeClient.removeAllListeners?.()
  } catch (error) {
    reportBestEffortError('project/client', error)
  }

  try {
    activeClient.close?.()
  } catch (error) {
    reportBestEffortError('project/client', error)
  }
}

function createClientForRuntime(
  runtime: ProjectServerRuntime
): WebSocketClient {
  client = new WebSocketClient(runtime.id)
  clientRuntimeKey = toServerRuntimeKey(runtime)
  hasAttachedClientRefreshSubscriptions = false
  clientReadyProbePromise = null
  clientRpcUnavailableUntil = 0
  return client
}

function replaceClientForRuntime(
  runtime: ProjectServerRuntime,
  options: {
    resyncImmediately?: boolean
  } = {}
): WebSocketClient {
  disposeActiveClient()
  const nextClient = createClientForRuntime(runtime)
  attachClientRefreshSubscriptions(nextClient, {
    resyncImmediately: options.resyncImmediately,
  })
  return nextClient
}

function ensureServerRuntimeEnvChangeSubscription(): void {
  if (hasSubscribedToServerRuntimeEnvChanges) {
    return
  }

  hasSubscribedToServerRuntimeEnvChanges = true
  onServerRuntimeEnvChange((runtime) => {
    if (!client) {
      return
    }

    if (!runtime) {
      disposeActiveClient()
      return
    }

    const nextRuntimeKey = toServerRuntimeKey(runtime)
    if (clientRuntimeKey === nextRuntimeKey) {
      return
    }

    replaceClientForRuntime(runtime, {
      resyncImmediately: true,
    })
  })
}

function getClient(): WebSocketClient | undefined {
  ensureServerRuntimeEnvChangeSubscription()

  const serverRuntime = getActiveProjectServerRuntime()
  const hadExistingClient = client !== undefined
  const nextRuntimeKey = serverRuntime
    ? toServerRuntimeKey(serverRuntime)
    : undefined

  if (!client && serverRuntime) {
    createClientForRuntime(serverRuntime)
  } else if (client && !serverRuntime) {
    disposeActiveClient()
  } else if (
    client &&
    serverRuntime &&
    clientRuntimeKey !== nextRuntimeKey
  ) {
    replaceClientForRuntime(serverRuntime, {
      resyncImmediately: true,
    })
  }

  if (client) {
    attachClientRefreshSubscriptions(client, {
      resyncImmediately: hadExistingClient,
    })
  }

  return client
}

async function getReadyClient(): Promise<WebSocketClient | undefined> {
  const activeClient = getClient()
  if (!activeClient) {
    return undefined
  }

  // Browser callers cannot fall back to local project analysis.
  if (typeof window !== 'undefined') {
    return activeClient
  }

  const now = Date.now()
  if (now < clientRpcUnavailableUntil) {
    return undefined
  }

  if (!clientReadyProbePromise) {
    clientReadyProbePromise = activeClient
      .ready(SERVER_RPC_READY_TIMEOUT_MS)
      .then(() => {
        clientRpcUnavailableUntil = 0
        return true
      })
      .catch(() => {
        clientRpcUnavailableUntil = Date.now() + SERVER_RPC_UNAVAILABLE_BACKOFF_MS
        return false
      })
      .finally(() => {
        clientReadyProbePromise = null
      })
  }

  const isReady = await clientReadyProbePromise
  return isReady ? activeClient : undefined
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
  const serverEffective = resolveServerRefreshNotificationsEffectiveFromEnv()
  if (serverEffective === false) {
    return false
  }

  const serverOverride = resolveServerRefreshNotificationsEnvOverride()
  if (serverOverride === false) {
    return false
  }

  if (
    typeof projectClientRuntimeOptions.consumeRefreshNotifications === 'boolean'
  ) {
    return projectClientRuntimeOptions.consumeRefreshNotifications
  }

  const override = resolveProjectRefreshNotificationsEnvOverride()
  if (override !== undefined) {
    return override
  }

  if (serverOverride !== undefined) {
    return serverOverride
  }

  if (serverEffective !== undefined) {
    return serverEffective
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
  const client = await getReadyClient()
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

/**
 * Resolve quick info for a symbol position in a source file.
 * @internal
 */
export async function getQuickInfoAtPosition(
  filePath: string,
  position: number,
  projectOptions?: ProjectOptions
): Promise<QuickInfoAtPosition | undefined> {
  const client = await getReadyClient()
  if (client) {
    return callClientMethod<
      {
        filePath: string
        position: number
        projectOptions?: ProjectOptions
      },
      QuickInfoAtPosition | undefined
    >(client, 'getQuickInfoAtPosition', {
      filePath,
      position,
      projectOptions,
    })
  }

  const project = getProject(projectOptions)
  return getQuickInfoAtPositionBase({
    project,
    filePath,
    position,
  })
}

let currentHighlighter: { current: Highlighter | null } = { current: null }
let highlighterPromise: Promise<Highlighter | null> | null = null
let queuedHighlighterLoad: NodeJS.Timeout | null = null

/** Ensure the highlighter is loaded when analysis needs it. */
function ensureHighlighterLoaded(
  options: Partial<Pick<ConfigurationOptions, 'theme' | 'languages'>>
): Promise<Highlighter | null> {
  if (currentHighlighter.current) {
    return Promise.resolve(currentHighlighter.current)
  }

  if (highlighterPromise) {
    return highlighterPromise
  }

  highlighterPromise = createHighlighter({
    theme: options.theme,
    languages: options.languages,
  })
    .then((highlighter) => {
      currentHighlighter.current = highlighter
      return highlighter
    })
    .catch((error) => {
      highlighterPromise = null
      reportBestEffortError('project/client', error)
      return null
    })

  return highlighterPromise
}

function queueHighlighterLoad(
  options: Partial<Pick<ConfigurationOptions, 'theme' | 'languages'>>
): void {
  if (currentHighlighter.current || highlighterPromise || queuedHighlighterLoad) {
    return
  }

  queuedHighlighterLoad = setTimeout(() => {
    queuedHighlighterLoad = null
    void ensureHighlighterLoaded(options)
  }, 0)
  queuedHighlighterLoad.unref?.()
}

/**
 * Resolve the type of an expression at a specific location.
 * @internal
 */
export async function resolveTypeAtLocation(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  filter?: TypeFilter,
  projectOptions?: ProjectOptions
): Promise<ResolvedTypeAtLocationResult['resolvedType']> {
  const result = await resolveTypeAtLocationWithDependencies(
    filePath,
    position,
    kind,
    filter,
    projectOptions
  )

  return result.resolvedType
}

/**
 * Resolve the type of an expression at a specific location and include
 * dependency metadata for cache invalidation.
 * @internal
 */
export async function resolveTypeAtLocationWithDependencies(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  filter?: TypeFilter,
  projectOptions?: ProjectOptions
): Promise<ResolvedTypeAtLocationResult> {
  const client = await getReadyClient()

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
    waitForWarmResult?: boolean
  }
): Promise<TokenizedLines> {
  const client = await getReadyClient()
  if (client) {
    return callClientMethod<
      Omit<GetTokensOptions, 'highlighter' | 'project'> & {
        projectOptions?: ProjectOptions
        waitForWarmResult?: boolean
      },
      TokenizedLines
    >(client, 'getTokens', options)
  }

  const { projectOptions, languages, ...getTokensOptions } = options
  const project = getProject(projectOptions)
  queueHighlighterLoad({
    theme: getTokensOptions.theme,
    languages,
  })

  return getCachedTokens(project, {
    ...getTokensOptions,
    highlighter: currentHighlighter.current,
    highlighterLoader: async () => {
      return ensureHighlighterLoaded({
        theme: getTokensOptions.theme,
        languages,
      })
    },
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
  const client = await getReadyClient()
  if (client) {
    const response = await callClientMethod<
      {
        filePath: string
        projectOptions?: ProjectOptions
        includeClientRpcDependencies?: boolean
      },
      ModuleExport[] | ClientRpcValueWithDependenciesResponse<ModuleExport[]>
    >(client, 'getFileExports', {
      filePath,
      projectOptions,
      includeClientRpcDependencies: true,
    })

    return toClientRpcResponseValue(response)
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
  const client = await getReadyClient()
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
  const client = await getReadyClient()
  if (client) {
    const response = await callClientMethod<
      {
        name: string
        filePath: string
        position: number
        kind: SyntaxKind
        projectOptions?: ProjectOptions
        includeClientRpcDependencies?: boolean
      },
      | Awaited<ReturnType<typeof baseGetFileExportMetadata>>
      | ClientRpcValueWithDependenciesResponse<
          Awaited<ReturnType<typeof baseGetFileExportMetadata>>
        >
    >(client, 'getFileExportMetadata', {
      name,
      filePath,
      position,
      kind,
      projectOptions,
      includeClientRpcDependencies: true,
    })

    return toClientRpcResponseValue(response)
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
  const client = await getReadyClient()
  if (client) {
    const response = await callClientMethod<
      {
        filePath: string
        position: number
        kind: SyntaxKind
        projectOptions?: ProjectOptions
        includeClientRpcDependencies?: boolean
      },
      unknown
    >(client, 'getFileExportStaticValue', {
      filePath,
      position,
      kind,
      projectOptions,
      includeClientRpcDependencies: true,
    })

    return toClientRpcResponseValue(response)
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
  const client = await getReadyClient()
  if (client) {
    const response = await callClientMethod<
      {
        filePath: string
        position: number
        kind: SyntaxKind
        includeDependencies?: boolean
        projectOptions?: ProjectOptions
      },
      string | GetFileExportTextRpcResponse
    >(client, 'getFileExportText', {
      filePath,
      position,
      kind,
      includeDependencies,
      projectOptions,
    })

    return toGetFileExportTextRpcValueText(response)
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
  const client = await getReadyClient()
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
    // Source updates can affect dependency-aware RPC results for many files.
    // Clear client-side RPC state so stale dependent entries are not reused.
    invalidateAllClientRpcState()
    invalidateProjectCachesByPaths([filePath])
    invalidateRuntimeAnalysisCachePath(filePath)
    invalidateSharedFileTextPrefixCachePath(filePath)
    return
  }

  const project = getProject(projectOptions)
  project.createSourceFile(filePath, sourceText, { overwrite: true })
  invalidateProjectFileCache(project, filePath)
  invalidateRuntimeAnalysisCachePath(filePath)
  invalidateSharedFileTextPrefixCachePath(filePath)
}

/**
 * Transpile a source file.
 * @internal
 */
export async function transpileSourceFile(
  filePath: string,
  projectOptions?: ProjectOptions
) {
  const client = await getReadyClient()
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
