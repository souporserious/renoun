import type {
  Project as TsMorphProject,
  SyntaxKind,
} from '../utils/ts-morph.ts'

import type { Languages as GrammarLanguage } from '../grammars/index.ts'
import type { Highlighter } from '../utils/create-highlighter.ts'
import { reportBestEffortError } from '../utils/best-effort.ts'
import type {
  ModuleExport,
  getFileExportMetadata as baseGetFileExportMetadata,
} from '../utils/get-file-exports.ts'
import type { GetTokensOptions, TokenizedLines } from '../utils/get-tokens.ts'
import type {
  GetSourceTextMetadataOptions,
  SourceTextMetadata,
} from './query/source-text-metadata.ts'
import type { OutlineRange } from '../utils/get-outline-ranges.ts'
import type { QuickInfoAtPosition } from '../utils/get-quick-info-at-position.ts'
import type { TypeFilter } from '../utils/resolve-type.ts'
import type { ResolvedTypeAtLocationResult } from '../utils/resolve-type-at-location.ts'
import type { HighlighterInitializationOptions } from '../utils/highlighter-options.ts'
import type { DistributiveOmit } from '../types.ts'
import {
  getAnalysisClientBrowserRuntime as getSharedAnalysisClientBrowserRuntime,
  getAnalysisServerRuntimeKey,
  normalizeAnalysisServerRuntime,
  onAnalysisClientBrowserRuntimeChange as onSharedAnalysisClientBrowserRuntimeChange,
  setAnalysisClientBrowserRuntime as setSharedAnalysisClientBrowserRuntime,
} from './browser-runtime.ts'
import {
  getAnalysisClientRetainedBrowserRuntimeActivationKey as getRetainedBrowserRuntimeActivationKey,
  hasRetainedAnalysisClientBrowserRuntime as hasRetainedBrowserRuntime,
  onAnalysisClientBrowserRuntimeRetentionChange as onBrowserRuntimeRetentionChange,
  resetRequestedAnalysisClientBrowserRuntimeState,
  retainRequestedAnalysisClientBrowserRuntime,
  setRequestedAnalysisClientBrowserRuntime,
} from './client-browser-runtime-retention.ts'
import {
  CLIENT_CACHED_RPC_METHODS,
  type ClientCachedRpcMethod,
  type ClientRpcValueWithDependenciesResponse,
  type GetFileExportTextRpcResponse,
  clearClientRpcCacheStateForTests,
  collectClientRpcDependencyPaths,
  collectClientRpcResponseDependencyPaths,
  collectConservativeRefreshFallbackPaths,
  deleteClientRpcInFlightEntry,
  deleteClientRpcInFlightEntryIfPromise,
  getClientRpcInFlightEntry,
  getClientRpcInvalidationEpoch,
  invalidateAllClientRpcCache,
  invalidateClientRpcCacheByNormalizedPaths,
  normalizeInvalidationPaths,
  pruneExpiredClientRpcCacheEntries,
  readClientRpcCacheEntry,
  rememberWorkspaceRootCandidates,
  resetClientRpcCacheForRuntimeChange,
  setClientRpcCacheEntry,
  setClientRpcInFlightEntry,
  shouldBypassClientRpcCache,
  toClientRpcCacheKey,
  toClientRpcResponseValue,
  toGetFileExportTextRpcValueText,
  trimClientRpcCache,
} from './client.cache.ts'
import {
  type AnalysisClientBrowserRefreshNotification as ClientBrowserRefreshNotification,
  bumpLatestRefreshCursorForRuntime,
  emitAnalysisClientBrowserRefreshNotification,
  getAnalysisClientRefreshVersion as getCurrentAnalysisClientRefreshVersion,
  getLatestRefreshCursorForRuntime,
  hasAnalysisClientBrowserRefreshListeners,
  hasConnectedAnalysisServerClientRuntime,
  hydrateRefreshStateFromSharedAnalysisBrowserVersion,
  notifyAnalysisClientBrowserRefreshNotification,
  notifyAnalysisClientRefreshVersionChanged,
  onAnalysisClientBrowserRefreshNotification as subscribeAnalysisClientBrowserRefreshNotification,
  onAnalysisClientRefreshVersionChange as subscribeAnalysisClientRefreshVersionChange,
  rememberConnectedAnalysisServerClientRuntime,
  resetAnalysisClientRefreshState,
  resetLatestAnalysisClientRefreshCursor,
  setAnalysisClientRefreshVersionForTests as setClientRefreshVersionForTests,
  setLatestRefreshCursorForRuntime,
  syncLatestRefreshCursorForRuntime,
} from './client-refresh-state.ts'
import { WebSocketClient } from './rpc/client.ts'
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
  resolveAnalysisClientRpcCacheEnabledFromEnv,
  resolveAnalysisClientRpcCacheTtlMsFromEnv,
  resolveAnalysisRefreshNotificationsEnvOverride,
  resolveServerRefreshNotificationsEffectiveFromEnv,
  resolveServerRefreshNotificationsEnvOverride,
} from './runtime-env.ts'
import type { AnalysisServerRuntime } from './runtime-env.ts'
import type { AnalysisOptions } from './types.ts'

export type { AnalysisClientBrowserRefreshNotification } from './client-refresh-state.ts'

type AnalysisClientServerModules = typeof import('#analysis-client-server')

interface ActiveClientState {
  client: WebSocketClient
  runtime: AnalysisServerRuntime
  runtimeKey: string
  generation: number
  refreshSubscriptionsAttached: boolean
  readyProbePromise: Promise<boolean> | null
  rpcUnavailableUntil: number
}

interface RefreshSubscribedClientState {
  client: WebSocketClient
  runtime: AnalysisServerRuntime
  runtimeKey: string
  refreshSubscriptionsAttached: boolean
}

interface BrowserRuntimeClientState {
  client: WebSocketClient
  runtime: AnalysisServerRuntime
  runtimeKey: string
  inFlightRequestCount: number
  isCached: boolean
  refreshSubscriptionsAttached: boolean
}

let activeClientState: ActiveClientState | undefined
let cachedBrowserClientState: BrowserRuntimeClientState | undefined
let nextActiveClientGeneration = 0
let hasSubscribedToServerRuntimeEnvChanges = false
const pendingRefreshInvalidationPathsByScope = new Map<
  string | undefined,
  Set<string>
>()
let isRefreshInvalidationFlushQueued = false
let refreshResyncQueue: Promise<void> = Promise.resolve()
let loadedAnalysisClientServerModules: AnalysisClientServerModules | undefined
let analysisClientServerModulesPromise:
  | Promise<AnalysisClientServerModules>
  | undefined

