import { describe, expect, test } from 'vitest'

import { Semaphore } from './Semaphore.ts'

describe('Semaphore', () => {
  test('removes queued waiter when aborted', async () => {
    const semaphore = new Semaphore(1)
    const release = await semaphore.acquire()
    const controller = new AbortController()

    const blocked = semaphore.acquire({ signal: controller.signal })
    expect(semaphore.getQueueLength()).toBe(1)

    controller.abort()

    await expect(blocked).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(semaphore.getQueueLength()).toBe(0)

    release()
  })

  test('continues queue processing after an aborted waiter', async () => {
    const semaphore = new Semaphore(1)
    const release = await semaphore.acquire()

    const abortedController = new AbortController()
    const abortedWaiter = semaphore.acquire({
      signal: abortedController.signal,
    })
    const nextWaiter = semaphore.acquire()

    abortedController.abort()
    await expect(abortedWaiter).rejects.toMatchObject({
      name: 'AbortError',
    })

    release()
    const nextRelease = await nextWaiter
    expect(semaphore.getQueueLength()).toBe(0)
    nextRelease()
  })
})
