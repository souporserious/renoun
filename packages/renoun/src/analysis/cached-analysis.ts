import { dirname, join, resolve } from 'node:path'
import type {
  SourceFile,
  SyntaxKind,
  Project,
  ts as TsMorphTS,
} from '../utils/ts-morph.ts'
import { getTsMorph } from '../utils/ts-morph.ts'
import {
  HASH_STRING_ALGORITHM,
  hashString,
  stableStringify,
} from '../utils/stable-serialization.ts'

import { getRootDirectory } from '../utils/get-root-directory.ts'
import { reportBestEffortError } from '../utils/best-effort.ts'
import { normalizePathKey } from '../utils/path.ts'
import { getDebugLogger } from '../utils/debug.ts'
import {
  isProductionEnvironment,
  isTestEnvironment,
  isVitestRuntime,
} from '../utils/env.ts'
import { collapseInvalidationPaths } from '../utils/collapse-invalidation-paths.ts'
import {
  createPersistentCacheNodeKey,
  serializeTypeFilterForCache,
} from '../file-system/cache-key.ts'
import {
  type CacheStoreGetOrComputeOptions,
  type CacheStoreComputeContext,
  type CacheStoreConstDependency,
  type CacheStoreFreshnessMismatch,
  type CacheStoreStaleWhileRevalidateOptions,
} from '../file-system/Cache.ts'
import type { ModuleExport } from '../utils/get-file-exports.ts'
import {
  getFileExports as baseGetFileExports,
  getFileExportMetadata as baseGetFileExportMetadata,
} from '../utils/get-file-exports.ts'
import type {
  GetSourceTextMetadataOptions,
  SourceTextMetadata,
} from './query/source-text-metadata.ts'
import {
  getSourceTextMetadata as baseGetSourceTextMetadata,
  getSourceTextMetadataFallback,
  hydrateSourceTextMetadataSourceFile,
} from './query/source-text-metadata.ts'
import {
  getSourceTextFormatterStateVersion,
  prewarmSourceTextFormatterRuntime,
} from '../utils/format-source-text.ts'
import { getFileExportStaticValue as baseGetFileExportStaticValue } from '../utils/get-file-export-static-value.ts'
import {
  getFileExportText as baseGetFileExportText,
  getFileExportTextResult as baseGetFileExportTextResult,
} from '../utils/get-file-export-text.ts'
import { getOutlineRanges as baseGetOutlineRanges } from '../utils/get-outline-ranges.ts'
import type { GetTokensOptions, TokenizedLines } from '../utils/get-tokens.ts'
import {
  createPlainTextTokenizedLines,
  getTokens as baseGetTokens,
} from '../utils/get-tokens.ts'
import {
  resolveTypeAtLocationWithDependencies as baseResolveTypeAtLocationWithDependencies,
  type ResolvedTypeAtLocationResult,
} from '../utils/resolve-type-at-location.ts'
import type { Highlighter } from '../utils/create-highlighter.ts'
import type { TypeFilter } from '../utils/resolve-type.ts'
import { transpileSourceFile as baseTranspileSourceFile } from '../utils/transpile-source-file.ts'
import type { OutlineRange } from '../utils/get-outline-ranges.ts'
import { mapConcurrent } from '../utils/concurrency.ts'
import type { ProgramCacheDependency } from './cache.ts'
import {
  createProgramFileCache as createProgramFileCacheBase,
  invalidateProgramFileCache,
  invalidateProgramFileCachePaths,
} from './cache.ts'
import {
  isRpcBuildProfileEnabled,
  recordRpcCacheReuse,
  recordRpcCacheReuseStaleReason,
} from './rpc/build-profile.ts'
import type { RuntimeAnalysisSession } from './runtime-analysis-session.ts'
import {
  getRuntimeAnalysisSession as getSharedRuntimeAnalysisSession,
  getRuntimeAnalysisSessions as getSharedRuntimeAnalysisSessions,
} from './runtime-analysis-session.ts'
import { getProjectAnalysisScopeId } from './project-scope.ts'
import { getTypeScriptConfigDependencyPaths } from './tsconfig-dependencies.ts'

const RUNTIME_ANALYSIS_CACHE_NAMES = {
  fileExports: 'fileExports',
  outlineRanges: 'outlineRanges',
  fileExportMetadata: 'fileExportMetadata',
  fileExportStaticValue: 'fileExportStaticValue',
  fileExportText: 'fileExportText',
  fileExportsText: 'fileExportsText',
  resolveTypeAtLocationWithDependencies: 'resolveTypeAtLocationWithDependencies',
  transpileSourceFile: 'transpileSourceFile',
  tokens: 'tokens',
  sourceTextMetadata: 'sourceTextMetadata',
  typeScriptDependencyAnalysis: 'typeScriptDependencyAnalysis',
  typeScriptDependencyFingerprint: 'typeScriptDependencyFingerprint',
  moduleResolution: 'moduleResolution',
  packageVersionDependency: 'packageVersionDependency',
} as const

const RUNTIME_ANALYSIS_CACHE_CONFIG = {
  scope: 'program-analysis-runtime',
  version: '4',
  versionDependency: 'runtime-analysis-cache-version',
  programCompilerOptionsDependency: 'program:compiler-options',
  defaultSwrMaxStaleAgeMs: 120_000,
  sourceTextMetadataSwrMaxStaleAgeMs: 15 * 60_000,
  tokensSwrMaxStaleAgeMs: 15 * 60_000,
  maxTypeScriptDependencyAnalysisFiles: 10_000,
  typeScriptDependencySidecarHydrationConcurrency: 2,
  moduleResolutionFileExtensions: [
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.d.ts',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
  ] as const,
} as const

const RUNTIME_ANALYSIS_CONST_DEPS: readonly CacheStoreConstDependency[] =
  Object.freeze([
    {
      name: RUNTIME_ANALYSIS_CACHE_CONFIG.versionDependency,
      version: RUNTIME_ANALYSIS_CACHE_CONFIG.version,
    },
  ])

function isRuntimeAnalysisDevelopmentLikeEnvironment(): boolean {
  return (
    !isProductionEnvironment() && !isTestEnvironment() && !isVitestRuntime()
  )
}

const { ts } = getTsMorph()
const debugLogger = getDebugLogger()

type RuntimeAnalysisCacheStore = RuntimeAnalysisSession & {
  store: RuntimeAnalysisSession['session']['cache']
  snapshot: RuntimeAnalysisSession['session']['snapshot']
}

const compilerOptionsVersionByProject = new WeakMap<
  Project,
  {
    version: string
    configPathKeySignature: string
    epoch: number
  }
>()
const compilerOptionsConfigPathsByProject = new WeakMap<
  Project,
  {
    paths: string[]
    pathKeys: string[]
    pathKeySignature: string
    epoch: number
  }
>()
const compilerOptionsVersionEpochByConfigPath = new Map<string, number>()
let compilerOptionsVersionGlobalEpoch = 0
let runtimeAnalysisInvalidationQueue: Promise<void> = Promise.resolve()
const fallbackAnalysisProgramCacheRefs = new Map<number, WeakRef<Project>>()
const fallbackAnalysisProgramIdByProject = new WeakMap<Project, number>()
const fallbackAnalysisProgramFinalizationRegistry =
  typeof FinalizationRegistry === 'function'
    ? new FinalizationRegistry<number>((analysisScopeId) => {
        fallbackAnalysisProgramCacheRefs.delete(analysisScopeId)
      })
    : undefined
let fallbackAnalysisProgramIdCounter = 0
const runtimeTypeScriptDependencyAnalysisInFlightByKey = new Map<
  string,
  Promise<RuntimeTypeScriptDependencyAnalysisResult | undefined>
>()
const runtimeTypeScriptDependencyFingerprintInFlightByKey = new Map<
  string,
  Promise<RuntimeTypeScriptDependencyFingerprintResult | undefined>
>()
const runtimeTypeScriptDependencySidecarHydrationInFlightByKey = new Map<
  string,
  Promise<void>
>()
const runtimeTypeScriptDependencySidecarHydrationQueue: Array<{
  dedupeKey: string
  run: () => Promise<void>
}> = []
let runtimeTypeScriptDependencySidecarHydrationActiveCount = 0
const runtimeAnalysisBackgroundRefreshListeners = new Set<
  (paths: readonly string[]) => void
>()
interface RuntimeAnalysisSWRPrewarmTask {
  dependencyPaths: readonly string[]
  run: () => Promise<void>
  lastAccessedAt: number
  inFlight?: Promise<void>
}
type RuntimeAnalysisSWRPrewarmPriority = 'immediate' | 'background'
const runtimeAnalysisSWRPrewarmTasksByNodeKey = new Map<
  string,
  RuntimeAnalysisSWRPrewarmTask
>()
const pendingRuntimeAnalysisSWRPrewarmPathsImmediate = new Set<string>()
const pendingRuntimeAnalysisSWRPrewarmPathsBackground = new Set<string>()
let runtimeAnalysisSWRPrewarmFlushQueued = false
let runtimeAnalysisSWRPrewarmFlushTimer: NodeJS.Timeout | undefined
let runtimeAnalysisSWRPrewarmFlushDelayMs: number | undefined
const pendingRuntimeAnalysisBackgroundRefreshPaths = new Set<string>()
let runtimeAnalysisBackgroundRefreshFlushQueued = false
const programConfigDependencyVersionByKey = new Map<
  string,
  {
    contentId: string
    version: string
  }
>()
const metadataCollectorCacheKeyByCollector = new WeakMap<
  NonNullable<GetTokensOptions['metadataCollector']>,
  string
>()
let nextMetadataCollectorCacheKey = 0
const RUNTIME_ANALYSIS_SWR_PREWARM_MAX_ENTRIES = 512
const RUNTIME_ANALYSIS_SWR_PREWARM_MAX_AGE_MS = 5 * 60_000
const RUNTIME_ANALYSIS_SWR_PREWARM_CONCURRENCY = 1
const RUNTIME_ANALYSIS_SWR_PREWARM_MAX_TASKS_PER_RUN = 16
const RUNTIME_ANALYSIS_SWR_PREWARM_PRIORITY_DELAY_MS: Record<
  RuntimeAnalysisSWRPrewarmPriority,
  number
> = {
  immediate: 0,
  background: 250,
}
const RUNTIME_ANALYSIS_DEV_COLD_FALLBACK_MAX_VALUE_LENGTH = 250_000
const RUNTIME_ANALYSIS_DEV_COLD_RESPONSE_BUDGET_MS = 25
const runtimeAnalysisBootstrappedScopeKeys = new Set<string>()
const pendingRuntimeAnalysisColdStartTaskKeys = new Set<string>()

function getRuntimeAnalysisSWRReadOptions(options?: {
  maxStaleAgeMs?: number
}):
  | CacheStoreStaleWhileRevalidateOptions
  | undefined {
  if (!isRuntimeAnalysisDevelopmentLikeEnvironment()) {
    return undefined
  }

  const maxStaleAgeMs =
    typeof options?.maxStaleAgeMs === 'number'
      ? options.maxStaleAgeMs
      : RUNTIME_ANALYSIS_CACHE_CONFIG.defaultSwrMaxStaleAgeMs

  return {
    maxStaleAgeMs,
  }
}

function prewarmSourceTextFormatterForRuntimeAnalysis(
  _filePath?: string | false
): void {
  if (!isRuntimeAnalysisDevelopmentLikeEnvironment()) {
    return
  }

  prewarmSourceTextFormatterRuntime()
}

function normalizeRuntimeAnalysisRefreshPaths(
  paths: Iterable<string>
): string[] {
  const pathByNormalizedPath = new Map<string, string>()

  for (const path of paths) {
    if (typeof path !== 'string' || path.length === 0) {
      continue
    }

    const normalizedPath = normalizePathKey(path)
    if (!pathByNormalizedPath.has(normalizedPath)) {
      pathByNormalizedPath.set(normalizedPath, path)
    }
  }

  const collapsedPaths = collapseInvalidationPaths(pathByNormalizedPath.keys())
  return collapsedPaths.map((normalizedPath) => {
    return pathByNormalizedPath.get(normalizedPath) ?? normalizedPath
  })
}

function runtimeAnalysisPathsIntersect(
  firstPath: string,
  secondPath: string
): boolean {
  if (firstPath === '.' || secondPath === '.') {
    return true
  }

  return (
    firstPath === secondPath ||
    firstPath.startsWith(`${secondPath}/`) ||
    secondPath.startsWith(`${firstPath}/`)
  )
}

function trimRuntimeAnalysisSWRPrewarmTasks(now = Date.now()): void {
  for (const [nodeKey, task] of runtimeAnalysisSWRPrewarmTasksByNodeKey) {
    if (now - task.lastAccessedAt > RUNTIME_ANALYSIS_SWR_PREWARM_MAX_AGE_MS) {
      runtimeAnalysisSWRPrewarmTasksByNodeKey.delete(nodeKey)
    }
  }

  if (
    runtimeAnalysisSWRPrewarmTasksByNodeKey.size <=
    RUNTIME_ANALYSIS_SWR_PREWARM_MAX_ENTRIES
  ) {
    return
  }

  const entries = Array.from(runtimeAnalysisSWRPrewarmTasksByNodeKey.entries())
    .sort((first, second) => first[1].lastAccessedAt - second[1].lastAccessedAt)
    .slice(
      0,
      runtimeAnalysisSWRPrewarmTasksByNodeKey.size -
        RUNTIME_ANALYSIS_SWR_PREWARM_MAX_ENTRIES
    )

  for (const [nodeKey] of entries) {
    runtimeAnalysisSWRPrewarmTasksByNodeKey.delete(nodeKey)
  }
}

function normalizeRuntimeAnalysisPrewarmDependencyPath(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  path: string | undefined | false
): string | undefined {
  if (typeof path !== 'string' || path.length === 0) {
    return undefined
  }

  try {
    return normalizePathKey(runtimeCacheStore.fileSystem.getAbsolutePath(path))
  } catch {
    return normalizePathKey(path)
  }
}

function resolveRuntimeAnalysisPrewarmDependencyPaths(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  paths: readonly (string | undefined | false)[],
  fallbackScopePath?: string
): string[] {
  const dependencyPaths = new Set<string>()

  for (const path of paths) {
    const normalizedPath = normalizeRuntimeAnalysisPrewarmDependencyPath(
      runtimeCacheStore,
      path
    )
    if (normalizedPath && normalizedPath.length > 0) {
      dependencyPaths.add(normalizedPath)
    }
  }

  if (dependencyPaths.size > 0) {
    return Array.from(dependencyPaths)
  }

  const fallbackPath = normalizeRuntimeAnalysisPrewarmDependencyPath(
    runtimeCacheStore,
    fallbackScopePath
  )
  if (fallbackPath && fallbackPath.length > 0) {
    dependencyPaths.add(fallbackPath)
  }

  return Array.from(dependencyPaths)
}

function registerRuntimeAnalysisSWRPrewarmTask(options: {
  nodeKey: string
  dependencyPaths: readonly string[]
  run: () => Promise<void>
}): void {
  if (!isRuntimeAnalysisDevelopmentLikeEnvironment()) {
    return
  }

  const now = Date.now()
  runtimeAnalysisSWRPrewarmTasksByNodeKey.set(options.nodeKey, {
    dependencyPaths: options.dependencyPaths,
    run: options.run,
    lastAccessedAt: now,
  })
  trimRuntimeAnalysisSWRPrewarmTasks(now)
}

async function runRuntimeAnalysisSWRPrewarm(
  paths: readonly string[]
): Promise<void> {
  if (!isRuntimeAnalysisDevelopmentLikeEnvironment()) {
    return
  }

  const normalizedPaths = normalizeRuntimeAnalysisRefreshPaths(paths)
  if (normalizedPaths.length === 0) {
    return
  }

  trimRuntimeAnalysisSWRPrewarmTasks()

  const prewarmTasks = Array.from(runtimeAnalysisSWRPrewarmTasksByNodeKey.values())
    .filter((task) => {
      if (task.dependencyPaths.length === 0) {
        return false
      }

      return task.dependencyPaths.some((dependencyPath) => {
        return normalizedPaths.some((path) => {
          return runtimeAnalysisPathsIntersect(dependencyPath, path)
        })
      })
    })
    .sort((first, second) => second.lastAccessedAt - first.lastAccessedAt)
    .slice(0, RUNTIME_ANALYSIS_SWR_PREWARM_MAX_TASKS_PER_RUN)

  if (prewarmTasks.length === 0) {
    return
  }

  const runTask = async (task: RuntimeAnalysisSWRPrewarmTask): Promise<void> => {
    if (task.inFlight) {
      return task.inFlight
    }

    let runPromise: Promise<void>
    runPromise = task
      .run()
      .catch((error) => {
        reportBestEffortError('analysis/cached-analysis', error)
      })
      .finally(() => {
        if (task.inFlight === runPromise) {
          task.inFlight = undefined
        }
      })

    task.inFlight = runPromise
    return runPromise
  }

  const activeRuns = new Set<Promise<void>>()
  for (const task of prewarmTasks) {
    while (activeRuns.size >= RUNTIME_ANALYSIS_SWR_PREWARM_CONCURRENCY) {
      await Promise.race(activeRuns)
    }

    const taskPromise = runTask(task).finally(() => {
      activeRuns.delete(taskPromise)
    })
    activeRuns.add(taskPromise)
  }

  if (activeRuns.size > 0) {
    await Promise.all(activeRuns)
  }
}

