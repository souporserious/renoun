import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { PROCESS_ENV_KEYS } from '../../utils/env-keys.ts'
import {
  parseBooleanProcessEnv,
  readNonEmptyProcessEnv,
} from '../../utils/env.ts'

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

type ArtifactScheduleStats = {
  samples: number
  totalQueueWaitMs: number
  maxQueueWaitMs: number
  totalRunMs: number
  maxRunMs: number
  leaderCount: number
  followerCount: number
  freshCount: number
  promotionCount: number
  errorCount: number
}

type ArtifactScheduleFlushEntry = {
  key: string
  samples: number
  totalQueueWaitMs: number
  avgQueueWaitMs: number
  maxQueueWaitMs: number
  totalRunMs: number
  avgRunMs: number
  maxRunMs: number
  leaderCount: number
  followerCount: number
  freshCount: number
  promotionCount: number
  errorCount: number
}

type QueueDepthFlushEntry = {
  key: string
  maxDepth: number
}

type ArtifactBootstrapFlushEntry = {
  count: number
  totalMs: number
  avgMs: number
  maxMs: number
}

type BuildProfileSummary = {
  topSlowMethods: FlushEntry[]
  topSlowTargets: FlushEntry[]
  topSlowFiles: FlushEntry[]
  topCacheMissMethods: CacheReuseFlushEntry[]
  topCacheMissTargets: CacheReuseFlushEntry[]
  topCacheMissFiles: CacheReuseFlushEntry[]
  topCacheStaleReasons: CacheReuseStaleReasonFlushEntry[]
  topArtifactKindsByQueueWait: ArtifactScheduleFlushEntry[]
  topArtifactTargetsByQueueWait: ArtifactScheduleFlushEntry[]
  topArtifactFamiliesByQueueWait: ArtifactScheduleFlushEntry[]
  topArtifactQueueDepths: QueueDepthFlushEntry[]
  artifactBootstrap: ArtifactBootstrapFlushEntry | null
}

export type RpcCacheReuseOutcome =
  | 'hit'
  | 'stale'
  | 'miss'
  | 'unavailable'
  | 'error'

const MAX_METHOD_TARGET_ENTRIES = 20_000
const PROFILE_SUMMARY_LIMIT = 10
const methodStats = new Map<string, ProfileStats>()
const methodTargetStats = new Map<string, ProfileStats>()
const cacheReuseMethodStats = new Map<string, CacheReuseStats>()
const cacheReuseTargetStats = new Map<string, CacheReuseStats>()
const cacheReuseStaleReasonMethodStats = new Map<string, number>()
const cacheReuseStaleReasonTargetStats = new Map<string, number>()
const artifactKindStats = new Map<string, ArtifactScheduleStats>()
const artifactTargetStats = new Map<string, ArtifactScheduleStats>()
const artifactFamilyStats = new Map<string, ArtifactScheduleStats>()
const artifactQueueDepthStats = new Map<string, number>()
const artifactBootstrapStats = {
  count: 0,
  totalMs: 0,
  maxMs: 0,
}

interface BuildProfileConfig {
  enabled: boolean
  profileOutputPath: string | null
  workspaceRoot: string
}

export interface RpcBuildProfileConfigOptions {
  enabled?: boolean
  outputPath?: string | null
  workspaceRoot?: string
}

const rpcBuildProfileConfigOverrides: RpcBuildProfileConfigOptions = {}
let flushHookRegistered = false
let flushed = false

function createBuildProfileConfig(): BuildProfileConfig {
  const enabled =
    typeof rpcBuildProfileConfigOverrides.enabled === 'boolean'
      ? rpcBuildProfileConfigOverrides.enabled
      : parseBooleanProcessEnv(PROCESS_ENV_KEYS.renounBuildProfile) === true
  const workspaceRoot =
    rpcBuildProfileConfigOverrides.workspaceRoot ?? process.cwd()
  const profileFile =
    rpcBuildProfileConfigOverrides.outputPath === undefined
      ? readNonEmptyProcessEnv(PROCESS_ENV_KEYS.renounBuildProfileFile)
      : rpcBuildProfileConfigOverrides.outputPath

  return {
    enabled,
    profileOutputPath:
      typeof profileFile === 'string' && profileFile.length > 0
        ? resolve(workspaceRoot, profileFile)
        : null,
    workspaceRoot,
  }
}

let buildProfileConfig = createBuildProfileConfig()

function getBuildProfileConfig(): BuildProfileConfig {
  return buildProfileConfig
}

