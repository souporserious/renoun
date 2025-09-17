import { WebSocketServer as WSS, default as WS } from 'ws'
import type { RawData } from 'ws'
import type { AddressInfo } from 'node:net'
import { randomBytes, createHash } from 'node:crypto'

import { getDebugLogger } from '../../utils/debug.js'
import { Semaphore } from '../../utils/Semaphore.js'

export interface WebSocketRequest {
  method: string
  params: any
  id?: number
  timeoutMs?: number
}

export interface WebSocketResponse {
  result?: any
  error?: { code: number; message: string; data?: any }
  id?: number | null
}

export interface WebSocketNotification {
  type: string
  data?: any
}

export interface WebSocketStreamChunk {
  id: number
  chunk?: any
  done?: true
  error?: string
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

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024
const MAX_BUFFERED = 8 * 1024 * 1024
const MAX_TIMEOUT_MS = 300_000
const REQUEST_TIMEOUT_MS = 60_000
const HEARTBEAT_MS = 30_000
const CLOSE_TEXT: Record<number, string> = {
  1000: 'Normal Closure',
  1001: 'Going Away',
  1006: 'Abnormal Closure',
  1009: 'Message Too Big',
  1011: 'Internal Error',
  1013: 'Try Again Later',
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeoutMs = Math.min(ms, MAX_TIMEOUT_MS)
  let timer: NodeJS.Timeout

  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(timeoutMs)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

type Milliseconds = number

class LRUCache<Value> {
  static readonly UNSET = Symbol('unset')
  #max: number
  #ttl: Milliseconds
  #map = new Map<
    string,
    { value: Value | typeof LRUCache.UNSET; expiration: number }
  >()

  constructor(maxEntries: number, ttlMs: Milliseconds) {
    this.#max = Math.max(1, maxEntries)
    this.#ttl = Math.max(0, ttlMs)
  }

  get(key: string): Value | typeof LRUCache.UNSET {
    const hit = this.#map.get(key)
    if (!hit) {
      return LRUCache.UNSET
    }
    if (this.#ttl && Date.now() > hit.expiration) {
      this.#map.delete(key)
      return LRUCache.UNSET
    }
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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  const object = value as Record<string, unknown>
  const keys = Object.keys(object).sort()

  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`
}

function sha1(string: string) {
  return createHash('sha1').update(string).digest('hex')
}

// keep only relevant bits of params in the cache key
function normalizeForKey(params: any) {
  if (!params || typeof params !== 'object') {
    return params
  }

  const out: any = Array.isArray(params) ? [] : {}

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
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

function isCriticalMessage(message: any): boolean {
  return (
    message &&
    typeof message === 'object' &&
    'id' in message &&
    ('result' in message ||
      'error' in message ||
      'chunk' in message ||
      'done' in message)
  )
}

type RegisterMethodOptions = {
  /** Memoize the method's results. */
  memoize?: boolean | { ttlMs?: Milliseconds; maxEntries?: number }

  /** Max concurrent executions for this method. Omit or 0 = unlimited. */
  concurrency?: number
}

export class WebSocketServer {
  #server!: WSS

  #sockets: Set<WS> = new Set()

  #socketData = new WeakMap<WS, { isAlive: boolean; connectionId: number }>()

  #readyPromise!: Promise<void>

  #resolveReady!: () => void

  #rejectReady!: (error: any) => void

  #handlers = new Map<string, (params: any) => Promise<any> | any>()

  #heartbeatTimer?: NodeJS.Timeout

  #nextConnectionId = 1

  #methods = new Map<
    string,
    { inflight: Map<string, Promise<any>>; cache: LRUCache<any> | null }
  >()

  #methodSemaphores = new Map<string, Semaphore>()

  #metricsTimer?: NodeJS.Timeout

  #outgoingQueues = new WeakMap<
    WS,
    {
      critical: Array<{ data: string; bytes: number }>
      normal: Array<{ data: string; bytes: number }>
    }
  >()

  #flushTimers = new WeakMap<WS, NodeJS.Timeout>()

  #activeStreams = new WeakMap<WS, Map<number, AbortController>>()

  #pendingCancels = new WeakMap<WS, Set<number>>()

  #averageMs = new Map<string, number>()

  #MAX_QUEUE_BYTES = 4 * 1024 * 1024

  #estimatedQueueBytes = new WeakMap<WS, number>()

  #id: string

  #isCriticalPayload(payload: any): boolean {
    if (Array.isArray(payload)) {
      return payload.some(isCriticalMessage)
    }

    return isCriticalMessage(payload)
  }

  #closeWith(
    ws: WS,
    code: number,
    reason: string,
    extra: Record<string, any> = {}
  ) {
    getDebugLogger().logWebSocketServerEvent('closing_due_to_backpressure', {
      connectionId: this.#socketData.get(ws)?.connectionId,
      code,
      reason,
      ...extra,
    })
    try {
      ws.close(code, reason)
    } catch {
      this.#terminate(ws, { where: 'closeWith_fallback' })
    }
  }

  #ping(ws: WS, context: Record<string, any> = {}) {
    if (ws.readyState !== WS.OPEN) {
      return false
    }

    try {
      ws.ping()
      return true
    } catch (e) {
      getDebugLogger().logWebSocketServerEvent('ping_failed', {
        connectionId: this.#socketData.get(ws)?.connectionId,
        ...context,
        error: (e as Error).message,
      })
      return false
    }
  }

  #terminate(ws: WS, context: Record<string, any> = {}) {
    try {
      ws.terminate()
      return true
    } catch (error) {
      getDebugLogger().logWebSocketServerEvent('terminate_failed', {
        connectionId: this.#socketData.get(ws)?.connectionId,
        ...context,
        error: (error as Error).message,
      })
      return false
    }
  }

  constructor(options?: { port?: number }) {
    // Reuse a stable server ID within the same process so clients can
    // reconnect after an in-process server restart.
    const serverId = process.env.RENOUN_SERVER_ID
    if (serverId) {
      this.#id = serverId
    } else {
      this.#id = randomBytes(16).toString('hex')
      process.env.RENOUN_SERVER_ID = this.#id
    }

    this.#readyPromise = new Promise<void>((resolve, reject) => {
      this.#resolveReady = resolve
      this.#rejectReady = reject
    })

    this.#server = new WSS({
      port: options?.port ?? 0,
      host: 'localhost',
      backlog: 1024,
      maxPayload: MAX_PAYLOAD_BYTES,
      perMessageDeflate: false,
      clientTracking: false,
      handleProtocols: (protocols) => {
        if (protocols.has(this.#id)) {
          return this.#id
        }
        getDebugLogger().logWebSocketServerEvent('client_rejected', {
          reason: 'protocol_mismatch',
        })
        return false
      },
    })

    this.#init()
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
        getDebugLogger().logWebSocketServerEvent('server_error', {
          error: serverError.message,
        })
        this.#rejectReady(serverError)
      } else {
        getDebugLogger().logWebSocketServerEvent('server_error', {
          error: error.message,
        })
        this.#rejectReady(
          new Error('[renoun] WebSocket server error', { cause: error })
        )
      }
    })

    this.#server.on('connection', (ws: WS, req: any) => {
      // Strict origin allowlist for browsers; node clients typically omit Origin
      try {
        const origin = req?.headers?.origin
        if (origin) {
          const hostname = new URL(origin).hostname
          if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
            getDebugLogger().logWebSocketServerEvent('client_rejected', {
              reason: 'forbidden_origin',
              origin,
            })
            ws.close(1008, 'Forbidden origin')
            return
          }
        }
      } catch {
        getDebugLogger().logWebSocketServerEvent('client_rejected', {
          reason: 'bad_origin_url',
          origin: req?.headers?.origin,
        })
        ws.close(1008, 'Bad Origin')
        return
      }
      const connectionId = this.#nextConnectionId++

      this.#sockets.add(ws)
      this.#socketData.set(ws, { isAlive: true, connectionId })

      getDebugLogger().logWebSocketServerEvent('connection_opened', {
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

        const timer = this.#flushTimers.get(ws)
        if (timer) {
          clearTimeout(timer)
          this.#flushTimers.delete(ws)
        }
        this.#outgoingQueues.delete(ws)

        // Abort any per-socket active streams and clear pending cancels
        const perSocketStreams = this.#activeStreams.get(ws)
        if (perSocketStreams) {
          for (const controller of perSocketStreams.values()) {
            controller.abort()
          }
          this.#activeStreams.delete(ws)
        }
        this.#pendingCancels.delete(ws)

        const reason = reasonBuf?.toString() || CLOSE_TEXT[code] || 'Unknown'
        getDebugLogger().logWebSocketServerEvent('connection_closed', {
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
        getDebugLogger().logWebSocketServerEvent('connection_error', {
          connectionId,
          error: serverError.message,
        })
      })

      ws.on('message', (message: RawData) => {
        this.#handleMessage(ws, message)
      })
    })

    this.#server.on('listening', () => {
      // Start metrics timer only when info-level logging is enabled
      if (getDebugLogger().isEnabled('info')) {
        this.#metricsTimer = setInterval(() => {
          getDebugLogger().info('websocket_server_metrics', () => ({
            data: {
              backlog: [...this.#methodSemaphores].map(
                ([k, s]) => k + ':' + s.getQueueLength()
              ),
              inflight: [...this.#methods].map(
                ([k, d]) => k + ':' + d.inflight.size
              ),
            },
          }))
        }, 5_000)
        this.#metricsTimer.unref()
      }

      // Start heartbeat once server is listening
      this.#heartbeatTimer = setInterval(() => {
        for (const ws of this.#sockets) {
          const data = this.#socketData.get(ws)

          if (data?.isAlive === false) {
            getDebugLogger().logWebSocketServerEvent('connection_terminated', {
              connectionId: data.connectionId,
            })
            this.#terminate(ws, { where: 'heartbeat_terminate' })
            continue
          }

          if (data) {
            data.isAlive = false
          }

          this.#ping(ws, { where: 'heartbeat_ping' })
        }
      }, HEARTBEAT_MS)
      ;(this.#heartbeatTimer as any)?.unref?.()

      const address = this.#server.address()
      const port =
        address && typeof address !== 'string'
          ? (address as AddressInfo).port
          : this.#server.options.port
      getDebugLogger().logWebSocketServerEvent('server_listening', {
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
      getDebugLogger().logWebSocketServerEvent('server_closed')
    })
  }

  cleanup() {
    // Abort all active streams per connection to avoid leaking upstream producers
    for (const ws of this.#sockets) {
      const perSocketStreams = this.#activeStreams.get(ws)
      if (!perSocketStreams) {
        continue
      }
      for (const controller of perSocketStreams.values()) {
        try {
          controller.abort()
        } catch {
          getDebugLogger().logWebSocketServerEvent('stream_abort_failed', {
            where: 'cleanup',
            connectionId: this.#socketData.get(ws)?.connectionId,
          })
        }
      }
      this.#activeStreams.delete(ws)
      this.#pendingCancels.delete(ws)
    }

    for (const ws of this.#sockets) {
      const timer = this.#flushTimers.get(ws)
      if (timer) {
        clearTimeout(timer)
      }
    }
    this.#flushTimers = new WeakMap()

    getDebugLogger().logWebSocketServerEvent('cleanup_initiated', {
      activeConnections: this.#sockets.size,
    })

    // Close all active WebSocket connections
    this.#sockets.forEach((ws) => {
      const data = this.#socketData.get(ws)
      try {
        ws.close(1000)
      } catch (error) {
        getDebugLogger().logWebSocketServerEvent('connection_error', {
          connectionId: data?.connectionId,
          error: (error as Error).message,
        })
      }
    })

    // Stop the WebSocket server from accepting new connections
    this.#server.close((error) => {
      if (error) {
        getDebugLogger().logWebSocketServerEvent('server_error', {
          error: error.message,
        })
      } else {
        getDebugLogger().logWebSocketServerEvent('server_closed')
      }
    })
  }

  async isReady(timeoutMs = 10_000) {
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error('Server start timed out')),
        timeoutMs
      )
      this.#readyPromise.then(
        () => {
          clearTimeout(t)
          resolve()
        },
        (err) => {
          clearTimeout(t)
          reject(err)
        }
      )
    })
  }

  async getPort() {
    await this.isReady()

    const address = this.#server.address()

    if (address && typeof address !== 'string') {
      return (address as AddressInfo).port
    }

    throw new Error('[renoun] Unable to retrieve server port')
  }

  getId() {
    return this.#id
  }

  /** Manually clear memoized results (all methods or one). */
  invalidateCache(method?: string) {
    if (method) {
      const data = this.#methods.get(method)
      if (data?.cache) {
        data.cache.clear()
        getDebugLogger().logCacheOperation('clear', method, {
          reason: 'manual',
        })
      }
      return
    }

    for (const [name, data] of this.#methods) {
      if (data.cache) data.cache.clear()
      getDebugLogger().logCacheOperation('clear', name, {
        reason: 'manual-all',
      })
    }
  }

  registerMethod(
    method: string,
    handler: (params: any) => Promise<any> | any,
    options: RegisterMethodOptions = {}
  ) {
    const optionsMerged: RegisterMethodOptions = {
      memoize: process.env.NODE_ENV === 'production',
      concurrency: 20,
      ...options,
    }
    const hasMemoizeProp =
      options != null &&
      Object.prototype.hasOwnProperty.call(options, 'memoize')
    const memoizeOptions = hasMemoizeProp
      ? (options as RegisterMethodOptions).memoize
      : optionsMerged.memoize
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
        if (hit !== LRUCache.UNSET) {
          getDebugLogger().logCacheOperation('hit', method)
          return hit
        }

        // in-flight de-duplicate
        const pending = state.inflight.get(key)
        if (pending) {
          getDebugLogger().logCacheOperation('hit', method, {
            kind: 'in-flight',
          })
          return pending
        }

        // compute once
        getDebugLogger().logCacheOperation('miss', method)
        const promise = (async () => {
          try {
            const result = await handler(params)
            state.cache!.set(key, result)
            getDebugLogger().logCacheOperation('set', method, {
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

    if (optionsMerged?.concurrency && optionsMerged.concurrency > 0) {
      const semaphore = new Semaphore(optionsMerged.concurrency)
      this.#methodSemaphores.set(method, semaphore)
      const base = fn
      fn = async (params: any) => {
        const id = performance.now()
        const waitStart = performance.now()
        const release = await semaphore.acquire()
        getDebugLogger().info('semaphore-acquire', () => ({
          data: {
            id: Math.round(id * 1000) / 1000,
            method,
            waitMs: Math.round((performance.now() - waitStart) * 1000) / 1000,
          },
        }))
        try {
          const t0 = performance.now()
          const result = await base(params)
          const elapsed = Math.round((performance.now() - t0) * 1000) / 1000

          getDebugLogger().info('handler-done', () => ({
            data: {
              id: Math.round(id * 1000) / 1000,
              method,
              ms: elapsed,
            },
          }))
          const previous = this.#averageMs.get(method) ?? 0
          this.#averageMs.set(
            method,
            previous ? previous * 0.8 + elapsed * 0.2 : elapsed
          )
          return result
        } finally {
          release()
        }
      }
    }

    this.#handlers.set(method, fn)

    getDebugLogger().logWebSocketServerEvent('method_registered', {
      method,
      memoized: !!memoizeOptions,
      concurrency: optionsMerged?.concurrency ?? null,
    })
  }

  // Execute a single request and optionally return an RPC response.
  async #processRequest(
    ws: WS,
    request: WebSocketRequest
  ): Promise<WebSocketResponse | null> {
    // Log the call once for tracing.
    if (request.method) {
      getDebugLogger().logWebSocketServerEvent('method_call_received', {
        method: request.method,
        id: request.id,
        params: request.params,
      })
    }

    const isNotification = typeof request.id === 'undefined'
    const handler = this.#handlers.get(request.method)

    if (!handler) {
      const serverError = this.#createServerError('METHOD_NOT_FOUND', -32601, {
        method: request.method,
        requestId: request.id,
        availableMethods: Array.from(this.#handlers.keys()),
      })
      if (!isNotification) {
        return {
          id: request.id,
          error: { code: serverError.code, message: serverError.message },
        } satisfies WebSocketResponse
      }
      return null
    }

    try {
      const semaphore = this.#methodSemaphores.get(request.method)
      const queueLength = semaphore ? semaphore.getQueueLength() : 0
      const avg = Math.min(this.#averageMs.get(request.method) ?? 150, 30_000)
      const extraTime = Math.min(queueLength * avg, 120_000)

      // Client-provided hard cap (if any)
      const clientCap =
        typeof request.timeoutMs === 'number' &&
        isFinite(request.timeoutMs) &&
        request.timeoutMs > 0
          ? request.timeoutMs
          : undefined

      // Server estimate
      const serverEstimate = REQUEST_TIMEOUT_MS + extraTime

      // Final effective timeout
      const effectiveTimeoutMs = Math.min(
        clientCap ?? serverEstimate,
        MAX_TIMEOUT_MS
      )

      const result = await withTimeout(
        Promise.resolve(handler(request.params)),
        effectiveTimeoutMs
      )

      // If the handler returned an AsyncIterable, treat it as a stream.
      if (
        result &&
        typeof result === 'object' &&
        typeof result[Symbol.asyncIterator] === 'function'
      ) {
        if (!isNotification) {
          const controller = new AbortController()

          let streamMap = this.#activeStreams.get(ws)
          if (!streamMap) {
            streamMap = new Map<number, AbortController>()
            this.#activeStreams.set(ws, streamMap)
          }
          streamMap.set(request.id!, controller)

          const pendingForSocket = this.#pendingCancels.get(ws)
          if (pendingForSocket?.delete(request.id!)) {
            controller.abort()
          }

          try {
            for await (const chunk of this.#withChunkTimeout(
              result as AsyncIterable<any>,
              controller.signal,
              effectiveTimeoutMs
            )) {
              this.#sendJson(ws, {
                id: request.id,
                chunk,
              } as WebSocketStreamChunk)
            }
            this.#sendJson(ws, {
              id: request.id,
              done: true,
            } as WebSocketStreamChunk)
          } catch (error) {
            // Ensure the upstream producer is actually stopped on timeout.
            if (error instanceof TimeoutError) {
              controller.abort()
            }
            this.#sendJson(ws, {
              id: request.id,
              done: true,
              error: String((error as Error).message ?? error),
            } as WebSocketStreamChunk)
          } finally {
            // Per-connection cleanup
            streamMap.delete(request.id!)
            if (streamMap.size === 0) {
              this.#activeStreams.delete(ws)
            }
          }
        }
        return null
      }

      if (!isNotification) {
        return { id: request.id, result } satisfies WebSocketResponse
      }
      return null
    } catch (error) {
      const timedOut =
        error instanceof TimeoutError ||
        String((error as Error)?.message).startsWith('Request timed out')
      const code = timedOut ? -32002 : -32603
      const serverError = this.#createServerError('INTERNAL_ERROR', code, {
        method: request.method,
        params: request.params,
        errorMessage: error instanceof Error ? error.message : String(error),
        originalError:
          error instanceof Error ? error : new Error(String(error)),
      })
      if (!isNotification) {
        // Include detailed error data (name/message/stack) in development to surface
        // actionable stack traces at the caller. In production, omit the stack.
        const includeStack = process.env.NODE_ENV !== 'production'
        const original = serverError.originalError
        return {
          id: request.id,
          error: {
            code: serverError.code,
            message: serverError.message,
            data: includeStack
              ? {
                  name: original?.name,
                  message: original?.message,
                  stack: original?.stack,
                }
              : { message: original?.message },
          },
        } satisfies WebSocketResponse
      }
      return null
    }
  }

  async #handleMessage(ws: WS, message: RawData) {
    const data = this.#socketData.get(ws)
    const connectionId = data?.connectionId
    let parsed: unknown

    // Normalize RawData to string
    let raw: string
    if (typeof message === 'string') {
      raw = message
    } else if (Buffer.isBuffer(message)) {
      raw = message.toString()
    } else if (Array.isArray(message)) {
      raw = Buffer.concat(message as Buffer[]).toString()
    } else {
      raw = Buffer.from(message as ArrayBuffer).toString()
    }

    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      const serverError = this.#createServerError('PARSE_ERROR', -32700, {
        originalError:
          error instanceof Error ? error : new Error(String(error)),
      })
      getDebugLogger().logWebSocketServerEvent('parse_error', {
        connectionId,
        err: (error as Error).message,
      })
      // Reply with JSON-RPC-ish null id for parse errors
      this.#sendError(ws, null, serverError.code, serverError.message)
      return
    }

    // support client-driven stream cancel: { type: 'cancel', id: number }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const object = parsed as any
      if (object.type === 'cancel' && typeof object.id === 'number') {
        const mapForSocket = this.#activeStreams.get(ws)
        const controller = mapForSocket?.get(object.id)
        if (controller) {
          controller.abort()
          mapForSocket!.delete(object.id)
        } else {
          let pendingForSocket = this.#pendingCancels.get(ws)
          if (!pendingForSocket) {
            pendingForSocket = new Set<number>()
            this.#pendingCancels.set(ws, pendingForSocket)
          }
          pendingForSocket.add(object.id)
        }
        return
      }
    }

    const isBatch =
      Array.isArray(parsed) &&
      parsed.every(
        (request) =>
          request &&
          typeof request === 'object' &&
          typeof request.method === 'string'
      )

    if (Array.isArray(parsed) && parsed.length === 0) {
      // JSON-RPC: empty batch is invalid request
      this.#sendError(ws, null, -32600, '[renoun] Invalid Request: empty batch')
      return
    }

    if (isBatch) {
      const requests = parsed as WebSocketRequest[]
      getDebugLogger().logWebSocketServerEvent('batch_received', {
        size: requests.length,
      })

      // Process batch with bounded concurrency to avoid stampedes
      const CONCURRENCY_LIMIT = 32
      async function processWithConcurrency<Type, Result>(
        items: Type[],
        limit: number,
        worker: (item: Type, index: number) => Promise<Result>
      ): Promise<Result[]> {
        const results = new Array<Result>(items.length)
        let next = 0
        let running = 0

        return await new Promise<Result[]>((resolve, reject) => {
          const launch = () => {
            while (running < limit && next < items.length) {
              const index = next++
              running++
              Promise.resolve(worker(items[index]!, index))
                .then((result) => {
                  results[index] = result as Result
                })
                .then(() => {
                  running--
                  if (next >= items.length && running === 0) {
                    resolve(results)
                  } else {
                    launch()
                  }
                })
                .catch(reject)
            }
            if (next >= items.length && running === 0) {
              resolve(results)
            }
          }

          launch()
        })
      }

      const results = await processWithConcurrency(
        requests,
        CONCURRENCY_LIMIT,
        (request) => this.#processRequest(ws, request)
      )

      const filtered = results.filter(Boolean) as WebSocketResponse[]
      if (filtered.length) {
        this.#sendJson(ws, filtered)
      }
      return
    }

    // If not a batch, validate the single request shape
    if (!isBatch) {
      const object = parsed as any
      if (
        !object ||
        typeof object !== 'object' ||
        typeof object.method !== 'string'
      ) {
        this.#sendError(ws, null, -32600, '[renoun] Invalid Request')
        return
      }
    }

    const singleResult = await this.#processRequest(
      ws,
      parsed as WebSocketRequest
    )
    if (singleResult) {
      this.#sendJson(ws, singleResult)
    }
  }

  sendNotification(message: WebSocketNotification) {
    for (const ws of this.#sockets) {
      this.#sendJson(ws, message)
    }
  }

  /**
   * Queue outgoing messages and flush them respecting WebSocket back-pressure.
   * Small messages are batched automatically. If the socket buffer grows beyond
   * MAX_BUFFERED we stop sending and resume once it drains.
   */
  #sendJson(ws: WS, payload: any) {
    // Lazily create a dual-queue (critical / normal)
    let queues = this.#outgoingQueues.get(ws)
    if (!queues) {
      queues = { critical: [], normal: [] }
      this.#outgoingQueues.set(ws, queues)
    }

    try {
      const serialized = JSON.stringify(payload)
      const bytes = Buffer.byteLength(serialized)
      const critical = this.#isCriticalPayload(payload)

      // If this single message is too large for our configured payload cap, close with 1009
      if (bytes > MAX_PAYLOAD_BYTES) {
        this.#closeWith(ws, 1009, 'Message too big', {
          bytes,
          max: MAX_PAYLOAD_BYTES,
          critical,
        })
        return
      }

      let estimated = this.#estimatedQueueBytes.get(ws) || 0

      // Drop from normal first; if we'd have to drop critical, prefer closing with 1013
      while (
        estimated + bytes > this.#MAX_QUEUE_BYTES &&
        (queues.normal.length || queues.critical.length)
      ) {
        const fromCritical = queues.normal.length === 0
        const dropped = fromCritical
          ? queues.critical.shift()!
          : queues.normal.shift()!
        estimated -= dropped.bytes
        if (fromCritical) {
          this.#closeWith(ws, 1013, 'Backpressure: would drop RPC reply', {
            incomingBytes: bytes,
          })
          return
        }
        getDebugLogger().logWebSocketServerEvent('queue_drop', {
          reason: 'max_queue_bytes',
          droppedBytes: dropped.bytes,
        })
      }

      // Still can’t fit
      if (estimated + bytes > this.#MAX_QUEUE_BYTES) {
        if (critical) {
          this.#closeWith(ws, 1013, 'Backpressure: would drop RPC reply', {
            incomingBytes: bytes,
          })
        } else {
          getDebugLogger().logWebSocketServerEvent('queue_drop', {
            reason: 'single_message_too_large',
            bytes,
          })
        }
        return
      }

      this.#estimatedQueueBytes.set(ws, estimated + bytes)

      const queueItem = {
        data: serialized,
        bytes,
      }
      if (critical) {
        queues.critical.push(queueItem)
      } else {
        queues.normal.push(queueItem)
      }
      this.#flushQueue(ws)
    } catch (error) {
      const data = this.#socketData.get(ws)
      getDebugLogger().logWebSocketServerEvent('send_failed', {
        connectionId: data?.connectionId,
        error: (error as Error).message,
      })
    }
  }

  /** Flush as many queued messages as possible without exceeding MAX_BUFFERED. */
  #flushQueue(ws: WS) {
    const queues = this.#outgoingQueues.get(ws)
    if (
      !queues ||
      (queues.critical.length === 0 && queues.normal.length === 0)
    ) {
      return
    }

    if (ws.readyState !== WS.OPEN) {
      // Drop the queue for closed sockets
      this.#outgoingQueues.delete(ws)
      this.#estimatedQueueBytes.delete(ws)
      return
    }

    const data = this.#socketData.get(ws)

    let credit = 0
    const takeNext = () => {
      // 3:1 critical:normal scheduling
      if (credit++ % 4 === 3) {
        return queues.normal.shift()
      }
      return queues.critical.shift() ?? queues.normal.shift()
    }

    while (
      (queues.critical.length || queues.normal.length) &&
      (ws.bufferedAmount ?? 0) < MAX_BUFFERED
    ) {
      const item = takeNext()
      if (!item) {
        break
      }
      const { data: message, bytes } = item
      getDebugLogger().logWebSocketServerEvent('payload_bytes', {
        connectionId: data?.connectionId,
        payloadBytes: bytes,
      })

      try {
        ws.send(message, (error?: Error) => {
          if (error) {
            getDebugLogger().logWebSocketServerEvent('send_failed', {
              connectionId: data?.connectionId,
              error: error.message,
            })
            // fail fast on send error
            this.#closeWith(ws, 1011, 'Send callback error')
          }
        })
        const previous = this.#estimatedQueueBytes.get(ws) || 0
        this.#estimatedQueueBytes.set(ws, Math.max(0, previous - bytes))
      } catch (error) {
        getDebugLogger().logWebSocketServerEvent('send_failed', {
          connectionId: data?.connectionId,
          error: (error as Error).message,
        })
        // fail fast on synchronous send error
        this.#closeWith(ws, 1011, 'Send threw')
        break
      }
    }

    // If there are still messages pending schedule another flush attempt.
    if (queues.critical.length || queues.normal.length) {
      if (!this.#flushTimers.has(ws)) {
        const timer = setTimeout(() => {
          this.#flushTimers.delete(ws)
          this.#flushQueue(ws)
        }, 50)
        timer.unref?.()
        this.#flushTimers.set(ws, timer)
      }
    } else {
      const timer = this.#flushTimers.get(ws)
      if (timer) {
        clearTimeout(timer)
        this.#flushTimers.delete(ws)
      }
    }
  }

  #sendError(
    ws: WS,
    id: number | null | undefined,
    code: number,
    message: string,
    data: any = null
  ) {
    this.#sendJson(ws, {
      id,
      error: { code, message, data },
    } satisfies WebSocketResponse)
  }

  async *#withChunkTimeout<T>(
    iterable: AsyncIterable<T>,
    signal: AbortSignal,
    ms: number
  ) {
    const iterator = iterable[Symbol.asyncIterator]()
    while (true) {
      let timeout: NodeJS.Timeout | undefined
      let onAbort: () => void = () => {}
      const next = iterator.next()
      const gate = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new TimeoutError(ms)), ms)
        onAbort = () => {
          if (timeout) {
            clearTimeout(timeout)
          }
          reject(new Error('Stream aborted'))
        }
        signal.addEventListener('abort', onAbort, { once: true })
      })

      let result: IteratorResult<T>
      try {
        result = (await Promise.race([next, gate])) as IteratorResult<T>
      } finally {
        if (timeout) {
          clearTimeout(timeout)
        }
        signal.removeEventListener?.('abort', onAbort)
      }

      if (result.done) {
        return
      }
      yield result.value
    }
  }
}
