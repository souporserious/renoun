import { dirname, resolve } from 'node:path'

import {
  CacheStore,
  type CacheStoreComputeContext,
} from '../file-system/Cache.ts'
import type { FileReadableStream } from '../file-system/FileSystem.ts'
import type { Snapshot } from '../file-system/Snapshot.ts'
import type { DirectoryEntry } from '../file-system/types.ts'
import { collapseInvalidationPaths } from '../utils/collapse-invalidation-paths.ts'
import { PROCESS_ENV_KEYS } from '../utils/env-keys.ts'
import { resolvePositiveIntegerProcessEnv } from '../utils/env.ts'
import {
  isAbsolutePath,
  normalizePathKey,
  normalizeSlashes,
} from '../utils/path.ts'
import { hashString, stableStringify } from '../utils/stable-serialization.ts'
import type { Project } from '../utils/ts-morph.ts'

import { waitForRefreshingProjects } from './refresh.ts'

export type ProjectCacheDependency =
  | { kind: 'file'; path: string }
  | { kind: 'directory'; path: string }
  | { kind: 'const'; name: string; version: string }
  | { kind: 'cache'; filePath: string; cacheName: string }

interface ProjectCacheRuntime {
  snapshot: ProjectCacheSnapshot
  store: CacheStore
  lruNodeKeys: Map<string, true>
  nodeKeysByFilePath: Map<string, Set<string>>
  nodeKeysByPathPrefix: Map<string, Set<string>>
  nodeKeysByCacheName: Map<string, Set<string>>
  nodeIdentityByNodeKey: Map<string, { filePath: string; cacheName: string }>
  maxEntries: number
}

const projectCacheRuntimeByProject = new WeakMap<Project, ProjectCacheRuntime>()
const PROJECT_CACHE_NODE_PREFIX = 'project-cache:'
const PROJECT_CACHE_VERSION = 'project-cache-v1'
const PROJECT_CACHE_VERSION_DEP = 'project-cache-version'
const PROJECT_CACHE_DEPENDENCY_SPEC_PREFIX = 'project-cache:dependency-spec:'
const DEFAULT_PROJECT_CACHE_MAX_ENTRIES = 8_000

let nextProjectCacheSnapshotId = 0

class ProjectCacheSnapshot implements Snapshot {
  readonly id = `project-cache:${(nextProjectCacheSnapshotId += 1)}`

  readonly #revisionByPath = new Map<string, number>()
  readonly #knownContentPaths = new Set<string>()
  readonly #invalidateListeners = new Set<(path: string) => void>()

  readDirectory(_path?: string): Promise<DirectoryEntry[]> {
    throw new Error(
      '[renoun] Project cache snapshots do not support readDirectory'
    )
  }

  readFile(_path: string): Promise<string> {
    throw new Error('[renoun] Project cache snapshots do not support readFile')
  }

  readFileBinary(_path: string): Promise<Uint8Array> {
    throw new Error(
      '[renoun] Project cache snapshots do not support readFileBinary'
    )
  }

  readFileStream(_path: string): FileReadableStream {
    throw new Error(
      '[renoun] Project cache snapshots do not support readFileStream'
    )
  }

  fileExists(_path: string): Promise<boolean> {
    throw new Error(
      '[renoun] Project cache snapshots do not support fileExists'
    )
  }

  getFileLastModifiedMs(_path: string): Promise<number | undefined> {
    throw new Error(
      '[renoun] Project cache snapshots do not support getFileLastModifiedMs'
    )
  }

  getFileByteLength(_path: string): Promise<number | undefined> {
    throw new Error(
      '[renoun] Project cache snapshots do not support getFileByteLength'
    )
  }

  isFilePathGitIgnored(_path: string): boolean {
    return false
  }

  isFilePathExcludedFromTsConfigAsync(
    _path: string,
    _isDirectory?: boolean
  ): Promise<boolean> {
    return Promise.resolve(false)
  }

  getRelativePathToWorkspace(path: string): string {
    return normalizeProjectPath(path)
  }

