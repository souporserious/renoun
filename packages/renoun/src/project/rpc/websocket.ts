import { createServer, type IncomingMessage } from 'node:http'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { Socket } from 'node:net'

export type RawData = string | Buffer | Buffer[] | ArrayBuffer

interface WebSocketServerOptions {
  port?: number
  host?: string
  backlog?: number
  maxPayload?: number
  verifyClient?: (request: IncomingMessage) => boolean
  handleProtocols?: (protocols: Set<string>) => string | false
  allowedOrigins?:
    | Set<string>
    | ((origin: string | undefined, request: IncomingMessage) => boolean)
  path?: string
  idleTimeoutMs?: number
  maxPingsPerWindow?: number
  pingWindowMs?: number
  maxSendQueueBytes?: number
  maxBufferBytes?: number
}

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const DEFAULT_MAX_PAYLOAD = 64 * 1024 // 64 KiB
const DEFAULT_IDLE_TIMEOUT_MS = 120_000
const DEFAULT_MAX_PINGS_PER_WINDOW = 10
const DEFAULT_PING_WINDOW_MS = 10_000
const DEFAULT_MAX_SEND_QUEUE_BYTES = 32 * 1024 * 1024 // 32 MiB
const DEFAULT_MAX_BUFFER_BYTES = 2 * 1024 * 1024 // 2 MiB
const ABSOLUTE_MAX_PAYLOAD = 64 * 1024 * 1024 // 64 MiB
const ABSOLUTE_MAX_BUFFER_BYTES = ABSOLUTE_MAX_PAYLOAD + 1 * 1024 * 1024 // payload + 1 MiB slack
const ABSOLUTE_MAX_SEND_QUEUE_BYTES = 64 * 1024 * 1024 // 64 MiB
const MAX_ALLOWED_HOST_LENGTH = 512
const MAX_ALLOWED_ORIGIN_LENGTH = 4096
const MAX_IDLE_TIMEOUT_MS = 10 * 60 * 1000
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/ // RFC6455 token for subprotocol
const OPCODE = {
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  // 0x3..0x7 = reserved
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xa,
  // 0xb..0xf = reserved
} as const

type Opcode = (typeof OPCODE)[keyof typeof OPCODE]

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function isLoopbackAddress(address: string | undefined) {
  if (!address) return false
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1'
  )
}

function isLoopbackHostname(hostname: string | undefined) {
  if (!hostname) return false
  const lower = hostname.toLowerCase()
  return LOOPBACK_HOSTS.has(lower)
}

const statelessTextDecoder = new TextDecoder('utf-8', { fatal: true })

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

function wrapCallbackError(message: string, error: unknown) {
  const err = toError(error)
  const wrapped = new Error(`${message}: ${err.message}`)
  ;(wrapped as any).cause = err
  return wrapped
}

function createAcceptValue(key: string) {
  return createHash('sha1')
    .update(key + GUID)
    .digest('base64')
}

