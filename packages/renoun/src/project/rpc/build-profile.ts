import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

type ProfileStats = {
  count: number
  totalMs: number
  maxMs: number
  errorCount: number
}

type CacheReuseStats = {
  samples: number
  hitCount: number
  staleCount: number
  missCount: number
  unavailableCount: number
  errorCount: number
}

type FlushEntry = {
  key: string
  count: number
  totalMs: number
  avgMs: number
  maxMs: number
  errorCount: number
}

type CacheReuseFlushEntry = {
  key: string
  samples: number
  hitCount: number
  staleCount: number
  missCount: number
  unavailableCount: number
  errorCount: number
  hitRate: number
  staleRate: number
  missRate: number
}

type CacheReuseStaleReasonFlushEntry = {
  key: string
  staleCount: number
}

export type RpcCacheReuseOutcome =
  | 'hit'
  | 'stale'
  | 'miss'
  | 'unavailable'
  | 'error'

const ENABLED =
  process.env['RENOUN_BUILD_PROFILE'] === '1' ||
  process.env['RENOUN_BUILD_PROFILE'] === 'true'
const PROFILE_OUTPUT_PATH = process.env['RENOUN_BUILD_PROFILE_FILE']
  ? resolve(process.cwd(), process.env['RENOUN_BUILD_PROFILE_FILE'])
  : null
const WORKSPACE_ROOT = process.cwd()
const MAX_METHOD_TARGET_ENTRIES = 20_000
const methodStats = new Map<string, ProfileStats>()
const methodTargetStats = new Map<string, ProfileStats>()
const cacheReuseMethodStats = new Map<string, CacheReuseStats>()
const cacheReuseTargetStats = new Map<string, CacheReuseStats>()
const cacheReuseStaleReasonMethodStats = new Map<string, number>()
const cacheReuseStaleReasonTargetStats = new Map<string, number>()

let flushHookRegistered = false
let flushed = false

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizePath(value: string): string {
  if (value.startsWith(WORKSPACE_ROOT)) {
    const normalized = relative(WORKSPACE_ROOT, value)
    return normalized.length ? normalized : '.'
  }
  return value
}

function extractRpcTarget(params: unknown): string | undefined {
  if (!isRecord(params)) {
    return undefined
  }

  const filePath = params['filePath']
  const name = params['name']
  if (typeof filePath === 'string') {
    const normalizedFilePath = normalizePath(filePath)
    const position = params['position']
    const kind = params['kind']
    const includeDependencies = params['includeDependencies']

    let target = normalizedFilePath
    if (typeof name === 'string' && name.length > 0) {
      target += `#${name}`
    }
    if (typeof position === 'number' && Number.isFinite(position)) {
      target += `@${position}`
    }
    if (typeof kind === 'number' || typeof kind === 'string') {
      target += `:${String(kind)}`
    }
    if (includeDependencies === true) {
      target += '+deps'
    }

    return target
  }

  const slug = params['slug']
  if (Array.isArray(slug) && slug.every((segment) => typeof segment === 'string')) {
    return `/${slug.join('/')}`
  }

  const pathname = params['pathname']
  if (typeof pathname === 'string' && pathname.length > 0) {
    return pathname
  }

  const entryPath = params['entryPath']
  if (typeof entryPath === 'string' && entryPath.length > 0) {
    return normalizePath(entryPath)
  }

  const path = params['path']
  if (typeof path === 'string' && path.length > 0) {
    return normalizePath(path)
  }

  return undefined
}

function toFlushEntries(stats: Map<string, ProfileStats>): FlushEntry[] {
  return [...stats.entries()]
    .map(([key, value]) => ({
      key,
      count: value.count,
      totalMs: Number(value.totalMs.toFixed(3)),
      avgMs: Number((value.totalMs / value.count).toFixed(3)),
      maxMs: Number(value.maxMs.toFixed(3)),
      errorCount: value.errorCount,
    }))
    .sort((a, b) => b.totalMs - a.totalMs)
}

function toCacheReuseFlushEntries(
  stats: Map<string, CacheReuseStats>
): CacheReuseFlushEntry[] {
  return [...stats.entries()]
    .map(([key, value]) => {
      const denominator = Math.max(1, value.samples)
      return {
        key,
        samples: value.samples,
        hitCount: value.hitCount,
        staleCount: value.staleCount,
        missCount: value.missCount,
        unavailableCount: value.unavailableCount,
        errorCount: value.errorCount,
        hitRate: Number((value.hitCount / denominator).toFixed(4)),
        staleRate: Number((value.staleCount / denominator).toFixed(4)),
        missRate: Number((value.missCount / denominator).toFixed(4)),
      }
    })
    .sort((a, b) => {
      if (b.missCount !== a.missCount) {
        return b.missCount - a.missCount
      }
      if (b.staleCount !== a.staleCount) {
        return b.staleCount - a.staleCount
      }
      return b.samples - a.samples
    })
}

function toStaleReasonFlushEntries(
  stats: Map<string, number>
): CacheReuseStaleReasonFlushEntry[] {
  return [...stats.entries()]
    .map(([key, staleCount]) => ({
      key,
      staleCount,
    }))
    .sort((a, b) => b.staleCount - a.staleCount)
}

