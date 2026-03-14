import { createAbortError } from './errors.ts'
import { getContext, throwIfAborted } from './operation-context.ts'
import { emitTelemetryEvent } from './telemetry.ts'

interface SemaphoreWaiter {
  enqueuedAt: number
  signal?: AbortSignal
  resolve: (release: () => void) => void
  reject: (error: unknown) => void
  abort?: () => void
}

/** Simple semaphore to gate concurrency. */
export class Semaphore {
  #permits: number
  #queue: SemaphoreWaiter[] = []

  constructor(permits: number) {
    this.#permits = Math.max(1, permits)
  }

  getQueueLength() {
    return this.#queue.length
  }

  #nextRelease(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      this.#permits++
      this.#grantNextQueuedWaiter()
      emitTelemetryEvent({
        name: 'renoun.concurrency.semaphore.release',
        fields: {
          queueLength: this.#queue.length,
          permits: this.#permits,
        },
      })
    }
  }

  #grantNextQueuedWaiter(): void {
    if (this.#permits <= 0) {
      return
    }

    while (this.#queue.length > 0 && this.#permits > 0) {
      const next = this.#queue.shift()
      if (!next) {
        return
      }

      if (next.signal?.aborted) {
        next.abort?.()
        next.reject(createAbortError(next.signal.reason))
        continue
      }

      this.#permits--
      next.abort?.()
      next.abort = undefined
      const waitMs = Date.now() - next.enqueuedAt
      next.resolve(this.#nextRelease())
      emitTelemetryEvent({
        name: 'renoun.concurrency.semaphore.acquire',
        fields: {
          queueLength: this.#queue.length,
          permits: this.#permits,
          waitMs,
        },
      })
      return
    }
  }

  async acquire(options: { signal?: AbortSignal } = {}): Promise<() => void> {
    const signal = options.signal ?? getContext()?.signal
    throwIfAborted(signal)

    if (this.#permits > 0) {
      this.#permits--
      emitTelemetryEvent({
        name: 'renoun.concurrency.semaphore.acquire',
        fields: {
          queueLength: this.#queue.length,
          permits: this.#permits,
          waitMs: 0,
        },
      })
      return this.#nextRelease()
    }

    return new Promise<() => void>((resolve, reject) => {
      const waiter: SemaphoreWaiter = {
        enqueuedAt: Date.now(),
        signal,
        resolve,
        reject,
      }

      if (signal) {
        const onAbort = () => {
          const index = this.#queue.indexOf(waiter)
          if (index >= 0) {
            this.#queue.splice(index, 1)
          }
          reject(createAbortError(signal.reason))
        }

        waiter.abort = () => {
          signal.removeEventListener('abort', onAbort)
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }

      this.#queue.push(waiter)
    })
  }
}
