import type { AddressInfo, Server } from 'ws'
import WebSocket from 'ws'
import { randomBytes } from 'node:crypto'

export interface WebSocketRequest {
  method: string
  params: any
  id?: number
}

export interface WebSocketResponse {
  result?: any
  error?: { code: number; message: string; data?: any }
  id?: number
}

export interface WebSocketNotification {
  type: string
  data?: any
}

const SECRET = randomBytes(16).toString('hex')
process.env.RENOUN_SERVER_SECRET = SECRET

export class WebSocketServer {
  #server!: Server

  #sockets: Set<WebSocket> = new Set()

  #readyPromise!: Promise<void>

  #resolveReady!: () => void

  #rejectReady!: (error: any) => void

  #handlers: { [key: string]: (params: any) => Promise<any> | any } = {}

  constructor(options?: { port?: number }) {
    this.#readyPromise = new Promise<void>((resolve, reject) => {
      this.#resolveReady = resolve
      this.#rejectReady = reject
    })

    import('ws')
      .then((ws) => {
        this.#server = new ws.WebSocketServer({
          port: options?.port ?? 0,
          host: '127.0.0.1',
          verifyClient: (info, callback) => {
            if (info.req.headers['sec-websocket-protocol'] !== SECRET) {
              return callback(false, 401, 'Unauthorized')
            }

            if (info.origin) {
              let hostname: string
              try {
                hostname = new URL(info.origin).hostname
              } catch {
                return callback(false, 403, 'Bad Origin')
              }
              if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
                return callback(false, 403, 'Forbidden')
              }
            }

            callback(true, 200, 'OK')
          },
        })
        this.#init()
      })
      .catch((error) => {
        this.#rejectReady(error)
      })
  }

  #init() {
    this.#server.on('error', (error: NodeJS.ErrnoException) => {
      let message = '[renoun] WebSocket server error'

      if (error.code === 'EADDRINUSE') {
        message = `[renoun] WebSocket server is already in use. This issue likely occurred because both the 'renoun' CLI and the Next.js plugin are running simultaneously. The Next.js plugin already manages the WebSocket server. Please ensure that only one of these is used at a time to avoid conflicts. You may need to stop one of the processes or verify that the port is not being used by another application. Please file an issue if this error persists.`
      }

      this.#rejectReady(new Error(message, { cause: error }))
    })

    this.#server.on('connection', (ws: WebSocket) => {
      this.#sockets.add(ws)

      ws.on('close', () => {
        this.#sockets.delete(ws)
      })

      ws.on('error', (error) => {
        throw new Error(`[renoun] WebSocket server error`, { cause: error })
      })

      ws.on('message', (message: string) => {
        this.#handleMessage(ws, message)
      })
    })

    this.#server.on('listening', () => {
      this.#resolveReady()
    })
  }

  cleanup() {
    // Close all active WebSocket connections
    this.#sockets.forEach((ws) => {
      ws.close(1000)
    })

    // Stop the WebSocket server from accepting new connections
    this.#server.close((error) => {
      if (error) {
        new Error('[renoun] Error while closing WebSocket server', {
          cause: error,
        })
      } else {
        console.log('[renoun] WebSocket server closed successfully.')
      }
    })
  }

  async isReady() {
    return this.#readyPromise
  }

  async getPort() {
    await this.isReady()

    const address = this.#server.address()

    if (address && typeof address !== 'string') {
      return (address as AddressInfo).port
    }

    throw new Error('[renoun] Unable to retrieve server port')
  }

  registerMethod(method: string, handler: (params: any) => Promise<any> | any) {
    this.#handlers[method] = handler
  }

  async #handleMessage(ws: WebSocket, message: string | Buffer) {
    let request: WebSocketRequest

    try {
      request = JSON.parse(message.toString())
    } catch (error) {
      this.#sendError(ws, -1, -32700, '[renoun] Parse error')
      return
    }

    if (!request.method || typeof request.method !== 'string') {
      this.#sendError(ws, request.id, -32600, '[renoun] Invalid Request')
      return
    }

    const handler = this.#handlers[request.method]
    if (!handler) {
      this.#sendError(
        ws,
        request.id,
        -32601,
        `[renoun] Method not registered: "${request.method}"`
      )
      return
    }

    try {
      const result = await handler(request.params)
      this.#sendResponse(ws, request.id, result)
    } catch (error) {
      if (error instanceof Error) {
        const params = JSON.stringify(request.params, null, 2)
        this.#sendError(
          ws,
          request.id,
          -32603,
          `[renoun] Internal server error for method "${request.method}" with params:\n${params}`,
          error.message
        )
      }
    }
  }

  sendNotification(message: WebSocketNotification) {
    const serialized = JSON.stringify(message)
    this.#sockets.forEach((ws) => {
      ws.send(serialized)
    })
  }

  #sendResponse(ws: WebSocket, id: number | undefined, result: any) {
    ws.send(
      JSON.stringify({
        id,
        result,
      } satisfies WebSocketResponse)
    )
  }

  #sendError(
    ws: WebSocket,
    id: number | undefined,
    code: number,
    message: string,
    data: any = null
  ) {
    ws.send(
      JSON.stringify({
        id,
        error: {
          code,
          message,
          data,
        },
      } satisfies WebSocketResponse)
    )
  }
}
