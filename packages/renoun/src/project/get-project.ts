import type {
  Project,
  ProjectOptions as TsMorphProjectOptions,
  FileSystemRefreshResult,
} from 'ts-morph'
import { EventEmitter } from 'node:events'
import { join, dirname, extname, resolve } from 'node:path'
import { existsSync, watch, statSync } from 'node:fs'

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
const DEFAULT_PROJECT_OPTIONS = {
  compilerOptions: {
    allowJs: true,
    resolveJsonModule: true,
    esModuleInterop: true,
    moduleResolution: 100, // ts.ModuleResolutionKind.Bundler,
    jsx: 4, // ts.JsxEmit.ReactJSX,
    module: 99, // ts.ModuleKind.ESNext,
    target: 99, // ts.ScriptTarget.ESNext,
    isolatedModules: true,
  },
  tsConfigFilePath: 'tsconfig.json',
} satisfies TsMorphProjectOptions

/** Get the project associated with the provided options. */
export async function getProject(options?: ProjectOptions) {
  const projectId = JSON.stringify(options)

  if (projects.has(projectId)) {
    return projects.get(projectId)!
  }

  const { Project } = await import('ts-morph')
  const project = new Project({
    ...DEFAULT_PROJECT_OPTIONS,
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

              const promise = previousSourceFile.refreshFromFileSystem()
              activeRefreshingProjects.add(promise)

              promise.finally(() => {
                activeRefreshingProjects.delete(promise)
                if (activeRefreshingProjects.size === 0) {
                  completeRefreshingProjects()
                }
              })
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

const REFRESHING_STARTED = 'refreshing:started'
const REFRESHING_COMPLETED = 'refreshing:completed'
const emitter = new EventEmitter()
const activeRefreshingProjects = new Set<Promise<FileSystemRefreshResult>>()
let isRefreshingProjects = false

/** Mark the start of the refreshing process and emit an event. */
function startRefreshingProjects() {
  if (!isRefreshingProjects) {
    isRefreshingProjects = true
    emitter.emit(REFRESHING_STARTED)
  }
}

/** Mark the completion of the refreshing process and emit an event. */
function completeRefreshingProjects() {
  if (isRefreshingProjects && activeRefreshingProjects.size === 0) {
    isRefreshingProjects = false
    emitter.emit(REFRESHING_COMPLETED)
  }
}

/** Emit an event when all projects have finished refreshing. */
export async function waitForRefreshingProjects() {
  if (!isRefreshingProjects) return

  return new Promise<void>((resolve) => {
    const timeoutId = setTimeout(() => {
      emitter.removeAllListeners(REFRESHING_COMPLETED)
      resolve()
    }, 10000)

    emitter.once(REFRESHING_COMPLETED, () => {
      clearTimeout(timeoutId)
      resolve()
    })
  })
}
