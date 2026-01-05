import { Minimatch } from 'minimatch'
import { createSlug } from '@renoun/mdx/utils'

import { formatNameAsTitle } from '../utils/format-name-as-title.ts'
import {
  baseName,
  directoryName,
  ensureRelativePath,
  joinPaths,
  normalizeSlashes,
  relativePath,
  resolveSchemePath,
  trimTrailingSlashes,
  type PathLike,
} from '../utils/path.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import type { FileSystem } from './FileSystem.ts'
import { GitHostFileSystem } from './GitHostFileSystem.ts'
import { NodeFileSystem } from './NodeFileSystem.ts'
import {
  Repository,
  parseGitSpecifier,
  type RepositoryConfig,
} from './Repository.ts'
import {
  Directory,
  JavaScriptFile,
  type DirectoryOptions,
  type DirectoryStructure,
  type FileSystemEntry,
  type FileStructure,
  type ModuleLoaders,
  type PackageStructure,
  type WithDefaultTypes,
} from './entries.tsx'

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

function isDirectoryLikeValue(
  value: unknown
): value is { absolutePath: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'absolutePath' in value &&
    typeof (value as any).absolutePath === 'string'
  )
}

function resolveSearchStartDirectory(
  directory?: { absolutePath: string } | PathLike
) {
  if (isDirectoryLikeValue(directory)) {
    return normalizeSlashes(directory.absolutePath)
  }

  if (directory) {
    return normalizeSlashes(resolveSchemePath(directory))
  }

  if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
    return normalizeSlashes(process.cwd())
  }

  return normalizeSlashes(getRootDirectory())
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

function traverseWorkspaceDirectories(
  fileSystem: FileSystem,
  packageName: string,
  matchers: Minimatch[],
  start: string
): string | undefined {
  const queue: string[] = [normalizeWorkspaceRelative(start)]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const relative = queue.shift() ?? ''
    const normalized = normalizeWorkspaceRelative(relative)

    if (visited.has(normalized)) {
      continue
    }

    visited.add(normalized)

    const directoryPath = normalized ? normalized : '.'
    const packageJsonPath = normalized
      ? joinPaths(normalized, 'package.json')
      : 'package.json'

    if (safeFileExistsSync(fileSystem, packageJsonPath)) {
      const packageJson = readJsonFile<PackageJson>(
        fileSystem,
        packageJsonPath,
        `package.json at "${packageJsonPath}"`
      )

      if (
        packageJson.name === packageName &&
        matchers.some((matcher) => matcher.match(normalized || '.'))
      ) {
        return normalized ? normalized : '.'
      }
    }

    for (const entry of safeReadDirectory(fileSystem, directoryPath)) {
      if (!entry.isDirectory) {
        continue
      }
      if (WORKSPACE_DIRECTORY_SKIP.has(entry.name)) {
        continue
      }
      const child = normalized ? joinPaths(normalized, entry.name) : entry.name
      queue.push(child)
    }
  }
}

function tryResolveWorkspacePackage(
  packageName: string | undefined,
  fileSystem: FileSystem,
  directory?: { absolutePath: string } | PathLike
) {
  if (!packageName) {
    return
  }

  const startDirectory = resolveSearchStartDirectory(directory)
  const workspaceRoot = normalizeSlashes(getRootDirectory(startDirectory))
  const patterns = buildWorkspacePatterns(fileSystem, workspaceRoot)

  if (patterns.length === 0) {
    return
  }

  const matchers = patterns.map(
    (pattern) =>
      new Minimatch(normalizeWorkspaceRelative(pattern) || '.', { dot: true })
  )
  const roots = buildWorkspaceSearchRoots(patterns)

  for (const root of roots) {
    const resolved = traverseWorkspaceDirectories(
      fileSystem,
      packageName,
      matchers,
      root
    )
    if (resolved) {
      return ensureRelativePath(resolved)
    }
  }
}

