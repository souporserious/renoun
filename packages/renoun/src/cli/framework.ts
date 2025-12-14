import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type Framework = 'next' | 'vite' | 'waku'

const projectRequire = createRequire(join(process.cwd(), 'package.json'))

export function resolveFrameworkBinFile(framework: Framework): string {
  const packageJsonPath = projectRequire.resolve(`${framework}/package.json`)
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  let binRelativePath: string | undefined

  if (typeof packageJson.bin === 'string') {
    binRelativePath = packageJson.bin
  } else if (typeof packageJson.bin === 'object') {
    if (packageJson.bin[framework]) {
      binRelativePath = packageJson.bin[framework]
    } else {
      binRelativePath = Object.values(packageJson.bin).at(0) as
        | string
        | undefined
    }
  }

  if (!binRelativePath) {
    throw new Error(`Could not find "bin" for ${framework}`)
  }

  const packageJsonDirectory = dirname(packageJsonPath)
  return join(packageJsonDirectory, binRelativePath.replace(/^\.\//, ''))
}
