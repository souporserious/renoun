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
import { resolvedTypeCache } from '../utils/resolve-type-at-location.ts'
import { invalidateProjectFileCache } from './cache.ts'
import {
  activeRefreshingProjects,
  completeRefreshingProjects,
  startRefreshingProjects,
} from './refresh.ts'
import type { ProjectOptions } from './types.ts'

const { Project, ts } = getTsMorph()

const projects = new Map<string, TsMorphProject>()
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
  const projectId = JSON.stringify(options)
  const projectDirectory = options?.tsConfigFilePath
    ? resolve(dirname(options.tsConfigFilePath))
    : process.cwd()

  if (projects.has(projectId)) {
    const existingProject = projects.get(projectId)!

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

  if (
    process.env.NODE_ENV === 'development' &&
    process.env.RENOUN_SERVER_PORT !== undefined &&
    !directoryWatchers.has(projectDirectory)
  ) {
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
              `[renoun] An error occurred in the file system watcher while trying to ${eventType} the file path at: ${fileName}`,
              { cause: error }
            )
          }
        }
      }
    )

    directoryWatchers.set(projectDirectory, watcher)
  }

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

function refreshOrAddSourceFile(project: TsMorphProject, filePath: string) {
  const existingSourceFile = project.getSourceFile(filePath)

  try {
    if (!existingSourceFile) {
      project.addSourceFileAtPath(filePath)
      return
    }

    resolvedTypeCache.clear()

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
