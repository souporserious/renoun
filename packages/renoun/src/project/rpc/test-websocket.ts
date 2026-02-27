import { createHash, randomBytes } from 'node:crypto'
import { createConnection, type Socket } from 'node:net'

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

class MessageEventLike extends Event {
  readonly data: string

  constructor(data: string) {
    super('message')
    this.data = data
  }
}

class CloseEventLike extends Event {
  readonly code: number
  readonly reason: string

  constructor(code: number, reason = '') {
    super('close')
    this.code = code
    this.reason = reason
  }
}

class ErrorEventLike extends Event {
  readonly error: unknown

  constructor(error: unknown) {
    super('error')
    this.error = error
  }
}

function createMaskedFrame(opcode: number, payload: Buffer): Buffer {
  const payloadLength = payload.length
  let headerLength = 2

  if (payloadLength >= 126 && payloadLength < 65536) {
    headerLength += 2
  } else if (payloadLength >= 65536) {
    headerLength += 8
  }

  const frame = Buffer.alloc(headerLength + 4 + payloadLength)
  let offset = 0

  frame[offset++] = 0x80 | opcode

  if (payloadLength < 126) {
    frame[offset++] = 0x80 | payloadLength
  } else if (payloadLength < 65536) {
    frame[offset++] = 0x80 | 126
    frame.writeUInt16BE(payloadLength, offset)
    offset += 2
  } else {
    frame[offset++] = 0x80 | 127
    frame.writeBigUInt64BE(BigInt(payloadLength), offset)
    offset += 8
  }

  const maskKey = randomBytes(4)
  maskKey.copy(frame, offset)
  offset += 4

  for (let index = 0; index < payloadLength; index++) {
    frame[offset + index] = payload[index]! ^ maskKey[index % 4]!
  }

  return frame
}