const DEFAULT_CLIENT_RPC_CACHE_TTL_MS = 30_000
const SERVER_RPC_READY_TIMEOUT_MS = 500
const SERVER_RPC_UNAVAILABLE_BACKOFF_MS = 5_000
const REFRESH_RESYNC_MAX_ATTEMPTS = 3
const REFRESH_RESYNC_RETRY_BASE_DELAY_MS = 100

/**
 * A monotonic version that advances as refresh notifications invalidate client
 * runtime state. UI caches can include this to avoid stale data after edits.
 */
export function getAnalysisClientRefreshVersion(
  runtime?: AnalysisServerRuntime
): string {
  return getCurrentAnalysisClientRefreshVersion(
    getCurrentAnalysisClientRefreshVersionRuntimeKey(),
    runtime
  )
}

function getCurrentAnalysisClientRefreshVersionRuntimeKey():
  | string
  | undefined {
  return (
    getAnalysisServerRuntimeKey(getSharedAnalysisClientBrowserRuntime()) ??
    activeClientState?.runtimeKey ??
    cachedBrowserClientState?.runtimeKey
  )
}

export function onAnalysisClientRefreshVersionChange(
  listener: (version: string) => void
): () => void {
  return subscribeAnalysisClientRefreshVersionChange(listener)
}

export function getAnalysisClientBrowserRuntime():
  | AnalysisServerRuntime
  | undefined {
  return getSharedAnalysisClientBrowserRuntime()
}

export function onAnalysisClientBrowserRuntimeChange(
  listener: (runtime: AnalysisServerRuntime | undefined) => void
): () => void {
  return onSharedAnalysisClientBrowserRuntimeChange(listener)
}

export function onAnalysisClientBrowserRuntimeRetentionChange(
  listener: (hasRetainedBrowserRuntime: boolean) => void
): () => void {
  return onBrowserRuntimeRetentionChange(listener)
}

export function getAnalysisClientRetainedBrowserRuntimeActivationKey():
  | string
  | undefined {
  return getRetainedBrowserRuntimeActivationKey()
}

export function onAnalysisClientBrowserRefreshNotification(
  listener: (message: ClientBrowserRefreshNotification) => void
): () => void {
  const unsubscribe = subscribeAnalysisClientBrowserRefreshNotification(
    listener
  )
  ensureRefreshSubscriptionsForCurrentClients()
  return unsubscribe
}

function ensureRefreshSubscriptionsForCurrentClients(): void {
  if (activeClientState) {
    attachClientRefreshSubscriptions(activeClientState)
  }

  const cachedState = cachedBrowserClientState
  if (cachedState) {
    attachClientRefreshSubscriptions(cachedState, {
      isCurrentState: () => isCurrentBrowserClientState(cachedState),
    })
  }
}

function isCurrentActiveClientState(
  state: ActiveClientState | undefined
): state is ActiveClientState {
  return (
    state !== undefined &&
    activeClientState?.generation === state.generation &&
    activeClientState.client === state.client
  )
}

function isCurrentBrowserClientState(
  state: BrowserRuntimeClientState
): boolean {
  return (
    cachedBrowserClientState?.runtimeKey === state.runtimeKey &&
    cachedBrowserClientState.client === state.client
  )
}

function applyAnalysisClientBrowserRuntime(
  runtime?: AnalysisServerRuntime
): void {
  const normalizedRuntime = normalizeAnalysisServerRuntime(runtime)
  const currentRuntime = getSharedAnalysisClientBrowserRuntime()
  const currentRuntimeKey = currentRuntime
    ? getAnalysisServerRuntimeKey(currentRuntime)
    : undefined
  const nextRuntimeKey = normalizedRuntime
    ? getAnalysisServerRuntimeKey(normalizedRuntime)
    : undefined
  const didRuntimeChange = currentRuntimeKey !== nextRuntimeKey
  const didSwitchFromExistingRuntime =
    didRuntimeChange && currentRuntimeKey !== undefined

  setSharedAnalysisClientBrowserRuntime(normalizedRuntime)

  if (didRuntimeChange) {
    if (!didSwitchFromExistingRuntime && nextRuntimeKey) {
      hydrateRefreshStateFromSharedAnalysisBrowserVersion(nextRuntimeKey)
      syncLatestRefreshCursorForRuntime(
        getCurrentAnalysisClientRefreshVersionRuntimeKey(),
        nextRuntimeKey
      )
    }
  }

  if (typeof WebSocket === 'undefined') {
    return
  }

  if (didSwitchFromExistingRuntime) {
    resetClientRefreshStateForRuntimeChange()
  }

  if (!normalizedRuntime) {
    disposeActiveClient({
      invalidateClientRpcState: !didSwitchFromExistingRuntime,
    })
    return
  }

  if (!activeClientState) {
    const nextClientState = createClientForRuntime(normalizedRuntime)
    attachClientRefreshSubscriptions(nextClientState, {
      resyncImmediately: didSwitchFromExistingRuntime,
    })
    return
  }

  if (activeClientState.runtimeKey !== nextRuntimeKey) {
    replaceClientForRuntime(normalizedRuntime, {
      resyncImmediately: didSwitchFromExistingRuntime,
      invalidateClientRpcState: !didSwitchFromExistingRuntime,
    })
    return
  }

  activeClientState.runtime = normalizedRuntime
  attachClientRefreshSubscriptions(activeClientState)
}

export function setAnalysisClientBrowserRuntime(
  runtime?: AnalysisServerRuntime
): void {
  setRequestedAnalysisClientBrowserRuntime(
    runtime,
    applyAnalysisClientBrowserRuntime
  )
}

export function retainAnalysisClientBrowserRuntime(
  runtime?: AnalysisServerRuntime,
  options: {
    preferCurrentRuntime?: boolean
  } = {}
): () => void {
  return retainRequestedAnalysisClientBrowserRuntime(
    runtime,
    applyAnalysisClientBrowserRuntime,
    options
  )
}

export function hasRetainedAnalysisClientBrowserRuntime(): boolean {
  return hasRetainedBrowserRuntime()
}

export interface AnalysisClientRuntimeOptions {
  useRpcCache?: boolean
  rpcCacheTtlMs?: number
  consumeRefreshNotifications?: boolean
  analysisCacheMaxEntries?: number
}

const analysisClientRuntimeOptions: AnalysisClientRuntimeOptions = {}

