import { dirname, join, resolve } from 'node:path'
import type {
  SourceFile,
  SyntaxKind,
  Project,
  ts as TsMorphTS,
} from '../utils/ts-morph.ts'
import { getTsMorph } from '../utils/ts-morph.ts'
import { hashString, stableStringify } from '../utils/stable-serialization.ts'

import { getRootDirectory } from '../utils/get-root-directory.ts'
import { normalizePathKey } from '../utils/path.ts'
import {
  createPersistentCacheNodeKey,
  serializeTypeFilterForCache,
} from '../file-system/cache-key.ts'
import {
  type CacheStoreComputeContext,
  type CacheStoreConstDependency,
  type CacheStoreFreshnessMismatch,
  type CacheStoreStaleWhileRevalidateOptions,
} from '../file-system/Cache.ts'
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
import { mapConcurrent } from '../utils/concurrency.ts'
import type { ProjectCacheDependency } from './cache.ts'
import { createProjectFileCache, invalidateProjectFileCache } from './cache.ts'
import {
  isRpcBuildProfileEnabled,
  recordRpcCacheReuse,
  recordRpcCacheReuseStaleReason,
} from './rpc/build-profile.ts'
import type { RuntimeAnalysisSession } from './runtime-analysis-session.ts'
import { getRuntimeAnalysisSession as getSharedRuntimeAnalysisSession } from './runtime-analysis-session.ts'

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
const TYPE_SCRIPT_DEPENDENCY_ANALYSIS_CACHE_NAME =
  'typeScriptDependencyAnalysis'
const TYPE_SCRIPT_DEPENDENCY_FINGERPRINT_CACHE_NAME =
  'typeScriptDependencyFingerprint'
const MODULE_RESOLUTION_CACHE_NAME = 'moduleResolution'
const PACKAGE_VERSION_DEPENDENCY_CACHE_NAME = 'packageVersionDependency'
const RUNTIME_ANALYSIS_CACHE_SCOPE = 'project-analysis-runtime'
const RUNTIME_ANALYSIS_CACHE_VERSION = '3'
const RUNTIME_ANALYSIS_CACHE_VERSION_DEP = 'runtime-analysis-cache-version'
const PROJECT_COMPILER_OPTIONS_DEP = 'project:compiler-options'
const DEFAULT_RUNTIME_ANALYSIS_SWR_MAX_STALE_AGE_MS = 2_000
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

type RuntimeAnalysisCacheStore = RuntimeAnalysisSession & {
  store: RuntimeAnalysisSession['session']['cache']
  snapshot: RuntimeAnalysisSession['session']['snapshot']
}

const compilerOptionsVersionByProject = new WeakMap<
  Project,
  {
    version: string
    configPathKey: string | null
    epoch: number
  }
>()
const compilerOptionsVersionEpochByConfigPath = new Map<string, number>()
let compilerOptionsVersionGlobalEpoch = 0
let runtimeAnalysisInvalidationQueue: Promise<void> = Promise.resolve()
const runtimeTypeScriptDependencyAnalysisInFlightByKey = new Map<
  string,
  Promise<RuntimeTypeScriptDependencyAnalysisResult | undefined>
>()
const runtimeTypeScriptDependencyFingerprintInFlightByKey = new Map<
  string,
  Promise<RuntimeTypeScriptDependencyFingerprintResult | undefined>
>()
const runtimeTypeScriptDependencySidecarHydrationInFlightByKey = new Map<
  string,
  Promise<void>
>()
const runtimeTypeScriptDependencySidecarHydrationQueue: Array<{
  dedupeKey: string
  run: () => Promise<void>
}> = []
let runtimeTypeScriptDependencySidecarHydrationActiveCount = 0
const projectConfigDependencyVersionByKey = new Map<
  string,
  {
    contentId: string
    version: string
  }
>()
const RUNTIME_TS_DEPENDENCY_SIDECAR_HYDRATION_CONCURRENCY = 2

function getRuntimeAnalysisSWRReadOptions():
  | CacheStoreStaleWhileRevalidateOptions
  | undefined {
  if (process.env['NODE_ENV'] !== 'development') {
    return undefined
  }

  return {
    maxStaleAgeMs: DEFAULT_RUNTIME_ANALYSIS_SWR_MAX_STALE_AGE_MS,
  }
}

function shouldTrackRuntimeTypeScriptDependencies(): boolean {
  return process.env['NODE_ENV'] !== 'production'
}

async function getRuntimeAnalysisSessionUnchecked(): Promise<
  RuntimeAnalysisCacheStore | undefined
> {
  const runtimeSession = await getSharedRuntimeAnalysisSession()
  if (!runtimeSession) {
    return undefined
  }

  return {
    ...runtimeSession,
    store: runtimeSession.session.cache,
    snapshot: runtimeSession.session.snapshot,
  }
}

function enqueueRuntimeAnalysisInvalidation(task: () => Promise<void>): void {
  runtimeAnalysisInvalidationQueue = runtimeAnalysisInvalidationQueue
    .catch(() => {})
    .then(task)
    .catch(() => {})
}

async function waitForRuntimeAnalysisInvalidations(): Promise<void> {
  await runtimeAnalysisInvalidationQueue
}

async function getRuntimeAnalysisSession(): Promise<
  RuntimeAnalysisCacheStore | undefined
> {
  await waitForRuntimeAnalysisInvalidations()
  return getRuntimeAnalysisSessionUnchecked()
}

function isTypeScriptConfigPath(path: string): boolean {
  const normalizedPath = normalizePathKey(path)
  return /(^|\/)tsconfig(\..+)?\.json$/i.test(normalizedPath)
}

function getTypeScriptConfigPathInvalidationKeys(path: string): string[] {
  if (!isTypeScriptConfigPath(path)) {
    return []
  }

  const keys = new Set<string>()
  const normalizedPath = normalizePathKey(path)
  keys.add(normalizedPath)

  if (!normalizedPath.startsWith('/')) {
    keys.add(normalizePathKey(resolve(path)))
  }

  return Array.from(keys.values())
}

function bumpCompilerOptionsVersionEpochForConfigPath(path: string): void {
  for (const configPathKey of getTypeScriptConfigPathInvalidationKeys(path)) {
    compilerOptionsVersionEpochByConfigPath.set(
      configPathKey,
      (compilerOptionsVersionEpochByConfigPath.get(configPathKey) ?? 0) + 1
    )
  }
}

export function invalidateRuntimeAnalysisCachePath(path: string): void {
  invalidateRuntimeAnalysisCachePaths([path])
}

