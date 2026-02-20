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
    RENOUN_PROJECT_WATCHERS?: '1' | '0' | 'true' | 'false'
    RENOUN_PROJECT_REFRESH_NOTIFICATIONS?: '1' | '0' | 'true' | 'false'
    RENOUN_SERVER_REFRESH_NOTIFICATIONS?: '1' | '0' | 'true' | 'false'
    WS_NO_BUFFER_UTIL?: string
    FIGMA_TOKEN?: string
  }
}
