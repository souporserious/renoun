import { open } from 'node:fs/promises'
import { resolve } from 'node:path'

import { collapseInvalidationPaths } from '../utils/collapse-invalidation-paths.ts'
import { normalizeSlashes } from '../utils/path.ts'

interface SharedFileTextPrefixCacheEntry {
  path: string
  text: string
  byteLength: number
  maxBytes: number
  accessedAt: number
}

interface SharedFileTextPrefixCacheInFlightEntry {
  requestedMaxBytes: number
  promise: Promise<SharedFileTextPrefixCacheEntry | undefined>
}

interface SharedFileTextPrefixCacheStats {
  hitCount: number
  missCount: number
  readCount: number
}

export interface SharedFileTextPrefixCacheRuntimeOptions {
  maxEntries?: number
  maxTotalBytes?: number
  maxAgeMs?: number
}

const DEFAULT_MAX_ENTRIES = 256
const DEFAULT_MAX_TOTAL_BYTES = 32 * 1024 * 1024
const DEFAULT_MAX_AGE_MS = 5 * 60_000

const entryByPath = new Map<string, SharedFileTextPrefixCacheEntry>()
const inFlightByPath = new Map<string, SharedFileTextPrefixCacheInFlightEntry>()
const revisionByPath = new Map<string, number>()
const runtimeOptions: SharedFileTextPrefixCacheRuntimeOptions = {}
const stats: SharedFileTextPrefixCacheStats = {
  hitCount: 0,
  missCount: 0,
  readCount: 0,
}
let cachedTotalBytes = 0
let invalidationEpoch = 0

function getMaxEntries(): number {
  const configured = runtimeOptions.maxEntries
  if (
    typeof configured === 'number' &&
    Number.isFinite(configured) &&
    configured > 0
  ) {
    return Math.floor(configured)
  }

  return DEFAULT_MAX_ENTRIES
}

function getMaxTotalBytes(): number {
  const configured = runtimeOptions.maxTotalBytes
  if (
    typeof configured === 'number' &&
    Number.isFinite(configured) &&
    configured > 0
  ) {
    return Math.floor(configured)
  }

  return DEFAULT_MAX_TOTAL_BYTES
}

function getMaxAgeMs(): number {
  const configured = runtimeOptions.maxAgeMs
  if (
    typeof configured === 'number' &&
    Number.isFinite(configured) &&
    configured >= 0
  ) {
    return Math.floor(configured)
  }

  return DEFAULT_MAX_AGE_MS
}

function normalizeComparablePath(path: string): string {
  const normalizedInputPath = normalizeSlashes(path)
  if (normalizedInputPath === '.') {
    return '.'
  }

  const absolutePath = normalizeSlashes(resolve(path))
  if (absolutePath.length > 1 && absolutePath.endsWith('/')) {
    return absolutePath.slice(0, -1)
  }

  return absolutePath
}

function pathIntersectsScope(path: string, scope: string): boolean {
  if (scope === '.') {
    return true
  }

  if (scope === '/') {
    return path.startsWith('/')
  }

  return path === scope || path.startsWith(`${scope}/`)
}

function bumpPathRevision(path: string): void {
  revisionByPath.set(path, (revisionByPath.get(path) ?? 0) + 1)
}

function deleteCachedEntry(path: string): void {
  const existing = entryByPath.get(path)
  if (!existing) {
    return
  }

  cachedTotalBytes = Math.max(0, cachedTotalBytes - existing.byteLength)
  entryByPath.delete(path)
}

function clearCacheEntries(): void {
  entryByPath.clear()
  inFlightByPath.clear()
  revisionByPath.clear()
  cachedTotalBytes = 0
}

function touchCachedEntry(path: string, entry: SharedFileTextPrefixCacheEntry): void {
  entry.accessedAt = Date.now()
  if (entryByPath.get(path) === entry) {
    entryByPath.delete(path)
  }
  entryByPath.set(path, entry)
}

function setCachedEntry(path: string, entry: SharedFileTextPrefixCacheEntry): void {
  const existing = entryByPath.get(path)
  if (existing) {
    cachedTotalBytes = Math.max(0, cachedTotalBytes - existing.byteLength)
    entryByPath.delete(path)
  }

  entryByPath.set(path, entry)
  cachedTotalBytes += entry.byteLength
}

function enforceCacheLimits(now = Date.now()): void {
  const maxAgeMs = getMaxAgeMs()
  if (maxAgeMs >= 0) {
    for (const [path, entry] of entryByPath) {
      if (now - entry.accessedAt > maxAgeMs) {
        deleteCachedEntry(path)
      }
    }
  }

  const maxEntries = getMaxEntries()
  const maxTotalBytes = getMaxTotalBytes()
  while (
    entryByPath.size > maxEntries ||
    (entryByPath.size > 0 && cachedTotalBytes > maxTotalBytes)
  ) {
    const oldestPath = entryByPath.keys().next().value
    if (typeof oldestPath !== 'string') {
      break
    }

    deleteCachedEntry(oldestPath)
  }
}