function queueRuntimeAnalysisSWRPrewarm(
  paths: readonly string[],
  options: {
    priority?: RuntimeAnalysisSWRPrewarmPriority
  } = {}
): void {
  if (!isRuntimeAnalysisDevelopmentLikeEnvironment()) {
    return
  }

  const priority = options.priority ?? 'background'
  const immediateQueue = pendingRuntimeAnalysisSWRPrewarmPathsImmediate
  const backgroundQueue = pendingRuntimeAnalysisSWRPrewarmPathsBackground

  for (const path of normalizeRuntimeAnalysisRefreshPaths(paths)) {
    if (priority === 'immediate') {
      immediateQueue.add(path)
      backgroundQueue.delete(path)
      continue
    }

    if (!immediateQueue.has(path)) {
      backgroundQueue.add(path)
    }
  }

  if (immediateQueue.size === 0 && backgroundQueue.size === 0) {
    return
  }

  const requestedDelayMs =
    RUNTIME_ANALYSIS_SWR_PREWARM_PRIORITY_DELAY_MS[priority] ?? 250
  if (
    runtimeAnalysisSWRPrewarmFlushQueued &&
    runtimeAnalysisSWRPrewarmFlushDelayMs !== undefined &&
    runtimeAnalysisSWRPrewarmFlushDelayMs <= requestedDelayMs
  ) {
    return
  }

  if (runtimeAnalysisSWRPrewarmFlushTimer) {
    clearTimeout(runtimeAnalysisSWRPrewarmFlushTimer)
  }

  runtimeAnalysisSWRPrewarmFlushQueued = true
  runtimeAnalysisSWRPrewarmFlushDelayMs = requestedDelayMs
  runtimeAnalysisSWRPrewarmFlushTimer = setTimeout(() => {
    runtimeAnalysisSWRPrewarmFlushQueued = false
    runtimeAnalysisSWRPrewarmFlushTimer = undefined
    runtimeAnalysisSWRPrewarmFlushDelayMs = undefined

    const pendingQueue =
      pendingRuntimeAnalysisSWRPrewarmPathsImmediate.size > 0
        ? pendingRuntimeAnalysisSWRPrewarmPathsImmediate
        : pendingRuntimeAnalysisSWRPrewarmPathsBackground
    if (pendingQueue.size === 0) {
      return
    }

    const prewarmPaths = normalizeRuntimeAnalysisRefreshPaths(pendingQueue)
    pendingQueue.clear()
    if (prewarmPaths.length === 0) {
      if (
        pendingRuntimeAnalysisSWRPrewarmPathsImmediate.size > 0 ||
        pendingRuntimeAnalysisSWRPrewarmPathsBackground.size > 0
      ) {
        queueRuntimeAnalysisSWRPrewarm([], {
          priority:
            pendingRuntimeAnalysisSWRPrewarmPathsImmediate.size > 0
              ? 'immediate'
              : 'background',
        })
      }
      return
    }

    void runRuntimeAnalysisSWRPrewarm(prewarmPaths).finally(() => {
      if (
        pendingRuntimeAnalysisSWRPrewarmPathsImmediate.size > 0 ||
        pendingRuntimeAnalysisSWRPrewarmPathsBackground.size > 0
      ) {
        queueRuntimeAnalysisSWRPrewarm([], {
          priority:
            pendingRuntimeAnalysisSWRPrewarmPathsImmediate.size > 0
              ? 'immediate'
              : 'background',
        })
      }
    })
  }, requestedDelayMs)
  runtimeAnalysisSWRPrewarmFlushTimer.unref?.()
}

function queueRuntimeAnalysisBackgroundRefresh(
  paths: readonly string[]
): void {
  if (runtimeAnalysisBackgroundRefreshListeners.size === 0) {
    return
  }

  for (const path of paths) {
    pendingRuntimeAnalysisBackgroundRefreshPaths.add(path)
  }

  if (runtimeAnalysisBackgroundRefreshFlushQueued) {
    return
  }

  runtimeAnalysisBackgroundRefreshFlushQueued = true
  queueMicrotask(() => {
    runtimeAnalysisBackgroundRefreshFlushQueued = false
    if (pendingRuntimeAnalysisBackgroundRefreshPaths.size === 0) {
      return
    }

    const refreshPaths = normalizeRuntimeAnalysisRefreshPaths(
      pendingRuntimeAnalysisBackgroundRefreshPaths
    )
    pendingRuntimeAnalysisBackgroundRefreshPaths.clear()
    if (refreshPaths.length === 0) {
      return
    }

    for (const listener of runtimeAnalysisBackgroundRefreshListeners) {
      try {
        listener(refreshPaths)
      } catch (error) {
        reportBestEffortError('analysis/cached-analysis', error)
      }
    }
  })
}

function getRuntimeAnalysisSWRBackgroundRefreshCallback(
  paths: readonly (string | undefined)[]
): CacheStoreGetOrComputeOptions['onBackgroundRefreshComplete'] | undefined {
  if (!isRuntimeAnalysisDevelopmentLikeEnvironment()) {
    return undefined
  }

  const validPaths = paths.filter((path): path is string => {
    return typeof path === 'string' && path.length > 0
  })
  const normalizedPaths = normalizeRuntimeAnalysisRefreshPaths(validPaths)
  if (normalizedPaths.length === 0) {
    return undefined
  }

  return () => {
    queueRuntimeAnalysisBackgroundRefresh(normalizedPaths)
    queueRuntimeAnalysisSWRPrewarm(normalizedPaths, {
      priority: 'background',
    })
  }
}

function getRuntimeAnalysisSWRReadConfig(
  paths: readonly (string | undefined)[],
  options?: {
    maxStaleAgeMs?: number
  }
): Pick<
  CacheStoreGetOrComputeOptions,
  'staleWhileRevalidate' | 'onBackgroundRefreshComplete'
> {
  if (isTestEnvironment()) {
    return {}
  }

  const staleWhileRevalidate = getRuntimeAnalysisSWRReadOptions({
    maxStaleAgeMs: options?.maxStaleAgeMs,
  })

  return {
    staleWhileRevalidate,
    onBackgroundRefreshComplete:
      getRuntimeAnalysisSWRBackgroundRefreshCallback(paths),
  }
}

function shouldServeRuntimeAnalysisColdFallback(options: {
  value: string
  isFormattingExplicit?: boolean
}): boolean {
  if (!isRuntimeAnalysisDevelopmentLikeEnvironment()) {
    return false
  }

  if (options.isFormattingExplicit === true) {
    return false
  }

  return options.value.length <= RUNTIME_ANALYSIS_DEV_COLD_FALLBACK_MAX_VALUE_LENGTH
}

function queueRuntimeAnalysisImmediateRefresh(options: {
  dependencyPaths: readonly string[]
  scopePath?: string
  refresh: () => Promise<unknown>
}): void {
  if (!isRuntimeAnalysisDevelopmentLikeEnvironment()) {
    return
  }

  if (options.dependencyPaths.length === 0) {
    void options.refresh().catch((error) => {
      reportBestEffortError('analysis/cached-analysis', error)
    })
    return
  }

  const fallbackPath =
    typeof options.scopePath === 'string' && options.scopePath.length > 0
      ? options.scopePath
      : '.'
  const normalizedPaths = normalizeRuntimeAnalysisRefreshPaths(
    options.dependencyPaths.length > 0
      ? options.dependencyPaths
      : [fallbackPath]
  )

  if (normalizedPaths.length === 0) {
    void options.refresh().catch((error) => {
      reportBestEffortError('analysis/cached-analysis', error)
    })
    return
  }

  queueRuntimeAnalysisSWRPrewarm(normalizedPaths, {
    priority: 'immediate',
  })
}

async function resolveWithinRuntimeAnalysisColdResponseBudget<Value>(options: {
  promise: Promise<Value>
  fallback: () => Value
}): Promise<Value> {
  if (!isRuntimeAnalysisDevelopmentLikeEnvironment()) {
    return options.promise
  }

  if (RUNTIME_ANALYSIS_DEV_COLD_RESPONSE_BUDGET_MS <= 0) {
    return options.promise
  }

  let timeout: NodeJS.Timeout | undefined
  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
    timeout = setTimeout(() => {
      resolve({ timedOut: true })
    }, RUNTIME_ANALYSIS_DEV_COLD_RESPONSE_BUDGET_MS)
    timeout.unref?.()
  })
  const resolved = await Promise.race([
    options.promise.then((value) => ({
      timedOut: false as const,
      value,
    })),
    timeoutPromise,
  ])

  if (timeout) {
    clearTimeout(timeout)
  }

  if (resolved.timedOut) {
    void options.promise.catch((error) => {
      reportBestEffortError('analysis/cached-analysis', error)
    })
    return options.fallback()
  }

  return resolved.value
}

function toRuntimeAnalysisBootstrappedScopeKey(
  options?: string | RuntimeAnalysisScopeOptions
): string {
  let scopePath: string | undefined
  let analysisScopeId: string | undefined

  if (typeof options === 'string') {
    scopePath = options
  } else if (options) {
    scopePath = options.scopePath
    analysisScopeId = options.analysisScopeId
  }

  const baseScopeKey =
    typeof scopePath === 'string' && scopePath.length > 0
      ? normalizePathKey(scopePath)
      : '.'

  if (typeof analysisScopeId === 'string' && analysisScopeId.length > 0) {
    return `${baseScopeKey}#${analysisScopeId}`
  }

  return baseScopeKey
}

function isRuntimeAnalysisScopeBootstrapped(
  options?: string | RuntimeAnalysisScopeOptions
): boolean {
  return runtimeAnalysisBootstrappedScopeKeys.has(
    toRuntimeAnalysisBootstrappedScopeKey(options)
  )
}

function markRuntimeAnalysisScopeBootstrapped(
  options?: string | RuntimeAnalysisScopeOptions
): void {
  runtimeAnalysisBootstrappedScopeKeys.add(
    toRuntimeAnalysisBootstrappedScopeKey(options)
  )
}

function queueRuntimeAnalysisColdStartTask(options: {
  taskKey: string
  run: () => Promise<void>
}): void {
  if (!isRuntimeAnalysisDevelopmentLikeEnvironment()) {
    void options.run().catch((error) => {
      reportBestEffortError('analysis/cached-analysis', error)
    })
    return
  }

  if (
    typeof options.taskKey !== 'string' ||
    options.taskKey.length === 0 ||
    pendingRuntimeAnalysisColdStartTaskKeys.has(options.taskKey)
  ) {
    return
  }

  pendingRuntimeAnalysisColdStartTaskKeys.add(options.taskKey)
  const timer = setTimeout(() => {
    pendingRuntimeAnalysisColdStartTaskKeys.delete(options.taskKey)
    void options.run().catch((error) => {
      reportBestEffortError('analysis/cached-analysis', error)
    })
  }, 0)
  timer.unref?.()
}

export function onRuntimeAnalysisBackgroundRefresh(
  listener: (paths: readonly string[]) => void
): () => void {
  runtimeAnalysisBackgroundRefreshListeners.add(listener)
  return () => {
    runtimeAnalysisBackgroundRefreshListeners.delete(listener)
  }
}

function shouldTrackRuntimeTypeScriptDependencies(): boolean {
  return !isProductionEnvironment()
}

function getRuntimeAnalysisScopePath(
  project: Project,
  filePath?: string
): string | undefined {
  const compilerOptions = project.getCompilerOptions() as {
    configFilePath?: string
  }
  if (
    typeof compilerOptions.configFilePath === 'string' &&
    compilerOptions.configFilePath.length > 0
  ) {
    return dirname(compilerOptions.configFilePath)
  }

  if (typeof filePath === 'string' && filePath.length > 0) {
    return dirname(filePath)
  }

  return undefined
}

interface RuntimeAnalysisScopeOptions {
  scopePath?: string
  analysisScopeId?: string
}

function getRuntimeAnalysisScopeOptions(
  project: Project,
  filePath?: string
): RuntimeAnalysisScopeOptions {
  return {
    scopePath: getRuntimeAnalysisScopePath(project, filePath),
    analysisScopeId: getResolvedProjectAnalysisScopeId(project),
  }
}

async function getRuntimeAnalysisSessionUnchecked(
  options?: RuntimeAnalysisScopeOptions
): Promise<
  RuntimeAnalysisCacheStore | undefined
> {
  const runtimeSession = await getSharedRuntimeAnalysisSession(
    undefined,
    options?.scopePath,
    options?.analysisScopeId
  )
  if (!runtimeSession) {
    return undefined
  }

  return {
    ...runtimeSession,
    store: runtimeSession.session.cache,
    snapshot: runtimeSession.session.snapshot,
  }
}

async function getRuntimeAnalysisSessionsUnchecked(
  paths?: Iterable<string>
): Promise<
  RuntimeAnalysisCacheStore[]
> {
  const runtimeSessions = await getSharedRuntimeAnalysisSessions(paths)
  return runtimeSessions.map((runtimeSession) => ({
    ...runtimeSession,
    store: runtimeSession.session.cache,
    snapshot: runtimeSession.session.snapshot,
  }))
}

function enqueueRuntimeAnalysisInvalidation(task: () => Promise<void>): void {
  runtimeAnalysisInvalidationQueue = runtimeAnalysisInvalidationQueue
    .catch(() => {})
    .then(task)
    .catch((error) => {
      debugLogger.debug('Runtime analysis invalidation task failed', () => {
        const errorObject = error as Partial<Error> | undefined
        return {
          operation: 'runtime-analysis-invalidation',
          data: {
            errorName: errorObject?.name ?? 'UnknownError',
            errorMessage:
              typeof errorObject?.message === 'string'
                ? errorObject.message
                : String(error),
          },
        }
      })
    })
}

async function waitForRuntimeAnalysisInvalidations(): Promise<void> {
  await runtimeAnalysisInvalidationQueue
}

async function getRuntimeAnalysisSession(
  options?: RuntimeAnalysisScopeOptions
): Promise<
  RuntimeAnalysisCacheStore | undefined
> {
  await waitForRuntimeAnalysisInvalidations()
  return getRuntimeAnalysisSessionUnchecked(options)
}

export async function prewarmRuntimeAnalysisSession(
  scopePath?: string
): Promise<void> {
  const runtimeScope =
    typeof scopePath === 'string' ? { scopePath } : undefined
  const runtimeCacheStore = await getRuntimeAnalysisSession(runtimeScope)
  if (runtimeCacheStore) {
    markRuntimeAnalysisScopeBootstrapped(runtimeScope)
  }
}

function getOrCreateFallbackAnalysisProjectId(project: Project): string {
  let analysisScopeId = fallbackAnalysisProgramIdByProject.get(project)
  if (analysisScopeId === undefined) {
    fallbackAnalysisProgramIdCounter += 1
    analysisScopeId = fallbackAnalysisProgramIdCounter

    fallbackAnalysisProgramIdByProject.set(project, analysisScopeId)
    fallbackAnalysisProgramCacheRefs.set(analysisScopeId, new WeakRef(project))
    fallbackAnalysisProgramFinalizationRegistry?.register(project, analysisScopeId)
  }

  return `fallback:${analysisScopeId}`
}

function getResolvedProjectAnalysisScopeId(project: Project): string | undefined {
  return getProjectAnalysisScopeId(project) ?? getOrCreateFallbackAnalysisProjectId(project)
}

function createFallbackProgramFileCache<Type>(
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
  getOrCreateFallbackAnalysisProjectId(project)
  return createProgramFileCacheBase(
    project,
    fileName,
    cacheName,
    compute,
    options
  )
}

function forEachFallbackAnalysisProject(
  callback: (project: Project) => void
): void {
  for (const [analysisScopeId, projectRef] of fallbackAnalysisProgramCacheRefs) {
    const project = projectRef.deref()
    if (!project) {
      fallbackAnalysisProgramCacheRefs.delete(analysisScopeId)
      continue
    }

    callback(project)
  }
}

function invalidateFallbackAnalysisCachePaths(paths: Iterable<string>): void {
  forEachFallbackAnalysisProject((project) => {
    invalidateProgramFileCachePaths(project, paths)
  })
}

function invalidateFallbackAnalysisCacheAll(): void {
  forEachFallbackAnalysisProject((project) => {
    invalidateProgramFileCache(project)
  })
}

