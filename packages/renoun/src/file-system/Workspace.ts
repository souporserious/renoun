import { Minimatch } from 'minimatch'
import { createSlug } from '@renoun/mdx/utils'

import { formatNameAsTitle } from '../utils/format-name-as-title.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import {
  directoryName,
  joinPaths,
  normalizeSlashes,
  resolveSchemePath,
  trimTrailingSlashes,
  type PathLike,
} from '../utils/path.ts'
import type { FileSystem } from './FileSystem.ts'
import { NodeFileSystem } from './NodeFileSystem.ts'
import type {
  DirectoryStructure,
  FileStructure,
  PackageStructure,
  WorkspaceStructure,
} from './types.ts'
import { Package } from './Package.ts'

interface PackageJson {
  name?: string
  exports?: string | Record<string, unknown> | null
  imports?: Record<string, unknown> | null
  workspaces?: string[] | { packages?: string[] }
  version?: string
  description?: string
}

const WORKSPACE_DIRECTORY_SKIP = new Set([
  'node_modules',
  '.git',
  '.turbo',
  '.next',
  'dist',
  'build',
  'out',
  '.pnpm',
])

function readTextFile(fileSystem: FileSystem, path: string) {
  return fileSystem.readFileSync(path)
}

function readJsonFile<T = any>(
  fileSystem: FileSystem,
  path: string,
  context: string
) {
  const contents = readTextFile(fileSystem, path)
  try {
    return JSON.parse(contents) as T
  } catch (error) {
    throw new Error(`[renoun] Failed to parse ${context}.`, { cause: error })
  }
}

function safeFileExistsSync(fileSystem: FileSystem, path: string) {
  try {
    return fileSystem.fileExistsSync(path)
  } catch {
    return false
  }
}

function safeReadDirectory(fileSystem: FileSystem, path: string) {
  try {
    return fileSystem.readDirectorySync(path)
  } catch {
    return []
  }
}

function normalizeWorkspaceRelative(path: string) {
  const normalized = normalizeSlashes(path)
  if (!normalized || normalized === '.' || normalized === './') {
    return ''
  }
  return normalized.replace(/^\.\/+/, '')
}

function parsePnpmWorkspacePackages(source: string) {
  const packages: string[] = []
  const lines = source.split(/\r?\n/)
  let inPackages = false
  let indentLevel: number | undefined

  for (const line of lines) {
    if (!inPackages) {
      if (/^\s*packages\s*:\s*$/.test(line)) {
        inPackages = true
        indentLevel = line.match(/^(\s*)/)?.[1]?.length ?? 0
      }
      continue
    }

    if (/^\s*$/.test(line) || /^\s*#/.test(line)) {
      continue
    }

    const currentIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0

    if (indentLevel !== undefined && currentIndent <= indentLevel) {
      break
    }

    const match = line.match(/^\s*-\s*(.+)$/)
    if (match) {
      const value = match[1]?.trim()
      if (value) {
        packages.push(value)
      }
    }
  }

  return packages
}

function buildWorkspacePatterns(fileSystem: FileSystem, workspaceRoot: string) {
  const patterns: string[] = []
  const pnpmWorkspacePath = joinPaths(workspaceRoot, 'pnpm-workspace.yaml')

  if (safeFileExistsSync(fileSystem, pnpmWorkspacePath)) {
    const manifest = readTextFile(fileSystem, pnpmWorkspacePath)
    patterns.push(...parsePnpmWorkspacePackages(manifest))
  }

  const workspacePackageJsonPath = joinPaths(workspaceRoot, 'package.json')

  if (safeFileExistsSync(fileSystem, workspacePackageJsonPath)) {
    const packageJson = readJsonFile<PackageJson>(
      fileSystem,
      workspacePackageJsonPath,
      `package.json at "${workspacePackageJsonPath}"`
    )
    const workspaces = packageJson.workspaces

    if (Array.isArray(workspaces)) {
      patterns.push(...workspaces)
    } else if (workspaces && Array.isArray(workspaces.packages)) {
      patterns.push(...workspaces.packages)
    }
  }

  return patterns
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern && !pattern.startsWith('!'))
}

