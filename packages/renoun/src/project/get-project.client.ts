import { Project, ts } from 'ts-morph'

import type { ProjectOptions } from './types.js'

const projects = new Map<string, Project>()

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

  projects.set(projectId, project)

  return project
}