function isTypeScriptConfigPath(path: string): boolean {
  const normalizedPath = normalizePathKey(path)
  return /(^|\/)tsconfig(\..+)?\.json$/i.test(normalizedPath)
}

function getTypeScriptConfigPathInvalidationKeys(path: string): string[] {
  if (!isTypeScriptConfigPath(path)) {
    return []
  }

  const keys = new Set<string>()
  const normalizedPath = normalizePathKey(path)
  keys.add(normalizedPath)

  if (!normalizedPath.startsWith('/')) {
    keys.add(normalizePathKey(resolve(path)))
  }

  return Array.from(keys.values())
}

function bumpCompilerOptionsVersionEpochForConfigPath(path: string): void {
  for (const configPathKey of getTypeScriptConfigPathInvalidationKeys(path)) {
    compilerOptionsVersionEpochByConfigPath.set(
      configPathKey,
      (compilerOptionsVersionEpochByConfigPath.get(configPathKey) ?? 0) + 1
    )
  }
}

export function invalidateRuntimeAnalysisCachePath(path: string): void {
  invalidateRuntimeAnalysisCachePaths([path])
}

export function invalidateRuntimeAnalysisCachePaths(
  paths: Iterable<string>
): void {
  const pathByNormalizedPath = new Map<string, string>()
  for (const path of paths) {
    if (typeof path !== 'string' || path.length === 0) {
      continue
    }

    const normalizedPath = normalizePathKey(path)
    if (!pathByNormalizedPath.has(normalizedPath)) {
      pathByNormalizedPath.set(normalizedPath, path)
    }
  }

  const normalizedPaths = collapseInvalidationPaths(pathByNormalizedPath.keys())
  if (normalizedPaths.length === 0) {
    return
  }

  const pathsToInvalidate = normalizedPaths.map((normalizedPath) => {
    return pathByNormalizedPath.get(normalizedPath) ?? normalizedPath
  })

  for (const path of pathsToInvalidate) {
    bumpCompilerOptionsVersionEpochForConfigPath(path)
  }

  invalidateFallbackAnalysisCachePaths(pathsToInvalidate)

  enqueueRuntimeAnalysisInvalidation(async () => {
    const runtimeSessions = await getRuntimeAnalysisSessionsUnchecked(
      pathsToInvalidate
    )
    if (runtimeSessions.length === 0) {
      return
    }

    for (const runtimeSession of runtimeSessions) {
      runtimeSession.session.invalidatePaths(pathsToInvalidate)
      await runtimeSession.session.waitForPendingInvalidations()
    }

    queueRuntimeAnalysisSWRPrewarm(pathsToInvalidate, {
      priority: 'immediate',
    })
  })
}

export function invalidateRuntimeAnalysisCacheAll(): void {
  compilerOptionsVersionGlobalEpoch += 1

  invalidateFallbackAnalysisCacheAll()

  enqueueRuntimeAnalysisInvalidation(async () => {
    const runtimeSessions = await getRuntimeAnalysisSessionsUnchecked()
    if (runtimeSessions.length === 0) {
      return
    }

    for (const runtimeSession of runtimeSessions) {
      runtimeSession.session.invalidatePaths(['.'])
      await runtimeSession.session.waitForPendingInvalidations()
    }

    queueRuntimeAnalysisSWRPrewarm(['.'], {
      priority: 'immediate',
    })
  })
}

function toSourceTextMetadataValueSignature(value: string): string {
  return `${hashString(value)}:${value.length}`
}

function toTokenValueSignature(value: string): string {
  return `${hashString(value)}:${value.length}`
}

function getThemeNamesForCache(
  themeConfig: GetTokensOptions['theme']
): string[] {
  if (!themeConfig) {
    return ['default']
  }

  if (typeof themeConfig === 'string') {
    return [themeConfig]
  }

  if (Array.isArray(themeConfig)) {
    const themeValue = themeConfig[0]
    return [themeValue]
  }

  const resolvedThemeNames = Object.values(themeConfig).map((themeValue) =>
    typeof themeValue === 'string' ? themeValue : themeValue[0]
  )

  return resolvedThemeNames.length > 0 ? resolvedThemeNames : ['default']
}

function getThemeSignature(themeConfig: GetTokensOptions['theme']): string {
  return hashString(stableStringify(themeConfig ?? 'default'))
}

function createRuntimeAnalysisCacheNodeKey(
  namespace: string,
  payload: unknown
): string {
  return createPersistentCacheNodeKey({
    domain: RUNTIME_ANALYSIS_CACHE_CONFIG.scope,
    domainVersion: RUNTIME_ANALYSIS_CACHE_CONFIG.version,
    namespace,
    payload,
  })
}

function normalizeCacheFilePath(path: string | undefined): string | undefined {
  if (!path) {
    return undefined
  }

  return normalizePathKey(path)
}

interface SourceFileDependencyLink {
  moduleSpecifier: string
  sourceFilePath?: string
  moduleResolutionNodeKey?: string
}

interface SourceFileDependencyLinksResult {
  links: SourceFileDependencyLink[]
}

interface TypeScriptDependencyAnalysis {
  dependencyFilePaths: string[]
  moduleResolutionNodeKeys: string[]
  packageDependencies: Array<{
    packageName: string
    importerPaths: string[]
  }>
}

interface ModuleSpecifierResolutionResult {
  sourceFilePath?: string
  moduleResolutionNodeKey?: string
}

interface RuntimeTypeScriptDependencyAnalysisResult {
  nodeKey: string
  dependencyFilePaths: string[]
}

interface RuntimeTypeScriptDependencyAnalysisCacheValue {
  dependencyFilePaths: string[]
  moduleResolutionNodeKeys: string[]
  packageDependencyNodeKeys: string[]
  importResolutionFingerprint: string
}

interface RuntimeTypeScriptDependencyFingerprintResult {
  nodeKey: string
  importResolutionFingerprint: string
  directDependencyFilePaths: string[]
  packageManifestDependencyPaths: string[]
}

interface PackageVersionDependencyResolution {
  dependencyFilePaths: string[]
  dependencyNodeKeys: string[]
}

interface CachedPackageVersionDependencyResult {
  nodeKey: string
  dependencyFilePaths: string[]
}

interface PackageManifest {
  version?: unknown
  dependencies?: Record<string, unknown>
  devDependencies?: Record<string, unknown>
  peerDependencies?: Record<string, unknown>
  optionalDependencies?: Record<string, unknown>
}

function normalizeModuleSpecifier(moduleSpecifier: string): string {
  if (moduleSpecifier.startsWith('npm:')) {
    return moduleSpecifier.slice('npm:'.length)
  }

  return moduleSpecifier
}

function getModuleSpecifierTextFromCompilerNode(
  node: TsMorphTS.Node | undefined
): string | undefined {
  if (!node) {
    return undefined
  }

  if (ts.isStringLiteralLike(node)) {
    return node.text
  }

  return undefined
}

function collectSourceFileModuleSpecifiers(sourceFile: SourceFile): string[] {
  const moduleSpecifiers = new Set<string>()
  const addModuleSpecifier = (moduleSpecifier: string | undefined): void => {
    if (!moduleSpecifier || moduleSpecifier.length === 0) {
      return
    }

    moduleSpecifiers.add(moduleSpecifier)
  }

  const visitNode = (node: TsMorphTS.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleSpecifier = getModuleSpecifierTextFromCompilerNode(
        node.moduleSpecifier
      )
      addModuleSpecifier(moduleSpecifier)
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        const moduleSpecifier = getModuleSpecifierTextFromCompilerNode(
          node.moduleReference.expression
        )
        addModuleSpecifier(moduleSpecifier)
      }
    } else if (ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument)) {
        const moduleSpecifier = getModuleSpecifierTextFromCompilerNode(
          node.argument.literal
        )
        addModuleSpecifier(moduleSpecifier)
      }
    }

    ts.forEachChild(node, visitNode)
  }

  visitNode(sourceFile.compilerNode)

  return Array.from(moduleSpecifiers.values())
}

function isModuleSpecifierRelativeOrAbsolute(moduleSpecifier: string): boolean {
  return (
    moduleSpecifier.startsWith('.') ||
    moduleSpecifier.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(moduleSpecifier)
  )
}

function resolveSourceFileByPathCandidates(
  project: Project,
  basePath: string
): string | undefined {
  const candidatePaths = new Set<string>()
  candidatePaths.add(basePath)
  candidatePaths.add(normalizePathKey(basePath))

  for (const extension of RUNTIME_ANALYSIS_CACHE_CONFIG.moduleResolutionFileExtensions) {
    candidatePaths.add(`${basePath}${extension}`)
    candidatePaths.add(normalizePathKey(`${basePath}${extension}`))
    candidatePaths.add(join(basePath, `index${extension}`))
    candidatePaths.add(normalizePathKey(join(basePath, `index${extension}`)))
  }

  for (const candidatePath of candidatePaths) {
    const sourceFile = project.getSourceFile(candidatePath)
    if (sourceFile) {
      return sourceFile.getFilePath()
    }
  }

  return undefined
}

function resolveModuleSpecifierSourceFilePathUncached(
  project: Project,
  containingFilePath: string,
  normalizedModuleSpecifier: string
): string | undefined {
  const resolvedModuleSpecifierSourceFile = project.getSourceFile(
    normalizedModuleSpecifier
  )
  if (resolvedModuleSpecifierSourceFile) {
    return resolvedModuleSpecifierSourceFile.getFilePath()
  }

  if (isModuleSpecifierRelativeOrAbsolute(normalizedModuleSpecifier)) {
    const baseCandidatePath = normalizedModuleSpecifier.startsWith('.')
      ? join(dirname(containingFilePath), normalizedModuleSpecifier)
      : normalizedModuleSpecifier

    const resolvedCandidateSourceFilePath = resolveSourceFileByPathCandidates(
      project,
      baseCandidatePath
    )
    if (resolvedCandidateSourceFilePath) {
      return resolvedCandidateSourceFilePath
    }
  }

  try {
    const resolutionResult = ts.resolveModuleName(
      normalizedModuleSpecifier,
      containingFilePath,
      project.getCompilerOptions(),
      ts.sys
    )
    const resolvedFileName = resolutionResult.resolvedModule?.resolvedFileName
    if (resolvedFileName) {
      const resolvedSourceFile = project.getSourceFile(resolvedFileName)
      return resolvedSourceFile?.getFilePath() ?? resolvedFileName
    }
  } catch (error) {
    reportBestEffortError('analysis/cached-analysis', error)
  }

  return undefined
}

function createRuntimeModuleResolutionCacheNodeKey(payload: {
  compilerOptionsVersion: string
  containingFilePath: string
  moduleSpecifier: string
}): string {
  return createRuntimeAnalysisCacheNodeKey(RUNTIME_ANALYSIS_CACHE_NAMES.moduleResolution, {
    compilerOptionsVersion: payload.compilerOptionsVersion,
    containingFilePath: normalizePathKey(payload.containingFilePath),
    moduleSpecifier: payload.moduleSpecifier,
  })
}

async function resolveModuleSpecifierSourceFilePath(
  project: Project,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  compilerOptionsVersion: string,
  containingFilePath: string,
  moduleSpecifier: string,
  moduleResolutionByKey: Map<string, ModuleSpecifierResolutionResult>
): Promise<ModuleSpecifierResolutionResult> {
  const normalizedModuleSpecifier = normalizeModuleSpecifier(moduleSpecifier)
  if (!normalizedModuleSpecifier) {
    return {}
  }

  const cacheKey = `${normalizePathKey(containingFilePath)}:${normalizedModuleSpecifier}`
  if (moduleResolutionByKey.has(cacheKey)) {
    return moduleResolutionByKey.get(cacheKey) ?? {}
  }

  const shouldUseRuntimeCache =
    isModuleSpecifierRelativeOrAbsolute(normalizedModuleSpecifier) &&
    canUseRuntimePathCache(runtimeCacheStore, containingFilePath)

  if (!shouldUseRuntimeCache) {
    const sourceFilePath = resolveModuleSpecifierSourceFilePathUncached(
      project,
      containingFilePath,
      normalizedModuleSpecifier
    )
    const resolution: ModuleSpecifierResolutionResult = {
      sourceFilePath,
    }
    moduleResolutionByKey.set(cacheKey, resolution)
    return resolution
  }

  const moduleResolutionNodeKey = createRuntimeModuleResolutionCacheNodeKey({
    compilerOptionsVersion,
    containingFilePath,
    moduleSpecifier: normalizedModuleSpecifier,
  })

  const value = await getOrComputeRuntimeAnalysisCacheValue(
    runtimeCacheStore,
    moduleResolutionNodeKey,
    {
      persist: true,
    },
    async (context) => {
      await recordProgramCompilerOptionsDependency(context, runtimeCacheStore, project)
      await recordFileDependencyIfPossible(
        context,
        runtimeCacheStore,
        containingFilePath
      )

      if (isModuleSpecifierRelativeOrAbsolute(normalizedModuleSpecifier)) {
        const baseCandidatePath = normalizedModuleSpecifier.startsWith('.')
          ? join(dirname(containingFilePath), normalizedModuleSpecifier)
          : normalizedModuleSpecifier
        await recordDirectoryDependencyIfPossible(
          context,
          runtimeCacheStore,
          dirname(baseCandidatePath)
        )
      }

      const sourceFilePath = resolveModuleSpecifierSourceFilePathUncached(
        project,
        containingFilePath,
        normalizedModuleSpecifier
      )
      await recordFileDependencyIfPossible(
        context,
        runtimeCacheStore,
        sourceFilePath
      )

      return {
        sourceFilePath: sourceFilePath ?? null,
      }
    }
  )

  const resolution: ModuleSpecifierResolutionResult = {
    sourceFilePath: value.sourceFilePath ?? undefined,
    moduleResolutionNodeKey,
  }
  moduleResolutionByKey.set(cacheKey, resolution)
  return resolution
}

async function getSourceFileDependencyLinks(
  project: Project,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  compilerOptionsVersion: string,
  sourceFile: SourceFile,
  moduleResolutionByKey: Map<string, ModuleSpecifierResolutionResult>
): Promise<SourceFileDependencyLinksResult> {
  const links: SourceFileDependencyLink[] = []
  const seenLinkKeys = new Set<string>()
  const containingFilePath = sourceFile.getFilePath()
  const moduleSpecifiers = collectSourceFileModuleSpecifiers(sourceFile)
  const resolvedModuleSpecifiers = await mapConcurrent(
    moduleSpecifiers,
    {
      concurrency: 16,
    },
    async (moduleSpecifier) => {
      const resolution = await resolveModuleSpecifierSourceFilePath(
        project,
        runtimeCacheStore,
        compilerOptionsVersion,
        containingFilePath,
        moduleSpecifier,
        moduleResolutionByKey
      )
      return {
        moduleSpecifier,
        resolution,
      }
    }
  )

  for (const { moduleSpecifier, resolution } of resolvedModuleSpecifiers) {
    const linkKey = `${moduleSpecifier}:${resolution.sourceFilePath ?? 'missing'}:${resolution.moduleResolutionNodeKey ?? 'none'}`
    if (seenLinkKeys.has(linkKey)) {
      continue
    }
    seenLinkKeys.add(linkKey)

    links.push({
      moduleSpecifier,
      sourceFilePath: resolution.sourceFilePath,
      moduleResolutionNodeKey: resolution.moduleResolutionNodeKey,
    })
  }

  return {
    links,
  }
}

function isWorkspacePath(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  path: string
): boolean {
  try {
    runtimeCacheStore.fileSystem.getRelativePathToWorkspace(path)
    return true
  } catch {
    return false
  }
}

function shouldTraverseDependencySourceFile(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  sourceFile: SourceFile
): boolean {
  if (sourceFile.isFromExternalLibrary()) {
    return false
  }

  const dependencyPath = sourceFile.getFilePath()

  if (normalizePathKey(dependencyPath).includes('/node_modules/')) {
    return false
  }

  return isWorkspacePath(runtimeCacheStore, dependencyPath)
}

function shouldTraverseDependencyPath(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  dependencyPath: string
): boolean {
  if (!isWorkspacePath(runtimeCacheStore, dependencyPath)) {
    return false
  }

  return !normalizePathKey(dependencyPath).includes('/node_modules/')
}

function getOrAddProjectSourceFile(
  project: Project,
  filePath: string
): SourceFile | undefined {
  const existingSourceFile = project.getSourceFile(filePath)
  if (existingSourceFile) {
    return existingSourceFile
  }

  try {
    const addedSourceFile = (
      project as Project & {
        addSourceFileAtPathIfExists?: (path: string) => SourceFile | undefined
      }
    ).addSourceFileAtPathIfExists?.(filePath)
    if (addedSourceFile) {
      return addedSourceFile
    }
  } catch (error) {
    reportBestEffortError('analysis/cached-analysis', error)
  }

  return project.getSourceFile(filePath)
}

