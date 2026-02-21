import { dirname, join } from 'node:path'
import type {
  SourceFile,
  SyntaxKind,
  Project,
  ts as TsMorphTS,
} from '../utils/ts-morph.ts'
import { getTsMorph } from '../utils/ts-morph.ts'
import { hashString, stableStringify } from '../utils/stable-serialization.ts'

import { getRootDirectory } from '../utils/get-root-directory.ts'
import {
  createPersistentCacheNodeKey,
  normalizeCachePath,
  serializeTypeFilterForCache,
} from '../file-system/cache-key.ts'
import {
  CacheStore,
  type CacheStoreComputeContext,
  type CacheStoreConstDependency,
} from '../file-system/Cache.ts'
import { getCacheStorePersistence } from '../file-system/CacheSqlite.ts'
import { FileSystemSnapshot } from '../file-system/Snapshot.ts'
import type { ModuleExport } from '../utils/get-file-exports.ts'
import {
  getFileExports as baseGetFileExports,
  getFileExportMetadata as baseGetFileExportMetadata,
} from '../utils/get-file-exports.ts'
import type {
  GetSourceTextMetadataOptions,
  SourceTextMetadata,
} from '../utils/get-source-text-metadata.ts'
import { getSourceTextMetadata as baseGetSourceTextMetadata } from '../utils/get-source-text-metadata.ts'
import { getFileExportStaticValue as baseGetFileExportStaticValue } from '../utils/get-file-export-static-value.ts'
import { getFileExportText as baseGetFileExportText } from '../utils/get-file-export-text.ts'
import { getOutlineRanges as baseGetOutlineRanges } from '../utils/get-outline-ranges.ts'
import type { GetTokensOptions, TokenizedLines } from '../utils/get-tokens.ts'
import { getTokens as baseGetTokens } from '../utils/get-tokens.ts'
import {
  resolveTypeAtLocationWithDependencies as baseResolveTypeAtLocationWithDependencies,
  type ResolvedTypeAtLocationResult,
} from '../utils/resolve-type-at-location.ts'
import type { TypeFilter } from '../utils/resolve-type.ts'
import { transpileSourceFile as baseTranspileSourceFile } from '../utils/transpile-source-file.ts'
import type { OutlineRange } from '../utils/get-outline-ranges.ts'
import type { ProjectCacheDependency } from './cache.ts'
import { createProjectFileCache, invalidateProjectFileCache } from './cache.ts'

const FILE_EXPORTS_CACHE_NAME = 'fileExports'
const OUTLINE_RANGES_CACHE_NAME = 'outlineRanges'
const FILE_EXPORT_METADATA_CACHE_NAME = 'fileExportMetadata'
const FILE_EXPORT_STATIC_VALUE_CACHE_NAME = 'fileExportStaticValue'
const FILE_EXPORT_TEXT_CACHE_NAME = 'fileExportText'
const FILE_EXPORTS_TEXT_PROJECT_CACHE_NAME = 'fileExportsText'
const RESOLVE_TYPE_AT_LOCATION_CACHE_NAME = 'resolveTypeAtLocation'
const TRANSPILE_SOURCE_FILE_CACHE_NAME = 'transpileSourceFile'
const TOKENS_CACHE_NAME = 'tokens'
const SOURCE_TEXT_METADATA_CACHE_NAME = 'sourceTextMetadata'
const TYPE_SCRIPT_DEPENDENCY_ANALYSIS_CACHE_NAME = 'typeScriptDependencyAnalysis'
const MODULE_RESOLUTION_CACHE_NAME = 'moduleResolution'
const RUNTIME_ANALYSIS_CACHE_SCOPE = 'project-analysis-runtime'
const RUNTIME_ANALYSIS_CACHE_VERSION = '1'
const RUNTIME_ANALYSIS_CACHE_VERSION_DEP = 'runtime-analysis-cache-version'
const PROJECT_COMPILER_OPTIONS_DEP = 'project:compiler-options'
const MAX_TS_DEPENDENCY_ANALYSIS_FILES = 10_000
const MODULE_RESOLUTION_FILE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.d.ts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
] as const

const { ts } = getTsMorph()

interface RuntimeAnalysisCacheStore {
  store: CacheStore
  fileSystem: RuntimeAnalysisFileSystem
  snapshot: FileSystemSnapshot
}

interface RuntimeAnalysisFileSystem {
  getAbsolutePath(path: string): string
  getRelativePathToWorkspace(path: string): string
  fileExistsSync(path: string): boolean
  readFileSync(path: string): string
}

let runtimeAnalysisCacheStore:
  | RuntimeAnalysisCacheStore
  | null
  | undefined
let runtimeAnalysisCacheStorePromise:
  | Promise<RuntimeAnalysisCacheStore | null>
  | undefined
let runtimeAnalysisPersistedInvalidationQueue: Promise<void> = Promise.resolve()
const pendingRuntimeAnalysisPersistedInvalidationPaths = new Set<string>()
let isRuntimeAnalysisPersistedInvalidationFlushQueued = false

async function getRuntimeAnalysisCacheStore(): Promise<
  RuntimeAnalysisCacheStore | undefined
> {
  if (runtimeAnalysisCacheStore !== undefined) {
    return runtimeAnalysisCacheStore ?? undefined
  }

  if (!runtimeAnalysisCacheStorePromise) {
    runtimeAnalysisCacheStorePromise = (async () => {
      try {
        const { NodeFileSystem } = await import('../file-system/NodeFileSystem.ts')
        const fileSystem = new NodeFileSystem()
        const snapshot = new FileSystemSnapshot(fileSystem)
        const projectRoot = resolveRuntimeAnalysisProjectRoot(fileSystem)
        const persistence = projectRoot
          ? getCacheStorePersistence({ projectRoot })
          : getCacheStorePersistence()

        return {
          store: new CacheStore({
            snapshot,
            persistence,
          }),
          fileSystem,
          snapshot,
        } satisfies RuntimeAnalysisCacheStore
      } catch {
        return null
      }
    })()
  }

  runtimeAnalysisCacheStore = await runtimeAnalysisCacheStorePromise

  return runtimeAnalysisCacheStore ?? undefined
}

function queueRuntimeAnalysisPersistedDependencyInvalidation(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  path: string
): void {
  pendingRuntimeAnalysisPersistedInvalidationPaths.add(normalizeCachePath(path))
  if (isRuntimeAnalysisPersistedInvalidationFlushQueued) {
    return
  }

  isRuntimeAnalysisPersistedInvalidationFlushQueued = true
  runtimeAnalysisPersistedInvalidationQueue =
    runtimeAnalysisPersistedInvalidationQueue
      .catch(() => {})
      .then(async () => {
        isRuntimeAnalysisPersistedInvalidationFlushQueued = false

        const pendingPaths = Array.from(
          pendingRuntimeAnalysisPersistedInvalidationPaths
        )
        pendingRuntimeAnalysisPersistedInvalidationPaths.clear()
        const invalidationPaths = toDedupedRuntimeInvalidationPaths(
          pendingPaths
        )

        for (const invalidationPath of invalidationPaths) {
          try {
            await runtimeCacheStore.store.deleteByDependencyPath(invalidationPath)
          } catch {
            // Best-effort persisted invalidation.
          }
        }
      })
}

function toDedupedRuntimeInvalidationPaths(paths: readonly string[]): string[] {
  const normalizedPaths = Array.from(
    new Set(paths.map((path) => normalizeCachePath(path)))
  )
  if (normalizedPaths.length === 0) {
    return []
  }

  if (normalizedPaths.includes('.')) {
    return ['.']
  }

  normalizedPaths.sort((first, second) => {
    const firstDepth = first.split('/').length
    const secondDepth = second.split('/').length
    if (firstDepth !== secondDepth) {
      return firstDepth - secondDepth
    }
    return first.localeCompare(second)
  })

  const deduped: string[] = []
  for (const candidatePath of normalizedPaths) {
    const coveredByExisting = deduped.some((existingPath) => {
      return (
        candidatePath === existingPath ||
        candidatePath.startsWith(`${existingPath}/`)
      )
    })
    if (coveredByExisting) {
      continue
    }

    deduped.push(candidatePath)
  }

  return deduped
}

