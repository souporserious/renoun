import { dirname } from 'node:path'

import { getDebugLogger } from '../utils/debug.ts'
import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.ts'
import { getProgram } from '../analysis/get-program.ts'
import { hasServerRuntimeInProcessEnv } from '../analysis/runtime-env.ts'
import type { AnalysisOptions } from '../analysis/types.ts'
import {
  CacheStore,
  type CacheStoreComputeContext,
  type CacheStoreConstDependency,
} from '../file-system/Cache.ts'
import { getCacheStorePersistence } from '../file-system/CacheSqlite.ts'
import type { FileSystem } from '../file-system/FileSystem.ts'
import { createPersistentCacheNodeKey } from '../file-system/cache-key.ts'
import { FileSystemSnapshot } from '../file-system/Snapshot.ts'
import { normalizePathKey } from '../utils/path.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import {
  warmRenounPrewarmTargets,
  type WarmRenounPrewarmTargetsResult,
} from './prewarm/warm-analysis.ts'
import {
  collectRenounPrewarmTargets,
  type DirectoryEntriesRequest,
  type DirectoryStructureRequest,
  type ExportHistoryRequest,
  type FileRequest,
  type RenounPrewarmTargets,
} from './prewarm/collect-targets.ts'

const PREWARM_WORKSPACE_GATE_SCOPE = 'prewarm-workspace-gate'
const PREWARM_WORKSPACE_GATE_VERSION = '5'
const PREWARM_WORKSPACE_GATE_VERSION_DEP = 'prewarm-workspace-gate-version'
const PREWARM_WORKSPACE_TOKEN_DEP = 'prewarm-workspace-token'

interface PrewarmWorkspaceGateRuntimeFileSystem {
  getAbsolutePath(path: string): string
  getWorkspaceChangeToken?(rootPath: string): Promise<string | null>
  getWorkspaceChangedPathsSinceToken?(
    rootPath: string,
    previousToken: string
  ): Promise<readonly string[] | null>
}

interface PrewarmWorkspaceGateStore {
  store: CacheStore
}

interface PrewarmWorkspaceGate {
  store: CacheStore
  fileSystem: FileSystem & PrewarmWorkspaceGateRuntimeFileSystem
  nodeKey: string
  constDeps: CacheStoreConstDependency[]
  workspaceToken: string
  workspaceRootPath: string
  workspaceTokenRootPath: string
}

type PrewarmRunResult = {
  result: 'incremental-warmed' | 'no-targets' | 'skipped' | 'warmed'
  targets: RenounPrewarmTargets
  fileGetDependencyPathsByRequestKey: Record<string, string[]>
}

type CachedPrewarmWorkspaceGateValue = PrewarmRunResult & {
  workspaceRootPath: string
  workspaceTokenRootPath: string
  workspaceToken: string
  updatedAt: number
}

let prewarmWorkspaceGateStoreByKey:
  | Map<string, PrewarmWorkspaceGateStore>
  | undefined

export type {
  DirectoryEntriesRequest,
  DirectoryStructureRequest,
  ExportHistoryRequest,
  FileRequest,
  RenounPrewarmTargets,
}
export { collectRenounPrewarmTargets }

function recordConstDependencies(
  context: CacheStoreComputeContext,
  constDeps: readonly CacheStoreConstDependency[]
): void {
  for (const constDependency of constDeps) {
    context.recordConstDep(constDependency.name, constDependency.version)
  }
}

function getProjectRootFromWorkspaceRoot(
  workspaceRootPath: string
): string | undefined {
  try {
    return getRootDirectory(workspaceRootPath)
  } catch {
    return undefined
  }
}

