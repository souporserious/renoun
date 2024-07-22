import {
  Project,
  ts,
  type ProjectOptions as TsMorphProjectOptions,
} from 'ts-morph'
import { WebSocketServer } from 'ws'
import { resolve } from 'node:path'

import { analyzeSourceText } from '../utils/analyze-source-text'
import { ProjectOptions } from './types'

const projects = new Map<string, Project>()
const DEFAULT_OPTIONS = {
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

/** Get the project associated with the provided WebSocket connection. */
function getProject(id: string) {
  const project = projects.get(id)

  if (!project) {
    throw new Error('Project not found for WebSocket connection')
  }

  return project
}

/** Create a WebSocket server. */
export function createServer() {
  const wss = new WebSocketServer({ port: 0 })
  const port = getPort(wss)

  return wss
    .on('listening', () => {
      console.log(`[mdxts] server is listening at port ${port}`)
    })
    .on('connection', (ws) => {
      let projectId: string

      ws.on('message', async (event) => {
        const { type, data, id } = JSON.parse(event.toString())
        const send = (type: string, data?: any) => {
          ws.send(JSON.stringify({ type, data, id }))
        }

        if (type === 'initialize') {
          projectId = event.toString()
          if (projects.has(projectId)) {
            send('initialize:done')
          } else {
            const {
              gitSource,
              gitBranch,
              gitProvider,
              theme = 'nord',
              siteUrl,
              ...options
            } = (data || {}) as ProjectOptions
            const project = new Project({
              ...DEFAULT_OPTIONS,
              ...options,
            })

            projects.set(projectId, project)

            process.env.MDXTS_THEME_PATH = theme.endsWith('.json')
              ? resolve(process.cwd(), theme)
              : theme

            send('initialize:done')
          }
        } else if (type === 'analyzeSourceText') {
          const project = getProject(projectId)
          const result = await analyzeSourceText({ project, ...data })
          send('analyzeSourceText:done', { ...result })
        } else {
          throw new Error(`Unknown message type: ${type}`)
        }
      })
    })
}

/** Get the port number from the provided address. */
export function getPort(wss: WebSocketServer): number {
  const address = wss.address()

  if (address === null) {
    throw new Error('WebSocket server is not bound to an address')
  }

  if (typeof address === 'string') {
    const port = parseInt(address, 10)
    if (isNaN(port)) {
      throw new Error(
        `WebSocket server is using a named pipe or an invalid address: ${address}`
      )
    }
    return port
  }

  return address.port
}