export function invalidateRuntimeAnalysisCachePath(path: string): void {
  void (async () => {
    const runtimeCacheStore = await getRuntimeAnalysisCacheStore()
    if (!runtimeCacheStore) {
      return
    }

    runtimeCacheStore.snapshot.invalidatePath(path)
    queueRuntimeAnalysisPersistedDependencyInvalidation(runtimeCacheStore, path)
  })()
}

export function invalidateRuntimeAnalysisCacheAll(): void {
  void (async () => {
    const runtimeCacheStore = await getRuntimeAnalysisCacheStore()
    if (!runtimeCacheStore) {
      return
    }

    runtimeCacheStore.snapshot.invalidateAll()
    queueRuntimeAnalysisPersistedDependencyInvalidation(runtimeCacheStore, '.')
  })()
}

function resolveRuntimeAnalysisProjectRoot(
  fileSystem: RuntimeAnalysisFileSystem
): string | undefined {
  try {
    return getRootDirectory(fileSystem.getAbsolutePath('.'))
  } catch {
    return undefined
  }
}

function toSourceTextMetadataValueSignature(value: string): string {
  return `${hashString(value)}:${value.length}`
}

function toTokenValueSignature(value: string): string {
  return `${hashString(value)}:${value.length}`
}

function getThemeNamesForCache(
  themeConfig: GetTokensOptions['theme']
): string[] {
  if (!themeConfig) {
    return ['default']
  }

  if (typeof themeConfig === 'string') {
    return [themeConfig]
  }

  if (Array.isArray(themeConfig)) {
    const themeValue = themeConfig[0]
    return [themeValue]
  }

  const resolvedThemeNames = Object.values(themeConfig).map((themeValue) =>
    typeof themeValue === 'string' ? themeValue : themeValue[0]
  )

  return resolvedThemeNames.length > 0 ? resolvedThemeNames : ['default']
}

function getThemeSignature(themeConfig: GetTokensOptions['theme']): string {
  return hashString(stableStringify(themeConfig ?? 'default'))
}

function createRuntimeAnalysisCacheNodeKey(
  namespace: string,
  payload: unknown
): string {
  return createPersistentCacheNodeKey({
    domain: RUNTIME_ANALYSIS_CACHE_SCOPE,
    domainVersion: RUNTIME_ANALYSIS_CACHE_VERSION,
    namespace,
    payload,
  })
}

function normalizeCacheFilePath(path: string | undefined): string | undefined {
  if (!path) {
    return undefined
  }

  return normalizeCachePath(path)
}

interface SourceFileDependencyLink {
  moduleSpecifier: string
  sourceFilePath?: string
  moduleResolutionNodeKey?: string
}

interface SourceFileDependencyLinksResult {
  links: SourceFileDependencyLink[]
}

interface TypeScriptDependencyAnalysis {
  dependencyFilePaths: string[]
  moduleResolutionNodeKeys: string[]
  packageDependencies: Array<{
    packageName: string
    importerPaths: string[]
  }>
}

interface ModuleSpecifierResolutionResult {
  sourceFilePath?: string
  moduleResolutionNodeKey?: string
}

interface RuntimeTypeScriptDependencyAnalysisResult {
  nodeKey: string
  dependencyFilePaths: string[]
}

interface PackageVersionDependencyResolution {
  dependencyFilePaths: string[]
}

interface PackageManifest {
  version?: unknown
  dependencies?: Record<string, unknown>
  devDependencies?: Record<string, unknown>
  peerDependencies?: Record<string, unknown>
  optionalDependencies?: Record<string, unknown>
}

function normalizeModuleSpecifier(moduleSpecifier: string): string {
  if (moduleSpecifier.startsWith('npm:')) {
    return moduleSpecifier.slice('npm:'.length)
  }

  return moduleSpecifier
}

function getModuleSpecifierTextFromCompilerNode(
  node: TsMorphTS.Node | undefined
): string | undefined {
  if (!node) {
    return undefined
  }

  if (ts.isStringLiteralLike(node)) {
    return node.text
  }

  return undefined
}

function collectSourceFileModuleSpecifiers(
  sourceFile: SourceFile
): string[] {
  const moduleSpecifiers = new Set<string>()
  const addModuleSpecifier = (moduleSpecifier: string | undefined): void => {
    if (!moduleSpecifier || moduleSpecifier.length === 0) {
      return
    }

    moduleSpecifiers.add(moduleSpecifier)
  }

  const visitNode = (node: TsMorphTS.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleSpecifier = getModuleSpecifierTextFromCompilerNode(
        node.moduleSpecifier
      )
      addModuleSpecifier(moduleSpecifier)
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        const moduleSpecifier = getModuleSpecifierTextFromCompilerNode(
          node.moduleReference.expression
        )
        addModuleSpecifier(moduleSpecifier)
      }
    } else if (ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument)) {
        const moduleSpecifier = getModuleSpecifierTextFromCompilerNode(
          node.argument.literal
        )
        addModuleSpecifier(moduleSpecifier)
      }
    }

    ts.forEachChild(node, visitNode)
  }

  visitNode(sourceFile.compilerNode)

  return Array.from(moduleSpecifiers.values())
}

function isModuleSpecifierRelativeOrAbsolute(moduleSpecifier: string): boolean {
  return (
    moduleSpecifier.startsWith('.') ||
    moduleSpecifier.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(moduleSpecifier)
  )
}

function resolveSourceFileByPathCandidates(
  project: Project,
  basePath: string
): string | undefined {
  const candidatePaths = new Set<string>()
  candidatePaths.add(basePath)
  candidatePaths.add(normalizeCachePath(basePath))

  for (const extension of MODULE_RESOLUTION_FILE_EXTENSIONS) {
    candidatePaths.add(`${basePath}${extension}`)
    candidatePaths.add(normalizeCachePath(`${basePath}${extension}`))
    candidatePaths.add(join(basePath, `index${extension}`))
    candidatePaths.add(normalizeCachePath(join(basePath, `index${extension}`)))
  }

  for (const candidatePath of candidatePaths) {
    const sourceFile = project.getSourceFile(candidatePath)
    if (sourceFile) {
      return sourceFile.getFilePath()
    }
  }

  return undefined
}

function resolveModuleSpecifierSourceFilePathUncached(
  project: Project,
  containingFilePath: string,
  normalizedModuleSpecifier: string
): string | undefined {
  const resolvedModuleSpecifierSourceFile = project.getSourceFile(
    normalizedModuleSpecifier
  )
  if (resolvedModuleSpecifierSourceFile) {
    return resolvedModuleSpecifierSourceFile.getFilePath()
  }

  if (isModuleSpecifierRelativeOrAbsolute(normalizedModuleSpecifier)) {
    const baseCandidatePath =
      normalizedModuleSpecifier.startsWith('.')
        ? join(dirname(containingFilePath), normalizedModuleSpecifier)
        : normalizedModuleSpecifier

    const resolvedCandidateSourceFilePath = resolveSourceFileByPathCandidates(
      project,
      baseCandidatePath
    )
    if (resolvedCandidateSourceFilePath) {
      return resolvedCandidateSourceFilePath
    }
  }

  try {
    const resolutionResult = ts.resolveModuleName(
      normalizedModuleSpecifier,
      containingFilePath,
      project.getCompilerOptions(),
      ts.sys
    )
    const resolvedFileName = resolutionResult.resolvedModule?.resolvedFileName
    if (resolvedFileName) {
      const resolvedSourceFile = project.getSourceFile(resolvedFileName)
      return resolvedSourceFile?.getFilePath() ?? resolvedFileName
    }
  } catch {
    // Ignore module resolution failures and leave dependency unresolved.
  }

  return undefined
}

