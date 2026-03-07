import {
  getProjectClientBrowserRefreshVersion,
  getProjectClientBrowserRuntime,
  setProjectClientBrowserRefreshVersion,
  setProjectClientBrowserRuntime as setSharedProjectClientBrowserRuntime,
} from './browser-runtime.ts'
import { resolveBrowserWebSocketUrl } from './rpc/browser-websocket-url.ts'
import {
  getRefreshInvalidationPaths,
  isRefreshNotification,
  normalizeRefreshCursor,
  type RefreshNotificationMessage,
  type RefreshInvalidationsSinceResponse,
} from './refresh-notifications.ts'
import type { ProjectServerRuntime } from './runtime-env.ts'

const BROWSER_REFRESH_RESYNC_TIMEOUT_MS = 5_000
const BROWSER_REFRESH_RECONNECT_DELAY_MS = 300

const browserRefreshNotificationListeners = new Set<
  (message: RefreshNotificationMessage) => void
>()

let refreshNotificationSocket: WebSocket | undefined
let refreshNotificationSocketRuntimeKey: string | undefined
let refreshNotificationReconnectTimer: number | undefined
let refreshNotificationConnectionVersion = 0
let nextRefreshResyncRequestId = 1
let shouldResyncOnNextOpen = false

interface ParsedRefreshVersion {
  cursor: number
  epoch: number
}

export function onProjectClientBrowserRefreshNotification(
  listener: (message: RefreshNotificationMessage) => void
): () => void {
  browserRefreshNotificationListeners.add(listener)
  return () => {
    browserRefreshNotificationListeners.delete(listener)
  }
}

export function setProjectClientBrowserRuntime(
  runtime?: ProjectServerRuntime
): void {
  const normalizedRuntime = runtime
    ? {
        id: String(runtime.id),
        port: String(runtime.port),
      }
    : undefined
  const previousRuntime = getProjectClientBrowserRuntime()
  const previousRuntimeKey = previousRuntime
    ? toBrowserRuntimeKey(previousRuntime)
    : undefined
  const nextRuntimeKey = normalizedRuntime
    ? toBrowserRuntimeKey(normalizedRuntime)
    : undefined

  setSharedProjectClientBrowserRuntime(normalizedRuntime)

  if (previousRuntimeKey === nextRuntimeKey) {
    ensureRefreshNotificationSocket()
    return
  }

  if (!normalizedRuntime) {
    disposeRefreshNotificationSocket()
    setProjectClientBrowserRefreshVersion('0:0')
    return
  }

  if (previousRuntimeKey) {
    bumpProjectClientBrowserRefreshVersion(0)
  }

  ensureRefreshNotificationSocket({
    forceReconnect: true,
  })
}

