import { describe, expect, test, vi } from 'vitest'

import {
  createQueuedPostBuildRunner,
  handleTypeScriptWatchOutput,
  POST_BUILD_LOG_MESSAGE,
  TSC_WATCH_READY_MESSAGE,
} from './dev.ts'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

describe('dev watch script', () => {
  test('runs post-build patches when tsc reports a successful watch rebuild', async () => {
    const writeOutput = vi.fn()
    const log = vi.fn()
    const runPostBuildScripts = vi.fn(async () => undefined)
    const output = `Found 0 errors. ${TSC_WATCH_READY_MESSAGE}`

    await expect(
      handleTypeScriptWatchOutput(output, {
        writeOutput,
        log,
        runPostBuildScripts,
      })
    ).resolves.toBe(true)

    expect(writeOutput).toHaveBeenCalledWith(output)
    expect(log).toHaveBeenCalledWith(POST_BUILD_LOG_MESSAGE)
    expect(runPostBuildScripts).toHaveBeenCalledTimes(1)
  })

  test('skips post-build patches for non-ready tsc output', async () => {
    const runPostBuildScripts = vi.fn(async () => undefined)

    await expect(
      handleTypeScriptWatchOutput('Starting compilation in watch mode...', {
        runPostBuildScripts,
      })
    ).resolves.toBe(false)

    expect(runPostBuildScripts).not.toHaveBeenCalled()
  })

  test('serializes repeated post-build patch runs', async () => {
    const firstRun = createDeferred<void>()
    const runPostBuildScripts = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => firstRun.promise)
      .mockResolvedValueOnce(undefined)
    const queuePostBuildRun =
      createQueuedPostBuildRunner(runPostBuildScripts)

    const firstPromise = queuePostBuildRun()
    const secondPromise = queuePostBuildRun()
    await Promise.resolve()

    expect(runPostBuildScripts).toHaveBeenCalledTimes(1)

    firstRun.resolve()
    await firstPromise
    await secondPromise

    expect(runPostBuildScripts).toHaveBeenCalledTimes(2)
  })
})
