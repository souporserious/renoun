import { describe, test, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { createConnection, type Socket as NetSocket } from 'node:net'

import { WebSocketServer } from './websocket'
import { TestWebSocket } from './test-websocket'

function createAsyncDisposeHandle(dispose: () => Promise<void>) {
  return {
    async [Symbol.asyncDispose]() {
      await dispose()
    },
  }
}

async function startServer(
  options: ConstructorParameters<typeof WebSocketServer>[0] = {}
) {
  const server = new WebSocketServer(options)
  await new Promise<void>((resolve) => {
    if (server.address()) return resolve()
    server.once('listening', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('No address')
  }
  return { server: server, port: address.port }
}

async function stopServer(server: WebSocketServer) {
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

async function withServer<Type>(
  options: ConstructorParameters<typeof WebSocketServer>[0],
  fn: (context: { server: WebSocketServer; port: number }) => Promise<Type>
) {
  const { server, port } = await startServer(options)
  await using _server = createAsyncDisposeHandle(async () => {
    await stopServer(server)
  })
  return await fn({ server, port })
}

async function connectClient(port: number) {
  const client = new TestWebSocket(`ws://127.0.0.1:${port}`)

  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      client.removeEventListener('open', onOpen)
      client.removeEventListener('error', onError)
      resolve()
    }
    const onError = (error: Event) => {
      client.removeEventListener('open', onOpen)
      client.removeEventListener('error', onError)
      reject(error)
    }

    client.addEventListener('open', onOpen)
    client.addEventListener('error', onError)
  })

  return client
}

async function closeClient(client: TestWebSocket) {
  if (client.readyState === TestWebSocket.CLOSED) {
    return
  }

  await new Promise<void>((resolve) => {
    const onClose = () => {
      client.removeEventListener('close', onClose)
      client.removeEventListener('error', onError)
      resolve()
    }
    const onError = () => {
      client.removeEventListener('close', onClose)
      client.removeEventListener('error', onError)
      resolve()
    }

    client.addEventListener('close', onClose)
    client.addEventListener('error', onError)

    if (client.readyState === TestWebSocket.CONNECTING) {
      client.addEventListener(
        'open',
        () => {
          try {
            client.close()
          } catch {}
        },
        { once: true }
      )
      return
    }

    try {
      client.close()
    } catch {
      resolve()
    }
  })

  await new Promise((resolve) => setTimeout(resolve, 0))
}


function makeMaskedClientFrame(
  opcode: number,
  payload: Buffer = Buffer.alloc(0),
  options: { fin?: boolean } = {}
) {
  const fin = options.fin ?? true
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

  header[0] = (fin ? 0x80 : 0) | opcode
  header[1] |= 0x80

  const mask = randomBytes(4)
  const maskedPayload = Buffer.from(payload)
  for (let index = 0; index < maskedPayload.length; index++) {
    maskedPayload[index] ^= mask[index % 4]
  }

  return Buffer.concat([header, mask, maskedPayload])
}

async function readHttpResponseHead(socket: NetSocket) {
  let buffer = Buffer.alloc(0)

  while (!buffer.includes(Buffer.from('\r\n\r\n'))) {
    const [chunk] = (await once(socket, 'data')) as [Buffer]
    buffer = Buffer.concat([buffer, chunk])
  }

  return buffer.toString('latin1')
}

async function connectRawClient(
  port: number,
  key = randomBytes(16).toString('base64')
) {
  const socket = createConnection({ host: '127.0.0.1', port })
  await once(socket, 'connect')

  const request = [
    'GET / HTTP/1.1',
    `Host: 127.0.0.1:${port}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
    '',
    '',
  ].join('\r\n')

  socket.write(request)
  const responseHead = await readHttpResponseHead(socket)
  return { socket, responseHead }
}

async function closeRawClient(socket: NetSocket) {
  if (socket.destroyed) {
    return
  }

  await new Promise<void>((resolve) => {
    const onClose = () => {
      socket.removeListener('close', onClose)
      socket.removeListener('error', onError)
      resolve()
    }
    const onError = () => {
      socket.removeListener('close', onClose)
      socket.removeListener('error', onError)
      resolve()
    }

    socket.once('close', onClose)
    socket.once('error', onError)
    socket.destroy()
  })
}

describe('WebSocketServer', () => {
  test('accepts connection and receives text message', async () => {
    await withServer({}, async ({ server, port }) => {
      const messagePromise = new Promise<string>((resolve) => {
        server.once('connection', (ws: any) =>
          ws.once('message', (message: string) => resolve(message))
        )
      })
      const client = await connectClient(port)
      await using _client = createAsyncDisposeHandle(async () => {
        await closeClient(client)
      })

      client.send('hello')
      await expect(messagePromise).resolves.toBe('hello')
    })
  })

  test('receives large text message (potential fragmentation)', async () => {
    await withServer({}, async ({ server, port }) => {
      const big = 'a'.repeat(32 * 1024) // 32 KiB less than default max
      const messagePromise = new Promise<string>((resolve) => {
        server.once('connection', (ws: any) =>
          ws.once('message', (message: string) => resolve(message))
        )
      })
      const client = await connectClient(port)
      await using _client = createAsyncDisposeHandle(async () => {
        await closeClient(client)
      })

      client.send(big)
      await expect(messagePromise).resolves.toHaveLength(big.length)
    })
  })

  test('server ping emits pong event', async () => {
    await withServer({}, async ({ server, port }) => {
      const pongPromise = new Promise<Buffer>((resolve) => {
        server.once('connection', (ws: any) => {
          ws.once('pong', (payload: Buffer) => resolve(Buffer.from(payload)))
          // issue ping shortly after open
          setTimeout(() => ws.ping(), 25)
        })
      })
      const client = await connectClient(port)
      await using _client = createAsyncDisposeHandle(async () => {
        await closeClient(client)
      })

      await expect(pongPromise).resolves.toBeInstanceOf(Buffer)
    })
  })

  test('binary frame from client closes connection with 1003', async () => {
    await withServer({}, async ({ server, port }) => {
      const closePromise = new Promise<number | undefined>((resolve) => {
        server.once('connection', (ws: any) =>
          ws.once('close', (code: number) => resolve(code))
        )
      })
      const client = await connectClient(port)
      await using _client = createAsyncDisposeHandle(async () => {
        await closeClient(client)
      })

      client.send(new Uint8Array([1, 2, 3]))
      await expect(closePromise).resolves.toBe(1003)
    })
  })

  test('maxPayload enforcement (close 1009)', async () => {
    await withServer({ maxPayload: 5 }, async ({ server, port }) => {
      const closePromise = new Promise<number | undefined>((resolve) => {
        server.once('connection', (ws: any) =>
          ws.once('close', (code: number) => resolve(code))
        )
      })
      const client = await connectClient(port)
      await using _client = createAsyncDisposeHandle(async () => {
        await closeClient(client)
      })

      client.send('123456') // 6 > 5
      await expect(closePromise).resolves.toBe(1009)
    })
  })

  test('rejects malformed websocket key with trailing junk', async () => {
    await withServer({}, async ({ port }) => {
      const { socket, responseHead } = await connectRawClient(
        port,
        'AQIDBAUGBwgJCgsMDQ4PEA==junk'
      )
      await using _client = createAsyncDisposeHandle(async () => {
        await closeRawClient(socket)
      })

      expect(responseHead.startsWith('HTTP/1.1 400 Bad Request')).toBe(true)
    })
  })

  test('close frame with 1-byte payload is rejected with 1002', async () => {
    await withServer({}, async ({ server, port }) => {
      const closePromise = new Promise<number | undefined>((resolve) => {
        server.once('connection', (ws: any) =>
          ws.once('close', (code: number) => resolve(code))
        )
      })

      const { socket, responseHead } = await connectRawClient(port)
      await using _client = createAsyncDisposeHandle(async () => {
        await closeRawClient(socket)
      })

      expect(responseHead.startsWith('HTTP/1.1 101 Switching Protocols')).toBe(
        true
      )

      socket.write(makeMaskedClientFrame(0x8, Buffer.from([0x00])))
      await expect(closePromise).resolves.toBe(1002)
    })
  })

  test('close frame stops queued data frames from being emitted', async () => {
    await withServer({}, async ({ server, port }) => {
      const messages: string[] = []
      const closePromise = new Promise<number | undefined>((resolve) => {
        server.once('connection', (ws: any) => {
          ws.on('message', (message: string) => messages.push(message))
          ws.once('close', (code: number) => resolve(code))
        })
      })

      const { socket, responseHead } = await connectRawClient(port)
      await using _client = createAsyncDisposeHandle(async () => {
        await closeRawClient(socket)
      })

      expect(responseHead.startsWith('HTTP/1.1 101 Switching Protocols')).toBe(
        true
      )

      socket.write(
        Buffer.concat([
          makeMaskedClientFrame(0x8, Buffer.from([0x03, 0xe8])),
          makeMaskedClientFrame(0x1, Buffer.from('after-close')),
        ])
      )

      await expect(closePromise).resolves.toBe(1000)
      expect(messages).toEqual([])
    })
  })

  test('empty close frame is surfaced as 1005', async () => {
    await withServer({}, async ({ server, port }) => {
      const closePromise = new Promise<number | undefined>((resolve) => {
        server.once('connection', (ws: any) =>
          ws.once('close', (code: number) => resolve(code))
        )
      })

      const { socket, responseHead } = await connectRawClient(port)
      await using _client = createAsyncDisposeHandle(async () => {
        await closeRawClient(socket)
      })

      expect(responseHead.startsWith('HTTP/1.1 101 Switching Protocols')).toBe(
        true
      )

      socket.write(makeMaskedClientFrame(0x8))
      await expect(closePromise).resolves.toBe(1005)
    })
  })

})
