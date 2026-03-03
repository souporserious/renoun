import { PROCESS_ENV_KEYS } from '../utils/env-keys.ts'
import {
  parseBooleanProcessEnv,
  parseNonNegativeIntegerProcessEnv,
  readNonEmptyProcessEnv,
} from '../utils/env.ts'

export interface ProjectServerRuntime {
  port: string
  id: string
}

export function getServerPortFromProcessEnv(): string | undefined {
  return readNonEmptyProcessEnv(PROCESS_ENV_KEYS.renounServerPort)
}

export function setServerPortProcessEnv(port: number | string): void {
  process.env[PROCESS_ENV_KEYS.renounServerPort] = String(port)
}

export function getServerIdFromProcessEnv(): string | undefined {
  return readNonEmptyProcessEnv(PROCESS_ENV_KEYS.renounServerId)
}

export function setServerIdProcessEnv(id: string): void {
  process.env[PROCESS_ENV_KEYS.renounServerId] = id
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
  return parseBooleanProcessEnv(PROCESS_ENV_KEYS.renounProjectWatchers)
}

export function resolveProjectClientRpcCacheEnabledFromEnv():
  | boolean
  | undefined {
  return parseBooleanProcessEnv(
    PROCESS_ENV_KEYS.renounProjectClientRpcCache
  )
}

export function resolveProjectClientRpcCacheTtlMsFromEnv(
  fallbackWhenMissing: number
): number {
  const parsed = parseNonNegativeIntegerProcessEnv(
    PROCESS_ENV_KEYS.renounProjectClientRpcCacheTtlMs
  )
  return parsed ?? fallbackWhenMissing
}

export function resolveProjectRefreshNotificationsEnvOverride():
  | boolean
  | undefined {
  return parseBooleanProcessEnv(
    PROCESS_ENV_KEYS.renounProjectRefreshNotifications
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
