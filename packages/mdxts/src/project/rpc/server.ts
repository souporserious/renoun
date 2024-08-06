import WebSocket from 'ws'

export interface WebSocketRequest {
  method: string
  params: any
  id: number
}

export interface WebSocketResponse {
  result?: any
  error?: { code: number; message: string; data?: any }
  id: number
}

export class WebSocketServer {
  #server: WebSocket.Server
  #handlers: { [key: string]: (params: any) => Promise<any> | any } = {}

  constructor(port: number = 0) {
    this.#server = new WebSocket.Server({ port })
    this.#server.on('connection', (ws: WebSocket) => {
      ws.on('message', (message: string) => this.#handleMessage(ws, message))
    })
  }

  getPort(): number {
    const address = this.#server.address()

    if (address === null) {
      throw new Error('WebSocket server is not bound to an address')
    }

    if (typeof address === 'string') {
      const port = parseInt(address, 10)
      if (isNaN(port)) {
        throw new Error(
          `WebSocket server must be bound to a port, but is using a named pipe or an invalid address: ${address}`
        )
      }
      return port
    }

    return address.port
  }

  registerMethod(method: string, handler: (params: any) => Promise<any> | any) {
    this.#handlers[method] = handler
  }

  async #handleMessage(ws: WebSocket, message: string) {
    let request: WebSocketRequest

    try {
      request = JSON.parse(message)
    } catch (error) {
      this.#sendError(ws, -1, -32700, 'Parse error')
      return
    }

    if (!request.method || typeof request.method !== 'string') {
      this.#sendError(ws, request.id, -32600, 'Invalid Request')
      return
    }

    const handler = this.#handlers[request.method]
    if (!handler) {
      this.#sendError(ws, request.id, -32601, 'Method not found')
      return
    }

    try {
      const result = await handler(request.params)
      this.#sendResponse(ws, request.id, result)
    } catch (error) {
      if (error instanceof Error) {
        this.#sendError(ws, request.id, -32603, 'Internal error', error.message)
      }
    }
  }

  #sendResponse(ws: WebSocket, id: number, result: any) {
    ws.send(
      JSON.stringify({
        id,
        result,
      } satisfies WebSocketResponse)
    )
  }

  #sendError(
    ws: WebSocket,
    id: number,
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
