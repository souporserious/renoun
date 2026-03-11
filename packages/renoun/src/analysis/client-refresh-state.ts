import {
  getAnalysisClientBrowserRefreshVersion,
  getAnalysisClientBrowserRefreshVersionRuntimeKey,
  getAnalysisServerRuntimeKey,
  onAnalysisClientBrowserRefreshVersionChange,
  parseAnalysisClientRefreshVersion,
  setAnalysisClientBrowserRefreshVersion,
} from './browser-runtime.ts'
import type { RefreshNotificationMessage } from './refresh-notifications.ts'
import type { AnalysisServerRuntime } from './runtime-env.ts'
import {
  getClientRpcInvalidationEpoch,
  setClientRpcInvalidationEpoch,
} from './client.cache.ts'

export interface AnalysisClientBrowserRefreshNotification extends RefreshNotificationMessage {
  runtime: AnalysisServerRuntime
  runtimeKey: string
}

const browserRefreshNotificationListeners = new Set<
  (message: AnalysisClientBrowserRefreshNotification) => void
>()
const connectedAnalysisServerClientRuntimeKeys = new Set<string>()
const refreshCursorByRuntimeKey = new Map<string, number>()

let latestRefreshCursor = 0
let latestRefreshCursorRuntimeKey: string | undefined

export function getAnalysisClientRefreshVersion(
  currentRuntimeKey: string | undefined,
  runtime?: AnalysisServerRuntime
): string {
  return `${getAnalysisClientRefreshCursor(currentRuntimeKey, runtime)}:${getClientRpcInvalidationEpoch()}`
}

export function getAnalysisClientRefreshCursor(
  currentRuntimeKey: string | undefined,
  runtime?: AnalysisServerRuntime
): number {
  if (!runtime) {
    return latestRefreshCursor
  }

  const runtimeKey = getAnalysisServerRuntimeKey(runtime)
  return runtimeKey
    ? getLatestRefreshCursorForRuntime(runtimeKey)
    : getLatestRefreshCursor(currentRuntimeKey)
}

function getLatestRefreshCursor(
  currentRuntimeKey: string | undefined
): number {
  if (
    currentRuntimeKey &&
    refreshCursorByRuntimeKey.has(currentRuntimeKey) &&
    latestRefreshCursorRuntimeKey !== currentRuntimeKey
  ) {
    return getLatestRefreshCursorForRuntime(currentRuntimeKey)
  }

  return latestRefreshCursor
}

export function notifyAnalysisClientRefreshVersionChanged(
  currentRuntimeKey: string | undefined
): void {
  setAnalysisClientBrowserRefreshVersion(
    getAnalysisClientRefreshVersion(currentRuntimeKey),
    currentRuntimeKey
  )
}

export function hydrateRefreshStateFromSharedAnalysisBrowserVersion(
  currentRuntimeKey: string | undefined
): void {
  if (!currentRuntimeKey) {
    return
  }

  if (getAnalysisClientBrowserRefreshVersionRuntimeKey() !== currentRuntimeKey) {
    return
  }

  const sharedVersion = parseAnalysisClientRefreshVersion(
    getAnalysisClientBrowserRefreshVersion()
  )
  const currentInvalidationEpoch = getClientRpcInvalidationEpoch()
  const currentRefreshCursor =
    refreshCursorByRuntimeKey.get(currentRuntimeKey) ??
    (latestRefreshCursorRuntimeKey === currentRuntimeKey
      ? latestRefreshCursor
      : 0)

  if (
    sharedVersion.epoch > currentInvalidationEpoch ||
    (currentInvalidationEpoch === 0 &&
      currentRefreshCursor === 0 &&
      (sharedVersion.epoch > 0 || sharedVersion.cursor > 0))
  ) {
    latestRefreshCursor = sharedVersion.cursor
    latestRefreshCursorRuntimeKey = currentRuntimeKey
    setClientRpcInvalidationEpoch(sharedVersion.epoch)
    refreshCursorByRuntimeKey.set(currentRuntimeKey, sharedVersion.cursor)
    return
  }

  if (
    !refreshCursorByRuntimeKey.has(currentRuntimeKey) &&
    latestRefreshCursorRuntimeKey === undefined &&
    currentInvalidationEpoch === sharedVersion.epoch &&
    latestRefreshCursor === sharedVersion.cursor
  ) {
    latestRefreshCursorRuntimeKey = currentRuntimeKey
    refreshCursorByRuntimeKey.set(currentRuntimeKey, latestRefreshCursor)
  }
}

function setLatestRefreshCursor(
  currentRuntimeKey: string | undefined,
  value: number,
  options: {
    notify?: boolean
  } = {}
): void {
  const { notify = true } = options
  const normalizedValue = Math.max(0, Math.floor(value))

  if (currentRuntimeKey) {
    latestRefreshCursorRuntimeKey = currentRuntimeKey
    refreshCursorByRuntimeKey.set(currentRuntimeKey, normalizedValue)
  } else {
    latestRefreshCursorRuntimeKey = undefined
  }

  if (latestRefreshCursor === normalizedValue) {
    return
  }

  latestRefreshCursor = normalizedValue
  if (notify) {
    notifyAnalysisClientRefreshVersionChanged(currentRuntimeKey)
  }
}

export function getLatestRefreshCursorForRuntime(runtimeKey: string): number {
  return (
    refreshCursorByRuntimeKey.get(runtimeKey) ??
    (latestRefreshCursorRuntimeKey === runtimeKey ? latestRefreshCursor : 0)
  )
}