  async contentId(path: string): Promise<string> {
    const normalizedPath = normalizeProjectPath(path)
    this.#knownContentPaths.add(normalizedPath)
    return `r${this.#revisionByPath.get(normalizedPath) ?? 0}`
  }

  invalidatePath(path: string): void {
    this.invalidatePaths([path])
  }

  invalidatePaths(paths: Iterable<string>): void {
    const inputPathByNormalizedPath = new Map<string, string>()
    for (const path of paths) {
      if (typeof path !== 'string' || path.length === 0) {
        continue
      }

      const normalizedPath = normalizeProjectPath(path)
      if (!inputPathByNormalizedPath.has(normalizedPath)) {
        inputPathByNormalizedPath.set(normalizedPath, path)
      }
    }

    const normalizedPaths = collapseInvalidationPaths(
      inputPathByNormalizedPath.keys()
    )
    if (normalizedPaths.length === 0) {
      return
    }

    if (normalizedPaths.includes('.')) {
      this.#revisionByPath.clear()
      this.#knownContentPaths.clear()
      this.#emitInvalidate(inputPathByNormalizedPath.get('.') ?? '.')
      return
    }

    const knownContentPaths = Array.from(this.#knownContentPaths)
    const pathsToBump = new Set<string>()

    for (const normalizedPath of normalizedPaths) {
      pathsToBump.add(normalizedPath)

      for (const knownContentPath of knownContentPaths) {
        if (
          knownContentPath === normalizedPath ||
          knownContentPath.startsWith(`${normalizedPath}/`)
        ) {
          pathsToBump.add(knownContentPath)
        }
      }

      let currentDirectory = dirname(normalizedPath)
      while (
        currentDirectory &&
        currentDirectory !== '.' &&
        currentDirectory !== '/' &&
        currentDirectory !== normalizedPath
      ) {
        pathsToBump.add(currentDirectory)
        currentDirectory = dirname(currentDirectory)
      }
    }

    for (const pathToBump of pathsToBump) {
      this.#bumpPathRevision(pathToBump)
    }

    for (const normalizedPath of normalizedPaths) {
      this.#emitInvalidate(
        inputPathByNormalizedPath.get(normalizedPath) ?? normalizedPath
      )
    }
  }

  invalidateAll(): void {
    this.#revisionByPath.clear()
    this.#knownContentPaths.clear()
    this.#emitInvalidate('.')
  }

  onInvalidate(listener: (path: string) => void): () => void {
    this.#invalidateListeners.add(listener)
    return () => {
      this.#invalidateListeners.delete(listener)
    }
  }

  #bumpPathRevision(path: string): void {
    this.#revisionByPath.set(path, (this.#revisionByPath.get(path) ?? 0) + 1)
  }

  #emitInvalidate(path: string): void {
    for (const listener of this.#invalidateListeners) {
      listener(path)
    }
  }
}

function getProjectCacheMaxEntries(): number {
  return resolvePositiveIntegerProcessEnv(
    PROCESS_ENV_KEYS.renounProjectCacheMaxEntries,
    DEFAULT_PROJECT_CACHE_MAX_ENTRIES
  )
}

function getProjectCacheRuntime(project: Project): ProjectCacheRuntime {
  const existing = projectCacheRuntimeByProject.get(project)
  if (existing) {
    return existing
  }

  const snapshot = new ProjectCacheSnapshot()
  const created: ProjectCacheRuntime = {
    snapshot,
    store: new CacheStore({
      snapshot,
    }),
    lruNodeKeys: new Map(),
    nodeKeysByFilePath: new Map(),
    nodeKeysByPathPrefix: new Map(),
    nodeKeysByCacheName: new Map(),
    nodeIdentityByNodeKey: new Map(),
    maxEntries: getProjectCacheMaxEntries(),
  }

  projectCacheRuntimeByProject.set(project, created)
  return created
}

function normalizeProjectPath(path: string): string {
  const normalizedPath = normalizeSlashes(path)
  const normalizedPathKey = normalizePathKey(normalizedPath)

  if (normalizedPathKey === '.') {
    return '.'
  }

  const comparablePath = isAbsolutePath(normalizedPath)
    ? normalizedPath
    : resolve(normalizedPathKey)

  return normalizePathKey(normalizeSlashes(comparablePath))
}

