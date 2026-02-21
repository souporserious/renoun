import { createAbortError } from './errors.ts'
import { getContext, throwIfAborted } from './operation-context.ts'
import { Semaphore } from './Semaphore.ts'
import { emitTelemetryEvent } from './telemetry.ts'

export interface ConcurrentMapOptions {
  concurrency?: number
  signal?: AbortSignal
  stopOnError?: boolean
}

export interface ConcurrentQueue {
  run<Type>(task: () => Promise<Type>, options?: { signal?: AbortSignal }): Promise<Type>
  getQueueLength(): number
  getRunningCount(): number
}

function normalizeConcurrency(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 1
  }
  return Math.max(1, Math.floor(value))
}

export async function raceAbort<Type>(
  promise: Promise<Type>,
  signal?: AbortSignal
): Promise<Type> {
  const effectiveSignal = signal ?? getContext()?.signal
  if (!effectiveSignal) {
    return promise
  }

  throwIfAborted(effectiveSignal)

  return new Promise<Type>((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(createAbortError(effectiveSignal.reason))
    }

    const cleanup = () => {
      effectiveSignal.removeEventListener('abort', onAbort)
    }

    effectiveSignal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error) => {
        cleanup()
        reject(error)
      }
    )
  })
}

export async function mapConcurrent<Type, Result>(
  items: readonly Type[],
  options: ConcurrentMapOptions,
  fn: (item: Type, index: number) => Promise<Result> | Result
): Promise<Result[]> {
  if (items.length === 0) {
    return []
  }

  const concurrency = Math.min(
    normalizeConcurrency(options.concurrency),
    items.length
  )
  const signal = options.signal ?? getContext()?.signal
  const stopOnError = options.stopOnError !== false
  const results = new Array<Result>(items.length)
  const errors: unknown[] = []
  let firstError: unknown
  let nextIndex = 0

  emitTelemetryEvent({
    name: 'renoun.concurrency.map.start',
    fields: {
      items: items.length,
      concurrency,
      stopOnError,
    },
  })

  const startedAt = Date.now()

  async function worker() {
    while (true) {
      if (stopOnError && firstError !== undefined) {
        return
      }

      throwIfAborted(signal)

      const currentIndex = nextIndex
      if (currentIndex >= items.length) {
        return
      }

      nextIndex += 1

      try {
        results[currentIndex] = await fn(items[currentIndex]!, currentIndex)
      } catch (error) {
        if (stopOnError) {
          if (firstError === undefined) {
            firstError = error
          }
          return
        }
        errors.push(error)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  emitTelemetryEvent({
    name: 'renoun.concurrency.map.end',
    fields: {
      items: items.length,
      concurrency,
      durationMs: Date.now() - startedAt,
      errors: errors.length + (firstError === undefined ? 0 : 1),
    },
  })

  if (firstError !== undefined) {
    throw firstError
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, 'mapConcurrent failed')
  }

  return results
}

export async function forEachConcurrent<Type>(
  items: readonly Type[],
  options: ConcurrentMapOptions,
  fn: (item: Type, index: number) => Promise<void> | void
): Promise<void> {
  await mapConcurrent(items, options, fn)
}

export function createConcurrentQueue(concurrency: number): ConcurrentQueue {
  const semaphore = new Semaphore(concurrency)
  let running = 0

  return {
    getQueueLength() {
      return semaphore.getQueueLength()
    },
    getRunningCount() {
      return running
    },
    async run<Type>(
      task: () => Promise<Type>,
      options: { signal?: AbortSignal } = {}
    ): Promise<Type> {
      const release = await semaphore.acquire(options)
      running += 1
      try {
        return await task()
      } finally {
        running -= 1
        release()
      }
    },
  }
}