function tryResolveNodeModulesPackage(
  packageName: string | undefined,
  fileSystem: FileSystem,
  directory?: { absolutePath: string } | PathLike
) {
  if (!packageName) {
    return
  }

  const startDirectory = resolveSearchStartDirectory(directory)
  const workspaceRoot = normalizeSlashes(getRootDirectory(startDirectory))
  let currentDirectory = normalizeSlashes(startDirectory)

  while (true) {
    const relativeToRoot = normalizeWorkspaceRelative(
      relativePath(workspaceRoot, currentDirectory)
    )
    const candidate = relativeToRoot
      ? joinPaths(relativeToRoot, 'node_modules', packageName)
      : joinPaths('node_modules', packageName)
    const packageJsonPath = joinPaths(candidate, 'package.json')

    if (safeFileExistsSync(fileSystem, packageJsonPath)) {
      return ensureRelativePath(candidate)
    }

    if (normalizeSlashes(currentDirectory) === workspaceRoot) {
      break
    }

    const parent = directoryName(currentDirectory)
    if (parent === currentDirectory) {
      break
    }
    currentDirectory = parent
  }
}

type ModuleRuntimeResult<Value> =
  | Value
  | Promise<Value>
  | (() => Value | Promise<Value>)

type ModuleExports<Value = unknown> = {
  [exportName: string]: Value
}

/** A runtime loader for a specific package export (no path/file arguments). */
type PackageExportLoader<Module extends ModuleExports<any>> = (
  path: string
) => ModuleRuntimeResult<Module>

/** Shape of the `loader` map accepted by `Package`. */
type PackageExportLoaderMap = Record<
  string,
  PackageExportLoader<ModuleExports<any>>
>

type UnwrapModuleRuntimeResult<T> = T extends () => infer R
  ? Awaited<R>
  : Awaited<T>

type InferPackageExportModule<Fn> = Fn extends (...args: any[]) => infer Return
  ? UnwrapModuleRuntimeResult<Return> extends ModuleExports<any>
    ? UnwrapModuleRuntimeResult<Return>
    : ModuleExports<any>
  : ModuleExports<any>

type ModuleRuntimeLoader<Value> = (
  path: string,
  ...args: any[]
) => ModuleRuntimeResult<Value>

export interface PackageExportOptions<
  Types extends Record<string, any> = Record<string, any>,
  LoaderTypes extends WithDefaultTypes<Types> = WithDefaultTypes<Types>,
> extends Omit<
  DirectoryOptions<Types, LoaderTypes, any, undefined>,
  'path' | 'fileSystem'
> {
  path?: PathLike
}

export interface PackageOptions<
  Types extends Record<string, any> = Record<string, any>,
  LoaderTypes extends WithDefaultTypes<Types> = WithDefaultTypes<Types>,
  ExportLoaders extends PackageExportLoaderMap = {},
> {
  name?: string
  path?: PathLike
  directory?: PathLike | Directory<any, any, any>
  sourcePath?: PathLike | null
  fileSystem?: FileSystem
  exports?: Record<string, PackageExportOptions<Types, LoaderTypes>>
  repository?: RepositoryConfig | string | Repository
  /**
   * Optional runtime loaders for individual package exports or a resolver that
   * will be invoked with the export path (e.g. "remark/add-sections").
   */
  loader?: ExportLoaders | PackageExportLoader<ModuleExports<any>>
}

export type PackageEntryTargetNode =
  | PackageEntryPathTarget
  | PackageEntrySpecifierTarget
  | PackageEntryConditionTarget
  | PackageEntryArrayTarget
  | PackageEntryNullTarget
  | PackageEntryUnknownTarget

export interface PackageEntryPathTarget {
  kind: 'Path'
  relativePath: string
  absolutePath: string
  isPattern: boolean
}

export interface PackageEntrySpecifierTarget {
  kind: 'Specifier'
  specifier: string
}

export interface PackageEntryConditionTarget {
  kind: 'Conditions'
  entries: { condition: string; target: PackageEntryTargetNode }[]
}

export interface PackageEntryArrayTarget {
  kind: 'Array'
  targets: PackageEntryTargetNode[]
}

export interface PackageEntryNullTarget {
  kind: 'Null'
}

export interface PackageEntryUnknownTarget {
  kind: 'Unknown'
  value: unknown
}

type PackageEntryType = 'exports' | 'imports'