function createRuntimeModuleResolutionCacheNodeKey(payload: {
  compilerOptionsVersion: string
  containingFilePath: string
  moduleSpecifier: string
}): string {
  return createRuntimeAnalysisCacheNodeKey(MODULE_RESOLUTION_CACHE_NAME, {
    compilerOptionsVersion: payload.compilerOptionsVersion,
    containingFilePath: normalizeCachePath(payload.containingFilePath),
    moduleSpecifier: payload.moduleSpecifier,
  })
}

async function resolveModuleSpecifierSourceFilePath(
  project: Project,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  compilerOptionsVersion: string,
  containingFilePath: string,
  moduleSpecifier: string,
  moduleResolutionByKey: Map<string, ModuleSpecifierResolutionResult>
): Promise<ModuleSpecifierResolutionResult> {
  const normalizedModuleSpecifier = normalizeModuleSpecifier(moduleSpecifier)
  if (!normalizedModuleSpecifier) {
    return {}
  }

  const cacheKey = `${normalizeCachePath(containingFilePath)}:${normalizedModuleSpecifier}`
  if (moduleResolutionByKey.has(cacheKey)) {
    return moduleResolutionByKey.get(cacheKey) ?? {}
  }

  const shouldUseRuntimeCache =
    isModuleSpecifierRelativeOrAbsolute(normalizedModuleSpecifier) &&
    canUseRuntimePathCache(runtimeCacheStore, containingFilePath)

  if (!shouldUseRuntimeCache) {
    const sourceFilePath = resolveModuleSpecifierSourceFilePathUncached(
      project,
      containingFilePath,
      normalizedModuleSpecifier
    )
    const resolution: ModuleSpecifierResolutionResult = {
      sourceFilePath,
    }
    moduleResolutionByKey.set(cacheKey, resolution)
    return resolution
  }

  const runtimeConstDeps = getRuntimeAnalysisConstDeps(compilerOptionsVersion)
  const moduleResolutionNodeKey = createRuntimeModuleResolutionCacheNodeKey({
    compilerOptionsVersion,
    containingFilePath,
    moduleSpecifier: normalizedModuleSpecifier,
  })

  const value = await runtimeCacheStore.store.getOrCompute(
    moduleResolutionNodeKey,
    {
      persist: true,
      constDeps: runtimeConstDeps,
    },
    async (context) => {
      recordConstDependencies(context, runtimeConstDeps)

      await recordProjectConfigDependency(context, runtimeCacheStore, project)
      await recordFileDependencyIfPossible(
        context,
        runtimeCacheStore,
        containingFilePath
      )

      if (isModuleSpecifierRelativeOrAbsolute(normalizedModuleSpecifier)) {
        const baseCandidatePath = normalizedModuleSpecifier.startsWith('.')
          ? join(dirname(containingFilePath), normalizedModuleSpecifier)
          : normalizedModuleSpecifier
        await recordDirectoryDependencyIfPossible(
          context,
          runtimeCacheStore,
          dirname(baseCandidatePath)
        )
      }

      const sourceFilePath = resolveModuleSpecifierSourceFilePathUncached(
        project,
        containingFilePath,
        normalizedModuleSpecifier
      )
      await recordFileDependencyIfPossible(
        context,
        runtimeCacheStore,
        sourceFilePath
      )

      return {
        sourceFilePath: sourceFilePath ?? null,
      }
    }
  )

  const resolution: ModuleSpecifierResolutionResult = {
    sourceFilePath: value.sourceFilePath ?? undefined,
    moduleResolutionNodeKey,
  }
  moduleResolutionByKey.set(cacheKey, resolution)
  return resolution
}

async function getSourceFileDependencyLinks(
  project: Project,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  compilerOptionsVersion: string,
  sourceFile: SourceFile,
  moduleResolutionByKey: Map<string, ModuleSpecifierResolutionResult>
): Promise<SourceFileDependencyLinksResult> {
  const links: SourceFileDependencyLink[] = []
  const seenLinkKeys = new Set<string>()
  const containingFilePath = sourceFile.getFilePath()
  const moduleSpecifiers = collectSourceFileModuleSpecifiers(sourceFile)

  for (const moduleSpecifier of moduleSpecifiers) {
    const resolution = await resolveModuleSpecifierSourceFilePath(
      project,
      runtimeCacheStore,
      compilerOptionsVersion,
      containingFilePath,
      moduleSpecifier,
      moduleResolutionByKey
    )
    const linkKey = `${moduleSpecifier}:${resolution.sourceFilePath ?? 'missing'}:${resolution.moduleResolutionNodeKey ?? 'none'}`
    if (seenLinkKeys.has(linkKey)) {
      continue
    }
    seenLinkKeys.add(linkKey)

    links.push({
      moduleSpecifier,
      sourceFilePath: resolution.sourceFilePath,
      moduleResolutionNodeKey: resolution.moduleResolutionNodeKey,
    })
  }

  return {
    links,
  }
}

function isWorkspacePath(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  path: string
): boolean {
  try {
    runtimeCacheStore.fileSystem.getRelativePathToWorkspace(path)
    return true
  } catch {
    return false
  }
}

function shouldTraverseDependencySourceFile(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  sourceFile: SourceFile
): boolean {
  if (sourceFile.isFromExternalLibrary()) {
    return false
  }

  const dependencyPath = sourceFile.getFilePath()

  if (normalizeCachePath(dependencyPath).includes('/node_modules/')) {
    return false
  }

  return isWorkspacePath(runtimeCacheStore, dependencyPath)
}

function shouldTraverseDependencyPath(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  dependencyPath: string
): boolean {
  if (!isWorkspacePath(runtimeCacheStore, dependencyPath)) {
    return false
  }

  return !normalizeCachePath(dependencyPath).includes('/node_modules/')
}

function isPathWithinRoot(path: string, rootPath: string): boolean {
  const normalizedPath = normalizeCachePath(path)
  const normalizedRootPath = normalizeCachePath(rootPath)
  return (
    normalizedPath === normalizedRootPath ||
    normalizedPath.startsWith(`${normalizedRootPath}/`)
  )
}

function getProjectDependencyBoundaryPath(project: Project): string | undefined {
  const compilerOptions = project.getCompilerOptions() as {
    configFilePath?: string
  }
  const configFilePath = compilerOptions.configFilePath
  if (!configFilePath) {
    return undefined
  }

  return dirname(configFilePath)
}

function shouldRecordLocalWorkspaceDependencyPath(options: {
  runtimeCacheStore: RuntimeAnalysisCacheStore
  dependencyPath: string
  moduleSpecifier: string
  projectDependencyBoundaryPath: string | undefined
}): boolean {
  const {
    runtimeCacheStore,
    dependencyPath,
    moduleSpecifier,
    projectDependencyBoundaryPath,
  } = options
  if (!isWorkspacePath(runtimeCacheStore, dependencyPath)) {
    return false
  }

  const normalizedDependencyPath = normalizeCachePath(dependencyPath)
  if (normalizedDependencyPath.includes('/node_modules/')) {
    return false
  }

  if (isModuleSpecifierRelativeOrAbsolute(moduleSpecifier)) {
    return true
  }

  if (!projectDependencyBoundaryPath) {
    return true
  }

  return isPathWithinRoot(dependencyPath, projectDependencyBoundaryPath)
}

