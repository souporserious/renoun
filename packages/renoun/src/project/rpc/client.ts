import WS from 'ws'
import { EventEmitter } from 'node:events'

import { getDebugLogger } from '../../utils/debug.js'
import type { WebSocketResponse } from './server.js'

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

const REQUEST_TIMEOUT_MS = 120_000 // 120s
const PENDING_LIMIT = 1000 // 1000 requests
const PENDING_BYTES_LIMIT = 8 * 1024 * 1024 // 8MB
const AUTO_BATCH_MAX_BYTES = 64 * 1024 // ~64KB per batch frame
const AUTO_BATCH_MAX_ITEMS = 128 // cap for many tiny calls
const AUTO_BATCH_MAX_DELAY_MS = 2 // tiny coalesce window

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

  REQUEST_TIMEOUT: ({
    timeout = REQUEST_TIMEOUT_MS,
    method,
    params,
    connectionState,
  }) =>
    `[renoun] Request timed out after ${timeout}ms\n\n` +
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

export class WebSocketClient extends EventEmitter {
  #ws!: WS
  #serverId: string
  #shouldRetry = true
  #retryTimeout?: NodeJS.Timeout
  #isConnected = false
  #connectionState: ConnectionState = 'connecting'
  #connectionStartTime: number = 0

  // per-request resolvers
  #requests: Record<number, Request> = {}

  // streaming request routing
  #streams: Record<
    number,
    { onChunk: (value: any) => void; onDone: () => void }
  > = {}

  // frames not yet sent (offline or backpressure)
  #pendingRequests: { ids: number[]; payload: string }[] = []
  #pendingBytes = 0

  // frames queued to send on the live socket
  #queue: { ids: number[]; payload: string }[] = []

  // frames that have been sent on the current socket and still have unresolved ids
  #framesInFlight: Array<{ ids: Set<number>; payload: string }> = []

  #flushTimer?: NodeJS.Timeout
  #MAX_BUFFERED = 8 * 1024 * 1024

  // reconnect tuning (faster + more tries for CI flaps)
  #baseRetryMs: number = 300
  #maxRetryMs: number = 5_000
  #maxRetries: number = 10
  #currentRetries: number = 0

  #nextId: number = 1

  // autobatch buckets keyed by timeout so time budget is aligned
  #autoBatchQueues = new Map<
    number,
    {
      items: Array<{
        method: string
        params: any
        bytes: number
        resolve: (value: any) => void
        reject: (error: any) => void
      }>
      size: number
      timer?: NodeJS.Timeout
    }
  >()

  // readiness barrier (optional to await from callers)
  #readyWaiters: Array<(v: void) => void> = []

  #handleOpenEvent = this.#handleOpen.bind(this)
  #handleMessageEvent = this.#handleMessage.bind(this)
  #handleErrorEvent = this.#handleError.bind(this)
  #handleCloseEvent = this.#handleClose.bind(this)

  constructor(serverId: string) {
    super()
    this.#serverId = serverId
    this.#connect()
  }

