import type { AddressInfo, Server } from 'ws'
import WebSocket from 'ws'
import { randomBytes, createHash } from 'node:crypto'
import { monitorEventLoopDelay } from 'node:perf_hooks'

import { debug } from '../../utils/debug.js'

const histogram = monitorEventLoopDelay({ resolution: 20 })

histogram.enable()

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
const REQUEST_TIMEOUT_MS = 180_000
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

type Milliseconds = number

class LRUCache<Value> {
  #max: number
  #ttl: Milliseconds
  #map = new Map<string, { value: Value; expiration: number }>()

  constructor(maxEntries: number, ttlMs: Milliseconds) {
    this.#max = Math.max(1, maxEntries)
    this.#ttl = Math.max(0, ttlMs)
  }

  get(key: string): Value | undefined {
    const hit = this.#map.get(key)
    if (!hit) {
      return
    }
    if (this.#ttl && Date.now() > hit.expiration) {
      this.#map.delete(key)
      return
    }
    // LRU bump
    this.#map.delete(key)
    this.#map.set(key, hit)
    return hit.value
  }

  set(key: string, value: Value) {
    const expiration = this.#ttl
      ? Date.now() + this.#ttl
      : Number.POSITIVE_INFINITY
    if (this.#map.has(key)) {
      this.#map.delete(key)
    }
    this.#map.set(key, { value, expiration })
    if (this.#map.size > this.#max) {
      const oldest = this.#map.keys().next().value!
      this.#map.delete(oldest)
    }
  }

  clear() {
    this.#map.clear()
  }

  size() {
    return this.#map.size
  }
}

function stableStringify(x: unknown): string {
  if (x === null || typeof x !== 'object') {
    return JSON.stringify(x)
  }
  if (Array.isArray(x)) {
    return `[${x.map(stableStringify).join(',')}]`
  }
  const object = x as Record<string, unknown>
  const keys = Object.keys(object).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(object[k])}`).join(',')}}`
}

function sha1(string: string) {
  return createHash('sha1').update(string).digest('hex')
}

// keep only relevant bits of params in the cache key, and hash very large strings
function normalizeForKey(params: any) {
  if (!params || typeof params !== 'object') {
    return params
  }

  const out: any = Array.isArray(params) ? [] : {}

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.length > 512) {
      out[key] = `hash:${sha1(value)}`
    } else if (key === 'projectOptions' && value && typeof value === 'object') {
      out[key] = {
        tsConfigFilePath: (value as any).tsConfigFilePath ?? null,
        useInMemoryFileSystem: (value as any).useInMemoryFileSystem ?? false,
        theme: (value as any).theme ?? null,
        siteUrl: (value as any).siteUrl ?? null,
      }
    } else if (typeof value === 'object' && value !== null) {
      out[key] = normalizeForKey(value)
    } else {
      out[key] = value
    }
  }

  return out
}

function makeKey(method: string, params: unknown): string {
  return sha1(`${method}|${stableStringify(normalizeForKey(params))}`)
}

/** Simple semaphore to gate concurrency. */
class Semaphore {
  #permits: number
  #queue: Array<() => void> = []

  constructor(permits: number) {
    this.#permits = Math.max(1, permits)
  }

  getQueueLength() {
    return this.#queue.length
  }

  async acquire(): Promise<() => void> {
    const queued = this.#queue.length
    if (queued > 50) {
      debug.warn('semaphore_queued_exceeds_limit', {
        data: { queued },
      })
    }
    if (this.#permits > 0) {
      this.#permits--
      let released = false
      return () => {
        if (released) return
        released = true
        this.#permits++
        const next = this.#queue.shift()
        if (next) next()
      }
    }
    return new Promise<() => void>((resolve) => {
      this.#queue.push(() => {
        this.#permits--
        let released = false
        resolve(() => {
          if (released) return
          released = true
          this.#permits++
          const next = this.#queue.shift()
          if (next) next()
        })
      })
    })
  }
}