function getPackageNameFromModuleSpecifier(
  moduleSpecifier: string | undefined
): string | undefined {
  if (!moduleSpecifier) {
    return undefined
  }

  if (
    moduleSpecifier.startsWith('.') ||
    moduleSpecifier.startsWith('/') ||
    moduleSpecifier.startsWith('#') ||
    moduleSpecifier.startsWith('node:')
  ) {
    return undefined
  }

  if (/^[A-Za-z]:[\\/]/.test(moduleSpecifier)) {
    return undefined
  }

  const normalizedSpecifier = normalizeModuleSpecifier(moduleSpecifier)

  if (!normalizedSpecifier) {
    return undefined
  }

  if (normalizedSpecifier.startsWith('@')) {
    const [scope, packageName] = normalizedSpecifier.split('/')
    if (!scope || scope === '@' || !packageName) {
      return undefined
    }

    return `${scope}/${packageName}`
  }

  const [packageName] = normalizedSpecifier.split('/')
  return packageName || undefined
}

async function collectTypeScriptDependencyAnalysis(
  project: Project,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  filePath: string
): Promise<TypeScriptDependencyAnalysis> {
  const sourceFile = project.getSourceFile(filePath)
  const projectDependencyBoundaryPath = getProjectDependencyBoundaryPath(project)
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (!sourceFile) {
    return {
      dependencyFilePaths: [],
      moduleResolutionNodeKeys: [],
      packageDependencies: [],
    }
  }

  const dependencyPaths = new Set<string>()
  const moduleResolutionNodeKeys = new Set<string>()
  const packageImportersByName = new Map<string, Set<string>>()
  const visitedSourceFilePaths = new Set<string>()
  const sourceFileQueue: SourceFile[] = [sourceFile]
  const moduleResolutionByKey = new Map<string, ModuleSpecifierResolutionResult>()
  const dependencyLinksBySourceFilePath = new Map<
    string,
    Promise<SourceFileDependencyLinksResult>
  >()
  let dependencyAnalysisLimitReached = false

  const getDependencyLinksForSourceFile = (
    targetSourceFile: SourceFile
  ): Promise<SourceFileDependencyLinksResult> => {
    const sourceFilePathKey = normalizeCachePath(targetSourceFile.getFilePath())
    const cachedLinks = dependencyLinksBySourceFilePath.get(sourceFilePathKey)
    if (cachedLinks) {
      return cachedLinks
    }

    const resolvedLinks = getSourceFileDependencyLinks(
      project,
      runtimeCacheStore,
      compilerOptionsVersion,
      targetSourceFile,
      moduleResolutionByKey
    )
    dependencyLinksBySourceFilePath.set(sourceFilePathKey, resolvedLinks)
    return resolvedLinks
  }

  while (sourceFileQueue.length > 0) {
    if (visitedSourceFilePaths.size >= MAX_TS_DEPENDENCY_ANALYSIS_FILES) {
      dependencyAnalysisLimitReached = true
      break
    }

    const currentSourceFile = sourceFileQueue.shift()!
    const currentSourceFilePath = currentSourceFile.getFilePath()
    const normalizedCurrentSourceFilePath = normalizeCachePath(currentSourceFilePath)

    if (visitedSourceFilePaths.has(normalizedCurrentSourceFilePath)) {
      continue
    }

    visitedSourceFilePaths.add(normalizedCurrentSourceFilePath)

    for (const link of (await getDependencyLinksForSourceFile(currentSourceFile))
      .links) {
      if (link.moduleResolutionNodeKey) {
        moduleResolutionNodeKeys.add(link.moduleResolutionNodeKey)
      }

      const dependencyPath = link.sourceFilePath
      const normalizedDependencyPath =
        typeof dependencyPath === 'string'
          ? normalizeCachePath(dependencyPath)
          : undefined
      const isLocalWorkspaceDependencyPath =
        normalizedDependencyPath !== undefined &&
        typeof dependencyPath === 'string' &&
        shouldRecordLocalWorkspaceDependencyPath({
          runtimeCacheStore,
          dependencyPath,
          moduleSpecifier: link.moduleSpecifier,
          projectDependencyBoundaryPath,
        })

      if (isLocalWorkspaceDependencyPath && dependencyPath) {
        dependencyPaths.add(dependencyPath)
      }

      if (isLocalWorkspaceDependencyPath && dependencyPath) {
        const dependencySourceFile = project.getSourceFile(dependencyPath)
        if (
          dependencySourceFile &&
          shouldTraverseDependencySourceFile(
            runtimeCacheStore,
            dependencySourceFile
          ) &&
          shouldTraverseDependencyPath(runtimeCacheStore, dependencyPath)
        ) {
          sourceFileQueue.push(dependencySourceFile)
        }
      }

      if (isLocalWorkspaceDependencyPath) {
        continue
      }

      const packageName = getPackageNameFromModuleSpecifier(link.moduleSpecifier)
      if (!packageName) {
        continue
      }

      let importerPaths = packageImportersByName.get(packageName)
      if (!importerPaths) {
        importerPaths = new Set<string>()
        packageImportersByName.set(packageName, importerPaths)
      }
      importerPaths.add(currentSourceFilePath)
    }
  }

  if (dependencyAnalysisLimitReached) {
    for (const projectSourceFile of project.getSourceFiles()) {
      const projectSourceFilePath = projectSourceFile.getFilePath()
      if (!isWorkspacePath(runtimeCacheStore, projectSourceFilePath)) {
        continue
      }
      if (normalizeCachePath(projectSourceFilePath).includes('/node_modules/')) {
        continue
      }
      if (
        projectDependencyBoundaryPath &&
        !isPathWithinRoot(projectSourceFilePath, projectDependencyBoundaryPath)
      ) {
        continue
      }
      dependencyPaths.add(projectSourceFilePath)

      for (const link of (await getDependencyLinksForSourceFile(projectSourceFile))
        .links) {
        if (link.moduleResolutionNodeKey) {
          moduleResolutionNodeKeys.add(link.moduleResolutionNodeKey)
        }

        const dependencyPath = link.sourceFilePath
        const normalizedDependencyPath =
          typeof dependencyPath === 'string'
            ? normalizeCachePath(dependencyPath)
            : undefined
        const isLocalWorkspaceDependencyPath =
          typeof dependencyPath === 'string' &&
          normalizedDependencyPath !== undefined &&
          shouldRecordLocalWorkspaceDependencyPath({
            runtimeCacheStore,
            dependencyPath,
            moduleSpecifier: link.moduleSpecifier,
            projectDependencyBoundaryPath,
          })
        if (isLocalWorkspaceDependencyPath) {
          continue
        }

        const packageName = getPackageNameFromModuleSpecifier(link.moduleSpecifier)
        if (!packageName) {
          continue
        }

        let importerPaths = packageImportersByName.get(packageName)
        if (!importerPaths) {
          importerPaths = new Set<string>()
          packageImportersByName.set(packageName, importerPaths)
        }

        importerPaths.add(projectSourceFilePath)
      }
    }
  }

  const packageDependencies = Array.from(packageImportersByName.entries())
    .map(([packageName, importerPaths]) => ({
      packageName,
      importerPaths: Array.from(importerPaths.values()).sort((a, b) =>
        a.localeCompare(b)
      ),
    }))
    .sort((a, b) => a.packageName.localeCompare(b.packageName))

  return {
    dependencyFilePaths: Array.from(dependencyPaths.values()),
    moduleResolutionNodeKeys: Array.from(moduleResolutionNodeKeys.values()),
    packageDependencies,
  }
}

