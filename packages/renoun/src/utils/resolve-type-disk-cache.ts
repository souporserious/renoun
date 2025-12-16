import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
  renameSync,
  unlinkSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'

import type { Kind } from './resolve-type.ts'

export interface DiskCacheEntry {
  /** The resolved type */
  resolvedType?: Kind

  /** Map of dependency file paths to their mtime at cache time */
  dependencies: Record<string, number>

  /** When this entry was created */
  createdAt: number
}

export interface DiskCacheData {
  version: number
  entries: Record<string, DiskCacheEntry>
}

const CACHE_VERSION = 1
const CACHE_DIR = '.renoun/cache'
const CACHE_FILE = 'types.json.gz'

/** In-memory representation loaded from disk */
let diskCacheData: DiskCacheData | null = null
let diskCacheLoaded = false
let cacheFilePath: string | null = null
let pendingWrites = 0
let writeTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Get the cache directory path, creating it if necessary.
 * Uses the project root (where .renoun folder should live).
 */
function getCacheDir(projectDirectory: string): string {
  const cacheDir = join(projectDirectory, CACHE_DIR)
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true })
  }
  return cacheDir
}

/**
 * Initialize the disk cache for a project.
 * Should be called once per project/build.
 */
export function initDiskCache(projectDirectory: string): void {
  if (diskCacheLoaded && cacheFilePath) {
    return // Already loaded
  }

  const cacheDir = getCacheDir(projectDirectory)
  cacheFilePath = join(cacheDir, CACHE_FILE)

  try {
    if (existsSync(cacheFilePath)) {
      const compressed = readFileSync(cacheFilePath)
      const content = gunzipSync(compressed).toString('utf-8')
      diskCacheData = JSON.parse(content) as DiskCacheData

      // Version check - if version mismatch, start fresh
      if (diskCacheData.version !== CACHE_VERSION) {
        diskCacheData = { version: CACHE_VERSION, entries: {} }
      }
    } else {
      diskCacheData = { version: CACHE_VERSION, entries: {} }
    }
  } catch {
    // If we can't read the cache, start fresh
    diskCacheData = { version: CACHE_VERSION, entries: {} }
  }

  diskCacheLoaded = true
}

/**
 * Check if a cached entry is still valid by verifying all dependencies.
 */
function isCacheEntryValid(entry: DiskCacheEntry): boolean {
  for (const [depPath, cachedMtime] of Object.entries(entry.dependencies)) {
    try {
      const currentMtime = statSync(depPath).mtimeMs
      if (currentMtime !== cachedMtime) {
        return false
      }
    } catch {
      // File doesn't exist or can't be read - invalid
      return false
    }
  }
  return true
}

/**
 * Get a cached type resolution result.
 * Returns undefined if not cached or if cache is invalid.
 */
export function getDiskCacheEntry(typeId: string): DiskCacheEntry | undefined {
  if (!diskCacheData) {
    return undefined
  }

  const entry = diskCacheData.entries[typeId]
  if (!entry) {
    return undefined
  }

  // Validate the entry
  if (!isCacheEntryValid(entry)) {
    delete diskCacheData.entries[typeId]
    return undefined
  }

  return entry
}

/**
 * Store a type resolution result in the cache.
 */
export function setDiskCacheEntry(
  typeId: string,
  resolvedType: Kind | undefined,
  dependencies: Map<string, number>
): void {
  if (!diskCacheData) {
    return
  }

  const entry: DiskCacheEntry = {
    resolvedType,
    dependencies: Object.fromEntries(dependencies),
    createdAt: Date.now(),
  }

  diskCacheData.entries[typeId] = entry
  pendingWrites++

  // Debounce writes to avoid excessive I/O
  if (writeTimer) {
    clearTimeout(writeTimer)
  }
  writeTimer = setTimeout(() => {
    flushDiskCache()
  }, 100) // Write after 100ms of no new entries
}

/**
 * Flush pending cache writes to disk.
 * Uses atomic write (write to temp, then rename) with gzip compression.
 */
export function flushDiskCache(): void {
  if (!diskCacheData || !cacheFilePath || pendingWrites === 0) {
    return
  }

  const tempPath = `${cacheFilePath}.tmp.${process.pid}`

  try {
    // Ensure directory exists
    mkdirSync(dirname(cacheFilePath), { recursive: true })

    // Compress and write to temp file
    const jsonContent = JSON.stringify(diskCacheData)
    const compressed = gzipSync(jsonContent, { level: 6 }) // Level 6 is a good balance

    writeFileSync(tempPath, compressed)

    // Atomic rename
    renameSync(tempPath, cacheFilePath)
    pendingWrites = 0
  } catch {
    // Clean up temp file if it exists
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath)
      }
    } catch {}
  }
}

/**
 * Clear the disk cache (useful for testing or when cache is corrupted).
 */
export function clearDiskCache(): void {
  if (cacheFilePath && existsSync(cacheFilePath)) {
    try {
      unlinkSync(cacheFilePath)
    } catch {}
  }
  diskCacheData = { version: CACHE_VERSION, entries: {} }
  pendingWrites = 0
}

/** Get information about the disk cache. */
export function getDiskCacheInfo(): {
  entryCount: number
  cacheFilePath: string | null
} {
  return {
    entryCount: diskCacheData ? Object.keys(diskCacheData.entries).length : 0,
    cacheFilePath,
  }
}
