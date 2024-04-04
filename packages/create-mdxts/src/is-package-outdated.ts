import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getPackageVersion } from './get-package-version'

const packageJsonPath = resolve(__dirname, '../package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

export async function isPackageOutdated(packageName: string) {
  const currentVersion = await getPackageVersion(packageName)
  return currentVersion !== packageJson.version
}