function applyAnalysisCacheRuntimeOptions(
  modules: AnalysisClientServerModules
): void {
  if (analysisClientRuntimeOptions.analysisCacheMaxEntries !== undefined) {
    modules.configureAnalysisCacheRuntime({
      maxEntries: analysisClientRuntimeOptions.analysisCacheMaxEntries,
    })
  }
}

async function loadAnalysisClientServerModules(): Promise<AnalysisClientServerModules> {
  if (loadedAnalysisClientServerModules) {
    return loadedAnalysisClientServerModules
  }

  if (!analysisClientServerModulesPromise) {
    const loadPromise = import('#analysis-client-server')
      .then((modules) => {
        applyAnalysisCacheRuntimeOptions(modules)
        loadedAnalysisClientServerModules = modules
        return modules
      })
      .catch((error) => {
        if (analysisClientServerModulesPromise === loadPromise) {
          analysisClientServerModulesPromise = undefined
        }

        throw error
      })

    analysisClientServerModulesPromise = loadPromise
  }

  return analysisClientServerModulesPromise
}

function getLoadedAnalysisClientServerModules():
  | AnalysisClientServerModules
  | undefined {
  return loadedAnalysisClientServerModules
}

export function configureAnalysisClientRuntime(
  options: AnalysisClientRuntimeOptions
): void {
  if ('useRpcCache' in options) {
    analysisClientRuntimeOptions.useRpcCache = options.useRpcCache
  }

  if ('rpcCacheTtlMs' in options) {
    analysisClientRuntimeOptions.rpcCacheTtlMs = options.rpcCacheTtlMs
  }

  if ('consumeRefreshNotifications' in options) {
    analysisClientRuntimeOptions.consumeRefreshNotifications =
      options.consumeRefreshNotifications
  }

  if ('analysisCacheMaxEntries' in options) {
    analysisClientRuntimeOptions.analysisCacheMaxEntries =
      options.analysisCacheMaxEntries
    const loadedServerModules = getLoadedAnalysisClientServerModules()
    if (loadedServerModules) {
      applyAnalysisCacheRuntimeOptions(loadedServerModules)
    }
  }
}

export function resetAnalysisClientRuntimeConfiguration(): void {
  analysisClientRuntimeOptions.useRpcCache = undefined
  analysisClientRuntimeOptions.rpcCacheTtlMs = undefined
  analysisClientRuntimeOptions.consumeRefreshNotifications = undefined
  analysisClientRuntimeOptions.analysisCacheMaxEntries = undefined
  getLoadedAnalysisClientServerModules()?.resetAnalysisCacheRuntimeConfiguration()
}

function getActiveAnalysisServerRuntime(): AnalysisServerRuntime | undefined {
  const browserRuntime = getSharedAnalysisClientBrowserRuntime()
  if (browserRuntime) {
    return browserRuntime
  }

  return getServerRuntimeFromProcessEnv()
}

function resolveActiveRuntimeRefreshNotificationsCapability(
  runtime?: AnalysisServerRuntime
): boolean | undefined {
  if (typeof runtime?.emitRefreshNotifications === 'boolean') {
    return runtime.emitRefreshNotifications
  }

  const activeRuntime = getActiveAnalysisServerRuntime()
  if (typeof activeRuntime?.emitRefreshNotifications === 'boolean') {
    return activeRuntime.emitRefreshNotifications
  }

  return (
    resolveServerRefreshNotificationsEffectiveFromEnv() ??
    resolveServerRefreshNotificationsEnvOverride()
  )
}

function shouldUseClientRpcCache(runtime?: AnalysisServerRuntime): boolean {
  if (typeof analysisClientRuntimeOptions.useRpcCache === 'boolean') {
    return analysisClientRuntimeOptions.useRpcCache
  }

  const override = resolveAnalysisClientRpcCacheEnabledFromEnv()
  if (override !== undefined) {
    return override
  }

  if (!shouldConsumeRefreshNotifications(runtime)) {
    return false
  }

  return true
}

function getClientRpcCacheTtlMs(): number {
  if (typeof analysisClientRuntimeOptions.rpcCacheTtlMs === 'number') {
    const normalizedTtl = Math.floor(analysisClientRuntimeOptions.rpcCacheTtlMs)
    return Number.isFinite(normalizedTtl) && normalizedTtl > 0
      ? normalizedTtl
      : 0
  }

  return resolveAnalysisClientRpcCacheTtlMsFromEnv(
    DEFAULT_CLIENT_RPC_CACHE_TTL_MS
  )
}

function invalidateClientRpcStateByNormalizedPaths(
  normalizedPaths: readonly string[],
  invalidationScopeKey?: string
): void {
  invalidateClientRpcCacheByNormalizedPaths(
    normalizedPaths,
    invalidationScopeKey
  )
  notifyAnalysisClientRefreshVersionChanged(
    getCurrentAnalysisClientRefreshVersionRuntimeKey()
  )
}

function invalidateAllClientRpcState(invalidationScopeKey?: string): void {
  invalidateAllClientRpcCache(invalidationScopeKey)
  notifyAnalysisClientRefreshVersionChanged(
    getCurrentAnalysisClientRefreshVersionRuntimeKey()
  )
}

function resetClientRefreshStateForRuntimeChange(): void {
  const runtimeKey = getCurrentAnalysisClientRefreshVersionRuntimeKey()
  hydrateRefreshStateFromSharedAnalysisBrowserVersion(runtimeKey)
  resetClientRpcCacheForRuntimeChange()
  pendingRefreshInvalidationPathsByScope.clear()
  resetLatestAnalysisClientRefreshCursor(runtimeKey)
}

function applyLoadedRuntimeRefreshInvalidations(runtimePaths: string[]): void {
  if (runtimePaths.length === 0) {
    return
  }

  const loadedServerModules = getLoadedAnalysisClientServerModules()
  if (!loadedServerModules) {
    return
  }

  loadedServerModules.invalidateRuntimeAnalysisCachePaths(runtimePaths)
  loadedServerModules.invalidateProgramCachesByPaths(runtimePaths)
}

function applyRefreshInvalidations(
  paths: string[],
  invalidationScopeKey?: string
): void {
  const { comparablePaths, runtimePaths } = normalizeInvalidationPaths(paths)
  if (comparablePaths.length === 0) {
    return
  }

  invalidateClientRpcStateByNormalizedPaths(
    comparablePaths,
    invalidationScopeKey
  )
  applyLoadedRuntimeRefreshInvalidations(runtimePaths)
}

