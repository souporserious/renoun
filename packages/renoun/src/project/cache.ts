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
  dependencyRevisionByKey: Map<string, number>
  inflightByNodeKey: Map<string, Promise<unknown>>
  lruNodeKeys: Map<string, true>
  maxEntries: number
}

const projectCacheStateByProject = new WeakMap<Project, ProjectCacheState>()
const PROJECT_CACHE_VERSION_TOKEN = 'project-cache-v0'
const PROJECT_CACHE_NODE_PREFIX = 'project-cache:'
const PROJECT_CACHE_DEP_REVISION_PREFIX = 'r'
const PROJECT_CACHE_REVISION_PRUNE_THRESHOLD = 512
const DEFAULT_PROJECT_CACHE_MAX_ENTRIES = 8_000

function getProjectCacheMaxEntries(): number {
  const configured = process.env['RENOUN_PROJECT_CACHE_MAX_ENTRIES']
  if (!configured) {
    return DEFAULT_PROJECT_CACHE_MAX_ENTRIES
  }

  const parsed = Number.parseInt(configured, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PROJECT_CACHE_MAX_ENTRIES
  }

  return parsed
}

function getProjectCacheState(project: Project): ProjectCacheState {
  const existing = projectCacheStateByProject.get(project)
  if (existing) {
    return existing
  }

  const created: ProjectCacheState = {
    cacheByFilePath: new Map(),
    graph: new ReactiveDependencyGraph(),
    nodeLocationByKey: new Map(),
    dependencyRevisionByKey: new Map(),
    inflightByNodeKey: new Map(),
    lruNodeKeys: new Map(),
    maxEntries: getProjectCacheMaxEntries(),
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

function toDependencyRevisionToken(revision: number): string {
  return `${PROJECT_CACHE_DEP_REVISION_PREFIX}${revision}`
}

function getDependencyRevisionToken(
  state: ProjectCacheState,
  depKey: string
): string {
  return toDependencyRevisionToken(state.dependencyRevisionByKey.get(depKey) ?? 0)
}

function bumpDependencyRevisionToken(state: ProjectCacheState, depKey: string): string {
  const nextRevision = (state.dependencyRevisionByKey.get(depKey) ?? 0) + 1
  state.dependencyRevisionByKey.set(depKey, nextRevision)
  return toDependencyRevisionToken(nextRevision)
}

function touchTrackedDependency(state: ProjectCacheState, depKey: string): void {
  if (!state.graph.hasDependencyReferences(depKey)) {
    state.dependencyRevisionByKey.delete(depKey)
    return
  }

  bumpDependencyRevisionToken(state, depKey)
  state.graph.touchDependency(depKey)
}

function pruneUnreferencedDependencyRevisionTokens(state: ProjectCacheState): void {
  if (state.dependencyRevisionByKey.size < PROJECT_CACHE_REVISION_PRUNE_THRESHOLD) {
    return
  }

  for (const depKey of state.dependencyRevisionByKey.keys()) {
    if (!state.graph.hasDependencyReferences(depKey)) {
      state.dependencyRevisionByKey.delete(depKey)
    }
  }
}

function bumpPathDependencyRevisionTokens(
  state: ProjectCacheState,
  pathKey: string
): void {
  for (const dependencyKey of state.graph.getPathDependencyKeys(pathKey)) {
    bumpDependencyRevisionToken(state, dependencyKey)
  }
}

function toDependencyRecord(
  state: ProjectCacheState,
  dependency: ProjectCacheDependency
): ProjectCacheDependencyRecord {
  switch (dependency.kind) {
    case 'file': {
      const depKey = toFileDependencyKey(dependency.path)
      return { depKey, depVersion: getDependencyRevisionToken(state, depKey) }
    }
    case 'directory': {
      const depKey = toDirectoryDependencyKey(dependency.path)
      return { depKey, depVersion: getDependencyRevisionToken(state, depKey) }
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
      return { depKey, depVersion: getDependencyRevisionToken(state, depKey) }
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
  const cacheDependencyKey = toCacheDependencyKey(filePath, cacheName)
  state.graph.markNodeDirty(nodeKey)
  state.graph.unregisterNode(nodeKey)
  touchTrackedDependency(state, cacheDependencyKey)
  state.lruNodeKeys.delete(nodeKey)
  state.nodeLocationByKey.delete(nodeKey)
  state.inflightByNodeKey.delete(nodeKey)
}

function touchProjectCacheEntry(state: ProjectCacheState, nodeKey: string): void {
  if (state.lruNodeKeys.has(nodeKey)) {
    state.lruNodeKeys.delete(nodeKey)
  }
  state.lruNodeKeys.set(nodeKey, true)
}

function enforceProjectCacheCapacity(state: ProjectCacheState): void {
  while (state.nodeLocationByKey.size > state.maxEntries) {
    const lruNodeKey = state.lruNodeKeys.keys().next().value as
      | string
      | undefined
    if (!lruNodeKey) {
      break
    }

    const nodeLocation = state.nodeLocationByKey.get(lruNodeKey)
    if (!nodeLocation) {
      state.lruNodeKeys.delete(lruNodeKey)
      state.graph.unregisterNode(lruNodeKey)
      state.inflightByNodeKey.delete(lruNodeKey)
      continue
    }

    const fileMap = state.cacheByFilePath.get(nodeLocation.filePath)
    if (fileMap) {
      fileMap.delete(nodeLocation.cacheName)
      if (fileMap.size === 0) {
        state.cacheByFilePath.delete(nodeLocation.filePath)
      }
    }

    invalidateProjectCacheEntry(
      state,
      nodeLocation.filePath,
      nodeLocation.cacheName
    )
  }

  pruneUnreferencedDependencyRevisionTokens(state)
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
      state.lruNodeKeys.delete(nodeKey)
      state.nodeLocationByKey.delete(nodeKey)
      fileMap.delete(nodeLocation.cacheName)
      if (fileMap.size === 0) {
        state.cacheByFilePath.delete(nodeLocation.filePath)
      }

      const cacheDependencyKey = toCacheDependencyKey(
        nodeLocation.filePath,
        nodeLocation.cacheName
      )
      touchTrackedDependency(state, cacheDependencyKey)
      prunedEntries += 1
    }

    if (!foundPendingNode) {
      break
    }
  }

  pruneUnreferencedDependencyRevisionTokens(state)

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
            (dependency) => toDependencyRecord(state, dependency)
          )
        )

  if (
    cachedEntry &&
    !state.graph.isNodeDirty(nodeKey) &&
    (staticDependencies === undefined ||
      areDependencyRecordsEqual(cachedEntry.deps, staticDependencies))
  ) {
    touchProjectCacheEntry(state, nodeKey)
    return cachedEntry.value as Type
  }

  const inFlight = state.inflightByNodeKey.get(nodeKey)
  if (inFlight) {
    return (await inFlight) as Type
  }

  const operation = (async () => {
    const computedValue = await compute()
    const dependencies =
      staticDependencies ??
      normalizeDependencyRecords(
        (typeof dependencySpec === 'function'
          ? dependencySpec(computedValue)
          : [toDefaultDependency(filePath)]
        ).map((dependency) => toDependencyRecord(state, dependency))
      )

    const entry: ProjectCacheEntry = {
      value: computedValue,
      deps: dependencies,
    }
    let liveNamespace = state.cacheByFilePath.get(filePath)
    if (!liveNamespace) {
      liveNamespace = new Map()
      state.cacheByFilePath.set(filePath, liveNamespace)
    }
    liveNamespace.set(cacheName, entry)
    registerProjectCacheEntry(state, filePath, cacheName, entry)
    touchProjectCacheEntry(state, nodeKey)
    enforceProjectCacheCapacity(state)
    return entry.value as Type
  })()

  state.inflightByNodeKey.set(nodeKey, operation as Promise<unknown>)
  try {
    return await operation
  } finally {
    if (state.inflightByNodeKey.get(nodeKey) === operation) {
      state.inflightByNodeKey.delete(nodeKey)
    }
  }
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
      const fileMap = cacheByFilePath.get(normalizedFilePath)
      if (fileMap) {
        for (const cachedCacheName of fileMap.keys()) {
          state.inflightByNodeKey.delete(
            toProjectCacheNodeKey(normalizedFilePath, cachedCacheName)
          )
        }
      }
      bumpPathDependencyRevisionTokens(state, normalizedFilePath)
      state.graph.touchPathDependencies(normalizedFilePath)
      pruneDirtyProjectCacheEntries(state)
    }

    if (cacheName) {
      const cacheDependencyKey = toCacheDependencyKey(
        normalizedFilePath,
        cacheName
      )
      const nodeKey = toProjectCacheNodeKey(normalizedFilePath, cacheName)
      state.inflightByNodeKey.delete(nodeKey)
      const fileMap = cacheByFilePath.get(normalizedFilePath)
      if (!fileMap) {
        state.lruNodeKeys.delete(nodeKey)
        state.nodeLocationByKey.delete(nodeKey)
        touchTrackedDependency(state, cacheDependencyKey)
        pruneDirtyProjectCacheEntries(state)
        return
      }

      if (!fileMap.has(cacheName)) {
        state.lruNodeKeys.delete(nodeKey)
        state.nodeLocationByKey.delete(nodeKey)
        touchTrackedDependency(state, cacheDependencyKey)
        pruneDirtyProjectCacheEntries(state)
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
    state.dependencyRevisionByKey.clear()
    state.inflightByNodeKey.clear()
    state.lruNodeKeys.clear()
    state.graph.clear()
    return
  }

  for (const [cachedFilePath, fileMap] of [...cacheByFilePath.entries()]) {
    if (!fileMap.has(cacheName)) {
      continue
    }

    state.inflightByNodeKey.delete(toProjectCacheNodeKey(cachedFilePath, cacheName))
    invalidateProjectCacheEntry(state, cachedFilePath, cacheName)
    fileMap.delete(cacheName)

    if (fileMap.size === 0) {
      cacheByFilePath.delete(cachedFilePath)
    }
  }

  pruneUnreferencedDependencyRevisionTokens(state)
}

export function __getProjectCacheDependencyVersionForTesting(
  project: Project,
  dependency:
    | { kind: 'file'; path: string }
    | { kind: 'directory'; path: string }
    | { kind: 'cache'; filePath: string; cacheName: string }
): string {
  const state = getProjectCacheState(project)

  switch (dependency.kind) {
    case 'file':
      return getDependencyRevisionToken(state, toFileDependencyKey(dependency.path))
    case 'directory':
      return getDependencyRevisionToken(
        state,
        toDirectoryDependencyKey(dependency.path)
      )
    case 'cache':
      return getDependencyRevisionToken(
        state,
        toCacheDependencyKey(dependency.filePath, dependency.cacheName)
      )
  }
}
