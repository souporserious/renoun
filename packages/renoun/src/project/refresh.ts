import type { FileSystemRefreshResult } from 'ts-morph'
import { EventEmitter } from 'node:events'

const REFRESHING_COMPLETED = 'refreshing:completed'
const emitter = new EventEmitter()
let isRefreshingProjects = false

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
    emitter.emit(REFRESHING_COMPLETED)
  }
}

/** Emit an event when all projects have finished refreshing. */
export async function waitForRefreshingProjects() {
  if (!isRefreshingProjects) return

  return new Promise<void>((resolve) => {
    const timeoutId = setTimeout(() => {
      emitter.removeAllListeners(REFRESHING_COMPLETED)
      resolve()
    }, 10000)

    emitter.once(REFRESHING_COMPLETED, () => {
      clearTimeout(timeoutId)
      resolve()
    })
  })
}
