import { existsSync } from 'node:fs'
import { dirname, join, parse, resolve } from 'node:path'

const cache = new Map<string, string | undefined>()

/**
 * Find the closest instance of `fileName` starting at `startDirectory` and
 * walking up towards the filesystem root.
 */
export function getClosestFile(
  fileName: string,
  startDirectory: string = process.cwd()
): string | undefined {
  const start = resolve(startDirectory)
  const cacheKey = `${start}:${fileName}`

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)
  }

  const root = parse(start).root
  let current = start

  while (true) {
    const candidate = join(current, fileName)
    if (existsSync(candidate)) {
      cache.set(cacheKey, candidate)
      return candidate
    }

    const parent = dirname(current)
    if (parent === current || parent === root) break
    current = parent
  }

  cache.set(cacheKey, undefined)
  return undefined
}

/** Same as `getClosestFile` but throws when the file cannot be found. */
export function getClosestFileOrThrow(
  fileName: string,
  startDirectory?: string
): string {
  const path = getClosestFile(fileName, startDirectory)
  if (!path) {
    throw new Error(
      `[renoun] No ${fileName} found starting at "${startDirectory ?? process.cwd()}"`
    )
  }
  return path
}
