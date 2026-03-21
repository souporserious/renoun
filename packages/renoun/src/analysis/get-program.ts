import { getTsMorph } from '../utils/ts-morph.ts'
import type {
  Project as TsMorphProject,
  ts as TsMorphTS,
} from '../utils/ts-morph.ts'
import { join, dirname, extname, resolve } from 'node:path'
import { existsSync, watch, statSync } from 'node:fs'
import type { FSWatcher } from 'node:fs'

import { getDebugLogger } from '../utils/debug.ts'
import type { DebugContext } from '../utils/debug.ts'
import { reportBestEffortError } from '../utils/best-effort.ts'
import {
  isDevelopmentEnvironment,
  isVitestRuntime,
} from '../utils/env.ts'
import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.ts'
import { collapseInvalidationPaths } from '../utils/collapse-invalidation-paths.ts'
import {
  isAbsolutePath,
  normalizePathKey,
  normalizeSlashes,
} from '../utils/path.ts'
import { hashString, stableStringify } from '../utils/stable-serialization.ts'
import { invalidateProgramFileCachePaths } from './cache.ts'
import {
  invalidateRuntimeAnalysisCachePaths,
} from './cached-analysis.ts'
import { invalidateSharedFileTextPrefixCachePaths } from './file-text-prefix-cache.ts'
import {
  clearProjectAnalysisScopeId,
  setProjectAnalysisScopeId,
} from './project-scope.ts'
import { shouldIgnoreAnalysisPath } from './ignored-paths.ts'
import {
  activeRefreshingPrograms,
  completeRefreshingPrograms,
  startRefreshingPrograms,
} from './refresh.ts'
import {
  getServerPortFromProcessEnv,
  resolveAnalysisWatchersEnvOverride,
} from './runtime-env.ts'
import { getTypeScriptConfigDependencyPaths } from './tsconfig-dependencies.ts'
import type { AnalysisOptions } from './types.ts'

const { Project, ts } = getTsMorph()

const projects = new Map<string, TsMorphProject>()
const directoryWatchers = new Map<string, FSWatcher>()
const directoryToProjects = new Map<string, Set<TsMorphProject>>()
const typeScriptConfigDependencyPathsByProject = new WeakMap<
  TsMorphProject,
  string[]
>()
const directoryInvalidationPathQueue = new Map<string, Map<string, string>>()
const directoryInvalidationTimers = new Map<string, NodeJS.Timeout>()
const directoryInvalidationScheduledDelayByWorkspace = new Map<string, number>()
type AnalysisWatcherInvalidationPriority = 'immediate' | 'background'
const ANALYSIS_WATCHER_INVALIDATION_PRIORITY_DELAY_MS: Record<
  AnalysisWatcherInvalidationPriority,
  number
> = {
  immediate: 0,
  background: 25,
}
const ANALYSIS_WATCHER_INVALIDATION_BATCH_WINDOW_MS = 25
export interface AnalysisWatcherRuntimeOptions {
  enabled?: boolean
}

const analysisWatcherRuntimeOptions: AnalysisWatcherRuntimeOptions = {}

export function configureAnalysisWatcherRuntime(
  options: AnalysisWatcherRuntimeOptions
): void {
  if ('enabled' in options) {
    analysisWatcherRuntimeOptions.enabled = options.enabled
  }
}

export function resetAnalysisWatcherRuntimeConfiguration(): void {
  analysisWatcherRuntimeOptions.enabled = undefined
}

const defaultCompilerOptions = {
  allowJs: true,
  esModuleInterop: true,
  isolatedModules: true,
  noImplicitOverride: true,
  noUncheckedIndexedAccess: true,
  resolveJsonModule: true,
  skipLibCheck: true,
  strict: true,
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleDetection: ts.ModuleDetectionKind.Force,
  target: ts.ScriptTarget.ESNext,
} satisfies TsMorphTS.CompilerOptions