  /** Optional: await until connected (good for startup sequencing). */
  ready(timeoutMs = 15_000): Promise<void> {
    if (this.#isConnected && this.#ws?.readyState === WS.OPEN) {
      return Promise.resolve()
    }

    let settled = false
    return new Promise<void>((resolve, reject) => {
      const waiter = () => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        if (settled) {
          return
        }
        settled = true
        const index = this.#readyWaiters.indexOf(waiter)
        if (index !== -1) {
          this.#readyWaiters.splice(index, 1)
        }
        reject(
          new WebSocketClientError(
            '[renoun] WebSocket client ready() timed out',
            'CONNECTION_TIMEOUT',
            {
              connectionState: this.#connectionState,
              connectionTime: formatConnectionTime(this.#connectionStartTime),
              port: String(process.env.RENOUN_SERVER_PORT || 'unknown'),
            }
          )
        )
      }, timeoutMs)

      this.#readyWaiters.push(waiter)
    })
  }

  async #enqueueAutoBatch<Type>(
    method: string,
    params: any,
    timeoutMs: number
  ): Promise<Type> {
    const payload = { method, params }
    const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8')

    // Large single call: send as its own tiny batch immediately (settled).
    if (bytes > AUTO_BATCH_MAX_BYTES) {
      return this.batch([{ method, params }], timeoutMs).then((array) => {
        const result = array[0]
        if (result && result.ok) {
          return result.value as Type
        }
        throw result
          ? parseServerError(result.error)
          : new Error('Unknown batch error')
      })
    }

    let bucket = this.#autoBatchQueues.get(timeoutMs)
    if (!bucket) {
      bucket = { items: [], size: 0, timer: undefined }
      this.#autoBatchQueues.set(timeoutMs, bucket)
    }

    return new Promise<Type>((resolve, reject) => {
      bucket!.items.push({ method, params, resolve, reject, bytes })
      bucket!.size += bytes

      const shouldFlush =
        bucket!.size >= AUTO_BATCH_MAX_BYTES ||
        bucket!.items.length >= AUTO_BATCH_MAX_ITEMS

      if (shouldFlush) {
        this.#flushAutoBatch(timeoutMs)
        return
      }

      if (!bucket!.timer) {
        bucket!.timer = setTimeout(() => {
          bucket!.timer = undefined
          this.#flushAutoBatch(timeoutMs)
        }, AUTO_BATCH_MAX_DELAY_MS)
      }
    })
  }

  #flushAutoBatch(timeoutMs: number) {
    const bucket = this.#autoBatchQueues.get(timeoutMs)
    if (!bucket || bucket.items.length === 0) {
      return
    }

    if (bucket.timer) {
      clearTimeout(bucket.timer)
      bucket.timer = undefined
    }

    // Take as many as fit in maxBytes
    let size = 0
    const batchItems: typeof bucket.items = []
    while (bucket.items.length) {
      const next = bucket.items[0]!
      if (size && size + next.bytes > AUTO_BATCH_MAX_BYTES) break
      batchItems.push(next)
      bucket.items.shift()
      size += next.bytes
    }
    bucket.size -= size

    const requests = batchItems.map(({ method, params }) => ({
      method,
      params,
    }))

    this.batch(requests, timeoutMs)
      .then((results) => {
        for (let index = 0; index < results.length; index++) {
          const result = results[index]!
          const item = batchItems[index]!
          if (result && result.ok) {
            item.resolve(result.value)
          } else {
            item.reject(
              result
                ? parseServerError(result.error)
                : new Error('Unknown batch error')
            )
          }
        }
      })
      .catch((error) => {
        for (const item of batchItems) {
          item.reject(error)
        }
      })

    if (bucket.items.length && !bucket.timer) {
      bucket.timer = setTimeout(() => {
        bucket!.timer = undefined
        this.#flushAutoBatch(timeoutMs)
      }, AUTO_BATCH_MAX_DELAY_MS)
    }
  }

  #sendFrame(ids: number[], payload: string) {
    this.#queue.push({ ids, payload })
    this.#flush()
  }

  #sendOrQueueFrame(ids: number[], payload: string): boolean {
    if (this.#isConnected && this.#ws.readyState === WS.OPEN) {
      this.#sendFrame(ids, payload)
      return true
    }
    const bytes = Buffer.byteLength(payload)
    if (
      this.#pendingRequests.length >= PENDING_LIMIT ||
      this.#pendingBytes + bytes > PENDING_BYTES_LIMIT
    ) {
      const error = new WebSocketClientError(
        '[renoun] Client offline and pending queue is full',
        'UNKNOWN_ERROR',
        {
          connectionState: this.#connectionState,
          connectionTime: formatConnectionTime(this.#connectionStartTime),
          port: process.env.RENOUN_SERVER_PORT || 'unknown',
        }
      )
      // reject all ids that would have been part of this frame
      for (const id of ids) {
        this.#requests[id]?.reject(error)
        delete this.#requests[id]
      }
      return false
    }
    this.#pendingRequests.push({ ids, payload })
    this.#pendingBytes += bytes
    return true
  }

  #flush() {
    if (!this.#isConnected || this.#ws.readyState !== WS.OPEN) {
      return
    }

    while (this.#queue.length && this.#ws.bufferedAmount < this.#MAX_BUFFERED) {
      const frame = this.#queue.shift()!
      try {
        this.#ws.send(frame.payload)
        // track this frame as in-flight until all its ids settle
        this.#framesInFlight.push({
          ids: new Set(frame.ids),
          payload: frame.payload,
        })
      } catch (error) {
        getDebugLogger().logWebSocketClientEvent('send_failed', {
          error: (error as Error).message,
        })
        // push back to pending so reconnect can retry
        this.#pendingRequests.unshift(frame)
        this.#pendingBytes += Buffer.byteLength(frame.payload)
        break
      }
    }

    if (this.#queue.length && !this.#flushTimer) {
      this.#flushTimer = setTimeout(() => {
        this.#flushTimer = undefined
        this.#flush()
      }, 50)
    }
  }

  #flushing = false

  async #flushPending() {
    if (this.#flushing) {
      return
    }
    this.#flushing = true
    try {
      while (this.#pendingRequests.length) {
        const frame = this.#pendingRequests[0]!
        if (!this.#isConnected || this.#ws.readyState !== WS.OPEN) {
          break
        }
        this.#sendFrame(frame.ids, frame.payload)
        this.#pendingRequests.shift()
        this.#pendingBytes = Math.max(
          0,
          this.#pendingBytes - Buffer.byteLength(frame.payload)
        )

        // Yield to the event loop to allow the server to handle the request
        await new Promise((resolve) => setImmediate(resolve))
      }
    } finally {
      this.#flushing = false
    }
  }

  #connect() {
    try {
      if (this.#ws) {
        this.#ws.off('open', this.#handleOpenEvent)
        this.#ws.off('message', this.#handleMessageEvent)
        this.#ws.off('error', this.#handleErrorEvent)
        this.#ws.off('close', this.#handleCloseEvent)
      }
    } catch (error) {
      getDebugLogger().logWebSocketClientEvent('off_failed', {
        where: 'pre_connect_cleanup',
        error: (error as Error).message,
      })
    }

    this.#connectionState = 'connecting'
    this.#connectionStartTime = performance.now()

    getDebugLogger().logWebSocketClientEvent('connecting', {
      port: process.env.RENOUN_SERVER_PORT,
    })

    const port = process.env.RENOUN_SERVER_PORT
    if (!port) {
      const err = new WebSocketClientError(
        '[renoun] Missing RENOUN_SERVER_PORT',
        'UNKNOWN_ERROR',
        {
          connectionState: this.#connectionState,
          connectionTime: 0,
          port: 'unknown',
        }
      )
      this.#connectionState = 'failed'
      this.#emitError(err)
      return
    }
    const serverId = this.#serverId
    if (!serverId) {
      const error = new WebSocketClientError(
        '[renoun] Missing server ID',
        'UNKNOWN_ERROR',
        {
          connectionState: this.#connectionState,
          connectionTime: 0,
          port: String(process.env.RENOUN_SERVER_PORT || 'unknown'),
        }
      )
      this.#connectionState = 'failed'
      this.#emitError(error)
      return
    }

    this.#ws = new WS(`ws://localhost:${port}`, serverId, {
      handshakeTimeout: 15_000,
      perMessageDeflate: false,
      maxPayload: 16 * 1024 * 1024,
    })

    this.#ws.on('open', this.#handleOpenEvent)
    this.#ws.on('message', this.#handleMessageEvent)
    this.#ws.on('error', this.#handleErrorEvent)
    this.#ws.on('close', this.#handleCloseEvent)
  }

  #handleOpen() {
    // if a retry timer was still pending, clear it
    if (this.#retryTimeout) {
      clearTimeout(this.#retryTimeout)
      this.#retryTimeout = undefined
    }

    if (!this.#shouldRetry) {
      // We were closed intentionally but a late connect fired so drop it
      try {
        this.#ws?.close(1000, 'opened_after_close')
      } catch (error) {
        getDebugLogger().logWebSocketClientEvent('close_failed', {
          where: 'handleOpen_guard',
          error: (error as Error).message,
        })
      }
      return
    }

    this.#isConnected = true
    this.#connectionState = 'connected'
    this.#currentRetries = 0

    getDebugLogger().logWebSocketClientEvent('connected', {
      connectionTime: formatConnectionTime(this.#connectionStartTime),
      pendingRequests: this.#pendingRequests.length,
    })

    // Allow anyone awaiting ready() to proceed
    const waiters = this.#readyWaiters.splice(0, this.#readyWaiters.length)
    waiters.forEach((fn) => fn())

    void this.#flushPending()
    this.emit('connected')
  }

  #retryConnection() {
    if (this.#retryTimeout || !this.#shouldRetry) {
      return
    }

    if (this.#currentRetries < this.#maxRetries) {
      this.#currentRetries++
      const base = Math.min(
        this.#maxRetryMs,
        this.#baseRetryMs * 2 ** (this.#currentRetries - 1)
      )
      const jitter = Math.random() * 0.3 * base
      const delay = Math.round(base + jitter)

      this.#retryTimeout = setTimeout(() => {
        this.#retryTimeout = undefined

        getDebugLogger().logWebSocketClientEvent('retrying', {
          retryCount: this.#currentRetries,
          maxRetries: this.#maxRetries,
          delay,
        })

        this.emit('retry', {
          retryCount: this.#currentRetries,
          maxRetries: this.#maxRetries,
          delay,
        })

        if (!this.#shouldRetry) {
          return
        }

        this.#connect()
      }, delay)

      // let the process exit naturally if nothing else is pending
      this.#retryTimeout?.unref()
    } else {
      const error = this.#createClientError('MAX_RETRIES_EXCEEDED', {
        connectionTime: formatConnectionTime(this.#connectionStartTime),
        port: process.env.RENOUN_SERVER_PORT || 'unknown',
        connectionState: this.#connectionState,
        maxRetries: this.#maxRetries,
      })

      // clear any stray timer just in case
      if (this.#retryTimeout) {
        clearTimeout(this.#retryTimeout)
        this.#retryTimeout = undefined
      }

      for (const id of Object.keys(this.#requests)) {
        const numericId = Number(id)
        this.#requests[numericId]?.reject(error)
        delete this.#requests[numericId]
      }

      this.#connectionState = 'failed'
      this.emit('maxRetriesExceeded', { maxRetries: this.#maxRetries })
      this.#emitError(error)

      return
    }
  }

  #handleError(event: any) {
    const connectionTime = formatConnectionTime(this.#connectionStartTime)
    const port = process.env.RENOUN_SERVER_PORT || 'unknown'

    // While connecting we only log; close handler will decide whether to retry
    if (this.#connectionState === 'connecting') {
      getDebugLogger().logWebSocketClientEvent('connect_error', {
        connectionTime,
        eventMessage: event?.message,
      })
      return
    }

    getDebugLogger().logWebSocketClientEvent('error', {
      connectionTime,
      port,
      connectionState: this.#connectionState,
      eventMessage: event?.message,
    })

    // IMPORTANT: do not reject in-flight requests here; wait for close+retry.
    return
  }

  #handleClose(code?: number, reasonBuffer?: Buffer) {
    this.#isConnected = false
    this.#connectionState = 'disconnected'

    const reason = (reasonBuffer?.toString() || '').trim()
    const connectionTime = formatConnectionTime(this.#connectionStartTime)

    getDebugLogger().logWebSocketClientEvent('closed', {
      code: code ?? 1006,
      reason,
      connectionTime,
      retryCount: this.#currentRetries,
    })

    // Stop any pending flush loop
    if (this.#flushTimer) {
      clearTimeout(this.#flushTimer)
      this.#flushTimer = undefined
    }

    try {
      this.#ws.off('open', this.#handleOpenEvent)
      this.#ws.off('message', this.#handleMessageEvent)
      this.#ws.off('error', this.#handleErrorEvent)
      this.#ws.off('close', this.#handleCloseEvent)
    } catch (error) {
      getDebugLogger().logWebSocketClientEvent('off_failed', {
        where: 'handleClose',
        error: (error as Error).message,
      })
    }

    // Requeue frames that were in flight on the now-dead socket (only unresolved ids)
    if (this.#framesInFlight.length) {
      const requeued: { ids: number[]; payload: string }[] = []
      for (const frame of this.#framesInFlight) {
        if (frame.ids.size === 0) continue
        try {
          const parsed = JSON.parse(frame.payload)
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter((req: any) => frame.ids.has(req?.id))
            if (filtered.length) {
              requeued.push({
                ids: filtered.map((r: any) => r.id),
                payload: JSON.stringify(filtered),
              })
            }
          } else {
            const singleId = (parsed && parsed.id) as number | undefined
            if (singleId != null && frame.ids.has(singleId)) {
              requeued.push({ ids: [singleId], payload: frame.payload })
            }
          }
        } catch {
          // if parsing fails, fallback to resending the whole frame
          requeued.push({ ids: [...frame.ids], payload: frame.payload })
        }
      }
      // Put them at the front so they resend before new work.
      this.#pendingRequests = [...requeued, ...this.#pendingRequests]
      // Recompute pending bytes conservatively
      this.#pendingBytes = this.#pendingRequests.reduce(
        (total, request) => total + Buffer.byteLength(request.payload),
        0
      )
      this.#framesInFlight = []
    }

    // Do NOT reject in-flight requests here. Let them either succeed
    // after we resend on reconnect, or let their per-request timers fire.

    // Keep streams mapped; if callers are consuming, they will resume or end on timeout.
    this.emit('disconnected', { code: code ?? 1006, reason })

    if (this.#shouldRetry) {
      this.#retryConnection()
    }
  }

  async callMethod<Params extends Record<string, unknown>, Value>(
    method: string,
    params: Params,
    timeoutMs = REQUEST_TIMEOUT_MS,
    batch: boolean = true
  ): Promise<Value> {
    if (batch) {
      return this.#enqueueAutoBatch<Value>(method, params, timeoutMs)
    }
    return this.#callMethodUnbatched<Params, Value>(method, params, timeoutMs)
  }

  async batch(
    requests: { method: string; params: any }[],
    timeoutMs = REQUEST_TIMEOUT_MS
  ): Promise<Array<{ ok: true; value: any } | { ok: false; error: any }>> {
    const framed = requests.map((request) => ({
      ...request,
      id: this.#nextId++,
      timeoutMs,
    }))
    const ids = framed.map((frame) => frame.id)
    const payload = JSON.stringify(framed)
    const timers: Record<number, NodeJS.Timeout> = {}

    type Settled = { ok: true; value: any } | { ok: false; error: Error }
    const settles = framed.map(
      ({ id, method, params }) =>
        new Promise<Settled>((resolve) => {
          timers[id] = setTimeout(() => {
            resolve({
              ok: false,
              error: this.#createClientError('REQUEST_TIMEOUT', {
                connectionTime:
                  Math.round(
                    (performance.now() - this.#connectionStartTime) * 1000
                  ) / 1000,
                port: process.env.RENOUN_SERVER_PORT || 'unknown',
                connectionState: this.#connectionState,
                method,
                params,
                timeout: timeoutMs,
              }),
            })
          }, timeoutMs)

          this.#requests[id] = {
            resolve: (value) => {
              clearTimeout(timers[id])
              delete timers[id]
              resolve({ ok: true, value })
              delete this.#requests[id]
              this.#onRequestSettled(id)
            },
            reject: (reason) => {
              clearTimeout(timers[id])
              delete timers[id]
              resolve({ ok: false, error: parseServerError(reason) })
              delete this.#requests[id]
              this.#onRequestSettled(id)
            },
          }
        })
    )

    // Queue or send the batch once with all ids
    if (!this.#sendOrQueueFrame(ids, payload)) {
      const error = this.#createClientError('UNKNOWN_ERROR', {
        connectionTime: formatConnectionTime(this.#connectionStartTime),
        port: process.env.RENOUN_SERVER_PORT || 'unknown',
        connectionState: this.#connectionState,
        eventMessage: 'pending_queue_full',
      })
      // Settle all entries with the same error and clean up resolvers/timers
      for (const id of ids) {
        if (this.#requests[id]) {
          try {
            this.#requests[id].reject(error)
          } catch {}
          delete this.#requests[id]
        }
        if (timers[id]) {
          clearTimeout(timers[id])
          delete timers[id]
        }
      }
      return framed.map(() => ({ ok: false, error }))
    }

    try {
      const results = await Promise.all(settles)
      return results
    } finally {
      for (const id of Object.keys(timers)) {
        clearTimeout(timers[Number(id)])
      }
    }
  }

  async #callMethodUnbatched<Params extends Record<string, unknown>, Value>(
    method: string,
    params: Params,
    timeoutMs = REQUEST_TIMEOUT_MS
  ): Promise<Value> {
    const id = this.#nextId++
    const payload = JSON.stringify({ method, params, id, timeoutMs })

    getDebugLogger().logWebSocketClientEvent('method_call', {
      method,
      params,
      id,
    })

    return new Promise<Value>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        getDebugLogger().logWebSocketClientEvent('method_timeout', {
          method,
          id,
        })

        const error = this.#createClientError('REQUEST_TIMEOUT', {
          connectionTime: formatConnectionTime(this.#connectionStartTime),
          port: process.env.RENOUN_SERVER_PORT || 'unknown',
          connectionState: this.#connectionState,
          method,
          params,
          timeout: timeoutMs,
        })

        // If still pending (unsent), try to surgically remove this id from its frame.
        const index = this.#pendingRequests.findIndex((frame) =>
          frame.ids.includes(id)
        )
        if (index !== -1) {
          const frame = this.#pendingRequests[index]!
          try {
            const parsed = JSON.parse(frame.payload)
            if (Array.isArray(parsed)) {
              const filtered = parsed.filter((r: any) => r?.id !== id)
              if (filtered.length !== parsed.length) {
                const oldBytes = Buffer.byteLength(frame.payload)
                frame.payload = JSON.stringify(filtered)
                frame.ids = frame.ids.filter((n) => n !== id)
                const newBytes = Buffer.byteLength(frame.payload)
                this.#pendingBytes = Math.max(
                  0,
                  this.#pendingBytes - (oldBytes - newBytes)
                )
                if (frame.ids.length === 0) {
                  this.#pendingBytes = Math.max(
                    0,
                    this.#pendingBytes - newBytes
                  )
                  this.#pendingRequests.splice(index, 1)
                }
              }
            } else if ((parsed && parsed.id) === id) {
              const bytes = Buffer.byteLength(frame.payload)
              this.#pendingBytes = Math.max(0, this.#pendingBytes - bytes)
              this.#pendingRequests.splice(index, 1)
            }
          } catch {
            // best-effort: leave pending frame as-is
          }
        }

        reject(error)
        delete this.#requests[id]
        this.#onRequestSettled(id)
      }, timeoutMs)

      this.#requests[id] = {
        resolve: (value) => {
          clearTimeout(timeoutId)
          getDebugLogger().logWebSocketClientEvent('method_resolved', {
            method,
            id,
          })
          resolve(value)
          this.#onRequestSettled(id)
        },
        reject: (reason) => {
          clearTimeout(timeoutId)
          getDebugLogger().logWebSocketClientEvent('method_rejected', {
            method,
            id,
            reason: reason?.message,
          })
          reject(reason)
          this.#onRequestSettled(id)
        },
      } satisfies Request

      this.#sendOrQueueFrame([id], payload)
    }).catch((error) => {
      if (error instanceof WebSocketClientError) {
        throw error
      }

      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        'message' in error
      ) {
        const constructedError = new Error((error as any).message)
        Object.assign(constructedError, error)
        throw constructedError
      }

      throw error instanceof Error ? error : new Error(String(error))
    })
  }

  callStream<Params extends Record<string, unknown>, Value>(
    method: string,
    params: Params
  ) {
    const queue: Value[] = []
    const id = this.#nextId++
    const payload = JSON.stringify({ method, params, id })
    let nextResolve: ((result: IteratorResult<Value>) => void) | null = null
    let ended = false
    let idleTimeout: NodeJS.Timeout | undefined
    const resetIdleTimeout = () => {
      if (idleTimeout) {
        clearTimeout(idleTimeout)
      }
      idleTimeout = setTimeout(() => {
        ended = true
        delete self.#streams[id]
        if (nextResolve) {
          const resolve = nextResolve
          nextResolve = null
          resolve({ value: undefined, done: true })
        }
        self.emit('streamError', { id, error: 'Client idle timeout' })
      }, 120_000)
    }
    resetIdleTimeout()

    this.#streams[id] = {
      onChunk: (value: Value) => {
        resetIdleTimeout()
        if (nextResolve) {
          const resolve = nextResolve
          nextResolve = null
          resolve({ value, done: false })
        } else {
          queue.push(value)
        }
      },
      onDone: () => {
        if (idleTimeout) {
          clearTimeout(idleTimeout)
        }
        ended = true
        if (nextResolve) {
          const resolve = nextResolve
          nextResolve = null
          resolve({ value: undefined, done: true })
        }
      },
    }

    this.#sendOrQueueFrame([id], payload)

    const self = this
    return {
      [Symbol.asyncIterator]() {
        return this
      },
      async next(): Promise<IteratorResult<Value>> {
        if (queue.length) {
          return { value: queue.shift()!, done: false }
        }
        if (ended) {
          return { value: undefined, done: true }
        }
        return new Promise<IteratorResult<Value>>((res) => {
          nextResolve = res
        })
      },
      async return() {
        ended = true
        try {
          if (self.#isConnected && self.#ws.readyState === WS.OPEN) {
            self.#sendFrame([id], JSON.stringify({ type: 'cancel', id }))
          }
        } catch {
          getDebugLogger().logWebSocketClientEvent('cancel_failed', { id })
        }

        delete self.#streams[id]

        if (nextResolve) {
          const resolve = nextResolve
          nextResolve = null
          resolve({ value: undefined, done: true })
        }
        return { value: undefined, done: true }
      },
    }
  }

  #handleMessage(data: any) {
    let raw: string
    if (typeof data === 'string') {
      raw = data
    } else if (Buffer.isBuffer(data)) {
      raw = data.toString()
    } else if (Array.isArray(data)) {
      raw = Buffer.concat(data as Buffer[]).toString()
    } else {
      raw = Buffer.from(data as ArrayBuffer).toString()
    }

    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      getDebugLogger().logWebSocketClientEvent('parse_error', {
        error: (error as Error).message,
      })
      this.emit(
        'messageParseError',
        new Error('[renoun] Malformed message from server'),
        raw.slice(0, 512)
      )
      return
    }

    if (Array.isArray(parsed)) {
      parsed.forEach((message) => this.#handleSingleMessage(message))
    } else {
      this.#handleSingleMessage(parsed)
    }
  }

  #handleSingleMessage(message: any) {
    // Surface protocol-level errors that have id: null or undefined
    if (
      (message?.id === null || typeof message?.id === 'undefined') &&
      message?.error
    ) {
      this.emit('protocolError', message.error)
      return
    }

    // treat as server notification: { type, data }
    if (
      message &&
      !('id' in message) &&
      !('result' in message) &&
      !('error' in message)
    ) {
      this.emit('notification', message)
      return
    }

    // Handle non-stream RPC errors immediately (avoid waiting on timeout)
    if (
      message &&
      typeof message.id === 'number' &&
      message.error &&
      !('chunk' in message) &&
      !('done' in message)
    ) {
      const request = this.#requests[message.id]
      if (request) {
        request.reject(message.error)
        delete this.#requests[message.id]
        this.#onRequestSettled(message.id)
      }
      return
    }

    // Route streaming messages, including error finalization
    if (message && ('chunk' in message || 'done' in message)) {
      const stream = this.#streams[message.id]
      if (!stream) {
        return
      }
      if (message.error) {
        stream.onDone()
        delete this.#streams[message.id]
        this.emit('streamError', { id: message.id, error: message.error })
        this.#onRequestSettled(message.id)
      } else if (message.done) {
        stream.onDone()
        delete this.#streams[message.id]
        this.#onRequestSettled(message.id)
      } else {
        stream.onChunk(message.chunk)
      }
      return
    }

    const { id, result, error } = message as WebSocketResponse
    if (typeof id === 'number' && this.#requests[id]) {
      if (error) {
        this.#requests[id].reject(error)
      } else {
        this.#requests[id].resolve(result)
      }
      delete this.#requests[id]
      this.#onRequestSettled(id)
    }
  }

  #onRequestSettled(id: number) {
    // Remove the id from any in-flight frames; drop empty frames.
    for (let index = this.#framesInFlight.length - 1; index >= 0; index--) {
      const frame = this.#framesInFlight[index]
      if (frame.ids.delete(id) && frame.ids.size === 0) {
        this.#framesInFlight.splice(index, 1)
      }
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
      params: context.params,
      timeout: context.timeout,
      retryCount: this.#currentRetries,
    })
  }

  #emitError(error: Error) {
    if (this.listenerCount('error') > 0) {
      this.emit('error', error)
    } else {
      getDebugLogger().logWebSocketClientEvent('unhandled_error', {
        message: error.message,
      })
    }
  }

  close() {
    this.#shouldRetry = false

    // kill any scheduled retry
    if (this.#retryTimeout) {
      clearTimeout(this.#retryTimeout)
      this.#retryTimeout = undefined
    }

    this.#isConnected = false
    try {
      this.#ws?.close(1000)
    } catch (error) {
      getDebugLogger().logWebSocketClientEvent('close_failed', {
        where: 'client_close',
        error: (error as Error).message,
      })
    }
    try {
      this.#ws?.off('open', this.#handleOpenEvent)
      this.#ws?.off('message', this.#handleMessageEvent)
      this.#ws?.off('error', this.#handleErrorEvent)
      this.#ws?.off('close', this.#handleCloseEvent)
    } catch (error) {
      getDebugLogger().logWebSocketClientEvent('off_failed', {
        where: 'client_close',
        error: (error as Error).message,
      })
    }

    // Reject in-flight and clear all queues (explicit close)
    const error = new WebSocketClientError(
      '[renoun] Client closed',
      'UNKNOWN_ERROR',
      {
        connectionState: this.#connectionState,
        connectionTime: formatConnectionTime(this.#connectionStartTime),
        port: process.env.RENOUN_SERVER_PORT || 'unknown',
      }
    )

    for (const id of Object.keys(this.#requests)) {
      const numericId = Number(id)
      this.#requests[numericId]?.reject(error)
      delete this.#requests[numericId]
    }

    this.#pendingRequests.length = 0
    this.#queue.length = 0
    this.#framesInFlight.length = 0
    this.#pendingBytes = 0

    this.#connectionState = 'disconnected'
    this.emit('disconnected')
  }
}

/** Format connection time in milliseconds */
function formatConnectionTime(time: number) {
  return Math.round((performance.now() - time) * 1000) / 1000
}

/** Parses errors from the RPC server. */
function parseServerError(error: any): Error {
  if (error instanceof Error) {
    return error
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as any).message === 'string'
  ) {
    const constructed = new Error((error as any).message)
    Object.assign(constructed, error)
    return constructed
  }

  return new Error(String(error))
}