export class TestWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly CONNECTING = TestWebSocket.CONNECTING
  readonly OPEN = TestWebSocket.OPEN
  readonly CLOSING = TestWebSocket.CLOSING
  readonly CLOSED = TestWebSocket.CLOSED

  binaryType: BinaryType = 'arraybuffer'
  bufferedAmount = 0
  readyState = TestWebSocket.CONNECTING

  #socket?: Socket
  #receiveBuffer = Buffer.alloc(0)
  #handshakeBuffer = Buffer.alloc(0)
  #handshakeComplete = false
  #expectedAccept: string
  #closeCode = 1000
  #closeReason = ''

  constructor(url: string, protocol?: string) {
    super()

    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'ws:') {
      throw new Error('[renoun] TestWebSocket only supports ws:// URLs')
    }

    const host = parsedUrl.hostname || '127.0.0.1'
    const port = parsedUrl.port ? Number(parsedUrl.port) : 80
    const path = `${parsedUrl.pathname || '/'}${parsedUrl.search || ''}`
    const key = randomBytes(16).toString('base64')
    this.#expectedAccept = createHash('sha1')
      .update(key + WS_GUID)
      .digest('base64')

    const socket = createConnection({ host, port })
    this.#socket = socket

    socket.on('connect', () => {
      const headers = [
        `GET ${path || '/'} HTTP/1.1`,
        `Host: ${host}${parsedUrl.port ? `:${port}` : ''}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
      ]

      if (protocol) {
        headers.push(`Sec-WebSocket-Protocol: ${protocol}`)
      }

      socket.write(`${headers.join('\r\n')}\r\n\r\n`)
    })

    socket.on('data', (data) => {
      this.#handleData(Buffer.isBuffer(data) ? data : Buffer.from(data))
    })

    socket.on('error', (error) => {
      this.dispatchEvent(new ErrorEventLike(error))
    })

    socket.on('close', () => {
      this.readyState = TestWebSocket.CLOSED
      this.dispatchEvent(new CloseEventLike(this.#closeCode, this.#closeReason))
    })
  }

  send(payload: string | Uint8Array | ArrayBuffer | Buffer) {
    if (this.readyState !== TestWebSocket.OPEN) {
      throw new Error('[renoun] Cannot send data while socket is not open')
    }

    const opcode = typeof payload === 'string' ? 0x1 : 0x2
    const body =
      typeof payload === 'string'
        ? Buffer.from(payload)
        : payload instanceof Buffer
          ? payload
          : payload instanceof ArrayBuffer
            ? Buffer.from(payload)
            : Buffer.from(payload)

    const frame = createMaskedFrame(opcode, body)
    this.bufferedAmount += frame.length

    this.#socket?.write(frame, () => {
      this.bufferedAmount = Math.max(0, this.bufferedAmount - frame.length)
    })
  }

  close(code = 1000, reason = '') {
    if (
      this.readyState === TestWebSocket.CLOSING ||
      this.readyState === TestWebSocket.CLOSED
    ) {
      return
    }

    this.readyState = TestWebSocket.CLOSING
    this.#closeCode = code
    this.#closeReason = reason

    const reasonBuffer = Buffer.from(reason)
    const payload = Buffer.alloc(2 + reasonBuffer.length)
    payload.writeUInt16BE(code, 0)
    reasonBuffer.copy(payload, 2)

    const frame = createMaskedFrame(0x8, payload)
    this.#socket?.write(frame, () => {
      this.#socket?.end()
    })
  }

  #handleData(chunk: Buffer) {
    if (!this.#handshakeComplete) {
      this.#handshakeBuffer = Buffer.concat([this.#handshakeBuffer, chunk])
      const headerEnd = this.#handshakeBuffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) {
        return
      }

      const rawHeaders = this.#handshakeBuffer
        .subarray(0, headerEnd)
        .toString('utf8')
      const [statusLine, ...headerLines] = rawHeaders.split('\r\n')

      if (!statusLine?.includes('101')) {
        throw new Error('[renoun] Test WebSocket handshake failed')
      }

      const acceptHeader = headerLines.find((line) =>
        line.toLowerCase().startsWith('sec-websocket-accept:')
      )
      const acceptValue = acceptHeader?.split(':')[1]?.trim()
      if (acceptValue !== this.#expectedAccept) {
        throw new Error('[renoun] Invalid Sec-WebSocket-Accept in handshake')
      }

      this.#handshakeComplete = true
      this.readyState = TestWebSocket.OPEN
      this.dispatchEvent(new Event('open'))

      const remainder = this.#handshakeBuffer.subarray(headerEnd + 4)
      this.#handshakeBuffer = Buffer.alloc(0)
      if (remainder.length > 0) {
        this.#parseFrames(remainder)
      }
      return
    }

    this.#parseFrames(chunk)
  }

  #parseFrames(chunk: Buffer) {
    this.#receiveBuffer = Buffer.concat([this.#receiveBuffer, chunk])

    while (this.#receiveBuffer.length >= 2) {
      const firstByte = this.#receiveBuffer[0]!
      const secondByte = this.#receiveBuffer[1]!
      const fin = (firstByte & 0x80) !== 0
      const opcode = firstByte & 0x0f
      const isMasked = (secondByte & 0x80) !== 0

      let offset = 2
      let payloadLength = secondByte & 0x7f

      if (payloadLength === 126) {
        if (this.#receiveBuffer.length < 4) {
          return
        }
        payloadLength = this.#receiveBuffer.readUInt16BE(2)
        offset = 4
      } else if (payloadLength === 127) {
        if (this.#receiveBuffer.length < 10) {
          return
        }
        const bigLength = this.#receiveBuffer.readBigUInt64BE(2)
        if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error('[renoun] Frame too large for test websocket client')
        }
        payloadLength = Number(bigLength)
        offset = 10
      }

      const maskLength = isMasked ? 4 : 0
      const frameLength = offset + maskLength + payloadLength
      if (this.#receiveBuffer.length < frameLength) {
        return
      }

      const mask = isMasked
        ? this.#receiveBuffer.subarray(offset, offset + 4)
        : undefined
      offset += maskLength

      let payload = this.#receiveBuffer.subarray(offset, offset + payloadLength)
      if (mask) {
        payload = Buffer.from(payload)
        for (let index = 0; index < payload.length; index++) {
          payload[index] = payload[index]! ^ mask[index % 4]!
        }
      }

      this.#receiveBuffer = this.#receiveBuffer.subarray(frameLength)

      if (!fin) {
        this.close(1002, 'Fragmented frames are not supported in tests')
        return
      }

      if (opcode === 0x1) {
        this.dispatchEvent(new MessageEventLike(payload.toString('utf8')))
        continue
      }

      if (opcode === 0x8) {
        if (payload.length >= 2) {
          this.#closeCode = payload.readUInt16BE(0)
          this.#closeReason =
            payload.length > 2 ? payload.subarray(2).toString('utf8') : ''
        }
        this.readyState = TestWebSocket.CLOSING
        this.#socket?.end()
        return
      }

      if (opcode === 0x9) {
        const pongFrame = createMaskedFrame(0xA, payload)
        this.#socket?.write(pongFrame)
        continue
      }
    }
  }
}