/** Get the ts-morph program associated with the provided analysis options. */
export function getProgram(options?: AnalysisOptions) {
  const programKey = getProgramKeyForAnalysisOptions(options)
  const workspaceDirectory = options?.tsConfigFilePath
    ? resolve(dirname(options.tsConfigFilePath))
    : process.cwd()

  if (projects.has(programKey)) {
    const existingProject = projects.get(programKey)!
    setProjectAnalysisScopeId(existingProject, options?.analysisScopeId)
    recordProjectTypeScriptConfigDependencies(existingProject)
    let associatedProjects = directoryToProjects.get(workspaceDirectory)
    if (!associatedProjects) {
      associatedProjects = new Set()
      directoryToProjects.set(workspaceDirectory, associatedProjects)
    }
    associatedProjects.add(existingProject)
    ensureProgramDirectoryWatcher(workspaceDirectory)

    getDebugLogger().debug('Reusing cached program instance', () =>
      createProgramDebugContext({
        program: existingProject,
        programKey,
        workspaceDirectory,
        analysisOptions: options,
        cacheStatus: 'hit',
      })
    )

    return existingProject
  }

  const tsConfigFilePath = options?.tsConfigFilePath || 'tsconfig.json'
  const hasTypeScriptConfig = existsSync(tsConfigFilePath)
  const shouldUseInMemoryFs = options?.useInMemoryFileSystem === true

  const projectOptions = shouldUseInMemoryFs
    ? {
        compilerOptions: {
          ...defaultCompilerOptions,
          ...options?.compilerOptions,
        },
        useInMemoryFileSystem: true,
      }
    : hasTypeScriptConfig
      ? {
          compilerOptions: options?.compilerOptions,
          tsConfigFilePath,
        }
      : {
          compilerOptions: {
            ...defaultCompilerOptions,
            ...options?.compilerOptions,
          },
        }

  const project = new Project(projectOptions)
  let associatedProjects = directoryToProjects.get(workspaceDirectory)

  if (!associatedProjects) {
    associatedProjects = new Set()
    directoryToProjects.set(workspaceDirectory, associatedProjects)
  }

  associatedProjects.add(project)

  ensureProgramDirectoryWatcher(workspaceDirectory)

  setProjectAnalysisScopeId(project, options?.analysisScopeId)
  recordProjectTypeScriptConfigDependencies(project)
  projects.set(programKey, project)

  getDebugLogger().info('Created new program instance', () =>
    createProgramDebugContext({
      program: project,
      programKey,
      workspaceDirectory,
      analysisOptions: options,
      cacheStatus: 'miss',
    })
  )

  return project
}

function shouldIgnoreAnalysisWatchPath(filePath: string): boolean {
  return shouldIgnoreAnalysisPath(filePath)
}

