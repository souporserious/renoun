import { expect, test } from 'vitest'

import { createMemoryOnlyCacheStore } from './Cache.ts'
import { runWithContext } from '../utils/operation-context.ts'

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })

  return {
    promise,
    resolve,
  }
}

test('serves stale entries while background refresh recomputes', async () => {
  const store = createMemoryOnlyCacheStore({
    staleRetentionTtlMs: 5_000,
  })
  const nodeKey = 'node:swr-background'
  let valueVersion = '1'
  let computeCount = 0

  await store.getOrCompute(nodeKey, { persist: false }, async (context) => {
    computeCount += 1
    await context.recordFileDep('index.ts')
    return `value:${valueVersion}`
  })

  valueVersion = '2'
  store.invalidateDependencyPath('index.ts')

  const refreshStarted = createDeferred()
  const refreshGate = createDeferred()
  const staleValue = await store.getOrCompute(
    nodeKey,
    {
      persist: false,
      staleWhileRevalidate: true,
    },
    async (context) => {
      computeCount += 1
      await context.recordFileDep('index.ts')
      refreshStarted.resolve()
      await refreshGate.promise
      return `value:${valueVersion}`
    }
  )

  expect(staleValue).toBe('value:1')
  await refreshStarted.promise
  expect(computeCount).toBe(2)

  const waitingRead = store.getOrCompute(
    nodeKey,
    { persist: false },
    async () => {
      computeCount += 1
      return 'unexpected'
    }
  )
  refreshGate.resolve()

  await expect(waitingRead).resolves.toBe('value:2')
  expect(await store.get<string>(nodeKey)).toBe('value:2')
  expect(computeCount).toBe(2)
})

test('skips stale reads after stale retention ttl expires', async () => {
  const store = createMemoryOnlyCacheStore({
    staleRetentionTtlMs: 5,
  })
  const nodeKey = 'node:swr-expired'
  let valueVersion = '1'
  let computeCount = 0

  await store.getOrCompute(nodeKey, { persist: false }, async (context) => {
    computeCount += 1
    await context.recordFileDep('index.ts')
    return `value:${valueVersion}`
  })

  valueVersion = '2'
  store.invalidateDependencyPath('index.ts')
  await new Promise((resolve) => setTimeout(resolve, 20))

  const refreshedValue = await store.getOrCompute(
    nodeKey,
    {
      persist: false,
      staleWhileRevalidate: true,
    },
    async (context) => {
      computeCount += 1
      await context.recordFileDep('index.ts')
      return `value:${valueVersion}`
    }
  )

  expect(refreshedValue).toBe('value:2')
  expect(computeCount).toBe(2)
})

test('refresh forces recompute even when a fresh entry exists', async () => {
  const store = createMemoryOnlyCacheStore({
    staleRetentionTtlMs: 1_000,
  })
  const nodeKey = 'node:swr-refresh'
  let valueVersion = '1'
  let computeCount = 0

  await store.getOrCompute(nodeKey, { persist: false }, async (context) => {
    computeCount += 1
    await context.recordFileDep('index.ts')
    return `value:${valueVersion}`
  })

  valueVersion = '2'
  const refreshedValue = await store.refresh(
    nodeKey,
    { persist: false },
    async (context) => {
      computeCount += 1
      await context.recordFileDep('index.ts')
      return `value:${valueVersion}`
    }
  )

  expect(refreshedValue).toBe('value:2')

  const cachedValue = await store.getOrCompute(
    nodeKey,
    { persist: false },
    async () => {
      computeCount += 1
      return 'unexpected'
    }
  )

  expect(cachedValue).toBe('value:2')
  expect(computeCount).toBe(2)
})

test('background swr refresh is detached from request abort context', async () => {
  const store = createMemoryOnlyCacheStore({
    staleRetentionTtlMs: 5_000,
  })
  const nodeKey = 'node:swr-background-detached-signal'
  let valueVersion = '1'
  let computeCount = 0

  await store.getOrCompute(nodeKey, { persist: false }, async (context) => {
    computeCount += 1
    await context.recordFileDep('index.ts')
    return `value:${valueVersion}`
  })

  valueVersion = '2'
  store.invalidateDependencyPath('index.ts')

  const refreshStarted = createDeferred()
  const refreshGate = createDeferred()
  const controller = new AbortController()

  const staleValue = await runWithContext({ signal: controller.signal }, () =>
    store.getOrCompute(
      nodeKey,
      {
        persist: false,
        staleWhileRevalidate: true,
      },
      async (context) => {
        computeCount += 1
        await context.recordFileDep('index.ts')
        refreshStarted.resolve()
        await refreshGate.promise
        return `value:${valueVersion}`
      }
    )
  )

  expect(staleValue).toBe('value:1')
  await refreshStarted.promise

  controller.abort()
  refreshGate.resolve()

  const freshValue = await store.getOrCompute(
    nodeKey,
    { persist: false },
    async () => {
      computeCount += 1
      return 'unexpected'
    }
  )

  expect(freshValue).toBe('value:2')
  expect(computeCount).toBe(2)
})
