import type { FileSystemRefreshResult } from 'ts-morph'

let isRefreshingProjects = false

/** Active promises that are refreshing projects. */
export const activeRefreshingProjects = new Set<
  Promise<FileSystemRefreshResult>
>()

/** Set of resolver functions to call when refreshing is completed */
const refreshCompletedResolvers = new Set<() => void>()

/** Mark the start of the refreshing process. */
export function startRefreshingProjects() {
  isRefreshingProjects = true
}

/** Mark the completion of the refreshing process and notify all callbacks. */
export function completeRefreshingProjects() {
  if (isRefreshingProjects && activeRefreshingProjects.size === 0) {
    isRefreshingProjects = false
    refreshCompletedResolvers.forEach((callback) => callback())
    refreshCompletedResolvers.clear()
  }
}

/**
 * Wait for all projects to finish refreshing. Returns a promise that resolves
 * when refreshing is complete or after a timeout.
 */
export async function waitForRefreshingProjects(): Promise<void> {
  if (!isRefreshingProjects) {
    return
  }

  return new Promise<void>((resolve) => {
    const timeoutId = setTimeout(() => {
      refreshCompletedResolvers.delete(wrappedResolve)
      resolve()
    }, 10000)

    function wrappedResolve() {
      clearTimeout(timeoutId)
      resolve()
    }

    refreshCompletedResolvers.add(wrappedResolve)
  })
}