function getDependencyVersionFromPackageManifest(
  packageManifest: PackageManifest,
  packageName: string
): string | undefined {
  const dependencyGroups = [
    packageManifest.dependencies,
    packageManifest.devDependencies,
    packageManifest.peerDependencies,
    packageManifest.optionalDependencies,
  ]

  for (const dependencyGroup of dependencyGroups) {
    const dependencyVersion = dependencyGroup?.[packageName]
    if (typeof dependencyVersion === 'string' && dependencyVersion.length > 0) {
      return dependencyVersion
    }
  }

  return undefined
}

function readPackageManifest(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  packageManifestByPath: Map<string, PackageManifest | null>,
  packageManifestPath: string
): PackageManifest | null {
  const normalizedPackageManifestPath = normalizeCachePath(packageManifestPath)
  const cachedPackageManifest = packageManifestByPath.get(
    normalizedPackageManifestPath
  )

  if (cachedPackageManifest !== undefined) {
    return cachedPackageManifest
  }

  try {
    if (!runtimeCacheStore.fileSystem.fileExistsSync(packageManifestPath)) {
      packageManifestByPath.set(normalizedPackageManifestPath, null)
      return null
    }

    const contents = runtimeCacheStore.fileSystem.readFileSync(packageManifestPath)
    const parsedManifest = JSON.parse(contents) as PackageManifest
    if (!parsedManifest || typeof parsedManifest !== 'object') {
      packageManifestByPath.set(normalizedPackageManifestPath, null)
      return null
    }

    packageManifestByPath.set(normalizedPackageManifestPath, parsedManifest)
    return parsedManifest
  } catch {
    packageManifestByPath.set(normalizedPackageManifestPath, null)
    return null
  }
}

function getWorkspaceRootPath(
  runtimeCacheStore: RuntimeAnalysisCacheStore
): string | undefined {
  try {
    return getRootDirectory(runtimeCacheStore.fileSystem.getAbsolutePath('.'))
  } catch {
    return undefined
  }
}

function getAncestorDirectoriesInWorkspace(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  workspaceRootPath: string,
  filePath: string
): string[] {
  const directories: string[] = []

  try {
    let currentDirectory = dirname(runtimeCacheStore.fileSystem.getAbsolutePath(filePath))
    const normalizedWorkspaceRoot = normalizeCachePath(workspaceRootPath)

    while (true) {
      const normalizedCurrentDirectory = normalizeCachePath(currentDirectory)
      const isWithinWorkspaceRoot =
        normalizedCurrentDirectory === normalizedWorkspaceRoot ||
        normalizedCurrentDirectory.startsWith(
          `${normalizedWorkspaceRoot}/`
        )
      if (!isWithinWorkspaceRoot) {
        break
      }

      directories.push(currentDirectory)

      if (normalizedCurrentDirectory === normalizedWorkspaceRoot) {
        break
      }

      const parentDirectory = dirname(currentDirectory)
      if (parentDirectory === currentDirectory) {
        break
      }
      currentDirectory = parentDirectory
    }
  } catch {
    return []
  }

  return directories
}

function resolveDeclaredPackageManifestPath(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  packageManifestByPath: Map<string, PackageManifest | null>,
  workspaceRootPath: string,
  filePath: string,
  packageName: string
): string | undefined {
  for (const directoryPath of getAncestorDirectoriesInWorkspace(
    runtimeCacheStore,
    workspaceRootPath,
    filePath
  )) {
    const packageManifestPath = join(directoryPath, 'package.json')
    const packageManifest = readPackageManifest(
      runtimeCacheStore,
      packageManifestByPath,
      packageManifestPath
    )
    if (!packageManifest) {
      continue
    }

    const dependencyVersion = getDependencyVersionFromPackageManifest(
      packageManifest,
      packageName
    )

    if (dependencyVersion) {
      return packageManifestPath
    }
  }

  return undefined
}

function resolveInstalledPackageManifestPath(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  packageManifestByPath: Map<string, PackageManifest | null>,
  workspaceRootPath: string,
  filePath: string,
  packageName: string
): string | undefined {
  const packagePathSegments = packageName.split('/')

  for (const directoryPath of getAncestorDirectoriesInWorkspace(
    runtimeCacheStore,
    workspaceRootPath,
    filePath
  )) {
    const installedPackageManifestPath = join(
      directoryPath,
      'node_modules',
      ...packagePathSegments,
      'package.json'
    )
    const packageManifest = readPackageManifest(
      runtimeCacheStore,
      packageManifestByPath,
      installedPackageManifestPath
    )

    if (!packageManifest) {
      continue
    }

    return installedPackageManifestPath
  }

  return undefined
}

function resolvePackageVersionDependencies(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  packageDependencies: TypeScriptDependencyAnalysis['packageDependencies']
): PackageVersionDependencyResolution {
  if (packageDependencies.length === 0) {
    return {
      dependencyFilePaths: [],
    }
  }

  const workspaceRootPath = getWorkspaceRootPath(runtimeCacheStore)
  if (!workspaceRootPath) {
    return {
      dependencyFilePaths: [],
    }
  }

  const packageManifestByPath = new Map<string, PackageManifest | null>()
  const dependencyFilePaths = new Set<string>()

  for (const packageDependency of packageDependencies) {
    for (const importerPath of packageDependency.importerPaths) {
      const declaredPackageManifestPath = resolveDeclaredPackageManifestPath(
        runtimeCacheStore,
        packageManifestByPath,
        workspaceRootPath,
        importerPath,
        packageDependency.packageName
      )

      if (declaredPackageManifestPath) {
        dependencyFilePaths.add(declaredPackageManifestPath)
      }

      const installedPackageManifestPath = resolveInstalledPackageManifestPath(
        runtimeCacheStore,
        packageManifestByPath,
        workspaceRootPath,
        importerPath,
        packageDependency.packageName
      )

      if (installedPackageManifestPath) {
        dependencyFilePaths.add(installedPackageManifestPath)
      }
    }
  }

  return {
    dependencyFilePaths: Array.from(dependencyFilePaths.values()),
  }
}

async function getCachedRuntimeTypeScriptDependencyAnalysis(
  project: Project,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  filePath: string | undefined
): Promise<RuntimeTypeScriptDependencyAnalysisResult | undefined> {
  if (!filePath) {
    return undefined
  }

  const compilerOptionsVersion = getCompilerOptionsVersion(project)
  const normalizedFilePath = normalizeCacheFilePath(filePath)
  const runtimeConstDeps: CacheStoreConstDependency[] = [
    {
      name: RUNTIME_ANALYSIS_CACHE_VERSION_DEP,
      version: RUNTIME_ANALYSIS_CACHE_VERSION,
    },
    {
      name: PROJECT_COMPILER_OPTIONS_DEP,
      version: compilerOptionsVersion,
    },
  ]
  const nodeKey = createRuntimeAnalysisCacheNodeKey(
    TYPE_SCRIPT_DEPENDENCY_ANALYSIS_CACHE_NAME,
    {
      compilerOptionsVersion,
      filePath: normalizedFilePath,
    }
  )

  const value = await runtimeCacheStore.store.getOrCompute(
    nodeKey,
    {
      persist: true,
      constDeps: runtimeConstDeps,
    },
    async (context) => {
      recordConstDependencies(context, runtimeConstDeps)

      await recordProjectConfigDependency(context, runtimeCacheStore, project)
      await recordFileDependencyIfPossible(context, runtimeCacheStore, filePath)

      const typeScriptDependencies = await collectTypeScriptDependencyAnalysis(
        project,
        runtimeCacheStore,
        filePath
      )

      for (const moduleResolutionNodeKey of typeScriptDependencies.moduleResolutionNodeKeys) {
        await context.recordNodeDep(moduleResolutionNodeKey)
      }

      const packageVersionDependencies = resolvePackageVersionDependencies(
        runtimeCacheStore,
        typeScriptDependencies.packageDependencies
      )

      const dependencyFilePaths = Array.from(
        new Set<string>([
          ...typeScriptDependencies.dependencyFilePaths,
          ...packageVersionDependencies.dependencyFilePaths,
        ])
      )

      await recordFileDependenciesIfPossible(
        context,
        runtimeCacheStore,
        dependencyFilePaths
      )

      return {
        dependencyFilePaths,
      }
    }
  )

  return {
    nodeKey,
    dependencyFilePaths: value.dependencyFilePaths,
  }
}

