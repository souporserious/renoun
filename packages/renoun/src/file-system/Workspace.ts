import { Minimatch } from 'minimatch'
import { createSlug } from '@renoun/mdx/utils'

import { formatNameAsTitle } from '../utils/format-name-as-title.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import { hashString, stableStringify } from '../utils/stable-serialization.ts'
import {
  directoryName,
  joinPaths,
  normalizeSlashes,
  normalizeWorkspaceRelativePath as normalizeWorkspaceRelative,
  resolveSchemePath,
  trimTrailingSlashes,
  type PathLike,
} from '../utils/path.ts'
import {
  FS_STRUCTURE_CACHE_VERSION,
  createCacheNodeKey,
  normalizeCachePath,
} from './cache-key.ts'
import type { Cache } from './Cache.ts'
import type { FileSystem } from './FileSystem.ts'
import { NodeFileSystem } from './NodeFileSystem.ts'
import {
  LOCKFILE_CANDIDATES,
  PackageManager,
  type PackageManagerName,
  parsePackageManagerField,
} from './PackageManager.ts'
import { Package } from './Package.ts'
import { Session } from './Session.ts'
import type {
  DirectoryStructure,
  FileStructure,
  PackageStructure,
  WorkspaceStructure,
} from './types.ts'

interface PackageJson {
  name?: string
  exports?: string | Record<string, unknown> | null
  imports?: Record<string, unknown> | null
  workspaces?: string[] | { packages?: string[] }
  version?: string
  description?: string
  packageManager?: string
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

function createStructureNodeKey(namespace: string, payload: unknown) {
  return createCacheNodeKey(namespace, payload)
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

function buildWorkspacePatternsWithSources(
  fileSystem: FileSystem,
  workspaceRoot: string
): { patterns: string[]; manifestPaths: string[] } {
  const patterns: string[] = []
  const manifestPaths = new Set<string>()
  const pnpmWorkspacePath = joinPaths(workspaceRoot, 'pnpm-workspace.yaml')
  manifestPaths.add(pnpmWorkspacePath)

  if (safeFileExistsSync(fileSystem, pnpmWorkspacePath)) {
    const manifest = readTextFile(fileSystem, pnpmWorkspacePath)
    patterns.push(...parsePnpmWorkspacePackages(manifest))
  }

  const workspacePackageJsonPath = joinPaths(workspaceRoot, 'package.json')
  manifestPaths.add(workspacePackageJsonPath)

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

  return {
    patterns: patterns
      .map((pattern) => pattern.trim())
      .filter((pattern) => pattern && !pattern.startsWith('!')),
    manifestPaths: Array.from(manifestPaths),
  }
}

function buildWorkspacePatterns(fileSystem: FileSystem, workspaceRoot: string) {
  return buildWorkspacePatternsWithSources(fileSystem, workspaceRoot).patterns
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

interface WorkspacePackageResolution {
  packageEntries: Array<{ name?: string; path: string }>
  scannedDirectories: string[]
  workspaceManifestPaths: string[]
  packageManifestPaths: string[]
}

interface WorkspacePackageResolutionCacheEntry {
  resolution: WorkspacePackageResolution
  dependencySignatures: Map<string, string>
}

export class Workspace {
  #fileSystem: FileSystem
  #workspaceRoot: string
  #workspaceRelativeRoot: string
  #cache?: Cache
  #workspacePackageResolutionCache?: WorkspacePackageResolutionCacheEntry

  constructor(
    options: {
      fileSystem?: FileSystem
      rootDirectory?: PathLike
      cache?: Cache
    } = {}
  ) {
    this.#fileSystem = options.fileSystem ?? new NodeFileSystem()
    const resolvedRoot = normalizeSlashes(
      resolveSchemePath(options.rootDirectory ?? getRootDirectory())
    )
    this.#cache = options.cache

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

  getPackageManager(): PackageManagerName {
    const rootPackageJsonPath = this.#findWorkspacePath('package.json')
    if (rootPackageJsonPath) {
      try {
        const packageJson = readJsonFile<PackageJson>(
          this.#fileSystem,
          rootPackageJsonPath,
          `package.json at "${rootPackageJsonPath}"`
        )

        if (typeof packageJson.packageManager === 'string') {
          const parsed = parsePackageManagerField(packageJson.packageManager)
          if (parsed) {
            return parsed.name
          }
        }
      } catch {
        // ignore read/parse errors and fall back to lockfiles
      }
    }

    for (const [filename, manager] of LOCKFILE_CANDIDATES) {
      if (this.#findWorkspacePath(filename)) {
        return manager
      }
    }

    // If we're using the Node file system, fall back to checking availability
    // on the current machine (and otherwise default to npm).
    if (this.#fileSystem instanceof NodeFileSystem) {
      const packageManager = new PackageManager({
        cwd: this.#workspaceRoot,
        traverse: true,
        fallbackToAvailable: true,
      })
      return packageManager.name
    }

    return 'npm'
  }

  getPackage(name: string) {
    return this.getPackages().find((pkg) => pkg.name === name)
  }

  /** @internal */
  getStructureCacheKey() {
    const session = Session.for(this.#fileSystem, undefined, this.#cache)

    return createStructureNodeKey('structure.workspace', {
      version: FS_STRUCTURE_CACHE_VERSION,
      snapshot: session.snapshot.id,
      workspaceRoot: normalizeCachePath(this.#workspaceRoot),
    })
  }

  async getStructure(): Promise<
    Array<
      WorkspaceStructure | PackageStructure | DirectoryStructure | FileStructure
    >
  > {
    const session = Session.for(this.#fileSystem, undefined, this.#cache)
    const nodeKey = this.getStructureCacheKey()

    return session.cache.getOrCompute(
      nodeKey,
      { persist: true },
      async (ctx) => {
        const packageResolution = this.#resolveWorkspacePackages()

        for (const workspaceManifestPath of packageResolution.workspaceManifestPaths) {
          await ctx.recordFileDep(workspaceManifestPath)
        }
        for (const packageManagerDependencyPath of this.#getPackageManagerDependencyPaths()) {
          await ctx.recordFileDep(packageManagerDependencyPath)
        }
        for (const scannedDirectory of packageResolution.scannedDirectories) {
          await ctx.recordDirectoryDep(scannedDirectory)
        }

        const rootPackageJsonPath = this.#findWorkspacePath('package.json')
        const workspacePackageJsonPath =
          rootPackageJsonPath ??
          this.#resolveWorkspacePath('package.json', true)
        if (
          !packageResolution.workspaceManifestPaths.includes(
            workspacePackageJsonPath
          )
        ) {
          await ctx.recordFileDep(workspacePackageJsonPath)
        }

        let workspaceName = 'workspace'

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
          | WorkspaceStructure
          | PackageStructure
          | DirectoryStructure
          | FileStructure
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

        for (const pkg of this.#createPackages(
          packageResolution.packageEntries
        )) {
          const packageStructures = await pkg.getStructure()
          structures.push(...packageStructures)
          await ctx.recordNodeDep(pkg.getStructureCacheKey())
        }

        return structures
      }
    )
  }

  getPackages(): Package[] {
    return this.#createPackages(this.#resolveWorkspacePackages().packageEntries)
  }

  #createPackages(entries: Array<{ name?: string; path: string }>): Package[] {
    return entries.map(
      ({ name, path }) =>
        new Package({
          name,
          path,
          fileSystem: this.#fileSystem,
          cache: this.#cache,
        })
    )
  }

  #getPackageManagerDependencyPaths(): string[] {
    const dependencyPaths = new Set<string>()

    for (const [filename] of LOCKFILE_CANDIDATES) {
      const discoveredLockfilePath = this.#findWorkspacePath(filename)

      if (discoveredLockfilePath) {
        dependencyPaths.add(discoveredLockfilePath)
        continue
      }

      // Record the missing-path probe so cache entries invalidate when a
      // lockfile appears later in the workspace root.
      dependencyPaths.add(this.#resolveWorkspacePath(filename, true))
    }

    return Array.from(dependencyPaths)
  }

  #createWorkspaceFileDependencySignature(path: string): string {
    try {
      const modifiedMs = this.#fileSystem.getFileLastModifiedMsSync(path)
      if (modifiedMs !== undefined) {
        return `mtime:${String(modifiedMs)}`
      }
    } catch {
      // Fall back to content and existence checks.
    }

    if (!safeFileExistsSync(this.#fileSystem, path)) {
      return 'missing'
    }

    try {
      const contents = readTextFile(this.#fileSystem, path)
      return `content:${hashString(contents)}:${contents.length}`
    } catch {
      return 'exists'
    }
  }

  #createWorkspaceDirectoryDependencySignature(path: string): string {
    try {
      const modifiedMs = this.#fileSystem.getFileLastModifiedMsSync(path)
      if (modifiedMs !== undefined) {
        return `mtime:${String(modifiedMs)}`
      }
    } catch {
      // Fall back to directory listing signatures when metadata is unavailable.
    }

    if (!safeFileExistsSync(this.#fileSystem, path)) {
      return 'missing'
    }

    const listingEntries = safeReadDirectory(this.#fileSystem, path)
      .map((entry) => `${entry.isDirectory ? 'd' : entry.isFile ? 'f' : 'o'}:${entry.name}`)
      .sort((first, second) => first.localeCompare(second))

    return `listing:${hashString(stableStringify(listingEntries))}:${listingEntries.length}`
  }

  #createWorkspacePackageResolutionDependencySignatures(
    resolution: WorkspacePackageResolution
  ): Map<string, string> {
    const dependencySignatures = new Map<string, string>()
    const fileDependencyPaths = new Set<string>([
      ...resolution.workspaceManifestPaths,
      ...resolution.packageManifestPaths,
      ...this.#getPackageManagerDependencyPaths(),
    ])
    const directoryDependencyPaths = new Set<string>(resolution.scannedDirectories)

    const sortedFileDependencyPaths = Array.from(fileDependencyPaths).sort((a, b) =>
      normalizeCachePath(a).localeCompare(normalizeCachePath(b))
    )
    const sortedDirectoryDependencyPaths = Array.from(directoryDependencyPaths).sort(
      (a, b) => normalizeCachePath(a).localeCompare(normalizeCachePath(b))
    )

    for (const dependencyPath of sortedFileDependencyPaths) {
      dependencySignatures.set(
        `file:${dependencyPath}`,
        this.#createWorkspaceFileDependencySignature(dependencyPath)
      )
    }

    for (const dependencyPath of sortedDirectoryDependencyPaths) {
      dependencySignatures.set(
        `dir:${dependencyPath}`,
        this.#createWorkspaceDirectoryDependencySignature(dependencyPath)
      )
    }

    return dependencySignatures
  }

  #areWorkspacePackageResolutionDependenciesFresh(
    dependencySignatures: Map<string, string>
  ): boolean {
    for (const [dependencyKey, previousSignature] of dependencySignatures) {
      if (dependencyKey.startsWith('file:')) {
        const dependencyPath = dependencyKey.slice('file:'.length)
        const nextSignature =
          this.#createWorkspaceFileDependencySignature(dependencyPath)
        if (nextSignature !== previousSignature) {
          return false
        }
        continue
      }

      if (dependencyKey.startsWith('dir:')) {
        const dependencyPath = dependencyKey.slice('dir:'.length)
        const nextSignature =
          this.#createWorkspaceDirectoryDependencySignature(dependencyPath)
        if (nextSignature !== previousSignature) {
          return false
        }
      }
    }

    return true
  }

  #resolveWorkspacePackages(): WorkspacePackageResolution {
    const cachedResolution = this.#workspacePackageResolutionCache
    if (
      cachedResolution &&
      this.#areWorkspacePackageResolutionDependenciesFresh(
        cachedResolution.dependencySignatures
      )
    ) {
      return cachedResolution.resolution
    }

    const packageEntries: { name?: string; path: string }[] = []
    const scannedDirectories = new Set<string>()
    const packageManifestPaths = new Set<string>()
    const workspaceRoot = this.#workspaceRelativeRoot || this.#workspaceRoot
    const { patterns, manifestPaths } = buildWorkspacePatternsWithSources(
      this.#fileSystem,
      workspaceRoot
    )

    if (patterns.length === 0) {
      const rootPackageJsonPath = this.#findWorkspacePath('package.json')

      if (rootPackageJsonPath) {
        packageManifestPaths.add(rootPackageJsonPath)
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

      const resolution: WorkspacePackageResolution = {
        packageEntries,
        scannedDirectories: Array.from(scannedDirectories),
        workspaceManifestPaths: manifestPaths,
        packageManifestPaths: Array.from(packageManifestPaths),
      }
      this.#workspacePackageResolutionCache = {
        resolution,
        dependencySignatures:
          this.#createWorkspacePackageResolutionDependencySignatures(resolution),
      }
      return resolution
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
          packageManifestPaths.add(packageJsonPath)
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
        scannedDirectories.add(directoryPath)

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

    const resolution: WorkspacePackageResolution = {
      packageEntries,
      scannedDirectories: Array.from(scannedDirectories),
      workspaceManifestPaths: manifestPaths,
      packageManifestPaths: Array.from(packageManifestPaths),
    }
    this.#workspacePackageResolutionCache = {
      resolution,
      dependencySignatures:
        this.#createWorkspacePackageResolutionDependencySignatures(resolution),
    }

    return resolution
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
