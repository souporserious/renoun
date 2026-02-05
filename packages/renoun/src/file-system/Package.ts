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
import { GitVirtualFileSystem } from './GitVirtualFileSystem.ts'
import { NodeFileSystem } from './NodeFileSystem.ts'
import {
  Repository,
  parseGitSpecifier,
  type RepositoryConfig,
  type RepositoryInput,
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
  main?: string
  module?: string
  types?: string
  typings?: string
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
  repository?: RepositoryInput
  /**
   * Optional runtime loaders for individual package exports or a resolver that
   * will be invoked with the export path (e.g. "remark/add-sections").
   */
  loader?: ExportLoaders | PackageExportLoader<ModuleExports<any>>
}

type PackageEntryType = 'exports' | 'imports'
type PackageEntrySource = 'manifest' | 'override'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface PackageExportDirectory<
  Types extends Record<string, any> = Record<string, any>,
  LoaderTypes extends WithDefaultTypes<Types> = WithDefaultTypes<Types>,
> extends Directory<Types, LoaderTypes, any, undefined> {
  getExportPath(): string
  getSource(): PackageEntrySource
  isPattern(): boolean
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
  #source: PackageEntrySource
  #isPattern: boolean

  constructor(
    exportPath: string,
    options: DirectoryOptions<Types, LoaderTypes, any, undefined>,
    source: PackageEntrySource,
    isPattern: boolean
  ) {
    super(options)
    this.#exportPath = exportPath
    this.#source = source
    this.#isPattern = isPattern
  }

  getExportPath() {
    return this.#exportPath
  }

  getSource() {
    return this.#source
  }

  isPattern() {
    return this.#isPattern
  }
}

interface PackageManifestEntry {
  key: string
  type: PackageEntryType
  isPattern: boolean
}

