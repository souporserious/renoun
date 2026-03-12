import { EventEmitter } from 'node:events'
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
  vi.useRealTimers()
  vi.doUnmock('./prewarm.ts')
  vi.doUnmock('../utils/env.ts')
  vi.doUnmock('node:child_process')
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

  test('skips the TypeScript worker when the current runtime cannot execute it', async () => {
    const { resolvePrewarmWorkerLaunchConfig } = await import(
      './prewarm-runner.ts'
    )

    const resolvedWorker = resolvePrewarmWorkerLaunchConfig({
      exists: (path) => path.endsWith('.ts'),
      processFeatures: {},
      execArgv: [],
    })

    expect(resolvedWorker).toBeUndefined()
  })

  test('reuses the current loader flags for a TypeScript worker when needed', async () => {
    const { resolvePrewarmWorkerLaunchConfig } = await import(
      './prewarm-runner.ts'
    )
    const tsWorkerPath = fileURLToPath(
      new URL('./prewarm.worker.ts', import.meta.url)
    )

    const resolvedWorker = resolvePrewarmWorkerLaunchConfig({
      exists: (path) => path.endsWith('.ts'),
      processFeatures: {},
      execArgv: ['--loader', 'tsx'],
    })

    expect(resolvedWorker).toEqual({
      entryFilePath: tsWorkerPath,
      execArgv: ['--loader', 'tsx'],
    })
  })
})

