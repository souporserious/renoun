import type { Project, ProjectOptions as TsMorphProjectOptions } from 'ts-morph'
import { join, dirname, extname } from 'node:path'
import { existsSync, watch, statSync } from 'node:fs'

import { ProjectOptions } from './types'

const projects = new Map<string, Project>()

const DEFAULT_IGNORED_PATHS = [
  'node_modules',
  'dist',
  'out',
  '.mdxts',
  '.next',
  '.turbo',
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

/** Get all projects. */
export function getProjects() {
  return projects
}

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
    ? dirname(options.tsConfigFilePath)
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

        // The file was added, removed, or renamed
        if (eventType === 'rename') {
          if (existsSync(filePath)) {
            if (isDirectory) {
              project.addDirectoryAtPath(filename)
            } else {
              project.addSourceFileAtPath(filename)
            }
          } else if (isDirectory) {
            const removedDirectory = project.getDirectory(filename)
            if (removedDirectory) {
              removedDirectory.delete()
            }
          } else {
            const removedSourceFile = project.getSourceFile(filename)
            if (removedSourceFile) {
              removedSourceFile.delete()
            }
          }
        }
        // The file contents were changed
        else if (eventType === 'change') {
          const previousSourceFile = project.getSourceFile(filename)

          if (previousSourceFile) {
            previousSourceFile.refreshFromFileSystem()
          } else {
            project.addSourceFileAtPath(filename)
          }
        }
      }
    )
  }

  projects.set(projectId, project)

  return project
}
