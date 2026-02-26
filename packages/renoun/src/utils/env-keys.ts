export const PROCESS_ENV_KEYS = {
  nodeEnv: 'NODE_ENV',
  ci: 'CI',
  vitest: 'VITEST',
  vitestWorkerId: 'VITEST_WORKER_ID',
  renounFsStrictHermetic: 'RENOUN_FS_STRICT_HERMETIC',
  renounServerId: 'RENOUN_SERVER_ID',
  renounServerPort: 'RENOUN_SERVER_PORT',
  renounServerRefreshNotifications: 'RENOUN_SERVER_REFRESH_NOTIFICATIONS',
  renounProjectWatchers: 'RENOUN_PROJECT_WATCHERS',
  renounProjectClientRpcCache: 'RENOUN_PROJECT_CLIENT_RPC_CACHE',
  renounProjectClientRpcCacheTtlMs: 'RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS',
  renounProjectRefreshNotifications: 'RENOUN_PROJECT_REFRESH_NOTIFICATIONS',
  renounProjectCacheMaxEntries: 'RENOUN_PROJECT_CACHE_MAX_ENTRIES',
  renounPrewarmWorkerPayload: 'RENOUN_PREWARM_WORKER_PAYLOAD',
  renounTargetedMissingDependencyFallback:
    'RENOUN_TARGETED_MISSING_DEP_FALLBACK',
  renounDirectorySnapshotPrefixIndexMaxKeys:
    'RENOUN_DIRECTORY_SNAPSHOT_PREFIX_INDEX_MAX_KEYS',
} as const
