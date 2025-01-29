import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

import { Log } from './utils.js'

const packageJsonPath = resolve(__dirname, '../package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
const cacheDirectory = resolve(homedir(), '.config', 'create-renoun')
const cacheFilePath = resolve(cacheDirectory, 'version.json')

if (!existsSync(cacheDirectory)) {
  mkdirSync(cacheDirectory, { recursive: true })
}

/** Fetches the latest version of a package from the NPM registry. */
export async function fetchPackageVersion(
  packageName: string
): Promise<string> {
  const controller = new AbortController()
  const signal = controller.signal
  const timeoutId = setTimeout(() => controller.abort(), 2500)

  try {
    const response = await fetch(
      `https://registry.npmjs.org/-/package/${packageName}/dist-tags`,
      { signal }
    )
    const data = await response.json()
    clearTimeout(timeoutId)
    return data.latest
  } catch (error) {
    if (error instanceof Error) {
      Log.error(`Error fetching package version: ${error}`)
    }
    clearTimeout(timeoutId)
    return packageJson.version
  }
}

function saveVersionToCache(version: string) {
  writeFileSync(
    cacheFilePath,
    JSON.stringify({ version, cachedAt: Date.now() }, null, 2),
    'utf-8'
  )
}

function getVersionFromCache() {
  if (!existsSync(cacheFilePath)) {
    return null
  }
  const cacheContent = JSON.parse(readFileSync(cacheFilePath, 'utf-8'))
  return cacheContent as { version: string; cachedAt: number }
}

function shouldRefreshCache() {
  const cacheContent = getVersionFromCache()
  if (!cacheContent) {
    return true
  }
  const now = Date.now()
  const FIVE_MINUTES = 5 * 60 * 1000
  return now - cacheContent.cachedAt > FIVE_MINUTES
}

/** Fetches the latest version of a package from the NPM registry and caches it. */
export async function getPackageVersion(packageName: string) {
  if (shouldRefreshCache()) {
    const version = await fetchPackageVersion(packageName)
    saveVersionToCache(version)
    return version
  } else {
    const cacheContent = getVersionFromCache()
    return cacheContent!.version
  }
}
