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
  run<Type>(
    task: () => Promise<Type>,
    options?: { signal?: AbortSignal }
  ): Promise<Type>
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

  const results = new Array<Result>(items.length)
  const state = await runConcurrentWorkers(items, options, 'map', async (item, index) => {
    results[index] = await fn(item, index)
  })

  throwConcurrentWorkerErrors(state, 'mapConcurrent failed')

  return results
}

export async function forEachConcurrent<Type>(
  items: readonly Type[],
  options: ConcurrentMapOptions,
  fn: (item: Type, index: number) => Promise<void> | void
): Promise<void> {
  if (items.length === 0) {
    return
  }

  const state = await runConcurrentWorkers(
    items,
    options,
    'foreach',
    async (item, index) => {
      await fn(item, index)
    }
  )

  throwConcurrentWorkerErrors(state, 'forEachConcurrent failed')
}

interface ConcurrentWorkerState {
  concurrency: number
  stopOnError: boolean
  errors: unknown[]
  firstError: unknown
  nextIndex: number
}

async function runConcurrentWorkers<Type>(
  items: readonly Type[],
  options: ConcurrentMapOptions,
  telemetryName: 'map' | 'foreach',
  fn: (item: Type, index: number) => Promise<void>
): Promise<ConcurrentWorkerState> {
  const state: ConcurrentWorkerState = {
    concurrency: Math.min(
      normalizeConcurrency(options.concurrency),
      items.length
    ),
    stopOnError: options.stopOnError !== false,
    errors: [],
    firstError: undefined,
    nextIndex: 0,
  }
  const signal = options.signal ?? getContext()?.signal

  emitTelemetryEvent({
    name: `renoun.concurrency.${telemetryName}.start`,
    fields: {
      items: items.length,
      concurrency: state.concurrency,
      stopOnError: state.stopOnError,
    },
  })

  const startedAt = Date.now()

  async function worker() {
    while (true) {
      if (state.stopOnError && state.firstError !== undefined) {
        return
      }

      throwIfAborted(signal)

      const currentIndex = state.nextIndex
      if (currentIndex >= items.length) {
        return
      }

      state.nextIndex += 1

      try {
        await fn(items[currentIndex]!, currentIndex)
      } catch (error) {
        if (state.stopOnError) {
          if (state.firstError === undefined) {
            state.firstError = error
          }
          return
        }
        state.errors.push(error)
      }
    }
  }

  await Promise.all(Array.from({ length: state.concurrency }, () => worker()))

  emitTelemetryEvent({
    name: `renoun.concurrency.${telemetryName}.end`,
    fields: {
      items: items.length,
      concurrency: state.concurrency,
      durationMs: Date.now() - startedAt,
      errors: state.errors.length + (state.firstError === undefined ? 0 : 1),
    },
  })

  return state
}

function throwConcurrentWorkerErrors(
  state: ConcurrentWorkerState,
  aggregateMessage: string
): void {
  if (state.firstError !== undefined) {
    throw state.firstError
  }

  if (state.errors.length > 0) {
    throw new AggregateError(state.errors, aggregateMessage)
  }
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
