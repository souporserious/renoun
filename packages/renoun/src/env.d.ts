declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: 'development' | 'production' | 'test'
    RENOUN_DEBUG?:
      | 'true'
      | 'false'
      | 'error'
      | 'warn'
      | 'info'
      | 'debug'
      | 'trace'
    RENOUN_RUNTIME_DIRECTORY?: string
    RENOUN_SERVER_ID?: string
    RENOUN_SERVER_PORT?: string
    RENOUN_SERVER_REFRESH_NOTIFICATIONS?: string
    RENOUN_PROJECT_WATCHERS?: string
    RENOUN_PROJECT_CLIENT_RPC_CACHE?: string
    RENOUN_PROJECT_CLIENT_RPC_CACHE_TTL_MS?: string
    RENOUN_PROJECT_CACHE_MAX_ENTRIES?: string
    RENOUN_PROJECT_REFRESH_NOTIFICATIONS?: string
    RENOUN_PREWARM_WORKER_PAYLOAD?: string
    RENOUN_TARGETED_MISSING_DEP_FALLBACK?: string
    RENOUN_SPONSORS_CACHE_TTL_MS?: string
    RENOUN_BUILD_PROFILE?: string
    RENOUN_BUILD_PROFILE_FILE?: string
    RENOUN_FS_STRICT_HERMETIC?: string
    RENOUN_DIRECTORY_SNAPSHOT_PREFIX_INDEX_MAX_KEYS?: string
    GITHUB_SPONSORS_TOKEN?: string
    WS_NO_BUFFER_UTIL?: string
    FIGMA_TOKEN?: string
  }
}
