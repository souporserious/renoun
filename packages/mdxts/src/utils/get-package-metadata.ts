import { dirname } from 'node:path'
import { readPackageUpSync } from 'read-package-up'

import { getSharedDirectoryPath } from './get-shared-directory-path'

/** Returns the package metadata based on the first shared directory between the provided paths. */
export function getPackageMetadata(...allPaths: string[]) {
  const sharedDirectoryPath = getSharedDirectoryPath(...allPaths)
  const result = readPackageUpSync({ cwd: sharedDirectoryPath })

  if (!result) {
    return undefined
  }

  const mainExport = result.packageJson
    ? result.packageJson.exports
      ? (result.packageJson.exports as Record<string, any>)['.']
      : undefined
    : undefined

  return {
    name: result.packageJson.name,
    main: result.packageJson.main ?? mainExport,
    exports: result.packageJson.exports as Record<string, any> | undefined,
    directory: dirname(result.path),
  }
}
