import { readPublicError } from './public-error.ts'

interface RenounErrorOptions {
  cause?: unknown
}

export class RenounAbortError extends Error {
  constructor(message = 'Operation aborted', options: RenounErrorOptions = {}) {
    super(message, { cause: options.cause })
    this.name = 'RenounAbortError'
  }
}

export class RenounTimeoutError extends Error {
  readonly timeoutMs?: number

  constructor(
    message = 'Operation timed out',
    options: RenounErrorOptions & { timeoutMs?: number } = {}
  ) {
    super(message, { cause: options.cause })
    this.name = 'RenounTimeoutError'
    this.timeoutMs = options.timeoutMs
  }
}

export class RenounNetworkError extends Error {
  readonly status?: number
  readonly url?: string
  readonly method?: string
  readonly retryable?: boolean

  constructor(
    message = 'Network operation failed',
    options: RenounErrorOptions & {
      status?: number
      url?: string
      method?: string
      retryable?: boolean
    } = {}
  ) {
    super(message, { cause: options.cause })
    this.name = 'RenounNetworkError'
    this.status = options.status
    this.url = options.url
    this.method = options.method
    this.retryable = options.retryable
  }
}

export class RenounCacheError extends Error {
  readonly key?: string

  constructor(
    message = 'Cache operation failed',
    options: RenounErrorOptions & { key?: string } = {}
  ) {
    super(message, { cause: options.cause })
    this.name = 'RenounCacheError'
    this.key = options.key
  }
}

const RETRYABLE_NETWORK_TYPE_ERROR_MESSAGE_MARKERS = [
  'fetch',
  'network',
  'socket',
  'timeout',
  'timed out',
  'econn',
  'enotfound',
  'eai_again',
  'connection',
  'tls',
]

const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
])

function toAbortReason(reason: unknown): string {
  if (typeof reason === 'string' && reason.length > 0) {
    return reason
  }
  if (reason instanceof Error && reason.message.length > 0) {
    return reason.message
  }
  return 'Operation aborted'
}

export function createAbortError(reason?: unknown): Error {
  if (reason instanceof Error && reason.name === 'AbortError') {
    return reason
  }
  if (reason instanceof RenounAbortError) {
    return reason
  }
  const message = toAbortReason(reason)
  if (typeof DOMException !== 'undefined') {
    return new DOMException(message, 'AbortError')
  }
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

export function isAbortError(error: unknown): boolean {
  if (!error) {
    return false
  }
  if (error instanceof RenounAbortError) {
    return true
  }
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError'
  }
  if (error instanceof Error) {
    return error.name === 'AbortError'
  }
  if (typeof error === 'object' && 'name' in error) {
    return (error as { name?: unknown }).name === 'AbortError'
  }
  return false
}

export function isRetryableNetworkTypeError(error: unknown): boolean {
  if (!(error instanceof TypeError)) {
    return false
  }

  const message = error.message.toLowerCase()
  if (
    RETRYABLE_NETWORK_TYPE_ERROR_MESSAGE_MARKERS.some((marker) =>
      message.includes(marker)
    )
  ) {
    return true
  }

  const cause = (error as { cause?: unknown }).cause
  if (!cause || typeof cause !== 'object') {
    return false
  }

  const candidateCause = cause as { code?: unknown; errno?: unknown }
  const causeCode =
    typeof candidateCause.code === 'string'
      ? candidateCause.code.toUpperCase()
      : typeof candidateCause.errno === 'string'
        ? candidateCause.errno.toUpperCase()
        : undefined

  if (!causeCode) {
    return false
  }

  return RETRYABLE_NETWORK_ERROR_CODES.has(causeCode)
}

export function toPublicError(error: unknown): Error {
  if (error instanceof Error) {
    const details = readPublicError(error)
    if (!details) {
      return error
    }

    const wrapped = new Error(details.message, { cause: error })
    wrapped.name = error.name
    return wrapped
  }

  if (typeof error === 'string' && error.length > 0) {
    return new Error(error)
  }

  return new Error('An unexpected Renoun error occurred.')
}
