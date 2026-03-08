import type { ProjectServerRuntime } from './runtime-env.ts'

let browserProjectServerRuntime: ProjectServerRuntime | undefined
let browserProjectClientRefreshVersion = '0:0'

const browserProjectServerRuntimeListeners = new Set<
  (runtime: ProjectServerRuntime | undefined) => void
>()
const browserProjectClientRefreshVersionListeners = new Set<
  (version: string) => void
>()

export interface ParsedProjectClientRefreshVersion {
  cursor: number
  epoch: number
}

export function getProjectServerRuntimeKey(
  runtime: ProjectServerRuntime | undefined
): string | undefined {
  if (!runtime) {
    return undefined
  }

  return `${runtime.id}:${runtime.host ?? 'localhost'}:${runtime.port}`
}

export function normalizeProjectServerRuntime(
  runtime?: ProjectServerRuntime
): ProjectServerRuntime | undefined {
  if (!runtime) {
    return undefined
  }

  return {
    id: String(runtime.id),
    port: String(runtime.port),
    ...(typeof runtime.host === 'string' && runtime.host.trim().length > 0
      ? { host: runtime.host.trim() }
      : {}),
  }
}

export function parseProjectClientRefreshVersion(
  version: string
): ParsedProjectClientRefreshVersion {
  const [rawCursor = '0', rawEpoch = '0'] = version.split(':')
  const cursor = Number.parseInt(rawCursor, 10)
  const epoch = Number.parseInt(rawEpoch, 10)

  return {
    cursor: Number.isFinite(cursor) && cursor >= 0 ? cursor : 0,
    epoch: Number.isFinite(epoch) && epoch >= 0 ? epoch : 0,
  }
}

export function getProjectClientBrowserRuntime():
  | ProjectServerRuntime
  | undefined {
  return browserProjectServerRuntime
}

export function onProjectClientBrowserRuntimeChange(
  listener: (runtime: ProjectServerRuntime | undefined) => void
): () => void {
  browserProjectServerRuntimeListeners.add(listener)
  return () => {
    browserProjectServerRuntimeListeners.delete(listener)
  }
}

export function setProjectClientBrowserRuntime(
  runtime?: ProjectServerRuntime
): void {
  const normalizedRuntime = normalizeProjectServerRuntime(runtime)
  const currentKey = getProjectServerRuntimeKey(browserProjectServerRuntime)
  const nextKey = getProjectServerRuntimeKey(normalizedRuntime)

  if (currentKey === nextKey) {
    return
  }

  browserProjectServerRuntime = normalizedRuntime
  for (const listener of browserProjectServerRuntimeListeners) {
    listener(browserProjectServerRuntime)
  }
}

export function getProjectClientBrowserRefreshVersion(): string {
  return browserProjectClientRefreshVersion
}

export function onProjectClientBrowserRefreshVersionChange(
  listener: (version: string) => void
): () => void {
  browserProjectClientRefreshVersionListeners.add(listener)
  return () => {
    browserProjectClientRefreshVersionListeners.delete(listener)
  }
}

export function setProjectClientBrowserRefreshVersion(version: string): void {
  if (browserProjectClientRefreshVersion === version) {
    return
  }

  browserProjectClientRefreshVersion = version
  for (const listener of browserProjectClientRefreshVersionListeners) {
    listener(browserProjectClientRefreshVersion)
  }
}