function recordConstDependencies(
  context: CacheStoreComputeContext,
  constDeps: readonly CacheStoreConstDependency[]
): void {
  for (const constDependency of constDeps) {
    context.recordConstDep(constDependency.name, constDependency.version)
  }
}

async function recordFileDependenciesIfPossible(
  context: CacheStoreComputeContext,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  filePaths: readonly string[]
): Promise<void> {
  for (const filePath of filePaths) {
    await recordFileDependencyIfPossible(context, runtimeCacheStore, filePath)
  }
}

async function recordFileDependencyIfPossible(
  context: CacheStoreComputeContext,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  path: string | undefined
): Promise<void> {
  if (!path) {
    return
  }

  try {
    const absolutePath = runtimeCacheStore.fileSystem.getAbsolutePath(path)
    runtimeCacheStore.fileSystem.getRelativePathToWorkspace(absolutePath)
    const dependencyVersion = await context.snapshot.contentId(absolutePath)
    context.recordDep(`file:${absolutePath}`, dependencyVersion)
  } catch {
    // Ignore non-workspace and unavailable paths.
  }
}

async function recordDirectoryDependencyIfPossible(
  context: CacheStoreComputeContext,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  path: string | undefined
): Promise<void> {
  if (!path) {
    return
  }

  try {
    const absolutePath = runtimeCacheStore.fileSystem.getAbsolutePath(path)
    runtimeCacheStore.fileSystem.getRelativePathToWorkspace(absolutePath)
    const dependencyVersion = await context.snapshot.contentId(absolutePath)
    context.recordDep(`dir:${absolutePath}`, dependencyVersion)
  } catch {
    // Ignore non-workspace and unavailable paths.
  }
}

async function recordProjectConfigDependency(
  context: CacheStoreComputeContext,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  project: Project
): Promise<void> {
  const compilerOptions = project.getCompilerOptions() as {
    configFilePath?: string
  }

  if (!compilerOptions.configFilePath) {
    return
  }

  await recordFileDependencyIfPossible(
    context,
    runtimeCacheStore,
    compilerOptions.configFilePath
  )
}

function getCompilerOptionsVersion(project: Project): string {
  return stableStringify(project.getCompilerOptions())
}

function canUseRuntimePathCache(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  path: string
): boolean {
  try {
    const absolutePath = runtimeCacheStore.fileSystem.getAbsolutePath(path)
    runtimeCacheStore.fileSystem.getRelativePathToWorkspace(absolutePath)
    return runtimeCacheStore.fileSystem.fileExistsSync(absolutePath)
  } catch {
    return false
  }
}

function getRuntimeAnalysisConstDeps(
  compilerOptionsVersion: string
): CacheStoreConstDependency[] {
  return [
    {
      name: RUNTIME_ANALYSIS_CACHE_VERSION_DEP,
      version: RUNTIME_ANALYSIS_CACHE_VERSION,
    },
    {
      name: PROJECT_COMPILER_OPTIONS_DEP,
      version: compilerOptionsVersion,
    },
  ]
}

function createRuntimeFileExportsCacheNodeKey(
  filePath: string,
  compilerOptionsVersion: string
): string {
  return createRuntimeAnalysisCacheNodeKey(FILE_EXPORTS_CACHE_NAME, {
    compilerOptionsVersion,
    filePath: normalizeCacheFilePath(filePath),
  })
}

function toFileExportsDependencies(
  filePath: string,
  fileExports: ModuleExport[]
): ProjectCacheDependency[] {
  const dependencyPaths = new Set<string>([filePath])

  for (const fileExport of fileExports) {
    if (!fileExport.path) {
      continue
    }

    dependencyPaths.add(fileExport.path)
  }

  return Array.from(dependencyPaths.values()).map((path) => ({
    kind: 'file',
    path,
  }))
}

function toFileExportMetadataCacheName(
  name: string,
  position: number,
  kind: SyntaxKind
): string {
  return `fileExportMetadata:${name}:${position}:${kind}`
}

function toFileExportStaticValueCacheName(
  position: number,
  kind: SyntaxKind
): string {
  return `${FILE_EXPORT_STATIC_VALUE_CACHE_NAME}:${position}:${kind}`
}

function toFileExportTextCacheName(position: number, kind: SyntaxKind): string {
  return `${FILE_EXPORT_TEXT_CACHE_NAME}:${position}:${kind}`
}

function toResolvedTypeAtLocationCacheName(
  position: number,
  kind: SyntaxKind,
  filter?: TypeFilter
): string {
  const filterKey = filter ? serializeTypeFilterForCache(filter) : 'none'
  return `${RESOLVE_TYPE_AT_LOCATION_CACHE_NAME}:${position}:${kind}:${filterKey}`
}

export async function getCachedFileExports(
  project: Project,
  filePath: string
): Promise<ModuleExport[]> {
  const runtimeCacheStore = await getRuntimeAnalysisCacheStore()
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, filePath)
  ) {
    const runtimeConstDeps = getRuntimeAnalysisConstDeps(compilerOptionsVersion)
    const nodeKey = createRuntimeFileExportsCacheNodeKey(
      filePath,
      compilerOptionsVersion
    )

    return runtimeCacheStore.store.getOrCompute(
      nodeKey,
      {
        persist: true,
        constDeps: runtimeConstDeps,
      },
      async (context) => {
        recordConstDependencies(context, runtimeConstDeps)

        await recordProjectConfigDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(context, runtimeCacheStore, filePath)

        const fileExports = baseGetFileExports(filePath, project)
        const fileExportDependencies = toFileExportsDependencies(
          filePath,
          fileExports
        )
        const dependencyFilePaths: string[] = []
        for (const dependency of fileExportDependencies) {
          if (dependency.kind !== 'file') {
            continue
          }
          dependencyFilePaths.push(dependency.path)
        }

        await recordFileDependenciesIfPossible(
          context,
          runtimeCacheStore,
          dependencyFilePaths
        )

        const dependencyAnalysis =
          await getCachedRuntimeTypeScriptDependencyAnalysis(
            project,
            runtimeCacheStore,
            filePath
          )
        if (dependencyAnalysis) {
          await context.recordNodeDep(dependencyAnalysis.nodeKey)
        }

        return fileExports
      }
    )
  }

  return createProjectFileCache(
    project,
    filePath,
    FILE_EXPORTS_CACHE_NAME,
    () => baseGetFileExports(filePath, project),
    {
      deps: (fileExports) => toFileExportsDependencies(filePath, fileExports),
    }
  )
}

export async function getCachedOutlineRanges(
  project: Project,
  filePath: string
): Promise<OutlineRange[]> {
  const runtimeCacheStore = await getRuntimeAnalysisCacheStore()
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, filePath)
  ) {
    const runtimeConstDeps = getRuntimeAnalysisConstDeps(compilerOptionsVersion)
    const nodeKey = createRuntimeAnalysisCacheNodeKey(OUTLINE_RANGES_CACHE_NAME, {
      compilerOptionsVersion,
      filePath: normalizeCacheFilePath(filePath),
    })

    return runtimeCacheStore.store.getOrCompute(
      nodeKey,
      {
        persist: true,
        constDeps: runtimeConstDeps,
      },
      async (context) => {
        recordConstDependencies(context, runtimeConstDeps)

        await recordProjectConfigDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(context, runtimeCacheStore, filePath)

        return baseGetOutlineRanges(filePath, project)
      }
    )
  }

  return createProjectFileCache(
    project,
    filePath,
    OUTLINE_RANGES_CACHE_NAME,
    () => baseGetOutlineRanges(filePath, project),
    {
      deps: [
        {
          kind: 'file',
          path: filePath,
        },
      ],
    }
  )
}