function isPathWithinRoot(path: string, rootPath: string): boolean {
  const normalizedPath = normalizePathKey(path)
  const normalizedRootPath = normalizePathKey(rootPath)
  return (
    normalizedPath === normalizedRootPath ||
    normalizedPath.startsWith(`${normalizedRootPath}/`)
  )
}

function getProjectDependencyBoundaryPath(
  project: Project
): string | undefined {
  const compilerOptions = project.getCompilerOptions() as {
    configFilePath?: string
  }
  const configFilePath = compilerOptions.configFilePath
  if (!configFilePath) {
    return undefined
  }

  return dirname(configFilePath)
}

function shouldRecordLocalWorkspaceDependencyPath(options: {
  runtimeCacheStore: RuntimeAnalysisCacheStore
  dependencyPath: string
  moduleSpecifier: string
  projectDependencyBoundaryPath: string | undefined
}): boolean {
  const {
    runtimeCacheStore,
    dependencyPath,
    moduleSpecifier,
    projectDependencyBoundaryPath,
  } = options
  if (!isWorkspacePath(runtimeCacheStore, dependencyPath)) {
    return false
  }

  const normalizedDependencyPath = normalizePathKey(dependencyPath)
  if (normalizedDependencyPath.includes('/node_modules/')) {
    return false
  }

  if (isModuleSpecifierRelativeOrAbsolute(moduleSpecifier)) {
    return true
  }

  if (!projectDependencyBoundaryPath) {
    return true
  }

  return isPathWithinRoot(dependencyPath, projectDependencyBoundaryPath)
}

function shouldCollectFallbackProjectDependencyPath(options: {
  dependencyPath: string
  moduleSpecifier: string
  projectDependencyBoundaryPath: string | undefined
}): boolean {
  const {
    dependencyPath,
    moduleSpecifier,
    projectDependencyBoundaryPath,
  } = options
  const normalizedDependencyPath = normalizePathKey(dependencyPath)

  if (normalizedDependencyPath.includes('/node_modules/')) {
    return false
  }

  if (isModuleSpecifierRelativeOrAbsolute(moduleSpecifier)) {
    return true
  }

  if (!projectDependencyBoundaryPath) {
    return true
  }

  return isPathWithinRoot(dependencyPath, projectDependencyBoundaryPath)
}

function collectFallbackProjectTypeScriptDependencyFilePaths(
  project: Project,
  filePath: string
): string[] {
  const sourceFile = getOrAddProjectSourceFile(project, filePath)
  if (!sourceFile) {
    return []
  }

  const normalizedEntryFilePath = normalizePathKey(filePath)
  const projectDependencyBoundaryPath =
    getProjectDependencyBoundaryPath(project)
  const dependencyPaths = new Set<string>()
  const visitedSourceFilePaths = new Set<string>()
  const sourceFileQueue: SourceFile[] = [sourceFile]

  while (sourceFileQueue.length > 0) {
    const currentSourceFile = sourceFileQueue.shift()!
    const currentSourceFilePath = currentSourceFile.getFilePath()
    const normalizedCurrentSourceFilePath = normalizePathKey(
      currentSourceFilePath
    )

    if (visitedSourceFilePaths.has(normalizedCurrentSourceFilePath)) {
      continue
    }

    visitedSourceFilePaths.add(normalizedCurrentSourceFilePath)

    for (const moduleSpecifier of collectSourceFileModuleSpecifiers(
      currentSourceFile
    )) {
      const normalizedModuleSpecifier = normalizeModuleSpecifier(moduleSpecifier)
      if (!normalizedModuleSpecifier) {
        continue
      }

      const dependencyPath = resolveModuleSpecifierSourceFilePathUncached(
        project,
        currentSourceFilePath,
        normalizedModuleSpecifier
      )
      if (!dependencyPath) {
        continue
      }

      if (
        !shouldCollectFallbackProjectDependencyPath({
          dependencyPath,
          moduleSpecifier: normalizedModuleSpecifier,
          projectDependencyBoundaryPath,
        })
      ) {
        continue
      }

      const normalizedDependencyPath = normalizePathKey(dependencyPath)
      if (normalizedDependencyPath !== normalizedEntryFilePath) {
        dependencyPaths.add(dependencyPath)
      }

      const dependencySourceFile = getOrAddProjectSourceFile(
        project,
        dependencyPath
      )
      if (
        dependencySourceFile &&
        !dependencySourceFile.isFromExternalLibrary() &&
        !normalizedDependencyPath.includes('/node_modules/')
      ) {
        sourceFileQueue.push(dependencySourceFile)
      }
    }
  }

  return Array.from(dependencyPaths.values())
}

function getPackageNameFromModuleSpecifier(
  moduleSpecifier: string | undefined
): string | undefined {
  if (!moduleSpecifier) {
    return undefined
  }

  if (
    moduleSpecifier.startsWith('.') ||
    moduleSpecifier.startsWith('/') ||
    moduleSpecifier.startsWith('#') ||
    moduleSpecifier.startsWith('node:')
  ) {
    return undefined
  }

  if (/^[A-Za-z]:[\\/]/.test(moduleSpecifier)) {
    return undefined
  }

  const normalizedSpecifier = normalizeModuleSpecifier(moduleSpecifier)

  if (!normalizedSpecifier) {
    return undefined
  }

  if (normalizedSpecifier.startsWith('@')) {
    const [scope, packageName] = normalizedSpecifier.split('/')
    if (!scope || scope === '@' || !packageName) {
      return undefined
    }

    return `${scope}/${packageName}`
  }

  const [packageName] = normalizedSpecifier.split('/')
  return packageName || undefined
}

async function collectTypeScriptDependencyAnalysis(
  project: Project,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  filePath: string
): Promise<TypeScriptDependencyAnalysis> {
  const sourceFile = project.getSourceFile(filePath)
  const projectDependencyBoundaryPath =
    getProjectDependencyBoundaryPath(project)
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (!sourceFile) {
    return {
      dependencyFilePaths: [],
      moduleResolutionNodeKeys: [],
      packageDependencies: [],
    }
  }

  const dependencyPaths = new Set<string>()
  const moduleResolutionNodeKeys = new Set<string>()
  const packageImportersByName = new Map<string, Set<string>>()
  const visitedSourceFilePaths = new Set<string>()
  const sourceFileQueue: SourceFile[] = [sourceFile]
  const moduleResolutionByKey = new Map<
    string,
    ModuleSpecifierResolutionResult
  >()
  const dependencyLinksBySourceFilePath = new Map<
    string,
    Promise<SourceFileDependencyLinksResult>
  >()
  let dependencyAnalysisLimitReached = false

  const getDependencyLinksForSourceFile = (
    targetSourceFile: SourceFile
  ): Promise<SourceFileDependencyLinksResult> => {
    const sourceFilePathKey = normalizePathKey(targetSourceFile.getFilePath())
    const cachedLinks = dependencyLinksBySourceFilePath.get(sourceFilePathKey)
    if (cachedLinks) {
      return cachedLinks
    }

    const resolvedLinks = getSourceFileDependencyLinks(
      project,
      runtimeCacheStore,
      compilerOptionsVersion,
      targetSourceFile,
      moduleResolutionByKey
    )
    dependencyLinksBySourceFilePath.set(sourceFilePathKey, resolvedLinks)
    return resolvedLinks
  }

  while (sourceFileQueue.length > 0) {
    if (visitedSourceFilePaths.size >= RUNTIME_ANALYSIS_CACHE_CONFIG.maxTypeScriptDependencyAnalysisFiles) {
      dependencyAnalysisLimitReached = true
      break
    }

    const currentSourceFile = sourceFileQueue.shift()!
    const currentSourceFilePath = currentSourceFile.getFilePath()
    const normalizedCurrentSourceFilePath = normalizePathKey(
      currentSourceFilePath
    )

    if (visitedSourceFilePaths.has(normalizedCurrentSourceFilePath)) {
      continue
    }

    visitedSourceFilePaths.add(normalizedCurrentSourceFilePath)

    for (const link of (
      await getDependencyLinksForSourceFile(currentSourceFile)
    ).links) {
      if (link.moduleResolutionNodeKey) {
        moduleResolutionNodeKeys.add(link.moduleResolutionNodeKey)
      }

      const dependencyPath = link.sourceFilePath
      const normalizedDependencyPath =
        typeof dependencyPath === 'string'
          ? normalizePathKey(dependencyPath)
          : undefined
      const isLocalWorkspaceDependencyPath =
        normalizedDependencyPath !== undefined &&
        typeof dependencyPath === 'string' &&
        shouldRecordLocalWorkspaceDependencyPath({
          runtimeCacheStore,
          dependencyPath,
          moduleSpecifier: link.moduleSpecifier,
          projectDependencyBoundaryPath,
        })

      if (isLocalWorkspaceDependencyPath && dependencyPath) {
        dependencyPaths.add(dependencyPath)
      }

      if (isLocalWorkspaceDependencyPath && dependencyPath) {
        const dependencySourceFile = getOrAddProjectSourceFile(
          project,
          dependencyPath
        )
        if (
          dependencySourceFile &&
          shouldTraverseDependencySourceFile(
            runtimeCacheStore,
            dependencySourceFile
          ) &&
          shouldTraverseDependencyPath(runtimeCacheStore, dependencyPath)
        ) {
          sourceFileQueue.push(dependencySourceFile)
        }
      }

      if (isLocalWorkspaceDependencyPath) {
        continue
      }

      const packageName = getPackageNameFromModuleSpecifier(
        link.moduleSpecifier
      )
      if (!packageName) {
        continue
      }

      let importerPaths = packageImportersByName.get(packageName)
      if (!importerPaths) {
        importerPaths = new Set<string>()
        packageImportersByName.set(packageName, importerPaths)
      }
      importerPaths.add(currentSourceFilePath)
    }
  }

  if (dependencyAnalysisLimitReached) {
    for (const projectSourceFile of project.getSourceFiles()) {
      const projectSourceFilePath = projectSourceFile.getFilePath()
      if (!isWorkspacePath(runtimeCacheStore, projectSourceFilePath)) {
        continue
      }
      if (
        normalizePathKey(projectSourceFilePath).includes('/node_modules/')
      ) {
        continue
      }
      if (
        projectDependencyBoundaryPath &&
        !isPathWithinRoot(projectSourceFilePath, projectDependencyBoundaryPath)
      ) {
        continue
      }
      dependencyPaths.add(projectSourceFilePath)

      for (const link of (
        await getDependencyLinksForSourceFile(projectSourceFile)
      ).links) {
        if (link.moduleResolutionNodeKey) {
          moduleResolutionNodeKeys.add(link.moduleResolutionNodeKey)
        }

        const dependencyPath = link.sourceFilePath
        const normalizedDependencyPath =
          typeof dependencyPath === 'string'
            ? normalizePathKey(dependencyPath)
            : undefined
        const isLocalWorkspaceDependencyPath =
          typeof dependencyPath === 'string' &&
          normalizedDependencyPath !== undefined &&
          shouldRecordLocalWorkspaceDependencyPath({
            runtimeCacheStore,
            dependencyPath,
            moduleSpecifier: link.moduleSpecifier,
            projectDependencyBoundaryPath,
          })
        if (isLocalWorkspaceDependencyPath) {
          continue
        }

        const packageName = getPackageNameFromModuleSpecifier(
          link.moduleSpecifier
        )
        if (!packageName) {
          continue
        }

        let importerPaths = packageImportersByName.get(packageName)
        if (!importerPaths) {
          importerPaths = new Set<string>()
          packageImportersByName.set(packageName, importerPaths)
        }

        importerPaths.add(projectSourceFilePath)
      }
    }
  }

  const packageDependencies = Array.from(packageImportersByName.entries())
    .map(([packageName, importerPaths]) => ({
      packageName,
      importerPaths: Array.from(importerPaths.values()).sort((a, b) =>
        a.localeCompare(b)
      ),
    }))
    .sort((a, b) => a.packageName.localeCompare(b.packageName))

  return {
    dependencyFilePaths: Array.from(dependencyPaths.values()),
    moduleResolutionNodeKeys: Array.from(moduleResolutionNodeKeys.values()),
    packageDependencies,
  }
}

function getDependencyVersionFromPackageManifest(
  packageManifest: PackageManifest,
  packageName: string
): string | undefined {
  const dependencyGroups = [
    packageManifest.dependencies,
    packageManifest.devDependencies,
    packageManifest.peerDependencies,
    packageManifest.optionalDependencies,
  ]

  for (const dependencyGroup of dependencyGroups) {
    const dependencyVersion = dependencyGroup?.[packageName]
    if (typeof dependencyVersion === 'string' && dependencyVersion.length > 0) {
      return dependencyVersion
    }
  }

  return undefined
}

function readPackageManifest(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  packageManifestByPath: Map<string, PackageManifest | null>,
  packageManifestPath: string
): PackageManifest | null {
  const normalizedPackageManifestPath = normalizePathKey(packageManifestPath)
  const cachedPackageManifest = packageManifestByPath.get(
    normalizedPackageManifestPath
  )

  if (cachedPackageManifest !== undefined) {
    return cachedPackageManifest
  }

  try {
    if (!runtimeCacheStore.fileSystem.fileExistsSync(packageManifestPath)) {
      packageManifestByPath.set(normalizedPackageManifestPath, null)
      return null
    }

    const contents =
      runtimeCacheStore.fileSystem.readFileSync(packageManifestPath)
    const parsedManifest = JSON.parse(contents) as PackageManifest
    if (!parsedManifest || typeof parsedManifest !== 'object') {
      packageManifestByPath.set(normalizedPackageManifestPath, null)
      return null
    }

    packageManifestByPath.set(normalizedPackageManifestPath, parsedManifest)
    return parsedManifest
  } catch {
    packageManifestByPath.set(normalizedPackageManifestPath, null)
    return null
  }
}

function getWorkspaceRootPath(
  runtimeCacheStore: RuntimeAnalysisCacheStore
): string | undefined {
  try {
    return getRootDirectory(runtimeCacheStore.fileSystem.getAbsolutePath('.'))
  } catch {
    return undefined
  }
}

function getAncestorDirectoriesInWorkspace(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  workspaceRootPath: string,
  filePath: string
): string[] {
  const directories: string[] = []

  try {
    let currentDirectory = dirname(
      runtimeCacheStore.fileSystem.getAbsolutePath(filePath)
    )
    const normalizedWorkspaceRoot = normalizePathKey(workspaceRootPath)

    while (true) {
      const normalizedCurrentDirectory = normalizePathKey(currentDirectory)
      const isWithinWorkspaceRoot =
        normalizedCurrentDirectory === normalizedWorkspaceRoot ||
        normalizedCurrentDirectory.startsWith(`${normalizedWorkspaceRoot}/`)
      if (!isWithinWorkspaceRoot) {
        break
      }

      directories.push(currentDirectory)

      if (normalizedCurrentDirectory === normalizedWorkspaceRoot) {
        break
      }

      const parentDirectory = dirname(currentDirectory)
      if (parentDirectory === currentDirectory) {
        break
      }
      currentDirectory = parentDirectory
    }
  } catch {
    return []
  }

  return directories
}

function resolveDeclaredPackageManifestPath(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  packageManifestByPath: Map<string, PackageManifest | null>,
  workspaceRootPath: string,
  filePath: string,
  packageName: string
): string | undefined {
  for (const directoryPath of getAncestorDirectoriesInWorkspace(
    runtimeCacheStore,
    workspaceRootPath,
    filePath
  )) {
    const packageManifestPath = join(directoryPath, 'package.json')
    const packageManifest = readPackageManifest(
      runtimeCacheStore,
      packageManifestByPath,
      packageManifestPath
    )
    if (!packageManifest) {
      continue
    }

    const dependencyVersion = getDependencyVersionFromPackageManifest(
      packageManifest,
      packageName
    )

    if (dependencyVersion) {
      return packageManifestPath
    }
  }

  return undefined
}

function resolveInstalledPackageManifestPath(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  packageManifestByPath: Map<string, PackageManifest | null>,
  workspaceRootPath: string,
  filePath: string,
  packageName: string
): string | undefined {
  const packagePathSegments = packageName.split('/')

  for (const directoryPath of getAncestorDirectoriesInWorkspace(
    runtimeCacheStore,
    workspaceRootPath,
    filePath
  )) {
    const installedPackageManifestPath = join(
      directoryPath,
      'node_modules',
      ...packagePathSegments,
      'package.json'
    )
    const packageManifest = readPackageManifest(
      runtimeCacheStore,
      packageManifestByPath,
      installedPackageManifestPath
    )

    if (!packageManifest) {
      continue
    }

    return installedPackageManifestPath
  }

  return undefined
}

