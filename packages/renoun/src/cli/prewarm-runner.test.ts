import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test, vi } from 'vitest'

type Deferred<Value> = {
  promise: Promise<Value>
  resolve: (value: Value) => void
}

function createDeferred<Value>(): Deferred<Value> {
  let resolvePromise!: (value: Value) => void
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve: resolvePromise,
  }
}

afterEach(() => {
  vi.doUnmock('./prewarm.ts')
  vi.resetModules()
  vi.clearAllMocks()
})

describe('resolvePrewarmWorkerEntryFilePath', () => {
  test('falls back to the TypeScript worker in source mode', async () => {
    const { resolvePrewarmWorkerEntryFilePath } = await import(
      './prewarm-runner.ts'
    )
    const resolvedWorkerPath = resolvePrewarmWorkerEntryFilePath()
    const jsWorkerPath = fileURLToPath(
      new URL('./prewarm.worker.js', import.meta.url)
    )
    const tsWorkerPath = fileURLToPath(
      new URL('./prewarm.worker.ts', import.meta.url)
    )

    expect(existsSync(tsWorkerPath)).toBe(true)
    expect(resolvedWorkerPath).toBeDefined()

    if (!existsSync(jsWorkerPath)) {
      expect(resolvedWorkerPath).toBe(tsWorkerPath)
    }
  })
})

describe('runPrewarmSafely', () => {
  test('processes queued distinct requests in FIFO order', async () => {
    const calls: string[] = []
    const pendingCalls: Array<Deferred<void>> = []
    const prewarmMock = vi.fn(
      (options?: { projectOptions?: { tsConfigFilePath?: string } }) => {
        calls.push(options?.projectOptions?.tsConfigFilePath ?? 'default')
        const deferred = createDeferred<void>()
        pendingCalls.push(deferred)
        return deferred.promise
      }
    )

    vi.doMock('./prewarm.ts', () => ({
      prewarmRenounRpcServerCache: prewarmMock,
    }))

    const { runPrewarmSafely } = await import('./prewarm-runner.ts')

    runPrewarmSafely({ projectOptions: { tsConfigFilePath: 'a.json' } })
    runPrewarmSafely({ projectOptions: { tsConfigFilePath: 'b.json' } })
    runPrewarmSafely({ projectOptions: { tsConfigFilePath: 'c.json' } })

    await vi.waitFor(() => {
      expect(prewarmMock).toHaveBeenCalledTimes(1)
    })
    expect(calls).toEqual(['a.json'])

    pendingCalls.shift()!.resolve()
    await vi.waitFor(() => {
      expect(prewarmMock).toHaveBeenCalledTimes(2)
    })
    expect(calls).toEqual(['a.json', 'b.json'])

    pendingCalls.shift()!.resolve()
    await vi.waitFor(() => {
      expect(prewarmMock).toHaveBeenCalledTimes(3)
    })
    expect(calls).toEqual(['a.json', 'b.json', 'c.json'])

    pendingCalls.shift()!.resolve()
    await Promise.resolve()
  })

  test('dedupes queued requests that share the same signature', async () => {
    const calls: string[] = []
    const pendingCalls: Array<Deferred<void>> = []
    const prewarmMock = vi.fn(
      (options?: { projectOptions?: { tsConfigFilePath?: string } }) => {
        calls.push(options?.projectOptions?.tsConfigFilePath ?? 'default')
        const deferred = createDeferred<void>()
        pendingCalls.push(deferred)
        return deferred.promise
      }
    )

    vi.doMock('./prewarm.ts', () => ({
      prewarmRenounRpcServerCache: prewarmMock,
    }))

    const { runPrewarmSafely } = await import('./prewarm-runner.ts')

    runPrewarmSafely({ projectOptions: { tsConfigFilePath: 'a.json' } })
    runPrewarmSafely({ projectOptions: { tsConfigFilePath: 'b.json' } })
    runPrewarmSafely({ projectOptions: { tsConfigFilePath: 'b.json' } })
    runPrewarmSafely({ projectOptions: { tsConfigFilePath: 'c.json' } })
    runPrewarmSafely({ projectOptions: { tsConfigFilePath: 'c.json' } })

    await vi.waitFor(() => {
      expect(prewarmMock).toHaveBeenCalledTimes(1)
    })
    expect(calls).toEqual(['a.json'])

    pendingCalls.shift()!.resolve()
    await vi.waitFor(() => {
      expect(prewarmMock).toHaveBeenCalledTimes(2)
    })
    expect(calls).toEqual(['a.json', 'b.json'])

    pendingCalls.shift()!.resolve()
    await vi.waitFor(() => {
      expect(prewarmMock).toHaveBeenCalledTimes(3)
    })
    expect(calls).toEqual(['a.json', 'b.json', 'c.json'])

    pendingCalls.shift()!.resolve()
    await Promise.resolve()
  })
})
