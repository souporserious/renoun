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
    WS_NO_BUFFER_UTIL?: string
    FIGMA_TOKEN?: string
  }
}