function createManifestEntryMap(
  field: PackageJson['exports'] | PackageJson['imports'],
  type: PackageEntryType
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
    })
    return entries
  }

  if (!isPlainObject(field)) {
    return entries
  }

  for (const [key] of Object.entries(field)) {
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

function resolveRepositorySpecifier(repository?: RepositoryInput) {
  if (!repository) {
    return
  }

  const isRepositoryConfig = (
    value: RepositoryInput
  ): value is RepositoryConfig => {
    return Boolean(value && typeof value === 'object' && 'baseUrl' in value)
  }

  if (repository instanceof Repository) {
    try {
      return parseGitSpecifier(repository.toString())
    } catch {
      return undefined
    }
  }

  if (typeof repository === 'string') {
    try {
      return parseGitSpecifier(repository)
    } catch {
      return undefined
    }
  }

  if (isRepositoryConfig(repository)) {
    return {
      host: repository.host,
      owner: repository.owner,
      repo: repository.repository,
      ref: repository.branch,
      path: repository.path,
    }
  }

  if ('path' in repository) {
    try {
      return parseGitSpecifier(new Repository(repository).toString())
    } catch {
      return undefined
    }
  }
}

function isPathLikeValue(value: unknown): value is PathLike {
  if (typeof value === 'string') {
    return true
  }

  return typeof URL !== 'undefined' && value instanceof URL
}

/** How the source file(s) were resolved for an export. */
export type ExportSourceResolveKind =
  | 'override'
  | 'declarationMap'
  | 'sourceMap'
  | 'heuristic'
  | 'typesField'
  | 'legacyField'
  | 'unresolved'
  | 'unsupportedPattern'

/** Result of resolving an export to its source file(s). */
export interface ResolvedExportSource {
  /** Export subpath key: ".", "./foo", "./components/Button" */
  exportKey: string

  /** Built file we started from, relative to package root */
  builtTarget?: string

  /** Resolved source files (relative to package root) */
  sources: string[]

  /** How we got these sources */
  kind: ExportSourceResolveKind

  /** Optional extra notes (e.g. no maps, no candidates, etc.) */
  reason?: string
}

/** Options for resolving export sources. */
export interface ResolveExportSourcesOptions {
  /**
   * Manual mapping when inference is impossible or the package doesn't publish maps/sources.
   * Keys are export keys ('.', './foo', './components/Button').
   * Values are paths relative to package root (string or list of strings).
   */
  overrides?: Record<string, string | string[]>

  /**
   * Which conditional export targets to prefer when choosing a built file from `exports`.
   * You can provide a fixed list, or a function per exportKey.
   *
   * Examples:
   *   ['types', 'import', 'default', 'require']
   *   (exportKey) => exportKey === '.' ? ['types', 'default'] : ['import', 'default']
   */
  conditions?: string[] | ((exportKey: string) => string[])

  /**
   * Candidate source roots for heuristic mapping.
   * Defaults to ['src', 'lib', 'source'].
   */
  sourceRoots?: string[]

  /**
   * Optional rule-based rewrites for common build layouts.
   * These are applied to the built target *before* heuristic guessing.
   *
   * Examples:
   *   { from: /^dist\/esm\//, to: '' }
   *   { from: 'dist/', to: '' }
   */
  rewrites?: Array<{ from: string | RegExp; to: string }>
}

type FlatExportMap = Record<string, string>

const DEFAULT_EXPORT_CONDITIONS = [
  'types',
  'import',
  'module',
  'default',
  'require',
] as const

/**
 * Flatten the "exports" field into a map of export subpath → chosen built file.
 * Picks a single "primary" target for each export key based on conditions preference.
 */
function flattenExportsField(
  pkg: PackageJson,
  config: ResolveExportSourcesOptions = {}
): FlatExportMap {
  const result: FlatExportMap = {}
  const exp = pkg.exports

  if (!exp) return result

  // "exports": "./dist/index.js"
  if (typeof exp === 'string') {
    result['.'] = exp
    return result
  }

  // "exports": { ... }
  if (typeof exp === 'object' && exp !== null) {
    for (const [key, value] of Object.entries(exp)) {
      if (typeof value === 'string') {
        result[key] = value
      } else if (typeof value === 'object' && value !== null) {
        const chosen = chooseConditionalExportTarget(
          value as Record<string, any>,
          getConditionsForExportKey(config, key)
        )
        if (chosen) {
          result[key] = chosen
        }
      }
    }
  }

  return result
}

function getConditionsForExportKey(
  config: ResolveExportSourcesOptions,
  exportKey: string
): string[] {
  const c = config.conditions
  if (typeof c === 'function') return c(exportKey)
  if (Array.isArray(c) && c.length > 0) return c
  return [...DEFAULT_EXPORT_CONDITIONS]
}

function chooseConditionalExportTarget(
  record: Record<string, any>,
  conditions: string[]
): string | null {
  for (const cond of conditions) {
    const v = record[cond]
    if (typeof v === 'string') return v
  }

  // Fall back to any string-ish field if none matched our preference list.
  for (const v of Object.values(record)) {
    if (typeof v === 'string') return v
  }

  return null
}

function normalizeOverrideSources(
  overrides: ResolveExportSourcesOptions['overrides'],
  exportKey: string
): string[] {
  if (!overrides) return []
  const v = overrides[exportKey]
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

function applyRewrites(
  input: string,
  rewrites?: ResolveExportSourcesOptions['rewrites']
): string {
  if (!rewrites || rewrites.length === 0) return input
  let out = input
  for (const rule of rewrites) {
    if (typeof rule.from === 'string') {
      out = out.startsWith(rule.from)
        ? rule.to + out.slice(rule.from.length)
        : out
    } else {
      out = out.replace(rule.from, rule.to)
    }
  }
  return out
}

/**
 * Try to resolve original TS source via .d.ts.map.
 */
function resolveFromDeclarationMaps(
  fileSystem: FileSystem,
  packageRoot: string,
  pkg: PackageJson,
  exportKey: string,
  builtTarget: string
): string[] | null {
  // 1. Try root ts types (pkg.types / pkg.typings) for "." export.
  if (exportKey === '.' && (pkg.types || pkg.typings)) {
    const resolvedTypePath = String(pkg.types ?? pkg.typings)
    const fromTypes = resolveSourcesFromDtsMap(
      fileSystem,
      packageRoot,
      resolvedTypePath
    )
    if (fromTypes.length > 0) return fromTypes
  }

  // 2. Try d.ts adjacent to builtTarget (dist/index.mjs -> dist/index.d.ts.map)
  const dtsFilePath = replaceExtensionForSourceResolve(builtTarget, '.d.ts')
  const fromSibling = resolveSourcesFromDtsMap(
    fileSystem,
    packageRoot,
    dtsFilePath
  )
  if (fromSibling.length > 0) return fromSibling

  return null
}

function resolveSourcesFromDtsMap(
  fileSystem: FileSystem,
  packageRoot: string,
  dtsRelPath: string
): string[] {
  const dtsPath = joinPaths(packageRoot, dtsRelPath)
  if (!safeFileExistsSync(fileSystem, dtsPath)) return []

  const mapRel = dtsRelPath + '.map'
  const mapPath = joinPaths(packageRoot, mapRel)
  if (!safeFileExistsSync(fileSystem, mapPath)) return []

  let mapJson: any
  try {
    mapJson = JSON.parse(readTextFile(fileSystem, mapPath))
  } catch {
    return []
  }

  const sources: string[] = Array.isArray(mapJson.sources)
    ? mapJson.sources
    : []

  const mapDirRel = directoryName(dtsRelPath)
  const resolved: string[] = []

  for (const s of sources) {
    if (typeof s !== 'string') continue
    const candidateRel = normalizeSlashes(joinPaths(mapDirRel, s))
    const candidatePath = joinPaths(packageRoot, candidateRel)
    if (safeFileExistsSync(fileSystem, candidatePath)) {
      resolved.push(candidateRel)
    }
  }

  return resolved
}

/**
 * Try to resolve sources via JS source map next to builtTarget:
 *   dist/index.mjs -> dist/index.mjs.map
 */
function resolveFromJsSourceMap(
  fileSystem: FileSystem,
  packageRoot: string,
  builtTarget: string
): string[] {
  const mapRel = builtTarget + '.map'
  const mapPath = joinPaths(packageRoot, mapRel)
  if (!safeFileExistsSync(fileSystem, mapPath)) return []

  let mapJson: any
  try {
    mapJson = JSON.parse(readTextFile(fileSystem, mapPath))
  } catch {
    return []
  }

  const sources: string[] = Array.isArray(mapJson.sources)
    ? mapJson.sources
    : []

  const mapDirRel = directoryName(builtTarget)
  const resolved: string[] = []

  for (const s of sources) {
    if (typeof s !== 'string') continue
    const candidateRel = normalizeSlashes(joinPaths(mapDirRel, s))
    const candidatePath = joinPaths(packageRoot, candidateRel)
    if (safeFileExistsSync(fileSystem, candidatePath)) {
      resolved.push(candidateRel)
    }
  }

  return resolved
}

/**
 * Heuristic mapping:
 *   "dist/foo/bar.js" → "src/foo/bar.ts" / "src/foo/bar.tsx" / etc.
 *
 * This uses:
 * - optional `rewrites` to normalize build layouts (dist/esm → <root>)
 * - `sourceRoots` for candidate roots
 * - a small set of common build root folder names
 */
function guessSourceFromBuilt(
  fileSystem: FileSystem,
  packageRoot: string,
  builtTarget: string,
  config: ResolveExportSourcesOptions = {}
): string | null {
  const roots =
    config.sourceRoots && config.sourceRoots.length > 0
      ? config.sourceRoots
      : ['src', 'lib', 'source']

  const builtRoots = new Set([
    'dist',
    'build',
    'out',
    'lib',
    'esm',
    'cjs',
    'umd',
    'bundle',
    'bundles',
    '.',
  ])

  const normalizedBuilt = normalizeSlashes(builtTarget).replace(/^\.\//, '')
  const rewrittenBuilt = applyRewrites(
    normalizedBuilt,
    config.rewrites
  ).replace(/^\.\//, '')

  // Candidate “inside paths” we try mapping under sourceRoots.
  // We try:
  //   1) rewrittenBuilt as-is
  //   2) if it looks like <builtRoot>/<rest>, we also try <rest>
  const insideCandidates: string[] = []
  if (rewrittenBuilt) insideCandidates.push(rewrittenBuilt)

  const firstSegment = rewrittenBuilt.split('/')[0]
  if (firstSegment && builtRoots.has(firstSegment)) {
    const rest = rewrittenBuilt.split('/').slice(1).join('/')
    if (rest) insideCandidates.push(rest)
  }

  // Also consider original if rewrites changed it (some rewrites may be too aggressive)
  if (rewrittenBuilt !== normalizedBuilt && normalizedBuilt) {
    insideCandidates.push(normalizedBuilt)
    const firstSeg2 = normalizedBuilt.split('/')[0]
    if (firstSeg2 && builtRoots.has(firstSeg2)) {
      const rest2 = normalizedBuilt.split('/').slice(1).join('/')
      if (rest2) insideCandidates.push(rest2)
    }
  }

  const extensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx']

  for (const insidePath of dedupeStrings(insideCandidates)) {
    const insideDir = insidePath ? directoryName(insidePath) : ''
    const builtFile = insidePath
      ? baseName(insidePath)
      : baseName(rewrittenBuilt || normalizedBuilt)

    const bareName = stripKnownExtensions(builtFile)

    for (const root of roots) {
      for (const extension of extensions) {
        const candidateInside =
          insideDir && insideDir !== '.'
            ? joinPaths(insideDir, bareName + extension)
            : bareName + extension

        const candidateRel = joinPaths(root, candidateInside)
        const candidatePath = joinPaths(packageRoot, candidateRel)

        if (safeFileExistsSync(fileSystem, candidatePath)) {
          return candidateRel
        }

        // If insidePath is just "foo.js", also try `${root}/foo.ts` directly (already covered)
        // Keep a small extra fallback: `${root}/${bareName}/index.ts(x)` for barrel-ish layouts.
        const indexFilePath = joinPaths(root, bareName, 'index' + extension)
        if (
          safeFileExistsSync(fileSystem, joinPaths(packageRoot, indexFilePath))
        ) {
          return indexFilePath
        }
      }
    }
  }

  return null
}

function dedupeStrings(values: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const key = value.trim()
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

function stripKnownExtensions(file: string): string {
  const extensions = [
    '.d.ts',
    '.d.mts',
    '.d.cts',
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
  ]

  for (const extension of extensions) {
    if (file.endsWith(extension)) {
      return file.slice(0, -extension.length)
    }
  }

  // last-resort strip
  return file.replace(/\.[^.]+$/, '')
}

function replaceExtensionForSourceResolve(
  file: string,
  newExt: string
): string {
  const base = stripKnownExtensions(baseName(file))
  const directory = directoryName(file)
  return directory === '.' ? base + newExt : joinPaths(directory, base + newExt)
}

/** Handle legacy main/module/types for packages without "exports". */
function resolveLegacyEntrypoints(
  fileSystem: FileSystem,
  packageRoot: string,
  packageJson: PackageJson,
  config: ResolveExportSourcesOptions
): ResolvedExportSource[] {
  const results: ResolvedExportSource[] = []

  const add = (exportKey: string, target: string | undefined) => {
    if (!target) return

    // manual overrides still win
    const overrideSources = normalizeOverrideSources(
      config.overrides,
      exportKey
    )
    if (overrideSources.length > 0) {
      results.push({
        exportKey,
        builtTarget: target,
        sources: overrideSources,
        kind: 'override',
      })
      return
    }

    // try d.ts map (types)
    if (exportKey === '.' && (packageJson.types || packageJson.typings)) {
      const typeFilePath = String(packageJson.types ?? packageJson.typings)
      const fromTypes = resolveSourcesFromDtsMap(
        fileSystem,
        packageRoot,
        typeFilePath
      )
      if (fromTypes.length > 0) {
        results.push({
          exportKey,
          builtTarget: target,
          sources: fromTypes,
          kind: 'typesField',
        })
        return
      }
    }

    // try JS source map
    const fromJsMap = resolveFromJsSourceMap(fileSystem, packageRoot, target)
    if (fromJsMap.length > 0) {
      results.push({
        exportKey,
        builtTarget: target,
        sources: fromJsMap,
        kind: 'sourceMap',
      })
      return
    }

    // fallback heuristic
    const heuristicSource = guessSourceFromBuilt(
      fileSystem,
      packageRoot,
      target,
      config
    )
    if (heuristicSource) {
      results.push({
        exportKey,
        builtTarget: target,
        sources: [heuristicSource],
        kind: 'legacyField',
      })
      return
    }

    results.push({
      exportKey,
      builtTarget: target,
      sources: [],
      kind: 'unresolved',
      reason: 'No maps or heuristic matches for legacy main/module field.',
    })
  }

  add(
    '.',
    packageJson.main ||
      packageJson.module ||
      packageJson.types ||
      packageJson.typings
  )

  return results
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
  #repository?: Repository
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
      repository: repositoryInstance,
      fileSystem: options.fileSystem ?? new NodeFileSystem(),
    })

    this.#fileSystem = fileSystem
    this.#packagePath = packagePath
    this.#name = options.name
    this.#repository = repositoryInstance
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

  /**
   * Resolve package exports to their original source files.
   *
   * This method attempts to reverse-engineer built files back to their source
   * files using the following strategies (in order):
   *
   * 1. **Manual overrides** - User-provided mappings
   * 2. **Declaration maps** - `.d.ts.map` files pointing to original TS/TSX
   * 3. **Source maps** - `.js.map` / `.mjs.map` files pointing to sources
   * 4. **Heuristics** - Pattern-based guessing (optionally aided by `rewrites`)
   */
  resolveExportSources(
    config: ResolveExportSourcesOptions = {}
  ): ResolvedExportSource[] {
    this.#ensurePackageJsonLoaded()
    const pkg = this.#packageJson!

    const exportTargets = flattenExportsField(pkg, config)
    const results: ResolvedExportSource[] = []

    // 1. Resolve entries from "exports"
    for (const [exportKey, builtTarget] of Object.entries(exportTargets)) {
      // Wildcards are tricky – mark as unsupported for now.
      if (exportKey.includes('*') || builtTarget.includes('*')) {
        results.push({
          exportKey,
          builtTarget,
          sources: [],
          kind: 'unsupportedPattern',
          reason: 'Wildcard exports are not supported by this resolver yet.',
        })
        continue
      }

      // 1) Manual overrides win.
      const overrideSources = normalizeOverrideSources(
        config.overrides,
        exportKey
      )
      if (overrideSources.length > 0) {
        results.push({
          exportKey,
          builtTarget,
          sources: overrideSources,
          kind: 'override',
        })
        continue
      }

      // 2) Try declaration maps first (TS-centric).
      const fromDtsMap = resolveFromDeclarationMaps(
        this.#fileSystem,
        this.#packagePath,
        pkg,
        exportKey,
        builtTarget
      )
      if (fromDtsMap) {
        results.push({
          exportKey,
          builtTarget,
          sources: fromDtsMap,
          kind: 'declarationMap',
        })
        continue
      }

      // 3) Try JS source maps.
      const fromJsMap = resolveFromJsSourceMap(
        this.#fileSystem,
        this.#packagePath,
        builtTarget
      )
      if (fromJsMap.length > 0) {
        results.push({
          exportKey,
          builtTarget,
          sources: fromJsMap,
          kind: 'sourceMap',
        })
        continue
      }

      // 4) Heuristic mapping dist/lib → src/lib (optionally aided by rewrites).
      const heuristicSource = guessSourceFromBuilt(
        this.#fileSystem,
        this.#packagePath,
        builtTarget,
        config
      )
      if (heuristicSource) {
        results.push({
          exportKey,
          builtTarget,
          sources: [heuristicSource],
          kind: 'heuristic',
        })
        continue
      }

      // We didn't find anything useful.
      results.push({
        exportKey,
        builtTarget,
        sources: [],
        kind: 'unresolved',
        reason:
          'No declaration/source maps found, and heuristic guesses did not match any existing file.',
      })
    }

    // 2. Legacy main/module/types if there is no "exports"
    if (!pkg.exports) {
      const legacy = resolveLegacyEntrypoints(
        this.#fileSystem,
        this.#packagePath,
        pkg,
        config
      )
      results.push(...legacy)
    }

    return results
  }

  /** Resolve a single export key to its source file(s). */
  resolveExportSource(
    /** The export key to resolve (e.g., ".", "./utils", "./components/Button"). */
    exportKey: string,

    /** Options for source resolution. */
    options: ResolveExportSourcesOptions = {}
  ): ResolvedExportSource | undefined {
    const allSources = this.resolveExportSources(options)
    return allSources.find((source) => source.exportKey === exportKey)
  }

  /**
   * Get the source file path for the main export (".").
   *
   * This is a convenience method that returns the first source file
   * for the main package export.
   */
  getMainSourcePath(
    options: ResolveExportSourcesOptions = {}
  ): string | undefined {
    const mainExport = this.resolveExportSource('.', options)
    return mainExport?.sources[0]
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
      const baseSubpath = normalizeExportSubpath(exportPath)
      const manifestPattern = patternBases.has(baseSubpath)
      const isPattern =
        (directory.isPattern() ?? isWildcardExport(exportPath)) ||
        manifestPattern
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
          new PackageImportEntry(entry.key, entry.isPattern, 'manifest')
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
          'exports'
        )
      }

      return this.#exportManifestEntries
    }

    if (!this.#importManifestEntries) {
      this.#importManifestEntries = createManifestEntryMap(
        this.#packageJson!.imports,
        'imports'
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
      const source: PackageEntrySource = manifestEntry ? 'manifest' : 'override'
      const isPattern = manifestEntry?.isPattern ?? isWildcardExport(exportKey)
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
        source,
        isPattern
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
    repository?: Repository
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

  #resolveRepositoryPackage(repository: RepositoryInput) {
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
    const gitFileSystem = new GitVirtualFileSystem({
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
  #key: string
  #isPattern: boolean
  #source: PackageEntrySource

  constructor(key: string, isPattern: boolean, source: PackageEntrySource) {
    this.#key = key
    this.#isPattern = isPattern
    this.#source = source
  }

  getImportPath() {
    return this.#key
  }

  getSource() {
    return this.#source
  }

  isPattern() {
    return this.#isPattern
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
