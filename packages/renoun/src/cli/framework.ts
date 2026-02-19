import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { trimLeadingCurrentDirPrefix } from '../utils/path.ts'

export type Framework = 'next' | 'vite' | 'waku'

export function resolveFrameworkBinFile(
  framework: Framework,
  options?: { fromDirectory?: string }
): string {
  // IMPORTANT: do not capture process.cwd() at module initialization.
  // App mode (`renoun dev`) intentionally `chdir`s into a runtime directory,
  // and we must resolve the framework from that runtime's dependency graph.
  const fromDirectory = options?.fromDirectory ?? process.cwd()
  const requireFromDirectory = createRequire(join(fromDirectory, 'package.json'))

  const packageJsonPath = requireFromDirectory.resolve(
    `${framework}/package.json`
  )
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
  return join(packageJsonDirectory, trimLeadingCurrentDirPrefix(binRelativePath))
}