function createRuntimePackageVersionDependencyCacheNodeKey(payload: {
  compilerOptionsVersion: string
  importerPath: string
  packageName: string
}): string {
  return createRuntimeAnalysisCacheNodeKey(
    RUNTIME_ANALYSIS_CACHE_NAMES.packageVersionDependency,
    {
      compilerOptionsVersion: payload.compilerOptionsVersion,
      importerPath: normalizePathKey(payload.importerPath),
      packageName: payload.packageName,
    }
  )
}

async function resolveCachedPackageVersionDependencyForImporter(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  compilerOptionsVersion: string,
  packageName: string,
  importerPath: string
): Promise<CachedPackageVersionDependencyResult | undefined> {
  const workspaceRootPath = getWorkspaceRootPath(runtimeCacheStore)
  if (!workspaceRootPath) {
    return undefined
  }

  const nodeKey = createRuntimePackageVersionDependencyCacheNodeKey({
    compilerOptionsVersion,
    importerPath,
    packageName,
  })
  const packagePathSegments = packageName.split('/')
  const scopeSegment = packagePathSegments[0]?.startsWith('@')
    ? packagePathSegments[0]
    : undefined

  const value = await getOrComputeRuntimeAnalysisCacheValue(
    runtimeCacheStore,
    nodeKey,
    {
      persist: true,
    },
    async (context) => {
      await recordFileDependencyIfPossible(
        context,
        runtimeCacheStore,
        importerPath
      )

      const ancestorDirectories = getAncestorDirectoriesInWorkspace(
        runtimeCacheStore,
        workspaceRootPath,
        importerPath
      )
      for (const directoryPath of ancestorDirectories) {
        await recordDirectoryDependencyIfPossible(
          context,
          runtimeCacheStore,
          directoryPath
        )

        const nodeModulesPath = join(directoryPath, 'node_modules')
        await recordDirectoryDependencyIfPossible(
          context,
          runtimeCacheStore,
          nodeModulesPath
        )

        if (scopeSegment) {
          await recordDirectoryDependencyIfPossible(
            context,
            runtimeCacheStore,
            join(nodeModulesPath, scopeSegment)
          )
        }
      }

      const packageManifestByPath = new Map<string, PackageManifest | null>()
      const declaredPackageManifestPath = resolveDeclaredPackageManifestPath(
        runtimeCacheStore,
        packageManifestByPath,
        workspaceRootPath,
        importerPath,
        packageName
      )
      const installedPackageManifestPath = resolveInstalledPackageManifestPath(
        runtimeCacheStore,
        packageManifestByPath,
        workspaceRootPath,
        importerPath,
        packageName
      )

      const dependencyFilePaths = Array.from(
        new Set(
          [declaredPackageManifestPath, installedPackageManifestPath].filter(
            (path): path is string => typeof path === 'string'
          )
        )
      )
      await recordFileDependenciesIfPossible(
        context,
        runtimeCacheStore,
        dependencyFilePaths
      )

      return {
        dependencyFilePaths,
      }
    }
  )

  return {
    nodeKey,
    dependencyFilePaths: value.dependencyFilePaths,
  }
}

async function resolvePackageVersionDependencies(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  compilerOptionsVersion: string,
  packageDependencies: TypeScriptDependencyAnalysis['packageDependencies']
): Promise<PackageVersionDependencyResolution> {
  if (packageDependencies.length === 0) {
    return {
      dependencyFilePaths: [],
      dependencyNodeKeys: [],
    }
  }

  const dependencyFilePaths = new Set<string>()
  const dependencyNodeKeys = new Set<string>()
  const resolveRequests: Array<{ packageName: string; importerPath: string }> =
    []

  for (const packageDependency of packageDependencies) {
    for (const importerPath of packageDependency.importerPaths) {
      resolveRequests.push({
        packageName: packageDependency.packageName,
        importerPath,
      })
    }
  }

  const resolvedDependencies = await mapConcurrent(
    resolveRequests,
    {
      concurrency: 20,
    },
    ({ packageName, importerPath }) =>
      resolveCachedPackageVersionDependencyForImporter(
        runtimeCacheStore,
        compilerOptionsVersion,
        packageName,
        importerPath
      )
  )
  for (const resolvedDependency of resolvedDependencies) {
    if (!resolvedDependency) {
      continue
    }

    dependencyNodeKeys.add(resolvedDependency.nodeKey)
    for (const dependencyFilePath of resolvedDependency.dependencyFilePaths) {
      dependencyFilePaths.add(dependencyFilePath)
    }
  }

  return {
    dependencyFilePaths: Array.from(dependencyFilePaths.values()),
    dependencyNodeKeys: Array.from(dependencyNodeKeys.values()),
  }
}

async function getCachedRuntimeTypeScriptDependencyAnalysis(
  project: Project,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  filePath: string | undefined,
  compilerOptionsVersionProp?: string
): Promise<RuntimeTypeScriptDependencyAnalysisResult | undefined> {
  if (!filePath) {
    return undefined
  }

  const compilerOptionsVersion =
    compilerOptionsVersionProp ?? getCompilerOptionsVersion(project)
  const nodeKey = createRuntimeTypeScriptDependencyAnalysisCacheNodeKey(
    filePath,
    compilerOptionsVersion
  )
  const dedupeKey = createRuntimeTypeScriptDependencyTrackingDedupeKey(
    runtimeCacheStore,
    filePath,
    compilerOptionsVersion
  )
  const pending = runtimeTypeScriptDependencyAnalysisInFlightByKey.get(dedupeKey)
  if (pending) {
    return pending
  }

  const task = getOrComputeRuntimeAnalysisCacheValue(
    runtimeCacheStore,
    nodeKey,
    {
      persist: true,
    },
    async (context) => {
        await recordProgramCompilerOptionsDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          filePath
        )

        const dependencyFingerprint =
          await getCachedRuntimeTypeScriptDependencyFingerprint(
            project,
            runtimeCacheStore,
            filePath,
            compilerOptionsVersion
          )
        if (dependencyFingerprint) {
          await context.recordNodeDep(dependencyFingerprint.nodeKey)
        }

        const previousAnalysis =
          await runtimeCacheStore.store.getWithFreshness<RuntimeTypeScriptDependencyAnalysisCacheValue>(
            nodeKey
          )
        const previousValue =
          previousAnalysis.fresh === false ? previousAnalysis.value : undefined

        if (
          previousValue &&
          dependencyFingerprint &&
          previousValue.importResolutionFingerprint ===
            dependencyFingerprint.importResolutionFingerprint
        ) {
          for (const moduleResolutionNodeKey of previousValue.moduleResolutionNodeKeys) {
            await context.recordNodeDep(moduleResolutionNodeKey)
          }
          for (const packageDependencyNodeKey of previousValue.packageDependencyNodeKeys) {
            await context.recordNodeDep(packageDependencyNodeKey)
          }

          await recordFileDependenciesIfPossible(
            context,
            runtimeCacheStore,
            previousValue.dependencyFilePaths
          )

          return previousValue
        }

        const typeScriptDependencies = await collectTypeScriptDependencyAnalysis(
          project,
          runtimeCacheStore,
          filePath
        )

        for (const moduleResolutionNodeKey of typeScriptDependencies.moduleResolutionNodeKeys) {
          await context.recordNodeDep(moduleResolutionNodeKey)
        }

        const packageVersionDependencies =
          await resolvePackageVersionDependencies(
            runtimeCacheStore,
            compilerOptionsVersion,
            typeScriptDependencies.packageDependencies
          )

        for (const packageDependencyNodeKey of packageVersionDependencies.dependencyNodeKeys) {
          await context.recordNodeDep(packageDependencyNodeKey)
        }

        const dependencyFilePaths = Array.from(
          new Set<string>([
            ...typeScriptDependencies.dependencyFilePaths,
            ...packageVersionDependencies.dependencyFilePaths,
          ])
        )

        await recordFileDependenciesIfPossible(
          context,
          runtimeCacheStore,
          dependencyFilePaths
        )

        return {
          dependencyFilePaths,
          moduleResolutionNodeKeys: typeScriptDependencies.moduleResolutionNodeKeys,
          packageDependencyNodeKeys: packageVersionDependencies.dependencyNodeKeys,
          importResolutionFingerprint:
            dependencyFingerprint?.importResolutionFingerprint ??
            hashString(
              stableStringify({
                compilerOptionsVersion,
                filePath: normalizeCacheFilePath(filePath) ?? null,
                dependencyFilePaths: dependencyFilePaths
                  .slice()
                  .sort((first, second) => first.localeCompare(second)),
              })
            ),
        }
      }
    )
    .then((value) => ({
      nodeKey,
      dependencyFilePaths: value.dependencyFilePaths,
    }))
    .finally(() => {
      if (
        runtimeTypeScriptDependencyAnalysisInFlightByKey.get(dedupeKey) === task
      ) {
        runtimeTypeScriptDependencyAnalysisInFlightByKey.delete(dedupeKey)
      }
    })

  runtimeTypeScriptDependencyAnalysisInFlightByKey.set(dedupeKey, task)
  return task
}

export async function getCachedTypeScriptDependencyPaths(
  project: Project,
  filePath: string
): Promise<string[]> {
  const dependencyPaths = new Set<string>([filePath])
  const runtimeScope = getRuntimeAnalysisScopeOptions(project, filePath)
  const runtimeCacheStore = await getRuntimeAnalysisSession(runtimeScope)

  if (
    runtimeCacheStore &&
    shouldTrackRuntimeTypeScriptDependenciesForPath(
      runtimeCacheStore,
      project,
      filePath
    )
  ) {
    const dependencyAnalysis = await getCachedRuntimeTypeScriptDependencyAnalysis(
      project,
      runtimeCacheStore,
      filePath,
      getCompilerOptionsVersion(project)
    )

    for (const dependencyPath of dependencyAnalysis?.dependencyFilePaths ?? []) {
      dependencyPaths.add(dependencyPath)
    }

    return Array.from(dependencyPaths.values())
  }

  for (const dependencyPath of collectFallbackProjectTypeScriptDependencyFilePaths(
    project,
    filePath
  )) {
    dependencyPaths.add(dependencyPath)
  }

  return Array.from(dependencyPaths.values())
}

function recordConstDependencies(
  context: CacheStoreComputeContext,
  constDeps: readonly CacheStoreConstDependency[]
): void {
  for (const constDependency of constDeps) {
    context.recordConstDep(constDependency.name, constDependency.version)
  }
}

function getOrComputeRuntimeAnalysisCacheValue<Value>(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  nodeKey: string,
  options: Omit<CacheStoreGetOrComputeOptions, 'constDeps'>,
  compute: (context: CacheStoreComputeContext) => Promise<Value> | Value
): Promise<Value> {
  const runtimeConstDeps = getRuntimeAnalysisConstDeps()
  return runtimeCacheStore.store.getOrCompute(
    nodeKey,
    {
      ...options,
      constDeps: runtimeConstDeps,
    },
    async (context) => {
      recordConstDependencies(context, runtimeConstDeps)
      return compute(context)
    }
  )
}

function refreshRuntimeAnalysisCacheValue<Value>(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  nodeKey: string,
  options: Omit<CacheStoreGetOrComputeOptions, 'constDeps'>,
  compute: (context: CacheStoreComputeContext) => Promise<Value> | Value
): Promise<Value> {
  const runtimeConstDeps = getRuntimeAnalysisConstDeps()
  return runtimeCacheStore.store.refresh(
    nodeKey,
    {
      ...options,
      constDeps: runtimeConstDeps,
    },
    async (context) => {
      recordConstDependencies(context, runtimeConstDeps)
      return compute(context)
    }
  )
}

async function recordFileDependenciesIfPossible(
  context: CacheStoreComputeContext,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  filePaths: readonly string[]
): Promise<void> {
  for (const filePath of filePaths) {
    await recordFileDependencyIfPossible(context, runtimeCacheStore, filePath)
  }
}

async function recordFileDependencyIfPossible(
  context: CacheStoreComputeContext,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  path: string | undefined
): Promise<void> {
  if (!path) {
    return
  }

  try {
    const absolutePath = runtimeCacheStore.fileSystem.getAbsolutePath(path)
    await context.recordFileDep(absolutePath)
  } catch (error) {
    reportBestEffortError('analysis/cached-analysis', error)
  }
}

async function recordDirectoryDependencyIfPossible(
  context: CacheStoreComputeContext,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  path: string | undefined
): Promise<void> {
  if (!path) {
    return
  }

  try {
    const absolutePath = runtimeCacheStore.fileSystem.getAbsolutePath(path)
    await context.recordDirectoryDep(absolutePath)
  } catch (error) {
    reportBestEffortError('analysis/cached-analysis', error)
  }
}

async function resolveProgramConfigDependencyVersion(options: {
  runtimeCacheStore: RuntimeAnalysisCacheStore
  configFilePath: string
}): Promise<{ name: string; version: string } | undefined> {
  const { runtimeCacheStore, configFilePath } = options

  try {
    const absoluteConfigPath =
      runtimeCacheStore.fileSystem.getAbsolutePath(configFilePath)
    const normalizedConfigPath = normalizePathKey(absoluteConfigPath)
    const contentId = await runtimeCacheStore.snapshot.contentId(
      normalizedConfigPath
    )
    const dependencyKey = `${runtimeCacheStore.snapshot.id}:${normalizedConfigPath}`
    const cached = programConfigDependencyVersionByKey.get(dependencyKey)
    if (cached && cached.contentId === contentId) {
      return {
        name: `project-config:${normalizedConfigPath}`,
        version: cached.version,
      }
    }

    let version = contentId
    try {
      const fileContents =
        await runtimeCacheStore.snapshot.readFile(normalizedConfigPath)
      version = `${HASH_STRING_ALGORITHM}:${hashString(fileContents)}:${fileContents.length}`
    } catch (error) {
      reportBestEffortError('analysis/cached-analysis', error)
    }

    programConfigDependencyVersionByKey.set(dependencyKey, {
      contentId,
      version,
    })

    return {
      name: `project-config:${normalizedConfigPath}`,
      version,
    }
  } catch {
    return undefined
  }
}

async function recordProgramCompilerOptionsDependency(
  context: CacheStoreComputeContext,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  project: Project
): Promise<void> {
  const { paths: configPaths } = getProgramCompilerOptionsConfigPaths(project)

  for (const configPath of configPaths) {
    const programConfigDependency = await resolveProgramConfigDependencyVersion({
      runtimeCacheStore,
      configFilePath: configPath,
    })
    if (!programConfigDependency) {
      continue
    }

    context.recordConstDep(
      programConfigDependency.name,
      programConfigDependency.version
    )
  }
}

function getCompilerOptionsEpochForConfigPathKeys(
  configPathKeys: readonly string[]
): number {
  let epoch = compilerOptionsVersionGlobalEpoch

  for (const configPathKey of configPathKeys) {
    epoch += compilerOptionsVersionEpochByConfigPath.get(configPathKey) ?? 0
  }

  return epoch
}

function getProgramCompilerOptionsConfigPaths(project: Project): {
  paths: string[]
  pathKeys: string[]
  pathKeySignature: string
} {
  const cachedConfigPaths = compilerOptionsConfigPathsByProject.get(project)
  if (cachedConfigPaths) {
    const epoch = getCompilerOptionsEpochForConfigPathKeys(
      cachedConfigPaths.pathKeys
    )
    if (cachedConfigPaths.epoch === epoch) {
      return {
        paths: cachedConfigPaths.paths,
        pathKeys: cachedConfigPaths.pathKeys,
        pathKeySignature: cachedConfigPaths.pathKeySignature,
      }
    }
  }

  const configFilePath = (project.getCompilerOptions() as {
    configFilePath?: string
  }).configFilePath
  const paths = getTypeScriptConfigDependencyPaths(configFilePath)
  const pathKeys = paths.map((path) => normalizePathKey(path))
  const pathKeySignature = stableStringify(pathKeys)
  const epoch = getCompilerOptionsEpochForConfigPathKeys(pathKeys)

  compilerOptionsConfigPathsByProject.set(project, {
    paths,
    pathKeys,
    pathKeySignature,
    epoch,
  })

  return {
    paths,
    pathKeys,
    pathKeySignature,
  }
}

function getCompilerOptionsVersion(project: Project): string {
  const compilerOptions = project.getCompilerOptions() as {
    configFilePath?: string
  }
  const { pathKeys, pathKeySignature } = getProgramCompilerOptionsConfigPaths(
    project
  )
  const epoch = getCompilerOptionsEpochForConfigPathKeys(pathKeys)
  const cachedVersion = compilerOptionsVersionByProject.get(project)
  if (
    cachedVersion &&
    cachedVersion.epoch === epoch &&
    cachedVersion.configPathKeySignature === pathKeySignature
  ) {
    return cachedVersion.version
  }

  const version = hashString(
    stableStringify({
      analysisScopeId: getResolvedProjectAnalysisScopeId(project) ?? null,
      compilerOptions,
    })
  )
  compilerOptionsVersionByProject.set(project, {
    version,
    configPathKeySignature: pathKeySignature,
    epoch,
  })
  return version
}