export interface PackageEntryAnalysisBase {
  key: string
  type: PackageEntryType
  source: 'manifest' | 'override'
  isPattern: boolean
  manifestTarget?: PackageEntryTargetNode
}

export interface PackageExportAnalysis extends PackageEntryAnalysisBase {
  type: 'exports'
  derivedAbsolutePath: string
  derivedRelativePath: string
}

export interface PackageImportAnalysis extends PackageEntryAnalysisBase {
  type: 'imports'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface PackageExportDirectory<
  Types extends Record<string, any> = Record<string, any>,
  LoaderTypes extends WithDefaultTypes<Types> = WithDefaultTypes<Types>,
> extends Directory<Types, LoaderTypes, any, undefined> {
  getExportPath(): string
  /** @internal */
  getAnalysis(): PackageExportAnalysis | undefined
}

function isDirectoryInstance(
  value: unknown
): value is Directory<any, any, any> {
  return value instanceof Directory
}

export class PackageExportDirectory<
  Types extends Record<string, any> = Record<string, any>,
  LoaderTypes extends WithDefaultTypes<Types> = WithDefaultTypes<Types>,
> extends Directory<Types, LoaderTypes, any, undefined> {
  #exportPath: string
  #analysis?: PackageExportAnalysis

  constructor(
    exportPath: string,
    options: DirectoryOptions<Types, LoaderTypes, any, undefined>,
    analysis?: PackageExportAnalysis
  ) {
    super(options)
    this.#exportPath = exportPath
    this.#analysis = analysis
  }

  getExportPath() {
    return this.#exportPath
  }

  /** @internal */
  getAnalysis() {
    return this.#analysis
  }
}

interface PackageManifestEntry {
  key: string
  type: PackageEntryType
  isPattern: boolean
  target: PackageEntryTargetNode
}

function createManifestEntryMap(
  field: PackageJson['exports'] | PackageJson['imports'],
  type: PackageEntryType,
  packagePath: string,
  fileSystem: FileSystem
) {
  const entries = new Map<string, PackageManifestEntry>()

  if (!field) {
    return entries
  }

  if (type === 'exports' && typeof field === 'string') {
    entries.set('.', {
      key: '.',
      type,
      isPattern: false,
      target: analyzePackageTarget(field, type, packagePath, fileSystem),
    })
    return entries
  }

  if (!isPlainObject(field)) {
    return entries
  }

  for (const [key, value] of Object.entries(field)) {
    if (type === 'exports' && !isValidExportKey(key)) {
      continue
    }

    if (type === 'imports' && !isValidImportKey(key)) {
      continue
    }

    entries.set(key, {
      key,
      type,
      isPattern: key.includes('*'),
      target: analyzePackageTarget(value, type, packagePath, fileSystem),
    })
  }

  return entries
}

function isValidExportKey(key: string) {
  return key === '.' || key === './' || key.startsWith('./')
}

function isValidImportKey(key: string) {
  return key.startsWith('#')
}

function analyzePackageTarget(
  target: unknown,
  type: PackageEntryType,
  packagePath: string,
  fileSystem: FileSystem
): PackageEntryTargetNode {
  if (target === null) {
    return { kind: 'Null' }
  }

  if (typeof target === 'string') {
    return analyzePackageTargetString(target, packagePath, fileSystem)
  }

  if (Array.isArray(target)) {
    return {
      kind: 'Array',
      targets: target.map((entry) =>
        analyzePackageTarget(entry, type, packagePath, fileSystem)
      ),
    }
  }

  if (isPlainObject(target)) {
    return {
      kind: 'Conditions',
      entries: Object.entries(target).map(([condition, value]) => ({
        condition,
        target: analyzePackageTarget(value, type, packagePath, fileSystem),
      })),
    }
  }

  return { kind: 'Unknown', value: target }
}

function analyzePackageTargetString(
  target: string,
  packagePath: string,
  fileSystem: FileSystem
): PackageEntryPathTarget | PackageEntrySpecifierTarget {
  if (target.startsWith('./') || target.startsWith('../')) {
    const normalizedTarget = normalizeSlashes(target.replace(/^\.\/+/, ''))
    const absolutePath = normalizedTarget
      ? joinPaths(packagePath, normalizedTarget)
      : packagePath
    const resolvedAbsolutePath = fileSystem.getAbsolutePath(absolutePath)

    return {
      kind: 'Path',
      relativePath: target,
      absolutePath: resolvedAbsolutePath,
      isPattern: target.includes('*'),
    } satisfies PackageEntryPathTarget
  }

  return {
    kind: 'Specifier',
    specifier: target,
  } satisfies PackageEntrySpecifierTarget
}

function normalizePackagePath(path: PathLike) {
  const resolved = resolveSchemePath(path)

  if (resolved.startsWith('/')) {
    const workspaceRoot = normalizeSlashes(getRootDirectory())
    const absoluteResolved = normalizeSlashes(resolved)

    if (
      absoluteResolved === workspaceRoot ||
      absoluteResolved.startsWith(
        workspaceRoot.endsWith('/') ? workspaceRoot : `${workspaceRoot}/`
      )
    ) {
      return ensureRelativePath(relativePath(workspaceRoot, absoluteResolved))
    }

    return resolved
  }

  return ensureRelativePath(resolved)
}

function normalizeExportSubpath(exportPath: string) {
  if (exportPath === '.' || exportPath === './') {
    return ''
  }

  let normalized = exportPath.replace(/^\.\/+/, '')
  const wildcardIndex = normalized.indexOf('*')

  if (wildcardIndex !== -1) {
    normalized = normalized.slice(0, wildcardIndex)
  }

  return trimTrailingSlashes(normalized)
}

function isDirectoryLikeExport(exportPath: string) {
  if (exportPath === '.' || exportPath === './') {
    return true
  }

  if (exportPath.startsWith('#')) {
    return false
  }

  const normalized = exportPath.replace(/^\.\/+/, '')

  if (!normalized) {
    return true
  }

  if (normalized.includes('*')) {
    return true
  }

  const lastSegment = normalized.split('/').pop()!
  return !lastSegment.includes('.')
}

function isWildcardExport(exportPath: string) {
  return exportPath.includes('*')
}

function normalizePackageExportSpecifier(
  specifier: string,
  packageName?: string
) {
  let normalized = normalizeSlashes(specifier).trim()

  if (!normalized || normalized === '.' || normalized === './') {
    return ''
  }

  if (packageName) {
    const normalizedPackageName = normalizeSlashes(packageName)

    if (
      normalized === normalizedPackageName ||
      normalized.startsWith(`${normalizedPackageName}/`)
    ) {
      normalized = normalized.slice(normalizedPackageName.length)
    }
  }

  normalized = normalized.replace(/^\/+/, '')

  if (!normalized || normalized === '.' || normalized === './') {
    return ''
  }

  return normalizeExportSubpath(normalized)
}

function resolvePackageExportRelativePath(
  specifier: string,
  exportPath: string,
  isPattern: boolean
) {
  const baseSubpath = normalizeExportSubpath(exportPath)

  if (!specifier) {
    if (!isPattern && baseSubpath === '') {
      return ''
    }

    return undefined
  }

  if (!isPattern) {
    return specifier === baseSubpath ? '' : undefined
  }

  if (!baseSubpath) {
    return specifier
  }

  if (!specifier.startsWith(baseSubpath)) {
    return undefined
  }

  if (specifier.length === baseSubpath.length) {
    return undefined
  }

  const remainder = specifier.slice(baseSubpath.length)

  if (!remainder.startsWith('/')) {
    return undefined
  }

  const relative = remainder.slice(1)
  return relative.length > 0 ? relative : undefined
}

function resolveRepositorySpecifier(
  repository?: Repository | RepositoryConfig | string
) {
  if (!repository) {
    return
  }

  if (repository instanceof Repository) {
    return parseGitSpecifier(repository.toString())
  }

  if (typeof repository === 'string') {
    return parseGitSpecifier(repository)
  }

  if (repository.owner && repository.repository && repository.host) {
    return {
      host: repository.host,
      owner: repository.owner,
      repo: repository.repository,
      ref: repository.branch,
      path: repository.path,
    }
  }
}

function isPathLikeValue(value: unknown): value is PathLike {
  if (typeof value === 'string') {
    return true
  }

  return typeof URL !== 'undefined' && value instanceof URL
}

export class Package<
  Types extends Record<string, any> = Record<string, any>,
  LoaderTypes extends WithDefaultTypes<Types> = WithDefaultTypes<Types>,
  ExportLoaders extends PackageExportLoaderMap = {},
> {
  #name?: string
  #packagePath: string
  #sourceRootPath: string
  #fileSystem: FileSystem
  #packageJson?: PackageJson
  #packageAbsolutePath?: string
  #repository?: Repository | RepositoryConfig | string
  #exportLoaders?: ExportLoaders | PackageExportLoader<ModuleExports<any>>
  #exportOverrides?: Record<string, PackageExportOptions<Types, LoaderTypes>>
  #exportDirectories?: PackageExportDirectory<Types, LoaderTypes>[]
  #importEntries?: PackageImportEntry[]
  #exportManifestEntries?: Map<string, PackageManifestEntry>
  #importManifestEntries?: Map<string, PackageManifestEntry>

  constructor(options: PackageOptions<Types, LoaderTypes, ExportLoaders>) {
    if (!options?.name && !options?.path) {
      throw new Error(
        '[renoun] A package "name" or explicit "path" must be provided.'
      )
    }

    let startDirectory: Directory<any, any, any> | PathLike | undefined
    if (isDirectoryInstance(options.directory)) {
      startDirectory = options.directory
    } else if (isPathLikeValue(options.directory)) {
      startDirectory = options.directory
    }

    const repositoryInstance =
      options.repository instanceof Repository
        ? options.repository
        : options.repository
          ? new Repository(options.repository)
          : undefined
    const { fileSystem, packagePath } = this.#resolvePackageLocation({
      name: options.name,
      path: options.path,
      directory: startDirectory,
      repository: options.repository ?? repositoryInstance,
      fileSystem: options.fileSystem ?? new NodeFileSystem(),
    })

