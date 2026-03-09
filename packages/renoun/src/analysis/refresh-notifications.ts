export interface RefreshNotificationData {
  refreshCursor?: number
  filePath?: string
  filePaths?: string[]
  eventType?: string
  eventTypes?: string[]
}

export interface RefreshNotificationMessage {
  type: 'refresh'
  data: RefreshNotificationData
}

export interface RefreshInvalidationsSinceRequest
  extends Record<string, unknown> {
  sinceCursor?: number
}

export interface RefreshInvalidationsSinceResponse {
  nextCursor?: number
  fullRefresh?: boolean
  filePath?: string
  filePaths?: string[]
}

export function normalizeRefreshCursor(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined
  }

  return Math.floor(value)
}

export function isRefreshNotification(
  value: unknown
): value is RefreshNotificationMessage {
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

  return getRefreshInvalidationPaths(candidate.data).length > 0
}

export function getRefreshInvalidationPaths(data: {
  filePath?: unknown
  filePaths?: unknown
}): string[] {
  const deduped = new Set<string>()

  if (typeof data.filePath === 'string' && data.filePath.length > 0) {
    deduped.add(data.filePath)
  }

  if (Array.isArray(data.filePaths)) {
    for (const path of data.filePaths) {
      if (typeof path === 'string' && path.length > 0) {
        deduped.add(path)
      }
    }
  }

  return Array.from(deduped)
}
