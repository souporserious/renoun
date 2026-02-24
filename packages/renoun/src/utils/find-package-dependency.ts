import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { cwd } from 'node:process'

import { getRootDirectory } from './get-root-directory.ts'

const packageDependencyLookupByKey = new Map<string, Promise<boolean>>()

/**
 * Determines if a dependency is defined in any package.json files starting
 * from the current directory up to the workspace root.
 */
export async function findPackageDependency(
  dependencyName: string,
  startDirectory: string = cwd()
) {
  const resolvedStartDirectory = resolve(startDirectory)
  const cacheKey = `${dependencyName}:${resolvedStartDirectory}`
  const existingLookup = packageDependencyLookupByKey.get(cacheKey)

  if (existingLookup) {
    return existingLookup
  }

  const lookupTask = (async () => {
    let currentDirectory = resolvedStartDirectory
    const rootDirectory = getRootDirectory(currentDirectory)

    while (true) {
      const packageJsonPath = join(currentDirectory, 'package.json')

      if (existsSync(packageJsonPath)) {
        const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
        const { dependencies, devDependencies } = JSON.parse(packageJsonContent)

        if (
          (dependencies && dependencies[dependencyName]) ||
          (devDependencies && devDependencies[dependencyName])
        ) {
          return true
        }
      }

      if (currentDirectory === rootDirectory) break
      currentDirectory = dirname(currentDirectory)
    }

    return false
  })()

  packageDependencyLookupByKey.set(cacheKey, lookupTask)

  return lookupTask.catch((error) => {
    if (packageDependencyLookupByKey.get(cacheKey) === lookupTask) {
      packageDependencyLookupByKey.delete(cacheKey)
    }
    throw error
  })
}
