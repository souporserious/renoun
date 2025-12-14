import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { cwd } from 'node:process'

import { getRootDirectory } from './get-root-directory.ts'

const dependencyCache = new Map<string, boolean>()

/**
 * Determines if a dependency is defined in any package.json files starting
 * from the current directory up to the workspace root.
 */
export async function findPackageDependency(
  dependencyName: string,
  startDirectory: string = cwd()
) {
  let currentDirectory = resolve(startDirectory)
  const rootDirectory = getRootDirectory(currentDirectory)
  const directories = []

  while (true) {
    directories.push(currentDirectory)
    const cacheKey = `${currentDirectory}:${dependencyName}`

    // If we have a cached result for this directory, propagate it
    if (dependencyCache.has(cacheKey)) {
      const cachedResult = dependencyCache.get(cacheKey)!
      directories.forEach((directory) =>
        dependencyCache.set(`${directory}:${dependencyName}`, cachedResult)
      )
      return cachedResult
    }

    const packageJsonPath = join(currentDirectory, 'package.json')

    if (existsSync(packageJsonPath)) {
      const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
      const { dependencies, devDependencies } = JSON.parse(packageJsonContent)

      if (
        (dependencies && dependencies[dependencyName]) ||
        (devDependencies && devDependencies[dependencyName])
      ) {
        // Cache a positive result for all traversed directories
        directories.forEach((directory) =>
          dependencyCache.set(`${directory}:${dependencyName}`, true)
        )
        return true
      }
    }

    if (currentDirectory === rootDirectory) break
    currentDirectory = dirname(currentDirectory)
  }

  // If the dependency wasn't found, cache false for all traversed directories
  directories.forEach((directory) =>
    dependencyCache.set(`${directory}:${dependencyName}`, false)
  )
  return false
}