function getPrewarmWorkspaceGateStore(
  gateKey: string,
  fileSystem: FileSystem & PrewarmWorkspaceGateRuntimeFileSystem,
  workspaceRootPath: string,
  options?: {
    usePersistentCache?: boolean
  }
): CacheStore {
  if (!prewarmWorkspaceGateStoreByKey) {
    prewarmWorkspaceGateStoreByKey = new Map<
      string,
      PrewarmWorkspaceGateStore
    >()
  }

  const existing = prewarmWorkspaceGateStoreByKey.get(gateKey)
  if (existing) {
    return existing.store
  }

  const snapshot = new FileSystemSnapshot(fileSystem)
  const projectRoot = getProjectRootFromWorkspaceRoot(workspaceRootPath)
  const persistence =
    options?.usePersistentCache === false
      ? undefined
      : projectRoot
        ? getCacheStorePersistence({ projectRoot })
        : getCacheStorePersistence()
  const store = new CacheStore(
    persistence ? { snapshot, persistence } : { snapshot }
  )

  prewarmWorkspaceGateStoreByKey.set(gateKey, { store })

  return store
}

async function resolvePrewarmWorkspaceGate(
  analysisOptions?: AnalysisOptions
): Promise<PrewarmWorkspaceGate | undefined> {
  try {
    const { NodeFileSystem } = await import('../file-system/NodeFileSystem.ts')
    const fileSystem = new NodeFileSystem({
      tsConfigPath: analysisOptions?.tsConfigFilePath,
    }) as FileSystem & PrewarmWorkspaceGateRuntimeFileSystem
    const getWorkspaceChangeToken = fileSystem.getWorkspaceChangeToken
    if (typeof getWorkspaceChangeToken !== 'function') {
      return undefined
    }

    const workspaceRootPath = fileSystem.getAbsolutePath(
      analysisOptions?.tsConfigFilePath
        ? dirname(analysisOptions.tsConfigFilePath)
        : process.cwd()
    )
    const workspaceTokenRootPath =
      getProjectRootFromWorkspaceRoot(workspaceRootPath) ?? workspaceRootPath
    const workspaceToken =
      (await getWorkspaceChangeToken.call(fileSystem, workspaceTokenRootPath)) ??
      null
    if (!workspaceToken) {
      return undefined
    }

    const normalizedWorkspaceRootPath = normalizePathKey(workspaceRootPath)
    const normalizedWorkspaceTokenRootPath = normalizePathKey(
      workspaceTokenRootPath
    )
    const normalizedTsConfigPath =
      typeof analysisOptions?.tsConfigFilePath === 'string'
        ? normalizePathKey(analysisOptions.tsConfigFilePath)
        : null
    const gateKey = `${normalizedWorkspaceTokenRootPath}::${normalizedTsConfigPath ?? 'none'}`
    const store = getPrewarmWorkspaceGateStore(
      gateKey,
      fileSystem,
      workspaceTokenRootPath,
      {
        // In-memory analysis runs do not have durable source state to share
        // across processes, so keep the workspace gate local and avoid
        // cross-test/cache-store contention.
        usePersistentCache: analysisOptions?.useInMemoryFileSystem !== true,
      }
    )
    const nodeKey = createPersistentCacheNodeKey({
      domain: PREWARM_WORKSPACE_GATE_SCOPE,
      domainVersion: PREWARM_WORKSPACE_GATE_VERSION,
      namespace: 'run',
      payload: {
        workspaceRootPath: normalizedWorkspaceRootPath,
        workspaceTokenRootPath: normalizedWorkspaceTokenRootPath,
        tsConfigFilePath: normalizedTsConfigPath,
      },
    })
    const constDeps: CacheStoreConstDependency[] = [
      {
        name: PREWARM_WORKSPACE_GATE_VERSION_DEP,
        version: PREWARM_WORKSPACE_GATE_VERSION,
      },
      {
        name: PREWARM_WORKSPACE_TOKEN_DEP,
        version: workspaceToken,
      },
    ]

    return {
      store,
      fileSystem,
      nodeKey,
      constDeps,
      workspaceToken,
      workspaceRootPath,
      workspaceTokenRootPath,
    }
  } catch {
    return undefined
  }
}

function normalizeFilterExtensions(
  filterExtensions: Set<string> | null
): string[] | null {
  if (filterExtensions === null) {
    return null
  }

  return Array.from(filterExtensions.values()).sort((left, right) =>
    left.localeCompare(right)
  )
}

