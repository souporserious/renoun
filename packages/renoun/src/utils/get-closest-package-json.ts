import fs from 'fs'

import { getClosestFile } from './get-closest-file.js'

type PackageJsonResult = {
  packageJson: Record<string, any>
  path: string
}

const cache = new Map<string, PackageJsonResult | undefined>()

/** Gets the closest package.json file contents and its absolute path. */
export function getClosestPackageJson(
  startDirectory: string = process.cwd()
): PackageJsonResult | undefined {
  if (cache.has(startDirectory)) {
    return cache.get(startDirectory)
  }

  const path = getClosestFile('package.json', startDirectory)

  if (!path) {
    cache.set(startDirectory, undefined)
    return undefined
  }

  const result: PackageJsonResult = {
    packageJson: JSON.parse(fs.readFileSync(path, 'utf8')) as Record<
      string,
      any
    >,
    path,
  }

  cache.set(startDirectory, result)
  return result
}

/** Same as `getClosestPackageJson` but throws when nothing can be found. */
export function getClosestPackageJsonOrThrow(
  startDirectory: string = process.cwd()
): PackageJsonResult {
  const result = getClosestPackageJson(startDirectory)
  if (!result) {
    throw new Error(
      `[renoun] No package.json file found in the current workspace starting at "${startDirectory}".`
    )
  }
  return result
}