function ensureRefreshNotificationSocket(
  options: {
    forceReconnect?: boolean
  } = {}
): void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return
  }

  const runtime = getProjectClientBrowserRuntime()
  const runtimeKey = runtime ? toBrowserRuntimeKey(runtime) : undefined
  if (!runtime || !runtimeKey) {
    disposeRefreshNotificationSocket()
    return
  }

  const shouldReconnect =
    options.forceReconnect === true ||
    refreshNotificationSocketRuntimeKey !== runtimeKey ||
    !refreshNotificationSocket ||
    refreshNotificationSocket.readyState === WebSocket.CLOSING ||
    refreshNotificationSocket.readyState === WebSocket.CLOSED

  if (!shouldReconnect) {
    return
  }

  clearRefreshNotificationReconnectTimer()

  const hadConnectedRuntimePreviously =
    refreshNotificationSocketRuntimeKey === runtimeKey

  disposeRefreshNotificationSocket({
    keepReconnectTimer: true,
  })

  const connectionVersion = ++refreshNotificationConnectionVersion
  const activeSocket = new WebSocket(
    resolveBrowserWebSocketUrl(runtime.port),
    runtime.id
  )

  refreshNotificationSocket = activeSocket
  refreshNotificationSocketRuntimeKey = runtimeKey
  if (hadConnectedRuntimePreviously) {
    shouldResyncOnNextOpen = true
  }

  activeSocket.addEventListener('open', () => {
    if (connectionVersion !== refreshNotificationConnectionVersion) {
      return
    }

    if (shouldResyncOnNextOpen) {
      shouldResyncOnNextOpen = false
      void requestRefreshInvalidationsSince(activeSocket, connectionVersion)
    }
  })

  activeSocket.addEventListener('message', (event) => {
    if (connectionVersion !== refreshNotificationConnectionVersion) {
      return
    }

    if (typeof event.data !== 'string') {
      return
    }

    let payload: unknown
    try {
      payload = JSON.parse(event.data)
    } catch {
      return
    }

    if (isRefreshNotification(payload)) {
      const refreshCursor = normalizeRefreshCursor(payload.data.refreshCursor)
      bumpProjectClientBrowserRefreshVersion(refreshCursor)
      notifyBrowserRefreshListeners(payload)
      return
    }
  })

  activeSocket.addEventListener('close', () => {
    if (connectionVersion !== refreshNotificationConnectionVersion) {
      return
    }

    refreshNotificationSocket = undefined
    if (!getProjectClientBrowserRuntime()) {
      refreshNotificationSocketRuntimeKey = undefined
      shouldResyncOnNextOpen = false
      return
    }

    shouldResyncOnNextOpen = true
    scheduleRefreshNotificationReconnect(connectionVersion)
  })

  activeSocket.addEventListener('error', () => {
    if (connectionVersion !== refreshNotificationConnectionVersion) {
      return
    }

    try {
      activeSocket.close()
    } catch {
      // Ignore close failures and let the reconnect path recover.
    }
  })
}

function scheduleRefreshNotificationReconnect(connectionVersion: number): void {
  clearRefreshNotificationReconnectTimer()
  refreshNotificationReconnectTimer = window.setTimeout(() => {
    if (connectionVersion !== refreshNotificationConnectionVersion) {
      return
    }

    ensureRefreshNotificationSocket({
      forceReconnect: true,
    })
  }, BROWSER_REFRESH_RECONNECT_DELAY_MS)
}

function clearRefreshNotificationReconnectTimer(): void {
  if (refreshNotificationReconnectTimer !== undefined) {
    window.clearTimeout(refreshNotificationReconnectTimer)
    refreshNotificationReconnectTimer = undefined
  }
}

function disposeRefreshNotificationSocket(
  options: {
    keepReconnectTimer?: boolean
  } = {}
): void {
  if (!options.keepReconnectTimer) {
    clearRefreshNotificationReconnectTimer()
  }

  const activeSocket = refreshNotificationSocket
  refreshNotificationSocket = undefined
  refreshNotificationSocketRuntimeKey = undefined
  refreshNotificationConnectionVersion += 1
  shouldResyncOnNextOpen = false

  if (!activeSocket) {
    return
  }

  try {
    activeSocket.close()
  } catch {
    // Ignore close failures.
  }
}

