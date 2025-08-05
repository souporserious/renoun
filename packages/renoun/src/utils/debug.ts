import { loadConfig } from './load-config.js'

export type DebugLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace'

export interface DebugOptions {
  /** The minimum level to log. Defaults to 'info' when RENOUN_DEBUG is set. */
  level?: DebugLevel

  /** Whether to include timestamps in log messages. */
  includeTimestamp?: boolean

  /** Whether to include performance measurements. */
  includePerformance?: boolean

  /** Maximum length for string values in debug data. Defaults to 1000. */
  maxStringLength?: number

  /** Maximum depth for object serialization. Defaults to 3. */
  maxObjectDepth?: number

  /** Maximum number of array items to include. Defaults to 10. */
  maxArrayItems?: number
}

export interface DebugContext {
  /** The current operation being performed. */
  operation?: string

  /** Additional context data. */
  data?: Record<string, any>

  /** Start time for performance measurement. */
  startTime?: number
}

/** Truncates data values to prevent huge logs while preserving useful information. */
function truncateData(
  data: any,
  maxStringLength: number = 1000,
  maxObjectDepth: number = 3,
  maxArrayItems: number = 10,
  currentDepth: number = 0
): any {
  if (currentDepth >= maxObjectDepth) {
    return '[Max depth reached]'
  }

  if (data === null || data === undefined) {
    return data
  }

  if (typeof data === 'string') {
    if (data.length <= maxStringLength) {
      return data
    }
    return `${data.substring(0, maxStringLength)}... [truncated, ${data.length} chars total]`
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data
  }

  if (Array.isArray(data)) {
    if (data.length <= maxArrayItems) {
      return data.map((item) =>
        truncateData(
          item,
          maxStringLength,
          maxObjectDepth,
          maxArrayItems,
          currentDepth + 1
        )
      )
    }
    const truncated = data
      .slice(0, maxArrayItems)
      .map((item) =>
        truncateData(
          item,
          maxStringLength,
          maxObjectDepth,
          maxArrayItems,
          currentDepth + 1
        )
      )
    return [...truncated, `... [${data.length - maxArrayItems} more items]`]
  }

  if (typeof data === 'object') {
    const result: Record<string, any> = {}
    const keys = Object.keys(data)

    for (const key of keys) {
      result[key] = truncateData(
        data[key],
        maxStringLength,
        maxObjectDepth,
        maxArrayItems,
        currentDepth + 1
      )
    }

    return result
  }

  return String(data)
}

class DebugLogger {
  #isEnabled: boolean
  #level: DebugLevel
  #includeTimestamp: boolean
  #includePerformance: boolean
  #maxStringLength: number
  #maxObjectDepth: number
  #maxArrayItems: number

  constructor() {
    this.#isEnabled = process.env['RENOUN_DEBUG'] === 'true'

    // Load configuration from renoun.json
    let config: DebugOptions = {}
    try {
      const renounConfig = loadConfig()
      config = renounConfig?.debug || {}
    } catch {
      // If config loading fails, use defaults
    }

    this.#level = config.level || 'info'
    this.#includeTimestamp = config.includeTimestamp ?? true
    this.#includePerformance = config.includePerformance ?? true
    this.#maxStringLength = config.maxStringLength ?? 1000
    this.#maxObjectDepth = config.maxObjectDepth ?? 3
    this.#maxArrayItems = config.maxArrayItems ?? 10
  }

  #shouldLog(messageLevel: DebugLevel): boolean {
    if (!this.#isEnabled) {
      return false
    }

