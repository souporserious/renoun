import { describe, test, expect } from 'vitest'

import { WebSocketServer } from './websocket'

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
  try {
    return await fn({ server, port })
  } finally {
    await stopServer(server)
  }
}

describe('WebSocketServer', () => {
  test('accepts connection and receives text message', async () => {
    await withServer({}, async ({ server, port }) => {
      const messagePromise = new Promise<string>((resolve) => {
        server.once('connection', (ws: any) =>
          ws.once('message', (message: string) => resolve(message))
        )
      })
      const client = new WebSocket(`ws://127.0.0.1:${port}`)
      await new Promise<void>((resolve, reject) => {
        client.addEventListener('open', () => resolve())
        client.addEventListener('error', (error) => reject(error))
      })
      client.send('hello')
      await expect(messagePromise).resolves.toBe('hello')
      client.close()
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
      const client = new WebSocket(`ws://127.0.0.1:${port}`)
      await new Promise<void>((resolve, reject) => {
        client.addEventListener('open', () => resolve())
        client.addEventListener('error', reject)
      })
      client.send(big)
      await expect(messagePromise).resolves.toHaveLength(big.length)
      client.close()
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
      const client = new WebSocket(`ws://127.0.0.1:${port}`)
      await new Promise<void>((resolve, reject) => {
        client.addEventListener('open', () => resolve())
        client.addEventListener('error', reject)
      })
      await expect(pongPromise).resolves.toBeInstanceOf(Buffer)
      client.close()
    })
  })

  test('binary frame from client closes connection with 1003', async () => {
    await withServer({}, async ({ server, port }) => {
      const closePromise = new Promise<number | undefined>((resolve) => {
        server.once('connection', (ws: any) =>
          ws.once('close', (code: number) => resolve(code))
        )
      })
      const client = new WebSocket(`ws://127.0.0.1:${port}`)
      await new Promise<void>((resolve, reject) => {
        client.addEventListener('open', () => resolve())
        client.addEventListener('error', reject)
      })
      client.send(new Uint8Array([1, 2, 3]))
      await expect(closePromise).resolves.toBe(1003)
      client.close()
    })
  })

  test('maxPayload enforcement (close 1009)', async () => {
    await withServer({ maxPayload: 5 }, async ({ server, port }) => {
      const closePromise = new Promise<number | undefined>((resolve) => {
        server.once('connection', (ws: any) =>
          ws.once('close', (code: number) => resolve(code))
        )
      })
      const client = new WebSocket(`ws://127.0.0.1:${port}`)
      await new Promise<void>((resolve, reject) => {
        client.addEventListener('open', () => resolve())
        client.addEventListener('error', reject)
      })
      client.send('123456') // 6 > 5
      await expect(closePromise).resolves.toBe(1009)
      client.close()
    })
  })
})
