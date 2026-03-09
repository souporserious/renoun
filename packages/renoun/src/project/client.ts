import type { Project as TsMorphProject, SyntaxKind } from '../utils/ts-morph.ts'

import type { ConfigurationOptions } from '../components/Config/types.ts'
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
} from '../utils/get-source-text-metadata.ts'
import type { OutlineRange } from '../utils/get-outline-ranges.ts'
import type { QuickInfoAtPosition } from '../utils/get-quick-info-at-position.ts'
import type { TypeFilter } from '../utils/resolve-type.ts'
import type { ResolvedTypeAtLocationResult } from '../utils/resolve-type-at-location.ts'
import type { DistributiveOmit } from '../types.ts'
import {
  getProjectClientBrowserRefreshVersion as getSharedProjectClientBrowserRefreshVersion,
  getProjectClientBrowserRuntime as getSharedProjectClientBrowserRuntime,
  getProjectServerRuntimeKey,
  normalizeProjectServerRuntime,
  parseProjectClientRefreshVersion,
  onProjectClientBrowserRefreshVersionChange as onSharedProjectClientBrowserRefreshVersionChange,
  onProjectClientBrowserRuntimeChange as onSharedProjectClientBrowserRuntimeChange,
  setProjectClientBrowserRefreshVersion as setSharedProjectClientBrowserRefreshVersion,
  setProjectClientBrowserRuntime as setSharedProjectClientBrowserRuntime,
} from './browser-runtime.ts'
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
  rememberProjectRootCandidates,
  resetClientRpcCacheForRuntimeChange,
  setClientRpcCacheEntry,
  setClientRpcInFlightEntry,
  setClientRpcInvalidationEpoch,
  shouldBypassClientRpcCache,
  toClientRpcCacheKey,
  toClientRpcResponseValue,
  toGetFileExportTextRpcValueText,
  trimClientRpcCache,
} from './client.cache.ts'
import { WebSocketClient } from './rpc/client.ts'
import {
  type RefreshNotificationMessage,
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

type ProjectClientServerModules = typeof import('#project-client-server')

interface ActiveClientState {
  client: WebSocketClient
  runtimeKey: string
  generation: number
  refreshSubscriptionsAttached: boolean
  readyProbePromise: Promise<boolean> | null
  rpcUnavailableUntil: number
}

interface BrowserRuntimeClientState {
  client: WebSocketClient
  runtimeKey: string
  inFlightRequestCount: number
  isCached: boolean
}

let activeClientState: ActiveClientState | undefined
let cachedBrowserClientState: BrowserRuntimeClientState | undefined
let nextActiveClientGeneration = 0
let hasSubscribedToServerRuntimeEnvChanges = false
const pendingRefreshInvalidationPaths = new Set<string>()
let isRefreshInvalidationFlushQueued = false
let hasConnectedProjectServerClient = false
let refreshResyncQueue: Promise<void> = Promise.resolve()
let latestRefreshCursor = 0
let explicitBrowserRuntime: ProjectServerRuntime | undefined
const browserRuntimeRegistrations: Array<{
  token: symbol
  runtime: ProjectServerRuntime
}> = []
const browserRefreshNotificationListeners = new Set<
  (message: RefreshNotificationMessage) => void
>()
let loadedProjectClientServerModules: ProjectClientServerModules | undefined
let projectClientServerModulesPromise:
  | Promise<ProjectClientServerModules>
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
export function getProjectClientRefreshVersion(): string {
  return `${latestRefreshCursor}:${getClientRpcInvalidationEpoch()}`
}

function notifyProjectClientRefreshVersionChanged(): void {
  setSharedProjectClientBrowserRefreshVersion(getProjectClientRefreshVersion())
}

function hydrateRefreshStateFromSharedBrowserVersion(): void {
  const sharedVersion = parseProjectClientRefreshVersion(
    getSharedProjectClientBrowserRefreshVersion()
  )
  const currentInvalidationEpoch = getClientRpcInvalidationEpoch()
  if (
    sharedVersion.epoch > currentInvalidationEpoch ||
    (currentInvalidationEpoch === 0 &&
      latestRefreshCursor === 0 &&
      (sharedVersion.epoch > 0 || sharedVersion.cursor > 0))
  ) {
    latestRefreshCursor = sharedVersion.cursor
    setClientRpcInvalidationEpoch(sharedVersion.epoch)
  }
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

export function onProjectClientBrowserRefreshNotification(
  listener: (message: RefreshNotificationMessage) => void
): () => void {
  browserRefreshNotificationListeners.add(listener)
  return () => {
    browserRefreshNotificationListeners.delete(listener)
  }
}

function notifyProjectClientBrowserRefreshNotification(
  message: RefreshNotificationMessage
): void {
  for (const listener of browserRefreshNotificationListeners) {
    listener(message)
  }
}

function emitProjectClientBrowserRefreshNotification(
  refreshCursor?: number,
  invalidationPaths: readonly string[] = []
): void {
  notifyProjectClientBrowserRefreshNotification({
    type: 'refresh',
    data: {
      ...(refreshCursor !== undefined ? { refreshCursor } : {}),
      ...(invalidationPaths.length > 0
        ? {
            filePath: invalidationPaths[0],
            filePaths: [...invalidationPaths],
          }
        : {}),
    },
  })
}

function getResolvedProjectClientBrowserRuntime():
  | ProjectServerRuntime
  | undefined {
  return (
    browserRuntimeRegistrations[browserRuntimeRegistrations.length - 1]?.runtime ??
    explicitBrowserRuntime
  )
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

function applyProjectClientBrowserRuntime(
  runtime?: ProjectServerRuntime
): void {
  const normalizedRuntime = normalizeProjectServerRuntime(runtime)
  const currentRuntime = getSharedProjectClientBrowserRuntime()
  const currentRuntimeKey = currentRuntime
    ? getProjectServerRuntimeKey(currentRuntime)
    : undefined
  const nextRuntimeKey = normalizedRuntime
    ? getProjectServerRuntimeKey(normalizedRuntime)
    : undefined
  const didRuntimeChange = currentRuntimeKey !== nextRuntimeKey
  const didSwitchFromExistingRuntime =
    didRuntimeChange && currentRuntimeKey !== undefined

  if (didRuntimeChange) {
    setSharedProjectClientBrowserRuntime(normalizedRuntime)
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

  attachClientRefreshSubscriptions(activeClientState)
}

export function setProjectClientBrowserRuntime(
  runtime?: ProjectServerRuntime
): void {
  explicitBrowserRuntime = normalizeProjectServerRuntime(runtime)
  applyProjectClientBrowserRuntime(getResolvedProjectClientBrowserRuntime())
}

export function retainProjectClientBrowserRuntime(
  runtime?: ProjectServerRuntime,
  options: {
    preferCurrentRuntime?: boolean
  } = {}
): () => void {
  const normalizedRuntime = normalizeProjectServerRuntime(
    options.preferCurrentRuntime === true
      ? getSharedProjectClientBrowserRuntime() ?? runtime
      : runtime
  )
  if (!normalizedRuntime) {
    return () => {}
  }

  const token = Symbol('project-client-browser-runtime')
  browserRuntimeRegistrations.push({
    token,
    runtime: normalizedRuntime,
  })
  applyProjectClientBrowserRuntime(getResolvedProjectClientBrowserRuntime())

  return () => {
    const registrationIndex = browserRuntimeRegistrations.findIndex(
      (registration) => registration.token === token
    )
    if (registrationIndex === -1) {
      return
    }

    browserRuntimeRegistrations.splice(registrationIndex, 1)
    applyProjectClientBrowserRuntime(getResolvedProjectClientBrowserRuntime())
  }
}

export function hasRetainedProjectClientBrowserRuntime(): boolean {
  return browserRuntimeRegistrations.length > 0
}

export interface ProjectClientRuntimeOptions {
  useRpcCache?: boolean
  rpcCacheTtlMs?: number
  consumeRefreshNotifications?: boolean
  projectCacheMaxEntries?: number
}

const projectClientRuntimeOptions: ProjectClientRuntimeOptions = {}

function applyProjectCacheRuntimeOptions(
  modules: ProjectClientServerModules
): void {
  if (projectClientRuntimeOptions.projectCacheMaxEntries !== undefined) {
    modules.configureProjectCacheRuntime({
      maxEntries: projectClientRuntimeOptions.projectCacheMaxEntries,
    })
  }
}

async function loadProjectClientServerModules(): Promise<ProjectClientServerModules> {
  if (loadedProjectClientServerModules) {
    return loadedProjectClientServerModules
  }

  if (!projectClientServerModulesPromise) {
    projectClientServerModulesPromise = import('#project-client-server').then(
      (modules) => {
        applyProjectCacheRuntimeOptions(modules)
        loadedProjectClientServerModules = modules
        return modules
      }
    )
  }

  return projectClientServerModulesPromise
}

function getLoadedProjectClientServerModules():
  | ProjectClientServerModules
  | undefined {
  return loadedProjectClientServerModules
}

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
    projectClientRuntimeOptions.projectCacheMaxEntries =
      options.projectCacheMaxEntries
    const loadedServerModules = getLoadedProjectClientServerModules()
    if (loadedServerModules) {
      applyProjectCacheRuntimeOptions(loadedServerModules)
    }
  }
}

export function resetProjectClientRuntimeConfiguration(): void {
  projectClientRuntimeOptions.useRpcCache = undefined
  projectClientRuntimeOptions.rpcCacheTtlMs = undefined
  projectClientRuntimeOptions.consumeRefreshNotifications = undefined
  projectClientRuntimeOptions.projectCacheMaxEntries = undefined
  getLoadedProjectClientServerModules()?.resetProjectCacheRuntimeConfiguration()
}

function getActiveProjectServerRuntime(): ProjectServerRuntime | undefined {
  const browserRuntime = getSharedProjectClientBrowserRuntime()
  if (browserRuntime) {
    return browserRuntime
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

function getActiveClientRuntimeScopeKey(): string | undefined {
  if (!activeClientState) {
    return undefined
  }

  return toRuntimeCacheScopeKey(activeClientState.runtimeKey)
}

function invalidateClientRpcStateByNormalizedPaths(
  normalizedPaths: readonly string[],
  invalidationScopeKey?: string
): void {
  invalidateClientRpcCacheByNormalizedPaths(normalizedPaths, invalidationScopeKey)
  notifyProjectClientRefreshVersionChanged()
}

function invalidateAllClientRpcState(invalidationScopeKey?: string): void {
  invalidateAllClientRpcCache(invalidationScopeKey)
  notifyProjectClientRefreshVersionChanged()
}

function resetClientRefreshStateForRuntimeChange(): void {
  hydrateRefreshStateFromSharedBrowserVersion()
  resetClientRpcCacheForRuntimeChange()
  pendingRefreshInvalidationPaths.clear()
  latestRefreshCursor = 0
  notifyProjectClientRefreshVersionChanged()
}

function applyLoadedRuntimeRefreshInvalidations(runtimePaths: string[]): void {
  if (runtimePaths.length === 0) {
    return
  }

  const loadedServerModules = getLoadedProjectClientServerModules()
  if (loadedServerModules) {
    loadedServerModules.invalidateRuntimeAnalysisCachePaths(runtimePaths)
    loadedServerModules.invalidateProjectCachesByPaths(runtimePaths)
    return
  }

  if (typeof window !== 'undefined') {
    return
  }

  void loadProjectClientServerModules().then((serverModules) => {
    serverModules.invalidateRuntimeAnalysisCachePaths(runtimePaths)
    serverModules.invalidateProjectCachesByPaths(runtimePaths)
  })
}

function applyRefreshInvalidations(
  paths: string[],
  invalidationScopeKey = getActiveClientRuntimeScopeKey()
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

async function callClientMethod<
  Params extends Record<string, unknown>,
  Value,
>(
  activeClient: WebSocketClient,
  method: string,
  params: Params,
  options: {
    cacheParams?: unknown
    cacheKeyPrefix?: string
    disableRpcCache?: boolean
    skipServerModulePreload?: boolean
  } = {}
): Promise<Value> {
  if (
    options.skipServerModulePreload !== true &&
    typeof window === 'undefined' &&
    !loadedProjectClientServerModules
  ) {
    await loadProjectClientServerModules().catch(() => undefined)
  }

  const cacheParams = options.cacheParams ?? params
  rememberProjectRootCandidates(params)

  if (
    options.disableRpcCache === true ||
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
  if (
    shouldBypassClientRpcCache(
      typedMethod,
      params,
      shouldConsumeRefreshNotifications()
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
      deleteClientRpcInFlightEntryIfPromise(cacheKey, request as Promise<unknown>)
    })
  setClientRpcInFlightEntry(cacheKey, {
    promise: request as Promise<unknown>,
    dependencyPaths: requestDependencyPaths,
    epoch: requestEpoch,
    scopeKey,
  })

  return request
}

function queueRefreshResync(state: ActiveClientState): void {
  refreshResyncQueue = refreshResyncQueue
    .catch(() => {})
    .then(async () => {
      if (!isCurrentActiveClientState(state)) {
        return
      }

      hydrateRefreshStateFromSharedBrowserVersion()

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
            sinceCursor: latestRefreshCursor,
          })
          if (!isCurrentActiveClientState(state)) {
            return
          }

          const nextCursor = normalizeRefreshCursor(response.nextCursor)
          const paths = getRefreshInvalidationPaths(response)
          if (response.fullRefresh) {
            if (paths.length > 0) {
              applyRefreshInvalidations(paths)
            } else {
              invalidateAllClientRpcState(
                toRuntimeCacheScopeKey(state.runtimeKey)
              )
            }
            setLatestRefreshCursor(nextCursor ?? 0)
            emitProjectClientBrowserRefreshNotification(nextCursor, paths)
            return
          }

          if (nextCursor !== undefined) {
            bumpLatestRefreshCursor(nextCursor)
          }

          for (const path of paths) {
            queueRefreshInvalidation(path)
          }
          if (paths.length > 0) {
            emitProjectClientBrowserRefreshNotification(nextCursor, paths)
          }
          return
        } catch {
          if (!isCurrentActiveClientState(state)) {
            return
          }

          if (typeof window !== 'undefined') {
            const fallbackPaths = collectConservativeRefreshFallbackPaths()
            applyRefreshInvalidations(fallbackPaths)
            setLatestRefreshCursor(0)
            emitProjectClientBrowserRefreshNotification()
            return
          }

          if (attempt >= REFRESH_RESYNC_MAX_ATTEMPTS) {
            // Conservative fallback: clear client-side RPC caches and invalidate
            // runtime/project caches for all observed project roots.
            const fallbackPaths = collectConservativeRefreshFallbackPaths()
            applyRefreshInvalidations(fallbackPaths)
            setLatestRefreshCursor(0)
            emitProjectClientBrowserRefreshNotification(undefined, fallbackPaths)
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
  state: ActiveClientState,
  options: {
    resyncImmediately?: boolean
  } = {}
): void {
  if (state.refreshSubscriptionsAttached || !shouldConsumeRefreshNotifications()) {
    return
  }

  state.refreshSubscriptionsAttached = true
  state.client.on('connected', () => {
    if (!isCurrentActiveClientState(state)) {
      return
    }

    state.rpcUnavailableUntil = 0

    if (!hasConnectedProjectServerClient) {
      hasConnectedProjectServerClient = true
      return
    }

    queueRefreshResync(state)
  })
  state.client.on('notification', (message) => {
    if (!isCurrentActiveClientState(state)) {
      return
    }

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
    notifyProjectClientBrowserRefreshNotification(message)
  })

  if (options.resyncImmediately) {
    hasConnectedProjectServerClient = true
    queueRefreshResync(state)
  }
}

function toServerRuntimeKey(runtime: ProjectServerRuntime): string {
  return getProjectServerRuntimeKey(runtime) ?? `${runtime.id}:${runtime.port}`
}

function toRuntimeCacheScopeKey(runtimeKey: string): string {
  return `runtime:${runtimeKey}`
}

function createProjectBrowserClient(
  runtime: ProjectServerRuntime,
  runtimeKey: string,
  isCached: boolean
): BrowserRuntimeClientState {
  const state: BrowserRuntimeClientState = {
    client: new WebSocketClient(runtime.id, runtime),
    runtimeKey,
    inFlightRequestCount: 0,
    isCached,
  }

  if (isCached) {
    cachedBrowserClientState = state
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
    reportBestEffortError('project/client', error)
  }

  try {
    state.client.close?.()
  } catch (error) {
    reportBestEffortError('project/client', error)
  }
}

function disposeProjectBrowserClient(): void {
  if (!cachedBrowserClientState) {
    return
  }

  const activeState = cachedBrowserClientState
  cachedBrowserClientState = undefined
  disposeBrowserClientState(activeState)
}

function getProjectBrowserClientState(
  requestedRuntime?: ProjectServerRuntime
): BrowserRuntimeClientState {
  const runtime = normalizeProjectServerRuntime(
    requestedRuntime ?? getSharedProjectClientBrowserRuntime()
  )
  const runtimeKey = getProjectServerRuntimeKey(runtime)
  if (!runtime || !runtimeKey) {
    disposeProjectBrowserClient()
    throw new Error('[renoun] Missing active browser project runtime.')
  }

  if (!cachedBrowserClientState) {
    return createProjectBrowserClient(runtime, runtimeKey, true)
  }

  if (cachedBrowserClientState.runtimeKey === runtimeKey) {
    return cachedBrowserClientState
  }

  if (cachedBrowserClientState.inFlightRequestCount === 0) {
    disposeBrowserClientState(cachedBrowserClientState)
    cachedBrowserClientState = undefined
    return createProjectBrowserClient(runtime, runtimeKey, true)
  }

  return createProjectBrowserClient(runtime, runtimeKey, false)
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
    reportBestEffortError('project/client', error)
  }

  try {
    state.client.close?.()
  } catch (error) {
    reportBestEffortError('project/client', error)
  }
}

function createClientForRuntime(
  runtime: ProjectServerRuntime
): ActiveClientState {
  const state: ActiveClientState = {
    client: new WebSocketClient(runtime.id, runtime),
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
  runtime: ProjectServerRuntime,
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
  }

  if (activeClientState) {
    attachClientRefreshSubscriptions(activeClientState, {
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

  // Browser callers cannot fall back to local project analysis.
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
  runtime: ProjectServerRuntime,
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
        skipServerModulePreload: true,
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
      skipServerModulePreload: true,
    })
  }

  const clientState = getProjectBrowserClientState(runtime)
  clientState.inFlightRequestCount += 1

  try {
    return await callClientMethod<Params, Value>(
      clientState.client,
      method,
      params,
      {
        ...options,
        cacheKeyPrefix: cacheScopeKey,
        skipServerModulePreload: true,
      }
    )
  } finally {
    clientState.inFlightRequestCount -= 1

    if (!clientState.isCached && clientState.inFlightRequestCount === 0) {
      disposeBrowserClientState(clientState)
    }
  }
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
  const serverModules = await loadProjectClientServerModules()
  const project = serverModules.getProject(projectOptions)

  return serverModules.getCachedSourceTextMetadata(
    project,
    getSourceTextMetadataOptions
  )
}

/**
 * Resolve quick info for a symbol position in a source file.
 * @internal
 */
export async function getQuickInfoAtPosition(
  filePath: string,
  position: number,
  projectOptions?: ProjectOptions,
  runtime?: ProjectServerRuntime,
  cacheKey?: string
): Promise<QuickInfoAtPosition | undefined> {
  const params = {
    filePath,
    position,
    projectOptions,
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
        projectOptions?: ProjectOptions
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
        projectOptions?: ProjectOptions
      },
      QuickInfoAtPosition | undefined
    >(client, 'getQuickInfoAtPosition', params, {
      cacheParams,
    })
  }

  const serverModules = await loadProjectClientServerModules()
  const project = serverModules.getProject(projectOptions)
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
  options: Partial<Pick<ConfigurationOptions, 'theme' | 'languages'>>
): Promise<Highlighter | null> {
  if (currentHighlighter.current) {
    return Promise.resolve(currentHighlighter.current)
  }

  if (highlighterPromise) {
    return highlighterPromise
  }

  highlighterPromise = loadProjectClientServerModules()
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

  const serverModules = await loadProjectClientServerModules()
  const project = serverModules.getProject(projectOptions)

  return serverModules.resolveCachedTypeAtLocationWithDependencies(project, {
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
    runtime?: ProjectServerRuntime
  }
): Promise<TokenizedLines> {
  const { runtime, ...params } = options
  if (runtime) {
    return callBrowserRuntimeClientMethod<
      Omit<GetTokensOptions, 'highlighter' | 'project'> & {
        projectOptions?: ProjectOptions
        waitForWarmResult?: boolean
      },
      TokenizedLines
    >('getTokens', params, runtime)
  }

  const client = await getReadyClient()
  if (client) {
    return callClientMethod<
      Omit<GetTokensOptions, 'highlighter' | 'project'> & {
        projectOptions?: ProjectOptions
        waitForWarmResult?: boolean
      },
      TokenizedLines
    >(client, 'getTokens', params)
  }

  const { projectOptions, languages, ...getTokensOptions } = params
  const serverModules = await loadProjectClientServerModules()
  const project = serverModules.getProject(projectOptions)
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

  const serverModules = await loadProjectClientServerModules()
  const project = serverModules.getProject(projectOptions)
  return serverModules.getCachedFileExports(project, filePath)
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

  const serverModules = await loadProjectClientServerModules()
  const project = serverModules.getProject(projectOptions)
  return serverModules.getCachedOutlineRanges(project, filePath)
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

  const serverModules = await loadProjectClientServerModules()
  const project = serverModules.getProject(projectOptions)
  return serverModules.getCachedFileExportMetadata(project, {
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

  const serverModules = await loadProjectClientServerModules()
  const project = serverModules.getProject(projectOptions)
  return serverModules.getCachedFileExportStaticValue(project, {
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

  const serverModules = await loadProjectClientServerModules()
  const project = serverModules.getProject(projectOptions)
  return serverModules.getCachedFileExportText(project, {
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
    const loadedServerModules =
      getLoadedProjectClientServerModules() ??
      (typeof window === 'undefined'
        ? await loadProjectClientServerModules().catch(() => undefined)
        : undefined)
    loadedServerModules?.invalidateProjectCachesByPaths([filePath])
    loadedServerModules?.invalidateRuntimeAnalysisCachePath(filePath)
    loadedServerModules?.invalidateSharedFileTextPrefixCachePath(filePath)
    return
  }

  const serverModules = await loadProjectClientServerModules()
  const project = serverModules.getProject(projectOptions) as TsMorphProject
  project.createSourceFile(filePath, sourceText, { overwrite: true })
  serverModules.invalidateProjectFileCache(project, filePath)
  serverModules.invalidateRuntimeAnalysisCachePath(filePath)
  serverModules.invalidateSharedFileTextPrefixCachePath(filePath)
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

  const serverModules = await loadProjectClientServerModules()
  const project = serverModules.getProject(projectOptions)

  return serverModules.transpileCachedSourceFile(project, filePath)
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

function setProjectClientRefreshVersionForTests(version: string): void {
  const parsedVersion = parseProjectClientRefreshVersion(version)
  latestRefreshCursor = parsedVersion.cursor
  setClientRpcInvalidationEpoch(parsedVersion.epoch)
  pendingRefreshInvalidationPaths.clear()
  setSharedProjectClientBrowserRefreshVersion(
    `${parsedVersion.cursor}:${parsedVersion.epoch}`
  )
}

function clearProjectClientStateForTests(): void {
  clearClientRpcCacheStateForTests()
  pendingRefreshInvalidationPaths.clear()
}

export const __TEST_ONLY__ = {
  clearProjectClientRpcState: clearProjectClientStateForTests,
  disposeProjectBrowserClient,
  setProjectClientRefreshVersion: setProjectClientRefreshVersionForTests,
}
