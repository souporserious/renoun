import { dirname } from 'node:path'

import { CacheStore, type CacheStoreComputeContext } from '../file-system/Cache.ts'
import type { FileReadableStream } from '../file-system/FileSystem.ts'
import type { Snapshot } from '../file-system/Snapshot.ts'
import type { DirectoryEntry } from '../file-system/types.ts'
import { normalizePathKey, normalizeSlashes } from '../utils/path.ts'
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
  nodeLocationByKey: Map<string, { filePath: string; cacheName: string }>
  nodeKeysByFilePath: Map<string, Set<string>>
  lruNodeKeys: Map<string, true>
  staticDependencySignatureByNodeKey: Map<string, string>
  maxEntries: number
}

const projectCacheRuntimeByProject = new WeakMap<Project, ProjectCacheRuntime>()
const PROJECT_CACHE_NODE_PREFIX = 'project-cache:'
const PROJECT_CACHE_VERSION = 'project-cache-v1'
const PROJECT_CACHE_VERSION_DEP = 'project-cache-version'
const DEFAULT_PROJECT_CACHE_MAX_ENTRIES = 8_000

let nextProjectCacheSnapshotId = 0

class ProjectCacheSnapshot implements Snapshot {
  readonly id = `project-cache:${(nextProjectCacheSnapshotId += 1)}`

  readonly #revisionByPath = new Map<string, number>()
  readonly #knownContentPaths = new Set<string>()
  readonly #invalidateListeners = new Set<(path: string) => void>()

  readDirectory(_path?: string): Promise<DirectoryEntry[]> {
    throw new Error('[renoun] Project cache snapshots do not support readDirectory')
  }

  readFile(_path: string): Promise<string> {
    throw new Error('[renoun] Project cache snapshots do not support readFile')
  }

  readFileBinary(_path: string): Promise<Uint8Array> {
    throw new Error('[renoun] Project cache snapshots do not support readFileBinary')
  }

  readFileStream(_path: string): FileReadableStream {
    throw new Error('[renoun] Project cache snapshots do not support readFileStream')
  }

  fileExists(_path: string): Promise<boolean> {
    throw new Error('[renoun] Project cache snapshots do not support fileExists')
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
    const normalizedPath = normalizeProjectPath(path)

    if (normalizedPath === '.') {
      this.#revisionByPath.clear()
      this.#knownContentPaths.clear()
      this.#emitInvalidate(path)
      return
    }

    this.#bumpPathRevision(normalizedPath)

    for (const knownContentPath of this.#knownContentPaths) {
      if (
        knownContentPath === normalizedPath ||
        knownContentPath.startsWith(`${normalizedPath}/`)
      ) {
        this.#bumpPathRevision(knownContentPath)
      }
    }

    let currentDirectory = dirname(normalizedPath)
    while (
      currentDirectory &&
      currentDirectory !== '.' &&
      currentDirectory !== '/' &&
      currentDirectory !== normalizedPath
    ) {
      this.#bumpPathRevision(currentDirectory)
      currentDirectory = dirname(currentDirectory)
    }

    this.#emitInvalidate(path)
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
    nodeLocationByKey: new Map(),
    nodeKeysByFilePath: new Map(),
    lruNodeKeys: new Map(),
    staticDependencySignatureByNodeKey: new Map(),
    maxEntries: getProjectCacheMaxEntries(),
  }

  projectCacheRuntimeByProject.set(project, created)
  return created
}