async function callClientMethod<Params extends Record<string, unknown>, Value>(
  activeClient: WebSocketClient,
  method: string,
  params: Params,
  options: {
    cacheParams?: unknown
    cacheKeyPrefix?: string
    disableRpcCache?: boolean
    serverRuntime?: AnalysisServerRuntime
  } = {}
): Promise<Value> {
  const cacheParams = options.cacheParams ?? params
  rememberWorkspaceRootCandidates(params)

  if (
    options.disableRpcCache === true ||
    !shouldUseClientRpcCache(options.serverRuntime) ||
    !CLIENT_CACHED_RPC_METHODS.has(method as ClientCachedRpcMethod)
  ) {
    return activeClient.callMethod<Params, Value>(method, params)
  }

  const ttlMs = getClientRpcCacheTtlMs()
  if (ttlMs <= 0) {
    return activeClient.callMethod<Params, Value>(method, params)
  }

  const typedMethod = method as ClientCachedRpcMethod
  if (
    shouldBypassClientRpcCache(
      typedMethod,
      params,
      shouldConsumeRefreshNotifications(options.serverRuntime)
    )
  ) {
    return activeClient.callMethod<Params, Value>(method, params)
  }

  const cacheKey = toClientRpcCacheKey(
    typedMethod,
    options.cacheKeyPrefix
      ? {
          cacheKeyPrefix: options.cacheKeyPrefix,
          params: cacheParams,
        }
      : cacheParams
  )
  const requestEpoch = getClientRpcInvalidationEpoch()
  const scopeKey = options.cacheKeyPrefix
  const now = Date.now()
  pruneExpiredClientRpcCacheEntries(now)
  const cached = readClientRpcCacheEntry(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.value as Value
  }

  const inFlight = getClientRpcInFlightEntry(cacheKey)
  if (inFlight) {
    if (inFlight.epoch === requestEpoch) {
      return inFlight.promise as Promise<Value>
    }
    deleteClientRpcInFlightEntry(cacheKey)
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

      if (requestEpoch === getClientRpcInvalidationEpoch()) {
        setClientRpcCacheEntry(cacheKey, {
          value,
          expiresAt: Date.now() + ttlMs,
          dependencyPaths: resolvedDependencyPaths,
          scopeKey,
        })
        trimClientRpcCache()
      }
      return value
    })
    .finally(() => {
      deleteClientRpcInFlightEntryIfPromise(
        cacheKey,
        request as Promise<unknown>
      )
    })
  setClientRpcInFlightEntry(cacheKey, {
    promise: request as Promise<unknown>,
    dependencyPaths: requestDependencyPaths,
    epoch: requestEpoch,
    scopeKey,
  })

  return request
}

