import type { AnalysisServerClientRuntime } from '../analysis/runtime-env.ts'

export const DEFAULT_BUILD_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS =
  15 * 60 * 1000

export function createBuildAnalysisClientRuntime():
  AnalysisServerClientRuntime {
  return {
    useRpcCache: true,
    rpcCacheTtlMs: DEFAULT_BUILD_ANALYSIS_CLIENT_RPC_CACHE_TTL_MS,
    consumeRefreshNotifications: false,
  }
}