function getMetadataCollectorCacheKey(
  metadataCollector: GetTokensOptions['metadataCollector']
): string | null {
  if (!metadataCollector) {
    return null
  }

  let cacheKey = metadataCollectorCacheKeyByCollector.get(metadataCollector)
  if (!cacheKey) {
    nextMetadataCollectorCacheKey += 1
    cacheKey = `collector:${nextMetadataCollectorCacheKey}`
    metadataCollectorCacheKeyByCollector.set(metadataCollector, cacheKey)
  }

  return cacheKey
}

function canUseRuntimePathCache(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  path: string
): boolean {
  try {
    const absolutePath = runtimeCacheStore.fileSystem.getAbsolutePath(path)
    runtimeCacheStore.fileSystem.getRelativePathToWorkspace(absolutePath)
    return runtimeCacheStore.fileSystem.fileExistsSync(absolutePath)
  } catch {
    return false
  }
}

function canUseRuntimeTypeScriptDependencySourceFile(
  project: Project,
  filePath: string
): boolean {
  return project.getSourceFile(filePath) !== undefined
}

function shouldTrackRuntimeTypeScriptDependenciesForPath(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  project: Project,
  filePath: string | undefined
): filePath is string {
  if (!filePath) {
    return false
  }

  if (canUseRuntimePathCache(runtimeCacheStore, filePath)) {
    return true
  }

  try {
    const absolutePath = runtimeCacheStore.fileSystem.getAbsolutePath(filePath)
    runtimeCacheStore.fileSystem.getRelativePathToWorkspace(absolutePath)
  } catch {
    return false
  }

  return canUseRuntimeTypeScriptDependencySourceFile(project, filePath)
}

function resolveRuntimeTypeScriptDependencyAnalysisPath(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  project: Project,
  filePaths: Array<string | undefined>
): string | undefined {
  const seenPaths = new Set<string>()

  for (const filePath of filePaths) {
    if (!filePath || seenPaths.has(filePath)) {
      continue
    }

    seenPaths.add(filePath)
    if (
      shouldTrackRuntimeTypeScriptDependenciesForPath(
        runtimeCacheStore,
        project,
        filePath
      )
    ) {
      return filePath
    }
  }

  return undefined
}

function getRuntimeAnalysisConstDeps(): CacheStoreConstDependency[] {
  return [...RUNTIME_ANALYSIS_CONST_DEPS]
}

function getRuntimeCacheReuseProfileTarget(options: {
  filePath?: string
  fallback: string
}): string {
  return normalizeCacheFilePath(options.filePath) ?? options.fallback
}

function getCacheContentIdKindForProfile(version: string | undefined): string {
  if (!version) {
    return 'unknown'
  }
  if (version === 'missing') {
    return 'missing'
  }
  if (version.startsWith('mtime:')) {
    return 'mtime'
  }
  if (version.startsWith(`${HASH_STRING_ALGORITHM}:`)) {
    return HASH_STRING_ALGORITHM
  }
  if (version.startsWith('dir:')) {
    return 'dir'
  }
  return 'other'
}

function getCacheDepKeyKindForProfile(depKey: string): string {
  if (depKey.startsWith('const:')) {
    const encodedConstName = depKey.slice('const:'.length)
    let constName = encodedConstName
    try {
      constName = decodeURIComponent(encodedConstName)
    } catch (error) {
      reportBestEffortError('analysis/cached-analysis', error)
    }

    if (
      constName === RUNTIME_ANALYSIS_CACHE_CONFIG.programCompilerOptionsDependency ||
      constName.startsWith(`${RUNTIME_ANALYSIS_CACHE_CONFIG.programCompilerOptionsDependency}:`)
    ) {
      return 'const:program:compiler-options'
    }
    if (constName === RUNTIME_ANALYSIS_CACHE_CONFIG.versionDependency) {
      return 'const:runtime-analysis-cache-version'
    }
    return `const:${constName}`
  }

  if (depKey.startsWith('file:')) {
    const path = depKey.slice('file:'.length)
    if (path.endsWith('/tsconfig.json') || path.includes('/tsconfig.')) {
      return 'file:project-config'
    }
    if (path.startsWith('_renoun/') || path.includes('/_renoun/')) {
      return 'file:inline-generated'
    }
    if (path.endsWith('/package.json')) {
      return 'file:package-manifest'
    }
    return 'file:other'
  }

  if (depKey.startsWith('dir:')) {
    return 'dir:other'
  }

  if (depKey.startsWith('node:')) {
    if (depKey.includes(RUNTIME_ANALYSIS_CACHE_NAMES.typeScriptDependencyAnalysis)) {
      return 'node:ts-dependency-analysis'
    }
    if (depKey.includes(RUNTIME_ANALYSIS_CACHE_NAMES.typeScriptDependencyFingerprint)) {
      return 'node:ts-dependency-fingerprint'
    }
    if (depKey.includes(RUNTIME_ANALYSIS_CACHE_NAMES.moduleResolution)) {
      return 'node:module-resolution'
    }
    return 'node:other'
  }

  return 'other'
}

function toRuntimeCacheReuseStaleReason(
  staleReason: CacheStoreFreshnessMismatch | 'graph-dirty' | undefined
): string | undefined {
  if (!staleReason) {
    return undefined
  }
  if (staleReason === 'graph-dirty') {
    return 'graph-dirty'
  }

  const dependencyKind = getCacheDepKeyKindForProfile(staleReason.depKey)
  const expectedKind = getCacheContentIdKindForProfile(
    staleReason.expectedVersion
  )
  const currentKind = getCacheContentIdKindForProfile(staleReason.currentVersion)
  return `${dependencyKind}:${expectedKind}->${currentKind}`
}

async function profileRuntimeCacheReuse(options: {
  method: 'getSourceTextMetadata' | 'getTokens'
  runtimeCacheStore: RuntimeAnalysisCacheStore | undefined
  nodeKey: string | undefined
  target: string
}): Promise<void> {
  if (!isRpcBuildProfileEnabled()) {
    return
  }

  if (!options.runtimeCacheStore || !options.nodeKey) {
    recordRpcCacheReuse({
      method: options.method,
      outcome: 'unavailable',
      target: options.target,
    })
    return
  }

  try {
    const freshness = await options.runtimeCacheStore.store.getWithFreshness(
      options.nodeKey,
      {
        includeStaleReason: true,
      }
    )
    if (freshness.value === undefined) {
      recordRpcCacheReuse({
        method: options.method,
        outcome: 'miss',
        target: options.target,
      })
      return
    }

    recordRpcCacheReuse({
      method: options.method,
      outcome: freshness.fresh ? 'hit' : 'stale',
      target: options.target,
    })
    if (!freshness.fresh) {
      const staleReason = toRuntimeCacheReuseStaleReason(freshness.staleReason)
      if (staleReason) {
        recordRpcCacheReuseStaleReason({
          method: options.method,
          reason: staleReason,
          target: options.target,
        })
      }
    }
  } catch {
    recordRpcCacheReuse({
      method: options.method,
      outcome: 'error',
      target: options.target,
    })
  }
}

function createRuntimeTypeScriptDependencyTrackingDedupeKey(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  filePath: string,
  compilerOptionsVersion: string
): string {
  return `${runtimeCacheStore.snapshot.id}:${compilerOptionsVersion}:${normalizePathKey(filePath)}`
}

function createRuntimeTypeScriptDependencyAnalysisCacheNodeKey(
  filePath: string,
  compilerOptionsVersion: string
): string {
  return createRuntimeAnalysisCacheNodeKey(
    RUNTIME_ANALYSIS_CACHE_NAMES.typeScriptDependencyAnalysis,
    {
      compilerOptionsVersion,
      filePath: normalizeCacheFilePath(filePath),
    }
  )
}

function createRuntimeTypeScriptDependencyFingerprintCacheNodeKey(
  filePath: string,
  compilerOptionsVersion: string
): string {
  return createRuntimeAnalysisCacheNodeKey(
    RUNTIME_ANALYSIS_CACHE_NAMES.typeScriptDependencyFingerprint,
    {
      compilerOptionsVersion,
      filePath: normalizeCacheFilePath(filePath),
    }
  )
}

async function getSnapshotContentIdIfPossible(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  path: string | undefined
): Promise<string | undefined> {
  if (!path) {
    return undefined
  }

  try {
    const absolutePath = runtimeCacheStore.fileSystem.getAbsolutePath(path)
    return await runtimeCacheStore.snapshot.contentId(absolutePath)
  } catch {
    return undefined
  }
}

async function computeRuntimeTypeScriptDependencyFingerprint(options: {
  project: Project
  runtimeCacheStore: RuntimeAnalysisCacheStore
  filePath: string
  compilerOptionsVersion: string
}): Promise<{
  importResolutionFingerprint: string
  directDependencyFilePaths: string[]
  packageManifestDependencyPaths: string[]
}> {
  const { project, runtimeCacheStore, filePath, compilerOptionsVersion } =
    options
  const sourceFile = project.getSourceFile(filePath)
  const rootPath = sourceFile?.getFilePath() ?? filePath
  const moduleSpecifiers = sourceFile
    ? Array.from(
        new Set(
          collectSourceFileModuleSpecifiers(sourceFile)
            .map((moduleSpecifier) => normalizeModuleSpecifier(moduleSpecifier))
            .filter((moduleSpecifier) => moduleSpecifier.length > 0)
        )
      ).sort((first, second) => first.localeCompare(second))
    : []

  const directDependencyFilePaths = new Set<string>()
  const packageNames = new Set<string>()

  for (const moduleSpecifier of moduleSpecifiers) {
    if (isModuleSpecifierRelativeOrAbsolute(moduleSpecifier)) {
      const resolvedDependencyPath = resolveModuleSpecifierSourceFilePathUncached(
        project,
        rootPath,
        moduleSpecifier
      )
      if (resolvedDependencyPath) {
        directDependencyFilePaths.add(resolvedDependencyPath)
      }
      continue
    }

    const packageName = getPackageNameFromModuleSpecifier(moduleSpecifier)
    if (packageName) {
      packageNames.add(packageName)
    }
  }

  const packageManifestDependencyPaths = new Set<string>()
  const workspaceRootPath = getWorkspaceRootPath(runtimeCacheStore)
  if (workspaceRootPath) {
    const packageManifestByPath = new Map<string, PackageManifest | null>()
    for (const packageName of Array.from(packageNames.values()).sort((a, b) =>
      a.localeCompare(b)
    )) {
      const declaredPackageManifestPath = resolveDeclaredPackageManifestPath(
        runtimeCacheStore,
        packageManifestByPath,
        workspaceRootPath,
        rootPath,
        packageName
      )
      const installedPackageManifestPath = resolveInstalledPackageManifestPath(
        runtimeCacheStore,
        packageManifestByPath,
        workspaceRootPath,
        rootPath,
        packageName
      )

      if (declaredPackageManifestPath) {
        packageManifestDependencyPaths.add(declaredPackageManifestPath)
      }
      if (installedPackageManifestPath) {
        packageManifestDependencyPaths.add(installedPackageManifestPath)
      }
    }
  }

  const rootPathContentId = await getSnapshotContentIdIfPossible(
    runtimeCacheStore,
    rootPath
  )
  const projectConfigPath = (project.getCompilerOptions() as {
    configFilePath?: string
  }).configFilePath
  const projectConfigContentId = await getSnapshotContentIdIfPossible(
    runtimeCacheStore,
    projectConfigPath
  )

  const directDependencyFingerprints = await Promise.all(
    Array.from(directDependencyFilePaths.values())
      .sort((first, second) => first.localeCompare(second))
      .map(async (dependencyPath) => {
        const contentId = await getSnapshotContentIdIfPossible(
          runtimeCacheStore,
          dependencyPath
        )
        return `${normalizePathKey(dependencyPath)}:${contentId ?? 'missing'}`
      })
  )
  const packageManifestFingerprints = await Promise.all(
    Array.from(packageManifestDependencyPaths.values())
      .sort((first, second) => first.localeCompare(second))
      .map(async (manifestPath) => {
        const contentId = await getSnapshotContentIdIfPossible(
          runtimeCacheStore,
          manifestPath
        )
        return `${normalizePathKey(manifestPath)}:${contentId ?? 'missing'}`
      })
  )

  return {
    importResolutionFingerprint: hashString(
      stableStringify({
        compilerOptionsVersion,
        rootPath: normalizePathKey(rootPath),
        rootPathContentId: rootPathContentId ?? 'missing',
        projectConfigPath: normalizeCacheFilePath(projectConfigPath) ?? null,
        projectConfigContentId: projectConfigContentId ?? 'missing',
        moduleSpecifiers,
        directDependencyFingerprints,
        packageManifestFingerprints,
      })
    ),
    directDependencyFilePaths: Array.from(directDependencyFilePaths.values()),
    packageManifestDependencyPaths: Array.from(
      packageManifestDependencyPaths.values()
    ),
  }
}

async function getCachedRuntimeTypeScriptDependencyFingerprint(
  project: Project,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  filePath: string | undefined,
  compilerOptionsVersion: string
): Promise<RuntimeTypeScriptDependencyFingerprintResult | undefined> {
  if (!filePath) {
    return undefined
  }

  const nodeKey = createRuntimeTypeScriptDependencyFingerprintCacheNodeKey(
    filePath,
    compilerOptionsVersion
  )
  const dedupeKey = createRuntimeTypeScriptDependencyTrackingDedupeKey(
    runtimeCacheStore,
    filePath,
    `${compilerOptionsVersion}:fingerprint`
  )
  const pending = runtimeTypeScriptDependencyFingerprintInFlightByKey.get(
    dedupeKey
  )
  if (pending) {
    return pending
  }

  const task = getOrComputeRuntimeAnalysisCacheValue(
    runtimeCacheStore,
    nodeKey,
    {
      persist: true,
    },
    async (context) => {
        await recordProgramCompilerOptionsDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          filePath
        )

        const fingerprint = await computeRuntimeTypeScriptDependencyFingerprint({
          project,
          runtimeCacheStore,
          filePath,
          compilerOptionsVersion,
        })

        await recordFileDependenciesIfPossible(
          context,
          runtimeCacheStore,
          fingerprint.directDependencyFilePaths
        )
        await recordFileDependenciesIfPossible(
          context,
          runtimeCacheStore,
          fingerprint.packageManifestDependencyPaths
        )

        return fingerprint
      }
    )
    .then((value) => ({
      nodeKey,
      importResolutionFingerprint: value.importResolutionFingerprint,
      directDependencyFilePaths: value.directDependencyFilePaths,
      packageManifestDependencyPaths: value.packageManifestDependencyPaths,
    }))
    .finally(() => {
      if (
        runtimeTypeScriptDependencyFingerprintInFlightByKey.get(dedupeKey) ===
        task
      ) {
        runtimeTypeScriptDependencyFingerprintInFlightByKey.delete(dedupeKey)
      }
    })

  runtimeTypeScriptDependencyFingerprintInFlightByKey.set(dedupeKey, task)
  return task
}

function flushRuntimeTypeScriptDependencySidecarHydrationQueue(): void {
  const concurrencyLimit = RUNTIME_ANALYSIS_CACHE_CONFIG.typeScriptDependencySidecarHydrationConcurrency

  while (
    runtimeTypeScriptDependencySidecarHydrationActiveCount < concurrencyLimit
  ) {
    const queuedHydration =
      runtimeTypeScriptDependencySidecarHydrationQueue.shift()
    if (!queuedHydration) {
      return
    }

    runtimeTypeScriptDependencySidecarHydrationActiveCount += 1
    void queuedHydration
      .run()
      .catch(() => {})
      .finally(() => {
        runtimeTypeScriptDependencySidecarHydrationActiveCount = Math.max(
          0,
          runtimeTypeScriptDependencySidecarHydrationActiveCount - 1
        )
        flushRuntimeTypeScriptDependencySidecarHydrationQueue()
      })
  }
}

function queueRuntimeTypeScriptDependencySidecarHydration(options: {
  project: Project
  runtimeCacheStore: RuntimeAnalysisCacheStore
  filePath: string
  compilerOptionsVersion: string
}): void {
  const dedupeKey = createRuntimeTypeScriptDependencyTrackingDedupeKey(
    options.runtimeCacheStore,
    options.filePath,
    options.compilerOptionsVersion
  )

  if (
    runtimeTypeScriptDependencySidecarHydrationInFlightByKey.has(dedupeKey)
  ) {
    return
  }

  let resolveHydration: () => void = () => {}
  const hydration = new Promise<void>((resolve) => {
    resolveHydration = resolve
  }).finally(() => {
    if (
      runtimeTypeScriptDependencySidecarHydrationInFlightByKey.get(dedupeKey) ===
      hydration
    ) {
      runtimeTypeScriptDependencySidecarHydrationInFlightByKey.delete(dedupeKey)
    }
  })

  runtimeTypeScriptDependencySidecarHydrationInFlightByKey.set(
    dedupeKey,
    hydration
  )
  runtimeTypeScriptDependencySidecarHydrationQueue.push({
    dedupeKey,
    run: async () => {
      try {
        await getCachedRuntimeTypeScriptDependencyAnalysis(
          options.project,
          options.runtimeCacheStore,
          options.filePath,
          options.compilerOptionsVersion
        )
      } finally {
        resolveHydration()
      }
    },
  })
  flushRuntimeTypeScriptDependencySidecarHydrationQueue()
}

