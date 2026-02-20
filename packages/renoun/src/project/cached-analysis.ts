import type { SyntaxKind, Project } from '../utils/ts-morph.ts'
import { hashString, stableStringify } from '../utils/stable-serialization.ts'

import { getRootDirectory } from '../utils/get-root-directory.ts'
import {
  createPersistentCacheNodeKey,
  normalizeCachePath,
  serializeTypeFilterForCache,
} from '../file-system/cache-key.ts'
import { CacheStore, type CacheStoreComputeContext } from '../file-system/Cache.ts'
import { getCacheStorePersistence } from '../file-system/CacheSqlite.ts'
import { NodeFileSystem } from '../file-system/NodeFileSystem.ts'
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
import { createProjectFileCache } from './cache.ts'

const FILE_EXPORTS_CACHE_NAME = 'fileExports'
const OUTLINE_RANGES_CACHE_NAME = 'outlineRanges'
const FILE_EXPORT_STATIC_VALUE_CACHE_NAME = 'fileExportStaticValue'
const FILE_EXPORT_TEXT_CACHE_NAME = 'fileExportText'
const RESOLVE_TYPE_AT_LOCATION_CACHE_NAME = 'resolveTypeAtLocation'
const TRANSPILE_SOURCE_FILE_CACHE_NAME = 'transpileSourceFile'
const TOKENS_CACHE_NAME = 'tokens'
const SOURCE_TEXT_METADATA_CACHE_NAME = 'sourceTextMetadata'
const RUNTIME_ANALYSIS_CACHE_SCOPE = 'project-analysis-runtime'
const RUNTIME_ANALYSIS_CACHE_VERSION = '1'
const RUNTIME_ANALYSIS_CACHE_VERSION_DEP = 'runtime-analysis-cache-version'
const PROJECT_COMPILER_OPTIONS_DEP = 'project:compiler-options'

interface RuntimeAnalysisCacheStore {
  store: CacheStore
  fileSystem: NodeFileSystem
}

let runtimeAnalysisCacheStore:
  | RuntimeAnalysisCacheStore
  | null
  | undefined

function getRuntimeAnalysisCacheStore(): RuntimeAnalysisCacheStore | undefined {
  if (runtimeAnalysisCacheStore !== undefined) {
    return runtimeAnalysisCacheStore ?? undefined
  }

  try {
    const fileSystem = new NodeFileSystem()
    const snapshot = new FileSystemSnapshot(fileSystem)
    const projectRoot = resolveRuntimeAnalysisProjectRoot(fileSystem)
    const persistence = projectRoot
      ? getCacheStorePersistence({ projectRoot })
      : getCacheStorePersistence()

    runtimeAnalysisCacheStore = {
      store: new CacheStore({
        snapshot,
        persistence,
      }),
      fileSystem,
    }
  } catch {
    runtimeAnalysisCacheStore = null
  }

  return runtimeAnalysisCacheStore ?? undefined
}

function resolveRuntimeAnalysisProjectRoot(
  fileSystem: NodeFileSystem
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

function getSourceFileDependencyPaths(
  project: Project,
  filePath: string
): string[] {
  const sourceFile = project.getSourceFile(filePath)

  if (!sourceFile) {
    return []
  }

  const dependencyPaths = new Set<string>()
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const dependencySourceFile = importDeclaration.getModuleSpecifierSourceFile()
    if (dependencySourceFile) {
      dependencyPaths.add(dependencySourceFile.getFilePath())
    }
  }

  for (const exportDeclaration of sourceFile.getExportDeclarations()) {
    const dependencySourceFile = exportDeclaration.getModuleSpecifierSourceFile()
    if (dependencySourceFile) {
      dependencyPaths.add(dependencySourceFile.getFilePath())
    }
  }

  return Array.from(dependencyPaths.values())
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
    runtimeCacheStore.fileSystem.getRelativePathToWorkspace(path)
    await context.recordFileDep(path)
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
  const runtimeCacheStore = getRuntimeAnalysisCacheStore()
  if (!runtimeCacheStore) {
    return baseGetSourceTextMetadata({
      ...options,
      project,
    })
  }

  const compilerOptionsVersion = getCompilerOptionsVersion(project)
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
      constDeps: [
        {
          name: RUNTIME_ANALYSIS_CACHE_VERSION_DEP,
          version: RUNTIME_ANALYSIS_CACHE_VERSION,
        },
        {
          name: PROJECT_COMPILER_OPTIONS_DEP,
          version: compilerOptionsVersion,
        },
      ],
    },
    async (context) => {
      context.recordConstDep(
        RUNTIME_ANALYSIS_CACHE_VERSION_DEP,
        RUNTIME_ANALYSIS_CACHE_VERSION
      )
      context.recordConstDep(PROJECT_COMPILER_OPTIONS_DEP, compilerOptionsVersion)

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

      return result
    }
  )
}

export async function getCachedTokens(
  project: Project,
  options: Omit<GetTokensOptions, 'project'>
): Promise<TokenizedLines> {
  const runtimeCacheStore = getRuntimeAnalysisCacheStore()
  if (!runtimeCacheStore) {
    return baseGetTokens({
      ...options,
      project,
    })
  }

  const compilerOptionsVersion = getCompilerOptionsVersion(project)
  const normalizedFilePath = normalizeCacheFilePath(options.filePath)
  const directDependencyPaths = options.filePath
    ? getSourceFileDependencyPaths(project, options.filePath)
    : []
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
      constDeps: [
        {
          name: RUNTIME_ANALYSIS_CACHE_VERSION_DEP,
          version: RUNTIME_ANALYSIS_CACHE_VERSION,
        },
        {
          name: PROJECT_COMPILER_OPTIONS_DEP,
          version: compilerOptionsVersion,
        },
      ],
    },
    async (context) => {
      context.recordConstDep(
        RUNTIME_ANALYSIS_CACHE_VERSION_DEP,
        RUNTIME_ANALYSIS_CACHE_VERSION
      )
      context.recordConstDep(PROJECT_COMPILER_OPTIONS_DEP, compilerOptionsVersion)

      await recordProjectConfigDependency(context, runtimeCacheStore, project)
      await recordFileDependencyIfPossible(
        context,
        runtimeCacheStore,
        options.filePath
      )

      for (const dependencyPath of directDependencyPaths) {
        await recordFileDependencyIfPossible(
          context,
          runtimeCacheStore,
          dependencyPath
        )
      }

      return baseGetTokens({
        ...options,
        project,
      })
    }
  )
}
