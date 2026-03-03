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
import { invalidateProjectFileCachePaths } from './cache.ts'
import {
  invalidateRuntimeAnalysisCachePaths,
} from './cached-analysis.ts'
import { invalidateSharedFileTextPrefixCachePaths } from './file-text-prefix-cache.ts'
import {
  activeRefreshingProjects,
  completeRefreshingProjects,
  startRefreshingProjects,
} from './refresh.ts'
import {
  getServerPortFromProcessEnv,
  resolveProjectWatchersEnvOverride,
} from './runtime-env.ts'
import type { ProjectOptions } from './types.ts'

const { Project, ts } = getTsMorph()

const projects = new Map<string, TsMorphProject>()
const directoryWatchers = new Map<string, FSWatcher>()
const directoryToProjects = new Map<string, Set<TsMorphProject>>()
const directoryInvalidationPathQueue = new Map<string, Map<string, string>>()
const directoryInvalidationTimers = new Map<string, NodeJS.Timeout>()
const directoryInvalidationScheduledDelayByProject = new Map<string, number>()
type ProjectWatcherInvalidationPriority = 'immediate' | 'background'
const PROJECT_WATCHER_INVALIDATION_PRIORITY_DELAY_MS: Record<
  ProjectWatcherInvalidationPriority,
  number
> = {
  immediate: 0,
  background: 25,
}
const PROJECT_WATCHER_INVALIDATION_BATCH_WINDOW_MS = 25
const IGNORED_PROJECT_WATCH_PATH_SEGMENTS = new Set([
  '.next',
  '.renoun',
  '.git',
  'node_modules',
  'out',
  'dist',
  'build',
  'coverage',
])

export interface ProjectWatcherRuntimeOptions {
  enabled?: boolean
}

const projectWatcherRuntimeOptions: ProjectWatcherRuntimeOptions = {}

export function configureProjectWatcherRuntime(
  options: ProjectWatcherRuntimeOptions
): void {
  if ('enabled' in options) {
    projectWatcherRuntimeOptions.enabled = options.enabled
  }
}

export function resetProjectWatcherRuntimeConfiguration(): void {
  projectWatcherRuntimeOptions.enabled = undefined
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

/** Get the project associated with the provided options. */
export function getProject(options?: ProjectOptions) {
  const projectId = getSerializedProjectOptions(options)
  const projectDirectory = options?.tsConfigFilePath
    ? resolve(dirname(options.tsConfigFilePath))
    : process.cwd()

  if (projects.has(projectId)) {
    const existingProject = projects.get(projectId)!
    let associatedProjects = directoryToProjects.get(projectDirectory)
    if (!associatedProjects) {
      associatedProjects = new Set()
      directoryToProjects.set(projectDirectory, associatedProjects)
    }
    associatedProjects.add(existingProject)
    ensureProjectDirectoryWatcher(projectDirectory)

    getDebugLogger().debug('Reusing cached project instance', () =>
      createProjectDebugContext({
        project: existingProject,
        projectId,
        projectDirectory,
        projectOptions: options,
        cacheStatus: 'hit',
      })
    )

    return existingProject
  }

  const tsConfigFilePath = options?.tsConfigFilePath || 'tsconfig.json'
  const shouldUseInMemoryFs =
    options?.useInMemoryFileSystem || !existsSync(tsConfigFilePath)

  const project = new Project(
    shouldUseInMemoryFs
      ? {
          compilerOptions: {
            ...defaultCompilerOptions,
            ...options?.compilerOptions,
          },
          useInMemoryFileSystem: true,
        }
      : {
          compilerOptions: options?.compilerOptions,
          tsConfigFilePath,
        }
  )
  let associatedProjects = directoryToProjects.get(projectDirectory)

  if (!associatedProjects) {
    associatedProjects = new Set()
    directoryToProjects.set(projectDirectory, associatedProjects)
  }

  associatedProjects.add(project)

  ensureProjectDirectoryWatcher(projectDirectory)

  projects.set(projectId, project)

  getDebugLogger().info('Created new project instance', () =>
    createProjectDebugContext({
      project,
      projectId,
      projectDirectory,
      projectOptions: options,
      cacheStatus: 'miss',
    })
  )

  return project
}

function shouldIgnoreProjectWatchPath(filePath: string): boolean {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return true
  }

  const pathSegments = filePath.split(/[/\\]+/)
  for (const pathSegment of pathSegments) {
    if (IGNORED_PROJECT_WATCH_PATH_SEGMENTS.has(pathSegment)) {
      return true
    }
  }

  return false
}

