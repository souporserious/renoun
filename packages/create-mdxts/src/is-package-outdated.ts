import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getPackageVersion } from './get-package-version'

const packageJsonPath = resolve(__dirname, '../package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

/** Compares two simple semvar versions and returns true if the first version is less than the second. */
function isVersionLessThan(v1: string, v2: string) {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  for (let index = 0; index < Math.max(parts1.length, parts2.length); index++) {
    const num1 = parts1[index] ?? 0
    const num2 = parts2[index] ?? 0
    if (num1 < num2) return true
    if (num1 > num2) return false
  }
  return false
}

/** Checks if the current package version is less than the latest version on NPM. */
export async function isPackageOutdated(packageName: string) {
  const currentVersion = await getPackageVersion(packageName)
  return isVersionLessThan(packageJson.version, currentVersion)
}
