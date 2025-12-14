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
export function invalidateProjectFileCache(
  project: Project,
  cacheName?: string,
  filePath?: string
) {
  const cacheByName = projectFileCaches.get(project)

  if (!cacheByName) return

  const cacheNames = cacheName ? [cacheName] : [...cacheByName.keys()]

  for (const name of cacheNames) {
    const fileMap = cacheByName.get(name)

    if (!fileMap) continue

    if (filePath) {
      fileMap.delete(filePath)
    } else {
      fileMap.clear()
    }

    if (fileMap.size === 0) {
      cacheByName.delete(name)
    }
  }
}
