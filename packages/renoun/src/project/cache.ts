import type { Project } from '../utils/ts-morph.ts'

import { waitForRefreshingProjects } from './refresh.ts'

const projectFileCaches = new WeakMap<
  Project,
  Map<string, Map<string, unknown>>
>()

/**
 * Create (or reuse) a lazily-filled, per-file cache for the given project. This is useful
 * for caching expensive computations that are specific to a file in a project.
 */
export async function createProjectFileCache<Type>(
  project: Project,
  fileName: string,
  cacheName: string,
  compute: () => Type
): Promise<Type> {
  await waitForRefreshingProjects()

  let projectEntry = projectFileCaches.get(project)
  if (!projectEntry) {
    projectEntry = new Map()
    projectFileCaches.set(project, projectEntry)
  }

  let namespace = projectEntry.get(fileName) as Map<string, Type> | undefined
  if (!namespace) {
    namespace = new Map()
    projectEntry.set(fileName, namespace)
  }

  const cachedValue = namespace.get(cacheName)

  if (cachedValue !== undefined) {
    return cachedValue
  }

  const value = compute()
  namespace.set(cacheName, value)
  return value
}

/** Invalidates cached project analysis results. */
export function invalidateProjectFileCache(project: Project, filePath?: string): void
export function invalidateProjectFileCache(
  project: Project,
  filePath?: string,
  cacheName?: string
): void
export function invalidateProjectFileCache(
  project: Project,
  filePath?: string,
  cacheName?: string
) {
  const cacheByName = projectFileCaches.get(project)

  if (!cacheByName) return

  // Primary path: file-first API.
  if (cacheName === undefined && filePath !== undefined && !cacheByName.has(filePath)) {
    // Backward compatibility: `invalidateProjectFileCache(project, cacheName)` still
    // clears a namespace across all files.
    // Keep this branch for older callers that pass `(project, cacheName)` directly,
    // but prefer `(project, filePath, cacheName)` when file IDs can be ambiguous.
    invalidateProjectFileCacheByName(project, filePath)
    return
  }

  if (filePath) {
    const fileMap = cacheByName.get(filePath)

    if (!fileMap) return

    if (cacheName) {
      fileMap.delete(cacheName)

      if (fileMap.size === 0) {
        cacheByName.delete(filePath)
      }

      return
    }

    cacheByName.delete(filePath)
    return
  }

  if (!cacheName) {
    cacheByName.clear()
    return
  }

  for (const [cachedFilePath, fileMap] of [...cacheByName.entries()]) {
    fileMap.delete(cacheName)

    if (fileMap.size === 0) {
      cacheByName.delete(cachedFilePath)
    }
  }
}

function invalidateProjectFileCacheByName(
  project: Project,
  cacheName: string
) {
  const cacheByName = projectFileCaches.get(project)

  if (!cacheByName) return

  for (const [cachedFilePath, fileMap] of [...cacheByName.entries()]) {
    fileMap.delete(cacheName)

    if (fileMap.size === 0) {
      cacheByName.delete(cachedFilePath)
    }
  }
}
