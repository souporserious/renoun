import fs from 'fs'
import { dirname, parse, join } from 'node:path'

const cache = new Map<
  string,
  { packageJson: Record<string, any>; path: string }
>()

/** Gets the closest package.json file contents and path. */
export function getClosestPackageJson(startDirectory: string = process.cwd()):
  | {
      packageJson: Record<string, any>
      path: string
    }
  | undefined {
  const rootDirectory = parse(startDirectory).root
  let currentDirectory = startDirectory

  if (cache.has(currentDirectory)) {
    return cache.get(currentDirectory)
  }

  while (currentDirectory !== rootDirectory) {
    const packageJsonPath = join(currentDirectory, 'package.json')

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(
        fs.readFileSync(packageJsonPath, 'utf8')
      ) as Record<string, any>
      const result = {
        packageJson,
        path: packageJsonPath,
      }

      cache.set(currentDirectory, result)

      return result
    }

    currentDirectory = dirname(currentDirectory)
  }

  return undefined
}

/** Gets the closest package.json file contents and path or throws an error if none is found. */
export function getClosestPackageJsonOrThrow(
  startDirectory: string = process.cwd()
) {
  const result = getClosestPackageJson(startDirectory)

  if (!result) {
    throw new Error(
      `[renoun] No package.json file found in the current workspace. Please ensure you are in the correct directory.`
    )
  }

  return result
}