async function recordRuntimeTypeScriptDependencySidecar(
  context: CacheStoreComputeContext,
  project: Project,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  filePath: string | undefined,
  compilerOptionsVersion: string
): Promise<void> {
  if (!filePath) {
    return
  }

  if (isTestEnvironment()) {
    const dependencyAnalysis = await getCachedRuntimeTypeScriptDependencyAnalysis(
      project,
      runtimeCacheStore,
      filePath,
      compilerOptionsVersion
    )
    if (!dependencyAnalysis) {
      return
    }

    await context.recordNodeDep(dependencyAnalysis.nodeKey)
    return
  }

  const nodeKey = createRuntimeTypeScriptDependencyAnalysisCacheNodeKey(
    filePath,
    compilerOptionsVersion
  )
  await context.recordNodeDep(nodeKey)
  queueRuntimeTypeScriptDependencySidecarHydration({
    project,
    runtimeCacheStore,
    filePath,
    compilerOptionsVersion,
  })
}

function createRuntimeFileExportsCacheNodeKey(
  filePath: string,
  compilerOptionsVersion: string
): string {
  return createRuntimeAnalysisCacheNodeKey(RUNTIME_ANALYSIS_CACHE_NAMES.fileExports, {
    compilerOptionsVersion,
    filePath: normalizeCacheFilePath(filePath),
  })
}

function toFileExportsDependencies(
  filePath: string,
  fileExports: ModuleExport[]
): ProgramCacheDependency[] {
  const dependencyPaths = new Set<string>([filePath])

  for (const fileExport of fileExports) {
    if (!fileExport.path) {
      continue
    }

    dependencyPaths.add(fileExport.path)
  }

  return Array.from(dependencyPaths.values()).map((path) => ({
    kind: 'file',
    path,
  }))
}

function createFallbackProjectTypeScriptDependencies(
  project: Project,
  filePath: string,
  compilerOptionsVersion: string
): ProgramCacheDependency[] {
  const dependencyPaths = new Set<string>([filePath])

  for (const dependencyPath of collectFallbackProjectTypeScriptDependencyFilePaths(
    project,
    filePath
  )) {
    dependencyPaths.add(dependencyPath)
  }

  return [
    ...Array.from(dependencyPaths.values()).map((path) => ({
      kind: 'file' as const,
      path,
    })),
    {
      kind: 'const' as const,
      name: 'program:compiler-options',
      version: compilerOptionsVersion,
    },
  ]
}

function toFileExportMetadataCacheName(
  name: string,
  position: number,
  kind: SyntaxKind
): string {
  return `fileExportMetadata:${name}:${position}:${kind}`
}

function toFileExportStaticValueCacheName(
  position: number,
  kind: SyntaxKind
): string {
  return `${RUNTIME_ANALYSIS_CACHE_NAMES.fileExportStaticValue}:${position}:${kind}`
}

function toFileExportTextCacheName(position: number, kind: SyntaxKind): string {
  return `${RUNTIME_ANALYSIS_CACHE_NAMES.fileExportText}:${position}:${kind}`
}

function toResolvedTypeAtLocationWithDependenciesCacheName(
  position: number,
  kind: SyntaxKind,
  filter?: TypeFilter
): string {
  const filterKey = filter ? serializeTypeFilterForCache(filter) : 'none'
  return `${RUNTIME_ANALYSIS_CACHE_NAMES.resolveTypeAtLocationWithDependencies}:${position}:${kind}:${filterKey}`
}

function ensureProjectSourceFileLoaded(
  project: Project,
  filePath: string
): void {
  if (project.getSourceFile(filePath)) {
    return
  }

  project.addSourceFileAtPath(filePath)
}

export async function getCachedFileExports(
  project: Project,
  filePath: string
): Promise<ModuleExport[]> {
  ensureProjectSourceFileLoaded(project, filePath)

  const runtimeScope = getRuntimeAnalysisScopeOptions(project, filePath)
  const runtimeCacheStore = await getRuntimeAnalysisSession(runtimeScope)
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, filePath)
  ) {
    const swrReadConfig = getRuntimeAnalysisSWRReadConfig([filePath])
    const nodeKey = createRuntimeFileExportsCacheNodeKey(
      filePath,
      compilerOptionsVersion
    )

    return getOrComputeRuntimeAnalysisCacheValue(
      runtimeCacheStore,
      nodeKey,
      {
        persist: true,
        ...swrReadConfig,
      },
      async (context) => {
        await recordProgramCompilerOptionsDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          filePath
        )

        const fileExports = baseGetFileExports(filePath, project)
        const fileExportDependencies = toFileExportsDependencies(
          filePath,
          fileExports
        )
        const dependencyFilePaths: string[] = []
        for (const dependency of fileExportDependencies) {
          if (dependency.kind !== 'file') {
            continue
          }
          dependencyFilePaths.push(dependency.path)
        }

        await recordFileDependenciesIfPossible(
          context,
          runtimeCacheStore,
          dependencyFilePaths
        )

        if (shouldTrackRuntimeTypeScriptDependencies()) {
          await recordRuntimeTypeScriptDependencySidecar(
            context,
            project,
            runtimeCacheStore,
            filePath,
            compilerOptionsVersion
          )
        }

        return fileExports
      }
    )
  }

  return createFallbackProgramFileCache(
    project,
    filePath,
    RUNTIME_ANALYSIS_CACHE_NAMES.fileExports,
    () => baseGetFileExports(filePath, project),
    {
      deps: (fileExports) => toFileExportsDependencies(filePath, fileExports),
    }
  )
}

export async function getCachedOutlineRanges(
  project: Project,
  filePath: string
): Promise<OutlineRange[]> {
  const runtimeScope = getRuntimeAnalysisScopeOptions(project, filePath)
  const runtimeCacheStore = await getRuntimeAnalysisSession(runtimeScope)
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, filePath)
  ) {
    const swrReadConfig = getRuntimeAnalysisSWRReadConfig([filePath])
    const nodeKey = createRuntimeAnalysisCacheNodeKey(
      RUNTIME_ANALYSIS_CACHE_NAMES.outlineRanges,
      {
        compilerOptionsVersion,
        filePath: normalizeCacheFilePath(filePath),
      }
    )

    return getOrComputeRuntimeAnalysisCacheValue(
      runtimeCacheStore,
      nodeKey,
      {
        persist: true,
        ...swrReadConfig,
      },
      async (context) => {
        await recordProgramCompilerOptionsDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          filePath
        )

        return baseGetOutlineRanges(filePath, project)
      }
    )
  }

  return createFallbackProgramFileCache(
    project,
    filePath,
    RUNTIME_ANALYSIS_CACHE_NAMES.outlineRanges,
    () => baseGetOutlineRanges(filePath, project),
    {
      deps: [
        {
          kind: 'file',
          path: filePath,
        },
      ],
    }
  )
}

export async function getCachedFileExportMetadata(
  project: Project,
  options: {
    name: string
    filePath: string
    position: number
    kind: SyntaxKind
  }
): Promise<Awaited<ReturnType<typeof baseGetFileExportMetadata>>> {
  const runtimeScope = getRuntimeAnalysisScopeOptions(project, options.filePath)
  const runtimeCacheStore = await getRuntimeAnalysisSession(runtimeScope)
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, options.filePath)
  ) {
    const swrReadConfig = getRuntimeAnalysisSWRReadConfig([options.filePath])
    const nodeKey = createRuntimeAnalysisCacheNodeKey(
      RUNTIME_ANALYSIS_CACHE_NAMES.fileExportMetadata,
      {
        compilerOptionsVersion,
        name: options.name,
        filePath: normalizeCacheFilePath(options.filePath),
        position: options.position,
        kind: options.kind,
        mode: 'metadata',
      }
    )

    return getOrComputeRuntimeAnalysisCacheValue(
      runtimeCacheStore,
      nodeKey,
      {
        persist: true,
        ...swrReadConfig,
      },
      async (context) => {
        await recordProgramCompilerOptionsDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          options.filePath
        )

        await getCachedFileExports(project, options.filePath)

        return baseGetFileExportMetadata(
          options.name,
          options.filePath,
          options.position,
          options.kind,
          project
        )
      }
    )
  }

  return createFallbackProgramFileCache(
    project,
    options.filePath,
    toFileExportMetadataCacheName(options.name, options.position, options.kind),
    () =>
      baseGetFileExportMetadata(
        options.name,
        options.filePath,
        options.position,
        options.kind,
        project
      ),
    {
      deps: [
        {
          kind: 'file',
          path: options.filePath,
        },
        {
          kind: 'cache',
          filePath: options.filePath,
          cacheName: RUNTIME_ANALYSIS_CACHE_NAMES.fileExports,
        },
      ],
    }
  )
}

export async function getCachedFileExportStaticValue(
  project: Project,
  options: {
    filePath: string
    position: number
    kind: SyntaxKind
  }
): Promise<Awaited<ReturnType<typeof baseGetFileExportStaticValue>>> {
  const runtimeScope = getRuntimeAnalysisScopeOptions(project, options.filePath)
  const runtimeCacheStore = await getRuntimeAnalysisSession(runtimeScope)
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, options.filePath)
  ) {
    const swrReadConfig = getRuntimeAnalysisSWRReadConfig([options.filePath])
    const nodeKey = createRuntimeAnalysisCacheNodeKey(
      RUNTIME_ANALYSIS_CACHE_NAMES.fileExportStaticValue,
      {
        compilerOptionsVersion,
        filePath: normalizeCacheFilePath(options.filePath),
        position: options.position,
        kind: options.kind,
      }
    )
    const fileExportsNodeKey = createRuntimeFileExportsCacheNodeKey(
      options.filePath,
      compilerOptionsVersion
    )

    return getOrComputeRuntimeAnalysisCacheValue(
      runtimeCacheStore,
      nodeKey,
      {
        persist: true,
        ...swrReadConfig,
      },
      async (context) => {
        await recordProgramCompilerOptionsDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          options.filePath
        )

        await getCachedFileExports(project, options.filePath)
        await context.recordNodeDep(fileExportsNodeKey)

        await recordRuntimeTypeScriptDependencySidecar(
          context,
          project,
          runtimeCacheStore,
          options.filePath,
          compilerOptionsVersion
        )

        return baseGetFileExportStaticValue(
          options.filePath,
          options.position,
          options.kind,
          project
        )
      }
    )
  }

  return createFallbackProgramFileCache(
    project,
    options.filePath,
    toFileExportStaticValueCacheName(options.position, options.kind),
    () =>
      baseGetFileExportStaticValue(
        options.filePath,
        options.position,
        options.kind,
        project
      ),
    {
      deps: [
        ...createFallbackProjectTypeScriptDependencies(
          project,
          options.filePath,
          compilerOptionsVersion
        ),
        {
          kind: 'cache',
          filePath: options.filePath,
          cacheName: RUNTIME_ANALYSIS_CACHE_NAMES.fileExports,
        },
      ],
    }
  )
}

export async function getCachedFileExportText(
  project: Project,
  options: {
    filePath: string
    position: number
    kind: SyntaxKind
    includeDependencies?: boolean
  }
): Promise<string> {
  const runtimeScope = getRuntimeAnalysisScopeOptions(project, options.filePath)
  const runtimeCacheStore = await getRuntimeAnalysisSession(runtimeScope)
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, options.filePath)
  ) {
    const swrReadConfig = getRuntimeAnalysisSWRReadConfig([options.filePath])
    const nodeKey = createRuntimeAnalysisCacheNodeKey(
      RUNTIME_ANALYSIS_CACHE_NAMES.fileExportText,
      {
        compilerOptionsVersion,
        filePath: normalizeCacheFilePath(options.filePath),
        position: options.position,
        kind: options.kind,
        includeDependencies: options.includeDependencies === true,
      }
    )

    return getOrComputeRuntimeAnalysisCacheValue(
      runtimeCacheStore,
      nodeKey,
      {
        persist: true,
        ...swrReadConfig,
      },
      async (context) => {
        await recordProgramCompilerOptionsDependency(context, runtimeCacheStore, project)
        if (options.includeDependencies) {
          invalidateProgramFileCache(
            project,
            options.filePath,
            RUNTIME_ANALYSIS_CACHE_NAMES.fileExportsText
          )
          const result = await baseGetFileExportTextResult({
            filePath: options.filePath,
            position: options.position,
            kind: options.kind,
            includeDependencies: true,
            project,
          })
          await recordFileDependenciesIfPossible(
            context,
            runtimeCacheStore,
            result.dependencies
          )
          return result.text
        }

        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          options.filePath
        )
        return baseGetFileExportText({
          filePath: options.filePath,
          position: options.position,
          kind: options.kind,
          includeDependencies: false,
          project,
        })
      }
    )
  }

  if (options.includeDependencies) {
    const result = await baseGetFileExportTextResult({
      filePath: options.filePath,
      position: options.position,
      kind: options.kind,
      includeDependencies: true,
      project,
    })
    return result.text
  }

  return createFallbackProgramFileCache(
    project,
    options.filePath,
    toFileExportTextCacheName(options.position, options.kind),
    () =>
      baseGetFileExportText({
        filePath: options.filePath,
        position: options.position,
        kind: options.kind,
        includeDependencies: false,
        project,
      }),
    {
      deps: [
        {
          kind: 'file',
          path: options.filePath,
        },
      ],
    }
  )
}

export async function resolveCachedTypeAtLocationWithDependencies(
  project: Project,
  options: {
    filePath: string
    position: number
    kind: SyntaxKind
    filter?: TypeFilter
    isInMemoryFileSystem?: boolean
  }
): Promise<ResolvedTypeAtLocationResult> {
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (!options.isInMemoryFileSystem) {
    const runtimeScope = getRuntimeAnalysisScopeOptions(project, options.filePath)
    const runtimeCacheStore = await getRuntimeAnalysisSession(runtimeScope)
    if (
      runtimeCacheStore &&
      canUseRuntimePathCache(runtimeCacheStore, options.filePath)
    ) {
      const swrReadConfig = getRuntimeAnalysisSWRReadConfig([options.filePath])
      const nodeKey = createRuntimeAnalysisCacheNodeKey(
        RUNTIME_ANALYSIS_CACHE_NAMES.resolveTypeAtLocationWithDependencies,
        {
          compilerOptionsVersion,
          filePath: normalizeCacheFilePath(options.filePath),
          position: options.position,
          kind: options.kind,
          filter: options.filter
            ? serializeTypeFilterForCache(options.filter)
            : 'none',
        }
      )

      return getOrComputeRuntimeAnalysisCacheValue(
        runtimeCacheStore,
        nodeKey,
        {
          persist: true,
          ...swrReadConfig,
        },
        async (context) => {
          await recordProgramCompilerOptionsDependency(
            context,
            runtimeCacheStore,
            project
          )
          await recordFileDependencyIfPossible(
            context,
            runtimeCacheStore,
            options.filePath
          )

          const result = await baseResolveTypeAtLocationWithDependencies(
            project,
            options.filePath,
            options.position,
            options.kind,
            options.filter,
            options.isInMemoryFileSystem
          )
          const dependencyPaths = new Set<string>([
            options.filePath,
            ...(result.dependencies ?? []),
          ])
          await recordFileDependenciesIfPossible(
            context,
            runtimeCacheStore,
            Array.from(dependencyPaths.values())
          )

          if (shouldTrackRuntimeTypeScriptDependencies()) {
            await recordRuntimeTypeScriptDependencySidecar(
              context,
              project,
              runtimeCacheStore,
              options.filePath,
              compilerOptionsVersion
            )
          }

          return result
        }
      )
    }
  }

  return createFallbackProgramFileCache(
    project,
    options.filePath,
    toResolvedTypeAtLocationWithDependenciesCacheName(
      options.position,
      options.kind,
      options.filter
    ),
    () =>
      baseResolveTypeAtLocationWithDependencies(
        project,
        options.filePath,
        options.position,
        options.kind,
        options.filter,
        options.isInMemoryFileSystem
      ),
    {
      deps: (result) => {
        const dependencyPaths = new Set<string>([
          options.filePath,
          ...(result.dependencies ?? []),
        ])
        return [
          ...Array.from(dependencyPaths.values()).map((path) => ({
            kind: 'file' as const,
            path,
          })),
          {
            kind: 'const' as const,
            name: 'program:compiler-options',
            version: compilerOptionsVersion,
          },
        ]
      },
    }
  )
}

