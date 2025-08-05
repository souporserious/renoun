import type WebSocket from 'ws'

import type { WebSocketRequest, WebSocketResponse } from './server.js'
import { debug } from '../../utils/debug.js'

type Request = {
  resolve: (value?: any) => void
  reject: (reason?: any) => void
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed'

type WebSocketClientErrorType =
  | 'CONNECTION_REFUSED'
  | 'CONNECTION_TIMEOUT'
  | 'WEBSOCKET_ERROR'
  | 'REQUEST_TIMEOUT'
  | 'MAX_RETRIES_EXCEEDED'
  | 'UNKNOWN_ERROR'

interface WebSocketClientErrorContext {
  connectionTime: number
  port: string
  connectionState: ConnectionState
  eventMessage?: string
  method?: string
  params?: Record<string, unknown>
  timeout?: number
  maxRetries?: number
}

type WebSocketClientErrorMessageFn = (
  context: WebSocketClientErrorContext
) => string

const WEBSOCKET_CLIENT_ERROR_MESSAGES: Record<
  WebSocketClientErrorType,
  WebSocketClientErrorMessageFn
> = {
  CONNECTION_REFUSED: ({ port }) =>
    `[renoun] Failed to connect to WebSocket server at ws://localhost:${port}\n\n` +
    `This error occurred immediately, which suggests the server is not running.\n` +
    `Possible solutions:\n` +
    `• Ensure the renoun server is started (usually via Next.js plugin or CLI)\n` +
    `• Check if the server is running on port ${port}\n` +
    `• Verify no firewall is blocking the connection\n` +
    `• Check if another process is using the same port`,

  CONNECTION_TIMEOUT: ({ connectionTime }) =>
    `[renoun] Connection to WebSocket server timed out after ${Math.round(connectionTime)}ms\n\n` +
    `The server may be:\n` +
    `• Starting up slowly\n` +
    `• Overloaded with requests\n` +
    `• Experiencing network issues\n\n` +
    `Try again in a few moments, or check if the server is responding.`,

  WEBSOCKET_ERROR: ({ eventMessage }) =>
    `[renoun] WebSocket error occurred during communication: ${eventMessage}\n\n` +
    `This suggests a protocol error or data corruption.\n` +
    `The server was previously connected but encountered an error.`,

  REQUEST_TIMEOUT: ({ timeout, method, params, connectionState }) =>
    `[renoun] Request timed out after ${timeout} seconds\n\n` +
    `Request details:\n` +
    `• Method: ${method}\n` +
    `• Params: ${JSON.stringify(params, null, 2)}\n` +
    `• Connection state: ${connectionState}\n\n` +
    `This could indicate:\n` +
    `• Server is processing a complex task\n` +
    `• Network latency issues\n` +
    `• Server overload\n` +
    `• The operation genuinely requires more time`,

  MAX_RETRIES_EXCEEDED: ({ maxRetries }) =>
    `[renoun] Could not reconnect to the WebSocket server after ${maxRetries} attempts.\n\n` +
    `This indicates a persistent connection issue. Please check:\n` +
    `• Server status and logs\n` +
    `• Network connectivity\n` +
    `• Firewall settings\n` +
    `• Port availability`,

  UNKNOWN_ERROR: ({ eventMessage, connectionState, connectionTime }) =>
    `[renoun] WebSocket client error: ${eventMessage}\n\n` +
    `Connection state: ${connectionState}\n` +
    `Connection time: ${Math.round(connectionTime)}ms`,
}

class WebSocketClientError extends Error {
  readonly type: WebSocketClientErrorType
  readonly connectionState: ConnectionState
  readonly connectionTime: number
  readonly port: string
  readonly method?: string
  readonly params?: any
  readonly timeout?: number
  readonly retryCount?: number

  constructor(
    message: string,
    type: WebSocketClientErrorType,
    context?: {
      connectionState: ConnectionState
      connectionTime: number
      port: string
      method?: string
      params?: any
      timeout?: number
      retryCount?: number
    }
  ) {
    super(message)
    this.name = 'WebSocketClientError'
    this.type = type
    this.connectionState = context?.connectionState || 'connecting'
    this.connectionTime = context?.connectionTime || 0
    this.port = context?.port || 'unknown'
    this.method = context?.method
    this.params = context?.params
    this.timeout = context?.timeout
    this.retryCount = context?.retryCount
  }
}

export class WebSocketClient {
  #ws!: WebSocket
  #isConnected = false
  #connectionState: ConnectionState = 'connecting'
  #connectionStartTime: number = 0
  #requests: Record<number, Request> = {}
  #pendingRequests: string[] = []
  #retryInterval: number = 5000
  #maxRetries: number = 5
  #currentRetries: number = 0
  #handleOpenEvent = this.#handleOpen.bind(this)
  #handleMessageEvent = this.#handleMessage.bind(this)
  #handleErrorEvent = this.#handleError.bind(this)
  #handleCloseEvent = this.#handleClose.bind(this)

  constructor() {
    process.env.WS_NO_BUFFER_UTIL = 'true'
    this.#connect()
  }

  #connect() {
    this.#connectionState = 'connecting'
    this.#connectionStartTime = Date.now()

    debug.logWebSocketClientEvent('connecting', {
      port: process.env.RENOUN_SERVER_PORT,
    })

    import('ws').then(({ default: WebSocket }) => {
      this.#ws = new WebSocket(
        `ws://localhost:${process.env.RENOUN_SERVER_PORT}`,
        process.env.RENOUN_SERVER_ID
      )
      this.#ws.addEventListener('open', this.#handleOpenEvent)
      this.#ws.addEventListener('message', this.#handleMessageEvent)
      this.#ws.addEventListener('error', this.#handleErrorEvent)
      this.#ws.addEventListener('close', this.#handleCloseEvent)
    })
  }

  #handleOpen() {
    this.#isConnected = true
    this.#connectionState = 'connected'
    this.#currentRetries = 0

    debug.logWebSocketClientEvent('connected', {
      connectionTime: Date.now() - this.#connectionStartTime,
      pendingRequests: this.#pendingRequests.length,
    })

    this.#pendingRequests.forEach((request) => {
      this.#ws.send(request)
    })
    this.#pendingRequests.length = 0
  }

  #handleMessage(event: WebSocket.MessageEvent) {
    const message = event.data.toString()

    try {
      const response: WebSocketResponse = JSON.parse(message)
      const { id, result, error } = response

      if (id !== undefined && this.#requests[id]) {
        if (error) {
          this.#requests[id].reject(error)
        } else {
          this.#requests[id].resolve(result)
        }

        delete this.#requests[id]
      }
    } catch (error) {
      throw new Error(`[renoun] WebSocket client error parsing message:`, {
        cause: error,
      })
    }
  }

  #createClientError(
    type: WebSocketClientErrorType,
    context: WebSocketClientErrorContext
  ): WebSocketClientError {
    const messageFn = WEBSOCKET_CLIENT_ERROR_MESSAGES[type]
    const message = messageFn(context)

    return new WebSocketClientError(message, type, {
      connectionState: context.connectionState,
      connectionTime: context.connectionTime,
      port: context.port,
      method: context.method,
      params: JSON.stringify(context.params),
      timeout: context.timeout,
      retryCount: this.#currentRetries,
    })
  }

  #handleError(event: WebSocket.ErrorEvent) {
    const connectionTime = Date.now() - this.#connectionStartTime
    const port = process.env.RENOUN_SERVER_PORT || 'unknown'
    let error: WebSocketClientError

    debug.logWebSocketClientEvent('error', {
      connectionTime,
      port,
      connectionState: this.#connectionState,
      eventMessage: event.message,
    })

    if (this.#connectionState === 'connecting') {
      if (connectionTime < 1000) {
        error = this.#createClientError('CONNECTION_REFUSED', {
          connectionTime,
          port,
          connectionState: this.#connectionState,
        })
      } else {
        error = this.#createClientError('CONNECTION_TIMEOUT', {
          connectionTime,
          port,
          connectionState: this.#connectionState,
        })
      }
    } else if (this.#connectionState === 'connected') {
      error = this.#createClientError('WEBSOCKET_ERROR', {
        connectionTime,
        port,
        connectionState: this.#connectionState,
        eventMessage: event.message,
      })
    } else {
      error = this.#createClientError('UNKNOWN_ERROR', {
        connectionTime,
        port,
        connectionState: this.#connectionState,
        eventMessage: event.message,
      })
    }

    this.#connectionState = 'failed'
    throw error
  }

  #handleClose() {
    this.#isConnected = false
    this.#connectionState = 'disconnected'

    debug.logWebSocketClientEvent('closed', {
      connectionTime: Date.now() - this.#connectionStartTime,
      retryCount: this.#currentRetries,
    })

    this.#ws.removeEventListener('open', this.#handleOpenEvent)
    this.#ws.removeEventListener('message', this.#handleMessageEvent)
    this.#ws.removeEventListener('error', this.#handleErrorEvent)
    this.#ws.removeEventListener('close', this.#handleCloseEvent)
    this.#retryConnection()
  }

  #retryConnection() {
    if (this.#currentRetries < this.#maxRetries) {
      this.#currentRetries++
      setTimeout(() => {
        debug.logWebSocketClientEvent('retrying', {
          retryCount: this.#currentRetries,
          maxRetries: this.#maxRetries,
        })
        this.#connect()
      }, this.#retryInterval)
    } else {
      throw this.#createClientError('MAX_RETRIES_EXCEEDED', {
        connectionTime: Date.now() - this.#connectionStartTime,
        port: process.env.RENOUN_SERVER_PORT || 'unknown',
        connectionState: this.#connectionState,
        maxRetries: this.#maxRetries,
      })
    }
  }

  async callMethod<Params extends Record<string, unknown>, Value>(
    method: string,
    params: Params,
    timeout = 120
  ): Promise<Value> {
    const id = performance.now()
    const request: WebSocketRequest = { method, params, id }

    debug.logWebSocketClientEvent('method_call', request)

    return new Promise<Value>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        debug.logWebSocketClientEvent('timeout', request)
        const error = this.#createClientError('REQUEST_TIMEOUT', {
          connectionTime: Date.now() - this.#connectionStartTime,
          port: process.env.RENOUN_SERVER_PORT || 'unknown',
          connectionState: this.#connectionState,
          method,
          params,
          timeout,
        })
        reject(error)
        delete this.#requests[id]
      }, timeout * 1000)

      this.#requests[id] = {
        resolve: (value) => {
          clearTimeout(timeoutId)
          debug.logWebSocketClientEvent('method_resolved', { method, id })
          resolve(value)
        },
        reject: (reason) => {
          clearTimeout(timeoutId)
          debug.logWebSocketClientEvent('method_rejected', {
            method,
            id,
            reason: reason?.message,
          })
          reject(reason)
        },
      } satisfies Request

      if (this.#isConnected) {
        this.#ws.send(JSON.stringify(request))
      } else {
        this.#pendingRequests.push(JSON.stringify(request))
      }
    }).catch((error) => {
      if (error instanceof WebSocketClientError) {
        throw error
      }
      throw new Error(error.data || error.message)
    })
  }
}