async function requestRefreshInvalidationsSince(
  socket: WebSocket,
  connectionVersion: number
): Promise<void> {
  if (
    socket.readyState !== WebSocket.OPEN ||
    connectionVersion !== refreshNotificationConnectionVersion
  ) {
    return
  }

  const requestId = nextRefreshResyncRequestId++
  const sinceCursor = readProjectClientBrowserRefreshVersion().cursor

  return new Promise((resolve) => {
    let settled = false

    const finalize = () => {
      if (settled) {
        return
      }

      settled = true
      window.clearTimeout(timeoutId)
      socket.removeEventListener('message', handleMessage)
      resolve()
    }

    const handleMessage = (event: MessageEvent) => {
      if (
        connectionVersion !== refreshNotificationConnectionVersion ||
        socket.readyState !== WebSocket.OPEN ||
        typeof event.data !== 'string'
      ) {
        return
      }

      let payload: unknown
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }

      const response = readRpcResponseForRequest(payload, requestId)
      if (!response) {
        return
      }

      finalize()
      if (response.error) {
        bumpProjectClientBrowserRefreshVersion()
        return
      }

      const result = normalizeRefreshInvalidationsSinceResponse(response.result)
      if (!result) {
        bumpProjectClientBrowserRefreshVersion()
        return
      }

      const refreshCursor = normalizeRefreshCursor(result.nextCursor)
      const invalidationPaths = getRefreshInvalidationPaths(result)
      if (result.fullRefresh || invalidationPaths.length > 0) {
        bumpProjectClientBrowserRefreshVersion(refreshCursor)
        if (invalidationPaths.length > 0) {
          notifyBrowserRefreshListeners({
            type: 'refresh',
            data: {
              refreshCursor,
              filePath: invalidationPaths[0],
              filePaths: invalidationPaths,
            },
          })
        }
        return
      }

      syncProjectClientBrowserRefreshCursor(refreshCursor)
    }

    const timeoutId = window.setTimeout(() => {
      finalize()
      bumpProjectClientBrowserRefreshVersion()
    }, BROWSER_REFRESH_RESYNC_TIMEOUT_MS)

    socket.addEventListener('message', handleMessage)

    try {
      socket.send(
        JSON.stringify({
          id: requestId,
          method: 'getRefreshInvalidationsSince',
          params: {
            sinceCursor,
          },
        })
      )
    } catch {
      finalize()
      bumpProjectClientBrowserRefreshVersion()
    }
  })
}

function normalizeRefreshInvalidationsSinceResponse(
  value: unknown
): RefreshInvalidationsSinceResponse | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return value as RefreshInvalidationsSinceResponse
}

function readRpcResponseForRequest(
  payload: unknown,
  requestId: number
):
  | {
      result?: unknown
      error?: unknown
    }
  | undefined {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const response = readRpcResponseForRequest(item, requestId)
      if (response) {
        return response
      }
    }

    return undefined
  }

  if (!payload || typeof payload !== 'object') {
    return undefined
  }

  const candidate = payload as {
    id?: unknown
    result?: unknown
    error?: unknown
  }

  if (candidate.id !== requestId) {
    return undefined
  }

  return {
    result: candidate.result,
    error: candidate.error,
  }
}

function notifyBrowserRefreshListeners(message: RefreshNotificationMessage): void {
  for (const listener of browserRefreshNotificationListeners) {
    listener(message)
  }
}

function bumpProjectClientBrowserRefreshVersion(
  cursor?: number
): void {
  const current = readProjectClientBrowserRefreshVersion()
  const nextCursor =
    typeof cursor === 'number' && Number.isFinite(cursor) && cursor >= 0
      ? Math.max(current.cursor, Math.floor(cursor))
      : current.cursor

  setProjectClientBrowserRefreshVersion(
    `${nextCursor}:${current.epoch + 1}`
  )
}

function syncProjectClientBrowserRefreshCursor(cursor?: number): void {
  if (typeof cursor !== 'number' || !Number.isFinite(cursor) || cursor < 0) {
    return
  }

  const current = readProjectClientBrowserRefreshVersion()
  const nextCursor = Math.max(current.cursor, Math.floor(cursor))
  if (nextCursor === current.cursor) {
    return
  }

  setProjectClientBrowserRefreshVersion(`${nextCursor}:${current.epoch}`)
}

function readProjectClientBrowserRefreshVersion(): ParsedRefreshVersion {
  const [rawCursor = '0', rawEpoch = '0'] =
    getProjectClientBrowserRefreshVersion().split(':')
  const cursor = Number.parseInt(rawCursor, 10)
  const epoch = Number.parseInt(rawEpoch, 10)

  return {
    cursor: Number.isFinite(cursor) && cursor >= 0 ? cursor : 0,
    epoch: Number.isFinite(epoch) && epoch >= 0 ? epoch : 0,
  }
}

function toBrowserRuntimeKey(runtime: ProjectServerRuntime): string {
  return `${runtime.id}:${runtime.port}`
}