function toNormalizedPrewarmTargets(
  targets: RenounPrewarmTargets
): Record<string, unknown> {
  return {
    directoryGetEntries: targets.directoryGetEntries
      .map((request) => ({
        directoryPath: normalizePathKey(request.directoryPath),
        recursive: request.recursive,
        includeDirectoryNamedFiles: request.includeDirectoryNamedFiles,
        includeIndexAndReadmeFiles: request.includeIndexAndReadmeFiles,
        filterExtensions: normalizeFilterExtensions(request.filterExtensions),
        methods:
          request.methods?.slice().sort((left, right) =>
            left.localeCompare(right)
          ) ?? null,
      }))
      .sort((left, right) => {
        return JSON.stringify(left).localeCompare(JSON.stringify(right))
      }),
    directoryGetStructure: targets.directoryGetStructure
      .map((request) => ({
        directoryPath: normalizePathKey(request.directoryPath),
        repository: request.repository ?? null,
        options: request.options ?? null,
      }))
      .sort((left, right) => {
        return JSON.stringify(left).localeCompare(JSON.stringify(right))
      }),
    fileGetFile: targets.fileGetFile
      .map((request) => ({
        directoryPath: normalizePathKey(request.directoryPath),
        path: request.path,
        extensions:
          request.extensions?.slice().sort((left, right) =>
            left.localeCompare(right)
          ) ?? null,
        methods:
          request.methods?.slice().sort((left, right) =>
            left.localeCompare(right)
          ) ?? null,
      }))
      .sort((left, right) => {
        return JSON.stringify(left).localeCompare(JSON.stringify(right))
      }),
    exportHistory: targets.exportHistory
      .map((request) => ({
        repository: request.repository,
        sparsePaths: request.sparsePaths?.slice().sort() ?? null,
        options: request.options ?? null,
      }))
      .sort((left, right) => {
        return JSON.stringify(left).localeCompare(JSON.stringify(right))
      }),
  }
}

function arePrewarmTargetsEquivalent(
  left: RenounPrewarmTargets,
  right: RenounPrewarmTargets
): boolean {
  return (
    JSON.stringify(toNormalizedPrewarmTargets(left)) ===
    JSON.stringify(toNormalizedPrewarmTargets(right))
  )
}

function getFileRequestKey(request: FileRequest): string {
  if (!request.extensions || request.extensions.length === 0) {
    return `${request.directoryPath}\0${request.path}\0`
  }

  return `${request.directoryPath}\0${request.path}\0${request.extensions
    .slice()
    .sort()
    .join('\0')}`
}

function isPathWithinScope(path: string, scopePath: string): boolean {
  return path === scopePath || path.startsWith(`${scopePath}/`)
}

function shouldForceFullPrewarmForChangedPath(path: string): boolean {
  return (
    path.endsWith('/.gitignore') ||
    path.endsWith('/package.json') ||
    path.endsWith('/pnpm-lock.yaml') ||
    path.endsWith('/package-lock.json') ||
    path.endsWith('/yarn.lock') ||
    path.endsWith('/bun.lockb') ||
    path.endsWith('/pnpm-workspace.yaml') ||
    path.endsWith('/tsconfig.json')
  )
}

function toAbsoluteChangedPaths(
  changedPaths: ReadonlySet<string>,
  workspaceTokenRootPath: string
): Set<string> {
  const absolutePaths = new Set<string>()

  for (const changedPath of changedPaths) {
    if (typeof changedPath !== 'string' || changedPath.length === 0) {
      continue
    }

    absolutePaths.add(
      normalizePathKey(
        resolveChangedPath(workspaceTokenRootPath, changedPath)
      )
    )
  }

  return absolutePaths
}

function resolveChangedPath(
  workspaceTokenRootPath: string,
  changedPath: string
): string {
  if (changedPath.startsWith('/')) {
    return changedPath
  }

  return `${workspaceTokenRootPath}/${changedPath}`.replace(/\/+/g, '/')
}