export async function getCachedFileExportMetadata(
  project: Project,
  options: {
    name: string
    filePath: string
    position: number
    kind: SyntaxKind
  }
): Promise<Awaited<ReturnType<typeof baseGetFileExportMetadata>>> {
  const runtimeCacheStore = await getRuntimeAnalysisCacheStore()
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, options.filePath)
  ) {
    const runtimeConstDeps = getRuntimeAnalysisConstDeps(compilerOptionsVersion)
    const nodeKey = createRuntimeAnalysisCacheNodeKey(
      FILE_EXPORT_METADATA_CACHE_NAME,
      {
        compilerOptionsVersion,
        name: options.name,
        filePath: normalizeCacheFilePath(options.filePath),
        position: options.position,
        kind: options.kind,
        mode: 'metadata',
      }
    )

    return runtimeCacheStore.store.getOrCompute(
      nodeKey,
      {
        persist: true,
        constDeps: runtimeConstDeps,
      },
      async (context) => {
        recordConstDependencies(context, runtimeConstDeps)

        await recordProjectConfigDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          options.filePath
        )

        await getCachedFileExports(project, options.filePath)

        return baseGetFileExportMetadata(
          options.name,
          options.filePath,
          options.position,
          options.kind,
          project
        )
      }
    )
  }

  return createProjectFileCache(
    project,
    options.filePath,
    toFileExportMetadataCacheName(options.name, options.position, options.kind),
    () =>
      baseGetFileExportMetadata(
        options.name,
        options.filePath,
        options.position,
        options.kind,
        project
      ),
    {
      deps: [
        {
          kind: 'file',
          path: options.filePath,
        },
        {
          kind: 'cache',
          filePath: options.filePath,
          cacheName: FILE_EXPORTS_CACHE_NAME,
        },
      ],
    }
  )
}

export async function getCachedFileExportStaticValue(
  project: Project,
  options: {
    filePath: string
    position: number
    kind: SyntaxKind
  }
): Promise<Awaited<ReturnType<typeof baseGetFileExportStaticValue>>> {
  const runtimeCacheStore = await getRuntimeAnalysisCacheStore()
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, options.filePath)
  ) {
    const runtimeConstDeps = getRuntimeAnalysisConstDeps(compilerOptionsVersion)
    const nodeKey = createRuntimeAnalysisCacheNodeKey(
      FILE_EXPORT_STATIC_VALUE_CACHE_NAME,
      {
        compilerOptionsVersion,
        filePath: normalizeCacheFilePath(options.filePath),
        position: options.position,
        kind: options.kind,
      }
    )
    const fileExportsNodeKey = createRuntimeFileExportsCacheNodeKey(
      options.filePath,
      compilerOptionsVersion
    )

    return runtimeCacheStore.store.getOrCompute(
      nodeKey,
      {
        persist: true,
        constDeps: runtimeConstDeps,
      },
      async (context) => {
        recordConstDependencies(context, runtimeConstDeps)

        await recordProjectConfigDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          options.filePath
        )

        await getCachedFileExports(project, options.filePath)
        await context.recordNodeDep(fileExportsNodeKey)

        return baseGetFileExportStaticValue(
          options.filePath,
          options.position,
          options.kind,
          project
        )
      }
    )
  }

  return createProjectFileCache(
    project,
    options.filePath,
    toFileExportStaticValueCacheName(options.position, options.kind),
    () =>
      baseGetFileExportStaticValue(
        options.filePath,
        options.position,
        options.kind,
        project
      ),
    {
      deps: [
        {
          kind: 'file',
          path: options.filePath,
        },
        {
          kind: 'cache',
          filePath: options.filePath,
          cacheName: FILE_EXPORTS_CACHE_NAME,
        },
      ],
    }
  )
}

export async function getCachedFileExportText(
  project: Project,
  options: {
    filePath: string
    position: number
    kind: SyntaxKind
    includeDependencies?: boolean
  }
): Promise<string> {
  const runtimeCacheStore = await getRuntimeAnalysisCacheStore()
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, options.filePath)
  ) {
    const runtimeConstDeps = getRuntimeAnalysisConstDeps(compilerOptionsVersion)
    const nodeKey = createRuntimeAnalysisCacheNodeKey(FILE_EXPORT_TEXT_CACHE_NAME, {
      compilerOptionsVersion,
      filePath: normalizeCacheFilePath(options.filePath),
      position: options.position,
      kind: options.kind,
      includeDependencies: options.includeDependencies === true,
    })

    return runtimeCacheStore.store.getOrCompute(
      nodeKey,
      {
        persist: true,
        constDeps: runtimeConstDeps,
      },
      async (context) => {
        recordConstDependencies(context, runtimeConstDeps)

        await recordProjectConfigDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          options.filePath
        )

        if (options.includeDependencies) {
          // Ensure includeDependencies text generation reads fresh source state.
          invalidateProjectFileCache(
            project,
            options.filePath,
            FILE_EXPORTS_TEXT_PROJECT_CACHE_NAME
          )
        }

        return baseGetFileExportText({
          filePath: options.filePath,
          position: options.position,
          kind: options.kind,
          includeDependencies: options.includeDependencies,
          project,
        })
      }
    )
  }

  if (options.includeDependencies) {
    return baseGetFileExportText({
      filePath: options.filePath,
      position: options.position,
      kind: options.kind,
      includeDependencies: true,
      project,
    })
  }

  return createProjectFileCache(
    project,
    options.filePath,
    toFileExportTextCacheName(options.position, options.kind),
    () =>
      baseGetFileExportText({
        filePath: options.filePath,
        position: options.position,
        kind: options.kind,
        includeDependencies: false,
        project,
      }),
    {
      deps: [
        {
          kind: 'file',
          path: options.filePath,
        },
      ],
    }
  )
}

export async function resolveCachedTypeAtLocationWithDependencies(
  project: Project,
  options: {
    filePath: string
    position: number
    kind: SyntaxKind
    filter?: TypeFilter
    isInMemoryFileSystem?: boolean
  }
): Promise<ResolvedTypeAtLocationResult> {
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (!options.isInMemoryFileSystem) {
    const runtimeCacheStore = await getRuntimeAnalysisCacheStore()
    if (
      runtimeCacheStore &&
      canUseRuntimePathCache(runtimeCacheStore, options.filePath)
    ) {
      const runtimeConstDeps =
        getRuntimeAnalysisConstDeps(compilerOptionsVersion)
      const nodeKey = createRuntimeAnalysisCacheNodeKey(
        RESOLVE_TYPE_AT_LOCATION_CACHE_NAME,
        {
          compilerOptionsVersion,
          filePath: normalizeCacheFilePath(options.filePath),
          position: options.position,
          kind: options.kind,
          filter: options.filter
            ? serializeTypeFilterForCache(options.filter)
            : 'none',
        }
      )

      return runtimeCacheStore.store.getOrCompute(
        nodeKey,
        {
          persist: true,
          constDeps: runtimeConstDeps,
        },
        async (context) => {
          recordConstDependencies(context, runtimeConstDeps)

          await recordProjectConfigDependency(context, runtimeCacheStore, project)
          await recordFileDependencyIfPossible(
            context,
            runtimeCacheStore,
            options.filePath
          )

          const result = await baseResolveTypeAtLocationWithDependencies(
            project,
            options.filePath,
            options.position,
            options.kind,
            options.filter,
            options.isInMemoryFileSystem
          )
          const dependencyPaths = new Set<string>([
            options.filePath,
            ...(result.dependencies ?? []),
          ])
          await recordFileDependenciesIfPossible(
            context,
            runtimeCacheStore,
            Array.from(dependencyPaths.values())
          )

          const dependencyAnalysis =
            await getCachedRuntimeTypeScriptDependencyAnalysis(
              project,
              runtimeCacheStore,
              options.filePath
            )
          if (dependencyAnalysis) {
            await context.recordNodeDep(dependencyAnalysis.nodeKey)
          }

          return result
        }
      )
    }
  }

  return createProjectFileCache(
    project,
    options.filePath,
    toResolvedTypeAtLocationCacheName(
      options.position,
      options.kind,
      options.filter
    ),
    () =>
      baseResolveTypeAtLocationWithDependencies(
        project,
        options.filePath,
        options.position,
        options.kind,
        options.filter,
        options.isInMemoryFileSystem
      ),
    {
      deps: (result) => {
        const dependencyPaths = new Set<string>([
          options.filePath,
          ...(result.dependencies ?? []),
        ])
        return [
          ...Array.from(dependencyPaths.values()).map((path) => ({
            kind: 'file' as const,
            path,
          })),
          {
            kind: 'const' as const,
            name: 'project:compiler-options',
            version: compilerOptionsVersion,
          },
        ]
      },
    }
  )
}

