import type { AnalysisServerRuntime } from './runtime-env.ts'

let browserAnalysisServerRuntime: AnalysisServerRuntime | undefined
let browserAnalysisClientRefreshVersion = '0:0'

const browserAnalysisServerRuntimeListeners = new Set<
  (runtime: AnalysisServerRuntime | undefined) => void
>()
const browserAnalysisClientRefreshVersionListeners = new Set<
  (version: string) => void
>()

export interface ParsedAnalysisClientRefreshVersion {
  cursor: number
  epoch: number
}

export function getAnalysisServerRuntimeKey(
  runtime: AnalysisServerRuntime | undefined
): string | undefined {
  if (!runtime) {
    return undefined
  }

  return `${runtime.id}:${runtime.host ?? 'localhost'}:${runtime.port}`
}

export function normalizeAnalysisServerRuntime(
  runtime?: AnalysisServerRuntime
): AnalysisServerRuntime | undefined {
  if (!runtime) {
    return undefined
  }

  return {
    id: String(runtime.id),
    port: String(runtime.port),
    ...(typeof runtime.host === 'string' && runtime.host.trim().length > 0
      ? { host: runtime.host.trim() }
      : {}),
    ...(typeof runtime.emitRefreshNotifications === 'boolean'
      ? { emitRefreshNotifications: runtime.emitRefreshNotifications }
      : {}),
  }
}

function areAnalysisServerRuntimesEqual(
  left: AnalysisServerRuntime | undefined,
  right: AnalysisServerRuntime | undefined
): boolean {
  if (!left || !right) {
    return left === right
  }

  return (
    left.id === right.id &&
    left.port === right.port &&
    left.host === right.host &&
    left.emitRefreshNotifications === right.emitRefreshNotifications
  )
}

export function parseAnalysisClientRefreshVersion(
  version: string
): ParsedAnalysisClientRefreshVersion {
  const [rawCursor = '0', rawEpoch = '0'] = version.split(':')
  const cursor = Number.parseInt(rawCursor, 10)
  const epoch = Number.parseInt(rawEpoch, 10)

  return {
    cursor: Number.isFinite(cursor) && cursor >= 0 ? cursor : 0,
    epoch: Number.isFinite(epoch) && epoch >= 0 ? epoch : 0,
  }
}

export function getAnalysisClientBrowserRuntime():
  | AnalysisServerRuntime
  | undefined {
  return browserAnalysisServerRuntime
}

export function onAnalysisClientBrowserRuntimeChange(
  listener: (runtime: AnalysisServerRuntime | undefined) => void
): () => void {
  browserAnalysisServerRuntimeListeners.add(listener)
  return () => {
    browserAnalysisServerRuntimeListeners.delete(listener)
  }
}

export function setAnalysisClientBrowserRuntime(
  runtime?: AnalysisServerRuntime
): void {
  const normalizedRuntime = normalizeAnalysisServerRuntime(runtime)
  if (
    areAnalysisServerRuntimesEqual(
      browserAnalysisServerRuntime,
      normalizedRuntime
    )
  ) {
    return
  }

  browserAnalysisServerRuntime = normalizedRuntime
  for (const listener of browserAnalysisServerRuntimeListeners) {
    listener(browserAnalysisServerRuntime)
  }
}

export function getAnalysisClientBrowserRefreshVersion(): string {
  return browserAnalysisClientRefreshVersion
}

export function onAnalysisClientBrowserRefreshVersionChange(
  listener: (version: string) => void
): () => void {
  browserAnalysisClientRefreshVersionListeners.add(listener)
  return () => {
    browserAnalysisClientRefreshVersionListeners.delete(listener)
  }
}

export function setAnalysisClientBrowserRefreshVersion(version: string): void {
  if (browserAnalysisClientRefreshVersion === version) {
    return
  }

  browserAnalysisClientRefreshVersion = version
  for (const listener of browserAnalysisClientRefreshVersionListeners) {
    listener(browserAnalysisClientRefreshVersion)
  }
}