export function configureRpcBuildProfile(
  options: RpcBuildProfileConfigOptions
): void {
  if ('enabled' in options) {
    rpcBuildProfileConfigOverrides.enabled = options.enabled
  }

  if ('outputPath' in options) {
    rpcBuildProfileConfigOverrides.outputPath = options.outputPath
  }

  if ('workspaceRoot' in options) {
    rpcBuildProfileConfigOverrides.workspaceRoot = options.workspaceRoot
  }

  buildProfileConfig = createBuildProfileConfig()
}

export function resetRpcBuildProfileConfiguration(): void {
  rpcBuildProfileConfigOverrides.enabled = undefined
  rpcBuildProfileConfigOverrides.outputPath = undefined
  rpcBuildProfileConfigOverrides.workspaceRoot = undefined
  buildProfileConfig = createBuildProfileConfig()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizePath(value: string): string {
  const { workspaceRoot } = getBuildProfileConfig()

  if (value.startsWith(workspaceRoot)) {
    const normalized = relative(workspaceRoot, value)
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

function toArtifactScheduleFlushEntries(
  stats: Map<string, ArtifactScheduleStats>
): ArtifactScheduleFlushEntry[] {
  return [...stats.entries()]
    .map(([key, value]) => ({
      key,
      samples: value.samples,
      totalQueueWaitMs: Number(value.totalQueueWaitMs.toFixed(3)),
      avgQueueWaitMs: Number(
        (value.totalQueueWaitMs / Math.max(1, value.samples)).toFixed(3)
      ),
      maxQueueWaitMs: Number(value.maxQueueWaitMs.toFixed(3)),
      totalRunMs: Number(value.totalRunMs.toFixed(3)),
      avgRunMs: Number(
        (value.totalRunMs / Math.max(1, value.samples)).toFixed(3)
      ),
      maxRunMs: Number(value.maxRunMs.toFixed(3)),
      leaderCount: value.leaderCount,
      followerCount: value.followerCount,
      freshCount: value.freshCount,
      promotionCount: value.promotionCount,
      errorCount: value.errorCount,
    }))
    .sort((a, b) => {
      if (b.totalQueueWaitMs !== a.totalQueueWaitMs) {
        return b.totalQueueWaitMs - a.totalQueueWaitMs
      }
      return b.totalRunMs - a.totalRunMs
    })
}

function toQueueDepthFlushEntries(
  stats: Map<string, number>
): QueueDepthFlushEntry[] {
  return [...stats.entries()]
    .map(([key, maxDepth]) => ({
      key,
      maxDepth,
    }))
    .sort((a, b) => b.maxDepth - a.maxDepth)
}

function getProfileTargetKey(key: string): string | undefined {
  const firstSpaceIndex = key.indexOf(' ')

  if (firstSpaceIndex === -1 || firstSpaceIndex + 1 >= key.length) {
    return undefined
  }

  return key.slice(firstSpaceIndex + 1)
}

function getProfileFileKey(target: string): string {
  let endIndex = target.length

  for (const delimiter of ['#', '@', ':']) {
    const delimiterIndex = target.indexOf(delimiter)

    if (delimiterIndex !== -1 && delimiterIndex < endIndex) {
      endIndex = delimiterIndex
    }
  }

  return target.slice(0, endIndex)
}

function aggregateProfileStatsByFile(
  stats: Map<string, ProfileStats>
): FlushEntry[] {
  const aggregateStats = new Map<string, ProfileStats>()

  for (const [key, value] of stats.entries()) {
    const target = getProfileTargetKey(key)

    if (!target) {
      continue
    }

    const fileKey = getProfileFileKey(target)
    const existing = aggregateStats.get(fileKey)

    if (existing) {
      existing.count += value.count
      existing.totalMs += value.totalMs
      if (value.maxMs > existing.maxMs) {
        existing.maxMs = value.maxMs
      }
      existing.errorCount += value.errorCount
      continue
    }

    aggregateStats.set(fileKey, {
      count: value.count,
      totalMs: value.totalMs,
      maxMs: value.maxMs,
      errorCount: value.errorCount,
    })
  }

  return toFlushEntries(aggregateStats)
}

function aggregateCacheReuseStatsByFile(
  stats: Map<string, CacheReuseStats>
): CacheReuseFlushEntry[] {
  const aggregateStats = new Map<string, CacheReuseStats>()

  for (const [key, value] of stats.entries()) {
    const target = getProfileTargetKey(key)

    if (!target) {
      continue
    }

    const fileKey = getProfileFileKey(target)
    const existing = aggregateStats.get(fileKey)

    if (existing) {
      existing.samples += value.samples
      existing.hitCount += value.hitCount
      existing.staleCount += value.staleCount
      existing.missCount += value.missCount
      existing.unavailableCount += value.unavailableCount
      existing.errorCount += value.errorCount
      continue
    }

    aggregateStats.set(fileKey, { ...value })
  }

  return toCacheReuseFlushEntries(aggregateStats)
}

function createBuildProfileSummary(): BuildProfileSummary {
  const slowMethods = toFlushEntries(methodStats)
  const slowTargets = toFlushEntries(methodTargetStats)
  const slowFiles = aggregateProfileStatsByFile(methodTargetStats)
  const cacheReuseMethods = toCacheReuseFlushEntries(cacheReuseMethodStats)
  const cacheReuseTargets = toCacheReuseFlushEntries(cacheReuseTargetStats)
  const cacheReuseFiles = aggregateCacheReuseStatsByFile(cacheReuseTargetStats)
  const staleReasons = toStaleReasonFlushEntries(
    cacheReuseStaleReasonMethodStats
  )
  const artifactKinds = toArtifactScheduleFlushEntries(artifactKindStats)
  const artifactTargets = toArtifactScheduleFlushEntries(artifactTargetStats)
  const artifactFamilies = toArtifactScheduleFlushEntries(artifactFamilyStats)
  const queueDepths = toQueueDepthFlushEntries(artifactQueueDepthStats)

  return {
    topSlowMethods: slowMethods.slice(0, PROFILE_SUMMARY_LIMIT),
    topSlowTargets: slowTargets.slice(0, PROFILE_SUMMARY_LIMIT),
    topSlowFiles: slowFiles.slice(0, PROFILE_SUMMARY_LIMIT),
    topCacheMissMethods: cacheReuseMethods
      .filter((entry) => entry.missCount > 0)
      .slice(0, PROFILE_SUMMARY_LIMIT),
    topCacheMissTargets: cacheReuseTargets
      .filter((entry) => entry.missCount > 0)
      .slice(0, PROFILE_SUMMARY_LIMIT),
    topCacheMissFiles: cacheReuseFiles
      .filter((entry) => entry.missCount > 0)
      .slice(0, PROFILE_SUMMARY_LIMIT),
    topCacheStaleReasons: staleReasons.slice(0, PROFILE_SUMMARY_LIMIT),
    topArtifactKindsByQueueWait: artifactKinds.slice(0, PROFILE_SUMMARY_LIMIT),
    topArtifactTargetsByQueueWait: artifactTargets.slice(
      0,
      PROFILE_SUMMARY_LIMIT
    ),
    topArtifactFamiliesByQueueWait: artifactFamilies.slice(
      0,
      PROFILE_SUMMARY_LIMIT
    ),
    topArtifactQueueDepths: queueDepths.slice(0, PROFILE_SUMMARY_LIMIT),
    artifactBootstrap:
      artifactBootstrapStats.count > 0
        ? {
            count: artifactBootstrapStats.count,
            totalMs: Number(artifactBootstrapStats.totalMs.toFixed(3)),
            avgMs: Number(
              (
                artifactBootstrapStats.totalMs /
                Math.max(1, artifactBootstrapStats.count)
              ).toFixed(3)
            ),
            maxMs: Number(artifactBootstrapStats.maxMs.toFixed(3)),
          }
        : null,
  }
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

function recordArtifactScheduleSample(
  stats: Map<string, ArtifactScheduleStats>,
  key: string,
  options: {
    queueWaitMs: number
    runMs: number
    mode: 'fresh' | 'leader' | 'follower'
    promoted: boolean
    error: boolean
  }
): void {
  const existing = stats.get(key)
  if (existing) {
    existing.samples += 1
    existing.totalQueueWaitMs += options.queueWaitMs
    existing.maxQueueWaitMs = Math.max(
      existing.maxQueueWaitMs,
      options.queueWaitMs
    )
    existing.totalRunMs += options.runMs
    existing.maxRunMs = Math.max(existing.maxRunMs, options.runMs)
    if (options.mode === 'leader') existing.leaderCount += 1
    if (options.mode === 'follower') existing.followerCount += 1
    if (options.mode === 'fresh') existing.freshCount += 1
    if (options.promoted) existing.promotionCount += 1
    if (options.error) existing.errorCount += 1
    return
  }

  stats.set(key, {
    samples: 1,
    totalQueueWaitMs: options.queueWaitMs,
    maxQueueWaitMs: options.queueWaitMs,
    totalRunMs: options.runMs,
    maxRunMs: options.runMs,
    leaderCount: options.mode === 'leader' ? 1 : 0,
    followerCount: options.mode === 'follower' ? 1 : 0,
    freshCount: options.mode === 'fresh' ? 1 : 0,
    promotionCount: options.promoted ? 1 : 0,
    errorCount: options.error ? 1 : 0,
  })
}

function recordQueueDepthSample(
  stats: Map<string, number>,
  key: string,
  depth: number
): void {
  const existing = stats.get(key) ?? 0
  if (depth > existing) {
    stats.set(key, depth)
  }
}

function flushProfile() {
  const { enabled, profileOutputPath, workspaceRoot } = getBuildProfileConfig()

  if (flushed) {
    return
  }

  flushed = true

  if (!enabled || !profileOutputPath) {
    return
  }

  if (
    methodStats.size === 0 &&
    methodTargetStats.size === 0 &&
    cacheReuseMethodStats.size === 0 &&
    cacheReuseTargetStats.size === 0 &&
    cacheReuseStaleReasonMethodStats.size === 0 &&
    cacheReuseStaleReasonTargetStats.size === 0 &&
    artifactKindStats.size === 0 &&
    artifactTargetStats.size === 0 &&
    artifactFamilyStats.size === 0 &&
    artifactQueueDepthStats.size === 0 &&
    artifactBootstrapStats.count === 0
  ) {
    return
  }

  const payload = {
    type: 'renoun-build-profile',
    scope: 'rpc',
    pid: process.pid,
    createdAt: new Date().toISOString(),
    cwd: workspaceRoot,
    summary: createBuildProfileSummary(),
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
    artifactKinds: toArtifactScheduleFlushEntries(artifactKindStats),
    artifactTargets: toArtifactScheduleFlushEntries(artifactTargetStats),
    artifactFamilies: toArtifactScheduleFlushEntries(artifactFamilyStats),
    artifactQueueDepths: toQueueDepthFlushEntries(artifactQueueDepthStats),
    artifactBootstrap:
      artifactBootstrapStats.count > 0
        ? {
            count: artifactBootstrapStats.count,
            totalMs: Number(artifactBootstrapStats.totalMs.toFixed(3)),
            avgMs: Number(
              (
                artifactBootstrapStats.totalMs /
                Math.max(1, artifactBootstrapStats.count)
              ).toFixed(3)
            ),
            maxMs: Number(artifactBootstrapStats.maxMs.toFixed(3)),
          }
        : null,
  }

  mkdirSync(dirname(profileOutputPath), { recursive: true })
  appendFileSync(profileOutputPath, `${JSON.stringify(payload)}\n`, 'utf8')
}

export function isRpcBuildProfileEnabled(): boolean {
  const { enabled, profileOutputPath } = getBuildProfileConfig()
  return enabled && Boolean(profileOutputPath)
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

export function recordArtifactScheduling(options: {
  kind: string
  family: string
  mode: 'fresh' | 'leader' | 'follower'
  queueWaitMs: number
  runMs: number
  promoted: boolean
  error?: boolean
  target?: string
}): void {
  if (!isRpcBuildProfileEnabled()) {
    return
  }

  registerFlushHook()
  const sample = {
    queueWaitMs: options.queueWaitMs,
    runMs: options.runMs,
    mode: options.mode,
    promoted: options.promoted,
    error: options.error === true,
  } as const

  recordArtifactScheduleSample(artifactKindStats, options.kind, sample)
  recordArtifactScheduleSample(artifactFamilyStats, options.family, sample)

  if (options.target && artifactTargetStats.size < MAX_METHOD_TARGET_ENTRIES) {
    recordArtifactScheduleSample(
      artifactTargetStats,
      `${options.kind} ${options.target}`,
      sample
    )
  }
}

export function recordArtifactQueueDepth(options: {
  family: string
  priority: string
  depth: number
}): void {
  if (!isRpcBuildProfileEnabled()) {
    return
  }

  registerFlushHook()
  recordQueueDepthSample(
    artifactQueueDepthStats,
    `${options.family}:${options.priority}`,
    options.depth
  )
}

export function recordArtifactBootstrapDuration(durationMs: number): void {
  if (!isRpcBuildProfileEnabled()) {
    return
  }

  registerFlushHook()
  artifactBootstrapStats.count += 1
  artifactBootstrapStats.totalMs += durationMs
  artifactBootstrapStats.maxMs = Math.max(
    artifactBootstrapStats.maxMs,
    durationMs
  )
}

function registerFlushHook() {
  const { enabled, profileOutputPath } = getBuildProfileConfig()

  if (!enabled || !profileOutputPath || flushHookRegistered) {
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
  if (!isRpcBuildProfileEnabled()) {
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
