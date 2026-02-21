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