function ensureProgramDirectoryWatcher(workspaceDirectory: string): void {
  if (
    !shouldEnableAnalysisWatchers() ||
    directoryWatchers.has(workspaceDirectory)
  ) {
    return
  }

  try {
    const watcher = watch(
      workspaceDirectory,
      { recursive: true },
      (eventType, fileName) => {
        if (!fileName) return

        const watchedFileName = String(fileName)
        if (!watchedFileName) {
          return
        }

        try {
          if (shouldIgnoreAnalysisWatchPath(watchedFileName)) {
            return
          }

          const filePath = join(workspaceDirectory, watchedFileName)

          if (isFilePathGitIgnored(filePath)) {
            return
          }

          const isDirectory = existsSync(filePath)
            ? statSync(filePath).isDirectory()
            : extname(watchedFileName) === ''
          const projectsToUpdate = directoryToProjects.get(workspaceDirectory)

          if (!projectsToUpdate) return

          const invalidationPaths = new Set<string>([filePath])
          if (eventType === 'rename') {
            const parentDirectoryPath = dirname(filePath)
            if (parentDirectoryPath && parentDirectoryPath !== filePath) {
              invalidationPaths.add(parentDirectoryPath)
            }

            if (isDirectory) {
              invalidationPaths.add(workspaceDirectory)
            }
          }
          queueAnalysisWatcherInvalidation(workspaceDirectory, invalidationPaths, {
            priority: 'immediate',
          })

          for (const currentProject of projectsToUpdate) {
            if (eventType === 'rename') {
              if (existsSync(filePath)) {
                if (isDirectory) {
                  currentProject.addDirectoryAtPath(filePath)
                } else {
                  refreshOrAddSourceFile(currentProject, filePath)
                }
              } else if (isDirectory) {
                const removedDirectory = currentProject.getDirectory(filePath)
                if (removedDirectory) {
                  removedDirectory.deleteImmediatelySync()
                }
              } else {
                const removedSourceFile = currentProject.getSourceFile(filePath)

                if (removedSourceFile) {
                  removedSourceFile.deleteImmediatelySync()
                }
              }
            } else if (eventType === 'change') {
              refreshOrAddSourceFile(currentProject, filePath)
            }
          }
        } catch (error) {
          reportBestEffortError(
            'analysis/get-program',
            new Error(
              `[renoun] An error occurred in the file system watcher while trying to ${eventType} the file path at: ${watchedFileName}`,
              { cause: error }
            )
          )
        }
      }
    )

    directoryWatchers.set(workspaceDirectory, watcher)
  } catch (error) {
    reportBestEffortError('analysis/get-program', error)
  }
}

function queueAnalysisWatcherInvalidation(
  workspaceDirectory: string,
  paths: Iterable<string>,
  options: {
    priority?: AnalysisWatcherInvalidationPriority
  } = {}
): void {
  const pendingPaths =
    directoryInvalidationPathQueue.get(workspaceDirectory) ??
    new Map<string, string>()
  for (const path of paths) {
    const normalizedPath = normalizeComparablePath(path)
    if (normalizedPath.length === 0 || pendingPaths.has(normalizedPath)) {
      continue
    }

    pendingPaths.set(normalizedPath, path)
  }

  if (pendingPaths.size === 0) {
    return
  }
  directoryInvalidationPathQueue.set(workspaceDirectory, pendingPaths)

  const priority = options.priority ?? 'immediate'
  const requestedDelayMs =
    ANALYSIS_WATCHER_INVALIDATION_PRIORITY_DELAY_MS[priority] ??
    ANALYSIS_WATCHER_INVALIDATION_BATCH_WINDOW_MS
  const existingTimer = directoryInvalidationTimers.get(workspaceDirectory)
  const existingDelayMs =
    directoryInvalidationScheduledDelayByWorkspace.get(workspaceDirectory)

  if (
    existingTimer &&
    existingDelayMs !== undefined &&
    existingDelayMs <= requestedDelayMs
  ) {
    return
  }

  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  const flushTimer = setTimeout(() => {
    directoryInvalidationTimers.delete(workspaceDirectory)
    directoryInvalidationScheduledDelayByWorkspace.delete(workspaceDirectory)
    flushAnalysisWatcherInvalidation(workspaceDirectory)
  }, requestedDelayMs)
  flushTimer.unref?.()
  directoryInvalidationTimers.set(workspaceDirectory, flushTimer)
  directoryInvalidationScheduledDelayByWorkspace.set(
    workspaceDirectory,
    requestedDelayMs
  )
}