function recordSample(
  stats: Map<string, ProfileStats>,
  key: string,
  elapsedMs: number,
  error: boolean
) {
  const existing = stats.get(key)
  if (existing) {
    existing.count += 1
    existing.totalMs += elapsedMs
    if (elapsedMs > existing.maxMs) {
      existing.maxMs = elapsedMs
    }
    if (error) {
      existing.errorCount += 1
    }
    return
  }

  stats.set(key, {
    count: 1,
    totalMs: elapsedMs,
    maxMs: elapsedMs,
    errorCount: error ? 1 : 0,
  })
}

function recordCacheReuseSample(
  stats: Map<string, CacheReuseStats>,
  key: string,
  outcome: RpcCacheReuseOutcome
) {
  const existing = stats.get(key)
  if (existing) {
    existing.samples += 1
    if (outcome === 'hit') {
      existing.hitCount += 1
    } else if (outcome === 'stale') {
      existing.staleCount += 1
    } else if (outcome === 'miss') {
      existing.missCount += 1
    } else if (outcome === 'unavailable') {
      existing.unavailableCount += 1
    } else if (outcome === 'error') {
      existing.errorCount += 1
    }
    return
  }

  stats.set(key, {
    samples: 1,
    hitCount: outcome === 'hit' ? 1 : 0,
    staleCount: outcome === 'stale' ? 1 : 0,
    missCount: outcome === 'miss' ? 1 : 0,
    unavailableCount: outcome === 'unavailable' ? 1 : 0,
    errorCount: outcome === 'error' ? 1 : 0,
  })
}

function recordStaleReasonSample(stats: Map<string, number>, key: string): void {
  stats.set(key, (stats.get(key) ?? 0) + 1)
}

function flushProfile() {
  if (flushed) {
    return
  }

  flushed = true

  if (!ENABLED || !PROFILE_OUTPUT_PATH) {
    return
  }

  if (
    methodStats.size === 0 &&
    methodTargetStats.size === 0 &&
    cacheReuseMethodStats.size === 0 &&
    cacheReuseTargetStats.size === 0 &&
    cacheReuseStaleReasonMethodStats.size === 0 &&
    cacheReuseStaleReasonTargetStats.size === 0
  ) {
    return
  }

  const payload = {
    type: 'renoun-build-profile',
    scope: 'rpc',
    pid: process.pid,
    createdAt: new Date().toISOString(),
    cwd: WORKSPACE_ROOT,
    methods: toFlushEntries(methodStats),
    methodTargets: toFlushEntries(methodTargetStats),
    cacheReuse: toCacheReuseFlushEntries(cacheReuseMethodStats),
    cacheReuseTargets: toCacheReuseFlushEntries(cacheReuseTargetStats),
    cacheReuseStaleReasons: toStaleReasonFlushEntries(
      cacheReuseStaleReasonMethodStats
    ),
    cacheReuseStaleReasonTargets: toStaleReasonFlushEntries(
      cacheReuseStaleReasonTargetStats
    ),
  }

  mkdirSync(dirname(PROFILE_OUTPUT_PATH), { recursive: true })
  appendFileSync(PROFILE_OUTPUT_PATH, `${JSON.stringify(payload)}\n`, 'utf8')
}

export function isRpcBuildProfileEnabled(): boolean {
  return ENABLED && Boolean(PROFILE_OUTPUT_PATH)
}

export function recordRpcCacheReuse(options: {
  method: string
  outcome: RpcCacheReuseOutcome
  target?: string
}): void {
  if (!isRpcBuildProfileEnabled()) {
    return
  }

  registerFlushHook()
  recordCacheReuseSample(cacheReuseMethodStats, options.method, options.outcome)

  if (options.target && cacheReuseTargetStats.size < MAX_METHOD_TARGET_ENTRIES) {
    recordCacheReuseSample(
      cacheReuseTargetStats,
      `${options.method} ${options.target}`,
      options.outcome
    )
  }
}

export function recordRpcCacheReuseStaleReason(options: {
  method: string
  reason: string
  target?: string
}): void {
  if (!isRpcBuildProfileEnabled()) {
    return
  }

  registerFlushHook()
  recordStaleReasonSample(
    cacheReuseStaleReasonMethodStats,
    `${options.method} ${options.reason}`
  )

  if (
    options.target &&
    cacheReuseStaleReasonTargetStats.size < MAX_METHOD_TARGET_ENTRIES
  ) {
    recordStaleReasonSample(
      cacheReuseStaleReasonTargetStats,
      `${options.method} ${options.target} ${options.reason}`
    )
  }
}

function registerFlushHook() {
  if (!ENABLED || !PROFILE_OUTPUT_PATH || flushHookRegistered) {
    return
  }

  flushHookRegistered = true
  process.once('beforeExit', flushProfile)
  process.once('exit', flushProfile)
}

export function startRpcBuildProfile(
  method: string,
  params: unknown
): (options?: { error?: boolean }) => void {
  if (!ENABLED || !PROFILE_OUTPUT_PATH) {
    return () => {}
  }

  registerFlushHook()

  const methodTarget = extractRpcTarget(params)
  const startedAt = performance.now()
  let completed = false

  return ({ error = false }: { error?: boolean } = {}) => {
    if (completed) {
      return
    }
    completed = true

    const elapsedMs = performance.now() - startedAt
    recordSample(methodStats, method, elapsedMs, error)

    if (methodTarget && methodTargetStats.size < MAX_METHOD_TARGET_ENTRIES) {
      recordSample(
        methodTargetStats,
        `${method} ${methodTarget}`,
        elapsedMs,
        error
      )
    }
  }
}
