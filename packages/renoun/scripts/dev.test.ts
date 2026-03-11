import { describe, expect, test, vi } from 'vitest'

import {
  createQueuedPatchLoadPackageRunner,
  handleTypeScriptWatchOutput,
  PATCH_LOAD_PACKAGE_LOG_MESSAGE,
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
  test('runs the load-package patch when tsc reports a successful watch rebuild', async () => {
    const writeOutput = vi.fn()
    const log = vi.fn()
    const patchLoadPackage = vi.fn(async () => undefined)
    const output = `Found 0 errors. ${TSC_WATCH_READY_MESSAGE}`

    await expect(
      handleTypeScriptWatchOutput(output, {
        writeOutput,
        log,
        patchLoadPackage,
      })
    ).resolves.toBe(true)

    expect(writeOutput).toHaveBeenCalledWith(output)
    expect(log).toHaveBeenCalledWith(PATCH_LOAD_PACKAGE_LOG_MESSAGE)
    expect(patchLoadPackage).toHaveBeenCalledTimes(1)
  })

  test('skips the load-package patch for non-ready tsc output', async () => {
    const patchLoadPackage = vi.fn(async () => undefined)

    await expect(
      handleTypeScriptWatchOutput('Starting compilation in watch mode...', {
        patchLoadPackage,
      })
    ).resolves.toBe(false)

    expect(patchLoadPackage).not.toHaveBeenCalled()
  })

  test('serializes repeated load-package patch runs', async () => {
    const firstRun = createDeferred<void>()
    const patchLoadPackage = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => firstRun.promise)
      .mockResolvedValueOnce(undefined)
    const queuePatchLoadPackageRun =
      createQueuedPatchLoadPackageRunner(patchLoadPackage)

    const firstPromise = queuePatchLoadPackageRun()
    const secondPromise = queuePatchLoadPackageRun()
    await Promise.resolve()

    expect(patchLoadPackage).toHaveBeenCalledTimes(1)

    firstRun.resolve()
    await firstPromise
    await secondPromise

    expect(patchLoadPackage).toHaveBeenCalledTimes(2)
  })
})
