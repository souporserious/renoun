import { describe, expect, test, vi } from 'vitest'

import {
  createAnalysisArtifactScheduler,
  type AnalysisArtifactRequest,
} from './artifact-scheduler.ts'

function createRequest(
  overrides?: Partial<AnalysisArtifactRequest>
): AnalysisArtifactRequest {
  return {
    key: 'artifact:key',
    kind: 'file.referenceBase',
    family: 'reference-render',
    priority: 'immediate',
    ...overrides,
  }
}

function createDeferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void
  let reject!: (error?: unknown) => void
  const promise = new Promise<Value>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

describe('analysis artifact scheduler', () => {
  test('dedupes exact artifact keys and returns follower mode for joined requests', async () => {
    const scheduler = createAnalysisArtifactScheduler()
    const unblock = createDeferred<void>()
    const started = createDeferred<void>()
    const compute = vi.fn(async () => {
      started.resolve()
      await unblock.promise
      return 'value'
    })
    const request = createRequest()

    const leaderPromise = scheduler.submit(request, { compute })
    await started.promise
    const followerPromise = scheduler.submit(request, { compute })

    unblock.resolve()

    await expect(leaderPromise).resolves.toEqual({
      value: 'value',
      mode: 'leader',
    })
    await expect(followerPromise).resolves.toEqual({
      value: 'value',
      mode: 'follower',
    })
    expect(compute).toHaveBeenCalledTimes(1)
  })

  test('prefers a freshly readable persisted artifact over waiting on an in-flight task', async () => {
    const scheduler = createAnalysisArtifactScheduler()
    const request = createRequest()
    const unblock = createDeferred<void>()
    let freshValue: string | undefined

    const leaderPromise = scheduler.submit(request, {
      readFresh: async () => freshValue,
      compute: async () => {
        freshValue = 'persisted'
        await unblock.promise
        return 'computed'
      },
    })

    const freshResult = await scheduler.submit(request, {
      readFresh: async () => freshValue,
      compute: async () => 'should-not-run',
    })

    unblock.resolve()

    await expect(leaderPromise).resolves.toEqual({
      value: 'computed',
      mode: 'leader',
    })
    expect(freshResult).toEqual({
      value: 'persisted',
      mode: 'fresh',
    })
  })

  test('promotes a background artifact when a live request joins it', async () => {
    const completions: Array<{ mode: string; promoted: boolean }> = []
    const scheduler = createAnalysisArtifactScheduler({
      onTaskComplete({ mode, promoted }) {
        completions.push({ mode, promoted })
      },
    })
    const request = createRequest({
      priority: 'background',
      family: 'type-resolution',
      kind: 'file.referenceResolvedTypes',
    })
    const unblock = createDeferred<void>()
    const started = createDeferred<void>()

    const leaderPromise = scheduler.submit(request, {
      compute: async () => {
        started.resolve()
        await unblock.promise
        return 'background-value'
      },
    })
    await started.promise

    const followerPromise = scheduler.submit(
      createRequest({
        ...request,
        priority: 'immediate',
      }),
      {
        compute: async () => 'should-not-run',
      }
    )

    unblock.resolve()

    await expect(leaderPromise).resolves.toEqual({
      value: 'background-value',
      mode: 'leader',
    })
    await expect(followerPromise).resolves.toEqual({
      value: 'background-value',
      mode: 'follower',
    })
    expect(completions).toContainEqual({
      mode: 'leader',
      promoted: true,
    })
  })

  test('runs different artifact families independently', async () => {
    const scheduler = createAnalysisArtifactScheduler()
    const typeResolutionStarted = createDeferred<void>()
    const typeResolutionUnblock = createDeferred<void>()
    const structureStarted = createDeferred<void>()

    void scheduler.submit(
      createRequest({
        key: 'type:file-a',
        kind: 'file.referenceResolvedTypes',
        family: 'type-resolution',
      }),
      {
        compute: async () => {
          typeResolutionStarted.resolve()
          await typeResolutionUnblock.promise
          return 'type-a'
        },
      }
    )

    await typeResolutionStarted.promise

    const structurePromise = scheduler.submit(
      createRequest({
        key: 'structure:dir-a',
        kind: 'directory.structure',
        family: 'structure-history',
      }),
      {
        compute: async () => {
          structureStarted.resolve()
          return 'structure-a'
        },
      }
    )

    await expect(structureStarted.promise).resolves.toBeUndefined()
    await expect(structurePromise).resolves.toEqual({
      value: 'structure-a',
      mode: 'leader',
    })

    typeResolutionUnblock.resolve()
  })

  test('runs nested same-family child artifacts inline instead of deadlocking behind occupied lanes', async () => {
    const scheduler = createAnalysisArtifactScheduler()
    const parentsReady = createDeferred<void>()
    let startedParents = 0

    const createParentRequest = (key: string) =>
      createRequest({
        key,
        kind: 'file.referenceResolvedTypes',
        family: 'type-resolution',
      })
    const createChildRequest = (key: string) =>
      createRequest({
        key,
        kind: 'file.resolvedExports',
        family: 'type-resolution',
      })

    const parentA = scheduler.submit(createParentRequest('parent:a'), {
      compute: async () => {
        startedParents += 1
        if (startedParents === 2) {
          parentsReady.resolve()
        }
        await parentsReady.promise

        const child = await scheduler.submit(createChildRequest('child:a'), {
          compute: async () => 'child-a',
        })

        return `parent:${child.value}`
      },
    })
    const parentB = scheduler.submit(createParentRequest('parent:b'), {
      compute: async () => {
        startedParents += 1
        if (startedParents === 2) {
          parentsReady.resolve()
        }
        await parentsReady.promise

        const child = await scheduler.submit(createChildRequest('child:b'), {
          compute: async () => 'child-b',
        })

        return `parent:${child.value}`
      },
    })

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    const results = await Promise.race([
      Promise.all([parentA, parentB]),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('nested child artifacts timed out'))
        }, 250)
      }),
    ]).finally(() => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }
    })

    expect(results).toEqual([
      {
        value: 'parent:child-a',
        mode: 'leader',
      },
      {
        value: 'parent:child-b',
        mode: 'leader',
      },
    ])
  })

  test('cleans up failed entries so later retries can recompute', async () => {
    const scheduler = createAnalysisArtifactScheduler()
    const request = createRequest({
      key: 'retry:file-a',
      kind: 'file.referenceSections',
    })
    const compute = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered')

    await expect(scheduler.submit(request, { compute })).rejects.toThrow('boom')
    await expect(scheduler.submit(request, { compute })).resolves.toEqual({
      value: 'recovered',
      mode: 'leader',
    })

    expect(compute).toHaveBeenCalledTimes(2)
  })
})
