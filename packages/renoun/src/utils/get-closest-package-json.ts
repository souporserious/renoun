import fs from 'fs'
import { dirname, parse, join } from 'node:path'

export function getClosestPackageJson(startDirectory: string = process.cwd()):
  | {
      packageJson: Record<string, any>
      path: string
    }
  | undefined {
  const rootDirectory = parse(startDirectory).root
  let currentDirectory = startDirectory

  while (currentDirectory !== rootDirectory) {
    const packageJsonPath = join(currentDirectory, 'package.json')

    if (fs.existsSync(packageJsonPath)) {
      return {
        packageJson: JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf8')
        ) as Record<string, any>,
        path: packageJsonPath,
      }
    }

    currentDirectory = dirname(currentDirectory)
  }
}