async function readFileTextPrefixUncached(
  path: string,
  maxBytes: number
): Promise<SharedFileTextPrefixCacheEntry | undefined> {
  let fileHandle: Awaited<ReturnType<typeof open>> | undefined
  try {
    fileHandle = await open(path, 'r')
    const buffer = Buffer.allocUnsafe(Math.max(1, maxBytes))
    const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, 0)
    const text =
      bytesRead > 0 ? buffer.subarray(0, bytesRead).toString('utf8') : ''
    return {
      path,
      text,
      byteLength: bytesRead > 0 ? bytesRead : 0,
      maxBytes,
      accessedAt: Date.now(),
    }
  } catch {
    return undefined
  } finally {
    if (fileHandle) {
      await fileHandle.close().catch(() => {})
    }
  }
}

export function configureSharedFileTextPrefixCacheRuntime(
  options: SharedFileTextPrefixCacheRuntimeOptions
): void {
  if ('maxEntries' in options) {
    runtimeOptions.maxEntries = options.maxEntries
  }

  if ('maxTotalBytes' in options) {
    runtimeOptions.maxTotalBytes = options.maxTotalBytes
  }

  if ('maxAgeMs' in options) {
    runtimeOptions.maxAgeMs = options.maxAgeMs
  }
}

export function resetSharedFileTextPrefixCacheRuntimeConfiguration(): void {
  runtimeOptions.maxEntries = undefined
  runtimeOptions.maxTotalBytes = undefined
  runtimeOptions.maxAgeMs = undefined
}

export function clearSharedFileTextPrefixCache(): void {
  clearCacheEntries()
  stats.hitCount = 0
  stats.missCount = 0
  stats.readCount = 0
  invalidationEpoch = 0
}

export function getSharedFileTextPrefixCacheStats(): SharedFileTextPrefixCacheStats {
  return {
    hitCount: stats.hitCount,
    missCount: stats.missCount,
    readCount: stats.readCount,
  }
}

export function invalidateSharedFileTextPrefixCachePath(path: string): void {
  invalidateSharedFileTextPrefixCachePaths([path])
}

export function invalidateSharedFileTextPrefixCachePaths(
  paths: Iterable<string>
): void {
  const normalizedPaths = collapseInvalidationPaths(
    Array.from(paths)
      .map((path) =>
        typeof path === 'string' && path.length > 0
          ? normalizeComparablePath(path)
          : undefined
      )
      .filter((path): path is string => typeof path === 'string')
  )
  if (normalizedPaths.length === 0) {
    return
  }

  invalidationEpoch += 1
  if (normalizedPaths.includes('.')) {
    for (const path of inFlightByPath.keys()) {
      bumpPathRevision(path)
    }
    clearCacheEntries()
    return
  }

  for (const normalizedScopePath of normalizedPaths) {
    for (const path of entryByPath.keys()) {
      if (pathIntersectsScope(path, normalizedScopePath)) {
        bumpPathRevision(path)
        deleteCachedEntry(path)
      }
    }

    for (const path of inFlightByPath.keys()) {
      if (pathIntersectsScope(path, normalizedScopePath)) {
        bumpPathRevision(path)
        inFlightByPath.delete(path)
      }
    }
  }
}

export async function getSharedFileTextPrefix(
  filePath: string,
  maxBytes: number
): Promise<string | undefined> {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return undefined
  }

  if (
    typeof maxBytes !== 'number' ||
    !Number.isFinite(maxBytes) ||
    maxBytes <= 0
  ) {
    return ''
  }

  const normalizedPath = normalizeComparablePath(filePath)
  const requestedMaxBytes = Math.floor(maxBytes)
  enforceCacheLimits()

  const cachedEntry = entryByPath.get(normalizedPath)
  if (cachedEntry && cachedEntry.maxBytes >= requestedMaxBytes) {
    stats.hitCount += 1
    touchCachedEntry(normalizedPath, cachedEntry)
    return cachedEntry.text
  }

  const existingInFlight = inFlightByPath.get(normalizedPath)
  if (
    existingInFlight &&
    existingInFlight.requestedMaxBytes >= requestedMaxBytes
  ) {
    const entry = await existingInFlight.promise
    if (entry && entry.maxBytes >= requestedMaxBytes) {
      stats.hitCount += 1
      return entry.text
    }
  }

  stats.missCount += 1
  const startedEpoch = invalidationEpoch
  const startedRevision = revisionByPath.get(normalizedPath) ?? 0
  const readPromise = readFileTextPrefixUncached(normalizedPath, requestedMaxBytes)
  const inFlightEntry: SharedFileTextPrefixCacheInFlightEntry = {
    requestedMaxBytes,
    promise: readPromise,
  }
  inFlightByPath.set(normalizedPath, inFlightEntry)

  const readEntry = await readPromise
  if (inFlightByPath.get(normalizedPath) === inFlightEntry) {
    inFlightByPath.delete(normalizedPath)
  }

  if (!readEntry) {
    return cachedEntry?.text
  }

  stats.readCount += 1
  const endedEpoch = invalidationEpoch
  const endedRevision = revisionByPath.get(normalizedPath) ?? 0
  if (endedEpoch !== startedEpoch || endedRevision !== startedRevision) {
    return undefined
  }

  setCachedEntry(normalizedPath, readEntry)
  enforceCacheLimits()
  return readEntry.text
}
