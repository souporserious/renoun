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
import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.ts'
import { normalizePathKey, normalizeSlashes } from '../utils/path.ts'
import { invalidateProjectFileCache } from './cache.ts'
import { invalidateRuntimeAnalysisCachePath } from './cached-analysis.ts'
import {
  activeRefreshingProjects,
  completeRefreshingProjects,
  startRefreshingProjects,
} from './refresh.ts'
import type { ProjectOptions } from './types.ts'

const { Project, ts } = getTsMorph()

const projects = new Map<string, TsMorphProject>()
const inMemoryProjectIds = new Map<string, string>()
const directoryWatchers = new Map<string, FSWatcher>()
const directoryToProjects = new Map<string, Set<TsMorphProject>>()

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
  const useInMemoryFileSystem = Boolean(options?.useInMemoryFileSystem)
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

    const inMemoryProjectId = useInMemoryFileSystem
      ? (options!.projectId ?? '')
      : ''
    const previousProjectId = inMemoryProjectIds.get(projectId)

    if (useInMemoryFileSystem && previousProjectId !== inMemoryProjectId) {
      for (const sourceFile of existingProject.getSourceFiles()) {
        if (!sourceFile.isFromExternalLibrary()) {
          existingProject.removeSourceFile(sourceFile)
        }
      }
      inMemoryProjectIds.set(projectId, inMemoryProjectId)
    }

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
  if (useInMemoryFileSystem) {
    inMemoryProjectIds.set(projectId, options?.projectId ?? '')
  }

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

function ensureProjectDirectoryWatcher(projectDirectory: string): void {
  if (!shouldEnableProjectWatchers() || directoryWatchers.has(projectDirectory)) {
    return
  }

  const watcher = watch(
    projectDirectory,
    { recursive: true },
    async (eventType, fileName) => {
      if (!fileName) return

      const filePath = join(projectDirectory, fileName)

      if (isFilePathGitIgnored(filePath)) {
        return
      }

      const isDirectory = existsSync(filePath)
        ? statSync(filePath).isDirectory()
        : extname(fileName) === ''

      try {
        const projectsToUpdate = directoryToProjects.get(projectDirectory)

        if (!projectsToUpdate) return

        for (const currentProject of projectsToUpdate) {
          invalidateProjectFileCache(currentProject, filePath)
          invalidateRuntimeAnalysisCachePath(filePath)

          if (eventType === 'rename') {
            const parentDirectoryPath = dirname(filePath)
            if (parentDirectoryPath && parentDirectoryPath !== filePath) {
              invalidateProjectFileCache(currentProject, parentDirectoryPath)
              invalidateRuntimeAnalysisCachePath(parentDirectoryPath)
            }

            if (isDirectory) {
              invalidateProjectFileCache(currentProject, projectDirectory)
              invalidateRuntimeAnalysisCachePath(projectDirectory)
            }

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
            `[renoun] An error occurred in the file system watcher while trying to ${eventType} the file path at: ${fileName}`,
            { cause: error }
          )
        }
      }
    }
  )

  directoryWatchers.set(projectDirectory, watcher)
}

export function invalidateProjectCachesByPath(path: string): number {
  const normalizedPath = normalizeComparablePath(path)
  let affectedProjects = 0

  for (const [projectDirectory, projectsByDirectory] of directoryToProjects) {
    if (!pathsIntersect(normalizeComparablePath(projectDirectory), normalizedPath)) {
      continue
    }

    for (const project of projectsByDirectory) {
      invalidateProjectFileCache(project, normalizedPath)
      affectedProjects += 1
    }
  }

  return affectedProjects
}

export function disposeProjectWatchers(): void {
  for (const watcher of directoryWatchers.values()) {
    watcher.close()
  }

  directoryWatchers.clear()
}

function getSerializedProjectOptions(options?: ProjectOptions) {
  if (!options) {
    return ''
  }

  const normalizedOptions = {
    ...options,
    projectId: options.useInMemoryFileSystem ? undefined : options.projectId,
  }

  return JSON.stringify(normalizedOptions)
}

function shouldEnableProjectWatchers(): boolean {
  if (process.env.RENOUN_SERVER_PORT === undefined) {
    return false
  }

  const override = parseBooleanEnv(process.env.RENOUN_PROJECT_WATCHERS)
  if (override !== undefined) {
    return override
  }

  return true
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true') {
    return true
  }

  if (normalized === '0' || normalized === 'false') {
    return false
  }

  return undefined
}

function normalizeComparablePath(path: string): string {
  return normalizePathKey(normalizeSlashes(path))
}

function pathsIntersect(firstPath: string, secondPath: string): boolean {
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
