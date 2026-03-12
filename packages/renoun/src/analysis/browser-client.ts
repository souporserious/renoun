import type { Languages as GrammarLanguage } from '../grammars/index.ts'
import { reportBestEffortError } from '../utils/best-effort.ts'
import type { GetTokensOptions, TokenizedLines } from '../utils/get-tokens.ts'
import type { SourceTextHydrationMetadata } from './query/source-text-metadata.ts'
import type { QuickInfoAtPosition } from '../utils/get-quick-info-at-position.ts'
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
  trimClientRpcCache,
} from './client.cache.ts'
import {
  type AnalysisClientBrowserRefreshNotification as ClientBrowserRefreshNotification,
  bumpAnalysisClientRefreshInvalidationEpoch,
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
  type AnalysisServerRuntime,
} from './runtime-env.ts'
import type { AnalysisOptions } from './types.ts'

export type { AnalysisClientBrowserRefreshNotification } from './client-refresh-state.ts'

interface ActiveClientState {
  client: WebSocketClient
  runtime: AnalysisServerRuntime
  runtimeKey: string
  generation: number
  refreshSubscriptionsAttached: boolean
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
const pendingRefreshInvalidationPathsByScope = new Map<
  string | undefined,
  Set<string>
>()
let isRefreshInvalidationFlushQueued = false
let refreshResyncQueue: Promise<void> = Promise.resolve()

const DEFAULT_CLIENT_RPC_CACHE_TTL_MS = 30_000
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

export function subscribeToAnalysisClientBrowserRuntimeRefresh(
  runtime: AnalysisServerRuntime,
  listener: (message: ClientBrowserRefreshNotification) => void
): () => void {
  const runtimeKey = toServerRuntimeKey(runtime)
  const releaseRuntime = retainAnalysisClientBrowserRuntime(runtime)
  const unsubscribe = onAnalysisClientBrowserRefreshNotification((message) => {
    if (message.runtimeKey === runtimeKey) {
      listener(message)
    }
  })

  return () => {
    unsubscribe()
    releaseRuntime()
  }
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
}

const analysisClientRuntimeOptions: AnalysisClientRuntimeOptions = {}

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
}

export function resetAnalysisClientRuntimeConfiguration(): void {
  analysisClientRuntimeOptions.useRpcCache = undefined
  analysisClientRuntimeOptions.rpcCacheTtlMs = undefined
  analysisClientRuntimeOptions.consumeRefreshNotifications = undefined
}

function getActiveAnalysisServerRuntime(): AnalysisServerRuntime | undefined {
  return getSharedAnalysisClientBrowserRuntime()
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

  return undefined
}

function shouldUseClientRpcCache(runtime?: AnalysisServerRuntime): boolean {
  if (typeof analysisClientRuntimeOptions.useRpcCache === 'boolean') {
    return analysisClientRuntimeOptions.useRpcCache
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

  return DEFAULT_CLIENT_RPC_CACHE_TTL_MS
}

function invalidateClientRpcStateByNormalizedPaths(
  normalizedPaths: readonly string[],
  invalidationScopeKey?: string
): void {
  invalidateClientRpcCacheByNormalizedPaths(
    normalizedPaths,
    invalidationScopeKey
  )
  bumpAnalysisClientRefreshInvalidationEpoch(
    getRuntimeKeyFromCacheScopeKey(invalidationScopeKey)
  )
  notifyAnalysisClientRefreshVersionChanged(
    getCurrentAnalysisClientRefreshVersionRuntimeKey()
  )
}

function invalidateAllClientRpcState(invalidationScopeKey?: string): void {
  invalidateAllClientRpcCache(invalidationScopeKey)
  bumpAnalysisClientRefreshInvalidationEpoch(
    getRuntimeKeyFromCacheScopeKey(invalidationScopeKey)
  )
  notifyAnalysisClientRefreshVersionChanged(
    getCurrentAnalysisClientRefreshVersionRuntimeKey()
  )
}

function resetClientRefreshStateForRuntimeChange(): void {
  const runtimeKey = getCurrentAnalysisClientRefreshVersionRuntimeKey()
  hydrateRefreshStateFromSharedAnalysisBrowserVersion(runtimeKey)
  resetClientRpcCacheForRuntimeChange()
  bumpAnalysisClientRefreshInvalidationEpoch()
  pendingRefreshInvalidationPathsByScope.clear()
  resetLatestAnalysisClientRefreshCursor(runtimeKey)
}

function applyRefreshInvalidations(
  paths: string[],
  invalidationScopeKey?: string
): void {
  const { comparablePaths } = normalizeInvalidationPaths(paths)
  if (comparablePaths.length === 0) {
    return
  }

  invalidateClientRpcStateByNormalizedPaths(
    comparablePaths,
    invalidationScopeKey
  )
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

function getRuntimeKeyFromCacheScopeKey(
  scopeKey: string | undefined
): string | undefined {
  if (!scopeKey?.startsWith('runtime:')) {
    return undefined
  }

  const runtimeKey = scopeKey.slice('runtime:'.length)
  return runtimeKey.length > 0 ? runtimeKey : undefined
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
    reportBestEffortError('analysis/browser-client', error)
  }

  try {
    state.client.close?.()
  } catch (error) {
    reportBestEffortError('analysis/browser-client', error)
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
    reportBestEffortError('analysis/browser-client', error)
  }

  try {
    state.client.close?.()
  } catch (error) {
    reportBestEffortError('analysis/browser-client', error)
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
    resyncImmediately: options.resyncImmediately,
  })
  return nextClientState
}

function getClient(): WebSocketClient | undefined {
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
      resyncImmediately: hadExistingClient,
    })
  }

  return activeClientState?.client
}

async function getReadyClient(): Promise<WebSocketClient | undefined> {
  return getClient()
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
 * Resolve quick info for a symbol position in a source file.
 */
export async function getQuickInfoAtPosition(
  filePath: string,
  position: number,
  analysisOptions?: AnalysisOptions,
  runtime?: AnalysisServerRuntime,
  cacheKey?: string,
  sourceMetadata?: SourceTextHydrationMetadata
): Promise<QuickInfoAtPosition | undefined> {
  const params = {
    filePath,
    position,
    analysisOptions,
    ...(sourceMetadata ? { sourceMetadata } : {}),
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
        sourceMetadata?: SourceTextHydrationMetadata
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
        sourceMetadata?: SourceTextHydrationMetadata
      },
      QuickInfoAtPosition | undefined
    >(client, 'getQuickInfoAtPosition', params, {
      cacheParams,
    })
  }

  throw new Error(
    '[renoun] Missing active browser analysis runtime for quick info.'
  )
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

  throw new Error('[renoun] Missing active browser analysis runtime for tokens.')
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