export function invalidateRuntimeAnalysisCachePaths(
  paths: Iterable<string>
): void {
  const pathByNormalizedPath = new Map<string, string>()
  for (const path of paths) {
    if (typeof path !== 'string' || path.length === 0) {
      continue
    }

    const normalizedPath = normalizePathKey(path)
    if (!pathByNormalizedPath.has(normalizedPath)) {
      pathByNormalizedPath.set(normalizedPath, path)
    }
  }

  const normalizedPaths = collapseRuntimeAnalysisInvalidationPaths(
    pathByNormalizedPath.keys()
  )
  if (normalizedPaths.length === 0) {
    return
  }

  const pathsToInvalidate = normalizedPaths.map((normalizedPath) => {
    return pathByNormalizedPath.get(normalizedPath) ?? normalizedPath
  })

  for (const path of pathsToInvalidate) {
    bumpCompilerOptionsVersionEpochForConfigPath(path)
  }

  enqueueRuntimeAnalysisInvalidation(async () => {
    const runtimeSession = await getRuntimeAnalysisSessionUnchecked()
    if (!runtimeSession) {
      return
    }

    runtimeSession.session.invalidatePaths(pathsToInvalidate)
    await runtimeSession.session.waitForPendingInvalidations()
  })
}

export function invalidateRuntimeAnalysisCacheAll(): void {
  compilerOptionsVersionGlobalEpoch += 1

  enqueueRuntimeAnalysisInvalidation(async () => {
    const runtimeSession = await getRuntimeAnalysisSessionUnchecked()
    if (!runtimeSession) {
      return
    }

    runtimeSession.session.invalidatePaths(['.'])
    await runtimeSession.session.waitForPendingInvalidations()
  })
}

