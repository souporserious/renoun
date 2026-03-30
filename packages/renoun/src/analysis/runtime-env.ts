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
  clientRuntime?: AnalysisServerClientRuntime
}

/**
 * Advanced client defaults carried by the active server runtime.
 * These are internal transport values; callers should prefer
 * `createServer({ clientRuntime })` over setting process env directly.
 */
export interface AnalysisServerClientRuntime {
  useRpcCache?: boolean
  rpcCacheTtlMs?: number
  consumeRefreshNotifications?: boolean
}

function createServerClientRuntimeProcessEnv(
  runtime: AnalysisServerClientRuntime | undefined
): Record<string, string> {
  if (!runtime) {
    return {}
  }

  return {
    ...(typeof runtime.useRpcCache === 'boolean'
      ? {
          [PROCESS_ENV_KEYS.renounServerClientRpcCache]: runtime.useRpcCache
            ? '1'
            : '0',
        }
      : {}),
    ...(typeof runtime.rpcCacheTtlMs === 'number' &&
    Number.isFinite(runtime.rpcCacheTtlMs)
      ? {
          [PROCESS_ENV_KEYS.renounServerClientRpcCacheTtlMs]: String(
            Math.max(0, Math.floor(runtime.rpcCacheTtlMs))
          ),
        }
      : {}),
    ...(typeof runtime.consumeRefreshNotifications === 'boolean'
      ? {
          [PROCESS_ENV_KEYS.renounServerClientRefreshNotifications]:
            runtime.consumeRefreshNotifications ? '1' : '0',
        }
      : {}),
  }
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
    ...createServerClientRuntimeProcessEnv(runtime.clientRuntime),
  }
}

const SERVER_RUNTIME_PROCESS_ENV_KEYS = [
  PROCESS_ENV_KEYS.renounServerPort,
  PROCESS_ENV_KEYS.renounServerHost,
  PROCESS_ENV_KEYS.renounServerId,
  PROCESS_ENV_KEYS.renounServerClientRpcCache,
  PROCESS_ENV_KEYS.renounServerClientRpcCacheTtlMs,
  PROCESS_ENV_KEYS.renounServerClientRefreshNotifications,
  PROCESS_ENV_KEYS.renounServerRefreshNotificationsEffective,
] as const

export async function runWithServerRuntimeProcessEnv<Type>(
  runtime: AnalysisServerRuntime,
  task: () => Promise<Type>
): Promise<Type> {
  const previousValues = new Map<string, string | undefined>()

  for (const key of SERVER_RUNTIME_PROCESS_ENV_KEYS) {
    previousValues.set(key, process.env[key])
  }

  Object.assign(process.env, createServerRuntimeProcessEnv(runtime))
  notifyServerRuntimeEnvChanged()

  try {
    return await task()
  } finally {
    for (const key of SERVER_RUNTIME_PROCESS_ENV_KEYS) {
      const previousValue = previousValues.get(key)
      if (previousValue === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = previousValue
      }
    }

    notifyServerRuntimeEnvChanged()
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
  delete process.env[PROCESS_ENV_KEYS.renounServerClientRpcCache]
  delete process.env[PROCESS_ENV_KEYS.renounServerClientRpcCacheTtlMs]
  delete process.env[PROCESS_ENV_KEYS.renounServerClientRefreshNotifications]
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

function getServerClientRuntimeFromProcessEnv():
  | AnalysisServerClientRuntime
  | undefined {
  const useRpcCache = parseBooleanProcessEnv(
    PROCESS_ENV_KEYS.renounServerClientRpcCache
  )
  const rpcCacheTtlMs = parseNonNegativeIntegerProcessEnv(
    PROCESS_ENV_KEYS.renounServerClientRpcCacheTtlMs
  )
  const consumeRefreshNotifications = parseBooleanProcessEnv(
    PROCESS_ENV_KEYS.renounServerClientRefreshNotifications
  )

  if (
    useRpcCache === undefined &&
    rpcCacheTtlMs === undefined &&
    consumeRefreshNotifications === undefined
  ) {
    return undefined
  }

  return {
    ...(typeof useRpcCache === 'boolean' ? { useRpcCache } : {}),
    ...(typeof rpcCacheTtlMs === 'number' ? { rpcCacheTtlMs } : {}),
    ...(typeof consumeRefreshNotifications === 'boolean'
      ? { consumeRefreshNotifications }
      : {}),
  }
}

export function setServerClientRuntimeProcessEnv(
  runtime?: AnalysisServerClientRuntime
): void {
  if (typeof runtime?.useRpcCache === 'boolean') {
    process.env[PROCESS_ENV_KEYS.renounServerClientRpcCache] =
      runtime.useRpcCache ? '1' : '0'
  } else {
    delete process.env[PROCESS_ENV_KEYS.renounServerClientRpcCache]
  }

  if (
    typeof runtime?.rpcCacheTtlMs === 'number' &&
    Number.isFinite(runtime.rpcCacheTtlMs)
  ) {
    process.env[PROCESS_ENV_KEYS.renounServerClientRpcCacheTtlMs] = String(
      Math.max(0, Math.floor(runtime.rpcCacheTtlMs))
    )
  } else {
    delete process.env[PROCESS_ENV_KEYS.renounServerClientRpcCacheTtlMs]
  }

  if (typeof runtime?.consumeRefreshNotifications === 'boolean') {
    process.env[PROCESS_ENV_KEYS.renounServerClientRefreshNotifications] =
      runtime.consumeRefreshNotifications ? '1' : '0'
  } else {
    delete process.env[PROCESS_ENV_KEYS.renounServerClientRefreshNotifications]
  }
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
  const clientRuntime = getServerClientRuntimeFromProcessEnv()

  return {
    port,
    id,
    ...(host ? { host } : {}),
    ...(typeof emitRefreshNotifications === 'boolean'
      ? { emitRefreshNotifications }
      : {}),
    ...(clientRuntime ? { clientRuntime } : {}),
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
