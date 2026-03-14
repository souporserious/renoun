import { expect, test } from 'vitest'

import { createMemoryOnlyCacheStore } from './Cache.ts'

test('caller abort does not cancel shared in-flight cache computation', async () => {
  const store = createMemoryOnlyCacheStore()
  let computeCount = 0
  let resolveCompute: ((value: number) => void) | undefined

  const first = store.getOrCompute(
    'node:shared-compute',
    { persist: false },
    async () => {
      computeCount += 1
      return new Promise<number>((resolve) => {
        resolveCompute = resolve
      })
    }
  )

  const controller = new AbortController()
  const cancelledWaiter = store.getOrCompute(
    'node:shared-compute',
    { persist: false, signal: controller.signal },
    async () => {
      computeCount += 1
      return 2
    }
  )

  controller.abort()
  await expect(cancelledWaiter).rejects.toMatchObject({
    name: 'AbortError',
  })

  resolveCompute?.(1)
  await expect(first).resolves.toBe(1)

  const cached = await store.getOrCompute(
    'node:shared-compute',
    { persist: false },
    async () => {
      computeCount += 1
      return 3
    }
  )

  expect(cached).toBe(1)
  expect(computeCount).toBe(1)
})
