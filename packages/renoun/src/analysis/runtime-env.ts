import { PROCESS_ENV_KEYS } from '../utils/env-keys.ts'
import {
  parseBooleanProcessEnv,
  parseNonNegativeIntegerProcessEnv,
  readNonEmptyProcessEnv,
} from '../utils/env.ts'

export interface AnalysisServerRuntime {
  port: string
  id: string
  host?: string
  emitRefreshNotifications?: boolean
}

export function createServerRuntimeProcessEnv(
  runtime: AnalysisServerRuntime
): Record<string, string> {
  return {
    [PROCESS_ENV_KEYS.renounServerPort]: String(runtime.port),
    [PROCESS_ENV_KEYS.renounServerId]: String(runtime.id),
    ...(typeof runtime.host === 'string' && runtime.host.length > 0
      ? {
          [PROCESS_ENV_KEYS.renounServerHost]: runtime.host,
        }
      : {}),
    ...(typeof runtime.emitRefreshNotifications === 'boolean'
      ? {
          [PROCESS_ENV_KEYS.renounServerRefreshNotificationsEffective]:
            runtime.emitRefreshNotifications ? '1' : '0',
        }
      : {}),
  }
}

const serverRuntimeEnvListeners = new Set<
  (runtime: AnalysisServerRuntime | undefined) => void
>()

export function getServerPortFromProcessEnv(): string | undefined {
  return readNonEmptyProcessEnv(PROCESS_ENV_KEYS.renounServerPort)
}

export function setServerPortProcessEnv(port: number | string): void {
  process.env[PROCESS_ENV_KEYS.renounServerPort] = String(port)
}

export function getServerHostFromProcessEnv(): string | undefined {
  return readNonEmptyProcessEnv(PROCESS_ENV_KEYS.renounServerHost)
}

export function setServerHostProcessEnv(host: string): void {
  process.env[PROCESS_ENV_KEYS.renounServerHost] = host
}

export function clearServerRuntimeProcessEnv(): void {
  // Preserve the server id so an in-process restart can reuse the same client
  // protocol id, but clear the exported runtime fields when no server is active.
  delete process.env[PROCESS_ENV_KEYS.renounServerPort]
  delete process.env[PROCESS_ENV_KEYS.renounServerHost]
  delete process.env[
    PROCESS_ENV_KEYS.renounServerRefreshNotificationsEffective
  ]
}

export function getServerIdFromProcessEnv(): string | undefined {
  return readNonEmptyProcessEnv(PROCESS_ENV_KEYS.renounServerId)
}

export function setServerIdProcessEnv(id: string): void {
  process.env[PROCESS_ENV_KEYS.renounServerId] = id
}

export function getServerRuntimeFromProcessEnv():
  | AnalysisServerRuntime
  | undefined {
  const port = getServerPortFromProcessEnv()
  const id = getServerIdFromProcessEnv()
  if (!port || !id) {
    return undefined
  }

  const host = getServerHostFromProcessEnv()
  const emitRefreshNotifications =
    resolveServerRefreshNotificationsEffectiveFromEnv() ??
    resolveServerRefreshNotificationsEnvOverride()

  return {
    port,
    id,
    ...(host ? { host } : {}),
    ...(typeof emitRefreshNotifications === 'boolean'
      ? { emitRefreshNotifications }
      : {}),
  }
}

export function onServerRuntimeEnvChange(
  listener: (runtime: AnalysisServerRuntime | undefined) => void
): () => void {
  serverRuntimeEnvListeners.add(listener)
  return () => {
    serverRuntimeEnvListeners.delete(listener)
  }
}

export function notifyServerRuntimeEnvChanged(): void {
  const runtime = getServerRuntimeFromProcessEnv()
  for (const listener of serverRuntimeEnvListeners) {
    listener(runtime)
  }
}

export function hasServerRuntimeInProcessEnv(): boolean {
  return getServerRuntimeFromProcessEnv() !== undefined
}

export function getServerPortForLogging(): string {
  return getServerPortFromProcessEnv() ?? 'unknown'
}

export function resolveAnalysisWatchersEnvOverride(): boolean | undefined {
  return parseBooleanProcessEnv(PROCESS_ENV_KEYS.renounAnalysisWatchers)
}

export function resolveAnalysisClientRpcCacheEnabledFromEnv():
  | boolean
  | undefined {
  return parseBooleanProcessEnv(
    PROCESS_ENV_KEYS.renounAnalysisClientRpcCache
  )
}

export function resolveAnalysisClientRpcCacheTtlMsFromEnv(
  fallbackWhenMissing: number
): number {
  const parsed = parseNonNegativeIntegerProcessEnv(
    PROCESS_ENV_KEYS.renounAnalysisClientRpcCacheTtlMs
  )
  return parsed ?? fallbackWhenMissing
}

export function resolveAnalysisRefreshNotificationsEnvOverride():
  | boolean
  | undefined {
  return parseBooleanProcessEnv(
    PROCESS_ENV_KEYS.renounAnalysisRefreshNotifications
  )
}

export function resolveServerRefreshNotificationsEnvOverride():
  | boolean
  | undefined {
  return parseBooleanProcessEnv(
    PROCESS_ENV_KEYS.renounServerRefreshNotifications
  )
}

export function resolveServerRefreshNotificationsEffectiveFromEnv():
  | boolean
  | undefined {
  return parseBooleanProcessEnv(
    PROCESS_ENV_KEYS.renounServerRefreshNotificationsEffective
  )
}

export function setServerRefreshNotificationsProcessEnv(
  enabled: boolean
): void {
  process.env[PROCESS_ENV_KEYS.renounServerRefreshNotificationsEffective] =
    enabled ? '1' : '0'
}