export async function transpileCachedSourceFile(
  project: Project,
  filePath: string
): Promise<string> {
  const runtimeCacheStore = await getRuntimeAnalysisCacheStore()
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, filePath)
  ) {
    const runtimeConstDeps = getRuntimeAnalysisConstDeps(compilerOptionsVersion)
    const nodeKey = createRuntimeAnalysisCacheNodeKey(
      TRANSPILE_SOURCE_FILE_CACHE_NAME,
      {
        compilerOptionsVersion,
        filePath: normalizeCacheFilePath(filePath),
      }
    )

    return runtimeCacheStore.store.getOrCompute(
      nodeKey,
      {
        persist: true,
        constDeps: runtimeConstDeps,
      },
      async (context) => {
        recordConstDependencies(context, runtimeConstDeps)

        await recordProjectConfigDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(context, runtimeCacheStore, filePath)

        return baseTranspileSourceFile(filePath, project)
      }
    )
  }

  return createProjectFileCache(
    project,
    filePath,
    TRANSPILE_SOURCE_FILE_CACHE_NAME,
    () => baseTranspileSourceFile(filePath, project),
    {
      deps: [
        {
          kind: 'file',
          path: filePath,
        },
        {
          kind: 'const',
          name: 'project:compiler-options',
          version: getCompilerOptionsVersion(project),
        },
      ],
    }
  )
}

export async function getCachedSourceTextMetadata(
  project: Project,
  options: Omit<GetSourceTextMetadataOptions, 'project'>
): Promise<SourceTextMetadata> {
  const runtimeCacheStore = await getRuntimeAnalysisCacheStore()
  if (!runtimeCacheStore) {
    return baseGetSourceTextMetadata({
      ...options,
      project,
    })
  }

  const compilerOptionsVersion = getCompilerOptionsVersion(project)
  const runtimeConstDeps: CacheStoreConstDependency[] = [
    {
      name: RUNTIME_ANALYSIS_CACHE_VERSION_DEP,
      version: RUNTIME_ANALYSIS_CACHE_VERSION,
    },
    {
      name: PROJECT_COMPILER_OPTIONS_DEP,
      version: compilerOptionsVersion,
    },
  ]
  const nodeKey = createRuntimeAnalysisCacheNodeKey(
    SOURCE_TEXT_METADATA_CACHE_NAME,
    {
      compilerOptionsVersion,
      filePath: normalizeCacheFilePath(options.filePath),
      language: options.language ?? null,
      shouldFormat: options.shouldFormat ?? true,
      isFormattingExplicit: options.isFormattingExplicit ?? null,
      baseDirectory: options.baseDirectory ?? null,
      valueSignature: toSourceTextMetadataValueSignature(options.value),
    }
  )

  return runtimeCacheStore.store.getOrCompute(
    nodeKey,
    {
      persist: true,
      constDeps: runtimeConstDeps,
    },
    async (context) => {
      recordConstDependencies(context, runtimeConstDeps)

      await recordProjectConfigDependency(context, runtimeCacheStore, project)
      await recordFileDependencyIfPossible(
        context,
        runtimeCacheStore,
        options.filePath
      )

      const result = await baseGetSourceTextMetadata({
        ...options,
        project,
      })

      await recordFileDependencyIfPossible(
        context,
        runtimeCacheStore,
        result.filePath
      )
      const sourceTextDependencyNodeKeys = new Set<string>()
      for (const dependencyAnalysisPath of [
        options.filePath,
        result.filePath,
      ] as const) {
        const dependencyAnalysis =
          await getCachedRuntimeTypeScriptDependencyAnalysis(
            project,
            runtimeCacheStore,
            dependencyAnalysisPath
          )
        if (!dependencyAnalysis) {
          continue
        }

        if (
          sourceTextDependencyNodeKeys.has(dependencyAnalysis.nodeKey)
        ) {
          continue
        }

        sourceTextDependencyNodeKeys.add(dependencyAnalysis.nodeKey)
        await context.recordNodeDep(dependencyAnalysis.nodeKey)
      }

      return result
    }
  )
}

export async function getCachedTokens(
  project: Project,
  options: Omit<GetTokensOptions, 'project'>
): Promise<TokenizedLines> {
  const runtimeCacheStore = await getRuntimeAnalysisCacheStore()
  if (!runtimeCacheStore) {
    return baseGetTokens({
      ...options,
      project,
    })
  }

  const compilerOptionsVersion = getCompilerOptionsVersion(project)
  const normalizedFilePath = normalizeCacheFilePath(options.filePath)
  const runtimeConstDeps: CacheStoreConstDependency[] = [
    {
      name: RUNTIME_ANALYSIS_CACHE_VERSION_DEP,
      version: RUNTIME_ANALYSIS_CACHE_VERSION,
    },
    {
      name: PROJECT_COMPILER_OPTIONS_DEP,
      version: compilerOptionsVersion,
    },
  ]
  const nodeKey = createRuntimeAnalysisCacheNodeKey(TOKENS_CACHE_NAME, {
    compilerOptionsVersion,
    filePath: normalizedFilePath,
    sourcePath:
      typeof options.sourcePath === 'string'
        ? normalizeCachePath(options.sourcePath)
        : options.sourcePath ?? null,
    language: options.language ?? 'plaintext',
    themeSignature: getThemeSignature(options.theme),
    themeNames: getThemeNamesForCache(options.theme),
    allowErrors: options.allowErrors ?? null,
    showErrors: options.showErrors ?? null,
    valueSignature: toTokenValueSignature(options.value),
  })

  return runtimeCacheStore.store.getOrCompute(
    nodeKey,
    {
      persist: true,
      constDeps: runtimeConstDeps,
    },
    async (context) => {
      recordConstDependencies(context, runtimeConstDeps)

      await recordProjectConfigDependency(context, runtimeCacheStore, project)
      await recordFileDependencyIfPossible(
        context,
        runtimeCacheStore,
        options.filePath
      )

      const result = await baseGetTokens({
        ...options,
        project,
      })

      const tokenTypeScriptDependencies =
        await getCachedRuntimeTypeScriptDependencyAnalysis(
          project,
          runtimeCacheStore,
          options.filePath
        )
      if (tokenTypeScriptDependencies) {
        await context.recordNodeDep(tokenTypeScriptDependencies.nodeKey)
      }

      return result
    }
  )
}