    this.#fileSystem = fileSystem
    this.#packagePath = packagePath
    this.#name = options.name
    this.#repository = options.repository ?? repositoryInstance
    this.#exportOverrides = options.exports
    this.#exportLoaders = options.loader
    this.#sourceRootPath =
      options.sourcePath === null
        ? this.#packagePath
        : this.#resolveWithinPackage(options.sourcePath ?? 'src')
  }

  get name() {
    return this.#name
  }

  getExports(): PackageExportDirectory<Types, LoaderTypes>[] {
    if (!this.#exportDirectories) {
      this.#exportDirectories = this.#buildExportDirectories()
    }

    return this.#exportDirectories
  }

  async getStructure(): Promise<
    Array<PackageStructure | DirectoryStructure | FileStructure>
  > {
    this.#ensurePackageJsonLoaded()

    const packageJson = this.#packageJson
    const name =
      this.#name ??
      packageJson?.name ??
      formatNameAsTitle(baseName(this.#packagePath))
    const relativePath = this.#fileSystem.getRelativePathToWorkspace(
      this.#packagePath
    )
    const normalizedRelativePath =
      relativePath === '.' ? '' : normalizeSlashes(relativePath)
    const path =
      normalizedRelativePath === ''
        ? '/'
        : `/${normalizedRelativePath.replace(/^\/+/, '')}`

    const structures: Array<
      PackageStructure | DirectoryStructure | FileStructure
    > = [
      {
        kind: 'Package',
        name,
        title: formatNameAsTitle(name),
        slug: createSlug(name, 'kebab'),
        path,
        version: packageJson?.version,
        description: packageJson?.description,
        relativePath: normalizedRelativePath || '.',
      },
    ]

    for (const directory of this.getExports()) {
      const directoryStructures = await directory.getStructure()
      structures.push(...directoryStructures)
    }

    return structures
  }

  async getExport<Key extends keyof ExportLoaders & string>(
    exportSpecifier: Key,
    extension?: string | string[]
  ): Promise<
    JavaScriptFile<InferPackageExportModule<ExportLoaders[Key]>, LoaderTypes>
  >
  async getExport<Module extends ModuleExports<any>>(
    exportSpecifier: string,
    extension?: string | string[]
  ): Promise<JavaScriptFile<Module, LoaderTypes>>
  async getExport(
    exportSpecifier: string,
    extension?: string | string[]
  ): Promise<FileSystemEntry<LoaderTypes>>
  async getExport(
    exportSpecifier: string,
    extension?: string | string[]
  ): Promise<any> {
    const normalizedSpecifier = normalizePackageExportSpecifier(
      exportSpecifier,
      this.#name
    )
    const directories = this.getExports()
    const manifestEntries = this.#getManifestEntries('exports')
    const patternBases = new Set<string>()

    for (const entry of manifestEntries.values()) {
      if (entry.isPattern) {
        const normalizedBase = normalizeExportSubpath(entry.key)
        patternBases.add(normalizedBase)
      }
    }

    let match:
      | {
          directory: PackageExportDirectory<Types, LoaderTypes>
          relativePath: string
          baseLength: number
          relativeLength: number
        }
      | undefined

    for (const directory of directories) {
      const exportPath = directory.getExportPath()
      const analysis = directory.getAnalysis()
      const baseSubpath = normalizeExportSubpath(exportPath)
      const manifestPattern = patternBases.has(baseSubpath)
      const isPattern =
        (analysis?.isPattern ?? isWildcardExport(exportPath)) || manifestPattern
      const relativePath = resolvePackageExportRelativePath(
        normalizedSpecifier,
        exportPath,
        isPattern
      )

      if (relativePath === undefined) {
        continue
      }

      const baseLength = baseSubpath.length
      const relativeLength = relativePath.length

      if (
        !match ||
        baseLength > match.baseLength ||
        (baseLength === match.baseLength &&
          relativeLength < match.relativeLength)
      ) {
        match = { directory, relativePath, baseLength, relativeLength }
      }
    }

    if (!match) {
      throw new Error(
        `[renoun] Export "${exportSpecifier}" was not found in package "${this.#name ?? this.#packagePath}".`
      )
    }

    if (match.relativePath === '') {
      return match.directory
    }

    return match.directory.getFile(match.relativePath, extension)
  }

  getImports() {
    if (!this.#importEntries) {
      const manifestEntries = this.#getManifestEntries('imports')

      this.#importEntries = Array.from(manifestEntries.values()).map(
        (entry) =>
          new PackageImportEntry({
            key: entry.key,
            type: 'imports',
            source: 'manifest',
            isPattern: entry.isPattern,
            manifestTarget: entry.target,
          })
      )
    }

    return this.#importEntries
  }

  /** Get a single import entry by its specifier (e.g. "#internal/*"). */
  getImport(importSpecifier: string): PackageImportEntry | undefined {
    return this.getImports().find(
      (entry) => entry.getImportPath() === importSpecifier
    )
  }

  #ensurePackageJsonLoaded() {
    if (!this.#packageJson) {
      const packageJson = this.#readPackageJson()
      this.#packageJson = packageJson
      if (!this.#name && packageJson.name) {
        this.#name = packageJson.name
      }
    }
  }

  #getPackageAbsolutePath() {
    if (!this.#packageAbsolutePath) {
      this.#packageAbsolutePath = this.#fileSystem.getAbsolutePath(
        this.#packagePath
      )
    }

    return this.#packageAbsolutePath
  }

  #readPackageJson(): PackageJson {
    const packageJsonPath = joinPaths(this.#packagePath, 'package.json')
    try {
      return readJsonFile<PackageJson>(
        this.#fileSystem,
        packageJsonPath,
        `package.json at "${packageJsonPath}"`
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith('[renoun] Failed to parse package.json')
      ) {
        throw error
      }

      throw new Error(
        `[renoun] Failed to read package.json at "${packageJsonPath}".`,
        { cause: error }
      )
    }
  }

  #resolveWithinPackage(path: PathLike) {
    const resolved = resolveSchemePath(path)

    if (resolved.startsWith('/')) {
      return resolved
    }

    return joinPaths(this.#packagePath, resolved)
  }

  #getManifestEntries(type: PackageEntryType) {
    this.#ensurePackageJsonLoaded()

    if (type === 'exports') {
      if (!this.#exportManifestEntries) {
        this.#exportManifestEntries = createManifestEntryMap(
          this.#packageJson!.exports,
          'exports',
          this.#packagePath,
          this.#fileSystem
        )
      }

      return this.#exportManifestEntries
    }

    if (!this.#importManifestEntries) {
      this.#importManifestEntries = createManifestEntryMap(
        this.#packageJson!.imports,
        'imports',
        this.#packagePath,
        this.#fileSystem
      )
    }

    return this.#importManifestEntries
  }

  #resolvePackageExportKeys() {
    const manifestEntries = this.#getManifestEntries('exports')
    const deduped = new Map<string, { key: string; wildcard: boolean }>()

    const addKey = (key: string) => {
      if (!isDirectoryLikeExport(key)) {
        return
      }

      const normalized = normalizeExportSubpath(key)
      const dedupeKey = normalized || '.'
      const wildcard = isWildcardExport(key)
      const existing = deduped.get(dedupeKey)

      if (!existing || (existing.wildcard && !wildcard)) {
        deduped.set(dedupeKey, { key, wildcard })
      }
    }

    if (manifestEntries.size === 0) {
      addKey('.')
    } else {
      for (const key of manifestEntries.keys()) {
        addKey(key)
      }
    }

    return Array.from(deduped.values()).map((entry) => entry.key)
  }

  #buildExportDirectories() {
    const directories: PackageExportDirectory<Types, LoaderTypes>[] = []
    const packageExportKeys = this.#resolvePackageExportKeys()
    const overrideKeys = this.#exportOverrides
      ? Object.keys(this.#exportOverrides)
      : []
    const keys = packageExportKeys.slice()
    const manifestEntries = this.#getManifestEntries('exports')

    const loaderOption = this.#exportLoaders
    const exportLoaderResolver =
      typeof loaderOption === 'function' ? loaderOption : undefined
    const exportLoaderMap =
      loaderOption && typeof loaderOption === 'object'
        ? (loaderOption as ExportLoaders)
        : undefined
    const normalizedExportLoaders = new Map<string, ModuleLoaders>()
    const resolverLoaderCache = new Map<string, ModuleLoaders>()

    if (exportLoaderMap) {
      for (const [rawKey, loader] of Object.entries(exportLoaderMap)) {
        if (!loader) continue
        const normalizedSpecifier = normalizePackageExportSpecifier(
          rawKey,
          this.#name
        )

        if (!normalizedSpecifier) continue

        const baseSubpath =
          normalizeExportSubpath(normalizedSpecifier).split('/')[0]

        if (!baseSubpath) continue

        normalizedExportLoaders.set(
          baseSubpath,
          createPackageExportModuleLoaders(loader, baseSubpath)
        )
      }
    }

    const resolveResolverLoaderForSubpath = (subpath: string) => {
      if (!exportLoaderResolver) {
        return undefined
      }

      if (!resolverLoaderCache.has(subpath)) {
        resolverLoaderCache.set(
          subpath,
          createPackageExportModuleLoaders(exportLoaderResolver, subpath)
        )
      }

      return resolverLoaderCache.get(subpath)
    }

    for (const key of overrideKeys) {
      if (!keys.includes(key)) {
        keys.push(key)
      }
    }

    for (const exportKey of keys) {
      const override = this.#exportOverrides?.[exportKey]
      const { path: overridePath, ...overrideOptions } = override ?? {}
      const normalizedExportSubpath = normalizeExportSubpath(exportKey)
      const directoryPath = normalizePackagePath(
        overridePath
          ? this.#resolveWithinPackage(overridePath)
          : this.#resolveDerivedPath(exportKey)
      )
      const manifestEntry = manifestEntries.get(exportKey)
      const derivedAbsolutePath =
        this.#fileSystem.getAbsolutePath(directoryPath)
      const packageAbsolutePath = this.#getPackageAbsolutePath()
      const relativeFromPackage =
        relativePath(packageAbsolutePath, derivedAbsolutePath) || '.'
      const analysis: PackageExportAnalysis = {
        key: exportKey,
        type: 'exports',
        source: manifestEntry ? 'manifest' : 'override',
        isPattern: manifestEntry?.isPattern ?? isWildcardExport(exportKey),
        manifestTarget: manifestEntry?.target,
        derivedAbsolutePath,
        derivedRelativePath:
          relativeFromPackage === ''
            ? '.'
            : normalizeSlashes(relativeFromPackage),
      }
      const directory = new PackageExportDirectory(
        exportKey,
        {
          ...overrideOptions,
          path: directoryPath,
          fileSystem: this.#fileSystem,
          repository: this.#repository,
          loader:
            overrideOptions.loader ??
            normalizedExportLoaders.get(normalizedExportSubpath) ??
            resolveResolverLoaderForSubpath(normalizedExportSubpath),
        },
        analysis
      )
      directories.push(directory)
    }

    return directories
  }

  #resolveDerivedPath(exportKey: string) {
    const subpath = normalizeExportSubpath(exportKey)

    if (!subpath) {
      return this.#sourceRootPath
    }

    return joinPaths(this.#sourceRootPath, subpath)
  }

  #resolvePackageLocation({
    name,
    path,
    directory,
    repository,
    fileSystem,
  }: {
    name?: string
    path?: PathLike
    directory?: Directory<any, any, any> | PathLike
    repository?: Repository | RepositoryConfig | string
    fileSystem: FileSystem
  }) {
    if (path) {
      return {
        fileSystem,
        packagePath: normalizePackagePath(path),
      }
    }

    const workspacePath = tryResolveWorkspacePackage(
      name,
      fileSystem,
      directory
    )
    if (workspacePath) {
      return { fileSystem, packagePath: workspacePath }
    }

    const nodeModulesPath = tryResolveNodeModulesPackage(
      name,
      fileSystem,
      directory
    )
    if (nodeModulesPath) {
      return { fileSystem, packagePath: nodeModulesPath }
    }

    if (repository) {
      const remote = this.#resolveRepositoryPackage(repository)
      if (remote) {
        return remote
      }
    }

    if (name) {
      throw new Error(
        `[renoun] Failed to locate package "${name}". Provide a "path", install it locally, or configure a "repository".`
      )
    }

    throw new Error(
      '[renoun] A package "name" or explicit "path" must be provided.'
    )
  }

  #resolveRepositoryPackage(
    repository: Repository | RepositoryConfig | string
  ) {
    const specifier = resolveRepositorySpecifier(repository)

    if (!specifier) {
      return
    }

    const { host, owner, repo, ref, path } = specifier

    if (!owner || !repo) {
      return
    }

    if (host === 'pierre') {
      throw new Error(
        '[renoun] Pierre repositories are not supported for package export analysis.'
      )
    }

    const gitHost = host as 'github' | 'gitlab' | 'bitbucket'
    const gitFileSystem = new GitHostFileSystem({
      repository: `${owner}/${repo}`,
      host: gitHost,
      ref,
    })

    return {
      fileSystem: gitFileSystem,
      packagePath: normalizePackagePath(path ?? '.'),
    }
  }
}

