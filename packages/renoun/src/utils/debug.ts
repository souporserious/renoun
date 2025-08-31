import { getRootDirectory } from './get-root-directory.js'

export type DebugLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace'

export interface DebugContext {
  /** The current operation being performed. */
  operation?: string

  /** Additional context data. */
  data?: Record<string, unknown>

  /** Start time for performance measurement. */
  startTime?: number
}

/** Limits used for truncation and shaping of logged data. */
interface TruncationLimits {
  maxStringLength: number
  maxObjectDepth: number
  maxArrayItems: number
  maxObjectKeys: number
}

/** Maximum length of pretty-printed context JSON in logs. */
const MAX_PRINTED_JSON = 16_384 // 16KB

/** Replace absolute workspace roots with a placeholder. */
function trimRootDirectory(input: string): string {
  return input.replaceAll(getRootDirectory(), '')
}

const RE_OSC = /\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g // OSC ... BEL or ST
const RE_DCS = /\x1BP[\s\S]*?\x1B\\/g // DCS ... ST
const RE_APC = /\x1B_[\s\S]*?\x1B\\/g // APC ... ST
const RE_PM = /\x1B\^[\s\S]*?\x1B\\/g // PM  ... ST
const RE_ANSI = /\x1B\[[0-?]*[ -/]*[@-~]/g // ANSI ... C0 control
const RE_CTRL_EXCEPT_NL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g // keep \n (\u000A) and \r (\u000D) optional
const RE_CTRL_C1 = /[\u0080-\u009F]/g
const RE_BIDI = /[\u202A-\u202E\u2066-\u2069\u061C]/g // LRE/RLE/PDF/LRI/RLI/FSI/PDI/ALM
const RE_ZERO_WIDTH = /[\u200B-\u200F\u2060\uFEFF]/g // ZWSP/ZWNJ/ZWJ/LRM/RLM/WORD JOINER/BOM
const RE_INVISIBLE_EXTRA = /[\u00AD\u2028\u2029]/g

/** Strip control and ANSI sequences from a string to prevent log injection. */
function stripControls(
  string: string,
  { keepNewlines = true }: { keepNewlines?: boolean } = {}
): string {
  let out = string
    .replace(RE_OSC, '')
    .replace(RE_DCS, '')
    .replace(RE_APC, '')
    .replace(RE_PM, '')
    .replace(RE_ANSI, '')

  if (keepNewlines) {
    out = out.replace(/\r\n?/g, '\n').replace(RE_CTRL_EXCEPT_NL, ' ')
  } else {
    out = out.replace(/[\u0000-\u001F\u007F]/g, ' ')
  }
  // neutralize invisible/bidi characters that can visually reorder logs
  return out
    .replace(RE_CTRL_C1, '')
    .replace(RE_BIDI, '')
    .replace(RE_ZERO_WIDTH, '')
    .replace(RE_INVISIBLE_EXTRA, '')
}

/** Identify plain object quickly. */
function isPlainObject(value: unknown): boolean {
  return Object.prototype.toString.call(value) === '[object Object]'
}

/** Summarize special data structures to avoid huge or unreadable logs. */
function summarizeSpecialValue(value: unknown): unknown {
  try {
    // Buffers
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
      return `[Buffer length=${(value as Buffer).length}]`
    }

    // ArrayBuffer and typed arrays
    if (value instanceof ArrayBuffer) {
      return `[ArrayBuffer byteLength=${value.byteLength}]`
    }

    if (ArrayBuffer.isView(value)) {
      const typedArray = value as ArrayBufferView & { length?: number }
      const lengthOrBytes =
        typeof typedArray.length === 'number'
          ? typedArray.length
          : typedArray.byteLength
      return `[${typedArray.constructor.name} length=${lengthOrBytes}]`
    }

    // Streams (duck-typed)
    if (value && typeof (value as any).pipe === 'function') {
      return '[Stream]'
    }
    if (
      typeof ReadableStream !== 'undefined' &&
      value instanceof ReadableStream
    ) {
      return '[ReadableStream]'
    }
    if (value && typeof (value as any).getReader === 'function') {
      return '[ReadableStream]'
    }

    // Date, RegExp, URL
    if (value instanceof Date) {
      return value.toISOString()
    }

    if (value instanceof RegExp) {
      return String(value)
    }

    if (value instanceof URL) {
      return String(value)
    }

    // Map and Set — avoid exposing entries/values
    if (value instanceof Map) {
      return `[Map size=${value.size}]`
    }

    if (value instanceof Set) {
      return `[Set size=${value.size}]`
    }

    // Error
    if (value instanceof Error) {
      return {
        __type: value.name || 'Error',
        message: stripControls(value.message || ''),
        stack: value.stack ? stripControls(value.stack) : undefined,
      }
    }
  } catch {
    // If checks throw for exotic proxies, ignore and treat as plain value later.
  }

  return null
}