function selectIncrementalPrewarmTargets(options: {
  currentTargets: RenounPrewarmTargets
  previousState?: CachedPrewarmWorkspaceGateValue
  changedPaths: ReadonlySet<string>
  workspaceTokenRootPath: string
}): RenounPrewarmTargets | undefined {
  const previousState = options.previousState
  if (!previousState) {
    return undefined
  }

  if (
    !arePrewarmTargetsEquivalent(options.currentTargets, previousState.targets)
  ) {
    return undefined
  }

  const absoluteChangedPaths = toAbsoluteChangedPaths(
    options.changedPaths,
    options.workspaceTokenRootPath
  )

  for (const changedPath of absoluteChangedPaths) {
    if (shouldForceFullPrewarmForChangedPath(changedPath)) {
      return undefined
    }
  }

  const directoryGetEntries = options.currentTargets.directoryGetEntries.filter(
    (request) => {
      const directoryPath = normalizePathKey(request.directoryPath)
      for (const changedPath of absoluteChangedPaths) {
        if (isPathWithinScope(changedPath, directoryPath)) {
          return true
        }
      }

      return false
    }
  )

  const fileGetFile = options.currentTargets.fileGetFile.filter((request) => {
    const requestKey = getFileRequestKey(request)
    const dependencyPaths =
      previousState.fileGetDependencyPathsByRequestKey[requestKey]

    if (Array.isArray(dependencyPaths) && dependencyPaths.length > 0) {
      for (const dependencyPath of dependencyPaths) {
        const normalizedDependencyPath = normalizePathKey(dependencyPath)
        if (absoluteChangedPaths.has(normalizedDependencyPath)) {
          return true
        }
      }

      return false
    }

    const directoryPath = normalizePathKey(request.directoryPath)
    for (const changedPath of absoluteChangedPaths) {
      if (isPathWithinScope(changedPath, directoryPath)) {
        return true
      }
    }

    return false
  })

  const directoryGetStructure =
    options.currentTargets.directoryGetStructure.filter((request) => {
      const directoryPath = normalizePathKey(request.directoryPath)
      for (const changedPath of absoluteChangedPaths) {
        if (isPathWithinScope(changedPath, directoryPath)) {
          return true
        }
      }

      return false
    })

  return {
    directoryGetEntries,
    directoryGetStructure,
    fileGetFile,
    exportHistory:
      absoluteChangedPaths.size > 0 ? options.currentTargets.exportHistory : [],
  }
}

function mergeFileGetDependencyPathsByRequestKey(options: {
  currentTargets: RenounPrewarmTargets
  previousState?: CachedPrewarmWorkspaceGateValue
  warmResult: WarmRenounPrewarmTargetsResult
  usedIncrementalTargets: boolean
}): Record<string, string[]> {
  const nextDependencyPathsByRequestKey: Record<string, string[]> = {}

  if (options.usedIncrementalTargets && options.previousState) {
    for (const request of options.currentTargets.fileGetFile) {
      const requestKey = getFileRequestKey(request)
      const previousDependencyPaths =
        options.previousState.fileGetDependencyPathsByRequestKey[requestKey]

      if (Array.isArray(previousDependencyPaths)) {
        nextDependencyPathsByRequestKey[requestKey] =
          previousDependencyPaths.slice()
      }
    }
  }

  for (const [requestKey, dependencyPaths] of Object.entries(
    options.warmResult.fileGetDependencyPathsByRequestKey
  )) {
    nextDependencyPathsByRequestKey[requestKey] = dependencyPaths.slice()
  }

  return nextDependencyPathsByRequestKey
}