function getWorkspacePatternBase(pattern: string) {
  const normalized = normalizeWorkspaceRelative(pattern)
  if (!normalized) {
    return ''
  }

  const wildcardIndex = normalized.search(/[\*\?\[{]/)
  if (wildcardIndex === -1) {
    return trimTrailingSlashes(normalized)
  }

  return trimTrailingSlashes(normalized.slice(0, wildcardIndex))
}

function buildWorkspaceSearchRoots(patterns: string[]) {
  const bases = new Set<string>()
  for (const pattern of patterns) {
    const base = getWorkspacePatternBase(pattern)
    bases.add(base)
  }

  if (bases.size === 0) {
    bases.add('')
  }

  return Array.from(bases)
}

export class Workspace {
  #fileSystem: FileSystem
  #workspaceRoot: string
  #workspaceRelativeRoot: string

  constructor(
    options: { fileSystem?: FileSystem; rootDirectory?: PathLike } = {}
  ) {
    this.#fileSystem = options.fileSystem ?? new NodeFileSystem()
    const resolvedRoot = normalizeSlashes(
      resolveSchemePath(options.rootDirectory ?? getRootDirectory())
    )

    this.#workspaceRoot = resolvedRoot.startsWith('/')
      ? resolvedRoot
      : this.#fileSystem.getAbsolutePath(resolvedRoot)
    const relativeRoot = normalizeWorkspaceRelative(resolvedRoot)
    this.#workspaceRelativeRoot = relativeRoot || '.'
  }

  hasWorkspaces() {
    const workspaceRoot = this.#workspaceRelativeRoot || this.#workspaceRoot
    return buildWorkspacePatterns(this.#fileSystem, workspaceRoot).length > 0
  }

  getPackageManager(): 'pnpm' | 'yarn' | 'npm' | 'bun' | 'unknown' {
    const candidates: Array<[string, 'pnpm' | 'yarn' | 'npm' | 'bun']> = [
      ['pnpm-lock.yaml', 'pnpm'],
      ['yarn.lock', 'yarn'],
      ['package-lock.json', 'npm'],
      ['npm-shrinkwrap.json', 'npm'],
      ['bun.lockb', 'bun'],
    ]

    for (const [file, manager] of candidates) {
      if (this.#findWorkspacePath(file)) {
        return manager
      }
    }

    return 'unknown'
  }

  getPackage(name: string) {
    return this.getPackages().find((pkg) => pkg.name === name)
  }

  async getStructure(): Promise<
    Array<
      WorkspaceStructure | PackageStructure | DirectoryStructure | FileStructure
    >
  > {
    let workspaceName = 'workspace'
    const rootPackageJsonPath = this.#findWorkspacePath('package.json')

    if (rootPackageJsonPath) {
      try {
        const packageJson = readJsonFile<{ name?: string }>(
          this.#fileSystem,
          rootPackageJsonPath,
          `package.json at "${rootPackageJsonPath}"`
        )
        if (packageJson?.name) {
          workspaceName = packageJson.name
        }
      } catch {
        // fall back to default workspace name on read/parse errors
      }
    }

    const workspaceSlug = createSlug(workspaceName, 'kebab')

    const structures: Array<
      WorkspaceStructure | PackageStructure | DirectoryStructure | FileStructure
    > = [
      {
        kind: 'Workspace',
        name: workspaceName,
        title: formatNameAsTitle(workspaceName),
        slug: workspaceSlug,
        path: '/',
        packageManager: this.getPackageManager(),
      },
    ]

    for (const pkg of this.getPackages()) {
      const packageStructures = await pkg.getStructure()
      structures.push(...packageStructures)
    }

    return structures
  }

  getPackages(): Package[] {
    return this.#getWorkspacePackageEntries().map(
      ({ name, path }) =>
        new Package({
          name,
          path,
          fileSystem: this.#fileSystem,
        })
    )
  }

  #getWorkspacePackageEntries() {
    const packageEntries: { name?: string; path: string }[] = []
    const workspaceRoot = this.#workspaceRelativeRoot || this.#workspaceRoot
    const patterns = buildWorkspacePatterns(this.#fileSystem, workspaceRoot)

    if (patterns.length === 0) {
      const rootPackageJsonPath = this.#findWorkspacePath('package.json')

      if (rootPackageJsonPath) {
        const packageJson = readJsonFile<PackageJson>(
          this.#fileSystem,
          rootPackageJsonPath,
          `package.json at "${rootPackageJsonPath}"`
        )
        packageEntries.push({
          name: packageJson.name,
          path: directoryName(rootPackageJsonPath) || '.',
        })
      }

      return packageEntries
    }

    const matchers = patterns.map(
      (pattern) =>
        new Minimatch(normalizeWorkspaceRelative(pattern) || '.', { dot: true })
    )
    const roots = buildWorkspaceSearchRoots(patterns)
    const visited = new Set<string>()

    for (const root of roots) {
      const queue: string[] = [normalizeWorkspaceRelative(root)]

      while (queue.length > 0) {
        const relative = queue.shift() ?? ''
        const normalized = normalizeWorkspaceRelative(relative)

        if (visited.has(normalized)) {
          continue
        }

        visited.add(normalized)

        const packageJsonPath = this.#findWorkspacePath(
          normalized ? joinPaths(normalized, 'package.json') : 'package.json'
        )

        if (
          matchers.some((matcher) => matcher.match(normalized || '.')) &&
          packageJsonPath
        ) {
          const packageJson = readJsonFile<PackageJson>(
            this.#fileSystem,
            packageJsonPath,
            `package.json at "${packageJsonPath}"`
          )
          const packagePath = directoryName(packageJsonPath)

          packageEntries.push({
            name: packageJson.name,
            path: packagePath,
          })
        }

        const directoryPath = this.#resolveWorkspacePath(normalized || '.')

        for (const entry of safeReadDirectory(
          this.#fileSystem,
          directoryPath
        )) {
          if (!entry.isDirectory || WORKSPACE_DIRECTORY_SKIP.has(entry.name)) {
            continue
          }

          const child = normalized
            ? joinPaths(normalized, entry.name)
            : entry.name
          queue.push(child)
        }
      }
    }

    return packageEntries
  }

  #findWorkspacePath(path: string) {
    const absolutePath = this.#resolveWorkspacePath(path)
    if (safeFileExistsSync(this.#fileSystem, absolutePath)) {
      return absolutePath
    }

    const relativePath = this.#resolveWorkspacePath(path, true)
    if (
      relativePath !== absolutePath &&
      safeFileExistsSync(this.#fileSystem, relativePath)
    ) {
      return relativePath
    }
  }

  #resolveWorkspacePath(path: string, preferRelative?: boolean) {
    const base =
      preferRelative || this.#workspaceRelativeRoot
        ? this.#workspaceRelativeRoot
        : this.#workspaceRoot
    const normalizedBase = base === '.' ? '' : base
    return normalizedBase ? joinPaths(normalizedBase, path) : path
  }
}

// Backwards-compatible re-exports: historically `Workspace.ts` also hosted
// `Package` and related types.
export * from './Package.ts'
