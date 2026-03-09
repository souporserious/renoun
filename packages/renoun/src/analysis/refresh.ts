import type { FileSystemRefreshResult } from '../utils/ts-morph.ts'

let isRefreshingPrograms = false
type Waiter = {
  resolve(value: boolean): void
  timeoutId: ReturnType<typeof setTimeout>
  settled: boolean
}

const refreshWaiters = new Set<Waiter>()

/** Active promises that are refreshing analysis programs. */
export const activeRefreshingPrograms = new Set<
  Promise<FileSystemRefreshResult>
>()

/** Mark the start of the refreshing process and emit an event. */
export function startRefreshingPrograms() {
  isRefreshingPrograms = true
}

/** Mark the completion of the refreshing process and emit an event. */
export function completeRefreshingPrograms() {
  if (isRefreshingPrograms && activeRefreshingPrograms.size === 0) {
    isRefreshingPrograms = false
    for (const waiter of refreshWaiters) {
      if (waiter.settled) {
        continue
      }

      waiter.settled = true
      clearTimeout(waiter.timeoutId)
      waiter.resolve(true)
    }

    refreshWaiters.clear()
  }
}

/** Emit an event when all programs have finished refreshing. */
export async function waitForRefreshingPrograms() {
  if (!isRefreshingPrograms) return false

  return new Promise<boolean>((resolve) => {
    const waiter: Waiter = {
      settled: false,
      timeoutId: setTimeout(() => {
        if (!waiter.settled) {
          waiter.settled = true
          refreshWaiters.delete(waiter)
          resolve(false)
        }
      }, 10000),
      resolve,
    }

    refreshWaiters.add(waiter)
  })
}
