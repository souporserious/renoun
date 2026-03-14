import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { WebSocketClient } from './client.ts'

class CloseEventLike extends Event {
  readonly code: number
  readonly reason: string

  constructor(code: number, reason = '') {
    super('close')
    this.code = code
    this.reason = reason
  }
}

class MockWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static readonly instances: MockWebSocket[] = []

  readonly CONNECTING = MockWebSocket.CONNECTING
  readonly OPEN = MockWebSocket.OPEN
  readonly CLOSING = MockWebSocket.CLOSING
  readonly CLOSED = MockWebSocket.CLOSED

  binaryType: BinaryType = 'arraybuffer'
  bufferedAmount = 0
  readyState = MockWebSocket.CONNECTING
  readonly sentPayloads: string[] = []

  constructor(_url: string, _protocol?: string) {
    super()
    MockWebSocket.instances.push(this)
  }

  send(payload: string | Uint8Array | ArrayBuffer | Buffer) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('[renoun] Cannot send data while socket is not open')
    }

    this.sentPayloads.push(
      typeof payload === 'string' ? payload : Buffer.from(payload).toString('utf8')
    )
  }

  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED
    this.dispatchEvent(new CloseEventLike(code, reason))
  }

  dispatchOpen() {
    this.readyState = MockWebSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }
}

const previousWebSocket = globalThis.WebSocket
const previousServerPort = process.env.RENOUN_SERVER_PORT

beforeEach(() => {
  MockWebSocket.instances.length = 0
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
  process.env.RENOUN_SERVER_PORT = '4321'
})

afterEach(() => {
  globalThis.WebSocket = previousWebSocket

  if (previousServerPort === undefined) {
    delete process.env.RENOUN_SERVER_PORT
  } else {
    process.env.RENOUN_SERVER_PORT = previousServerPort
  }
})

describe('WebSocketClient stream queueing', () => {
  test('rejects stream consumers immediately when the offline pending queue is full', async () => {
    const client = new WebSocketClient('client-test-server', {
      port: '4321',
      host: '127.0.0.1',
    })

    try {
      const stream = client.callStream<{ value: string }, never>('overflow', {
        value: 'a'.repeat(8 * 1024 * 1024),
      })

      await expect(stream.next()).rejects.toThrow(
        '[renoun] Client offline and pending queue is full'
      )
    } finally {
      client.close()
    }
  })

  test('does not replay cancelled streams that never left the offline queue', async () => {
    const client = new WebSocketClient('client-test-server', {
      port: '4321',
      host: '127.0.0.1',
    })

    try {
      const stream = client.callStream<{ value: number }, number>('count', {
        value: 1,
      })
      const socket = MockWebSocket.instances[0]!

      await stream.return()
      socket.dispatchOpen()
      await Promise.resolve()

      expect(socket.sentPayloads).toEqual([])
    } finally {
      client.close()
    }
  })
})
