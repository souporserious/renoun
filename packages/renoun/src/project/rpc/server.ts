import WebSocket from 'ws'

WebSocket.WebSocketServer

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

export class WebSocketServer {
  #server!: WebSocket.Server

  #sockets: Set<WebSocket> = new Set()

  #handlers: { [key: string]: (params: any) => Promise<any> | any } = {}

  constructor() {
    import('ws').then((ws) => {
      this.#server = new ws.WebSocketServer({ port: 5996 })
      this.init()
    })
  }

  init() {
    this.#server.on('error', (error: NodeJS.ErrnoException) => {
      let message = '[renoun] WebSocket server error'

      if (error.code === 'EADDRINUSE') {
        message = `[renoun] WebSocket server is already in use. This issue likely occurred because both the 'renoun' CLI and the Next.js plugin are running simultaneously. The Next.js plugin already manages the WebSocket server. Please ensure that only one of these is used at a time to avoid conflicts. You may need to stop one of the processes or verify that the port is not being used by another application. Please file an issue if this error persists.`
      }

      throw new Error(message, { cause: error })
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
  }

  cleanup() {
    // Close all active WebSocket connection
    this.#sockets.forEach((ws) => {
      ws.close()
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
        this.#sendError(
          ws,
          request.id,
          -32603,
          `[renoun] Internal error for method "${request.method}" with params:\n${JSON.stringify(request.params, null, 2)}`,
          error.message
        )
      }
    }
  }

  sendNotification(message: WebSocketNotification) {
    this.#sockets.forEach((ws) => {
      ws.send(JSON.stringify(message))
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
