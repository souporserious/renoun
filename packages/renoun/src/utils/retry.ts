import {
  createAbortError,
  RenounNetworkError,
  RenounTimeoutError,
  isAbortError,
  isRetryableNetworkTypeError,
} from './errors.ts'
import { normalizeNonNegativeInteger } from './normalize-number.ts'
import { getContext, throwIfAborted } from './operation-context.ts'
import { emitTelemetryEvent } from './telemetry.ts'

export interface RetryOptions {
  retries?: number
  minDelayMs?: number
  maxDelayMs?: number
  factor?: number
  jitter?: number
  signal?: AbortSignal
  shouldRetry?: (error: unknown, attempt: number) => boolean
  getDelayMs?: (
    error: unknown,
    attempt: number,
    defaultDelayMs: number
  ) => number
  onRetry?: (info: {
    error: unknown
    attempt: number
    nextAttempt: number
    delayMs: number
  }) => void
}

const DEFAULT_RETRIES = 3
const DEFAULT_MIN_DELAY_MS = 50
const DEFAULT_MAX_DELAY_MS = 5_000
const DEFAULT_FACTOR = 2
const DEFAULT_JITTER = 0.2

interface ResolvedRetryOptions {
  retries: number
  minDelayMs: number
  maxDelayMs: number
  factor: number
  jitter: number
  signal?: AbortSignal
  shouldRetry: (error: unknown, attempt: number) => boolean
  getDelayMs: (
    error: unknown,
    attempt: number,
    defaultDelayMs: number
  ) => number
  onRetry: (info: {
    error: unknown
    attempt: number
    nextAttempt: number
    delayMs: number
  }) => void
}

function normalizePositiveNumber(value: number | undefined, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return value
}

function defaultShouldRetry(error: unknown): boolean {
  if (isAbortError(error)) {
    return false
  }

  if (error instanceof RenounTimeoutError) {
    return true
  }

  if (error instanceof RenounNetworkError) {
    if (error.retryable === false) {
      return false
    }
    if (typeof error.status === 'number') {
      return error.status === 429 || error.status >= 500
    }
    return true
  }

  if (error instanceof TypeError) {
    return isRetryableNetworkTypeError(error)
  }

  return false
}

function computeDelayMs(
  attempt: number,
  options: ResolvedRetryOptions
): number {
  const exponential = options.minDelayMs * Math.pow(options.factor, attempt - 1)
  const bounded = Math.min(options.maxDelayMs, exponential)
  const jitterRange = bounded * options.jitter
  const jittered = bounded + (Math.random() * 2 - 1) * jitterRange
  return Math.max(0, Math.round(jittered))
}

function normalizeDelayMs(
  delayMs: number,
  fallback: number,
  maxDelayMs: number
): number {
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    return fallback
  }
  return Math.min(maxDelayMs, Math.max(0, Math.round(delayMs)))
}

async function sleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) {
    return
  }

  if (!signal) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs)
    })
    return
  }

  throwIfAborted(signal)

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, delayMs)

    const onAbort = () => {
      clearTimeout(timer)
      cleanup()
      reject(createAbortError(signal.reason))
    }

    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
    }

    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function retry<Type>(
  fn: (attempt: number) => Promise<Type> | Type,
  options: RetryOptions = {}
): Promise<Type> {
  const resolvedOptions: ResolvedRetryOptions = {
    retries: normalizeNonNegativeInteger(options.retries, DEFAULT_RETRIES),
    minDelayMs: normalizePositiveNumber(
      options.minDelayMs,
      DEFAULT_MIN_DELAY_MS
    ),
    maxDelayMs: normalizePositiveNumber(
      options.maxDelayMs,
      DEFAULT_MAX_DELAY_MS
    ),
    factor: normalizePositiveNumber(options.factor, DEFAULT_FACTOR),
    jitter: Math.max(0, Math.min(1, options.jitter ?? DEFAULT_JITTER)),
    signal: options.signal ?? getContext()?.signal,
    shouldRetry: options.shouldRetry ?? defaultShouldRetry,
    getDelayMs:
      options.getDelayMs ?? ((_, __, defaultDelayMs) => defaultDelayMs),
    onRetry: options.onRetry ?? (() => {}),
  }

  let attempt = 0

  while (true) {
    attempt += 1
    throwIfAborted(resolvedOptions.signal)

    try {
      const value = await fn(attempt)
      if (attempt > 1) {
        emitTelemetryEvent({
          name: 'renoun.retry.success',
          fields: {
            attempt,
          },
        })
      }
      return value
    } catch (error) {
      const shouldRetry =
        attempt <= resolvedOptions.retries &&
        resolvedOptions.shouldRetry(error, attempt)

      if (!shouldRetry) {
        emitTelemetryEvent({
          name: 'renoun.retry.failed',
          fields: {
            attempt,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          },
        })
        throw error
      }

      const computedDelayMs = computeDelayMs(attempt, resolvedOptions)
      const delayMs = normalizeDelayMs(
        resolvedOptions.getDelayMs(error, attempt, computedDelayMs),
        computedDelayMs,
        resolvedOptions.maxDelayMs
      )
      resolvedOptions.onRetry({
        error,
        attempt,
        nextAttempt: attempt + 1,
        delayMs,
      })
      emitTelemetryEvent({
        name: 'renoun.retry.retrying',
        fields: {
          attempt,
          nextAttempt: attempt + 1,
          delayMs,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
      })
      await sleep(delayMs, resolvedOptions.signal)
    }
  }
}