function queueRefreshResync(
  state: RefreshSubscribedClientState,
  isCurrentState: () => boolean
): void {
  const invalidationScopeKey = toRuntimeCacheScopeKey(state.runtimeKey)
  refreshResyncQueue = refreshResyncQueue
    .catch(() => {})
    .then(async () => {
      if (!isCurrentState()) {
        return
      }

      hydrateRefreshStateFromSharedAnalysisBrowserVersion(state.runtimeKey)

      for (
        let attempt = 1;
        attempt <= REFRESH_RESYNC_MAX_ATTEMPTS;
        attempt += 1
      ) {
        try {
          const response = await state.client.callMethod<
            RefreshInvalidationsSinceRequest,
            RefreshInvalidationsSinceResponse
          >('getRefreshInvalidationsSince', {
            sinceCursor: getLatestRefreshCursorForRuntime(state.runtimeKey),
          })
          if (!isCurrentState()) {
            return
          }

          const nextCursor = normalizeRefreshCursor(response.nextCursor)
          const paths = getRefreshInvalidationPaths(response)
          const shouldConsumeNotifications = shouldConsumeRefreshNotifications(
            state.runtime
          )
          if (response.fullRefresh) {
            if (shouldConsumeNotifications) {
              if (paths.length > 0) {
                applyRefreshInvalidations(paths, invalidationScopeKey)
              } else {
                invalidateAllClientRpcState(invalidationScopeKey)
              }
            }
            setLatestRefreshCursorForRuntime(
              getCurrentAnalysisClientRefreshVersionRuntimeKey(),
              state.runtimeKey,
              nextCursor ?? 0,
              {
                notify: shouldConsumeNotifications,
              }
            )
            emitAnalysisClientBrowserRefreshNotification({
              runtime: state.runtime,
              runtimeKey: state.runtimeKey,
              refreshCursor: nextCursor,
              invalidationPaths: paths,
            })
            return
          }

          if (nextCursor !== undefined) {
            bumpLatestRefreshCursorForRuntime(
              getCurrentAnalysisClientRefreshVersionRuntimeKey(),
              state.runtimeKey,
              nextCursor,
              {
                notify: shouldConsumeNotifications,
              }
            )
          }

          if (shouldConsumeNotifications) {
            for (const path of paths) {
              queueRefreshInvalidation(path, invalidationScopeKey)
            }
          }
          if (paths.length > 0) {
            emitAnalysisClientBrowserRefreshNotification({
              runtime: state.runtime,
              runtimeKey: state.runtimeKey,
              refreshCursor: nextCursor,
              invalidationPaths: paths,
            })
          }
          return
        } catch {
          if (!isCurrentState()) {
            return
          }

          if (typeof window !== 'undefined') {
            const fallbackPaths = collectConservativeRefreshFallbackPaths()
            if (shouldConsumeRefreshNotifications(state.runtime)) {
              applyRefreshInvalidations(fallbackPaths, invalidationScopeKey)
            }
            setLatestRefreshCursorForRuntime(
              getCurrentAnalysisClientRefreshVersionRuntimeKey(),
              state.runtimeKey,
              0,
              {
                notify: shouldConsumeRefreshNotifications(state.runtime),
              }
            )
            emitAnalysisClientBrowserRefreshNotification({
              runtime: state.runtime,
              runtimeKey: state.runtimeKey,
            })
            return
          }

          if (attempt >= REFRESH_RESYNC_MAX_ATTEMPTS) {
            // Conservative fallback: clear client-side RPC caches and invalidate
            // runtime/project caches for all observed project roots.
            const fallbackPaths = collectConservativeRefreshFallbackPaths()
            applyRefreshInvalidations(fallbackPaths, invalidationScopeKey)
            setLatestRefreshCursorForRuntime(
              getCurrentAnalysisClientRefreshVersionRuntimeKey(),
              state.runtimeKey,
              0
            )
            emitAnalysisClientBrowserRefreshNotification({
              runtime: state.runtime,
              runtimeKey: state.runtimeKey,
              invalidationPaths: fallbackPaths,
            })
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
  state: RefreshSubscribedClientState,
  options: {
    isCurrentState?: () => boolean
    onConnected?: () => void
    resyncImmediately?: boolean
  } = {}
): void {
  if (
    state.refreshSubscriptionsAttached ||
    !shouldAttachRefreshTransport(state.runtime)
  ) {
    return
  }

  const isCurrentState =
    options.isCurrentState ??
    (() => isCurrentActiveClientState(state as ActiveClientState))

  state.refreshSubscriptionsAttached = true
  state.client.on('connected', () => {
    if (!isCurrentState()) {
      return
    }

    options.onConnected?.()

    if (!hasConnectedAnalysisServerClientRuntime(state.runtimeKey)) {
      rememberConnectedAnalysisServerClientRuntime(state.runtimeKey)
      return
    }

    queueRefreshResync(state, isCurrentState)
  })
  state.client.on('notification', (message) => {
    if (!isCurrentState()) {
      return
    }

    if (!isRefreshNotification(message)) {
      return
    }

    const refreshCursor = normalizeRefreshCursor(message.data.refreshCursor)
    if (refreshCursor !== undefined) {
      bumpLatestRefreshCursorForRuntime(
        getCurrentAnalysisClientRefreshVersionRuntimeKey(),
        state.runtimeKey,
        refreshCursor,
        {
          notify: shouldConsumeRefreshNotifications(state.runtime),
        }
      )
    }

    const paths = getRefreshInvalidationPaths(message.data)
    if (shouldConsumeRefreshNotifications(state.runtime)) {
      const invalidationScopeKey = toRuntimeCacheScopeKey(state.runtimeKey)
      for (const path of paths) {
        queueRefreshInvalidation(path, invalidationScopeKey)
      }
    }
    notifyAnalysisClientBrowserRefreshNotification({
      ...message,
      runtime: state.runtime,
      runtimeKey: state.runtimeKey,
    })
  })

  if (options.resyncImmediately) {
    rememberConnectedAnalysisServerClientRuntime(state.runtimeKey)
    queueRefreshResync(state, isCurrentState)
  }
}

function toServerRuntimeKey(runtime: AnalysisServerRuntime): string {
  return getAnalysisServerRuntimeKey(runtime) ?? `${runtime.id}:${runtime.port}`
}

function toRuntimeCacheScopeKey(runtimeKey: string): string {
  return `runtime:${runtimeKey}`
}

function createAnalysisBrowserClient(
  runtime: AnalysisServerRuntime,
  runtimeKey: string,
  isCached: boolean
): BrowserRuntimeClientState {
  const state: BrowserRuntimeClientState = {
    client: new WebSocketClient(runtime.id, runtime),
    runtime,
    runtimeKey,
    inFlightRequestCount: 0,
    isCached,
    refreshSubscriptionsAttached: false,
  }

  if (isCached) {
    cachedBrowserClientState = state
    attachClientRefreshSubscriptions(state, {
      isCurrentState: () => isCurrentBrowserClientState(state),
    })
  }

  return state
}

function disposeBrowserClientState(
  state: BrowserRuntimeClientState | undefined
): void {
  if (!state) {
    return
  }

  try {
    state.client.removeAllListeners?.()
  } catch (error) {
    reportBestEffortError('analysis/client', error)
  }

  try {
    state.client.close?.()
  } catch (error) {
    reportBestEffortError('analysis/client', error)
  }
}

function disposeAnalysisBrowserClient(): void {
  if (!cachedBrowserClientState) {
    return
  }

  const activeState = cachedBrowserClientState
  cachedBrowserClientState = undefined
  disposeBrowserClientState(activeState)
}

function getAnalysisBrowserClientState(
  requestedRuntime?: AnalysisServerRuntime
): BrowserRuntimeClientState {
  const runtime = normalizeAnalysisServerRuntime(
    requestedRuntime ?? getSharedAnalysisClientBrowserRuntime()
  )
  const runtimeKey = getAnalysisServerRuntimeKey(runtime)
  if (!runtime || !runtimeKey) {
    disposeAnalysisBrowserClient()
    throw new Error('[renoun] Missing active browser analysis runtime.')
  }

  if (!cachedBrowserClientState) {
    return createAnalysisBrowserClient(runtime, runtimeKey, true)
  }

  if (cachedBrowserClientState.runtimeKey === runtimeKey) {
    const cachedState = cachedBrowserClientState
    cachedState.runtime = runtime
    attachClientRefreshSubscriptions(cachedState, {
      isCurrentState: () => isCurrentBrowserClientState(cachedState),
    })
    return cachedState
  }

  if (cachedBrowserClientState.inFlightRequestCount === 0) {
    disposeBrowserClientState(cachedBrowserClientState)
    cachedBrowserClientState = undefined
    return createAnalysisBrowserClient(runtime, runtimeKey, true)
  }

  return createAnalysisBrowserClient(runtime, runtimeKey, false)
}

function disposeActiveClient(
  options: {
    invalidateClientRpcState?: boolean
  } = {}
): void {
  const { invalidateClientRpcState = true } = options
  const state = activeClientState
  if (!state) {
    if (invalidateClientRpcState) {
      invalidateAllClientRpcState()
    }
    return
  }

  activeClientState = undefined
  if (invalidateClientRpcState) {
    invalidateAllClientRpcState()
  }

  try {
    state.client.removeAllListeners?.()
  } catch (error) {
    reportBestEffortError('analysis/client', error)
  }

  try {
    state.client.close?.()
  } catch (error) {
    reportBestEffortError('analysis/client', error)
  }
}

function createClientForRuntime(
  runtime: AnalysisServerRuntime
): ActiveClientState {
  const state: ActiveClientState = {
    client: new WebSocketClient(runtime.id, runtime),
    runtime,
    runtimeKey: toServerRuntimeKey(runtime),
    generation: ++nextActiveClientGeneration,
    refreshSubscriptionsAttached: false,
    readyProbePromise: null,
    rpcUnavailableUntil: 0,
  }
  activeClientState = state
  return state
}

function replaceClientForRuntime(
  runtime: AnalysisServerRuntime,
  options: {
    resyncImmediately?: boolean
    invalidateClientRpcState?: boolean
  } = {}
): ActiveClientState {
  disposeActiveClient({
    invalidateClientRpcState: options.invalidateClientRpcState,
  })
  const nextClientState = createClientForRuntime(runtime)
  attachClientRefreshSubscriptions(nextClientState, {
    onConnected: () => {
      nextClientState.rpcUnavailableUntil = 0
    },
    resyncImmediately: options.resyncImmediately,
  })
  return nextClientState
}

function ensureServerRuntimeEnvChangeSubscription(): void {
  if (hasSubscribedToServerRuntimeEnvChanges) {
    return
  }

  hasSubscribedToServerRuntimeEnvChanges = true
  onServerRuntimeEnvChange((runtime) => {
    if (!activeClientState) {
      return
    }

    if (!runtime) {
      disposeActiveClient()
      return
    }

    const nextRuntimeKey = toServerRuntimeKey(runtime)
    if (activeClientState.runtimeKey === nextRuntimeKey) {
      activeClientState.runtime = runtime
      return
    }

    replaceClientForRuntime(runtime, {
      resyncImmediately: true,
    })
  })
}

function getClient(): WebSocketClient | undefined {
  ensureServerRuntimeEnvChangeSubscription()

  const serverRuntime = getActiveAnalysisServerRuntime()
  const hadExistingClient = activeClientState !== undefined
  const nextRuntimeKey = serverRuntime
    ? toServerRuntimeKey(serverRuntime)
    : undefined

  if (!activeClientState && serverRuntime) {
    createClientForRuntime(serverRuntime)
  } else if (activeClientState && !serverRuntime) {
    disposeActiveClient()
  } else if (
    activeClientState &&
    serverRuntime &&
    activeClientState.runtimeKey !== nextRuntimeKey
  ) {
    replaceClientForRuntime(serverRuntime, {
      resyncImmediately: true,
    })
  } else if (activeClientState && serverRuntime) {
    activeClientState.runtime = serverRuntime
  }

  if (activeClientState) {
    const currentState = activeClientState
    attachClientRefreshSubscriptions(currentState, {
      onConnected: () => {
        currentState.rpcUnavailableUntil = 0
      },
      resyncImmediately: hadExistingClient,
    })
  }

  return activeClientState?.client
}

async function getReadyClient(): Promise<WebSocketClient | undefined> {
  const activeClient = getClient()
  const state = activeClientState
  if (!activeClient || !state || state.client !== activeClient) {
    return undefined
  }

  // Browser callers cannot fall back to local in-process analysis.
  if (typeof window !== 'undefined') {
    return activeClient
  }

  const now = Date.now()
  if (now < state.rpcUnavailableUntil) {
    return undefined
  }

  if (!state.readyProbePromise) {
    state.readyProbePromise = activeClient
      .ready(SERVER_RPC_READY_TIMEOUT_MS)
      .then(() => {
        if (isCurrentActiveClientState(state)) {
          state.rpcUnavailableUntil = 0
        }
        return true
      })
      .catch(() => {
        if (isCurrentActiveClientState(state)) {
          state.rpcUnavailableUntil =
            Date.now() + SERVER_RPC_UNAVAILABLE_BACKOFF_MS
        }
        return false
      })
      .finally(() => {
        if (isCurrentActiveClientState(state)) {
          state.readyProbePromise = null
        }
      })
  }

  const isReady = await state.readyProbePromise
  return isReady && isCurrentActiveClientState(state) ? state.client : undefined
}

async function callBrowserRuntimeClientMethod<
  Params extends Record<string, unknown>,
  Value,
>(
  method: string,
  params: Params,
  runtime: AnalysisServerRuntime,
  options: {
    cacheParams?: unknown
    disableRpcCache?: boolean
  } = {}
): Promise<Value> {
  const runtimeKey = toServerRuntimeKey(runtime)
  const cacheScopeKey = toRuntimeCacheScopeKey(runtimeKey)
  if (activeClientState?.runtimeKey === runtimeKey) {
    return callClientMethod<Params, Value>(
      activeClientState.client,
      method,
      params,
      {
        ...options,
        cacheKeyPrefix: cacheScopeKey,
        serverRuntime: runtime,
      }
    )
  }

  const activeClient = getClient()
  if (
    activeClient &&
    activeClientState &&
    activeClientState.client === activeClient &&
    activeClientState.runtimeKey === runtimeKey
  ) {
    return callClientMethod<Params, Value>(activeClient, method, params, {
      ...options,
      cacheKeyPrefix: cacheScopeKey,
      serverRuntime: runtime,
    })
  }

  const clientState = getAnalysisBrowserClientState(runtime)
  clientState.inFlightRequestCount += 1

  try {
    return await callClientMethod<Params, Value>(
      clientState.client,
      method,
      params,
      {
        ...options,
        cacheKeyPrefix: cacheScopeKey,
        serverRuntime: runtime,
      }
    )
  } finally {
    clientState.inFlightRequestCount -= 1

    if (!clientState.isCached && clientState.inFlightRequestCount === 0) {
      disposeBrowserClientState(clientState)
    }
  }
}

function queueRefreshInvalidation(
  path: string,
  invalidationScopeKey?: string
): void {
  let pendingPaths =
    pendingRefreshInvalidationPathsByScope.get(invalidationScopeKey)
  if (!pendingPaths) {
    pendingPaths = new Set<string>()
    pendingRefreshInvalidationPathsByScope.set(
      invalidationScopeKey,
      pendingPaths
    )
  }

  pendingPaths.add(path)
  if (isRefreshInvalidationFlushQueued) {
    return
  }

  isRefreshInvalidationFlushQueued = true
  queueMicrotask(() => {
    isRefreshInvalidationFlushQueued = false
    const pendingInvalidations = Array.from(
      pendingRefreshInvalidationPathsByScope,
      ([scopeKey, scopePaths]) => ({
        scopeKey,
        paths: Array.from(scopePaths),
      })
    )
    pendingRefreshInvalidationPathsByScope.clear()

    for (const pendingInvalidation of pendingInvalidations) {
      if (pendingInvalidation.paths.length === 0) {
        continue
      }

      applyRefreshInvalidations(
        pendingInvalidation.paths,
        pendingInvalidation.scopeKey
      )
    }
  })
}

function shouldConsumeRefreshNotifications(
  runtime?: AnalysisServerRuntime
): boolean {
  const serverCapability =
    resolveActiveRuntimeRefreshNotificationsCapability(runtime)
  if (serverCapability === false) {
    return false
  }

  if (
    typeof analysisClientRuntimeOptions.consumeRefreshNotifications ===
    'boolean'
  ) {
    return analysisClientRuntimeOptions.consumeRefreshNotifications
  }

  const override = resolveAnalysisRefreshNotificationsEnvOverride()
  if (override !== undefined) {
    return override
  }

  if (serverCapability !== undefined) {
    return serverCapability
  }

  return true
}

function shouldAttachRefreshTransport(
  runtime?: AnalysisServerRuntime
): boolean {
  return (
    shouldConsumeRefreshNotifications(runtime) ||
    hasAnalysisClientBrowserRefreshListeners()
  )
}

/**
 * Parses and normalizes source text metadata. This also optionally formats the
 * source text using the project's installed formatter.
 */
export async function getSourceTextMetadata(
  options: DistributiveOmit<GetSourceTextMetadataOptions, 'project'> & {
    analysisOptions?: AnalysisOptions
  }
): Promise<SourceTextMetadata> {
  const client = await getReadyClient()
  if (client) {
    return callClientMethod<
      DistributiveOmit<GetSourceTextMetadataOptions, 'project'> & {
        analysisOptions?: AnalysisOptions
      },
      SourceTextMetadata
    >(client, 'getSourceTextMetadata', options)
  }

  /* Switch to synchronous analysis when building for production to prevent timeouts. */
  const { analysisOptions, ...getSourceTextMetadataOptions } = options
  const serverModules = await loadAnalysisClientServerModules()
  const project = serverModules.getProgram(analysisOptions)

  return serverModules.getCachedSourceTextMetadata(
    project,
    getSourceTextMetadataOptions
  )
}

/**
 * Resolve quick info for a symbol position in a source file.
 */
export async function getQuickInfoAtPosition(
  filePath: string,
  position: number,
  analysisOptions?: AnalysisOptions,
  runtime?: AnalysisServerRuntime,
  cacheKey?: string
): Promise<QuickInfoAtPosition | undefined> {
  const params = {
    filePath,
    position,
    analysisOptions,
  }
  const cacheParams =
    typeof cacheKey === 'string' && cacheKey.length > 0
      ? {
          ...params,
          __quickInfoClientCacheKey: cacheKey,
        }
      : params

  if (runtime) {
    return callBrowserRuntimeClientMethod<
      {
        filePath: string
        position: number
        analysisOptions?: AnalysisOptions
      },
      QuickInfoAtPosition | undefined
    >('getQuickInfoAtPosition', params, runtime, {
      cacheParams,
    })
  }

  const client = await getReadyClient()
  if (client) {
    return callClientMethod<
      {
        filePath: string
        position: number
        analysisOptions?: AnalysisOptions
      },
      QuickInfoAtPosition | undefined
    >(client, 'getQuickInfoAtPosition', params, {
      cacheParams,
    })
  }

  const serverModules = await loadAnalysisClientServerModules()
  const project = serverModules.getProgram(analysisOptions)
  return serverModules.getQuickInfoAtPositionBase({
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
  options: HighlighterInitializationOptions
): Promise<Highlighter | null> {
  if (currentHighlighter.current) {
    return Promise.resolve(currentHighlighter.current)
  }

  if (highlighterPromise) {
    return highlighterPromise
  }

  highlighterPromise = loadAnalysisClientServerModules()
    .then((serverModules) =>
      serverModules.createHighlighter({
        theme: options.theme,
        languages: options.languages,
      })
    )
    .then((highlighter) => {
      currentHighlighter.current = highlighter
      return highlighter
    })
    .catch((error) => {
      highlighterPromise = null
      reportBestEffortError('analysis/client', error)
      return null
    })

  return highlighterPromise
}

function queueHighlighterLoad(options: HighlighterInitializationOptions): void {
  if (
    currentHighlighter.current ||
    highlighterPromise ||
    queuedHighlighterLoad
  ) {
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
 */
export async function resolveTypeAtLocation(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  filter?: TypeFilter,
  analysisOptions?: AnalysisOptions
): Promise<ResolvedTypeAtLocationResult['resolvedType']> {
  const result = await resolveTypeAtLocationWithDependencies(
    filePath,
    position,
    kind,
    filter,
    analysisOptions
  )

  return result.resolvedType
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
  analysisOptions?: AnalysisOptions
): Promise<ResolvedTypeAtLocationResult> {
  const client = await getReadyClient()

  if (client) {
    return callClientMethod<
      {
        filePath: string
        position: number
        kind: SyntaxKind
        filter?: TypeFilter
        analysisOptions?: AnalysisOptions
      },
      ResolvedTypeAtLocationResult
    >(client, 'resolveTypeAtLocationWithDependencies', {
      filePath,
      position,
      kind,
      filter,
      analysisOptions,
    })
  }

  const serverModules = await loadAnalysisClientServerModules()
  const project = serverModules.getProgram(analysisOptions)

  return serverModules.resolveCachedTypeAtLocationWithDependencies(project, {
    filePath,
    position,
    kind,
    filter,
    isInMemoryFileSystem: analysisOptions?.useInMemoryFileSystem,
  })
}

/**
 * Tokenize source text based on a language and return highlighted tokens.
 */
export async function getTokens(
  options: Omit<GetTokensOptions, 'highlighter' | 'project'> & {
    languages?: GrammarLanguage[]
    analysisOptions?: AnalysisOptions
    waitForWarmResult?: boolean
    runtime?: AnalysisServerRuntime
  }
): Promise<TokenizedLines> {
  const { runtime, ...params } = options
  if (runtime) {
    return callBrowserRuntimeClientMethod<
      Omit<GetTokensOptions, 'highlighter' | 'project'> & {
        analysisOptions?: AnalysisOptions
        waitForWarmResult?: boolean
      },
      TokenizedLines
    >('getTokens', params, runtime)
  }

  const client = await getReadyClient()
  if (client) {
    return callClientMethod<
      Omit<GetTokensOptions, 'highlighter' | 'project'> & {
        analysisOptions?: AnalysisOptions
        waitForWarmResult?: boolean
      },
      TokenizedLines
    >(client, 'getTokens', params)
  }

  const { analysisOptions, languages, ...getTokensOptions } = params
  const serverModules = await loadAnalysisClientServerModules()
  const project = serverModules.getProgram(analysisOptions)
  queueHighlighterLoad({
    theme: getTokensOptions.theme,
    languages,
  })

  return serverModules.getCachedTokens(project, {
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
 */
export async function getFileExports(
  filePath: string,
  analysisOptions?: AnalysisOptions
) {
  const client = await getReadyClient()
  if (client) {
    const response = await callClientMethod<
      {
        filePath: string
        analysisOptions?: AnalysisOptions
        includeClientRpcDependencies?: boolean
      },
      ModuleExport[] | ClientRpcValueWithDependenciesResponse<ModuleExport[]>
    >(client, 'getFileExports', {
      filePath,
      analysisOptions,
      includeClientRpcDependencies: true,
    })

    return toClientRpcResponseValue(response)
  }

  const serverModules = await loadAnalysisClientServerModules()
  const project = serverModules.getProgram(analysisOptions)
  return serverModules.getCachedFileExports(project, filePath)
}

/**
 * Get outlining ranges for a file.
 */
export async function getOutlineRanges(
  filePath: string,
  analysisOptions?: AnalysisOptions
): Promise<OutlineRange[]> {
  const client = await getReadyClient()
  if (client) {
    return callClientMethod<
      { filePath: string; analysisOptions?: AnalysisOptions },
      OutlineRange[]
    >(client, 'getOutlineRanges', { filePath, analysisOptions })
  }

  const serverModules = await loadAnalysisClientServerModules()
  const project = serverModules.getProgram(analysisOptions)
  return serverModules.getCachedOutlineRanges(project, filePath)
}

/**
 * Get a specific file export in a source file.
 */
export async function getFileExportMetadata(
  name: string,
  filePath: string,
  position: number,
  kind: SyntaxKind,
  analysisOptions?: AnalysisOptions
) {
  const client = await getReadyClient()
  if (client) {
    const response = await callClientMethod<
      {
        name: string
        filePath: string
        position: number
        kind: SyntaxKind
        analysisOptions?: AnalysisOptions
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
      analysisOptions,
      includeClientRpcDependencies: true,
    })

    return toClientRpcResponseValue(response)
  }

  const serverModules = await loadAnalysisClientServerModules()
  const project = serverModules.getProgram(analysisOptions)
  return serverModules.getCachedFileExportMetadata(project, {
    name,
    filePath,
    position,
    kind,
  })
}

/**
 * Attempt to get a statically analyzable literal value for a file export.
 */
export async function getFileExportStaticValue(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  analysisOptions?: AnalysisOptions
) {
  const client = await getReadyClient()
  if (client) {
    const response = await callClientMethod<
      {
        filePath: string
        position: number
        kind: SyntaxKind
        analysisOptions?: AnalysisOptions
        includeClientRpcDependencies?: boolean
      },
      unknown
    >(client, 'getFileExportStaticValue', {
      filePath,
      position,
      kind,
      analysisOptions,
      includeClientRpcDependencies: true,
    })

    return toClientRpcResponseValue(response)
  }

  const serverModules = await loadAnalysisClientServerModules()
  const project = serverModules.getProgram(analysisOptions)
  return serverModules.getCachedFileExportStaticValue(project, {
    filePath,
    position,
    kind,
  })
}

/**
 * Get a specific file export's text by identifier, optionally including its dependencies.
 */
export async function getFileExportText(
  filePath: string,
  position: number,
  kind: SyntaxKind,
  includeDependencies?: boolean,
  analysisOptions?: AnalysisOptions
) {
  const client = await getReadyClient()
  if (client) {
    const response = await callClientMethod<
      {
        filePath: string
        position: number
        kind: SyntaxKind
        includeDependencies?: boolean
        analysisOptions?: AnalysisOptions
      },
      string | GetFileExportTextRpcResponse
    >(client, 'getFileExportText', {
      filePath,
      position,
      kind,
      includeDependencies,
      analysisOptions,
    })

    return toGetFileExportTextRpcValueText(response)
  }

  const serverModules = await loadAnalysisClientServerModules()
  const project = serverModules.getProgram(analysisOptions)
  return serverModules.getCachedFileExportText(project, {
    filePath,
    position,
    kind,
    includeDependencies,
  })
}

/**
 * Create a source file in the project.
 */
export async function createSourceFile(
  filePath: string,
  sourceText: string,
  analysisOptions?: AnalysisOptions
) {
  const client = await getReadyClient()
  if (client) {
    await client.callMethod<
      {
        filePath: string
        sourceText: string
        analysisOptions?: AnalysisOptions
      },
      void
    >('createSourceFile', {
      filePath,
      sourceText,
      analysisOptions,
    })
    // Source updates can affect dependency-aware RPC results for many files.
    // Clear client-side RPC state so stale dependent entries are not reused.
    invalidateAllClientRpcState()
    const loadedServerModules = getLoadedAnalysisClientServerModules()
    loadedServerModules?.invalidateProgramCachesByPaths([filePath])
    loadedServerModules?.invalidateRuntimeAnalysisCachePath(filePath)
    loadedServerModules?.invalidateSharedFileTextPrefixCachePath(filePath)
    return
  }

  const serverModules = await loadAnalysisClientServerModules()
  const project = serverModules.getProgram(analysisOptions) as TsMorphProject
  project.createSourceFile(filePath, sourceText, { overwrite: true })
  serverModules.invalidateProgramFileCache(project, filePath)
  serverModules.invalidateRuntimeAnalysisCachePath(filePath)
  serverModules.invalidateSharedFileTextPrefixCachePath(filePath)
}

/**
 * Transpile a source file.
 */
export async function transpileSourceFile(
  filePath: string,
  analysisOptions?: AnalysisOptions
) {
  const client = await getReadyClient()
  if (client) {
    return callClientMethod<
      {
        filePath: string
        analysisOptions?: AnalysisOptions
      },
      string
    >(client, 'transpileSourceFile', {
      filePath,
      analysisOptions,
    })
  }

  const serverModules = await loadAnalysisClientServerModules()
  const program = serverModules.getProgram(analysisOptions)

  return serverModules.transpileCachedSourceFile(program, filePath)
}

function setAnalysisClientRefreshVersionForTests(version: string): void {
  pendingRefreshInvalidationPathsByScope.clear()
  setClientRefreshVersionForTests(
    version,
    getCurrentAnalysisClientRefreshVersionRuntimeKey()
  )
}

function clearAnalysisClientStateForTests(): void {
  disposeActiveClient({
    invalidateClientRpcState: false,
  })
  resetRequestedAnalysisClientBrowserRuntimeState()
  setSharedAnalysisClientBrowserRuntime(undefined)
  disposeAnalysisBrowserClient()
  clearClientRpcCacheStateForTests()
  pendingRefreshInvalidationPathsByScope.clear()
  refreshResyncQueue = Promise.resolve()
  resetAnalysisClientRefreshState(undefined, {
    clearListeners: true,
    resetInvalidationEpoch: true,
  })
}

export const __TEST_ONLY__ = {
  clearAnalysisClientRpcState: clearAnalysisClientStateForTests,
  disposeAnalysisBrowserClient,
  setAnalysisClientRefreshVersion: setAnalysisClientRefreshVersionForTests,
}
