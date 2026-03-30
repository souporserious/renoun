import { AsyncLocalStorage } from 'node:async_hooks'
import { cpus } from 'node:os'

import { createAbortError } from '../utils/errors.ts'
import { getContext } from '../utils/operation-context.ts'

export type AnalysisArtifactKind =
  | 'directory.entries'
  | 'directory.structure'
  | 'repository.exportHistory'
  | 'file.referenceBase'
  | 'file.resolvedExports'
  | 'file.referenceResolvedTypes'
  | 'file.referenceSections'

export type AnalysisArtifactFamily =
  | 'structure-history'
  | 'reference-render'
  | 'reference-sections'
  | 'type-resolution'

export type AnalysisArtifactPriority =
  | 'bootstrap'
  | 'immediate'
  | 'background'

export interface AnalysisArtifactRequest {
  key: string
  kind: AnalysisArtifactKind
  family: AnalysisArtifactFamily
  priority: AnalysisArtifactPriority
  analysisScopeId?: string
  targetPath?: string
  dependencyHintPaths?: readonly string[]
}

export interface AnalysisArtifactSubmitHooks<Value> {
  readFresh?: () => Promise<Value | undefined>
  compute: () => Promise<Value>
}

export interface AnalysisArtifactSubmitResult<Value> {
  value: Value
  mode: 'fresh' | 'leader' | 'follower'
}

export interface AnalysisArtifactSchedulerProfileHooks {
  onQueueDepthSample?: (options: {
    family: AnalysisArtifactFamily
    priority: AnalysisArtifactPriority
    depth: number
  }) => void
  onTaskComplete?: (options: {
    request: AnalysisArtifactRequest
    mode: 'fresh' | 'leader' | 'follower'
    queueWaitMs: number
    runMs: number
    promoted: boolean
    error: boolean
  }) => void
}

type ScheduledArtifactEntry<Value> = {
  request: AnalysisArtifactRequest
  hooks: AnalysisArtifactSubmitHooks<Value>
  state: 'queued' | 'running'
  queueName: 'foreground' | 'background'
  enqueuedAt: number
  startedAt?: number
  promoted: boolean
  resolve: (result: AnalysisArtifactSubmitResult<Value>) => void
  reject: (error: unknown) => void
  promise: Promise<AnalysisArtifactSubmitResult<Value>>
}

type ScheduledArtifactEntryAny = ScheduledArtifactEntry<any>

type FamilyQueueState = {
  bootstrapQueue: ScheduledArtifactEntryAny[]
  immediateQueue: ScheduledArtifactEntryAny[]
  backgroundQueue: ScheduledArtifactEntryAny[]
  runningForeground: number
  runningBackground: number
}

type RunningArtifactContext = {
  request: AnalysisArtifactRequest
}

export interface AnalysisArtifactScheduler {
  submit<Value>(
    request: AnalysisArtifactRequest,
    hooks: AnalysisArtifactSubmitHooks<Value>
  ): Promise<AnalysisArtifactSubmitResult<Value>>
  join<Value>(
    request: AnalysisArtifactRequest,
    hooks: Pick<AnalysisArtifactSubmitHooks<Value>, 'readFresh'>
  ): Promise<AnalysisArtifactSubmitResult<Value> | undefined>
  promote(request: AnalysisArtifactRequest): void
  has(requestKey: string): boolean
}

const CPU_COUNT = Math.max(1, cpus().length)

const FOREGROUND_CONCURRENCY_BY_FAMILY: Record<
  AnalysisArtifactFamily,
  number
> = {
  'structure-history': Math.max(3, Math.min(6, Math.ceil(CPU_COUNT / 3))),
  'reference-render': Math.max(4, Math.min(8, Math.ceil(CPU_COUNT / 2))),
  'reference-sections': Math.max(2, Math.min(6, Math.ceil(CPU_COUNT / 3))),
  'type-resolution': Math.max(4, Math.min(8, Math.ceil(CPU_COUNT / 2))),
}

const BACKGROUND_CONCURRENCY_BY_FAMILY: Record<
  AnalysisArtifactFamily,
  number
> = {
  'structure-history': 1,
  'reference-render': Math.max(1, Math.min(2, Math.floor(CPU_COUNT / 4))),
  'reference-sections': 1,
  'type-resolution': Math.max(1, Math.min(2, Math.floor(CPU_COUNT / 4))),
}

const PRIORITY_ORDER: Record<AnalysisArtifactPriority, number> = {
  background: 0,
  immediate: 1,
  bootstrap: 2,
}

function getQueuedPriority(entry: ScheduledArtifactEntryAny):
  | 'bootstrap'
  | 'immediate'
  | 'background' {
  if (entry.queueName === 'background') {
    return 'background'
  }

  return entry.request.priority === 'bootstrap' ? 'bootstrap' : 'immediate'
}

