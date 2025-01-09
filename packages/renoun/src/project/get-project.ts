import { Project, ts } from 'ts-morph'
import { join, dirname, extname, resolve } from 'node:path'
import { existsSync, watch, statSync } from 'node:fs'
import type { FSWatcher } from 'node:fs'

import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.js'
import { resolvedTypeCache } from '../utils/resolve-type-at-location.js'
import {
  activeRefreshingProjects,
  completeRefreshingProjects,
  startRefreshingProjects,
} from './refresh.js'
import type { ProjectOptions } from './types.js'

const projects = new Map<string, Project>()
const directoryWatchers = new Map<string, FSWatcher>()
const directoryToProjects = new Map<string, Set<Project>>()

/** Get the project associated with the provided options. */
export function getProject(options?: ProjectOptions) {
  const projectId = JSON.stringify(options)

  if (projects.has(projectId)) {
    return projects.get(projectId)!
  }

  const project = new Project({
    compilerOptions: {
      allowJs: true,
      esModuleInterop: true,
      isolatedModules: true,
      resolveJsonModule: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      ...options?.compilerOptions,
    },
    tsConfigFilePath: options?.useInMemoryFileSystem
      ? undefined
      : (options?.tsConfigFilePath ?? 'tsconfig.json'),
    useInMemoryFileSystem: options?.useInMemoryFileSystem,
  })
  const projectDirectory = options?.tsConfigFilePath
    ? resolve(dirname(options.tsConfigFilePath))
    : process.cwd()
  let associatedProjects = directoryToProjects.get(projectDirectory)

  if (!associatedProjects) {
    associatedProjects = new Set()
    directoryToProjects.set(projectDirectory, associatedProjects)
  }

  associatedProjects.add(project)

  if (
    process.env.NODE_ENV === 'development' &&
    process.env.RENOUN_SERVER === 'true' &&
    !directoryWatchers.has(projectDirectory)
  ) {
    const watcher = watch(
      projectDirectory,
      { recursive: true },
      async (eventType, filename) => {
        if (!filename) return

        const filePath = join(projectDirectory, filename)

        if (isFilePathGitIgnored(filePath)) {
          return
        }

        const isDirectory = existsSync(filePath)
          ? statSync(filePath).isDirectory()
          : extname(filename) === ''

        try {
          const projectsToUpdate = directoryToProjects.get(projectDirectory)

          if (!projectsToUpdate) return

          for (const currentProject of projectsToUpdate) {
            if (eventType === 'rename') {
              if (existsSync(filePath)) {
                if (isDirectory) {
                  currentProject.addDirectoryAtPath(filePath)
                } else {
                  currentProject.addSourceFileAtPath(filePath)
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
              const previousSourceFile = currentProject.getSourceFile(filePath)

              if (previousSourceFile) {
                resolvedTypeCache.clear()

                startRefreshingProjects()

                const promise = previousSourceFile
                  .refreshFromFileSystem()
                  .finally(() => {
                    activeRefreshingProjects.delete(promise)
                    if (activeRefreshingProjects.size === 0) {
                      completeRefreshingProjects()
                    }
                  })

                activeRefreshingProjects.add(promise)
              } else {
                currentProject.addSourceFileAtPath(filePath)
              }
            }
          }
        } catch (error) {
          if (error instanceof Error) {
            throw new Error(
              `[renoun] An error occurred in the file system watcher while trying to ${eventType} the file path at: ${filename}`,
              { cause: error }
            )
          }
        }
      }
    )

    directoryWatchers.set(projectDirectory, watcher)
  }

  projects.set(projectId, project)

  return project
}