export async function transpileCachedSourceFile(
  project: Project,
  filePath: string
): Promise<string> {
  const runtimeScope = getRuntimeAnalysisScopeOptions(project, filePath)
  const runtimeCacheStore = await getRuntimeAnalysisSession(runtimeScope)
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, filePath)
  ) {
    const swrReadConfig = getRuntimeAnalysisSWRReadConfig([filePath])
    const nodeKey = createRuntimeAnalysisCacheNodeKey(
      RUNTIME_ANALYSIS_CACHE_NAMES.transpileSourceFile,
      {
        compilerOptionsVersion,
        filePath: normalizeCacheFilePath(filePath),
      }
    )

    return getOrComputeRuntimeAnalysisCacheValue(
      runtimeCacheStore,
      nodeKey,
      {
        persist: true,
        ...swrReadConfig,
      },
      async (context) => {
        await recordProgramCompilerOptionsDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          filePath
        )

        await recordRuntimeTypeScriptDependencySidecar(
          context,
          project,
          runtimeCacheStore,
          filePath,
          compilerOptionsVersion
        )

        return baseTranspileSourceFile(filePath, project)
      }
    )
  }

  return createFallbackProgramFileCache(
    project,
    filePath,
    RUNTIME_ANALYSIS_CACHE_NAMES.transpileSourceFile,
    () => baseTranspileSourceFile(filePath, project),
    {
      deps: createFallbackProjectTypeScriptDependencies(
        project,
        filePath,
        compilerOptionsVersion
      ),
    }
  )
}

export async function getCachedSourceTextMetadata(
  project: Project,
  options: Omit<GetSourceTextMetadataOptions, 'project'>
): Promise<SourceTextMetadata> {
  prewarmSourceTextFormatterForRuntimeAnalysis(options.filePath)

  const shouldProfileRpcCacheReuse = isRpcBuildProfileEnabled()
  const profileTarget = getRuntimeCacheReuseProfileTarget({
    filePath: options.filePath,
    fallback: `inline:${options.language ?? 'txt'}`,
  })
  const runtimeScope = getRuntimeAnalysisScopeOptions(project, options.filePath)
  const scopePath = runtimeScope.scopePath
  const compilerOptionsVersion = getCompilerOptionsVersion(project)
  const nodeKey = createRuntimeAnalysisCacheNodeKey(
    RUNTIME_ANALYSIS_CACHE_NAMES.sourceTextMetadata,
    {
      compilerOptionsVersion,
      filePath: normalizeCacheFilePath(options.filePath),
      language: options.language ?? null,
      shouldFormat: options.shouldFormat ?? true,
      isFormattingExplicit: options.isFormattingExplicit ?? null,
      virtualizeFilePath: options.virtualizeFilePath ?? false,
      formatterStateVersion: getSourceTextFormatterStateVersion(),
      baseDirectory: options.baseDirectory ?? null,
      valueSignature: toSourceTextMetadataValueSignature(options.value),
    }
  )

  const resolveSourceTextMetadataFromRuntimeCache =
    async (): Promise<SourceTextMetadata> => {
      const finalizeSourceTextMetadata = (
        metadata: SourceTextMetadata
      ): SourceTextMetadata => {
        hydrateSourceTextMetadataSourceFile(project, metadata)
        return metadata
      }

      const runtimeCacheStore = await getRuntimeAnalysisSession(runtimeScope)
      if (!runtimeCacheStore) {
        if (shouldProfileRpcCacheReuse) {
          await profileRuntimeCacheReuse({
            method: 'getSourceTextMetadata',
            runtimeCacheStore: undefined,
            nodeKey: undefined,
            target: profileTarget,
          })
        }
        return finalizeSourceTextMetadata(
          await baseGetSourceTextMetadata({
            ...options,
            project,
          })
        )
      }
      markRuntimeAnalysisScopeBootstrapped(runtimeScope)

      if (shouldProfileRpcCacheReuse) {
        await profileRuntimeCacheReuse({
          method: 'getSourceTextMetadata',
          runtimeCacheStore,
          nodeKey,
          target: profileTarget,
        })
      }

      const swrReadConfig = getRuntimeAnalysisSWRReadConfig([options.filePath], {
        maxStaleAgeMs:
          RUNTIME_ANALYSIS_CACHE_CONFIG.sourceTextMetadataSwrMaxStaleAgeMs,
      })
      const cacheOptions: Omit<CacheStoreGetOrComputeOptions, 'constDeps'> = {
        persist: true,
        ...swrReadConfig,
      }
      const computeSourceTextMetadata = async (
        context: CacheStoreComputeContext
      ) => {
        await recordProgramCompilerOptionsDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          options.filePath
        )

        const result = await baseGetSourceTextMetadata({
          ...options,
          project,
        })

        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          result.filePath
        )
        if (shouldTrackRuntimeTypeScriptDependencies()) {
          const dependencyAnalysisPath =
            resolveRuntimeTypeScriptDependencyAnalysisPath(
              runtimeCacheStore,
              project,
              [result.filePath, options.filePath]
            )

          if (dependencyAnalysisPath) {
            await recordRuntimeTypeScriptDependencySidecar(
              context,
              project,
              runtimeCacheStore,
              dependencyAnalysisPath,
              compilerOptionsVersion
            )
          }
        }

        return result
      }
      const refreshSourceTextMetadata = () => {
        return refreshRuntimeAnalysisCacheValue(
          runtimeCacheStore,
          nodeKey,
          cacheOptions,
          computeSourceTextMetadata
        )
      }

      const prewarmDependencyPaths = resolveRuntimeAnalysisPrewarmDependencyPaths(
        runtimeCacheStore,
        [options.filePath],
        scopePath
      )
      if (prewarmDependencyPaths.length > 0) {
        registerRuntimeAnalysisSWRPrewarmTask({
          nodeKey,
          dependencyPaths: prewarmDependencyPaths,
          run: async () => {
            const freshness =
              await runtimeCacheStore.store.getWithFreshness<SourceTextMetadata>(
                nodeKey
              )
            if (freshness.fresh) {
              return
            }

            await refreshSourceTextMetadata()
          },
        })
      }

      if (
        shouldServeRuntimeAnalysisColdFallback({
          value: options.value,
          isFormattingExplicit: options.isFormattingExplicit,
        })
      ) {
        if (!runtimeCacheStore.store.hasSync(nodeKey)) {
          queueRuntimeAnalysisImmediateRefresh({
            dependencyPaths: prewarmDependencyPaths,
            scopePath,
            refresh: refreshSourceTextMetadata,
          })
          return getSourceTextMetadataFallback({
            project,
            ...options,
          })
        }

        const staleValue =
          await runtimeCacheStore.store.getPossiblyStale<SourceTextMetadata>(
            nodeKey
          )
        if (staleValue !== undefined) {
          queueRuntimeAnalysisImmediateRefresh({
            dependencyPaths: prewarmDependencyPaths,
            scopePath,
            refresh: refreshSourceTextMetadata,
          })

          return finalizeSourceTextMetadata(staleValue)
        }

        queueRuntimeAnalysisImmediateRefresh({
          dependencyPaths: prewarmDependencyPaths,
          scopePath,
          refresh: refreshSourceTextMetadata,
        })
        return getSourceTextMetadataFallback({
          project,
          ...options,
        })
      }

      return finalizeSourceTextMetadata(
        await getOrComputeRuntimeAnalysisCacheValue(
          runtimeCacheStore,
          nodeKey,
          cacheOptions,
          computeSourceTextMetadata
        )
      )
    }

  const shouldServeSourceTextColdFallback = shouldServeRuntimeAnalysisColdFallback({
    value: options.value,
    isFormattingExplicit: options.isFormattingExplicit,
  })

  if (
    shouldServeSourceTextColdFallback &&
    !isRuntimeAnalysisScopeBootstrapped(runtimeScope)
  ) {
    queueRuntimeAnalysisColdStartTask({
      taskKey: `source-text:${nodeKey}`,
      run: async () => {
        await resolveSourceTextMetadataFromRuntimeCache()
      },
    })

    return getSourceTextMetadataFallback({
      project,
      ...options,
    })
  }

  if (shouldServeSourceTextColdFallback) {
    return resolveWithinRuntimeAnalysisColdResponseBudget({
      promise: resolveSourceTextMetadataFromRuntimeCache(),
      fallback: () =>
        getSourceTextMetadataFallback({
          project,
          ...options,
        }),
    })
  }

  return resolveSourceTextMetadataFromRuntimeCache()
}

export async function getCachedTokens(
  project: Project,
  options: Omit<GetTokensOptions, 'project'> & {
    highlighterLoader?: () => Promise<Highlighter | null> | Highlighter | null
    waitForWarmResult?: boolean
  }
): Promise<TokenizedLines> {
  const shouldProfileRpcCacheReuse = isRpcBuildProfileEnabled()
  const profileTarget = getRuntimeCacheReuseProfileTarget({
    filePath: options.filePath,
    fallback:
      typeof options.sourcePath === 'string'
        ? normalizePathKey(options.sourcePath)
        : `inline:${options.language ?? 'plaintext'}`,
  })
  const runtimeScope = getRuntimeAnalysisScopeOptions(project, options.filePath)
  const scopePath = runtimeScope.scopePath
  const compilerOptionsVersion = getCompilerOptionsVersion(project)
  const normalizedFilePath = normalizeCacheFilePath(options.filePath)
  const nodeKey = createRuntimeAnalysisCacheNodeKey(RUNTIME_ANALYSIS_CACHE_NAMES.tokens, {
    compilerOptionsVersion,
    filePath: normalizedFilePath,
    sourcePath:
      typeof options.sourcePath === 'string'
        ? normalizePathKey(options.sourcePath)
        : (options.sourcePath ?? null),
    language: options.language ?? 'plaintext',
    themeSignature: getThemeSignature(options.theme),
    themeNames: getThemeNamesForCache(options.theme),
    allowErrors: options.allowErrors ?? null,
    showErrors: options.showErrors ?? null,
    metadataCollectorKey: getMetadataCollectorCacheKey(options.metadataCollector),
    deferQuickInfoUntilHover: options.deferQuickInfoUntilHover ?? null,
    valueSignature: toTokenValueSignature(options.value),
  })

  const resolveTokensFromRuntimeCache = async (overrides?: {
    waitForWarmResult?: boolean
  }): Promise<TokenizedLines> => {
    const runtimeCacheStore = await getRuntimeAnalysisSession(runtimeScope)
    if (!runtimeCacheStore) {
      if (shouldProfileRpcCacheReuse) {
        await profileRuntimeCacheReuse({
          method: 'getTokens',
          runtimeCacheStore: undefined,
          nodeKey: undefined,
          target: profileTarget,
        })
      }
      return baseGetTokens({
        ...options,
        project,
      })
    }
    markRuntimeAnalysisScopeBootstrapped(runtimeScope)

    if (shouldProfileRpcCacheReuse) {
      await profileRuntimeCacheReuse({
        method: 'getTokens',
        runtimeCacheStore,
        nodeKey,
        target: profileTarget,
      })
    }

    const swrReadConfig = getRuntimeAnalysisSWRReadConfig(
      [
        options.filePath,
        typeof options.sourcePath === 'string' ? options.sourcePath : undefined,
      ],
      {
        maxStaleAgeMs: RUNTIME_ANALYSIS_CACHE_CONFIG.tokensSwrMaxStaleAgeMs,
      }
    )
    const cacheOptions: Omit<CacheStoreGetOrComputeOptions, 'constDeps'> = {
      persist: true,
      ...swrReadConfig,
    }
    let resolvedHighlighter: Highlighter | null = options.highlighter
    const tokenLanguage = options.language ?? 'plaintext'
    const isPlainTextLikeLanguage =
      tokenLanguage === 'plaintext' ||
      tokenLanguage === 'text' ||
      tokenLanguage === 'txt' ||
      tokenLanguage === 'diff'
    const resolveHighlighterForCompute = async (): Promise<Highlighter | null> => {
      if (resolvedHighlighter) {
        return resolvedHighlighter
      }

      if (typeof options.highlighterLoader !== 'function') {
        return null
      }

      try {
        const loaded = await options.highlighterLoader()
        resolvedHighlighter = loaded ?? null
        return resolvedHighlighter
      } catch {
        return null
      }
    }
    const computeTokens = async (context: CacheStoreComputeContext) => {
      let highlighter: Highlighter | null = null
      if (!isPlainTextLikeLanguage) {
        highlighter = await resolveHighlighterForCompute()
        if (!highlighter) {
          throw new Error(
            '[renoun] Highlighter was not initialized while refreshing cached tokens.'
          )
        }
      }

      await recordProgramCompilerOptionsDependency(context, runtimeCacheStore, project)
      await recordFileDependencyIfPossible(
        context,
        runtimeCacheStore,
        options.filePath
      )

      const result = await baseGetTokens({
        value: options.value,
        language: options.language,
        filePath: options.filePath,
        allowErrors: options.allowErrors,
        showErrors: options.showErrors,
        sourcePath: options.sourcePath,
        theme: options.theme,
        metadataCollector: options.metadataCollector,
        deferQuickInfoUntilHover: options.deferQuickInfoUntilHover,
        highlighter,
        project,
      })

      if (
        shouldTrackRuntimeTypeScriptDependencies() &&
        shouldTrackRuntimeTypeScriptDependenciesForPath(
          runtimeCacheStore,
          project,
          options.filePath
        )
      ) {
        await recordRuntimeTypeScriptDependencySidecar(
          context,
          project,
          runtimeCacheStore,
          options.filePath,
          compilerOptionsVersion
        )
      }

      return result
    }
    const refreshTokens = () => {
      return refreshRuntimeAnalysisCacheValue(
        runtimeCacheStore,
        nodeKey,
        cacheOptions,
        computeTokens
      )
    }

    const prewarmDependencyPaths = resolveRuntimeAnalysisPrewarmDependencyPaths(
      runtimeCacheStore,
      [
        options.filePath,
        typeof options.sourcePath === 'string' ? options.sourcePath : undefined,
      ],
      scopePath
    )
    if (prewarmDependencyPaths.length > 0) {
      registerRuntimeAnalysisSWRPrewarmTask({
        nodeKey,
        dependencyPaths: prewarmDependencyPaths,
        run: async () => {
          const freshness =
            await runtimeCacheStore.store.getWithFreshness<TokenizedLines>(nodeKey)
          if (freshness.fresh) {
            return
          }

          await refreshTokens()
        },
      })
    }

    const waitForWarmResult = overrides?.waitForWarmResult ?? options.waitForWarmResult
    const shouldServeColdFallbackForRequest =
      waitForWarmResult !== true &&
      shouldServeRuntimeAnalysisColdFallback({
        value: options.value,
      })

    if (shouldServeColdFallbackForRequest) {
      if (!runtimeCacheStore.store.hasSync(nodeKey)) {
        queueRuntimeAnalysisImmediateRefresh({
          dependencyPaths: prewarmDependencyPaths,
          scopePath,
          refresh: refreshTokens,
        })
        return createPlainTextTokenizedLines(options.value)
      }

      const staleValue =
        await runtimeCacheStore.store.getPossiblyStale<TokenizedLines>(nodeKey)
      if (staleValue !== undefined) {
        queueRuntimeAnalysisImmediateRefresh({
          dependencyPaths: prewarmDependencyPaths,
          scopePath,
          refresh: refreshTokens,
        })

        return staleValue
      }

      queueRuntimeAnalysisImmediateRefresh({
        dependencyPaths: prewarmDependencyPaths,
        scopePath,
        refresh: refreshTokens,
      })
      return createPlainTextTokenizedLines(options.value)
    }

    return getOrComputeRuntimeAnalysisCacheValue(
      runtimeCacheStore,
      nodeKey,
      cacheOptions,
      computeTokens
    )
  }

  const shouldServeTokensColdFallback =
    options.waitForWarmResult !== true &&
    shouldServeRuntimeAnalysisColdFallback({
      value: options.value,
    })

  if (
    shouldServeTokensColdFallback &&
    !isRuntimeAnalysisScopeBootstrapped(runtimeScope)
  ) {
    queueRuntimeAnalysisColdStartTask({
      taskKey: `tokens:${nodeKey}`,
      run: async () => {
        await resolveTokensFromRuntimeCache({
          waitForWarmResult: true,
        })
      },
    })

    return createPlainTextTokenizedLines(options.value)
  }

  if (shouldServeTokensColdFallback) {
    return resolveWithinRuntimeAnalysisColdResponseBudget({
      promise: resolveTokensFromRuntimeCache(),
      fallback: () => createPlainTextTokenizedLines(options.value),
    })
  }

  return resolveTokensFromRuntimeCache()
}