function shouldPromotePriority(
  current: AnalysisArtifactPriority,
  next: AnalysisArtifactPriority
): boolean {
  return PRIORITY_ORDER[next] > PRIORITY_ORDER[current]
}

function rejectIfAborted(): void {
  const signal = getContext()?.signal
  if (signal?.aborted) {
    throw createAbortError(signal.reason)
  }
}

class DefaultAnalysisArtifactScheduler implements AnalysisArtifactScheduler {
  readonly #familyStateByName = new Map<AnalysisArtifactFamily, FamilyQueueState>()
  readonly #entryByKey = new Map<string, ScheduledArtifactEntryAny>()
  readonly #submissionGateByKey = new Map<string, Promise<void>>()
  readonly #runningArtifactContext =
    new AsyncLocalStorage<RunningArtifactContext>()
  #profileHooks: AnalysisArtifactSchedulerProfileHooks | undefined

  constructor(profileHooks?: AnalysisArtifactSchedulerProfileHooks) {
    this.#profileHooks = profileHooks
  }

  setProfileHooks(profileHooks?: AnalysisArtifactSchedulerProfileHooks): void {
    if (!profileHooks) {
      return
    }

    const previousHooks = this.#profileHooks
    if (!previousHooks) {
      this.#profileHooks = profileHooks
      return
    }

    this.#profileHooks = {
      onQueueDepthSample: (options) => {
        previousHooks.onQueueDepthSample?.(options)
        profileHooks.onQueueDepthSample?.(options)
      },
      onTaskComplete: (options) => {
        previousHooks.onTaskComplete?.(options)
        profileHooks.onTaskComplete?.(options)
      },
    }
  }

  has(requestKey: string): boolean {
    return this.#entryByKey.has(requestKey)
  }

  async submit<Value>(
    request: AnalysisArtifactRequest,
    hooks: AnalysisArtifactSubmitHooks<Value>
  ): Promise<AnalysisArtifactSubmitResult<Value>> {
    const submission = await this.#withSubmissionGate(request.key, async () => {
      rejectIfAborted()

      const freshValue = hooks.readFresh ? await hooks.readFresh() : undefined
      if (freshValue !== undefined) {
        this.#profileHooks?.onTaskComplete?.({
          request,
          mode: 'fresh',
          queueWaitMs: 0,
          runMs: 0,
          promoted: false,
          error: false,
        })
        return {
          kind: 'result' as const,
          result: {
            value: freshValue,
            mode: 'fresh' as const,
          },
        }
      }

      const existing = this.#entryByKey.get(request.key) as
        | ScheduledArtifactEntry<Value>
        | undefined
      const shouldRunInline = this.#shouldRunInlineForCurrentContext(request)

      if (existing) {
        if (shouldRunInline && this.#takeQueuedEntryForInlineExecution(existing)) {
          return {
            kind: 'promise' as const,
            promise: this.#runInlineEntryAndReturnPromise(existing),
          }
        }

        const joined = await this.join(request, {
          readFresh: hooks.readFresh,
        })
        if (joined) {
          return {
            kind: 'result' as const,
            result: joined,
          }
        }
      }

      const created = this.#createEntry(request, hooks)
      this.#entryByKey.set(request.key, created)

      if (shouldRunInline) {
        return {
          kind: 'promise' as const,
          promise: this.#runInlineEntryAndReturnPromise(created),
        }
      }

      this.#enqueueEntry(created)
      this.#pumpFamilyQueues(request.family)
      return {
        kind: 'promise' as const,
        promise: created.promise,
      }
    })

    return submission.kind === 'result' ? submission.result : submission.promise
  }

  async join<Value>(
    request: AnalysisArtifactRequest,
    hooks: Pick<AnalysisArtifactSubmitHooks<Value>, 'readFresh'>
  ): Promise<AnalysisArtifactSubmitResult<Value> | undefined> {
    const existing = this.#entryByKey.get(request.key) as
      | ScheduledArtifactEntry<Value>
      | undefined

    if (!existing) {
      return undefined
    }

    const freshValue = hooks.readFresh ? await hooks.readFresh() : undefined
    if (freshValue !== undefined) {
      this.#profileHooks?.onTaskComplete?.({
        request,
        mode: 'fresh',
        queueWaitMs: 0,
        runMs: 0,
        promoted: false,
        error: false,
      })
      return {
        value: freshValue,
        mode: 'fresh',
      }
    }

    if (shouldPromotePriority(existing.request.priority, request.priority)) {
      this.promote(request)
    }

    const result = await existing.promise
    const refreshedValue = hooks.readFresh
      ? await hooks.readFresh()
      : undefined

    return {
      value: refreshedValue ?? result.value,
      mode: result.mode === 'leader' ? 'follower' : result.mode,
    }
  }

  promote(request: AnalysisArtifactRequest): void {
    const entry = this.#entryByKey.get(request.key)
    if (!entry) {
      return
    }

    if (!shouldPromotePriority(entry.request.priority, request.priority)) {
      return
    }

    entry.request = {
      ...entry.request,
      priority: request.priority,
    }
    entry.promoted = true

    if (entry.state !== 'queued' || entry.queueName !== 'background') {
      return
    }

    const familyState = this.#getFamilyState(entry.request.family)
    const backgroundIndex = familyState.backgroundQueue.indexOf(entry)
    if (backgroundIndex !== -1) {
      familyState.backgroundQueue.splice(backgroundIndex, 1)
    }

    entry.queueName = 'foreground'
    this.#enqueueEntry(entry)
    this.#pumpFamilyQueues(entry.request.family)
  }

  #createEntry<Value>(
    request: AnalysisArtifactRequest,
    hooks: AnalysisArtifactSubmitHooks<Value>
  ): ScheduledArtifactEntry<Value> {
    let resolvePromise!: (result: AnalysisArtifactSubmitResult<Value>) => void
    let rejectPromise!: (error: unknown) => void
    const promise = new Promise<AnalysisArtifactSubmitResult<Value>>(
      (resolve, reject) => {
        resolvePromise = resolve
        rejectPromise = reject
      }
    )

    return {
      request,
      hooks,
      state: 'queued',
      queueName: request.priority === 'background' ? 'background' : 'foreground',
      enqueuedAt: performance.now(),
      promoted: false,
      resolve: resolvePromise,
      reject: rejectPromise,
      promise,
    }
  }

  #enqueueEntry(entry: ScheduledArtifactEntryAny): void {
    const familyState = this.#getFamilyState(entry.request.family)
    const priority = getQueuedPriority(entry)

    if (priority === 'bootstrap') {
      familyState.bootstrapQueue.push(entry)
      this.#profileHooks?.onQueueDepthSample?.({
        family: entry.request.family,
        priority: 'bootstrap',
        depth: familyState.bootstrapQueue.length,
      })
      return
    }

    if (priority === 'immediate') {
      familyState.immediateQueue.push(entry)
      this.#profileHooks?.onQueueDepthSample?.({
        family: entry.request.family,
        priority: 'immediate',
        depth: familyState.immediateQueue.length,
      })
      return
    }

    familyState.backgroundQueue.push(entry)
    this.#profileHooks?.onQueueDepthSample?.({
      family: entry.request.family,
      priority: 'background',
      depth: familyState.backgroundQueue.length,
    })
  }

  #pumpFamilyQueues(family: AnalysisArtifactFamily): void {
    const familyState = this.#getFamilyState(family)
    const foregroundConcurrency = FOREGROUND_CONCURRENCY_BY_FAMILY[family]
    const backgroundConcurrency = BACKGROUND_CONCURRENCY_BY_FAMILY[family]

    while (familyState.runningForeground < foregroundConcurrency) {
      const nextEntry =
        familyState.bootstrapQueue.shift() ?? familyState.immediateQueue.shift()
      if (!nextEntry) {
        break
      }

      familyState.runningForeground += 1
      void this.#runEntry(nextEntry, familyState, 'foreground')
    }

    while (familyState.runningBackground < backgroundConcurrency) {
      const nextEntry = familyState.backgroundQueue.shift()
      if (!nextEntry) {
        break
      }

      familyState.runningBackground += 1
      void this.#runEntry(nextEntry, familyState, 'background')
    }
  }

  async #runEntry(
    entry: ScheduledArtifactEntryAny,
    familyState: FamilyQueueState,
    lane: 'foreground' | 'background'
  ): Promise<void> {
    entry.state = 'running'
    entry.startedAt = performance.now()

    try {
      rejectIfAborted()
      const value = await this.#computeEntryValue(entry)
      const queueWaitMs = Math.max(0, entry.startedAt - entry.enqueuedAt)
      const runMs = Math.max(0, performance.now() - entry.startedAt)
      this.#profileHooks?.onTaskComplete?.({
        request: entry.request,
        mode: 'leader',
        queueWaitMs,
        runMs,
        promoted: entry.promoted,
        error: false,
      })
      entry.resolve({
        value,
        mode: 'leader',
      })
    } catch (error) {
      const queueWaitMs = Math.max(
        0,
        (entry.startedAt ?? performance.now()) - entry.enqueuedAt
      )
      const runMs = entry.startedAt
        ? Math.max(0, performance.now() - entry.startedAt)
        : 0
      this.#profileHooks?.onTaskComplete?.({
        request: entry.request,
        mode: 'leader',
        queueWaitMs,
        runMs,
        promoted: entry.promoted,
        error: true,
      })
      entry.reject(error)
    } finally {
      this.#entryByKey.delete(entry.request.key)
      if (lane === 'foreground') {
        familyState.runningForeground = Math.max(
          0,
          familyState.runningForeground - 1
        )
      } else {
        familyState.runningBackground = Math.max(
          0,
          familyState.runningBackground - 1
        )
      }
      this.#pumpFamilyQueues(entry.request.family)
    }
  }

  async #runInlineEntry(entry: ScheduledArtifactEntryAny): Promise<void> {
    entry.state = 'running'
    entry.startedAt = performance.now()

    try {
      rejectIfAborted()
      const value = await this.#computeEntryValue(entry)
      const queueWaitMs = Math.max(0, entry.startedAt - entry.enqueuedAt)
      const runMs = Math.max(0, performance.now() - entry.startedAt)
      this.#profileHooks?.onTaskComplete?.({
        request: entry.request,
        mode: 'leader',
        queueWaitMs,
        runMs,
        promoted: entry.promoted,
        error: false,
      })
      entry.resolve({
        value,
        mode: 'leader',
      })
    } catch (error) {
      const queueWaitMs = Math.max(
        0,
        (entry.startedAt ?? performance.now()) - entry.enqueuedAt
      )
      const runMs = entry.startedAt
        ? Math.max(0, performance.now() - entry.startedAt)
        : 0
      this.#profileHooks?.onTaskComplete?.({
        request: entry.request,
        mode: 'leader',
        queueWaitMs,
        runMs,
        promoted: entry.promoted,
        error: true,
      })
      entry.reject(error)
    } finally {
      this.#entryByKey.delete(entry.request.key)
    }
  }

  async #computeEntryValue(entry: ScheduledArtifactEntryAny): Promise<unknown> {
    return this.#runningArtifactContext.run(
      { request: entry.request },
      () => entry.hooks.compute()
    )
  }

  #getFamilyState(family: AnalysisArtifactFamily): FamilyQueueState {
    let existing = this.#familyStateByName.get(family)
    if (existing) {
      return existing
    }

    existing = {
      bootstrapQueue: [],
      immediateQueue: [],
      backgroundQueue: [],
      runningForeground: 0,
      runningBackground: 0,
    }
    this.#familyStateByName.set(family, existing)
    return existing
  }

  async #withSubmissionGate<Value>(
    key: string,
    task: () => Promise<Value>
  ): Promise<Value> {
    const previous = this.#submissionGateByKey.get(key)
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    this.#submissionGateByKey.set(key, current)

    if (previous) {
      await previous
    }

    try {
      return await task()
    } finally {
      release()
      if (this.#submissionGateByKey.get(key) === current) {
        this.#submissionGateByKey.delete(key)
      }
    }
  }

  #shouldRunInlineForCurrentContext(request: AnalysisArtifactRequest): boolean {
    const currentContext = this.#runningArtifactContext.getStore()
    return (
      currentContext !== undefined &&
      currentContext.request.family === request.family &&
      currentContext.request.key !== request.key
    )
  }

  #takeQueuedEntryForInlineExecution(entry: ScheduledArtifactEntryAny): boolean {
    if (entry.state !== 'queued') {
      return false
    }

    const familyState = this.#getFamilyState(entry.request.family)
    const priority = getQueuedPriority(entry)
    const queue =
      priority === 'bootstrap'
        ? familyState.bootstrapQueue
        : priority === 'immediate'
          ? familyState.immediateQueue
          : familyState.backgroundQueue
    const entryIndex = queue.indexOf(entry)

    if (entryIndex === -1) {
      return false
    }

    queue.splice(entryIndex, 1)
    return true
  }

  #runInlineEntryAndReturnPromise<Value>(
    entry: ScheduledArtifactEntry<Value>
  ): Promise<AnalysisArtifactSubmitResult<Value>> {
    void this.#runInlineEntry(entry)
    return entry.promise
  }
}

let sharedAnalysisArtifactScheduler:
  | DefaultAnalysisArtifactScheduler
  | undefined

export function createAnalysisArtifactScheduler(
  profileHooks?: AnalysisArtifactSchedulerProfileHooks
): AnalysisArtifactScheduler {
  return new DefaultAnalysisArtifactScheduler(profileHooks)
}

export function getSharedAnalysisArtifactScheduler(
  profileHooks?: AnalysisArtifactSchedulerProfileHooks
): AnalysisArtifactScheduler {
  if (!sharedAnalysisArtifactScheduler) {
    sharedAnalysisArtifactScheduler = new DefaultAnalysisArtifactScheduler(
      profileHooks
    )
  } else {
    sharedAnalysisArtifactScheduler.setProfileHooks(profileHooks)
  }

  return sharedAnalysisArtifactScheduler
}

export function resetSharedAnalysisArtifactSchedulerForTests(): void {
  sharedAnalysisArtifactScheduler = undefined
}
