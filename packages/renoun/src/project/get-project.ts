import { Project, ts } from 'ts-morph'
import { join, dirname, extname, resolve } from 'node:path'
import { existsSync, watch, statSync } from 'node:fs'

import {
  activeRefreshingProjects,
  completeRefreshingProjects,
  startRefreshingProjects,
} from './refresh.js'
import { resolvedTypeCache } from '../utils/resolve-type-at-location.js'
import { ProjectOptions } from './types.js'

const projects = new Map<string, Project>()

const DEFAULT_IGNORED_PATHS = [
  '.git',
  '.next',
  '.turbo',
  'build',
  'dist',
  'node_modules',
  'out',
]

/** Get the project associated with the provided options. */
export function getProject(options?: ProjectOptions) {
  const projectId = JSON.stringify(options)

  if (projects.has(projectId)) {
    return projects.get(projectId)!
  }

  const project = new Project({
    compilerOptions: {
      allowJs: true,
      resolveJsonModule: true,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      isolatedModules: true,
    },
    tsConfigFilePath: 'tsconfig.json',
    ...options,
  })
  const projectDirectory = options?.tsConfigFilePath
    ? resolve(dirname(options.tsConfigFilePath))
    : process.cwd()

  if (process.env.NODE_ENV === 'development') {
    watch(
      projectDirectory,
      { recursive: true },
      async (eventType, filename) => {
        if (!filename) return

        const filePath = join(projectDirectory, filename)

        if (
          DEFAULT_IGNORED_PATHS.some((ignoredPath) =>
            filePath.includes(ignoredPath)
          )
        ) {
          return
        }

        const isDirectory = existsSync(filePath)
          ? statSync(filePath).isDirectory()
          : extname(filename) === ''

        try {
          // The file was added, removed, or renamed
          if (eventType === 'rename') {
            if (existsSync(filePath)) {
              if (isDirectory) {
                project.addDirectoryAtPath(filePath)
              } else {
                project.addSourceFileAtPath(filePath)
              }
            } else if (isDirectory) {
              const removedDirectory = project.getDirectory(filePath)
              if (removedDirectory) {
                removedDirectory.delete()
              }
            } else {
              const removedSourceFile = project.getSourceFile(filePath)
              if (removedSourceFile) {
                removedSourceFile.delete()
              }
            }
          } else if (eventType === 'change') {
            const previousSourceFile = project.getSourceFile(filePath)

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
              project.addSourceFileAtPath(filePath)
            }
          }
        } catch (error) {
          if (error instanceof Error) {
            throw new Error(
              `[renoun] An error occurred while trying to update the project based on a change to the file system for: ${filename}`,
              { cause: error }
            )
          }
        }
      }
    )
  }

  projects.set(projectId, project)

  return project
}