function ensureProjectDirectoryWatcher(projectDirectory: string): void {
  if (
    !shouldEnableProjectWatchers() ||
    directoryWatchers.has(projectDirectory)
  ) {
    return
  }

  const watcher = watch(
    projectDirectory,
    { recursive: true },
    async (eventType, fileName) => {
      if (!fileName) return

      const watchedFileName = String(fileName)
      if (!watchedFileName) {
        return
      }

      if (shouldIgnoreProjectWatchPath(watchedFileName)) {
        return
      }

      const filePath = join(projectDirectory, watchedFileName)

      if (isFilePathGitIgnored(filePath)) {
        return
      }

      const isDirectory = existsSync(filePath)
        ? statSync(filePath).isDirectory()
        : extname(watchedFileName) === ''

      try {
        const projectsToUpdate = directoryToProjects.get(projectDirectory)

        if (!projectsToUpdate) return

        const invalidationPaths = new Set<string>([filePath])
        if (eventType === 'rename') {
          const parentDirectoryPath = dirname(filePath)
          if (parentDirectoryPath && parentDirectoryPath !== filePath) {
            invalidationPaths.add(parentDirectoryPath)
          }

          if (isDirectory) {
            invalidationPaths.add(projectDirectory)
          }
        }
        queueProjectWatcherInvalidation(projectDirectory, invalidationPaths, {
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
        if (error instanceof Error) {
          throw new Error(
            `[renoun] An error occurred in the file system watcher while trying to ${eventType} the file path at: ${watchedFileName}`,
            { cause: error }
          )
        }
      }
    }
  )

  directoryWatchers.set(projectDirectory, watcher)
}

function queueProjectWatcherInvalidation(
  projectDirectory: string,
  paths: Iterable<string>,
  options: {
    priority?: ProjectWatcherInvalidationPriority
  } = {}
): void {
  const pendingPaths =
    directoryInvalidationPathQueue.get(projectDirectory) ??
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
  directoryInvalidationPathQueue.set(projectDirectory, pendingPaths)

  const priority = options.priority ?? 'immediate'
  const requestedDelayMs =
    PROJECT_WATCHER_INVALIDATION_PRIORITY_DELAY_MS[priority] ??
    PROJECT_WATCHER_INVALIDATION_BATCH_WINDOW_MS
  const existingTimer = directoryInvalidationTimers.get(projectDirectory)
  const existingDelayMs =
    directoryInvalidationScheduledDelayByProject.get(projectDirectory)

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
    directoryInvalidationTimers.delete(projectDirectory)
    directoryInvalidationScheduledDelayByProject.delete(projectDirectory)
    flushProjectWatcherInvalidation(projectDirectory)
  }, requestedDelayMs)
  flushTimer.unref?.()
  directoryInvalidationTimers.set(projectDirectory, flushTimer)
  directoryInvalidationScheduledDelayByProject.set(
    projectDirectory,
    requestedDelayMs
  )
}

function flushProjectWatcherInvalidation(projectDirectory: string): void {
  const pendingPaths = directoryInvalidationPathQueue.get(projectDirectory)
  directoryInvalidationPathQueue.delete(projectDirectory)
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

  const projectsToUpdate = directoryToProjects.get(projectDirectory)
  if (!projectsToUpdate) {
    return
  }

  for (const project of projectsToUpdate) {
    invalidateProjectFileCachePaths(project, pathsToInvalidate)
  }
}

export function invalidateProjectCachesByPath(path: string): number {
  return invalidateProjectCachesByPaths([path])
}

export function invalidateProjectCachesByPaths(
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

  let affectedProjects = 0

  for (const [projectDirectory, projectsByDirectory] of directoryToProjects) {
    const normalizedProjectDirectory = normalizeComparablePath(projectDirectory)
    const intersectsAnyPath = normalizedPaths.some((normalizedPath) =>
      pathsIntersect(normalizedProjectDirectory, normalizedPath)
    )
    if (!intersectsAnyPath) {
      continue
    }

    for (const project of projectsByDirectory) {
      invalidateProjectFileCachePaths(project, pathsToInvalidate)
      affectedProjects += 1
    }
  }

  return affectedProjects
}

export function disposeProjectWatchers(): void {
  for (const watcher of directoryWatchers.values()) {
    watcher.close()
  }

  for (const timer of directoryInvalidationTimers.values()) {
    clearTimeout(timer)
  }

  directoryInvalidationTimers.clear()
  directoryInvalidationScheduledDelayByProject.clear()
  directoryInvalidationPathQueue.clear()
  directoryWatchers.clear()
  directoryToProjects.clear()
  projects.clear()
}

function getSerializedProjectOptions(options?: ProjectOptions) {
  if (!options) {
    return ''
  }

  return JSON.stringify(options)
}

function shouldEnableProjectWatchers(): boolean {
  if (typeof projectWatcherRuntimeOptions.enabled === 'boolean') {
    return projectWatcherRuntimeOptions.enabled
  }

  if (getServerPortFromProcessEnv() === undefined) {
    return false
  }

  const override = resolveProjectWatchersEnvOverride()
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

function pathsIntersect(firstPath: string, secondPath: string): boolean {
  if (firstPath === '.' || secondPath === '.') {
    return true
  }

  if (firstPath === secondPath) {
    return true
  }

  return (
    firstPath.startsWith(`${secondPath}/`) ||
    secondPath.startsWith(`${firstPath}/`)
  )
}

function refreshOrAddSourceFile(project: TsMorphProject, filePath: string) {
  const existingSourceFile = project.getSourceFile(filePath)

  try {
    if (!existingSourceFile) {
      project.addSourceFileAtPath(filePath)
      return
    }

    const promise = existingSourceFile.refreshFromFileSystem()

    startRefreshingProjects()

    activeRefreshingProjects.add(promise)

    promise.finally(() => {
      activeRefreshingProjects.delete(promise)
      if (activeRefreshingProjects.size === 0) {
        completeRefreshingProjects()
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

function createProjectDebugContext({
  project,
  projectId,
  projectDirectory,
  projectOptions,
  cacheStatus,
}: {
  project: TsMorphProject
  projectId: string
  projectDirectory: string
  projectOptions?: ProjectOptions
  cacheStatus: 'hit' | 'miss'
}): DebugContext {
  const compilerOptions = project.getCompilerOptions()
  const tsConfigFilePath =
    compilerOptions['configFilePath'] ??
    projectOptions?.tsConfigFilePath ??
    'tsconfig.json'

  return {
    operation: 'project.getProject',
    data: {
      cacheStatus,
      projectId,
      projectDirectory,
      rootDirectories: project
        .getRootDirectories()
        .map((directory) => directory.getPath()),
      useInMemoryFileSystem: Boolean(projectOptions?.useInMemoryFileSystem),
      compilerOptions,
      tsConfigFilePath,
    },
  }
}
