import type { Project, ProjectOptions as TsMorphProjectOptions } from 'ts-morph'
import { join, dirname, extname, resolve } from 'node:path'
import { existsSync, watch, statSync } from 'node:fs'

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
          }
          // The file contents were changed
          else if (eventType === 'change') {
            const previousSourceFile = project.getSourceFile(filePath)
            if (previousSourceFile) {
              previousSourceFile.refreshFromFileSystem()
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
