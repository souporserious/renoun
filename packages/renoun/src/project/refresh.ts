import type { FileSystemRefreshResult } from '../utils/ts-morph.ts'

let isRefreshingProjects = false
type Waiter = {
  resolve(value: boolean): void
  timeoutId: ReturnType<typeof setTimeout>
  settled: boolean
}

const refreshWaiters = new Set<Waiter>()

/** Active promises that are refreshing projects. */
export const activeRefreshingProjects = new Set<
  Promise<FileSystemRefreshResult>
>()

/** Mark the start of the refreshing process and emit an event. */
export function startRefreshingProjects() {
  isRefreshingProjects = true
}

/** Mark the completion of the refreshing process and emit an event. */
export function completeRefreshingProjects() {
  if (isRefreshingProjects && activeRefreshingProjects.size === 0) {
    isRefreshingProjects = false
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

/** Emit an event when all projects have finished refreshing. */
export async function waitForRefreshingProjects() {
  if (!isRefreshingProjects) return false

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
