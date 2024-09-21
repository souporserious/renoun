import { dirname } from 'node:path'

import { getClosestPackageJson } from './get-closest-package-json.js'

/** Returns the package metadata based on the first shared directory between the provided paths. */
export function getPackageMetadata(workingDirectory?: string) {
  const result = getClosestPackageJson(workingDirectory)

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
