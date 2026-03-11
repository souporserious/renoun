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
import { warmRenounPrewarmTargets } from './prewarm/warm-analysis.ts'
import {
  collectRenounPrewarmTargets,
  type DirectoryEntriesRequest,
  type FileRequest,
  type RenounPrewarmTargets,
} from './prewarm/collect-targets.ts'

const PREWARM_WORKSPACE_GATE_SCOPE = 'prewarm-workspace-gate'
const PREWARM_WORKSPACE_GATE_VERSION = '1'
const PREWARM_WORKSPACE_GATE_VERSION_DEP = 'prewarm-workspace-gate-version'
const PREWARM_WORKSPACE_TOKEN_DEP = 'prewarm-workspace-token'

interface PrewarmWorkspaceGateRuntimeFileSystem {
  getAbsolutePath(path: string): string
  getWorkspaceChangeToken?(rootPath: string): Promise<string | null>
}

interface PrewarmWorkspaceGateStore {
  store: CacheStore
}

interface PrewarmWorkspaceGate {
  store: CacheStore
  nodeKey: string
  constDeps: CacheStoreConstDependency[]
  workspaceToken: string
  workspaceRootPath: string
}

let prewarmWorkspaceGateStoreByKey:
  | Map<string, PrewarmWorkspaceGateStore>
  | undefined

export type {
  DirectoryEntriesRequest,
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
  workspaceRootPath: string
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
  const persistence = projectRoot
    ? getCacheStorePersistence({ projectRoot })
    : getCacheStorePersistence()
  const store = new CacheStore({
    snapshot,
    persistence,
  })

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
    const workspaceToken =
      (await getWorkspaceChangeToken.call(fileSystem, workspaceRootPath)) ??
      null
    if (!workspaceToken) {
      return undefined
    }

    const normalizedWorkspaceRootPath = normalizePathKey(workspaceRootPath)
    const normalizedTsConfigPath =
      typeof analysisOptions?.tsConfigFilePath === 'string'
        ? normalizePathKey(analysisOptions.tsConfigFilePath)
        : null
    const gateKey = `${normalizedWorkspaceRootPath}::${normalizedTsConfigPath ?? 'none'}`
    const store = getPrewarmWorkspaceGateStore(
      gateKey,
      fileSystem,
      workspaceRootPath
    )
    const nodeKey = createPersistentCacheNodeKey({
      domain: PREWARM_WORKSPACE_GATE_SCOPE,
      domainVersion: PREWARM_WORKSPACE_GATE_VERSION,
      namespace: 'run',
      payload: {
        workspaceRootPath: normalizedWorkspaceRootPath,
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
      nodeKey,
      constDeps,
      workspaceToken,
      workspaceRootPath,
    }
  } catch {
    return undefined
  }
}

async function runPrewarmAnalysis(options?: {
  analysisOptions?: AnalysisOptions
}): Promise<'no-targets' | 'warmed'> {
  const logger = getDebugLogger()
  const project = getProgram(options?.analysisOptions)
  const targets = await collectRenounPrewarmTargets(
    project,
    options?.analysisOptions
  )

  if (
    targets.directoryGetEntries.length === 0 &&
    targets.fileGetFile.length === 0
  ) {
    logger.debug('No renoun prewarm targets were found')
    return 'no-targets'
  }

  await warmRenounPrewarmTargets(targets, {
    analysisOptions: options?.analysisOptions,
    isFilePathGitIgnored,
  })

  return 'warmed'
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
      const result = await runPrewarmAnalysis(options)
      return {
        result,
        workspaceRootPath: workspaceGate.workspaceRootPath,
        workspaceToken: workspaceGate.workspaceToken,
        updatedAt: Date.now(),
      }
    }
  )

  if (!didExecutePrewarm) {
    logger.debug(
      'Skipping renoun prewarm because workspace token is unchanged',
      () => ({
        data: {
          workspaceRootPath: workspaceGate.workspaceRootPath,
        },
      })
    )
  }
}
