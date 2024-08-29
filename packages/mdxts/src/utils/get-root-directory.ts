import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { cwd } from 'node:process'

const rootDirectoryCache: Map<string, string> = new Map()

/** Resolve the root of the workspace, using bun, npm, pnpm, or yarn. */
export function getRootDirectory(startDirectory: string = cwd()): string {
  if (rootDirectoryCache.has(startDirectory)) {
    return rootDirectoryCache.get(startDirectory)!
  }

  let currentDirectory = resolve(startDirectory)

  while (true) {
    const pnpmWorkspacePath = join(currentDirectory, 'pnpm-workspace.yaml')

    // Check for pnpm workspace configuration
    if (existsSync(pnpmWorkspacePath)) {
      rootDirectoryCache.set(startDirectory, currentDirectory)
      return currentDirectory
    }

    // Read and parse package.json directly
    try {
      const packageJsonPath = join(currentDirectory, 'package.json')
      const packageJsonContent = readFileSync(packageJsonPath, 'utf-8')
      const { workspaces } = JSON.parse(packageJsonContent)

      if (
        workspaces &&
        (Array.isArray(workspaces) || typeof workspaces === 'object')
      ) {
        rootDirectoryCache.set(startDirectory, currentDirectory)
        return currentDirectory
      }
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code !== 'ENOENT'
      ) {
        throw error
      }
    }

    // Move up to the parent directory
    const parentDirectory = dirname(currentDirectory)

    // Check if we've reached the root of the file system
    if (parentDirectory === currentDirectory) {
      break
    }

    currentDirectory = parentDirectory
  }

  throw new Error('[mdxts] Workspace root directory not found')
}
