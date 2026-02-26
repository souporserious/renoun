import { PROCESS_ENV_KEYS } from '../utils/env-keys.ts'
import { parseBooleanEnv, parseNonNegativeIntegerEnv } from '../utils/env.ts'

export const PROJECT_RUNTIME_ENV_KEYS = {
  serverId: PROCESS_ENV_KEYS.renounServerId,
  serverPort: PROCESS_ENV_KEYS.renounServerPort,
  serverRefreshNotifications: PROCESS_ENV_KEYS.renounServerRefreshNotifications,
  projectWatchers: PROCESS_ENV_KEYS.renounProjectWatchers,
  projectClientRpcCache: PROCESS_ENV_KEYS.renounProjectClientRpcCache,
  projectClientRpcCacheTtlMs: PROCESS_ENV_KEYS.renounProjectClientRpcCacheTtlMs,
  projectRefreshNotifications: PROCESS_ENV_KEYS.renounProjectRefreshNotifications,
} as const

export interface ProjectServerRuntime {
  port: string
  id: string
}

function readNonEmptyProcessEnv(key: string): string | undefined {
  const value = process.env[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function getServerPortFromProcessEnv(): string | undefined {
  return readNonEmptyProcessEnv(PROJECT_RUNTIME_ENV_KEYS.serverPort)
}

export function setServerPortProcessEnv(port: number | string): void {
  process.env[PROJECT_RUNTIME_ENV_KEYS.serverPort] = String(port)
}

export function getServerIdFromProcessEnv(): string | undefined {
  return readNonEmptyProcessEnv(PROJECT_RUNTIME_ENV_KEYS.serverId)
}

export function setServerIdProcessEnv(id: string): void {
  process.env[PROJECT_RUNTIME_ENV_KEYS.serverId] = id
}

export function getServerRuntimeFromProcessEnv():
  | ProjectServerRuntime
  | undefined {
  const port = getServerPortFromProcessEnv()
  const id = getServerIdFromProcessEnv()
  if (!port || !id) {
    return undefined
  }

  return { port, id }
}

export function hasServerRuntimeInProcessEnv(): boolean {
  return getServerRuntimeFromProcessEnv() !== undefined
}

export function getServerPortForLogging(): string {
  return getServerPortFromProcessEnv() ?? 'unknown'
}

export function resolveProjectWatchersEnvOverride(): boolean | undefined {
  return parseBooleanEnv(process.env[PROJECT_RUNTIME_ENV_KEYS.projectWatchers])
}

export function resolveProjectClientRpcCacheEnabledFromEnv():
  | boolean
  | undefined {
  return parseBooleanEnv(
    process.env[PROJECT_RUNTIME_ENV_KEYS.projectClientRpcCache]
  )
}

export function resolveProjectClientRpcCacheTtlMsFromEnv(
  fallbackWhenMissing: number
): number {
  const configured = process.env[PROJECT_RUNTIME_ENV_KEYS.projectClientRpcCacheTtlMs]
  if (!configured) {
    return fallbackWhenMissing
  }

  const parsed = parseNonNegativeIntegerEnv(configured)
  return parsed ?? fallbackWhenMissing
}

export function resolveProjectRefreshNotificationsEnvOverride():
  | boolean
  | undefined {
  return parseBooleanEnv(
    process.env[PROJECT_RUNTIME_ENV_KEYS.projectRefreshNotifications]
  )
}

export function resolveServerRefreshNotificationsEnvOverride():
  | boolean
  | undefined {
  return parseBooleanEnv(
    process.env[PROJECT_RUNTIME_ENV_KEYS.serverRefreshNotifications]
  )
}
