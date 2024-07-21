import { Project, ts, type ProjectOptions } from 'ts-morph'
import { WebSocketServer } from 'ws'

import { analyzeSourceText } from '../utils/analyze-source-text'

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
} satisfies ProjectOptions

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
      const send = (type: string, data?: any) => {
        ws.send(JSON.stringify({ type, data }))
      }
      let projectId: string

      ws.on('message', async (event) => {
        const { type, data } = JSON.parse(event.toString())

        if (type === 'initialize') {
          projectId = event.toString()
          if (projects.has(projectId)) {
            send('initialize:done')
          } else {
            const project = new Project(data || DEFAULT_OPTIONS)
            projects.set(projectId, project)
            send('initialize:done')
          }
        } else if (type === 'analyzeSourceText') {
          const project = getProject(projectId)
          const result = await analyzeSourceText({ project, ...data })
          send('analyzeSourceText:done', result)
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