/** Truncates data values to prevent huge logs while preserving useful information. Handles circulars. */
function truncateData(
  inputData: unknown,
  limits: TruncationLimits,
  currentDepth: number = 0,
  seenObjects: WeakSet<object> = new WeakSet()
): unknown {
  if (currentDepth >= limits.maxObjectDepth) {
    if (Array.isArray(inputData)) {
      return `[Array depth>${limits.maxObjectDepth} length=${(inputData as unknown[]).length}]`
    }
    if (isPlainObject(inputData)) {
      return `[Object depth>${limits.maxObjectDepth}]`
    }
    return '...'
  }

  if (inputData === null || inputData === undefined) {
    return inputData
  }

  const specialSummary = summarizeSpecialValue(inputData)
  if (specialSummary !== null) {
    return specialSummary
  }

  const primitiveType = typeof inputData

  if (primitiveType === 'string') {
    const originalString = inputData as string
    const cleanedString = stripControls(originalString)
    if (cleanedString.length === 0) {
      return summarizeControlOnlyString(originalString)
    }
    if (cleanedString.length <= limits.maxStringLength) {
      return cleanedString
    }
    return `${cleanedString.slice(0, limits.maxStringLength)}... [truncated, ${cleanedString.length} chars total]`
  }

  if (
    primitiveType === 'number' ||
    primitiveType === 'boolean' ||
    primitiveType === 'bigint'
  ) {
    return String(inputData)
  }

  if (primitiveType === 'function') {
    const functionName = (inputData as Function).name
    return `[Function${functionName ? ' ' + functionName : ''}]`
  }

  if (Array.isArray(inputData)) {
    if (seenObjects.has(inputData)) {
      return '[Circular:Array]'
    }
    seenObjects.add(inputData)

    const arrayValue = inputData as unknown[]
    const limitedItems: unknown[] = []

    const sliceEnd = Math.min(arrayValue.length, limits.maxArrayItems)
    for (let index = 0; index < sliceEnd; index += 1) {
      const element = arrayValue[index]
      limitedItems.push(
        truncateData(element, limits, currentDepth + 1, seenObjects)
      )
    }

    if (arrayValue.length > limits.maxArrayItems) {
      limitedItems.push(
        `... [${arrayValue.length - limits.maxArrayItems} more items]`
      )
    }

    return limitedItems
  }

  if (primitiveType === 'object') {
    const objectValue = inputData as Record<string, unknown>

    if (seenObjects.has(objectValue)) {
      return '[Circular:Object]'
    }
    seenObjects.add(objectValue)

    let keyNames: string[]
    try {
      keyNames = Object.keys(objectValue)
    } catch {
      return '[Uninspectable:Object]'
    }
    const truncatedObject = Object.create(null) as Record<string, unknown>

    const limitCount = Math.min(keyNames.length, limits.maxObjectKeys)
    for (let index = 0; index < limitCount; index += 1) {
      const keyName = keyNames[index]
      let propertyValue: unknown

      try {
        propertyValue = objectValue[keyName]
      } catch {
        truncatedObject[keyName] = '[Uninspectable]'
        continue
      }

      const sanitizedValue =
        typeof propertyValue === 'string'
          ? stripControls(propertyValue)
          : propertyValue
      truncatedObject[keyName] = truncateData(
        sanitizedValue,
        limits,
        currentDepth + 1,
        seenObjects
      )
    }

    if (keyNames.length > limits.maxObjectKeys) {
      truncatedObject['__truncated__'] =
        `... [${keyNames.length - limits.maxObjectKeys} more keys]`
    }

    return truncatedObject
  }

  return String(inputData)
}

/** Clamp long messages to avoid massive console output. */
function clampMessage(message: string, maxLength: number = 4096): string {
  const cleaned = trimRootDirectory(stripControls(message))
  if (cleaned.length <= maxLength) {
    return cleaned
  }
  return `${cleaned.slice(0, maxLength)}... [truncated]`
}

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  fgRed: '\x1b[31m',
  fgYellow: '\x1b[33m',
  fgCyan: '\x1b[36m',
  fgMagenta: '\x1b[35m',
  fgGray: '\x1b[90m',
} as const

