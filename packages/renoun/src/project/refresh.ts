import type { FileSystemRefreshResult } from 'ts-morph'

let isRefreshingProjects = false

/** Active promises that are refreshing projects. */
export const activeRefreshingProjects = new Set<
  Promise<FileSystemRefreshResult>
>()

/** List of callbacks to invoke when refreshing is completed */
const refreshCompletedCallbacks = new Set<() => void>()

/** Mark the start of the refreshing process. */
export function startRefreshingProjects() {
  isRefreshingProjects = true
}

/** Mark the completion of the refreshing process and notify all callbacks. */
export function completeRefreshingProjects() {
  if (isRefreshingProjects && activeRefreshingProjects.size === 0) {
    isRefreshingProjects = false
    refreshCompletedCallbacks.forEach((callback) => callback())
    refreshCompletedCallbacks.clear()
  }
}

/**
 * Register a callback to be called when all projects have finished refreshing.
 * If the refreshing is already complete, the callback is invoked immediately.
 * Otherwise, it will be called once the refreshing completes or after a timeout.
 */
export function waitForRefreshingProjects(callback: () => void) {
  if (!isRefreshingProjects) {
    callback()
    return
  }

  const timeoutId = setTimeout(() => {
    refreshCompletedCallbacks.delete(wrappedCallback)
    callback()
  }, 10000)

  const wrappedCallback = () => {
    clearTimeout(timeoutId)
    callback()
  }

  refreshCompletedCallbacks.add(wrappedCallback)
}
