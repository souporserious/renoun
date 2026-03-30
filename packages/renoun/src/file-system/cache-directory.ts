import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { cwd } from 'node:process'

import {
  getRootDirectory,
  resolveCanonicalPath,
  resolvePersistentProjectRootDirectory,
} from '../utils/get-root-directory.ts'

const NEXT_CONFIG_FILE_NAMES = [
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'next.config.mts',
  'next.config.cjs',
  'next.config.cts',
] as const

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

function resolveCacheStartDirectory(startDirectory: string): string {
  return resolvePersistentProjectRootDirectory(resolveCanonicalPath(startDirectory))
}

function resolveWorkspaceRootDirectory(startDirectory: string): string {
  return resolvePersistentProjectRootDirectory(
    resolveCanonicalPath(getRootDirectory(startDirectory))
  )
}

function hasNextDependency(directory: string): boolean {
  const packageJsonPath = join(directory, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return false
  }

  try {
    const packageJson = JSON.parse(
      readFileSync(packageJsonPath, 'utf8')
    ) as PackageJson

    return Boolean(
      packageJson.dependencies?.['next'] ??
        packageJson.devDependencies?.['next'] ??
        packageJson.peerDependencies?.['next'] ??
        packageJson.optionalDependencies?.['next']
    )
  } catch {
    return false
  }
}

function hasNextEntrypoint(directory: string): boolean {
  if (
    existsSync(join(directory, 'app')) ||
    existsSync(join(directory, 'pages')) ||
    existsSync(join(directory, 'src', 'app')) ||
    existsSync(join(directory, 'src', 'pages'))
  ) {
    return true
  }

  for (const fileName of NEXT_CONFIG_FILE_NAMES) {
    if (existsSync(join(directory, fileName))) {
      return true
    }
  }

  return false
}

function isNextAppRoot(directory: string): boolean {
  return hasNextDependency(directory) && hasNextEntrypoint(directory)
}

function findNearestNextAppRootWithinWorkspace(
  startDirectory: string,
  workspaceRoot: string
): string | undefined {
  let currentDirectory = startDirectory

  while (true) {
    if (isNextAppRoot(currentDirectory)) {
      return currentDirectory
    }

    if (currentDirectory === workspaceRoot) {
      return undefined
    }

    const parentDirectory = dirname(currentDirectory)
    if (parentDirectory === currentDirectory) {
      return undefined
    }

    currentDirectory = parentDirectory
  }
}

export function findNearestNextAppRoot(
  startDirectory: string = cwd()
): string | undefined {
  const resolvedStartDirectory = resolveCacheStartDirectory(startDirectory)
  const workspaceRootDirectory =
    resolveWorkspaceRootDirectory(resolvedStartDirectory)

  if (workspaceRootDirectory === resolve('/')) {
    return undefined
  }

  return findNearestNextAppRootWithinWorkspace(
    resolvedStartDirectory,
    workspaceRootDirectory
  )
}

export function resolveCacheRootDirectory(
  options: {
    cacheDirectory?: string
    startDirectory?: string
    fallbackToStartDirectory?: boolean
  } = {}
): string {
  if (
    typeof options.cacheDirectory === 'string' &&
    options.cacheDirectory.trim() !== ''
  ) {
    return resolve(options.cacheDirectory)
  }

  const resolvedStartDirectory = resolveCacheStartDirectory(
    options.startDirectory ?? cwd()
  )

  try {
    const workspaceRootDirectory =
      resolveWorkspaceRootDirectory(resolvedStartDirectory)

    if (workspaceRootDirectory === resolve('/')) {
      throw new Error(
        '[renoun] Refusing to resolve cache directory at filesystem root "/".'
      )
    }

    const nextAppRoot = findNearestNextAppRootWithinWorkspace(
      resolvedStartDirectory,
      workspaceRootDirectory
    )

    if (nextAppRoot) {
      return join(
        resolvePersistentProjectRootDirectory(nextAppRoot),
        '.renoun',
        'cache'
      )
    }

    return join(workspaceRootDirectory, '.renoun', 'cache')
  } catch (error) {
    if (options.fallbackToStartDirectory !== true) {
      throw error
    }

    if (resolvedStartDirectory === resolve('/')) {
      throw new Error(
        '[renoun] Refusing to resolve cache directory at filesystem root "/".'
      )
    }

    return join(resolvedStartDirectory, '.renoun', 'cache')
  }
}
