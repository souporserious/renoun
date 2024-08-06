import {
  Project,
  ts,
  type ProjectOptions as TsMorphProjectOptions,
} from 'ts-morph'
import { watch, type FSWatcher } from 'node:fs'

import { analyzeSourceText } from '../utils/analyze-source-text'
import { WebSocketServer } from './rpc/server'
import { ProjectOptions } from './types'

const projects = new Map<string, Project>()
const watchers = new Map<string, FSWatcher>()
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
function getProject(options?: ProjectOptions) {
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

/** Create a WebSocket server. */
export function createServer() {
  const server = new WebSocketServer()

  server.registerMethod(
    'analyzeSourceText',
    async ({
      projectOptions,
      ...options
    }: Parameters<typeof analyzeSourceText>[0] & {
      projectOptions?: ProjectOptions
    }) => {
      const project = getProject(projectOptions)

      process.env.MDXTS_THEME_PATH = 'nord'

      return analyzeSourceText({
        ...options,
        project,
      })
    }
  )

  server.registerMethod(
    'refreshWatch',
    async (options: { directory: string }) => {
      watchers.set(
        options.directory,
        watch(options.directory, { persistent: true, recursive: true })
      )
    }
  )

  server.registerMethod(
    'refreshUnwatch',
    async (options: { directory: string }) => {
      const watcher = watchers.get(options.directory)

      if (watcher) {
        watcher.close()
        watchers.delete(options.directory)
      }
    }
  )

  return server
}
