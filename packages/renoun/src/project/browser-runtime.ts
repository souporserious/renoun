import type { ProjectServerRuntime } from './runtime-env.ts'

let browserProjectServerRuntime: ProjectServerRuntime | undefined
let browserProjectClientRefreshVersion = '0:0'

const browserProjectServerRuntimeListeners = new Set<
  (runtime: ProjectServerRuntime | undefined) => void
>()
const browserProjectClientRefreshVersionListeners = new Set<
  (version: string) => void
>()

function toBrowserRuntimeKey(
  runtime: ProjectServerRuntime | undefined
): string | undefined {
  if (!runtime) {
    return undefined
  }

  return `${runtime.id}:${runtime.host ?? 'localhost'}:${runtime.port}`
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
  const normalizedRuntime = runtime
    ? {
        id: String(runtime.id),
        port: String(runtime.port),
        ...(typeof runtime.host === 'string' && runtime.host.trim().length > 0
          ? { host: runtime.host.trim() }
          : {}),
      }
    : undefined
  const currentKey = toBrowserRuntimeKey(browserProjectServerRuntime)
  const nextKey = toBrowserRuntimeKey(normalizedRuntime)

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
