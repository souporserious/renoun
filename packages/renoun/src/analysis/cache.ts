import { dirname, resolve } from 'node:path'

import {
  CacheStore,
  type CacheStoreComputeContext,
} from '../file-system/Cache.ts'
import type { FileReadableStream } from '../file-system/FileSystem.ts'
import type { Snapshot } from '../file-system/Snapshot.ts'
import type { DirectoryEntry } from '../file-system/types.ts'
import { collapseInvalidationPaths } from '../utils/collapse-invalidation-paths.ts'
import {
  isAbsolutePath,
  normalizePathKey,
  normalizeSlashes,
} from '../utils/path.ts'
import { hashString, stableStringify } from '../utils/stable-serialization.ts'
import type { Project } from '../utils/ts-morph.ts'

import { waitForRefreshingPrograms } from './refresh.ts'

export type ProgramCacheDependency =
  | { kind: 'file'; path: string }
  | { kind: 'directory'; path: string }
  | { kind: 'const'; name: string; version: string }
  | { kind: 'cache'; filePath: string; cacheName: string }

interface ProgramCacheRuntime {
  snapshot: ProgramCacheSnapshot
  store: CacheStore
  lruNodeKeys: Map<string, true>
  nodeKeysByFilePath: Map<string, Set<string>>
  nodeKeysByPathPrefix: Map<string, Set<string>>
  nodeKeysByCacheName: Map<string, Set<string>>
  nodeIdentityByNodeKey: Map<string, { filePath: string; cacheName: string }>
  maxEntries: number
}

const programCacheRuntimeByProgram = new WeakMap<Project, ProgramCacheRuntime>()
const PROGRAM_CACHE_NODE_PREFIX = 'program-cache:'
const PROGRAM_CACHE_VERSION = 'program-cache-v1'
const PROGRAM_CACHE_VERSION_DEP = 'program-cache-version'
const PROGRAM_CACHE_DEPENDENCY_SPEC_PREFIX = 'program-cache:dependency-spec:'
const DEFAULT_PROGRAM_CACHE_MAX_ENTRIES = 8_000

export interface ProgramCacheRuntimeOptions {
  maxEntries?: number
}

const programCacheRuntimeOptions: ProgramCacheRuntimeOptions = {}

export function configureAnalysisCacheRuntime(
  options: ProgramCacheRuntimeOptions
): void {
  if ('maxEntries' in options) {
    programCacheRuntimeOptions.maxEntries = options.maxEntries
  }
}

export function resetAnalysisCacheRuntimeConfiguration(): void {
  programCacheRuntimeOptions.maxEntries = undefined
}

let nextProgramCacheSnapshotId = 0

class ProgramCacheSnapshot implements Snapshot {
  readonly id = `program-cache:${(nextProgramCacheSnapshotId += 1)}`

  readonly #revisionByPath = new Map<string, number>()
  readonly #knownContentPaths = new Set<string>()
  readonly #invalidateListeners = new Set<(path: string) => void>()

  readDirectory(_path?: string): Promise<DirectoryEntry[]> {
    throw new Error(
      '[renoun] Program cache snapshots do not support readDirectory'
    )
  }

  readFile(_path: string): Promise<string> {
    throw new Error('[renoun] Program cache snapshots do not support readFile')
  }

  readFileBinary(_path: string): Promise<Uint8Array> {
    throw new Error(
      '[renoun] Program cache snapshots do not support readFileBinary'
    )
  }

  readFileStream(_path: string): FileReadableStream {
    throw new Error(
      '[renoun] Program cache snapshots do not support readFileStream'
    )
  }

  fileExists(_path: string): Promise<boolean> {
    throw new Error(
      '[renoun] Program cache snapshots do not support fileExists'
    )
  }

  getFileLastModifiedMs(_path: string): Promise<number | undefined> {
    throw new Error(
      '[renoun] Program cache snapshots do not support getFileLastModifiedMs'
    )
  }