export function syncLatestRefreshCursorForRuntime(
  currentRuntimeKey: string | undefined,
  runtimeKey: string,
  options?: {
    notify?: boolean
  }
): void {
  if (currentRuntimeKey !== runtimeKey) {
    return
  }

  if (!refreshCursorByRuntimeKey.has(runtimeKey)) {
    return
  }

  setLatestRefreshCursor(
    currentRuntimeKey,
    getLatestRefreshCursorForRuntime(runtimeKey),
    options
  )
}

export function setLatestRefreshCursorForRuntime(
  currentRuntimeKey: string | undefined,
  runtimeKey: string,
  value: number,
  options?: {
    notify?: boolean
  }
): void {
  const normalizedValue = Math.max(0, Math.floor(value))
  refreshCursorByRuntimeKey.set(runtimeKey, normalizedValue)
  syncLatestRefreshCursorForRuntime(currentRuntimeKey, runtimeKey, options)
}

export function bumpLatestRefreshCursorForRuntime(
  currentRuntimeKey: string | undefined,
  runtimeKey: string,
  value: number,
  options?: {
    notify?: boolean
  }
): void {
  if (!Number.isFinite(value) || value < 0) {
    return
  }

  setLatestRefreshCursorForRuntime(
    currentRuntimeKey,
    runtimeKey,
    Math.max(getLatestRefreshCursorForRuntime(runtimeKey), Math.floor(value)),
    options
  )
}

export function onAnalysisClientRefreshVersionChange(
  listener: (version: string) => void
): () => void {
  return onAnalysisClientBrowserRefreshVersionChange(listener)
}

export function onAnalysisClientBrowserRefreshNotification(
  listener: (message: AnalysisClientBrowserRefreshNotification) => void
): () => void {
  browserRefreshNotificationListeners.add(listener)
  return () => {
    browserRefreshNotificationListeners.delete(listener)
  }
}

export function emitAnalysisClientBrowserRefreshNotification(options: {
  runtime: AnalysisServerRuntime
  runtimeKey: string
  refreshCursor?: number
  invalidationPaths?: readonly string[]
}): void {
  const { runtime, runtimeKey, refreshCursor, invalidationPaths = [] } = options
  const message: AnalysisClientBrowserRefreshNotification = {
    type: 'refresh',
    runtime,
    runtimeKey,
    data: {
      ...(refreshCursor !== undefined ? { refreshCursor } : {}),
      ...(invalidationPaths.length > 0
        ? {
            filePath: invalidationPaths[0],
            filePaths: [...invalidationPaths],
          }
        : {}),
    },
  }

  for (const listener of browserRefreshNotificationListeners) {
    listener(message)
  }
}

export function notifyAnalysisClientBrowserRefreshNotification(
  message: AnalysisClientBrowserRefreshNotification
): void {
  for (const listener of browserRefreshNotificationListeners) {
    listener(message)
  }
}

export function hasAnalysisClientBrowserRefreshListeners(): boolean {
  return browserRefreshNotificationListeners.size > 0
}

export function hasConnectedAnalysisServerClientRuntime(
  runtimeKey: string
): boolean {
  return connectedAnalysisServerClientRuntimeKeys.has(runtimeKey)
}

export function rememberConnectedAnalysisServerClientRuntime(
  runtimeKey: string
): void {
  connectedAnalysisServerClientRuntimeKeys.add(runtimeKey)
}

export function resetLatestAnalysisClientRefreshCursor(
  currentRuntimeKey: string | undefined
): void {
  refreshCursorByRuntimeKey.clear()
  latestRefreshCursor = 0
  latestRefreshCursorRuntimeKey = undefined

  if (currentRuntimeKey) {
    refreshCursorByRuntimeKey.set(currentRuntimeKey, 0)
    latestRefreshCursorRuntimeKey = currentRuntimeKey
  }

  notifyAnalysisClientRefreshVersionChanged(currentRuntimeKey)
}

export function resetAnalysisClientRefreshState(
  currentRuntimeKey: string | undefined,
  options: {
    clearListeners?: boolean
    resetInvalidationEpoch?: boolean
  } = {}
): void {
  const { clearListeners = false, resetInvalidationEpoch = false } = options

  connectedAnalysisServerClientRuntimeKeys.clear()
  refreshCursorByRuntimeKey.clear()
  latestRefreshCursor = 0
  latestRefreshCursorRuntimeKey = undefined

  if (clearListeners) {
    browserRefreshNotificationListeners.clear()
  }

  if (resetInvalidationEpoch) {
    setClientRpcInvalidationEpoch(0)
  }

  setAnalysisClientBrowserRefreshVersion('0:0', currentRuntimeKey)
}

export function setAnalysisClientRefreshVersionForTests(
  version: string,
  currentRuntimeKey: string | undefined
): void {
  const parsedVersion = parseAnalysisClientRefreshVersion(version)

  refreshCursorByRuntimeKey.clear()
  latestRefreshCursor = parsedVersion.cursor
  latestRefreshCursorRuntimeKey = undefined
  setClientRpcInvalidationEpoch(parsedVersion.epoch)

  if (currentRuntimeKey) {
    refreshCursorByRuntimeKey.set(currentRuntimeKey, parsedVersion.cursor)
    latestRefreshCursorRuntimeKey = currentRuntimeKey
  }

  setAnalysisClientBrowserRefreshVersion(
    `${parsedVersion.cursor}:${parsedVersion.epoch}`,
    currentRuntimeKey
  )
}