function collapseRuntimeAnalysisInvalidationPaths(
  paths: Iterable<string>
): string[] {
  const normalizedPaths = Array.from(
    new Set(
      Array.from(paths).filter((path) => {
        return typeof path === 'string' && path.length > 0
      })
    )
  )
  if (normalizedPaths.length === 0) {
    return []
  }

  if (normalizedPaths.includes('.')) {
    return ['.']
  }

  normalizedPaths.sort((firstPath, secondPath) => {
    if (firstPath.length !== secondPath.length) {
      return firstPath.length - secondPath.length
    }

    return firstPath.localeCompare(secondPath)
  })

  const collapsedPaths: string[] = []
  for (const path of normalizedPaths) {
    const isRedundant = collapsedPaths.some((existingPath) => {
      return path === existingPath || path.startsWith(`${existingPath}/`)
    })

    if (!isRedundant) {
      collapsedPaths.push(path)
    }
  }

  return collapsedPaths
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

  return normalizePathKey(path)
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

interface RuntimeTypeScriptDependencyAnalysisCacheValue {
  dependencyFilePaths: string[]
  moduleResolutionNodeKeys: string[]
  packageDependencyNodeKeys: string[]
  importResolutionFingerprint: string
}

interface RuntimeTypeScriptDependencyFingerprintResult {
  nodeKey: string
  importResolutionFingerprint: string
  directDependencyFilePaths: string[]
  packageManifestDependencyPaths: string[]
}

interface PackageVersionDependencyResolution {
  dependencyFilePaths: string[]
  dependencyNodeKeys: string[]
}

interface CachedPackageVersionDependencyResult {
  nodeKey: string
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

function collectSourceFileModuleSpecifiers(sourceFile: SourceFile): string[] {
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
  candidatePaths.add(normalizePathKey(basePath))

  for (const extension of MODULE_RESOLUTION_FILE_EXTENSIONS) {
    candidatePaths.add(`${basePath}${extension}`)
    candidatePaths.add(normalizePathKey(`${basePath}${extension}`))
    candidatePaths.add(join(basePath, `index${extension}`))
    candidatePaths.add(normalizePathKey(join(basePath, `index${extension}`)))
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
    const baseCandidatePath = normalizedModuleSpecifier.startsWith('.')
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
  } catch {}

  return undefined
}

function createRuntimeModuleResolutionCacheNodeKey(payload: {
  compilerOptionsVersion: string
  containingFilePath: string
  moduleSpecifier: string
}): string {
  return createRuntimeAnalysisCacheNodeKey(MODULE_RESOLUTION_CACHE_NAME, {
    compilerOptionsVersion: payload.compilerOptionsVersion,
    containingFilePath: normalizePathKey(payload.containingFilePath),
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

  const cacheKey = `${normalizePathKey(containingFilePath)}:${normalizedModuleSpecifier}`
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

  const runtimeConstDeps = getRuntimeAnalysisConstDeps()
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
  const resolvedModuleSpecifiers = await mapConcurrent(
    moduleSpecifiers,
    {
      concurrency: 16,
    },
    async (moduleSpecifier) => {
      const resolution = await resolveModuleSpecifierSourceFilePath(
        project,
        runtimeCacheStore,
        compilerOptionsVersion,
        containingFilePath,
        moduleSpecifier,
        moduleResolutionByKey
      )
      return {
        moduleSpecifier,
        resolution,
      }
    }
  )

  for (const { moduleSpecifier, resolution } of resolvedModuleSpecifiers) {
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

  if (normalizePathKey(dependencyPath).includes('/node_modules/')) {
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

  return !normalizePathKey(dependencyPath).includes('/node_modules/')
}

function isPathWithinRoot(path: string, rootPath: string): boolean {
  const normalizedPath = normalizePathKey(path)
  const normalizedRootPath = normalizePathKey(rootPath)
  return (
    normalizedPath === normalizedRootPath ||
    normalizedPath.startsWith(`${normalizedRootPath}/`)
  )
}

function getProjectDependencyBoundaryPath(
  project: Project
): string | undefined {
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

  const normalizedDependencyPath = normalizePathKey(dependencyPath)
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
  const projectDependencyBoundaryPath =
    getProjectDependencyBoundaryPath(project)
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
  const moduleResolutionByKey = new Map<
    string,
    ModuleSpecifierResolutionResult
  >()
  const dependencyLinksBySourceFilePath = new Map<
    string,
    Promise<SourceFileDependencyLinksResult>
  >()
  let dependencyAnalysisLimitReached = false

  const getDependencyLinksForSourceFile = (
    targetSourceFile: SourceFile
  ): Promise<SourceFileDependencyLinksResult> => {
    const sourceFilePathKey = normalizePathKey(targetSourceFile.getFilePath())
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
    const normalizedCurrentSourceFilePath = normalizePathKey(
      currentSourceFilePath
    )

    if (visitedSourceFilePaths.has(normalizedCurrentSourceFilePath)) {
      continue
    }

    visitedSourceFilePaths.add(normalizedCurrentSourceFilePath)

    for (const link of (
      await getDependencyLinksForSourceFile(currentSourceFile)
    ).links) {
      if (link.moduleResolutionNodeKey) {
        moduleResolutionNodeKeys.add(link.moduleResolutionNodeKey)
      }

      const dependencyPath = link.sourceFilePath
      const normalizedDependencyPath =
        typeof dependencyPath === 'string'
          ? normalizePathKey(dependencyPath)
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

      const packageName = getPackageNameFromModuleSpecifier(
        link.moduleSpecifier
      )
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
      if (
        normalizePathKey(projectSourceFilePath).includes('/node_modules/')
      ) {
        continue
      }
      if (
        projectDependencyBoundaryPath &&
        !isPathWithinRoot(projectSourceFilePath, projectDependencyBoundaryPath)
      ) {
        continue
      }
      dependencyPaths.add(projectSourceFilePath)

      for (const link of (
        await getDependencyLinksForSourceFile(projectSourceFile)
      ).links) {
        if (link.moduleResolutionNodeKey) {
          moduleResolutionNodeKeys.add(link.moduleResolutionNodeKey)
        }

        const dependencyPath = link.sourceFilePath
        const normalizedDependencyPath =
          typeof dependencyPath === 'string'
            ? normalizePathKey(dependencyPath)
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

        const packageName = getPackageNameFromModuleSpecifier(
          link.moduleSpecifier
        )
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
  const normalizedPackageManifestPath = normalizePathKey(packageManifestPath)
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

    const contents =
      runtimeCacheStore.fileSystem.readFileSync(packageManifestPath)
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
    let currentDirectory = dirname(
      runtimeCacheStore.fileSystem.getAbsolutePath(filePath)
    )
    const normalizedWorkspaceRoot = normalizePathKey(workspaceRootPath)

    while (true) {
      const normalizedCurrentDirectory = normalizePathKey(currentDirectory)
      const isWithinWorkspaceRoot =
        normalizedCurrentDirectory === normalizedWorkspaceRoot ||
        normalizedCurrentDirectory.startsWith(`${normalizedWorkspaceRoot}/`)
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

function createRuntimePackageVersionDependencyCacheNodeKey(payload: {
  compilerOptionsVersion: string
  importerPath: string
  packageName: string
}): string {
  return createRuntimeAnalysisCacheNodeKey(
    PACKAGE_VERSION_DEPENDENCY_CACHE_NAME,
    {
      compilerOptionsVersion: payload.compilerOptionsVersion,
      importerPath: normalizePathKey(payload.importerPath),
      packageName: payload.packageName,
    }
  )
}

async function resolveCachedPackageVersionDependencyForImporter(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  compilerOptionsVersion: string,
  packageName: string,
  importerPath: string
): Promise<CachedPackageVersionDependencyResult | undefined> {
  const workspaceRootPath = getWorkspaceRootPath(runtimeCacheStore)
  if (!workspaceRootPath) {
    return undefined
  }

  const runtimeConstDeps = getRuntimeAnalysisConstDeps()
  const nodeKey = createRuntimePackageVersionDependencyCacheNodeKey({
    compilerOptionsVersion,
    importerPath,
    packageName,
  })
  const packagePathSegments = packageName.split('/')
  const scopeSegment = packagePathSegments[0]?.startsWith('@')
    ? packagePathSegments[0]
    : undefined

  const value = await runtimeCacheStore.store.getOrCompute(
    nodeKey,
    {
      persist: true,
      constDeps: runtimeConstDeps,
    },
    async (context) => {
      recordConstDependencies(context, runtimeConstDeps)

      await recordFileDependencyIfPossible(
        context,
        runtimeCacheStore,
        importerPath
      )

      const ancestorDirectories = getAncestorDirectoriesInWorkspace(
        runtimeCacheStore,
        workspaceRootPath,
        importerPath
      )
      for (const directoryPath of ancestorDirectories) {
        await recordDirectoryDependencyIfPossible(
          context,
          runtimeCacheStore,
          directoryPath
        )

        const nodeModulesPath = join(directoryPath, 'node_modules')
        await recordDirectoryDependencyIfPossible(
          context,
          runtimeCacheStore,
          nodeModulesPath
        )

        if (scopeSegment) {
          await recordDirectoryDependencyIfPossible(
            context,
            runtimeCacheStore,
            join(nodeModulesPath, scopeSegment)
          )
        }
      }

      const packageManifestByPath = new Map<string, PackageManifest | null>()
      const declaredPackageManifestPath = resolveDeclaredPackageManifestPath(
        runtimeCacheStore,
        packageManifestByPath,
        workspaceRootPath,
        importerPath,
        packageName
      )
      const installedPackageManifestPath = resolveInstalledPackageManifestPath(
        runtimeCacheStore,
        packageManifestByPath,
        workspaceRootPath,
        importerPath,
        packageName
      )

      const dependencyFilePaths = Array.from(
        new Set(
          [declaredPackageManifestPath, installedPackageManifestPath].filter(
            (path): path is string => typeof path === 'string'
          )
        )
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

async function resolvePackageVersionDependencies(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  compilerOptionsVersion: string,
  packageDependencies: TypeScriptDependencyAnalysis['packageDependencies']
): Promise<PackageVersionDependencyResolution> {
  if (packageDependencies.length === 0) {
    return {
      dependencyFilePaths: [],
      dependencyNodeKeys: [],
    }
  }

  const dependencyFilePaths = new Set<string>()
  const dependencyNodeKeys = new Set<string>()
  const resolveRequests: Array<{ packageName: string; importerPath: string }> =
    []

  for (const packageDependency of packageDependencies) {
    for (const importerPath of packageDependency.importerPaths) {
      resolveRequests.push({
        packageName: packageDependency.packageName,
        importerPath,
      })
    }
  }

  const resolvedDependencies = await mapConcurrent(
    resolveRequests,
    {
      concurrency: 20,
    },
    ({ packageName, importerPath }) =>
      resolveCachedPackageVersionDependencyForImporter(
        runtimeCacheStore,
        compilerOptionsVersion,
        packageName,
        importerPath
      )
  )
  for (const resolvedDependency of resolvedDependencies) {
    if (!resolvedDependency) {
      continue
    }

    dependencyNodeKeys.add(resolvedDependency.nodeKey)
    for (const dependencyFilePath of resolvedDependency.dependencyFilePaths) {
      dependencyFilePaths.add(dependencyFilePath)
    }
  }

  return {
    dependencyFilePaths: Array.from(dependencyFilePaths.values()),
    dependencyNodeKeys: Array.from(dependencyNodeKeys.values()),
  }
}

async function getCachedRuntimeTypeScriptDependencyAnalysis(
  project: Project,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  filePath: string | undefined,
  compilerOptionsVersionProp?: string
): Promise<RuntimeTypeScriptDependencyAnalysisResult | undefined> {
  if (!filePath) {
    return undefined
  }

  const compilerOptionsVersion =
    compilerOptionsVersionProp ?? getCompilerOptionsVersion(project)
  const runtimeConstDeps = getRuntimeAnalysisConstDeps()
  const nodeKey = createRuntimeTypeScriptDependencyAnalysisCacheNodeKey(
    filePath,
    compilerOptionsVersion
  )
  const dedupeKey = createRuntimeTypeScriptDependencyTrackingDedupeKey(
    runtimeCacheStore,
    filePath,
    compilerOptionsVersion
  )
  const pending = runtimeTypeScriptDependencyAnalysisInFlightByKey.get(dedupeKey)
  if (pending) {
    return pending
  }

  const task = runtimeCacheStore.store
    .getOrCompute(
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
          filePath
        )

        const dependencyFingerprint =
          await getCachedRuntimeTypeScriptDependencyFingerprint(
            project,
            runtimeCacheStore,
            filePath,
            compilerOptionsVersion
          )
        if (dependencyFingerprint) {
          await context.recordNodeDep(dependencyFingerprint.nodeKey)
        }

        const previousAnalysis =
          await runtimeCacheStore.store.getWithFreshness<RuntimeTypeScriptDependencyAnalysisCacheValue>(
            nodeKey
          )
        const previousValue =
          previousAnalysis.fresh === false ? previousAnalysis.value : undefined

        if (
          previousValue &&
          dependencyFingerprint &&
          previousValue.importResolutionFingerprint ===
            dependencyFingerprint.importResolutionFingerprint
        ) {
          for (const moduleResolutionNodeKey of previousValue.moduleResolutionNodeKeys) {
            await context.recordNodeDep(moduleResolutionNodeKey)
          }
          for (const packageDependencyNodeKey of previousValue.packageDependencyNodeKeys) {
            await context.recordNodeDep(packageDependencyNodeKey)
          }

          await recordFileDependenciesIfPossible(
            context,
            runtimeCacheStore,
            previousValue.dependencyFilePaths
          )

          return previousValue
        }

        const typeScriptDependencies = await collectTypeScriptDependencyAnalysis(
          project,
          runtimeCacheStore,
          filePath
        )

        for (const moduleResolutionNodeKey of typeScriptDependencies.moduleResolutionNodeKeys) {
          await context.recordNodeDep(moduleResolutionNodeKey)
        }

        const packageVersionDependencies =
          await resolvePackageVersionDependencies(
            runtimeCacheStore,
            compilerOptionsVersion,
            typeScriptDependencies.packageDependencies
          )

        for (const packageDependencyNodeKey of packageVersionDependencies.dependencyNodeKeys) {
          await context.recordNodeDep(packageDependencyNodeKey)
        }

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
          moduleResolutionNodeKeys: typeScriptDependencies.moduleResolutionNodeKeys,
          packageDependencyNodeKeys: packageVersionDependencies.dependencyNodeKeys,
          importResolutionFingerprint:
            dependencyFingerprint?.importResolutionFingerprint ??
            hashString(
              stableStringify({
                compilerOptionsVersion,
                filePath: normalizeCacheFilePath(filePath) ?? null,
                dependencyFilePaths: dependencyFilePaths
                  .slice()
                  .sort((first, second) => first.localeCompare(second)),
              })
            ),
        }
      }
    )
    .then((value) => ({
      nodeKey,
      dependencyFilePaths: value.dependencyFilePaths,
    }))
    .finally(() => {
      if (
        runtimeTypeScriptDependencyAnalysisInFlightByKey.get(dedupeKey) === task
      ) {
        runtimeTypeScriptDependencyAnalysisInFlightByKey.delete(dedupeKey)
      }
    })

  runtimeTypeScriptDependencyAnalysisInFlightByKey.set(dedupeKey, task)
  return task
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
    await context.recordFileDep(absolutePath)
  } catch {}
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
    await context.recordDirectoryDep(absolutePath)
  } catch {}
}

async function resolveProjectConfigDependencyVersion(options: {
  runtimeCacheStore: RuntimeAnalysisCacheStore
  configFilePath: string
}): Promise<{ name: string; version: string } | undefined> {
  const { runtimeCacheStore, configFilePath } = options

  try {
    const absoluteConfigPath =
      runtimeCacheStore.fileSystem.getAbsolutePath(configFilePath)
    const normalizedConfigPath = normalizePathKey(absoluteConfigPath)
    const contentId = await runtimeCacheStore.snapshot.contentId(
      normalizedConfigPath
    )
    const dependencyKey = `${runtimeCacheStore.snapshot.id}:${normalizedConfigPath}`
    const cached = projectConfigDependencyVersionByKey.get(dependencyKey)
    if (cached && cached.contentId === contentId) {
      return {
        name: `project-config:${normalizedConfigPath}`,
        version: cached.version,
      }
    }

    let version = contentId
    try {
      const fileContents =
        await runtimeCacheStore.snapshot.readFile(normalizedConfigPath)
      version = `sha1:${hashString(fileContents)}:${fileContents.length}`
    } catch {}

    projectConfigDependencyVersionByKey.set(dependencyKey, {
      contentId,
      version,
    })

    return {
      name: `project-config:${normalizedConfigPath}`,
      version,
    }
  } catch {
    return undefined
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

  const projectConfigDependency = await resolveProjectConfigDependencyVersion({
    runtimeCacheStore,
    configFilePath: compilerOptions.configFilePath,
  })
  if (!projectConfigDependency) {
    return
  }

  context.recordConstDep(
    projectConfigDependency.name,
    projectConfigDependency.version
  )
}

function getCompilerOptionsVersion(project: Project): string {
  const compilerOptions = project.getCompilerOptions() as {
    configFilePath?: string
  }
  const configPathKey =
    typeof compilerOptions.configFilePath === 'string'
      ? normalizePathKey(compilerOptions.configFilePath)
      : null
  const configPathEpoch = configPathKey
    ? (compilerOptionsVersionEpochByConfigPath.get(configPathKey) ?? 0)
    : 0
  const epoch = compilerOptionsVersionGlobalEpoch + configPathEpoch
  const cachedVersion = compilerOptionsVersionByProject.get(project)
  if (
    cachedVersion &&
    cachedVersion.epoch === epoch &&
    cachedVersion.configPathKey === configPathKey
  ) {
    return cachedVersion.version
  }

  const version = hashString(stableStringify(compilerOptions))
  compilerOptionsVersionByProject.set(project, {
    version,
    configPathKey,
    epoch,
  })
  return version
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

function shouldTrackRuntimeTypeScriptDependenciesForPath(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  filePath: string | undefined
): filePath is string {
  if (!filePath) {
    return false
  }

  return canUseRuntimePathCache(runtimeCacheStore, filePath)
}

function getRuntimeAnalysisConstDeps(): CacheStoreConstDependency[] {
  return [
    {
      name: RUNTIME_ANALYSIS_CACHE_VERSION_DEP,
      version: RUNTIME_ANALYSIS_CACHE_VERSION,
    },
  ]
}

function getRuntimeCacheReuseProfileTarget(options: {
  filePath?: string
  fallback: string
}): string {
  return normalizeCacheFilePath(options.filePath) ?? options.fallback
}

function getCacheContentIdKindForProfile(version: string | undefined): string {
  if (!version) {
    return 'unknown'
  }
  if (version === 'missing') {
    return 'missing'
  }
  if (version.startsWith('mtime:')) {
    return 'mtime'
  }
  if (version.startsWith('sha1:')) {
    return 'sha1'
  }
  if (version.startsWith('dir:')) {
    return 'dir'
  }
  return 'other'
}

function getCacheDepKeyKindForProfile(depKey: string): string {
  if (depKey.startsWith('const:')) {
    const encodedConstName = depKey.slice('const:'.length)
    let constName = encodedConstName
    try {
      constName = decodeURIComponent(encodedConstName)
    } catch {}

    if (
      constName === PROJECT_COMPILER_OPTIONS_DEP ||
      constName.startsWith(`${PROJECT_COMPILER_OPTIONS_DEP}:`)
    ) {
      return 'const:project:compiler-options'
    }
    if (constName === RUNTIME_ANALYSIS_CACHE_VERSION_DEP) {
      return 'const:runtime-analysis-cache-version'
    }
    return `const:${constName}`
  }

  if (depKey.startsWith('file:')) {
    const path = depKey.slice('file:'.length)
    if (path.endsWith('/tsconfig.json') || path.includes('/tsconfig.')) {
      return 'file:project-config'
    }
    if (path.startsWith('_renoun/') || path.includes('/_renoun/')) {
      return 'file:inline-generated'
    }
    if (path.endsWith('/package.json')) {
      return 'file:package-manifest'
    }
    return 'file:other'
  }

  if (depKey.startsWith('dir:')) {
    return 'dir:other'
  }

  if (depKey.startsWith('node:')) {
    if (depKey.includes(TYPE_SCRIPT_DEPENDENCY_ANALYSIS_CACHE_NAME)) {
      return 'node:ts-dependency-analysis'
    }
    if (depKey.includes(TYPE_SCRIPT_DEPENDENCY_FINGERPRINT_CACHE_NAME)) {
      return 'node:ts-dependency-fingerprint'
    }
    if (depKey.includes(MODULE_RESOLUTION_CACHE_NAME)) {
      return 'node:module-resolution'
    }
    return 'node:other'
  }

  return 'other'
}

function toRuntimeCacheReuseStaleReason(
  staleReason: CacheStoreFreshnessMismatch | 'graph-dirty' | undefined
): string | undefined {
  if (!staleReason) {
    return undefined
  }
  if (staleReason === 'graph-dirty') {
    return 'graph-dirty'
  }

  const dependencyKind = getCacheDepKeyKindForProfile(staleReason.depKey)
  const expectedKind = getCacheContentIdKindForProfile(
    staleReason.expectedVersion
  )
  const currentKind = getCacheContentIdKindForProfile(staleReason.currentVersion)
  return `${dependencyKind}:${expectedKind}->${currentKind}`
}

async function profileRuntimeCacheReuse(options: {
  method: 'getSourceTextMetadata' | 'getTokens'
  runtimeCacheStore: RuntimeAnalysisCacheStore | undefined
  nodeKey: string | undefined
  target: string
}): Promise<void> {
  if (!isRpcBuildProfileEnabled()) {
    return
  }

  if (!options.runtimeCacheStore || !options.nodeKey) {
    recordRpcCacheReuse({
      method: options.method,
      outcome: 'unavailable',
      target: options.target,
    })
    return
  }

  try {
    const freshness = await options.runtimeCacheStore.store.getWithFreshness(
      options.nodeKey,
      {
        includeStaleReason: true,
      }
    )
    if (freshness.value === undefined) {
      recordRpcCacheReuse({
        method: options.method,
        outcome: 'miss',
        target: options.target,
      })
      return
    }

    recordRpcCacheReuse({
      method: options.method,
      outcome: freshness.fresh ? 'hit' : 'stale',
      target: options.target,
    })
    if (!freshness.fresh) {
      const staleReason = toRuntimeCacheReuseStaleReason(freshness.staleReason)
      if (staleReason) {
        recordRpcCacheReuseStaleReason({
          method: options.method,
          reason: staleReason,
          target: options.target,
        })
      }
    }
  } catch {
    recordRpcCacheReuse({
      method: options.method,
      outcome: 'error',
      target: options.target,
    })
  }
}

function createRuntimeTypeScriptDependencyTrackingDedupeKey(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  filePath: string,
  compilerOptionsVersion: string
): string {
  return `${runtimeCacheStore.snapshot.id}:${compilerOptionsVersion}:${normalizePathKey(filePath)}`
}

function createRuntimeTypeScriptDependencyAnalysisCacheNodeKey(
  filePath: string,
  compilerOptionsVersion: string
): string {
  return createRuntimeAnalysisCacheNodeKey(
    TYPE_SCRIPT_DEPENDENCY_ANALYSIS_CACHE_NAME,
    {
      compilerOptionsVersion,
      filePath: normalizeCacheFilePath(filePath),
    }
  )
}

function createRuntimeTypeScriptDependencyFingerprintCacheNodeKey(
  filePath: string,
  compilerOptionsVersion: string
): string {
  return createRuntimeAnalysisCacheNodeKey(
    TYPE_SCRIPT_DEPENDENCY_FINGERPRINT_CACHE_NAME,
    {
      compilerOptionsVersion,
      filePath: normalizeCacheFilePath(filePath),
    }
  )
}

async function getSnapshotContentIdIfPossible(
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  path: string | undefined
): Promise<string | undefined> {
  if (!path) {
    return undefined
  }

  try {
    const absolutePath = runtimeCacheStore.fileSystem.getAbsolutePath(path)
    return await runtimeCacheStore.snapshot.contentId(absolutePath)
  } catch {
    return undefined
  }
}

async function computeRuntimeTypeScriptDependencyFingerprint(options: {
  project: Project
  runtimeCacheStore: RuntimeAnalysisCacheStore
  filePath: string
  compilerOptionsVersion: string
}): Promise<{
  importResolutionFingerprint: string
  directDependencyFilePaths: string[]
  packageManifestDependencyPaths: string[]
}> {
  const { project, runtimeCacheStore, filePath, compilerOptionsVersion } =
    options
  const sourceFile = project.getSourceFile(filePath)
  const rootPath = sourceFile?.getFilePath() ?? filePath
  const moduleSpecifiers = sourceFile
    ? Array.from(
        new Set(
          collectSourceFileModuleSpecifiers(sourceFile)
            .map((moduleSpecifier) => normalizeModuleSpecifier(moduleSpecifier))
            .filter((moduleSpecifier) => moduleSpecifier.length > 0)
        )
      ).sort((first, second) => first.localeCompare(second))
    : []

  const directDependencyFilePaths = new Set<string>()
  const packageNames = new Set<string>()

  for (const moduleSpecifier of moduleSpecifiers) {
    if (isModuleSpecifierRelativeOrAbsolute(moduleSpecifier)) {
      const resolvedDependencyPath = resolveModuleSpecifierSourceFilePathUncached(
        project,
        rootPath,
        moduleSpecifier
      )
      if (resolvedDependencyPath) {
        directDependencyFilePaths.add(resolvedDependencyPath)
      }
      continue
    }

    const packageName = getPackageNameFromModuleSpecifier(moduleSpecifier)
    if (packageName) {
      packageNames.add(packageName)
    }
  }

  const packageManifestDependencyPaths = new Set<string>()
  const workspaceRootPath = getWorkspaceRootPath(runtimeCacheStore)
  if (workspaceRootPath) {
    const packageManifestByPath = new Map<string, PackageManifest | null>()
    for (const packageName of Array.from(packageNames.values()).sort((a, b) =>
      a.localeCompare(b)
    )) {
      const declaredPackageManifestPath = resolveDeclaredPackageManifestPath(
        runtimeCacheStore,
        packageManifestByPath,
        workspaceRootPath,
        rootPath,
        packageName
      )
      const installedPackageManifestPath = resolveInstalledPackageManifestPath(
        runtimeCacheStore,
        packageManifestByPath,
        workspaceRootPath,
        rootPath,
        packageName
      )

      if (declaredPackageManifestPath) {
        packageManifestDependencyPaths.add(declaredPackageManifestPath)
      }
      if (installedPackageManifestPath) {
        packageManifestDependencyPaths.add(installedPackageManifestPath)
      }
    }
  }

  const rootPathContentId = await getSnapshotContentIdIfPossible(
    runtimeCacheStore,
    rootPath
  )
  const projectConfigPath = (project.getCompilerOptions() as {
    configFilePath?: string
  }).configFilePath
  const projectConfigContentId = await getSnapshotContentIdIfPossible(
    runtimeCacheStore,
    projectConfigPath
  )

  const directDependencyFingerprints = await Promise.all(
    Array.from(directDependencyFilePaths.values())
      .sort((first, second) => first.localeCompare(second))
      .map(async (dependencyPath) => {
        const contentId = await getSnapshotContentIdIfPossible(
          runtimeCacheStore,
          dependencyPath
        )
        return `${normalizePathKey(dependencyPath)}:${contentId ?? 'missing'}`
      })
  )
  const packageManifestFingerprints = await Promise.all(
    Array.from(packageManifestDependencyPaths.values())
      .sort((first, second) => first.localeCompare(second))
      .map(async (manifestPath) => {
        const contentId = await getSnapshotContentIdIfPossible(
          runtimeCacheStore,
          manifestPath
        )
        return `${normalizePathKey(manifestPath)}:${contentId ?? 'missing'}`
      })
  )

  return {
    importResolutionFingerprint: hashString(
      stableStringify({
        compilerOptionsVersion,
        rootPath: normalizePathKey(rootPath),
        rootPathContentId: rootPathContentId ?? 'missing',
        projectConfigPath: normalizeCacheFilePath(projectConfigPath) ?? null,
        projectConfigContentId: projectConfigContentId ?? 'missing',
        moduleSpecifiers,
        directDependencyFingerprints,
        packageManifestFingerprints,
      })
    ),
    directDependencyFilePaths: Array.from(directDependencyFilePaths.values()),
    packageManifestDependencyPaths: Array.from(
      packageManifestDependencyPaths.values()
    ),
  }
}

async function getCachedRuntimeTypeScriptDependencyFingerprint(
  project: Project,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  filePath: string | undefined,
  compilerOptionsVersion: string
): Promise<RuntimeTypeScriptDependencyFingerprintResult | undefined> {
  if (!filePath) {
    return undefined
  }

  const nodeKey = createRuntimeTypeScriptDependencyFingerprintCacheNodeKey(
    filePath,
    compilerOptionsVersion
  )
  const dedupeKey = createRuntimeTypeScriptDependencyTrackingDedupeKey(
    runtimeCacheStore,
    filePath,
    `${compilerOptionsVersion}:fingerprint`
  )
  const pending = runtimeTypeScriptDependencyFingerprintInFlightByKey.get(
    dedupeKey
  )
  if (pending) {
    return pending
  }

  const runtimeConstDeps = getRuntimeAnalysisConstDeps()
  const task = runtimeCacheStore.store
    .getOrCompute(
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
          filePath
        )

        const fingerprint = await computeRuntimeTypeScriptDependencyFingerprint({
          project,
          runtimeCacheStore,
          filePath,
          compilerOptionsVersion,
        })

        await recordFileDependenciesIfPossible(
          context,
          runtimeCacheStore,
          fingerprint.directDependencyFilePaths
        )
        await recordFileDependenciesIfPossible(
          context,
          runtimeCacheStore,
          fingerprint.packageManifestDependencyPaths
        )

        return fingerprint
      }
    )
    .then((value) => ({
      nodeKey,
      importResolutionFingerprint: value.importResolutionFingerprint,
      directDependencyFilePaths: value.directDependencyFilePaths,
      packageManifestDependencyPaths: value.packageManifestDependencyPaths,
    }))
    .finally(() => {
      if (
        runtimeTypeScriptDependencyFingerprintInFlightByKey.get(dedupeKey) ===
        task
      ) {
        runtimeTypeScriptDependencyFingerprintInFlightByKey.delete(dedupeKey)
      }
    })

  runtimeTypeScriptDependencyFingerprintInFlightByKey.set(dedupeKey, task)
  return task
}

function flushRuntimeTypeScriptDependencySidecarHydrationQueue(): void {
  const concurrencyLimit = RUNTIME_TS_DEPENDENCY_SIDECAR_HYDRATION_CONCURRENCY

  while (
    runtimeTypeScriptDependencySidecarHydrationActiveCount < concurrencyLimit
  ) {
    const queuedHydration =
      runtimeTypeScriptDependencySidecarHydrationQueue.shift()
    if (!queuedHydration) {
      return
    }

    runtimeTypeScriptDependencySidecarHydrationActiveCount += 1
    void queuedHydration
      .run()
      .catch(() => {})
      .finally(() => {
        runtimeTypeScriptDependencySidecarHydrationActiveCount = Math.max(
          0,
          runtimeTypeScriptDependencySidecarHydrationActiveCount - 1
        )
        flushRuntimeTypeScriptDependencySidecarHydrationQueue()
      })
  }
}

function queueRuntimeTypeScriptDependencySidecarHydration(options: {
  project: Project
  runtimeCacheStore: RuntimeAnalysisCacheStore
  filePath: string
  compilerOptionsVersion: string
}): void {
  const dedupeKey = createRuntimeTypeScriptDependencyTrackingDedupeKey(
    options.runtimeCacheStore,
    options.filePath,
    options.compilerOptionsVersion
  )

  if (
    runtimeTypeScriptDependencySidecarHydrationInFlightByKey.has(dedupeKey)
  ) {
    return
  }

  let resolveHydration: () => void = () => {}
  const hydration = new Promise<void>((resolve) => {
    resolveHydration = resolve
  }).finally(() => {
    if (
      runtimeTypeScriptDependencySidecarHydrationInFlightByKey.get(dedupeKey) ===
      hydration
    ) {
      runtimeTypeScriptDependencySidecarHydrationInFlightByKey.delete(dedupeKey)
    }
  })

  runtimeTypeScriptDependencySidecarHydrationInFlightByKey.set(
    dedupeKey,
    hydration
  )
  runtimeTypeScriptDependencySidecarHydrationQueue.push({
    dedupeKey,
    run: async () => {
      try {
        await getCachedRuntimeTypeScriptDependencyAnalysis(
          options.project,
          options.runtimeCacheStore,
          options.filePath,
          options.compilerOptionsVersion
        )
      } finally {
        resolveHydration()
      }
    },
  })
  flushRuntimeTypeScriptDependencySidecarHydrationQueue()
}

async function recordRuntimeTypeScriptDependencySidecar(
  context: CacheStoreComputeContext,
  project: Project,
  runtimeCacheStore: RuntimeAnalysisCacheStore,
  filePath: string | undefined,
  compilerOptionsVersion: string
): Promise<void> {
  if (!filePath) {
    return
  }

  if (process.env['NODE_ENV'] === 'test') {
    const dependencyAnalysis = await getCachedRuntimeTypeScriptDependencyAnalysis(
      project,
      runtimeCacheStore,
      filePath,
      compilerOptionsVersion
    )
    if (!dependencyAnalysis) {
      return
    }

    await context.recordNodeDep(dependencyAnalysis.nodeKey)
    return
  }

  const nodeKey = createRuntimeTypeScriptDependencyAnalysisCacheNodeKey(
    filePath,
    compilerOptionsVersion
  )
  await context.recordNodeDep(nodeKey)
  queueRuntimeTypeScriptDependencySidecarHydration({
    project,
    runtimeCacheStore,
    filePath,
    compilerOptionsVersion,
  })
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

function ensureProjectSourceFileLoaded(
  project: Project,
  filePath: string
): void {
  if (project.getSourceFile(filePath)) {
    return
  }

  project.addSourceFileAtPath(filePath)
}

export async function getCachedFileExports(
  project: Project,
  filePath: string
): Promise<ModuleExport[]> {
  ensureProjectSourceFileLoaded(project, filePath)

  const runtimeCacheStore = await getRuntimeAnalysisSession()
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, filePath)
  ) {
    const staleWhileRevalidate = getRuntimeAnalysisSWRReadOptions()
    const runtimeConstDeps = getRuntimeAnalysisConstDeps()
    const nodeKey = createRuntimeFileExportsCacheNodeKey(
      filePath,
      compilerOptionsVersion
    )

    return runtimeCacheStore.store.getOrCompute(
      nodeKey,
      {
        persist: true,
        constDeps: runtimeConstDeps,
        staleWhileRevalidate,
      },
      async (context) => {
        recordConstDependencies(context, runtimeConstDeps)

        await recordProjectConfigDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          filePath
        )

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

        if (shouldTrackRuntimeTypeScriptDependencies()) {
          await recordRuntimeTypeScriptDependencySidecar(
            context,
            project,
            runtimeCacheStore,
            filePath,
            compilerOptionsVersion
          )
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
  const runtimeCacheStore = await getRuntimeAnalysisSession()
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, filePath)
  ) {
    const staleWhileRevalidate = getRuntimeAnalysisSWRReadOptions()
    const runtimeConstDeps = getRuntimeAnalysisConstDeps()
    const nodeKey = createRuntimeAnalysisCacheNodeKey(
      OUTLINE_RANGES_CACHE_NAME,
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
        staleWhileRevalidate,
      },
      async (context) => {
        recordConstDependencies(context, runtimeConstDeps)

        await recordProjectConfigDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          filePath
        )

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
  const runtimeCacheStore = await getRuntimeAnalysisSession()
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, options.filePath)
  ) {
    const staleWhileRevalidate = getRuntimeAnalysisSWRReadOptions()
    const runtimeConstDeps = getRuntimeAnalysisConstDeps()
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
        staleWhileRevalidate,
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
  const runtimeCacheStore = await getRuntimeAnalysisSession()
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, options.filePath)
  ) {
    const staleWhileRevalidate = getRuntimeAnalysisSWRReadOptions()
    const runtimeConstDeps = getRuntimeAnalysisConstDeps()
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
        staleWhileRevalidate,
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
  const runtimeCacheStore = await getRuntimeAnalysisSession()
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, options.filePath)
  ) {
    const staleWhileRevalidate =
      options.includeDependencies === true
        ? undefined
        : getRuntimeAnalysisSWRReadOptions()
    const runtimeConstDeps = getRuntimeAnalysisConstDeps()
    const nodeKey = createRuntimeAnalysisCacheNodeKey(
      FILE_EXPORT_TEXT_CACHE_NAME,
      {
        compilerOptionsVersion,
        filePath: normalizeCacheFilePath(options.filePath),
        position: options.position,
        kind: options.kind,
        includeDependencies: options.includeDependencies === true,
      }
    )

    return runtimeCacheStore.store.getOrCompute(
      nodeKey,
      {
        persist: true,
        constDeps: runtimeConstDeps,
        staleWhileRevalidate,
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
    const runtimeCacheStore = await getRuntimeAnalysisSession()
    if (
      runtimeCacheStore &&
      canUseRuntimePathCache(runtimeCacheStore, options.filePath)
    ) {
      const staleWhileRevalidate = getRuntimeAnalysisSWRReadOptions()
      const runtimeConstDeps = getRuntimeAnalysisConstDeps()
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
          staleWhileRevalidate,
        },
        async (context) => {
          recordConstDependencies(context, runtimeConstDeps)

          await recordProjectConfigDependency(
            context,
            runtimeCacheStore,
            project
          )
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

          if (shouldTrackRuntimeTypeScriptDependencies()) {
            await recordRuntimeTypeScriptDependencySidecar(
              context,
              project,
              runtimeCacheStore,
              options.filePath,
              compilerOptionsVersion
            )
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
  const runtimeCacheStore = await getRuntimeAnalysisSession()
  const compilerOptionsVersion = getCompilerOptionsVersion(project)

  if (
    runtimeCacheStore &&
    canUseRuntimePathCache(runtimeCacheStore, filePath)
  ) {
    const staleWhileRevalidate = getRuntimeAnalysisSWRReadOptions()
    const runtimeConstDeps = getRuntimeAnalysisConstDeps()
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
        staleWhileRevalidate,
      },
      async (context) => {
        recordConstDependencies(context, runtimeConstDeps)

        await recordProjectConfigDependency(context, runtimeCacheStore, project)
        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          filePath
        )

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
  const shouldProfileRpcCacheReuse = isRpcBuildProfileEnabled()
  const profileTarget = getRuntimeCacheReuseProfileTarget({
    filePath: options.filePath,
    fallback: `inline:${options.language ?? 'txt'}`,
  })
  const runtimeCacheStore = await getRuntimeAnalysisSession()
  if (!runtimeCacheStore) {
    if (shouldProfileRpcCacheReuse) {
      await profileRuntimeCacheReuse({
        method: 'getSourceTextMetadata',
        runtimeCacheStore: undefined,
        nodeKey: undefined,
        target: profileTarget,
      })
    }
    return baseGetSourceTextMetadata({
      ...options,
      project,
    })
  }

  const compilerOptionsVersion = getCompilerOptionsVersion(project)
  const runtimeConstDeps = getRuntimeAnalysisConstDeps()
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

  if (shouldProfileRpcCacheReuse) {
    await profileRuntimeCacheReuse({
      method: 'getSourceTextMetadata',
      runtimeCacheStore,
      nodeKey,
      target: profileTarget,
    })
  }

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
      if (shouldTrackRuntimeTypeScriptDependencies()) {
        const sourceTextDependencyAnalysisPaths = new Set<string>()
        if (
          shouldTrackRuntimeTypeScriptDependenciesForPath(
            runtimeCacheStore,
            options.filePath
          )
        ) {
          sourceTextDependencyAnalysisPaths.add(options.filePath)
        }
        if (
          shouldTrackRuntimeTypeScriptDependenciesForPath(
            runtimeCacheStore,
            result.filePath
          )
        ) {
          sourceTextDependencyAnalysisPaths.add(result.filePath)
        }

        for (const dependencyAnalysisPath of sourceTextDependencyAnalysisPaths) {
          await recordRuntimeTypeScriptDependencySidecar(
            context,
            project,
            runtimeCacheStore,
            dependencyAnalysisPath,
            compilerOptionsVersion
          )
        }
      }

      return result
    }
  )
}

export async function getCachedTokens(
  project: Project,
  options: Omit<GetTokensOptions, 'project'>
): Promise<TokenizedLines> {
  const shouldProfileRpcCacheReuse = isRpcBuildProfileEnabled()
  const profileTarget = getRuntimeCacheReuseProfileTarget({
    filePath: options.filePath,
    fallback:
      typeof options.sourcePath === 'string'
        ? normalizePathKey(options.sourcePath)
        : `inline:${options.language ?? 'plaintext'}`,
  })
  const runtimeCacheStore = await getRuntimeAnalysisSession()
  if (!runtimeCacheStore) {
    if (shouldProfileRpcCacheReuse) {
      await profileRuntimeCacheReuse({
        method: 'getTokens',
        runtimeCacheStore: undefined,
        nodeKey: undefined,
        target: profileTarget,
      })
    }
    return baseGetTokens({
      ...options,
      project,
    })
  }

  const compilerOptionsVersion = getCompilerOptionsVersion(project)
  const normalizedFilePath = normalizeCacheFilePath(options.filePath)
  const runtimeConstDeps = getRuntimeAnalysisConstDeps()
  const nodeKey = createRuntimeAnalysisCacheNodeKey(TOKENS_CACHE_NAME, {
    compilerOptionsVersion,
    filePath: normalizedFilePath,
    sourcePath:
      typeof options.sourcePath === 'string'
        ? normalizePathKey(options.sourcePath)
        : (options.sourcePath ?? null),
    language: options.language ?? 'plaintext',
    themeSignature: getThemeSignature(options.theme),
    themeNames: getThemeNamesForCache(options.theme),
    allowErrors: options.allowErrors ?? null,
    showErrors: options.showErrors ?? null,
    valueSignature: toTokenValueSignature(options.value),
  })

  if (shouldProfileRpcCacheReuse) {
    await profileRuntimeCacheReuse({
      method: 'getTokens',
      runtimeCacheStore,
      nodeKey,
      target: profileTarget,
    })
  }

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

      if (
        shouldTrackRuntimeTypeScriptDependencies() &&
        shouldTrackRuntimeTypeScriptDependenciesForPath(
          runtimeCacheStore,
          options.filePath
        )
      ) {
        await recordRuntimeTypeScriptDependencySidecar(
          context,
          project,
          runtimeCacheStore,
          options.filePath,
          compilerOptionsVersion
        )
      }

      return result
    }
  )
}