type RegisterMethodOptions = {
  /** Memoize the method's results. */
  memoize?: boolean | { ttlMs?: Milliseconds; maxEntries?: number }

  /** Max concurrent executions for this method. Omit or 0 = unlimited. */
  concurrency?: number
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

  #methods = new Map<
    string,
    { inflight: Map<string, Promise<any>>; cache: LRUCache<any> | null }
  >()

  #methodSemaphores = new Map<string, Semaphore>()

  #metricsTimer?: NodeJS.Timeout

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
              debug.logWebSocketServerEvent('client_rejected', {
                reason: 'protocol_mismatch',
              })
              return callback(false, 401, 'Unauthorized')
            }

            if (info.origin) {
              let hostname: string
              try {
                hostname = new URL(info.origin).hostname
              } catch {
                debug.logWebSocketServerEvent('client_rejected', {
                  reason: 'bad_origin_url',
                  origin: info.origin,
                })
                return callback(false, 403, 'Bad Origin')
              }
              if (hostname !== 'localhost') {
                debug.logWebSocketServerEvent('client_rejected', {
                  reason: 'forbidden_origin',
                  origin: info.origin,
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
        debug.logWebSocketServerEvent('server_failed', {
          error: (error as Error).message,
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
        debug.logWebSocketServerEvent('server_error', {
          error: serverError.message,
        })
        this.#rejectReady(serverError)
      } else {
        debug.logWebSocketServerEvent('server_error', {
          error: error.message,
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

      debug.logWebSocketServerEvent('connection_opened', {
        connectionId,
        remote: req?.socket?.remoteAddress,
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
        debug.logWebSocketServerEvent('connection_closed', {
          connectionId,
          code,
          reason,
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
        debug.logWebSocketServerEvent('connection_error', {
          connectionId,
          error: serverError.message,
        })
      })

      ws.on('message', (message: string | Buffer) => {
        this.#handleMessage(ws, message)
      })
    })

    this.#server.on('listening', () => {
      // Start metrics timer
      this.#metricsTimer = setInterval(() => {
        debug.info('websocket_server_metrics', {
          data: {
            backlog: [...this.#methodSemaphores].map(([k, s]) => [
              k,
              s.getQueueLength(),
            ]),
            inflight: [...this.#methods].map(([k, d]) => [k, d.inflight.size]),
            eventLoopLag: Math.round(histogram.mean / 1e6) + ' ms',
          },
        })
      }, 5_000)

      // Start heartbeat once server is listening
      this.#heartbeatTimer = setInterval(() => {
        for (const ws of this.#sockets) {
          const data = this.#socketData.get(ws)

          if (data?.isAlive === false) {
            debug.logWebSocketServerEvent('connection_terminated', {
              connectionId: data.connectionId,
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
      debug.logWebSocketServerEvent('server_listening', {
        port,
      })
      this.#resolveReady()
    })

    this.#server.on('close', () => {
      if (this.#metricsTimer) {
        clearInterval(this.#metricsTimer)
      }
      if (this.#heartbeatTimer) {
        clearInterval(this.#heartbeatTimer)
      }
      debug.logWebSocketServerEvent('server_closed')
    })
  }

  cleanup() {
    debug.logWebSocketServerEvent('cleanup_initiated', {
      activeConnections: this.#sockets.size,
    })

    // Close all active WebSocket connections
    this.#sockets.forEach((ws) => {
      const data = this.#socketData.get(ws)
      try {
        ws.close(1000)
      } catch (error) {
        debug.logWebSocketServerEvent('connection_error', {
          connectionId: data?.connectionId,
          error: (error as Error).message,
        })
      }
    })

    // Stop the WebSocket server from accepting new connections
    this.#server.close((error) => {
      if (error) {
        debug.logWebSocketServerEvent('server_error', {
          error: error.message,
        })
      } else {
        debug.logWebSocketServerEvent('server_closed')
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

  /** Manually clear memoized results (all methods or one). */
  invalidateCache(method?: string) {
    if (method) {
      const data = this.#methods.get(method)
      if (data?.cache) {
        data.cache.clear()
        debug.logCacheOperation('clear', method, { reason: 'manual' })
      }
      return
    }

    for (const [name, data] of this.#methods) {
      if (data.cache) data.cache.clear()
      debug.logCacheOperation('clear', name, { reason: 'manual-all' })
    }
  }

  registerMethod(
    method: string,
    handler: (params: any) => Promise<any> | any,
    options: RegisterMethodOptions = { memoize: true, concurrency: 20 }
  ) {
    const memoizeOptions = options?.memoize
    let fn: (params: any) => Promise<any> | any = handler

    if (memoizeOptions) {
      const ttlMs =
        typeof memoizeOptions === 'object' && memoizeOptions.ttlMs != null
          ? memoizeOptions.ttlMs
          : 60_000
      const maxEntries =
        typeof memoizeOptions === 'object' && memoizeOptions.maxEntries != null
          ? memoizeOptions.maxEntries
          : 500
      const state = {
        inflight: new Map<string, Promise<any>>(),
        cache: new LRUCache<any>(maxEntries, ttlMs),
      }
      this.#methods.set(method, state)

      const promise = async (params: any) => {
        const key = makeKey(method, params)

        // cache hit
        const hit = state.cache!.get(key)
        if (typeof hit !== 'undefined') {
          debug.logCacheOperation('hit', method)
          return hit
        }

        // in-flight de-duplicate
        const pending = state.inflight.get(key)
        if (pending) {
          debug.logCacheOperation('hit', method, { kind: 'in-flight' })
          return pending
        }

        // compute once
        debug.logCacheOperation('miss', method)
        const promise = (async () => {
          try {
            const result = await handler(params)
            state.cache!.set(key, result)
            debug.logCacheOperation('set', method, {
              size: state.cache!.size(),
            })
            return result
          } finally {
            state.inflight.delete(key)
          }
        })()

        state.inflight.set(key, promise)
        return promise
      }

      fn = promise
    }

    if (options?.concurrency && options.concurrency > 0) {
      const semaphore = new Semaphore(options.concurrency)
      this.#methodSemaphores.set(method, semaphore)
      const base = fn
      fn = async (params: any) => {
        const id = performance.now()
        const waitStart = performance.now()
        const release = await semaphore.acquire()
        debug.info('semaphore-acquire', {
          data: {
            id: Math.round(id * 1000) / 1000,
            method,
            waitMs: Math.round((performance.now() - waitStart) * 1000) / 1000,
          },
        })
        try {
          const t0 = performance.now()
          const result = await base(params)
          debug.info('handler-done', {
            data: {
              id: Math.round(id * 1000) / 1000,
              method,
              ms: Math.round((performance.now() - t0) * 1000) / 1000,
            },
          })
          return result
        } finally {
          release()
        }
      }
    }

    this.#handlers[method] = fn

    debug.logWebSocketServerEvent('method_registered', {
      method,
      memoized: !!memoizeOptions,
      concurrency: options?.concurrency ?? null,
    })
  }

  async #handleMessage(ws: WebSocket, message: string | Buffer) {
    const data = this.#socketData.get(ws)
    const connectionId = data?.connectionId
    let request: WebSocketRequest

    try {
      request = JSON.parse(message.toString())
      if (request.method) {
        debug.logWebSocketServerEvent('method_call_received', {
          method: request.method,
          id: request.id,
          params: request.params,
        })
      }
    } catch (error) {
      const serverError = this.#createServerError('PARSE_ERROR', -32700, {
        originalError:
          error instanceof Error ? error : new Error(String(error)),
      })
      debug.logWebSocketServerEvent('parse_error', {
        connectionId,
        err: (error as Error).message,
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
      debug.logWebSocketServerEvent('method_not_found', {
        connectionId,
        method: request.method,
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
      debug.logWebSocketServerEvent('handler_failed', {
        connectionId,
        method: request.method,
        error: serverError.originalError?.message,
        code,
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
      debug.logWebSocketServerEvent('send_failed', {
        connectionId: data?.connectionId,
        readyState: ws.readyState,
      })
      return
    }
    try {
      const serialized = JSON.stringify(payload)
      const buffered = ws.bufferedAmount ?? 0
      const data = this.#socketData.get(ws)

      if (buffered > MAX_BUFFERED) {
        debug.logWebSocketServerEvent('backpressure', {
          connectionId: data?.connectionId,
          bufferedAmount: buffered,
        })
      }

      debug.logWebSocketServerEvent('payload_bytes', {
        connectionId: data?.connectionId,
        payloadBytes: Buffer.byteLength(serialized),
      })

      ws.send(serialized, (error?: Error) => {
        if (error) {
          const data = this.#socketData.get(ws)
          debug.logWebSocketServerEvent('send_failed', {
            connectionId: data?.connectionId,
            error: error.message,
          })
        }
      })
    } catch (error) {
      const data = this.#socketData.get(ws)
      debug.logWebSocketServerEvent('send_failed', {
        connectionId: data?.connectionId,
        error: (error as Error).message,
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