function toProjectCacheNodeKey(filePath: string, cacheName: string): string {
  return `${PROJECT_CACHE_NODE_PREFIX}${normalizeProjectPath(filePath)}:${cacheName}`
}

function toDefaultDependency(filePath: string): ProjectCacheDependency {
  return {
    kind: 'file',
    path: filePath,
  }
}

function normalizeProjectDependency(
  dependency: ProjectCacheDependency
): ProjectCacheDependency {
  switch (dependency.kind) {
    case 'file':
      return {
        kind: 'file',
        path: normalizeProjectPath(dependency.path),
      }
    case 'directory':
      return {
        kind: 'directory',
        path: normalizeProjectPath(dependency.path),
      }
    case 'const':
      return {
        kind: 'const',
        name: dependency.name,
        version: dependency.version,
      }
    case 'cache':
      return {
        kind: 'cache',
        filePath: normalizeProjectPath(dependency.filePath),
        cacheName: dependency.cacheName,
      }
  }
}

function normalizeProjectDependencies(
  dependencies: ProjectCacheDependency[]
): ProjectCacheDependency[] {
  return dependencies.map(normalizeProjectDependency)
}

function toProjectDependencySignature(
  dependencies: ProjectCacheDependency[]
): string {
  const normalizedDependencies = normalizeProjectDependencies(dependencies)
  const sortable = normalizedDependencies.map((dependency) => {
    switch (dependency.kind) {
      case 'file':
        return `file:${dependency.path}`
      case 'directory':
        return `directory:${dependency.path}`
      case 'const':
        return `const:${dependency.name}:${dependency.version}`
      case 'cache':
        return `cache:${dependency.filePath}:${dependency.cacheName}`
    }
  })

  sortable.sort()

  return hashString(stableStringify(sortable))
}

function addToSetMap(
  map: Map<string, Set<string>>,
  key: string,
  value: string
): void {
  let entries = map.get(key)
  if (!entries) {
    entries = new Set<string>()
    map.set(key, entries)
  }

  entries.add(value)
}

function deleteFromSetMap(
  map: Map<string, Set<string>>,
  key: string,
  value: string
): void {
  const entries = map.get(key)
  if (!entries) {
    return
  }

  entries.delete(value)
  if (entries.size === 0) {
    map.delete(key)
  }
}

function getProjectPathPrefixes(path: string): string[] {
  if (path === '.') {
    return ['.']
  }

  const segments = path.split('/').filter((segment) => segment.length > 0)
  if (segments.length === 0) {
    return ['.']
  }

  const prefixes: string[] = []
  let current = ''
  for (const segment of segments) {
    current = current.length > 0 ? `${current}/${segment}` : segment
    prefixes.push(current)
  }

  return prefixes
}

function touchProjectCacheEntry(
  runtime: ProjectCacheRuntime,
  nodeKey: string,
  identity: {
    filePath: string
    cacheName: string
  }
): void {
  const existingIdentity = runtime.nodeIdentityByNodeKey.get(nodeKey)
  if (
    existingIdentity &&
    (existingIdentity.filePath !== identity.filePath ||
      existingIdentity.cacheName !== identity.cacheName)
  ) {
    deleteFromSetMap(
      runtime.nodeKeysByFilePath,
      existingIdentity.filePath,
      nodeKey
    )
    for (const prefix of getProjectPathPrefixes(existingIdentity.filePath)) {
      deleteFromSetMap(runtime.nodeKeysByPathPrefix, prefix, nodeKey)
    }
    deleteFromSetMap(
      runtime.nodeKeysByCacheName,
      existingIdentity.cacheName,
      nodeKey
    )
  }

  runtime.nodeIdentityByNodeKey.set(nodeKey, identity)
  addToSetMap(runtime.nodeKeysByFilePath, identity.filePath, nodeKey)
  for (const prefix of getProjectPathPrefixes(identity.filePath)) {
    addToSetMap(runtime.nodeKeysByPathPrefix, prefix, nodeKey)
  }
  addToSetMap(runtime.nodeKeysByCacheName, identity.cacheName, nodeKey)

  if (runtime.lruNodeKeys.has(nodeKey)) {
    runtime.lruNodeKeys.delete(nodeKey)
  }
  runtime.lruNodeKeys.set(nodeKey, true)
}