async function runPrewarmAnalysis(options?: {
  analysisOptions?: AnalysisOptions
  previousState?: CachedPrewarmWorkspaceGateValue
  changedPaths?: ReadonlySet<string> | null
  workspaceTokenRootPath?: string
}): Promise<PrewarmRunResult> {
  const logger = getDebugLogger()
  const project = getProgram(options?.analysisOptions)
  const targets = await collectRenounPrewarmTargets(
    project,
    options?.analysisOptions
  )

  if (
    targets.directoryGetEntries.length === 0 &&
    targets.directoryGetStructure.length === 0 &&
    targets.fileGetFile.length === 0 &&
    targets.exportHistory.length === 0
  ) {
    logger.debug('No renoun prewarm targets were found')
    return {
      result: 'no-targets',
      targets,
      fileGetDependencyPathsByRequestKey: {},
    }
  }

  const incrementalTargets =
    options?.changedPaths && options.workspaceTokenRootPath
      ? selectIncrementalPrewarmTargets({
          currentTargets: targets,
          previousState: options.previousState,
          changedPaths: options.changedPaths,
          workspaceTokenRootPath: options.workspaceTokenRootPath,
        })
      : undefined

  const targetsToWarm = incrementalTargets ?? targets
  if (
    targetsToWarm.directoryGetEntries.length === 0 &&
    targetsToWarm.directoryGetStructure.length === 0 &&
    targetsToWarm.fileGetFile.length === 0 &&
    targetsToWarm.exportHistory.length === 0
  ) {
    logger.debug('Skipping renoun prewarm because changed paths miss targets')
    return {
      result: 'skipped',
      targets,
      fileGetDependencyPathsByRequestKey:
        options?.previousState?.fileGetDependencyPathsByRequestKey ?? {},
    }
  }

  const warmResult = await warmRenounPrewarmTargets(targetsToWarm, {
    analysisOptions: options?.analysisOptions,
    isFilePathGitIgnored,
  })

  return {
    result: incrementalTargets ? 'incremental-warmed' : 'warmed',
    targets,
    fileGetDependencyPathsByRequestKey: mergeFileGetDependencyPathsByRequestKey({
      currentTargets: targets,
      previousState: options?.previousState,
      warmResult,
      usedIncrementalTargets: incrementalTargets !== undefined,
    }),
  }
}

export async function prewarmRenounRpcServerCache(options?: {
  analysisOptions?: AnalysisOptions
}): Promise<void> {
  const logger = getDebugLogger()

  if (!hasServerRuntimeInProcessEnv()) {
    return
  }

  const workspaceGate = await resolvePrewarmWorkspaceGate(
    options?.analysisOptions
  )
  if (!workspaceGate) {
    await runPrewarmAnalysis(options)
    return
  }

  const previousState =
    await workspaceGate.store.getPossiblyStale<CachedPrewarmWorkspaceGateValue>(
      workspaceGate.nodeKey
    )
  let changedPaths: ReadonlySet<string> | null | undefined
  if (
    previousState?.workspaceToken &&
    previousState.workspaceToken !== workspaceGate.workspaceToken &&
    typeof workspaceGate.fileSystem.getWorkspaceChangedPathsSinceToken ===
      'function'
  ) {
    const nextChangedPaths =
      (await workspaceGate.fileSystem.getWorkspaceChangedPathsSinceToken(
        workspaceGate.workspaceTokenRootPath,
        previousState.workspaceToken
      )) ?? null
    changedPaths =
      nextChangedPaths === null ? null : new Set<string>(nextChangedPaths)
  }

  let didExecutePrewarm = false
  await workspaceGate.store.getOrCompute(
    workspaceGate.nodeKey,
    {
      persist: true,
      constDeps: workspaceGate.constDeps,
    },
    async (context) => {
      didExecutePrewarm = true
      recordConstDependencies(context, workspaceGate.constDeps)
      const result = await runPrewarmAnalysis({
        ...options,
        previousState,
        changedPaths,
        workspaceTokenRootPath: workspaceGate.workspaceTokenRootPath,
      })
      return {
        ...result,
        workspaceRootPath: workspaceGate.workspaceRootPath,
        workspaceTokenRootPath: workspaceGate.workspaceTokenRootPath,
        workspaceToken: workspaceGate.workspaceToken,
        updatedAt: Date.now(),
      }
    }
  )

  if (!didExecutePrewarm) {
    // Keep the active project runtime ready for downstream build requests, but
    // avoid rerunning the full prewarm when the workspace token is unchanged.
    getProgram(options?.analysisOptions)

    logger.debug(
      'Skipping renoun prewarm because workspace token is unchanged',
      () => ({
        data: {
          workspaceRootPath: workspaceGate.workspaceRootPath,
          workspaceTokenRootPath: workspaceGate.workspaceTokenRootPath,
        },
      })
    )
  }
}
