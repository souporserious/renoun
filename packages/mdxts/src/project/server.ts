import { Project, ts, type ProjectOptions } from 'ts-morph'
import { WebSocketServer } from 'ws'

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

      ws.on('message', (event) => {
        const { type, data } = JSON.parse(event.toString())

        if (type === 'initialize') {
          projectId = event.toString()
          if (projects.has(projectId)) {
            send('initialize:done')
            return
          }
          const project = new Project(data || DEFAULT_OPTIONS)
          projects.set(projectId, project)
          send('initialize:done')
        }

        if (type === 'analyze') {
          const project = getProject(projectId)
          // TODO: analysis
          send('analyze:done', {})
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
