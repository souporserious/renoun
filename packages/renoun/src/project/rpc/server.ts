import type { AddressInfo, Server } from 'ws'
import WebSocket from 'ws'
import { randomBytes } from 'node:crypto'

import { debug } from '../../utils/debug.js'

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
    super(message, { cause: context?.originalError })
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

const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024
const MAX_BUFFERED = 8 * 1024 * 1024
const HEARTBEAT_MS = 30_000
const REQUEST_TIMEOUT_MS = 20_000
const CLOSE_TEXT: Record<number, string> = {
  1000: 'Normal Closure',
  1001: 'Going Away',
  1006: 'Abnormal Closure',
  1009: 'Message Too Big',
  1011: 'Internal Error',
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), ms)
    ),
  ])
}

export class WebSocketServer {
  #server!: Server

  #sockets: Set<WebSocket> = new Set()

  #socketData = new WeakMap<
    WebSocket,
    { isAlive: boolean; connectionId: number }
  >()

  #readyPromise!: Promise<void>

  #resolveReady!: () => void

  #rejectReady!: (error: any) => void

  #handlers: { [key: string]: (params: any) => Promise<any> | any } = {}

  #heartbeatTimer?: NodeJS.Timeout

  #nextConnectionId = 1

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
          maxPayload: MAX_PAYLOAD_BYTES,
          perMessageDeflate: false,
          verifyClient: (info, callback) => {
            if (info.req.headers['sec-websocket-protocol'] !== SERVER_ID) {
              debug.warn('Client rejected: bad protocol', {
                operation: 'ws-auth',
                data: { reason: 'protocol_mismatch' },
              })
              return callback(false, 401, 'Unauthorized')
            }

            if (info.origin) {
              let hostname: string
              try {
                hostname = new URL(info.origin).hostname
              } catch {
                debug.warn('Client rejected: bad origin URL', {
                  operation: 'ws-auth',
                  data: { origin: info.origin },
                })
                return callback(false, 403, 'Bad Origin')
              }
              if (hostname !== 'localhost') {
                debug.warn('Client rejected: forbidden origin', {
                  operation: 'ws-auth',
                  data: { origin: info.origin },
                })
                return callback(false, 403, 'Forbidden')
              }
            }

            callback(true, 200, 'OK')
          },
        })
        this.#init()
      })
      .catch((error) => {
        debug.error('Failed to create WebSocket server', {
          operation: 'ws-server',
          data: { error: (error as Error).message },
        })
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
        debug.error(serverError.message, { operation: 'ws-server' })
        this.#rejectReady(serverError)
      } else {
        debug.error('WebSocket server error', {
          operation: 'ws-server',
          data: { error: error.message },
        })
        this.#rejectReady(
          new Error('[renoun] WebSocket server error', { cause: error })
        )
      }
    })

    this.#server.on('connection', (ws: WebSocket, req: any) => {
      const connectionId = this.#nextConnectionId++

      this.#sockets.add(ws)
      this.#socketData.set(ws, { isAlive: true, connectionId })

      debug.info('WS connection opened', {
        operation: 'websocket-server',
        data: { connectionId, remote: req?.socket?.remoteAddress },
      })

      ws.on('pong', () => {
        const data = this.#socketData.get(ws)

        if (data) {
          data.isAlive = true
        }
      })

      ws.on('close', (code: number, reasonBuf: Buffer) => {
        this.#sockets.delete(ws)
        this.#socketData.delete(ws)

        const reason = reasonBuf?.toString() || CLOSE_TEXT[code] || 'Unknown'
        debug.info('WebSocket connection closed', {
          operation: 'websocket-server',
          data: { connectionId, code, reason },
        })
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
        debug.error(serverError.message, {
          operation: 'websocket-server',
          data: { connectionId },
        })
      })

      ws.on('message', (message: string | Buffer) => {
        this.#handleMessage(ws, message)
      })
    })

    this.#server.on('listening', () => {
      // Start heartbeat once server is listening
      this.#heartbeatTimer = setInterval(() => {
        for (const ws of this.#sockets) {
          const data = this.#socketData.get(ws)

          if (data?.isAlive === false) {
            debug.warn('Terminating dead connection', {
              operation: 'websocket-server',
              data: { connectionId: data.connectionId },
            })
            try {
              ws.terminate()
            } catch {}
            continue
          }

          if (data) {
            data.isAlive = false
          }

          try {
            ws.ping()
          } catch {}
        }
      }, HEARTBEAT_MS)

      const address = this.#server.address()
      const port =
        address && typeof address !== 'string'
          ? (address as AddressInfo).port
          : this.#server.options.port
      debug.info('WebSocket server listening', {
        operation: 'ws-server',
        data: { port },
      })
      this.#resolveReady()
    })

    this.#server.on('close', () => {
      if (this.#heartbeatTimer) {
        clearInterval(this.#heartbeatTimer)
      }
      debug.info('WebSocket server closed', { operation: 'ws-server' })
    })
  }

  cleanup() {
    debug.info('Server cleanup initiated', {
      operation: 'ws-server',
      data: { activeConnections: this.#sockets.size },
    })

    // Close all active WebSocket connections
    this.#sockets.forEach((ws) => {
      const data = this.#socketData.get(ws)
      try {
        ws.close(1000)
      } catch (error) {
        debug.error('Error closing WebSocket connection', {
          operation: 'ws-server',
          data: {
            error: (error as Error).message,
            connectionId: data?.connectionId,
          },
        })
      }
    })

    // Stop the WebSocket server from accepting new connections
    this.#server.close((error) => {
      if (error) {
        debug.error('Error while closing WebSocket server', {
          operation: 'ws-server',
          data: { error: error.message },
        })
      } else {
        debug.info('WebSocket server closed successfully.', {
          operation: 'ws-server',
        })
      }
    })
  }

  async isReady(timeoutMs = 10_000) {
    return Promise.race([
      this.#readyPromise,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('Server start timed out')), timeoutMs)
      ),
    ])
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
    debug.debug('Method registered', {
      operation: 'ws-server',
      data: { method },
    })
  }

  async #handleMessage(ws: WebSocket, message: string | Buffer) {
    const data = this.#socketData.get(ws)
    const connectionId = data?.connectionId
    let request: WebSocketRequest

    try {
      request = JSON.parse(message.toString())
    } catch (error) {
      const serverError = this.#createServerError('PARSE_ERROR', -32700, {
        originalError:
          error instanceof Error ? error : new Error(String(error)),
      })
      debug.warn('Parse error', {
        operation: 'websocket-server',
        data: { connectionId, err: (error as Error).message },
      })
      // Notifications have no id; we use -1 for malformed frames to avoid replying to unknown ids.
      this.#sendError(ws, -1, serverError.code, serverError.message)
      return
    }

    const isNotification = typeof request.id === 'undefined'
    const handler = this.#handlers[request.method]

    if (!handler) {
      const serverError = this.#createServerError('METHOD_NOT_FOUND', -32601, {
        method: request.method,
        availableMethods: Object.keys(this.#handlers),
      })
      debug.warn('Method not found', {
        operation: 'websocket-server',
        data: { connectionId, method: request.method },
      })
      if (!isNotification) {
        this.#sendError(ws, request.id, serverError.code, serverError.message)
      }
      return
    }

    // Execute handler with timeout
    try {
      const result = await withTimeout(
        Promise.resolve(handler(request.params)),
        REQUEST_TIMEOUT_MS
      )
      if (!isNotification) {
        this.#sendResponse(ws, request.id, result)
      }
    } catch (error) {
      const timedOut = (error as Error).message === 'Request timed out'
      const code = timedOut ? -32002 /* TIMEOUT (custom) */ : -32603
      const serverError = this.#createServerError('INTERNAL_ERROR', code, {
        method: request.method,
        params: request.params,
        errorMessage: error instanceof Error ? error.message : String(error),
        originalError:
          error instanceof Error ? error : new Error(String(error)),
      })
      debug.error('Handler failed', {
        operation: 'websocket-server',
        data: {
          connectionId,
          method: request.method,
          code,
          err: serverError.originalError?.message,
        },
      })
      if (!isNotification) {
        this.#sendError(
          ws,
          request.id,
          serverError.code,
          serverError.message,
          serverError.originalError?.message
        )
      }
    }
  }

  sendNotification(message: WebSocketNotification) {
    for (const ws of this.#sockets) {
      this.#sendJson(ws, message)
    }
  }

  #sendJson(ws: WebSocket, payload: WebSocketResponse | WebSocketNotification) {
    if (ws.readyState !== ws.OPEN) {
      const data = this.#socketData.get(ws)
      debug.warn('Attempted send on non-open socket', {
        operation: 'websocket-server',
        data: { readyState: ws.readyState, connectionId: data?.connectionId },
      })
      return
    }
    try {
      const serialized = JSON.stringify(payload)
      const buffered = ws.bufferedAmount ?? 0
      if (buffered > MAX_BUFFERED) {
        const data = this.#socketData.get(ws)
        debug.warn('Backpressure: bufferedAmount high', {
          operation: 'websocket-server',
          data: { bufferedAmount: buffered, connectionId: data?.connectionId },
        })
      }
      ws.send(serialized, (error?: Error) => {
        if (error) {
          const data = this.#socketData.get(ws)
          debug.error('Send failed', {
            operation: 'websocket-server',
            data: { err: error.message, connectionId: data?.connectionId },
          })
        }
      })
    } catch (error) {
      const data = this.#socketData.get(ws)
      debug.error('Error serializing payload for send', {
        operation: 'websocket-server',
        data: {
          error: (error as Error).message,
          connectionId: data?.connectionId,
        },
      })
    }
  }

  #sendResponse(ws: WebSocket, id: number | undefined, result: any) {
    this.#sendJson(ws, { id, result } satisfies WebSocketResponse)
  }

  #sendError(
    ws: WebSocket,
    id: number | undefined,
    code: number,
    message: string,
    data: any = null
  ) {
    this.#sendJson(ws, {
      id,
      error: { code, message, data },
    } satisfies WebSocketResponse)
  }
}