function supportsAnsiColor(): boolean {
  try {
    if ('NO_COLOR' in process.env) {
      return false
    }
    if (process.env['FORCE_COLOR'] && process.env['FORCE_COLOR'] !== '0') {
      return true
    }
    return Boolean(process.stdout.isTTY)
  } catch {
    return false
  }
}

function colorizeLevel(level: DebugLevel, text: string): string {
  if (!supportsAnsiColor()) {
    return text
  }
  switch (level) {
    case 'error':
      return `${ANSI.bold}${ANSI.fgRed}${text}${ANSI.reset}`
    case 'warn':
      return `${ANSI.bold}${ANSI.fgYellow}${text}${ANSI.reset}`
    case 'info':
      return `${ANSI.bold}${ANSI.fgCyan}${text}${ANSI.reset}`
    case 'debug':
      return `${ANSI.fgMagenta}${text}${ANSI.reset}`
    case 'trace':
      return `${ANSI.fgGray}${text}${ANSI.reset}`
    default:
      return text
  }
}

function isThenable(value: any): value is Promise<unknown> {
  return value && typeof value.then === 'function'
}

/** Summarize control-sequence-only strings for legible placeholders. */
function summarizeControlOnlyString(original: string): string {
  const tags: string[] = []
  try {
    if (/\x1B\[\?25h/.test(original)) {
      tags.push('cursor_show')
    }
    if (/\x1B\[\?25l/.test(original)) {
      tags.push('cursor_hide')
    }
    if (
      /\x1B\[[0-9]+;[0-9]+H/.test(original) ||
      /\x1B\[[0-9]+[ABCD]/.test(original)
    ) {
      tags.push('cursor_move')
    }
    if (/\x1B\[[0-9]*[JK]/.test(original)) {
      tags.push('erase')
    }
    if (/\x1B\[[0-9;]*m/.test(original)) {
      tags.push('color')
    }
    if (/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/.test(original)) {
      tags.push('osc')
    }
    if (/\x1BP[\s\S]*?\x1B\\/.test(original)) {
      tags.push('dcs')
    }
    if (/\x07/.test(original)) {
      tags.push('bell')
    }
    if (/\r/.test(original)) {
      tags.push('carriage_return')
    }
    if (/\n/.test(original)) {
      tags.push('newline')
    }
    if (/\x1B/.test(original) && !tags.includes('esc')) {
      tags.push('esc')
    }
  } catch {
    // If checks throw ignore and treat as plain value below.
  }
  if (tags.length === 0) {
    return '[control]'
  }
  return `[control: ${tags.join(', ')}]`
}

class DebugLogger {
  #isEnabled: boolean
  #level: DebugLevel
  #includeTimestamp: boolean
  #includePerformance: boolean
  #maxStringLength: number
  #maxObjectDepth: number
  #maxArrayItems: number
  #maxObjectKeys: number

  constructor() {
    const envValue = String(process.env['RENOUN_DEBUG'] || '').toLowerCase()
    const validLevels: DebugLevel[] = [
      'error',
      'warn',
      'info',
      'debug',
      'trace',
    ]

    if (!envValue || envValue === 'false' || envValue === '0') {
      this.#isEnabled = false
      this.#level = 'info'
    } else {
      if (envValue === 'true' || envValue === '1') {
        this.#isEnabled = true
        this.#level = 'trace'
      } else if (validLevels.includes(envValue as DebugLevel)) {
        this.#isEnabled = true
        this.#level = envValue as DebugLevel
      } else {
        throw new Error(
          '[renoun] Invalid RENOUN_DEBUG value. Use: true/false/1/0 or error|warn|info|debug|trace.'
        )
      }
    }

    this.#includeTimestamp = false
    this.#includePerformance = true
    this.#maxStringLength = 1000
    this.#maxObjectDepth = 3
    this.#maxArrayItems = 10
    this.#maxObjectKeys = 50
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
    const messageParts: string[] = []

    if (this.#includeTimestamp) {
      messageParts.push(new Date().toISOString())
    }

    const levelBadge = colorizeLevel(level, `[renoun:${level.toUpperCase()}]`)
    messageParts.push(levelBadge)

    if (context?.operation) {
      messageParts.push(`[${context.operation}]`)
    }

    const safeMessage =
      typeof message === 'string'
        ? clampMessage(message).replace(/\n/g, '\n  ')
        : String(message)

    messageParts.push(safeMessage)

    const hasContextData = context?.data && Object.keys(context.data).length > 0

    if (hasContextData) {
      const truncated = truncateData(context!.data, {
        maxStringLength: this.#maxStringLength,
        maxObjectDepth: this.#maxObjectDepth,
        maxArrayItems: this.#maxArrayItems,
        maxObjectKeys: this.#maxObjectKeys,
      })

      // Attach duration if requested, without mutating non-object types
      let dataToPrint: unknown

      if (this.#includePerformance && context?.startTime) {
        const durationMs = performance.now() - context.startTime

        if (isPlainObject(truncated)) {
          dataToPrint = {
            ...(truncated as Record<string, unknown>),
            durationMs: Math.round(durationMs * 1000) / 1000,
          }
        } else {
          dataToPrint = {
            data: truncated,
            durationMs: Math.round(durationMs * 1000) / 1000,
          }
        }
      } else {
        dataToPrint = truncated
      }

      let dataString = JSON.stringify(dataToPrint, null, 2)
        .split('\n')
        .map((line, lineIndex) => {
          if (lineIndex === 0) {
            return line
          }
          return `  ${line}`
        })
        .join('\n')

      dataString = trimRootDirectory(dataString)

      if (dataString.length > MAX_PRINTED_JSON) {
        dataString = dataString.slice(0, MAX_PRINTED_JSON) + '... [truncated]'
      }

      messageParts.push(`\n${stripControls(dataString)}`)
    } else if (this.#includePerformance && context?.startTime) {
      const durationMs = performance.now() - context.startTime
      messageParts.push(`(${Math.round(durationMs * 1000) / 1000}ms)`)
    }

    return messageParts.join(' ')
  }

  #logWithSeparator(
    level: DebugLevel,
    message: string,
    context?: DebugContext
  ): void {
    const formattedMessage = this.#formatMessage(level, message, context)

    if (level === 'error') {
      console.error(formattedMessage)
    } else if (level === 'warn') {
      console.warn(formattedMessage)
    } else {
      console.log(formattedMessage)
    }
  }

  error(message: string, context?: () => DebugContext): void {
    if (this.#shouldLog('error')) {
      const resolvedContext = context ? context() : undefined
      this.#logWithSeparator('error', message, resolvedContext)
    }
  }

  warn(message: string, context?: () => DebugContext): void {
    if (this.#shouldLog('warn')) {
      const resolvedContext = context ? context() : undefined
      this.#logWithSeparator('warn', message, resolvedContext)
    }
  }

  info(message: string, context?: () => DebugContext): void {
    if (this.#shouldLog('info')) {
      const resolvedContext = context ? context() : undefined
      this.#logWithSeparator('info', message, resolvedContext)
    }
  }

  debug(message: string, context?: () => DebugContext): void {
    if (this.#shouldLog('debug')) {
      const resolvedContext = context ? context() : undefined
      this.#logWithSeparator('debug', message, resolvedContext)
    }
  }

  trace(message: string, context?: () => DebugContext): void {
    if (this.#shouldLog('trace')) {
      const resolvedContext = context ? context() : undefined
      this.#logWithSeparator('trace', message, resolvedContext)
    }
  }

  /** Public guard to check if logging is enabled (and optionally for a minimum level). */
  isEnabled(minLevel?: DebugLevel): boolean {
    if (!this.#isEnabled) {
      return false
    }
    if (!minLevel) {
      return true
    }
    return this.#shouldLog(minLevel)
  }

  /** Create a performance tracker for sync or async operations. */
  trackOperation<ResultType>(
    operation: string,
    fn: () => ResultType | Promise<ResultType>,
    context?: Omit<DebugContext, 'operation' | 'startTime'>
  ): ResultType | Promise<ResultType> {
    const startTime = performance.now()
    const operationContext: DebugContext = {
      ...context,
      operation,
      startTime,
    }

    this.debug('Starting operation', () => operationContext)

    try {
      const result = fn()

      if (isThenable(result)) {
        return result
          .then((value) => {
            const durationMs = performance.now() - startTime
            this.debug('Operation completed successfully', () => ({
              ...operationContext,
              data: {
                result: 'success',
                durationMs: Math.round(durationMs * 1000) / 1000,
              },
            }))
            return value
          })
          .catch((caughtError) => {
            const durationMs = performance.now() - startTime
            const errorObject = caughtError as Error
            this.error('Operation failed', () => ({
              ...operationContext,
              data: {
                error: errorObject?.message ?? String(caughtError),
                durationMs: Math.round(durationMs * 1000) / 1000,
              },
            }))
            throw caughtError
          })
      } else {
        const durationMs = performance.now() - startTime
        this.debug('Operation completed successfully', () => ({
          ...operationContext,
          data: {
            result: 'success',
            durationMs: Math.round(durationMs * 1000) / 1000,
          },
        }))
        return result
      }
    } catch (caughtError) {
      const durationMs = performance.now() - startTime
      const errorObject = caughtError as Error
      this.error('Operation failed', () => ({
        ...operationContext,
        data: {
          error: errorObject?.message ?? String(caughtError),
          durationMs: Math.round(durationMs * 1000) / 1000,
        },
      }))
      throw caughtError
    }
  }

  /** Log WebSocket server events for debugging connection issues. */
  logWebSocketServerEvent(event: string, data?: object): void {
    this.debug(event, () => ({
      operation: 'websocket-server',
      data: { event, ...(data as Record<string, unknown> | undefined) },
    }))
  }

  /** Log WebSocket client events for debugging connection issues. */
  logWebSocketClientEvent(event: string, data?: object): void {
    this.debug(event, () => ({
      operation: 'websocket-client',
      data: { event, ...(data as Record<string, unknown> | undefined) },
    }))
  }

  /** Log type resolution events for debugging timeout issues. */
  logTypeResolution(
    filePath: string,
    position: number,
    kind: string,
    duration?: number
  ): void {
    this.debug('Type resolution', () => ({
      operation: 'type-resolution',
      data: { filePath, position, kind, duration },
    }))
  }

  /**
   * Log cache operations for debugging performance.
   * Note: avoid embedding raw secrets in cache keys. Keys should not contain sensitive data.
   */
  logCacheOperation(
    operation: 'hit' | 'miss' | 'set' | 'clear',
    key: string,
    data?: object
  ): void {
    this.debug(`Cache ${operation}`, () => ({
      operation: 'cache',
      data: {
        operation,
        key,
        ...(data as Record<string, unknown> | undefined),
      },
    }))
  }

  /** Log token processing performance for debugging get-tokens operations. */
  logTokenProcessing(
    language: string,
    filePath: string | undefined,
    valueLength: number,
    tokenLines: number,
    totalTokens: number,
    symbolCount: number,
    diagnosticCount: number,
    duration?: number
  ): void {
    this.debug('Token processing completed', () => ({
      operation: 'token-processing',
      data: {
        language,
        filePath,
        valueLength,
        tokenLines,
        totalTokens,
        symbolCount,
        diagnosticCount,
        duration,
        tokensPerLine:
          tokenLines > 0 ? Number((totalTokens / tokenLines).toFixed(2)) : 0,
        processingRate: duration
          ? Number((valueLength / duration).toFixed(2))
          : 0,
        charsPerMs: duration ? Number((valueLength / duration).toFixed(2)) : 0,
        tokensPerMs: duration ? Number((totalTokens / duration).toFixed(2)) : 0,
      },
    }))
  }

  /** Track token processing with detailed performance metrics. */
  trackTokenProcessing<ResultType>(
    language: string,
    filePath: string | undefined,
    valueLength: number,
    fn: () => ResultType | Promise<ResultType>
  ): ResultType | Promise<ResultType> {
    const startTime = performance.now()

    this.debug('Starting token processing', () => ({
      operation: 'token-processing',
      data: { language, filePath, valueLength },
    }))

    try {
      const result = fn()

      if (isThenable(result)) {
        return result
          .then((value) => {
            const durationMs = performance.now() - startTime
            this.debug('Token processing completed successfully', () => ({
              operation: 'token-processing',
              data: {
                durationMs: Math.round(durationMs * 1000) / 1000,
                result: 'success',
              },
            }))
            return value
          })
          .catch((caughtError) => {
            const durationMs = performance.now() - startTime
            const errorObject = caughtError as Error
            this.error('Token processing failed', () => ({
              operation: 'token-processing',
              data: {
                durationMs: Math.round(durationMs * 1000) / 1000,
                error: errorObject?.message ?? String(caughtError),
              },
            }))
            throw caughtError
          })
      } else {
        const durationMs = performance.now() - startTime
        this.debug('Token processing completed successfully', () => ({
          operation: 'token-processing',
          data: {
            durationMs: Math.round(durationMs * 1000) / 1000,
            result: 'success',
          },
        }))
        return result
      }
    } catch (caughtError) {
      const durationMs = performance.now() - startTime
      const errorObject = caughtError as Error
      this.error('Token processing failed', () => ({
        operation: 'token-processing',
        data: {
          durationMs: Math.round(durationMs * 1000) / 1000,
          error: errorObject?.message ?? String(caughtError),
        },
      }))
      throw caughtError
    }
  }
}

export const debug = new DebugLogger()