  getFileByteLength(_path: string): Promise<number | undefined> {
    throw new Error(
      '[renoun] Program cache snapshots do not support getFileByteLength'
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
    return normalizeProgramPath(path)
  }

  async contentId(path: string): Promise<string> {
    const normalizedPath = normalizeProgramPath(path)
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

      const normalizedPath = normalizeProgramPath(path)
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

function getProgramCacheMaxEntries(): number {
  if (
    typeof programCacheRuntimeOptions.maxEntries === 'number' &&
    Number.isFinite(programCacheRuntimeOptions.maxEntries) &&
    programCacheRuntimeOptions.maxEntries > 0
  ) {
    return Math.floor(programCacheRuntimeOptions.maxEntries)
  }

  return DEFAULT_PROGRAM_CACHE_MAX_ENTRIES
}

function getProgramCacheRuntime(project: Project): ProgramCacheRuntime {
  const existing = programCacheRuntimeByProgram.get(project)
  if (existing) {
    existing.maxEntries = getProgramCacheMaxEntries()
    return existing
  }

  const snapshot = new ProgramCacheSnapshot()
  const created: ProgramCacheRuntime = {
    snapshot,
    store: new CacheStore({
      snapshot,
    }),
    lruNodeKeys: new Map(),
    nodeKeysByFilePath: new Map(),
    nodeKeysByPathPrefix: new Map(),
    nodeKeysByCacheName: new Map(),
    nodeIdentityByNodeKey: new Map(),
    maxEntries: getProgramCacheMaxEntries(),
  }

  programCacheRuntimeByProgram.set(project, created)
  return created
}

function normalizeProgramPath(path: string): string {
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

function toProgramCacheNodeKey(filePath: string, cacheName: string): string {
  return `${PROGRAM_CACHE_NODE_PREFIX}${normalizePathKey(normalizeSlashes(filePath))}:${cacheName}`
}

function toDefaultDependency(filePath: string): ProgramCacheDependency {
  return {
    kind: 'file',
    path: filePath,
  }
}

function normalizeProgramDependency(
  dependency: ProgramCacheDependency
): ProgramCacheDependency {
  switch (dependency.kind) {
    case 'file':
      return {
        kind: 'file',
        path: normalizeProgramPath(dependency.path),
      }
    case 'directory':
      return {
        kind: 'directory',
        path: normalizeProgramPath(dependency.path),
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
        filePath: normalizeProgramPath(dependency.filePath),
        cacheName: dependency.cacheName,
      }
  }
}

function normalizeProgramDependencies(
  dependencies: ProgramCacheDependency[]
): ProgramCacheDependency[] {
  return dependencies.map(normalizeProgramDependency)
}

function toProgramDependencySignature(
  dependencies: ProgramCacheDependency[]
): string {
  const normalizedDependencies = normalizeProgramDependencies(dependencies)
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

function getProgramPathPrefixes(path: string): string[] {
  if (path === '.') {
    return ['.']
  }

  const normalizedPath = normalizePathKey(normalizeSlashes(path))
  if (normalizedPath === '.') {
    return ['.']
  }

  const prefixes: string[] = []
  let currentPath = normalizedPath

  while (currentPath && currentPath !== '.' && currentPath !== '/') {
    prefixes.push(currentPath)

    const parentPath = dirname(currentPath)
    if (parentPath === currentPath) {
      break
    }

    currentPath = parentPath
  }

  if (normalizedPath === '/' && prefixes.length === 0) {
    prefixes.push('/')
  }

  prefixes.reverse()
  return prefixes
}

function touchProgramCacheEntry(
  runtime: ProgramCacheRuntime,
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
    for (const prefix of getProgramPathPrefixes(existingIdentity.filePath)) {
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
  for (const prefix of getProgramPathPrefixes(identity.filePath)) {
    addToSetMap(runtime.nodeKeysByPathPrefix, prefix, nodeKey)
  }
  addToSetMap(runtime.nodeKeysByCacheName, identity.cacheName, nodeKey)

  if (runtime.lruNodeKeys.has(nodeKey)) {
    runtime.lruNodeKeys.delete(nodeKey)
  }
  runtime.lruNodeKeys.set(nodeKey, true)
}

function removeProgramCacheEntry(
  runtime: ProgramCacheRuntime,
  nodeKey: string
): void {
  runtime.lruNodeKeys.delete(nodeKey)

  const identity = runtime.nodeIdentityByNodeKey.get(nodeKey)
  if (!identity) {
    return
  }

  runtime.nodeIdentityByNodeKey.delete(nodeKey)
  deleteFromSetMap(runtime.nodeKeysByFilePath, identity.filePath, nodeKey)
  for (const prefix of getProgramPathPrefixes(identity.filePath)) {
    deleteFromSetMap(runtime.nodeKeysByPathPrefix, prefix, nodeKey)
  }
  deleteFromSetMap(runtime.nodeKeysByCacheName, identity.cacheName, nodeKey)
}

async function enforceProgramCacheCapacity(
  runtime: ProgramCacheRuntime
): Promise<void> {
  while (runtime.lruNodeKeys.size > runtime.maxEntries) {
    const lruNodeKey = runtime.lruNodeKeys.keys().next().value as
      | string
      | undefined
    if (!lruNodeKey) {
      return
    }

    removeProgramCacheEntry(runtime, lruNodeKey)
    await runtime.store.delete(lruNodeKey)
  }
}

async function recordProgramDependencies(
  context: CacheStoreComputeContext,
  dependencies: readonly ProgramCacheDependency[]
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
          toProgramCacheNodeKey(dependency.filePath, dependency.cacheName)
        )
        break
    }
  }
}

function toProgramConstDeps(
  dependencies: readonly ProgramCacheDependency[]
): Array<{ name: string; version: string }> {
  const constDeps: Array<{ name: string; version: string }> = [
    {
      name: PROGRAM_CACHE_VERSION_DEP,
      version: PROGRAM_CACHE_VERSION,
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

function toProgramDependencySpecConstDep(
  nodeKey: string,
  dependencySpecVersion: string
): { name: string; version: string } {
  return {
    name: `${PROGRAM_CACHE_DEPENDENCY_SPEC_PREFIX}${nodeKey}`,
    version: dependencySpecVersion,
  }
}

function removeProgramCacheEntriesByFilePath(
  runtime: ProgramCacheRuntime,
  filePath: string
): void {
  const nodeKeysToDelete = new Set<string>()

  for (const nodeKey of runtime.nodeKeysByFilePath.get(filePath) ?? []) {
    nodeKeysToDelete.add(nodeKey)
  }

  for (const nodeKey of runtime.nodeKeysByPathPrefix.get(filePath) ?? []) {
    nodeKeysToDelete.add(nodeKey)
  }

  if (nodeKeysToDelete.size === 0) {
    return
  }

  const nodeKeys = Array.from(nodeKeysToDelete)
  for (const nodeKey of nodeKeys) {
    removeProgramCacheEntry(runtime, nodeKey)
  }

  if (nodeKeys.length > 0) {
    void runtime.store.deleteMany(nodeKeys)
  }
}

function removeProgramCacheEntriesByCacheName(
  runtime: ProgramCacheRuntime,
  cacheName: string
): void {
  const nodeKeys = runtime.nodeKeysByCacheName.get(cacheName)
  if (!nodeKeys || nodeKeys.size === 0) {
    return
  }

  const nodeKeysToDelete = Array.from(nodeKeys)
  for (const nodeKey of nodeKeysToDelete) {
    removeProgramCacheEntry(runtime, nodeKey)
  }

  if (nodeKeysToDelete.length > 0) {
    void runtime.store.deleteMany(nodeKeysToDelete)
  }
}

/**
 * Create (or reuse) a lazily-filled, per-file cache for the given program. This is useful
 * for caching expensive computations that are specific to a file in a project.
 */
export async function createProgramFileCache<Type>(
  project: Project,
  fileName: string,
  cacheName: string,
  compute: () => Type | Promise<Type>,
  options?: {
    deps?:
      | ProgramCacheDependency[]
      | ((value: Type) => ProgramCacheDependency[])
  }
): Promise<Type> {
  await waitForRefreshingPrograms()

  const runtime = getProgramCacheRuntime(project)
  runtime.maxEntries = getProgramCacheMaxEntries()
  const filePath = normalizeProgramPath(fileName)
  const nodeKey = toProgramCacheNodeKey(filePath, cacheName)

  const dependencySpec = options?.deps
  const staticDependencies =
    typeof dependencySpec === 'function'
      ? undefined
      : normalizeProgramDependencies(
          dependencySpec ?? [toDefaultDependency(filePath)]
        )
  const dependencySpecVersion = staticDependencies
    ? `static:${toProgramDependencySignature(staticDependencies)}`
    : 'dynamic'
  const dependencySpecConstDep = toProgramDependencySpecConstDep(
    nodeKey,
    dependencySpecVersion
  )
  const constDeps = staticDependencies
    ? toProgramConstDeps(staticDependencies)
    : [
        {
          name: PROGRAM_CACHE_VERSION_DEP,
          version: PROGRAM_CACHE_VERSION,
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
      context.recordConstDep(PROGRAM_CACHE_VERSION_DEP, PROGRAM_CACHE_VERSION)
      context.recordConstDep(
        dependencySpecConstDep.name,
        dependencySpecConstDep.version
      )

      const computedValue = await compute()
      const dependencies =
        staticDependencies ??
        normalizeProgramDependencies(
          typeof dependencySpec === 'function'
            ? dependencySpec(computedValue)
            : [toDefaultDependency(filePath)]
        )

      await recordProgramDependencies(context, dependencies)
      return computedValue
    }
  )

  touchProgramCacheEntry(runtime, nodeKey, {
    filePath,
    cacheName,
  })
  await enforceProgramCacheCapacity(runtime)

  return value
}

/** Invalidates cached analysis results. */
export function invalidateProgramFileCache(
  project: Project,
  filePath?: string
): void
export function invalidateProgramFileCache(
  project: Project,
  filePath?: string,
  cacheName?: string
): void
export function invalidateProgramFileCache(
  project: Project,
  filePath?: string,
  cacheName?: string
) {
  const runtime = programCacheRuntimeByProgram.get(project)
  if (!runtime) {
    return
  }

  const normalizedFilePath = filePath
    ? normalizeProgramPath(filePath)
    : undefined

  if (normalizedFilePath && !cacheName) {
    // Preserve the caller path here, invalidateProgramCacheRuntimePaths normalizes once.
    invalidateProgramCacheRuntimePaths(runtime, [filePath!])
    return
  }

  if (normalizedFilePath && cacheName) {
    const nodeKey = toProgramCacheNodeKey(normalizedFilePath, cacheName)
    removeProgramCacheEntry(runtime, nodeKey)
    void runtime.store.delete(nodeKey)
    return
  }

  if (!normalizedFilePath && cacheName) {
    removeProgramCacheEntriesByCacheName(runtime, cacheName)
    return
  }

  runtime.snapshot.invalidateAll()
  programCacheRuntimeByProgram.delete(project)
}

export function invalidateProgramFileCachePaths(
  project: Project,
  paths: Iterable<string>
): void {
  const runtime = programCacheRuntimeByProgram.get(project)
  if (!runtime) {
    return
  }

  invalidateProgramCacheRuntimePaths(runtime, paths)
}

function invalidateProgramCacheRuntimePaths(
  runtime: ProgramCacheRuntime,
  paths: Iterable<string>
): void {
  const normalizedPaths = collapseInvalidationPaths(
    Array.from(paths).map(normalizeProgramPath)
  )
  if (normalizedPaths.length === 0) {
    return
  }

  for (const normalizedPath of normalizedPaths) {
    removeProgramCacheEntriesByFilePath(runtime, normalizedPath)
  }

  if (typeof runtime.snapshot.invalidatePaths === 'function') {
    runtime.snapshot.invalidatePaths(normalizedPaths)
    return
  }

  for (const normalizedPath of normalizedPaths) {
    runtime.snapshot.invalidatePath(normalizedPath)
  }
}
