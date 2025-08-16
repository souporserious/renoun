import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'

import { WebSocketServer } from './server'
import { WebSocketClient } from './client'

describe('project WebSocket RPC', () => {
  let server: WebSocketServer
  let client: WebSocketClient
  let maxConcurrent = 0

  const randomHandler = vi.fn(() => Math.random())

  beforeAll(async () => {
    // Launch server on a random port and register methods
    server = new WebSocketServer({ port: 0 })
    await server.isReady()

    const port = await server.getPort()
    process.env.RENOUN_SERVER_PORT = port.toString()

    // Simple addition
    server.registerMethod(
      'add',
      ({ a, b }: { a: number; b: number }) => a + b,
      {
        memoize: false,
        concurrency: 0,
      }
    )

    // Memoised random handler
    server.registerMethod('random', randomHandler, { memoize: true })

    // Echo method for back-pressure stress test
    server.registerMethod('echo', ({ value }: { value: number }) => value, {
      memoize: false,
      concurrency: 0,
    })

    // Async generator that streams numbers 0..n-1
    server.registerMethod('count', async function* ({ n }: { n: number }) {
      for (let i = 0; i < n; i++) {
        yield i
        // small delay to simulate work
        await new Promise((r) => setTimeout(r, 1))
      }
    })

    // Stream that throws after a few chunks (for stream error delivery)
    server.registerMethod(
      'countThenThrow',
      async function* ({
        number,
        throwAt,
      }: {
        number: number
        throwAt: number
      }) {
        for (let index = 0; index < number; index++) {
          if (index === throwAt) {
            throw new Error('boom: stream failed intentionally')
          }
          yield index
          await new Promise((resolve) => setTimeout(resolve, 1))
        }
      }
    )

    // Method that deliberately fails to test error propagation
    server.registerMethod('fail', () => {
      throw new Error('Intentional failure')
    })

    // Slow method to test concurrency limits and timeouts
    let currentConcurrent = 0
    server.registerMethod(
      'slow',
      async ({ delay }: { delay: number }) => {
        currentConcurrent++
        if (currentConcurrent > maxConcurrent) maxConcurrent = currentConcurrent
        await new Promise((resolve) => setTimeout(resolve, delay))
        currentConcurrent--
        return delay
      },
      { concurrency: 2 }
    )

    // TTL memoised method
    let ttlCalls = 0
    server.registerMethod(
      'ttl',
      () => {
        ttlCalls++
        return Math.random()
      },
      { memoize: { ttlMs: 50, maxEntries: 10 } }
    )

    // Serial (concurrency = 1) method
    server.registerMethod(
      'serial',
      async ({ delay }: { delay: number }) => {
        await new Promise((r) => setTimeout(r, delay))
        return delay
      },
      { concurrency: 1 }
    )

    // Unlimited concurrency method (explicit 0)
    server.registerMethod(
      'unlimited',
      async ({ delay }: { delay: number }) => {
        await new Promise((r) => setTimeout(r, delay))
        return delay
      },
      { concurrency: 0 }
    )

    // Start client
    client = new WebSocketClient()
    // Give the client a moment to connect
    await new Promise((r) => setTimeout(r, 300))
  }, 10_000)

  afterAll(() => {
    server.cleanup()
  })

  it('performs a single RPC call', async () => {
    const sum = await client.callMethod<{ a: number; b: number }, number>(
      'add',
      {
        a: 2,
        b: 3,
      }
    )
    expect(sum).toBe(5)
  })

  it('memoises results when enabled', async () => {
    const first = await client.callMethod<{}, number>('random', {})
    const second = await client.callMethod<{}, number>('random', {})

    expect(first).toBe(second) // cached value should repeat
    expect(randomHandler).toHaveBeenCalledTimes(1)
  })

  it('handles batch requests', async () => {
    const results = await client.batch([
      { method: 'add', params: { a: 1, b: 0 } },
      { method: 'add', params: { a: 1, b: 1 } },
      { method: 'add', params: { a: 1, b: 2 } },
    ])
    expect(results.map((result) => (result.ok ? result.value : null))).toEqual([
      1, 2, 3,
    ])
  })

  it('streams results from an async generator', async () => {
    const n = 5
    const stream = client.callStream<{ n: number }, number>('count', { n })
    const collected: number[] = []

    for await (const value of stream) {
      collected.push(value)
    }

    expect(collected).toEqual([0, 1, 2, 3, 4])
  })

  it('delivers stream errors to the client and ends the stream', async () => {
    const n = 5
    const throwAt = 2
    const stream = client.callStream<
      { number: number; throwAt: number },
      number
    >('countThenThrow', { number: n, throwAt })

    const collected: number[] = []
    let streamError: any = null
    const once = new Promise<void>((resolve) => {
      client.once('streamError', (error) => {
        streamError = error
        resolve()
      })
    })

    for await (const value of stream) {
      collected.push(value)
    }
    await once

    expect(collected).toEqual([0, 1])
    expect(streamError?.error).toMatch(/boom: stream failed intentionally/)
  })

  it('handles thousands of small messages without stalling', async () => {
    const COUNT = 5000
    const calls = Array.from({ length: COUNT }, (_, i) =>
      client.callMethod<{ value: number }, number>('echo', { value: i })
    )
    const results = await Promise.all(calls)
    expect(results.length).toBe(COUNT)
    expect(results[0]).toBe(0)
    expect(results[COUNT - 1]).toBe(COUNT - 1)
  }, 30_000)

  it('rejects calls to unknown methods', async () => {
    await expect(client.callMethod('does_not_exist', {})).rejects.toThrow()
  })

  it('propagates server errors to the client', async () => {
    await expect(client.callMethod('fail', {})).rejects.toThrow(
      /Intentional failure/
    )
  })

  it('enforces concurrency limits for registered methods', async () => {
    const calls = Array.from({ length: 5 }, () =>
      client.callMethod<{ delay: number }, number>('slow', { delay: 50 })
    )
    await Promise.all(calls)
    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it('times out long-running calls when a custom timeout is provided', async () => {
    await expect(
      client.callMethod<{ delay: number }, number>('slow', { delay: 1500 }, 1) // 1 second timeout
    ).rejects.toThrow(/timed out/i)
  })

  it('expires memoised results after TTL', async () => {
    const first = await client.callMethod<{}, number>('ttl', {})
    const second = await client.callMethod<{}, number>('ttl', {})
    expect(first).toBe(second)

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 60))

    const third = await client.callMethod<{}, number>('ttl', {})
    expect(third).not.toBe(second)
  })

  it('manually invalidates cache via server.invalidateCache', async () => {
    const beforeClear = await client.callMethod<{}, number>('ttl', {})
    server.invalidateCache('ttl')

    const afterClear = await client.callMethod<{}, number>('ttl', {})
    expect(afterClear).not.toBe(beforeClear)
  })

  it('processes mixed-success batch requests with correct error propagation', async () => {
    const results = await client.batch([
      { method: 'add', params: { a: 1, b: 1 } },
      { method: 'fail', params: {} },
      { method: 'add', params: { a: 1, b: 2 } },
    ])
    expect(results[0]!.ok).toBe(true)
    expect(results[0]!.ok && (results[0] as any).value).toBe(2)
    expect(results[1]!.ok).toBe(false)
    expect(
      String((results[1] as any)?.error?.message ?? (results[1] as any)?.error)
    ).toMatch(/Intentional failure/)
    expect(results[2]?.ok).toBe(true)
    expect(results[2]?.ok && (results[2] as any).value).toBe(3)
  })

  it('handles large batch sizes efficiently', async () => {
    const SIZE = 1200
    const batch = Array.from({ length: SIZE }, (_, index) => ({
      method: 'add',
      params: { a: index, b: index },
    }))
    const results = await client.batch(batch)

    expect(results.length).toBe(SIZE)
    expect(results[0]?.ok && results[0].value).toBe(0)

    const last = results.at(-1)!
    expect(last.ok && last.value).toBe(SIZE - 1 + SIZE - 1)
  })

  it('fails an entire batch quickly when any item times out', async () => {
    const start = performance.now()
    const results = await client.batch(
      [
        { method: 'slow', params: { delay: 2000 } },
        { method: 'slow', params: { delay: 2000 } },
        { method: 'slow', params: { delay: 2000 } },
      ],
      20
    )
    expect(results.every((result) => !result.ok)).toBe(true)
    expect(
      results.some((result) =>
        String(result.ok ? result.value : result.error.message).match(
          /timed out/i
        )
      )
    ).toBe(true)

    const elapsed = performance.now() - start
    // Should fail fast well under the per-call 2s delays
    expect(elapsed).toBeLessThan(500)
  })

  let serialDuration: number
  it('serialises execution when concurrency = 1', async () => {
    const start = performance.now()

    await Promise.all(
      Array.from({ length: 3 }, () =>
        client.callMethod<{ delay: number }, number>('serial', { delay: 40 })
      )
    )

    serialDuration = performance.now() - start
    expect(serialDuration).toBeGreaterThanOrEqual(80) // at least two delays queued
  })

  it('allows parallel execution when concurrency = 0 (unlimited)', async () => {
    const start = performance.now()

    await Promise.all(
      Array.from({ length: 3 }, () =>
        client.callMethod<{ delay: number }, number>('unlimited', { delay: 40 })
      )
    )

    const duration = performance.now() - start
    expect(duration).toBeLessThan(serialDuration)
  })

  it('reconnects after server restart and flushes pending requests', async () => {
    // Shut down existing server
    server.cleanup()

    const reusePort = parseInt(process.env.RENOUN_SERVER_PORT!)

    // Give the socket a moment to free the port entirely
    await new Promise((resolve) => setTimeout(resolve, 300))

    server = new WebSocketServer({ port: reusePort })

    await server.isReady()

    // Re-register simple method on the fresh server
    server.registerMethod('add2', ({ x }: { x: number }) => x + 1)

    // Wait for client to auto-reconnect (retry interval 5s by default)
    await new Promise((resolve) => setTimeout(resolve, 5500))

    const result = await client.callMethod<{ x: number }, number>('add2', {
      x: 5,
    })
    expect(result).toBe(6)
  }, 20_000)
})
