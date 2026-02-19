import { normalizePathKey, normalizeSlashes } from '../utils/path.ts'
import type { Project } from '../utils/ts-morph.ts'
import { ReactiveDependencyGraph } from '../utils/reactive-dependency-graph.ts'

import { waitForRefreshingProjects } from './refresh.ts'

export type ProjectCacheDependency =
  | { kind: 'file'; path: string }
  | { kind: 'directory'; path: string }
  | { kind: 'const'; name: string; version: string }
  | { kind: 'cache'; filePath: string; cacheName: string }

interface ProjectCacheEntry {
  value: unknown
  deps: ProjectCacheDependencyRecord[]
}

interface ProjectCacheDependencyRecord {
  depKey: string
  depVersion: string
}

interface ProjectCacheState {
  cacheByFilePath: Map<string, Map<string, ProjectCacheEntry>>
  graph: ReactiveDependencyGraph
  nodeLocationByKey: Map<string, { filePath: string; cacheName: string }>
}

const projectCacheStateByProject = new WeakMap<Project, ProjectCacheState>()
const PROJECT_CACHE_VERSION_TOKEN = 'project-cache-v0'
const PROJECT_CACHE_NODE_PREFIX = 'project-cache:'

function getProjectCacheState(project: Project): ProjectCacheState {
  const existing = projectCacheStateByProject.get(project)
  if (existing) {
    return existing
  }

  const created: ProjectCacheState = {
    cacheByFilePath: new Map(),
    graph: new ReactiveDependencyGraph(),
    nodeLocationByKey: new Map(),
  }
  projectCacheStateByProject.set(project, created)
  return created
}

function normalizeProjectPath(path: string): string {
  return normalizePathKey(normalizeSlashes(path))
}

function toFileDependencyKey(path: string): string {
  return `file:${normalizeProjectPath(path)}`
}

function toDirectoryDependencyKey(path: string): string {
  return `dir:${normalizeProjectPath(path)}`
}

function toCacheDependencyKey(filePath: string, cacheName: string): string {
  return `cache:${normalizeProjectPath(filePath)}:${cacheName}`
}

function toProjectCacheNodeKey(filePath: string, cacheName: string): string {
  return `project-cache:${normalizeProjectPath(filePath)}:${cacheName}`
}

function toDependencyRecord(
  dependency: ProjectCacheDependency
): ProjectCacheDependencyRecord {
  switch (dependency.kind) {
    case 'file': {
      const depKey = toFileDependencyKey(dependency.path)
      return { depKey, depVersion: depKey }
    }
    case 'directory': {
      const depKey = toDirectoryDependencyKey(dependency.path)
      return { depKey, depVersion: depKey }
    }
    case 'const': {
      const depKey = `const:${dependency.name}:${dependency.version}`
      return { depKey, depVersion: dependency.version }
    }
    case 'cache': {
      const depKey = toCacheDependencyKey(
        dependency.filePath,
        dependency.cacheName
      )
      return { depKey, depVersion: depKey }
    }
  }
}

function compareDependencyRecord(
  first: ProjectCacheDependencyRecord,
  second: ProjectCacheDependencyRecord
): number {
  const keyCompare = first.depKey.localeCompare(second.depKey)
  if (keyCompare !== 0) {
    return keyCompare
  }

  return first.depVersion.localeCompare(second.depVersion)
}

function normalizeDependencyRecords(
  dependencies: ProjectCacheDependencyRecord[]
): ProjectCacheDependencyRecord[] {
  return [...dependencies].sort(compareDependencyRecord)
}

function areDependencyRecordsEqual(
  first: ProjectCacheDependencyRecord[],
  second: ProjectCacheDependencyRecord[]
): boolean {
  if (first.length !== second.length) {
    return false
  }

  for (let index = 0; index < first.length; index += 1) {
    if (
      first[index].depKey !== second[index].depKey ||
      first[index].depVersion !== second[index].depVersion
    ) {
      return false
    }
  }

  return true
}

function toDefaultDependency(filePath: string): ProjectCacheDependency {
  return {
    kind: 'file',
    path: filePath,
  }
}

function registerProjectCacheEntry(
  state: ProjectCacheState,
  filePath: string,
  cacheName: string,
  entry: ProjectCacheEntry
): void {
  const nodeKey = toProjectCacheNodeKey(filePath, cacheName)
  for (const dependency of entry.deps) {
    state.graph.setDependencyVersion(dependency.depKey, dependency.depVersion)
  }
  state.graph.registerNode(
    nodeKey,
    entry.deps.map((dependency) => dependency.depKey)
  )
  state.graph.markNodeVersion(nodeKey, PROJECT_CACHE_VERSION_TOKEN)
  state.graph.touchDependency(toCacheDependencyKey(filePath, cacheName))
  state.nodeLocationByKey.set(nodeKey, { filePath, cacheName })
}

function invalidateProjectCacheEntry(
  state: ProjectCacheState,
  filePath: string,
  cacheName: string
): void {
  const nodeKey = toProjectCacheNodeKey(filePath, cacheName)
  state.graph.markNodeDirty(nodeKey)
  state.graph.unregisterNode(nodeKey)
  state.graph.touchDependency(toCacheDependencyKey(filePath, cacheName))
  state.nodeLocationByKey.delete(nodeKey)
}

