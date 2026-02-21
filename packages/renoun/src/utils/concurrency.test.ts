import { describe, expect, test } from 'vitest'

import {
  createConcurrentQueue,
  mapConcurrent,
  raceAbort,
} from './concurrency.ts'
import { delay } from './delay.ts'

describe('concurrency utilities', () => {
  test('mapConcurrent preserves ordering and respects concurrency', async () => {
    let running = 0
    let maxRunning = 0
    const items = [0, 1, 2, 3, 4, 5]

    const results = await mapConcurrent(
      items,
      { concurrency: 2 },
      async (item) => {
        running += 1
        maxRunning = Math.max(maxRunning, running)
        await delay(5)
        running -= 1
        return item * 2
      }
    )

    expect(results).toEqual([0, 2, 4, 6, 8, 10])
    expect(maxRunning).toBeLessThanOrEqual(2)
  })

  test('raceAbort rejects when the signal is aborted first', async () => {
    const controller = new AbortController()
    const task = raceAbort(delay(50).then(() => 'done'), controller.signal)

    controller.abort()

    await expect(task).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  test('createConcurrentQueue caps concurrent tasks', async () => {
    const queue = createConcurrentQueue(2)
    let running = 0
    let maxRunning = 0

    await Promise.all(
      Array.from({ length: 6 }, () =>
        queue.run(async () => {
          running += 1
          maxRunning = Math.max(maxRunning, running)
          await delay(5)
          running -= 1
        })
      )
    )

    expect(maxRunning).toBeLessThanOrEqual(2)
    expect(queue.getQueueLength()).toBe(0)
    expect(queue.getRunningCount()).toBe(0)
  })
})