function removeProjectCacheEntry(
  runtime: ProjectCacheRuntime,
  nodeKey: string
): void {
  runtime.lruNodeKeys.delete(nodeKey)

  const identity = runtime.nodeIdentityByNodeKey.get(nodeKey)
  if (!identity) {
    return
  }

  runtime.nodeIdentityByNodeKey.delete(nodeKey)
  deleteFromSetMap(runtime.nodeKeysByFilePath, identity.filePath, nodeKey)
  for (const prefix of getProjectPathPrefixes(identity.filePath)) {
    deleteFromSetMap(runtime.nodeKeysByPathPrefix, prefix, nodeKey)
  }
  deleteFromSetMap(runtime.nodeKeysByCacheName, identity.cacheName, nodeKey)
}

async function enforceProjectCacheCapacity(
  runtime: ProjectCacheRuntime
): Promise<void> {
  while (runtime.lruNodeKeys.size > runtime.maxEntries) {
    const lruNodeKey = runtime.lruNodeKeys.keys().next().value as
      | string
      | undefined
    if (!lruNodeKey) {
      return
    }

    removeProjectCacheEntry(runtime, lruNodeKey)
    await runtime.store.delete(lruNodeKey)
  }
}

async function recordProjectDependencies(
  context: CacheStoreComputeContext,
  dependencies: readonly ProjectCacheDependency[]
): Promise<void> {
  for (const dependency of dependencies) {
    switch (dependency.kind) {
      case 'file':
        await context.recordFileDep(dependency.path)
        break
      case 'directory':
        await context.recordDirectoryDep(dependency.path)
        break
      case 'const':
        context.recordConstDep(dependency.name, dependency.version)
        break
      case 'cache':
        await context.recordNodeDep(
          toProjectCacheNodeKey(dependency.filePath, dependency.cacheName)
        )
        break
    }
  }
}

function toProjectConstDeps(
  dependencies: readonly ProjectCacheDependency[]
): Array<{ name: string; version: string }> {
  const constDeps: Array<{ name: string; version: string }> = [
    {
      name: PROJECT_CACHE_VERSION_DEP,
      version: PROJECT_CACHE_VERSION,
    },
  ]

  for (const dependency of dependencies) {
    if (dependency.kind !== 'const') {
      continue
    }

    constDeps.push({
      name: dependency.name,
      version: dependency.version,
    })
  }

  return constDeps
}

function toProjectDependencySpecConstDep(
  nodeKey: string,
  dependencySpecVersion: string
): { name: string; version: string } {
  return {
    name: `${PROJECT_CACHE_DEPENDENCY_SPEC_PREFIX}${nodeKey}`,
    version: dependencySpecVersion,
  }
}

function removeProjectCacheEntriesByFilePath(
  runtime: ProjectCacheRuntime,
  filePath: string
): void {
  const nodeKeys = runtime.nodeKeysByPathPrefix.get(filePath)
  if (!nodeKeys || nodeKeys.size === 0) {
    return
  }

  const nodeKeysToDelete = Array.from(nodeKeys)
  for (const nodeKey of nodeKeysToDelete) {
    removeProjectCacheEntry(runtime, nodeKey)
  }

  if (nodeKeysToDelete.length > 0) {
    void runtime.store.deleteMany(nodeKeysToDelete)
  }
}

