import { describe, test, expect } from 'vitest'

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
})
