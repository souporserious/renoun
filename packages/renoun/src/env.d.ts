declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: 'development' | 'production' | 'test'
    RENOUN_SERVER_ID?: string
    RENOUN_SERVER_PORT?: string
    WS_NO_BUFFER_UTIL?: string
  }
}