function flushAnalysisWatcherInvalidation(workspaceDirectory: string): void {
  const pendingPaths = directoryInvalidationPathQueue.get(workspaceDirectory)
  directoryInvalidationPathQueue.delete(workspaceDirectory)
  if (!pendingPaths || pendingPaths.size === 0) {
    return
  }

  const normalizedPaths = collapseInvalidationPaths(pendingPaths.keys())
  if (normalizedPaths.length === 0) {
    return
  }

  const pathsToInvalidate = normalizedPaths.map((normalizedPath) => {
    return pendingPaths.get(normalizedPath) ?? normalizedPath
  })

  invalidateRuntimeAnalysisCachePaths(pathsToInvalidate)
  invalidateSharedFileTextPrefixCachePaths(pathsToInvalidate)

  const projectsToInvalidate = directoryToProjects.get(workspaceDirectory)
  if (!projectsToInvalidate) {
    return
  }

  for (const project of projectsToInvalidate) {
    invalidateProgramFileCachePaths(project, pathsToInvalidate)
  }

  evictTrackedProjectsForPaths(pathsToInvalidate)
}

export function invalidateProgramCachesByPath(path: string): number {
  return invalidateProgramCachesByPaths([path])
}

export function invalidateProgramCachesByPaths(
  paths: Iterable<string>
): number {
  const originalPathByNormalizedPath = new Map<string, string>()
  for (const path of paths) {
    if (typeof path !== 'string' || path.length === 0) {
      continue
    }

    const normalizedPath = normalizeComparablePath(path)
    if (!originalPathByNormalizedPath.has(normalizedPath)) {
      originalPathByNormalizedPath.set(normalizedPath, path)
    }
  }

  const normalizedPaths = collapseInvalidationPaths(
    originalPathByNormalizedPath.keys()
  )
  if (normalizedPaths.length === 0) {
    return 0
  }

  const pathsToInvalidate = normalizedPaths.map((normalizedPath) => {
    return originalPathByNormalizedPath.get(normalizedPath) ?? normalizedPath
  })
  invalidateSharedFileTextPrefixCachePaths(pathsToInvalidate)

  let affectedPrograms = 0

  // Program cache dependencies may include paths outside each workspace root.
  // Invalidate every tracked program so dependency-driven cache entries refresh.
  const projectsToInvalidate = new Set<TsMorphProject>()
  for (const projectsByDirectory of directoryToProjects.values()) {
    for (const project of projectsByDirectory) {
      projectsToInvalidate.add(project)
    }
  }

  for (const project of projectsToInvalidate) {
    invalidateProgramFileCachePaths(project, pathsToInvalidate)
    affectedPrograms += 1
  }

  evictTrackedProjectsForPaths(pathsToInvalidate)

  return affectedPrograms
}

export function disposeAnalysisWatchers(): void {
  for (const watcher of directoryWatchers.values()) {
    watcher.close()
  }

  for (const timer of directoryInvalidationTimers.values()) {
    clearTimeout(timer)
  }

  directoryInvalidationTimers.clear()
  directoryInvalidationScheduledDelayByWorkspace.clear()
  directoryInvalidationPathQueue.clear()
  directoryWatchers.clear()
  directoryToProjects.clear()
  projects.clear()
}

function getProgramKeyForAnalysisOptions(options?: AnalysisOptions) {
  if (!options) {
    return ''
  }

  return hashString(
    stableStringify({
      analysisScopeId: options.analysisScopeId ?? null,
      tsConfigFilePath:
        typeof options.tsConfigFilePath === 'string'
          ? resolve(options.tsConfigFilePath)
          : null,
      useInMemoryFileSystem: options.useInMemoryFileSystem === true,
      compilerOptions: options.compilerOptions ?? null,
    })
  )
}

function recordProjectTypeScriptConfigDependencies(
  project: TsMorphProject
): void {
  const configFilePath = (project.getCompilerOptions() as {
    configFilePath?: string
  }).configFilePath

  typeScriptConfigDependencyPathsByProject.set(
    project,
    getTypeScriptConfigDependencyPaths(configFilePath)
  )
}

function evictTrackedProject(project: TsMorphProject): void {
  for (const [programKey, trackedProject] of projects) {
    if (trackedProject === project) {
      projects.delete(programKey)
    }
  }

  for (const associatedProjects of directoryToProjects.values()) {
    associatedProjects.delete(project)
  }

  typeScriptConfigDependencyPathsByProject.delete(project)
  clearProjectAnalysisScopeId(project)
}

