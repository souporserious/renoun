import WebSocket from 'ws'

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
  method: string
  params: any
}

export class WebSocketServer {
  #server: WebSocket.Server

  #sockets: Set<WebSocket> = new Set()

  #handlers: { [key: string]: (params: any) => Promise<any> | any } = {}

  constructor() {
    this.#server = new WebSocket.Server({ port: 5996 })

    this.#server.on('connection', (ws: WebSocket) => {
      this.#sockets.add(ws)

      ws.on('close', () => {
        this.#sockets.delete(ws)
      })

      ws.on('error', (error) => {
        throw new Error(`[mdxts] WebSocket server error: ${error}`)
      })

      ws.on('message', (message: string) => {
        this.#handleMessage(ws, message)
      })
    })
  }

  registerMethod(method: string, handler: (params: any) => Promise<any> | any) {
    this.#handlers[method] = handler
  }

  async #handleMessage(ws: WebSocket, message: string) {
    let request: WebSocketRequest

    try {
      request = JSON.parse(message)
    } catch (error) {
      this.#sendError(ws, -1, -32700, '[mdxts] Parse error')
      return
    }

    if (!request.method || typeof request.method !== 'string') {
      this.#sendError(ws, request.id, -32600, '[mdxts] Invalid Request')
      return
    }

    const handler = this.#handlers[request.method]
    if (!handler) {
      this.#sendError(ws, request.id, -32601, '[mdxts] Method not found')
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
          '[mdxts] Internal error',
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
