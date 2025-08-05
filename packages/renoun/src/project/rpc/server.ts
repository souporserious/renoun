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

type WebSocketServerErrorType =
  | 'PORT_IN_USE'
  | 'INVALID_REQUEST'
  | 'METHOD_NOT_FOUND'
  | 'PARSE_ERROR'
  | 'INTERNAL_ERROR'
  | 'CONNECTION_ERROR'
  | 'AUTHENTICATION_ERROR'

interface WebSocketServerErrorContext {
  port?: number
  method?: string
  params?: any
  errorMessage?: string
  originalError?: Error
  requestId?: number
  availableMethods?: string[]
}

type WebSocketServerErrorMessageFn = (
  context: WebSocketServerErrorContext
) => string

const WEBSOCKET_SERVER_ERROR_MESSAGES: Record<
  WebSocketServerErrorType,
  WebSocketServerErrorMessageFn
> = {
  PORT_IN_USE: ({ port }) =>
    `[renoun] WebSocket server is already in use on port ${port}.\n\n` +
    `This issue likely occurred because:\n` +
    `• Both the 'renoun' CLI and the Next.js plugin are running simultaneously\n` +
    `• Another application is using the same port\n` +
    `• A previous server instance didn't shut down properly\n\n` +
    `Solutions:\n` +
    `• Stop one of the renoun processes (CLI or Next.js plugin)\n` +
    `• Use a different port if available\n` +
    `• Check for and kill any orphaned processes\n` +
    `• Restart your development environment`,

  INVALID_REQUEST: ({ requestId }) =>
    `[renoun] Invalid request received (ID: ${requestId})\n\n` +
    `The request format is malformed or missing required fields.\n` +
    `This could indicate:\n` +
    `• Client protocol version mismatch\n` +
    `• Network corruption\n` +
    `• Malformed JSON payload`,

  METHOD_NOT_FOUND: ({ method, availableMethods }) =>
    `[renoun] Method "${method}" is not registered on this server.\n\n` +
    `This could indicate:\n` +
    `• Client is calling a method that hasn't been registered\n` +
    `• Server and client are out of sync\n` +
    `• Method name has a typo\n\n` +
    `Available methods: ${availableMethods?.length ? availableMethods.join(', ') : 'none'}`,

  PARSE_ERROR: () =>
    `[renoun] Failed to parse incoming message.\n\n` +
    `The message is not valid JSON or has an invalid format.\n` +
    `This could indicate:\n` +
    `• Network corruption\n` +
    `• Client protocol version mismatch\n` +
    `• Malformed payload`,

  INTERNAL_ERROR: ({ method, params, errorMessage }) =>
    `[renoun] Internal server error while processing method "${method}".\n\n` +
    `Request parameters:\n${JSON.stringify(params, null, 2)}\n\n` +
    `Error details: ${errorMessage}\n\n` +
    `This indicates a bug in the server implementation.\n` +
    `Please check the server logs for more details.`,

  CONNECTION_ERROR: ({ errorMessage }) =>
    `[renoun] WebSocket connection error: ${errorMessage}\n\n` +
    `This could indicate:\n` +
    `• Network connectivity issues\n` +
    `• Client disconnected unexpectedly\n` +
    `• Protocol violations`,

  AUTHENTICATION_ERROR: () =>
    `[renoun] Authentication failed.\n\n` +
    `The client failed to authenticate with the server.\n` +
    `This could indicate:\n` +
    `• Invalid server ID\n` +
    `• Origin mismatch\n` +
    `• Client/server version mismatch`,
}

class WebSocketServerError extends Error {
  readonly type: WebSocketServerErrorType
  readonly code: number
  readonly requestId?: number
  readonly method?: string
  readonly params?: any
  readonly originalError?: Error

  constructor(
    message: string,
    type: WebSocketServerErrorType,
    code: number,
    context?: {
      requestId?: number
      method?: string
      params?: any
      originalError?: Error
    }
  ) {
    super(message)
    this.name = 'WebSocketServerError'
    this.type = type
    this.code = code
    this.requestId = context?.requestId
    this.method = context?.method
    this.params = context?.params
    this.originalError = context?.originalError
  }
}