function evictTrackedProjectsForPaths(paths: Iterable<string>): void {
  const normalizedPaths = Array.from(paths, (path) => normalizeComparablePath(path))
  if (normalizedPaths.length === 0) {
    return
  }

  const trackedProjects = new Set<TsMorphProject>()
  for (const associatedProjects of directoryToProjects.values()) {
    for (const project of associatedProjects) {
      trackedProjects.add(project)
    }
  }

  for (const project of trackedProjects) {
    const dependencyPaths =
      typeScriptConfigDependencyPathsByProject.get(project) ??
      getTypeScriptConfigDependencyPaths(
        (project.getCompilerOptions() as {
          configFilePath?: string
        }).configFilePath
      )

    if (dependencyPaths.length === 0) {
      continue
    }

    const shouldEvict = dependencyPaths.some((dependencyPath) => {
      const normalizedDependencyPath = normalizeComparablePath(dependencyPath)

      return normalizedPaths.some((normalizedPath) => {
        return (
          normalizedPath === normalizedDependencyPath ||
          normalizedPath.startsWith(`${normalizedDependencyPath}/`) ||
          normalizedDependencyPath.startsWith(`${normalizedPath}/`)
        )
      })
    })

    if (shouldEvict) {
      evictTrackedProject(project)
    }
  }
}

function shouldEnableAnalysisWatchers(): boolean {
  if (typeof analysisWatcherRuntimeOptions.enabled === 'boolean') {
    return analysisWatcherRuntimeOptions.enabled
  }

  if (getServerPortFromProcessEnv() === undefined) {
    return false
  }

  const override = resolveAnalysisWatchersEnvOverride()
  if (override !== undefined) {
    return override
  }

  if (isVitestRuntime()) {
    return false
  }

  return isDevelopmentEnvironment()
}

function normalizeComparablePath(path: string): string {
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

function refreshOrAddSourceFile(project: TsMorphProject, filePath: string) {
  const existingSourceFile = project.getSourceFile(filePath)

  try {
    if (!existingSourceFile) {
      project.addSourceFileAtPath(filePath)
      return
    }

    const promise = existingSourceFile.refreshFromFileSystem()

    startRefreshingPrograms()

    activeRefreshingPrograms.add(promise)

    promise.finally(() => {
      activeRefreshingPrograms.delete(promise)
      if (activeRefreshingPrograms.size === 0) {
        completeRefreshingPrograms()
      }
    })
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('File not found') ||
        (typeof (error as NodeJS.ErrnoException).code === 'string' &&
          (error as NodeJS.ErrnoException).code === 'ENOENT'))
    ) {
      if (existingSourceFile) {
        existingSourceFile.deleteImmediatelySync()
      }

      return
    }

    throw error
  }
}

function createProgramDebugContext({
  program,
  programKey,
  workspaceDirectory,
  analysisOptions,
  cacheStatus,
}: {
  program: TsMorphProject
  programKey: string
  workspaceDirectory: string
  analysisOptions?: AnalysisOptions
  cacheStatus: 'hit' | 'miss'
}): DebugContext {
  const compilerOptions = program.getCompilerOptions()
  const tsConfigFilePath =
    compilerOptions['configFilePath'] ??
    analysisOptions?.tsConfigFilePath ??
    'tsconfig.json'

  return {
    operation: 'analysis.getProgram',
    data: {
      cacheStatus,
      programKey,
      analysisScopeId: analysisOptions?.analysisScopeId,
      workspaceDirectory,
      rootDirectories: program
        .getRootDirectories()
        .map((directory) => directory.getPath()),
      useInMemoryFileSystem: Boolean(analysisOptions?.useInMemoryFileSystem),
      compilerOptions,
      tsConfigFilePath,
    },
  }
}