export class PackageImportEntry {
  #analysis: PackageImportAnalysis

  constructor(analysis: PackageImportAnalysis) {
    this.#analysis = analysis
  }

  getImportPath() {
    return this.#analysis.key
  }

  getAnalysis() {
    return this.#analysis
  }
}

function createPackageExportModuleLoaders(
  exportLoader: PackageExportLoader<ModuleExports<any>>,
  baseSubpath?: string
): ModuleLoaders {
  const normalizedBase =
    baseSubpath && baseSubpath.length ? normalizeSlashes(baseSubpath) : ''
  const runtimeLoader: ModuleRuntimeLoader<any> = (relativePath) => {
    const normalizedRelative = relativePath
      ? normalizeSlashes(relativePath)
      : ''
    const loaderPath =
      normalizedBase && normalizedRelative
        ? `${normalizedBase}/${normalizedRelative}`
        : normalizedBase || normalizedRelative
    const normalizedPath =
      loaderPath.length && !loaderPath.startsWith('/')
        ? `/${loaderPath}`
        : loaderPath

    return exportLoader(normalizedPath)
  }

  return {
    js: runtimeLoader,
    jsx: runtimeLoader,
    ts: runtimeLoader,
    tsx: runtimeLoader,
    mjs: runtimeLoader,
    cjs: runtimeLoader,
  }
}