const SERVER_ID = randomBytes(16).toString('hex')
process.env.RENOUN_SERVER_ID = SERVER_ID

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
          host: 'localhost',
          verifyClient: (info, callback) => {
            if (info.req.headers['sec-websocket-protocol'] !== SERVER_ID) {
              return callback(false, 401, 'Unauthorized')
            }

            if (info.origin) {
              let hostname: string
              try {
                hostname = new URL(info.origin).hostname
              } catch {
                return callback(false, 403, 'Bad Origin')
              }
              if (hostname !== 'localhost') {
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

  #createServerError(
    type: WebSocketServerErrorType,
    code: number,
    context: WebSocketServerErrorContext
  ): WebSocketServerError {
    const messageFn = WEBSOCKET_SERVER_ERROR_MESSAGES[type]
    const message = messageFn(context)

    return new WebSocketServerError(message, type, code, {
      requestId: context.requestId,
      method: context.method,
      params: context.params,
      originalError: context.originalError,
    })
  }

  #init() {
    this.#server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        const serverError = this.#createServerError('PORT_IN_USE', -32000, {
          port: this.#server.options.port,
          originalError: error,
        })
        this.#rejectReady(serverError)
      } else {
        this.#rejectReady(
          new Error('[renoun] WebSocket server error', { cause: error })
        )
      }
    })

    this.#server.on('connection', (ws: WebSocket) => {
      this.#sockets.add(ws)

      ws.on('close', () => {
        this.#sockets.delete(ws)
      })

      ws.on('error', (error) => {
        const serverError = this.#createServerError(
          'CONNECTION_ERROR',
          -32001,
          {
            errorMessage: error.message,
            originalError: error,
          }
        )
        console.error(serverError.message)
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
      try {
        ws.close(1000)
      } catch (error) {
        console.error('[renoun] Error closing WebSocket connection:', error)
      }
    })

    // Stop the WebSocket server from accepting new connections
    this.#server.close((error) => {
      if (error) {
        console.error('[renoun] Error while closing WebSocket server:', error)
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
      const serverError = this.#createServerError('PARSE_ERROR', -32700, {
        originalError:
          error instanceof Error ? error : new Error(String(error)),
      })
      this.#sendError(ws, -1, serverError.code, serverError.message)
      return
    }

    if (!request.method || typeof request.method !== 'string') {
      const serverError = this.#createServerError('INVALID_REQUEST', -32600, {
        requestId: request.id,
      })
      this.#sendError(ws, request.id, serverError.code, serverError.message)
      return
    }

    const handler = this.#handlers[request.method]
    if (!handler) {
      const serverError = this.#createServerError('METHOD_NOT_FOUND', -32601, {
        method: request.method,
        availableMethods: Object.keys(this.#handlers),
      })
      this.#sendError(ws, request.id, serverError.code, serverError.message)
      return
    }

    try {
      const result = await handler(request.params)
      this.#sendResponse(ws, request.id, result)
    } catch (error) {
      const serverError = this.#createServerError('INTERNAL_ERROR', -32603, {
        method: request.method,
        params: request.params,
        errorMessage: error instanceof Error ? error.message : String(error),
        originalError:
          error instanceof Error ? error : new Error(String(error)),
      })
      this.#sendError(
        ws,
        request.id,
        serverError.code,
        serverError.message,
        serverError.originalError?.message
      )
    }
  }

  sendNotification(message: WebSocketNotification) {
    const serialized = JSON.stringify(message)
    this.#sockets.forEach((ws) => {
      try {
        ws.send(serialized)
      } catch (error) {
        console.error('[renoun] Error sending notification:', error)
      }
    })
  }

  #sendResponse(ws: WebSocket, id: number | undefined, result: any) {
    try {
      ws.send(
        JSON.stringify({
          id,
          result,
        } satisfies WebSocketResponse)
      )
    } catch (error) {
      console.error('[renoun] Error sending response:', error)
    }
  }

  #sendError(
    ws: WebSocket,
    id: number | undefined,
    code: number,
    message: string,
    data: any = null
  ) {
    try {
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
    } catch (error) {
      console.error('[renoun] Error sending error response:', error)
    }
  }
}