function frame(opcode: Opcode, payload: Buffer) {
  const length = payload.length
  let header: Buffer
  if (length < 126) {
    header = Buffer.alloc(2)
    header[1] = length
  } else if (length < 65536) {
    header = Buffer.alloc(4)
    header[1] = 126
    header.writeUInt16BE(length, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 127
    header.writeBigUInt64BE(BigInt(length), 2)
  }
  header[0] = 0x80 | opcode // FIN=1 (we only generate unfragmented frames)
  return Buffer.concat([header, payload])
}

function isValidWebSocketKey(key: string | undefined): key is string {
  if (!key || key.length > 60) return false
  try {
    const buf = Buffer.from(key, 'base64')
    return buf.length === 16
  } catch {
    return false
  }
}

function isValidCloseCode(code: number) {
  if (
    code >= 1000 &&
    code <= 1011 &&
    code !== 1004 &&
    code !== 1005 &&
    code !== 1006
  ) {
    return true
  }
  if (code >= 3000 && code <= 4999) return true
  return false
}

export function isSameOrigin(
  origin: string | undefined,
  hostHeader: string | undefined
) {
  if (!origin || !hostHeader) return false
  try {
    const originUrl = new URL(origin)
    const requestUrl = new URL(`http://${hostHeader}`)

    const originPort =
      originUrl.port ||
      (originUrl.protocol === 'https:'
        ? '443'
        : originUrl.protocol === 'http:'
          ? '80'
          : '')
    const requestPort =
      requestUrl.port ||
      (requestUrl.protocol === 'https:'
        ? '443'
        : requestUrl.protocol === 'http:'
          ? '80'
          : '')

    const originHostPort = `${originUrl.hostname.toLowerCase()}:${originPort}`
    const requestHostPort = `${requestUrl.hostname.toLowerCase()}:${requestPort}`

    return originHostPort === requestHostPort
  } catch {
    return false
  }
}

function readHeader(
  request: IncomingMessage,
  name: string
): string | undefined {
  const raw = request.headers[
    name.toLowerCase() as keyof typeof request.headers
  ] as string | string[] | undefined
  if (Array.isArray(raw)) return raw.join(', ')
  return raw
}

function utf8SafeSlice(buffer: Buffer, maxBytes: number) {
  if (buffer.length <= maxBytes) return buffer
  let end = maxBytes
  // back up over any UTF-8 continuation bytes (10xxxxxx)
  while (end > 0 && (buffer[end] & 0b1100_0000) === 0b1000_0000) end--
  // if we land on a multi-byte lead that would be truncated, back up one more
  const lead = buffer[end]
  if (end > 0 && (lead & 0b1110_0000) === 0b1100_0000 && end + 1 > maxBytes) {
    end--
  } else if (
    end > 0 &&
    (lead & 0b1111_0000) === 0b1110_0000 &&
    end + 2 > maxBytes
  ) {
    end--
  } else if (
    end > 0 &&
    (lead & 0b1111_1000) === 0b1111_0000 &&
    end + 3 > maxBytes
  ) {
    end--
  }
  return buffer.subarray(0, Math.max(0, end))
}

export class WebSocket extends EventEmitter {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = WebSocket.CONNECTING

  #socket: Socket
  #buffer = Buffer.alloc(0)

  #maxPayload: number
  #closeCode: number | undefined
  #closeReason: string | undefined

  #pingWindowStartMs = Date.now()
  #pingsInWindow = 0
  #maxPingsPerWindow: number
  #pingWindowMs: number
  #maxSendQueueBytes: number
  #maxBufferBytes: number

  // Close handshake book-keeping
  #closeSent = false

  // Fragmentation state (text-only, binary start is rejected)
  #fragmentOpcode: 0 | typeof OPCODE.TEXT | typeof OPCODE.BINARY = 0
  #fragmentChunks: Buffer[] = []
  #fragmentTotal = 0
  #textStreamDecoder = new TextDecoder('utf-8', { fatal: true })
  #textStreamActive = false

  constructor(
    socket: Socket,
    options: {
      maxPayload?: number
      maxPingsPerWindow?: number
      pingWindowMs?: number
      maxSendQueueBytes?: number
      maxBufferBytes?: number
    } = {}
  ) {
    super()
    this.#socket = socket

    const configuredMaxPayload = options.maxPayload ?? DEFAULT_MAX_PAYLOAD
    const safeMaxPayload =
      Number.isFinite(configuredMaxPayload) && configuredMaxPayload > 0
        ? Math.min(configuredMaxPayload, ABSOLUTE_MAX_PAYLOAD)
        : DEFAULT_MAX_PAYLOAD
    this.#maxPayload = safeMaxPayload

    const configuredPings =
      options.maxPingsPerWindow ?? DEFAULT_MAX_PINGS_PER_WINDOW
    this.#maxPingsPerWindow =
      Number.isFinite(configuredPings) && configuredPings > 0
        ? Math.min(configuredPings, 1_000)
        : DEFAULT_MAX_PINGS_PER_WINDOW

    const configuredPingWindow = options.pingWindowMs ?? DEFAULT_PING_WINDOW_MS
    this.#pingWindowMs =
      Number.isFinite(configuredPingWindow) && configuredPingWindow > 0
        ? configuredPingWindow
        : DEFAULT_PING_WINDOW_MS

    const configuredSendQueue =
      options.maxSendQueueBytes ?? DEFAULT_MAX_SEND_QUEUE_BYTES
    this.#maxSendQueueBytes =
      Number.isFinite(configuredSendQueue) && configuredSendQueue > 0
        ? Math.min(configuredSendQueue, ABSOLUTE_MAX_SEND_QUEUE_BYTES)
        : DEFAULT_MAX_SEND_QUEUE_BYTES

    const desiredBufferLimit =
      options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES
    const safeBufferRequest =
      Number.isFinite(desiredBufferLimit) && desiredBufferLimit > 0
        ? desiredBufferLimit
        : DEFAULT_MAX_BUFFER_BYTES
    const minimumBuffer = this.#maxPayload + 1024
    const cappedBuffer = Math.min(
      Math.max(safeBufferRequest, minimumBuffer),
      ABSOLUTE_MAX_BUFFER_BYTES
    )
    this.#maxBufferBytes = cappedBuffer

    this.readyState = WebSocket.OPEN

    socket.on('data', (data) => this._handleData(data))
    socket.on('close', () => {
      this.readyState = WebSocket.CLOSED
      this.emit(
        'close',
        this.#closeCode,
        this.#closeReason ? Buffer.from(this.#closeReason) : undefined
      )
    })
    socket.on('error', (error) => {
      this.emit('error', error)
      if (this.readyState !== WebSocket.CLOSED) {
        this.terminate()
      }
    })
  }

  get bufferedAmount() {
    return this.#socket.writableLength
  }

  send(data: string | Buffer, callback?: (error?: Error | null) => void) {
    if (this.readyState !== WebSocket.OPEN) {
      callback?.(new Error('WebSocket is not open'))
      return
    }
    const isText = typeof data === 'string'
    const payloadBuffer = isText ? Buffer.from(data) : data
    if (payloadBuffer.length > this.#maxPayload) {
      this.close(1009, 'Message too large')
      callback?.(new Error('Payload exceeds configured maximum'))
      return
    }
    const opcode: Opcode = isText ? OPCODE.TEXT : OPCODE.BINARY
    const outFrame = frame(opcode, payloadBuffer)

    if (
      this.#socket.writableLength + outFrame.length >
      this.#maxSendQueueBytes
    ) {
      this.terminate()
      callback?.(new Error('Backpressure limit exceeded'))
      return
    }
    // text-only server, disallow sending binary for now
    if (!isText) {
      callback?.(new Error('Binary frames are not supported by this server'))
      return
    }
    this.#socket.write(outFrame, callback)
  }

  ping(callback?: (error?: Error | null) => void) {
    if (this.readyState !== WebSocket.OPEN) {
      callback?.(new Error('WebSocket is not open'))
      return
    }
    const outFrame = frame(OPCODE.PING, Buffer.alloc(0))
    if (
      this.#socket.writableLength + outFrame.length >
      this.#maxSendQueueBytes
    ) {
      this.terminate()
      callback?.(new Error('Backpressure limit exceeded'))
      return
    }
    this.#socket.write(outFrame, callback)
  }

  close(code = 1000, reason = '') {
    if (this.readyState >= WebSocket.CLOSING) return
    if (!isValidCloseCode(code)) {
      code = 1000
      reason = ''
    }

    let reasonBuffer: Buffer<ArrayBufferLike> = Buffer.from(reason)
    if (reasonBuffer.length > 123) {
      reasonBuffer = utf8SafeSlice(reasonBuffer, 123)
    }

    this.readyState = WebSocket.CLOSING
    this.#closeSent = true
    this.#closeCode = code
    this.#closeReason = reasonBuffer.toString('utf8')

    const closePayload = Buffer.alloc(2 + reasonBuffer.length)
    closePayload.writeUInt16BE(code, 0)
    reasonBuffer.copy(closePayload, 2)
    this.#socket.end(frame(OPCODE.CLOSE, closePayload))
  }

  terminate() {
    this.readyState = WebSocket.CLOSED
    this.#socket.destroy()
  }

  _handleData(chunk: Buffer) {
    this.#buffer = Buffer.concat([this.#buffer, chunk])

    if (this.#buffer.length > this.#maxBufferBytes) {
      this.close(1009, 'Internal buffer overflow')
      return
    }

    const maxPayloadLimit =
      this.#maxPayload > 0 ? this.#maxPayload : DEFAULT_MAX_PAYLOAD

    // single-threaded parse, loop exits on partial frame
    parse_loop: while (true) {
      if (this.#buffer.length < 2) return

      const byte1 = this.#buffer[0]
      const byte2 = this.#buffer[1]
      const fin = (byte1 & 0x80) !== 0
      const rsv = byte1 & 0x70
      const opcode = (byte1 & 0x0f) as Opcode
      const masked = (byte2 & 0x80) !== 0
      let length = byte2 & 0x7f
      let offset = 2

      // We only accept uncompressed, non-RSV frames
      if (rsv !== 0) {
        this.close(1002, 'Reserved bits must be 0')
        return
      }

      if (!masked) {
        this.close(1002, 'Client frames must be masked')
        return
      }

      if (length === 126) {
        if (this.#buffer.length < 4) return
        length = this.#buffer.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        if (this.#buffer.length < 10) return
        const bigLength = this.#buffer.readBigUInt64BE(2)
        if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
          this.close(1009, 'Payload too large')
          return
        }
        if (bigLength > BigInt(maxPayloadLimit)) {
          this.close(1009, 'Payload too large')
          return
        }
        length = Number(bigLength)
        offset = 10
      }

      // Control frames must be <= 125 and may not be fragmented
      const isControl = opcode >= OPCODE.CLOSE
      if (isControl) {
        if (!fin || length > 125) {
          this.close(1002, 'Invalid control frame')
          return
        }
      } else {
        if (length > maxPayloadLimit) {
          this.close(1009, 'Payload too large')
          return
        }
      }

      const total = offset + 4 + length
      if (this.#buffer.length < total) return

      const mask = this.#buffer.subarray(offset, offset + 4)
      const payload = this.#buffer.subarray(offset + 4, total)
      for (let index = 0; index < payload.length; index++) {
        payload[index] ^= mask[index % 4]
      }

      // advance buffer
      this.#buffer = this.#buffer.subarray(total)

      switch (opcode) {
        // CONTINUATION
        case OPCODE.CONTINUATION: {
          if (this.#fragmentOpcode === 0) {
            this.close(1002, 'Continuation without start')
            return
          }

          // Stream-validate text if needed
          if (this.#textStreamActive && payload.length > 0) {
            try {
              this.#textStreamDecoder.decode(payload, { stream: true })
            } catch {
              this.close(1007, 'Invalid UTF-8 in continuation')
              return
            }
          }

          this.#fragmentChunks.push(payload)
          this.#fragmentTotal += payload.length
          if (
            this.#fragmentTotal > this.#maxPayload ||
            this.#fragmentTotal > this.#maxBufferBytes
          ) {
            this.close(1009, 'Fragmented message too large')
            return
          }

          if (!fin) {
            // Wait for more fragments
            if (this.#buffer.length > this.#maxBufferBytes) {
              this.close(1009, 'Internal buffer overflow')
              return
            }
            continue parse_loop
          }

          // Finalize fragmented message
          const full = Buffer.concat(this.#fragmentChunks, this.#fragmentTotal)
          const startedAsText = this.#fragmentOpcode === OPCODE.TEXT

          if (startedAsText) {
            // finalize decoder (flush)
            try {
              this.#textStreamDecoder.decode(new Uint8Array(0), {
                stream: false,
              })
            } catch {
              this.close(1007, 'Invalid UTF-8 at end of fragmented text')
              return
            }
            this.emit('message', full.toString('utf8'))
          } else {
            // We do not currently support binary, reject fragmented binary as well
            this.close(1003, 'Binary messages are not supported')
            return
          }

          // reset fragmentation state
          this.#fragmentOpcode = 0
          this.#fragmentChunks = []
          this.#fragmentTotal = 0
          this.#textStreamActive = false
          continue parse_loop
        }

        // TEXT
        case OPCODE.TEXT: {
          if (this.#fragmentOpcode !== 0) {
            // Cannot start new data while in fragmented message
            this.close(
              1002,
              'New data frame while fragmented message in progress'
            )
            return
          }

          if (!fin) {
            // Start of fragmented text message
            this.#fragmentOpcode = OPCODE.TEXT
            this.#fragmentChunks = []
            this.#fragmentTotal = 0
            this.#textStreamActive = true

            if (payload.length > 0) {
              try {
                this.#textStreamDecoder.decode(payload, { stream: true })
              } catch {
                this.close(1007, 'Invalid UTF-8 in text fragment')
                return
              }
            }

            this.#fragmentChunks.push(payload)
            this.#fragmentTotal += payload.length
            if (
              this.#fragmentTotal > this.#maxPayload ||
              this.#fragmentTotal > this.#maxBufferBytes
            ) {
              this.close(1009, 'Fragmented message too large')
              return
            }
            continue parse_loop
          }

          // Single-frame text message
          try {
            if (payload.length > 0) {
              statelessTextDecoder.decode(payload, { stream: false })
            }
          } catch {
            this.close(1007, 'Invalid UTF-8')
            return
          }
          this.emit('message', payload.toString('utf8'))
          continue parse_loop
        }

        // BINARY (not supported)
        case OPCODE.BINARY: {
          if (this.#fragmentOpcode !== 0) {
            this.close(
              1002,
              'New data frame while fragmented message in progress'
            )
            return
          }
          if (!fin) {
            // Disallow fragmented binary start as well
            this.close(1003, 'Binary messages are not supported')
            return
          }
          this.close(1003, 'Binary messages are not supported')
          return
        }

        // CLOSE
        case OPCODE.CLOSE: {
          const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1000
          const reasonBytes =
            payload.length > 2 ? payload.subarray(2) : undefined

          if (reasonBytes) {
            try {
              statelessTextDecoder.decode(reasonBytes, { stream: false })
            } catch {
              const buf = Buffer.alloc(2)
              buf.writeUInt16BE(1007, 0)
              this.#socket.end(frame(OPCODE.CLOSE, buf))
              return
            }
          }

          this.#closeCode = isValidCloseCode(code) ? code : 1002
          this.#closeReason = isValidCloseCode(code)
            ? reasonBytes?.toString('utf8')
            : undefined

          if (!this.#closeSent) {
            // echo valid close or respond with protocol error
            const responseCode = isValidCloseCode(code) ? code : 1002
            const responsePayload =
              isValidCloseCode(code) && reasonBytes
                ? (() => {
                    const buf = Buffer.alloc(2 + reasonBytes.length)
                    buf.writeUInt16BE(responseCode, 0)
                    reasonBytes.copy(buf, 2)
                    return buf
                  })()
                : (() => {
                    const buf = Buffer.alloc(2)
                    buf.writeUInt16BE(responseCode, 0)
                    return buf
                  })()
            this.#closeSent = true
            this.#socket.end(frame(OPCODE.CLOSE, responsePayload))
          } else {
            // We already sent a close; just end the socket
            this.#socket.end()
          }
          continue parse_loop
        }

        // PING
        case OPCODE.PING: {
          // Anti-abuse window
          const now = Date.now()
          if (now - this.#pingWindowStartMs > this.#pingWindowMs) {
            this.#pingWindowStartMs = now
            this.#pingsInWindow = 0
          }
          this.#pingsInWindow += 1
          if (this.#pingsInWindow > this.#maxPingsPerWindow) {
            this.close(1008, 'Too many pings')
            return
          }

          // Respond with PONG using the same payload
          this.#socket.write(frame(OPCODE.PONG, payload))
          this.emit('ping', payload)
          continue parse_loop
        }

        // PONG
        case OPCODE.PONG: {
          this.emit('pong', payload)
          continue parse_loop
        }

        // UNKNOWN / RESERVED
        default: {
          this.close(1002, 'Unsupported opcode')
          return
        }
      }
    }
  }
}

export class WebSocketServer extends EventEmitter {
  options: WebSocketServerOptions
  #server: ReturnType<typeof createServer>

  constructor(options: WebSocketServerOptions = {}) {
    super()
    this.options = options
    this.#server = createServer()

    // Tighten HTTP parser a bit, sane defaults for local dev
    this.#server.maxHeadersCount = 32
    this.#server.headersTimeout = 15_000
    this.#server.keepAliveTimeout = 5_000
    this.#server.requestTimeout = 0

    this.#server.on(
      'upgrade',
      (request: IncomingMessage, socket: Socket, head: Buffer) => {
        const hostHeaderRaw = readHeader(request, 'host')
        const hostHeader = hostHeaderRaw?.trim()

        if (
          !hostHeader ||
          hostHeader.length === 0 ||
          hostHeader.length > MAX_ALLOWED_HOST_LENGTH
        ) {
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
          socket.destroy()
          return
        }

        // Optional path check
        if (this.options.path) {
          try {
            const requestUrl = new URL(
              request.url ?? '/',
              `http://${hostHeader}`
            )
            const expectedPath = this.options.path.endsWith('/')
              ? this.options.path.slice(0, -1)
              : this.options.path
            const actualPath = requestUrl.pathname.endsWith('/')
              ? requestUrl.pathname.slice(0, -1)
              : requestUrl.pathname
            if (actualPath !== expectedPath) {
              socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
              socket.destroy()
              return
            }
          } catch {
            socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
            socket.destroy()
            return
          }
        }

        if (request.method !== 'GET') {
          socket.write('HTTP/1.1 405 Method Not Allowed\r\n\r\n')
          socket.destroy()
          return
        }

        const upgrade = readHeader(request, 'upgrade')
        const connection = readHeader(request, 'connection')
        const key = readHeader(request, 'sec-websocket-key')
        const version = readHeader(request, 'sec-websocket-version')
        const originHeaderValue = readHeader(request, 'origin')
        const originHeader = originHeaderValue?.trim()

        if (originHeader && originHeader.length > MAX_ALLOWED_ORIGIN_LENGTH) {
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
          socket.destroy()
          return
        }

        const normalizedOrigin = originHeader?.toLowerCase()
        const remoteAddress = socket.remoteAddress

        // Origin policy (default: loopback only; file:// allowed from loopback)
        let allowed = false
        if (this.options.allowedOrigins) {
          if (typeof this.options.allowedOrigins === 'function') {
            try {
              allowed = !!this.options.allowedOrigins(originHeader, request)
            } catch (error) {
              this.emit(
                'error',
                wrapCallbackError('allowedOrigins callback threw', error)
              )
              allowed = false
            }
          } else if (originHeader !== undefined) {
            allowed = this.options.allowedOrigins.has(originHeader)
          } else if (this.options.allowedOrigins.has('')) {
            allowed = true
          }
        } else {
          if (originHeader === undefined) {
            allowed = isLoopbackAddress(remoteAddress)
          } else if (
            normalizedOrigin === 'null' ||
            normalizedOrigin?.startsWith('file:')
          ) {
            allowed = isLoopbackAddress(remoteAddress)
          } else {
            try {
              const originUrl = new URL(originHeader)
              if (isSameOrigin(originHeader, hostHeader)) {
                allowed = true
              } else if (
                isLoopbackHostname(originUrl.hostname) &&
                isLoopbackAddress(remoteAddress)
              ) {
                allowed = true
              }
            } catch {
              allowed = false
            }
          }
        }

        if (!allowed) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
          socket.destroy()
          return
        }

        const connectionTokens = String(connection || '')
          .toLowerCase()
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)

        if (
          !isValidWebSocketKey(key) ||
          upgrade?.toLowerCase() !== 'websocket' ||
          !connectionTokens.includes('upgrade')
        ) {
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
          socket.destroy()
          return
        }

        if (version !== '13') {
          socket.write(
            'HTTP/1.1 426 Upgrade Required\r\nSec-WebSocket-Version: 13\r\n\r\n'
          )
          socket.destroy()
          return
        }

        if (this.options.verifyClient) {
          let verified = false
          try {
            verified = this.options.verifyClient(request)
          } catch (error) {
            this.emit(
              'error',
              wrapCallbackError('verifyClient callback threw', error)
            )
            verified = false
          }
          if (!verified) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
            socket.destroy()
            return
          }
        }

        const accept = createAcceptValue(key)
        const headers = [
          'HTTP/1.1 101 Switching Protocols',
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Accept: ${accept}`,
        ]

        if (this.options.handleProtocols) {
          const protocolHeaderRaw = readHeader(
            request,
            'sec-websocket-protocol'
          )
          if (protocolHeaderRaw && protocolHeaderRaw.length > 1024) {
            socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
            socket.destroy()
            return
          }
          const offered = new Set(
            (protocolHeaderRaw ?? '')
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean)
          )

          let selected: string | false | undefined
          try {
            selected = this.options.handleProtocols(offered)
          } catch (error) {
            this.emit(
              'error',
              wrapCallbackError('handleProtocols callback threw', error)
            )
            socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n')
            socket.destroy()
            return
          }

          if (selected === false) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
            socket.destroy()
            return
          }
          if (selected) {
            if (
              !offered.has(selected) ||
              !TOKEN.test(selected) ||
              selected.length > 128
            ) {
              socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
              socket.destroy()
              return
            }
            headers.push(`Sec-WebSocket-Protocol: ${selected}`)
          }
        }

        socket.setNoDelay(true)
        socket.setKeepAlive(true, 30_000)
        socket.write(headers.concat('\r\n').join('\r\n'))

        const webSocket = new WebSocket(socket, {
          maxPayload: this.options.maxPayload,
          maxPingsPerWindow: this.options.maxPingsPerWindow,
          pingWindowMs: this.options.pingWindowMs,
          maxSendQueueBytes: this.options.maxSendQueueBytes,
          maxBufferBytes: this.options.maxBufferBytes,
        })

        const idleTimeoutOption = this.options.idleTimeoutMs
        const idleTimeoutMs =
          typeof idleTimeoutOption === 'number' && idleTimeoutOption > 0
            ? Math.min(idleTimeoutOption, MAX_IDLE_TIMEOUT_MS)
            : DEFAULT_IDLE_TIMEOUT_MS
        socket.setTimeout(idleTimeoutMs)
        socket.on('timeout', () => {
          webSocket.terminate()
        })

        this.emit('connection', webSocket, request)

        // If Node gave us extra bytes from the upgrade, parse them safely
        if (head && head.length) {
          try {
            webSocket._handleData(head)
          } catch (error) {
            webSocket.terminate()
            this.emit(
              'error',
              wrapCallbackError('Error while handling upgrade head', error)
            )
          }
        }
      }
    )

    this.#server.on('listening', () => this.emit('listening'))
    this.#server.on('close', () => this.emit('close'))
    this.#server.on('error', (error) => this.emit('error', error))

    this.#server.listen(
      options.port ?? 0,
      options.host ?? '127.0.0.1',
      options.backlog
    )
  }

  address() {
    return this.#server.address()
  }

  close(callback?: (error?: Error) => void) {
    this.#server.close(callback)
  }
}