function pruneDirtyProjectCacheEntries(state: ProjectCacheState): number {
  const visitedNodeKeys = new Set<string>()
  let prunedEntries = 0

  while (true) {
    let foundPendingNode = false
    for (const nodeKey of state.graph.getDirtyNodeKeys(PROJECT_CACHE_NODE_PREFIX)) {
      if (visitedNodeKeys.has(nodeKey)) {
        continue
      }
      foundPendingNode = true
      visitedNodeKeys.add(nodeKey)

      const nodeLocation = state.nodeLocationByKey.get(nodeKey)
      if (!nodeLocation) {
        state.graph.unregisterNode(nodeKey)
        continue
      }

      const fileMap = state.cacheByFilePath.get(nodeLocation.filePath)
      if (!fileMap || !fileMap.has(nodeLocation.cacheName)) {
        state.nodeLocationByKey.delete(nodeKey)
        state.graph.unregisterNode(nodeKey)
        continue
      }

      state.graph.unregisterNode(nodeKey)
      state.nodeLocationByKey.delete(nodeKey)
      fileMap.delete(nodeLocation.cacheName)
      if (fileMap.size === 0) {
        state.cacheByFilePath.delete(nodeLocation.filePath)
      }

      state.graph.touchDependency(
        toCacheDependencyKey(nodeLocation.filePath, nodeLocation.cacheName)
      )
      prunedEntries += 1
    }

    if (!foundPendingNode) {
      break
    }
  }

  return prunedEntries
}

/**
 * Create (or reuse) a lazily-filled, per-file cache for the given project. This is useful
 * for caching expensive computations that are specific to a file in a project.
 */
export async function createProjectFileCache<Type>(
  project: Project,
  fileName: string,
  cacheName: string,
  compute: () => Type | Promise<Type>,
  options?: {
    deps?:
      | ProjectCacheDependency[]
      | ((value: Type) => ProjectCacheDependency[])
  }
): Promise<Type> {
  await waitForRefreshingProjects()

  const state = getProjectCacheState(project)
  const filePath = normalizeProjectPath(fileName)
  let namespace = state.cacheByFilePath.get(filePath)
  if (!namespace) {
    namespace = new Map()
    state.cacheByFilePath.set(filePath, namespace)
  }

  const nodeKey = toProjectCacheNodeKey(filePath, cacheName)
  const cachedEntry = namespace.get(cacheName) as ProjectCacheEntry | undefined
  const dependencySpec = options?.deps
  const staticDependencies =
    typeof dependencySpec === 'function'
      ? undefined
      : normalizeDependencyRecords(
          (dependencySpec ?? [toDefaultDependency(filePath)]).map(
            toDependencyRecord
          )
        )

  if (
    cachedEntry &&
    !state.graph.isNodeDirty(nodeKey) &&
    (staticDependencies === undefined ||
      areDependencyRecordsEqual(cachedEntry.deps, staticDependencies))
  ) {
    return cachedEntry.value as Type
  }

  const computedValue = await compute()
  const dependencies =
    staticDependencies ??
    normalizeDependencyRecords(
      (typeof dependencySpec === 'function'
        ? dependencySpec(computedValue)
        : [toDefaultDependency(filePath)]
      ).map(toDependencyRecord)
    )

  const entry: ProjectCacheEntry = {
    value: computedValue,
    deps: dependencies,
  }
  namespace.set(cacheName, entry)
  registerProjectCacheEntry(state, filePath, cacheName, entry)
  return entry.value as Type
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
  const state = projectCacheStateByProject.get(project)

  if (!state) return

  const cacheByFilePath = state.cacheByFilePath
  const normalizedFilePath = filePath ? normalizeProjectPath(filePath) : undefined

  if (normalizedFilePath) {
    if (!cacheName) {
      state.graph.touchPathDependencies(normalizedFilePath)
      pruneDirtyProjectCacheEntries(state)
    }

    if (cacheName) {
      const fileMap = cacheByFilePath.get(normalizedFilePath)
      if (!fileMap) {
        return
      }

      if (!fileMap.has(cacheName)) {
        return
      }

      invalidateProjectCacheEntry(state, normalizedFilePath, cacheName)
      fileMap.delete(cacheName)

      if (fileMap.size === 0) {
        cacheByFilePath.delete(normalizedFilePath)
      }

      return
    }
    return
  }

  if (!cacheName) {
    for (const [cachedFilePath, fileMap] of cacheByFilePath) {
      for (const cachedCacheName of fileMap.keys()) {
        invalidateProjectCacheEntry(state, cachedFilePath, cachedCacheName)
      }
    }
    cacheByFilePath.clear()
    state.nodeLocationByKey.clear()
    state.graph.clear()
    return
  }

  for (const [cachedFilePath, fileMap] of [...cacheByFilePath.entries()]) {
    if (!fileMap.has(cacheName)) {
      continue
    }

    invalidateProjectCacheEntry(state, cachedFilePath, cacheName)
    fileMap.delete(cacheName)

    if (fileMap.size === 0) {
      cacheByFilePath.delete(cachedFilePath)
    }
  }
}