function removeProjectCacheEntriesByCacheName(
  runtime: ProjectCacheRuntime,
  cacheName: string
): void {
  const nodeKeys = runtime.nodeKeysByCacheName.get(cacheName)
  if (!nodeKeys || nodeKeys.size === 0) {
    return
  }

  const nodeKeysToDelete = Array.from(nodeKeys)
  for (const nodeKey of nodeKeysToDelete) {
    removeProjectCacheEntry(runtime, nodeKey)
  }

  if (nodeKeysToDelete.length > 0) {
    void runtime.store.deleteMany(nodeKeysToDelete)
  }
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

  const runtime = getProjectCacheRuntime(project)
  const filePath = normalizeProjectPath(fileName)
  const nodeKey = toProjectCacheNodeKey(filePath, cacheName)

  const dependencySpec = options?.deps
  const staticDependencies =
    typeof dependencySpec === 'function'
      ? undefined
      : normalizeProjectDependencies(
          dependencySpec ?? [toDefaultDependency(filePath)]
        )
  const dependencySpecVersion = staticDependencies
    ? `static:${toProjectDependencySignature(staticDependencies)}`
    : 'dynamic'
  const dependencySpecConstDep = toProjectDependencySpecConstDep(
    nodeKey,
    dependencySpecVersion
  )
  const constDeps = staticDependencies
    ? toProjectConstDeps(staticDependencies)
    : [
        {
          name: PROJECT_CACHE_VERSION_DEP,
          version: PROJECT_CACHE_VERSION,
        },
      ]
  constDeps.push(dependencySpecConstDep)

  const value = await runtime.store.getOrCompute<Type>(
    nodeKey,
    {
      persist: false,
      constDeps,
    },
    async (context) => {
      context.recordConstDep(PROJECT_CACHE_VERSION_DEP, PROJECT_CACHE_VERSION)
      context.recordConstDep(
        dependencySpecConstDep.name,
        dependencySpecConstDep.version
      )

      const computedValue = await compute()
      const dependencies =
        staticDependencies ??
        normalizeProjectDependencies(
          typeof dependencySpec === 'function'
            ? dependencySpec(computedValue)
            : [toDefaultDependency(filePath)]
        )

      await recordProjectDependencies(context, dependencies)
      return computedValue
    }
  )

  touchProjectCacheEntry(runtime, nodeKey, {
    filePath,
    cacheName,
  })
  await enforceProjectCacheCapacity(runtime)

  return value
}

/** Invalidates cached project analysis results. */
export function invalidateProjectFileCache(
  project: Project,
  filePath?: string
): void
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
  const runtime = projectCacheRuntimeByProject.get(project)
  if (!runtime) {
    return
  }

  const normalizedFilePath = filePath
    ? normalizeProjectPath(filePath)
    : undefined

  if (normalizedFilePath && !cacheName) {
    // Preserve the caller path here, invalidateProjectCacheRuntimePaths normalizes once.
    invalidateProjectCacheRuntimePaths(runtime, [filePath!])
    return
  }

  if (normalizedFilePath && cacheName) {
    const nodeKey = toProjectCacheNodeKey(normalizedFilePath, cacheName)
    removeProjectCacheEntry(runtime, nodeKey)
    void runtime.store.delete(nodeKey)
    return
  }

  if (!normalizedFilePath && cacheName) {
    removeProjectCacheEntriesByCacheName(runtime, cacheName)
    return
  }

  runtime.snapshot.invalidateAll()
  projectCacheRuntimeByProject.delete(project)
}

export function invalidateProjectFileCachePaths(
  project: Project,
  paths: Iterable<string>
): void {
  const runtime = projectCacheRuntimeByProject.get(project)
  if (!runtime) {
    return
  }

  invalidateProjectCacheRuntimePaths(runtime, paths)
}

function invalidateProjectCacheRuntimePaths(
  runtime: ProjectCacheRuntime,
  paths: Iterable<string>
): void {
  const normalizedPaths = collapseInvalidationPaths(
    Array.from(paths).map(normalizeProjectPath)
  )
  if (normalizedPaths.length === 0) {
    return
  }

  for (const normalizedPath of normalizedPaths) {
    removeProjectCacheEntriesByFilePath(runtime, normalizedPath)
  }

  if (typeof runtime.snapshot.invalidatePaths === 'function') {
    runtime.snapshot.invalidatePaths(normalizedPaths)
    return
  }

  for (const normalizedPath of normalizedPaths) {
    runtime.snapshot.invalidatePath(normalizedPath)
  }
}