function normalizeProjectPath(path: string): string {
  const normalizedPath = normalizePathKey(normalizeSlashes(path))
  return normalizedPath.length > 0 ? normalizedPath : '.'
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

function touchProjectCacheEntry(
  runtime: ProjectCacheRuntime,
  nodeKey: string,
  filePath: string,
  cacheName: string
): void {
  if (runtime.lruNodeKeys.has(nodeKey)) {
    runtime.lruNodeKeys.delete(nodeKey)
  }
  runtime.lruNodeKeys.set(nodeKey, true)

  runtime.nodeLocationByKey.set(nodeKey, {
    filePath,
    cacheName,
  })

  let fileNodeKeys = runtime.nodeKeysByFilePath.get(filePath)
  if (!fileNodeKeys) {
    fileNodeKeys = new Set()
    runtime.nodeKeysByFilePath.set(filePath, fileNodeKeys)
  }
  fileNodeKeys.add(nodeKey)
}

function removeProjectCacheEntry(runtime: ProjectCacheRuntime, nodeKey: string): void {
  runtime.lruNodeKeys.delete(nodeKey)
  runtime.staticDependencySignatureByNodeKey.delete(nodeKey)

  const nodeLocation = runtime.nodeLocationByKey.get(nodeKey)
  if (!nodeLocation) {
    return
  }

  runtime.nodeLocationByKey.delete(nodeKey)

  const fileNodeKeys = runtime.nodeKeysByFilePath.get(nodeLocation.filePath)
  if (!fileNodeKeys) {
    return
  }

  fileNodeKeys.delete(nodeKey)
  if (fileNodeKeys.size === 0) {
    runtime.nodeKeysByFilePath.delete(nodeLocation.filePath)
  }
}

async function enforceProjectCacheCapacity(runtime: ProjectCacheRuntime): Promise<void> {
  while (runtime.nodeLocationByKey.size > runtime.maxEntries) {
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
  const staticDependencySignature = staticDependencies
    ? toProjectDependencySignature(staticDependencies)
    : undefined

  const previousStaticSignature = runtime.staticDependencySignatureByNodeKey.get(nodeKey)
  if (staticDependencySignature === undefined) {
    if (previousStaticSignature !== undefined) {
      removeProjectCacheEntry(runtime, nodeKey)
      await runtime.store.delete(nodeKey)
    }
  } else {
    if (
      previousStaticSignature !== undefined &&
      previousStaticSignature !== staticDependencySignature
    ) {
      removeProjectCacheEntry(runtime, nodeKey)
      await runtime.store.delete(nodeKey)
    }
    runtime.staticDependencySignatureByNodeKey.set(nodeKey, staticDependencySignature)
  }

  const value = await runtime.store.getOrCompute<Type>(
    nodeKey,
    {
      persist: false,
      constDeps: staticDependencies
        ? toProjectConstDeps(staticDependencies)
        : [
            {
              name: PROJECT_CACHE_VERSION_DEP,
              version: PROJECT_CACHE_VERSION,
            },
          ],
    },
    async (context) => {
      context.recordConstDep(PROJECT_CACHE_VERSION_DEP, PROJECT_CACHE_VERSION)

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

  touchProjectCacheEntry(runtime, nodeKey, filePath, cacheName)
  await enforceProjectCacheCapacity(runtime)

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
  const runtime = projectCacheRuntimeByProject.get(project)
  if (!runtime) {
    return
  }

  const normalizedFilePath = filePath ? normalizeProjectPath(filePath) : undefined

  if (normalizedFilePath && !cacheName) {
    const directNodeKeys = runtime.nodeKeysByFilePath.get(normalizedFilePath)
    if (directNodeKeys) {
      for (const nodeKey of directNodeKeys) {
        removeProjectCacheEntry(runtime, nodeKey)
        void runtime.store.delete(nodeKey)
      }
    }

    runtime.snapshot.invalidatePath(normalizedFilePath)
    return
  }

  if (normalizedFilePath && cacheName) {
    const nodeKey = toProjectCacheNodeKey(normalizedFilePath, cacheName)
    removeProjectCacheEntry(runtime, nodeKey)
    void runtime.store.delete(nodeKey)
    return
  }

  if (!normalizedFilePath && cacheName) {
    for (const [nodeKey, nodeLocation] of runtime.nodeLocationByKey) {
      if (nodeLocation.cacheName !== cacheName) {
        continue
      }

      removeProjectCacheEntry(runtime, nodeKey)
      void runtime.store.delete(nodeKey)
    }
    return
  }

  runtime.snapshot.invalidateAll()
  projectCacheRuntimeByProject.delete(project)
}