describe('runPrewarmSafely', () => {
  test('falls back to inline prewarm when the worker exits before completing', async () => {
    const spawnMock = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        killed: boolean
        kill: ReturnType<typeof vi.fn>
        unref: ReturnType<typeof vi.fn>
      }

      child.killed = false
      child.kill = vi.fn(() => {
        child.killed = true
      })
      child.unref = vi.fn()

      setTimeout(() => {
        child.emit('exit', 1, null)
      }, 0)

      return child
    })
    const prewarmMock = vi.fn(async () => undefined)

    vi.doMock('node:child_process', () => ({
      spawn: spawnMock,
    }))
    vi.doMock('../utils/env.ts', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../utils/env.ts')>()
      return {
        ...actual,
        isVitestRuntime: () => false,
      }
    })
    vi.doMock('./prewarm.ts', () => ({
      prewarmRenounRpcServerCache: prewarmMock,
    }))

    const { runPrewarmSafely } = await import('./prewarm-runner.ts')

    runPrewarmSafely({ analysisOptions: { tsConfigFilePath: 'node20.json' } })

    await vi.waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(1)
      expect(prewarmMock).toHaveBeenCalledTimes(1)
    })
  })

  test('falls back to inline prewarm after a worker timeout before continuing queued work', async () => {
    vi.useFakeTimers()

    try {
      const children: Array<
        EventEmitter & {
          killed: boolean
          kill: ReturnType<typeof vi.fn>
          unref: ReturnType<typeof vi.fn>
        }
      > = []
      const spawnMock = vi.fn(() => {
        const child = new EventEmitter() as EventEmitter & {
          killed: boolean
          kill: ReturnType<typeof vi.fn>
          unref: ReturnType<typeof vi.fn>
        }

        child.killed = false
        child.kill = vi.fn(() => {
          child.killed = true
          child.emit('exit', null, 'SIGKILL')
        })
        child.unref = vi.fn()
        children.push(child)

        return child
      })
      const firstInlineFallback = createDeferred<void>()
      const inlineCalls: string[] = []
      const prewarmMock = vi.fn(
        (options?: { analysisOptions?: { tsConfigFilePath?: string } }) => {
          inlineCalls.push(options?.analysisOptions?.tsConfigFilePath ?? 'default')

          if (inlineCalls.length === 1) {
            return firstInlineFallback.promise
          }

          return Promise.resolve()
        }
      )

      vi.doMock('node:child_process', () => ({
        spawn: spawnMock,
      }))
      vi.doMock('../utils/env.ts', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../utils/env.ts')>()
        return {
          ...actual,
          isVitestRuntime: () => false,
        }
      })
      vi.doMock('./prewarm.ts', () => ({
        prewarmRenounRpcServerCache: prewarmMock,
      }))

      const [{ runPrewarmSafely }, { PREWARM_REQUEST_TIMEOUT_MS }] =
        await Promise.all([
          import('./prewarm-runner.ts'),
          import('./prewarm/constants.ts'),
        ])

      runPrewarmSafely({ analysisOptions: { tsConfigFilePath: 'a.json' } })
      runPrewarmSafely({ analysisOptions: { tsConfigFilePath: 'b.json' } })

      await vi.waitFor(() => {
        expect(spawnMock).toHaveBeenCalledTimes(1)
      })

      await vi.advanceTimersByTimeAsync(PREWARM_REQUEST_TIMEOUT_MS)
      await vi.waitFor(() => {
        expect(children[0]?.kill).toHaveBeenCalledWith('SIGKILL')
        expect(prewarmMock).toHaveBeenCalledTimes(1)
      })

      expect(inlineCalls).toEqual(['a.json'])
      expect(spawnMock).toHaveBeenCalledTimes(1)

      firstInlineFallback.resolve()

      await vi.waitFor(() => {
        expect(spawnMock).toHaveBeenCalledTimes(2)
      })

      children[1]?.emit('exit', 0, null)
      await Promise.resolve()
    } finally {
      vi.useRealTimers()
    }
  })

  test('skips inline fallback when background prewarm disables it', async () => {
    const spawnMock = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        killed: boolean
        kill: ReturnType<typeof vi.fn>
        unref: ReturnType<typeof vi.fn>
      }

      child.killed = false
      child.kill = vi.fn(() => {
        child.killed = true
      })
      child.unref = vi.fn()

      setTimeout(() => {
        child.emit('exit', 1, null)
      }, 0)

      return child
    })
    const prewarmMock = vi.fn(async () => undefined)

    vi.doMock('node:child_process', () => ({
      spawn: spawnMock,
    }))
    vi.doMock('../utils/env.ts', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../utils/env.ts')>()
      return {
        ...actual,
        isVitestRuntime: () => false,
      }
    })
    vi.doMock('./prewarm.ts', () => ({
      prewarmRenounRpcServerCache: prewarmMock,
    }))

    const { runPrewarmSafely } = await import('./prewarm-runner.ts')

    runPrewarmSafely(
      { analysisOptions: { tsConfigFilePath: 'node20.json' } },
      { allowInlineFallback: false }
    )

    await vi.waitFor(() => {
      expect(spawnMock).toHaveBeenCalledTimes(1)
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(prewarmMock).not.toHaveBeenCalled()
  })

  test('keeps only the latest pending distinct request', async () => {
    const calls: string[] = []
    const pendingCalls: Array<Deferred<void>> = []
    const prewarmMock = vi.fn(
      (options?: { analysisOptions?: { tsConfigFilePath?: string } }) => {
        calls.push(options?.analysisOptions?.tsConfigFilePath ?? 'default')
        const deferred = createDeferred<void>()
        pendingCalls.push(deferred)
        return deferred.promise
      }
    )

    vi.doMock('./prewarm.ts', () => ({
      prewarmRenounRpcServerCache: prewarmMock,
    }))

    const { runPrewarmSafely } = await import('./prewarm-runner.ts')

    runPrewarmSafely({ analysisOptions: { tsConfigFilePath: 'a.json' } })
    runPrewarmSafely({ analysisOptions: { tsConfigFilePath: 'b.json' } })
    runPrewarmSafely({ analysisOptions: { tsConfigFilePath: 'c.json' } })

    await vi.waitFor(() => {
      expect(prewarmMock).toHaveBeenCalledTimes(1)
    })
    expect(calls).toEqual(['a.json'])

    pendingCalls.shift()!.resolve()
    await vi.waitFor(() => {
      expect(prewarmMock).toHaveBeenCalledTimes(2)
    })
    expect(calls).toEqual(['a.json', 'c.json'])

    pendingCalls.shift()!.resolve()
    await Promise.resolve()
  })

  test('dedupes queued requests that share the same signature', async () => {
    const calls: string[] = []
    const pendingCalls: Array<Deferred<void>> = []
    const prewarmMock = vi.fn(
      (options?: { analysisOptions?: { tsConfigFilePath?: string } }) => {
        calls.push(options?.analysisOptions?.tsConfigFilePath ?? 'default')
        const deferred = createDeferred<void>()
        pendingCalls.push(deferred)
        return deferred.promise
      }
    )

    vi.doMock('./prewarm.ts', () => ({
      prewarmRenounRpcServerCache: prewarmMock,
    }))

    const { runPrewarmSafely } = await import('./prewarm-runner.ts')

    runPrewarmSafely({ analysisOptions: { tsConfigFilePath: 'a.json' } })
    runPrewarmSafely({ analysisOptions: { tsConfigFilePath: 'b.json' } })
    runPrewarmSafely({ analysisOptions: { tsConfigFilePath: 'b.json' } })
    runPrewarmSafely({ analysisOptions: { tsConfigFilePath: 'c.json' } })
    runPrewarmSafely({ analysisOptions: { tsConfigFilePath: 'c.json' } })

    await vi.waitFor(() => {
      expect(prewarmMock).toHaveBeenCalledTimes(1)
    })
    expect(calls).toEqual(['a.json'])

    pendingCalls.shift()!.resolve()
    await vi.waitFor(() => {
      expect(prewarmMock).toHaveBeenCalledTimes(2)
    })
    expect(calls).toEqual(['a.json', 'c.json'])

    pendingCalls.shift()!.resolve()
    await Promise.resolve()
  })

  test('times out stalled prewarm requests and continues queued work', async () => {
    vi.useFakeTimers()

    try {
      const calls: string[] = []
      const pendingCalls: Array<Deferred<void>> = []
      const prewarmMock = vi.fn(
        (options?: { analysisOptions?: { tsConfigFilePath?: string } }) => {
          calls.push(options?.analysisOptions?.tsConfigFilePath ?? 'default')
          const deferred = createDeferred<void>()
          pendingCalls.push(deferred)
          return deferred.promise
        }
      )

      vi.doMock('./prewarm.ts', () => ({
        prewarmRenounRpcServerCache: prewarmMock,
      }))

      const [{ runPrewarmSafely }, { PREWARM_REQUEST_TIMEOUT_MS }] =
        await Promise.all([
          import('./prewarm-runner.ts'),
          import('./prewarm/constants.ts'),
        ])

      runPrewarmSafely({ analysisOptions: { tsConfigFilePath: 'a.json' } })
      runPrewarmSafely({ analysisOptions: { tsConfigFilePath: 'b.json' } })

      await vi.waitFor(() => {
        expect(prewarmMock).toHaveBeenCalledTimes(1)
      })
      expect(calls).toEqual(['a.json'])

      await vi.advanceTimersByTimeAsync(PREWARM_REQUEST_TIMEOUT_MS)
      await vi.waitFor(() => {
        expect(prewarmMock).toHaveBeenCalledTimes(2)
      })
      expect(calls).toEqual(['a.json', 'b.json'])

      for (const deferred of pendingCalls) {
        deferred.resolve()
      }
      await Promise.resolve()
    } finally {
      vi.useRealTimers()
    }
  })
})