    const levels: Record<DebugLevel, number> = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4,
    }

    return levels[messageLevel] <= levels[this.#level]
  }

  #formatMessage(
    level: DebugLevel,
    message: string,
    context?: DebugContext
  ): string {
    const parts: string[] = []

    if (this.#includeTimestamp) {
      parts.push(new Date().toISOString())
    }

    parts.push(`[renoun] [${level.toUpperCase()}]`)

    if (context?.operation) {
      parts.push(`[${context.operation}]`)
    }

    parts.push(message)

    if (context?.data && Object.keys(context.data).length > 0) {
      // Truncate data before formatting
      const truncatedData = truncateData(
        context.data,
        this.#maxStringLength,
        this.#maxObjectDepth,
        this.#maxArrayItems
      )

      // Format data as pretty-printed JSON with proper indentation
      const dataString = JSON.stringify(truncatedData, null, 2)
        .split('\n')
        .map((line, index) => (index === 0 ? line : `  ${line}`))
        .join('\n')
      parts.push(`\n${dataString}`)
    }

    if (this.#includePerformance && context?.startTime) {
      const duration = Date.now() - context.startTime
      parts.push(`(${duration}ms)`)
    }

    return parts.join(' ')
  }

  #logWithSeparator(
    level: DebugLevel,
    message: string,
    context?: DebugContext
  ): void {
    const formattedMessage = this.#formatMessage(level, message, context)

    // Add a separator line for better readability
    const separator = '─'.repeat(80)

    if (level === 'error') {
      console.error(`\n${separator}`)
      console.error(formattedMessage)
    } else if (level === 'warn') {
      console.warn(`\n${separator}`)
      console.warn(formattedMessage)
    } else {
      console.log(`\n${separator}`)
      console.log(formattedMessage)
    }
  }

  error(message: string, context?: DebugContext): void {
    if (this.#shouldLog('error')) {
      this.#logWithSeparator('error', message, context)
    }
  }

  warn(message: string, context?: DebugContext): void {
    if (this.#shouldLog('warn')) {
      this.#logWithSeparator('warn', message, context)
    }
  }

  info(message: string, context?: DebugContext): void {
    if (this.#shouldLog('info')) {
      this.#logWithSeparator('info', message, context)
    }
  }

  debug(message: string, context?: DebugContext): void {
    if (this.#shouldLog('debug')) {
      this.#logWithSeparator('debug', message, context)
    }
  }

  trace(message: string, context?: DebugContext): void {
    if (this.#shouldLog('trace')) {
      this.#logWithSeparator('trace', message, context)
    }
  }

  /** Create a performance tracker for an operation. */
  trackOperation<Type>(
    operation: string,
    fn: () => Type | Promise<Type>,
    context?: Omit<DebugContext, 'operation' | 'startTime'>
  ): Type | Promise<Type> {
    const startTime = Date.now()
    const operationContext: DebugContext = {
      ...context,
      operation,
      startTime,
    }

    this.debug(`Starting operation`, operationContext)

    try {
      const result = fn()

      if (result instanceof Promise) {
        return result
          .then((value) => {
            this.debug(`Operation completed successfully`, {
              ...operationContext,
              data: { result: 'success' },
            })
            return value
          })
          .catch((error) => {
            this.error(`Operation failed`, {
              ...operationContext,
              data: { error: error.message },
            })
            throw error
          })
      } else {
        this.debug(`Operation completed successfully`, {
          ...operationContext,
          data: { result: 'success' },
        })
        return result
      }
    } catch (error) {
      this.error(`Operation failed`, {
        ...operationContext,
        data: { error: (error as Error).message },
      })
      throw error
    }
  }

  /** Create a performance tracker for async operations. */
  async trackAsyncOperation<Type>(
    operation: string,
    fn: () => Promise<Type>,
    context?: Omit<DebugContext, 'operation' | 'startTime'>
  ): Promise<Type> {
    const startTime = Date.now()
    const operationContext: DebugContext = {
      ...context,
      operation,
      startTime,
    }

    this.debug(`Starting async operation`, operationContext)

    try {
      const result = await fn()
      this.debug(`Async operation completed successfully`, {
        ...operationContext,
        data: { result: 'success' },
      })
      return result
    } catch (error) {
      this.error(`Async operation failed`, {
        ...operationContext,
        data: { error: (error as Error).message },
      })
      throw error
    }
  }

  /** Log WebSocket client events for debugging connection issues. */
  logWebSocketClientEvent(event: string, data?: object): void {
    this.debug(`WebSocket ${event}`, {
      operation: 'websocket-client',
      data: { event, ...data },
    })
  }

  /** Log type resolution events for debugging timeout issues. */
  logTypeResolution(
    filePath: string,
    position: number,
    kind: string,
    duration?: number
  ): void {
    this.debug(`Type resolution`, {
      operation: 'type-resolution',
      data: { filePath, position, kind, duration },
    })
  }

  /** Log cache operations for debugging performance. */
  logCacheOperation(
    operation: 'hit' | 'miss' | 'set' | 'clear',
    key: string,
    data?: object
  ): void {
    this.debug(`Cache ${operation}`, {
      operation: 'cache',
      data: { operation, key, ...data },
    })
  }
}

export const debug = new DebugLogger()
