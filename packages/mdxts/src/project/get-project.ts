import {
  Project,
  ts,
  type ProjectOptions as TsMorphProjectOptions,
} from 'ts-morph'

import { ProjectOptions } from './types'

const projects = new Map<string, Project>()

const DEFAULT_PROJECT_OPTIONS = {
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
} satisfies TsMorphProjectOptions

/** Get the project associated with the provided options. */
export function getProject(options?: ProjectOptions) {
  const projectId = JSON.stringify(options)

  if (projects.has(projectId)) {
    return projects.get(projectId)!
  }

  const project = new Project({
    ...DEFAULT_PROJECT_OPTIONS,
    ...options,
  })

  projects.set(projectId, project)

  return project
}
