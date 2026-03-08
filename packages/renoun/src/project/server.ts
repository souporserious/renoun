import { watch, type FSWatcher, type Dirent } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { getTsMorph } from '../utils/ts-morph.ts'
import type { SyntaxKind as TsMorphSyntaxKind } from '../utils/ts-morph.ts'

import {
  createHighlighter,
  type Highlighter,
} from '../utils/create-highlighter.ts'
import type { ConfigurationOptions } from '../components/Config/types.ts'
import { reportBestEffortError } from '../utils/best-effort.ts'
import { getDebugLogger } from '../utils/debug.ts'
import {
  collapseInvalidationPaths,
} from '../utils/collapse-invalidation-paths.ts'
import {
  isDevelopmentEnvironment,
  isProductionEnvironment,
} from '../utils/env.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import type { GetTokensOptions } from '../utils/get-tokens.ts'
import type { GetSourceTextMetadataOptions } from '../utils/get-source-text-metadata.ts'
import { prewarmSourceTextFormatterRuntime } from '../utils/format-source-text.ts'
import { mapConcurrent } from '../utils/concurrency.ts'
import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.ts'
import { getFileExportTextResult } from '../utils/get-file-export-text.ts'
import { getQuickInfoAtPosition } from '../utils/get-quick-info-at-position.ts'
import type { TypeFilter } from '../utils/resolve-type.ts'
import { WebSocketServer } from './rpc/server.ts'
import {
  getCachedFileExportText,
  getCachedFileExportMetadata,
  getCachedFileExportStaticValue,
  getCachedFileExports,
  getCachedOutlineRanges,
  getCachedSourceTextMetadata,
  getCachedTypeScriptDependencyPaths,
  getCachedTokens,
  invalidateRuntimeAnalysisCachePath,
  onRuntimeAnalysisBackgroundRefresh,
  prewarmRuntimeAnalysisSession,
  resolveCachedTypeAtLocationWithDependencies,
  transpileCachedSourceFile,
} from './cached-analysis.ts'
import { invalidateProjectFileCache } from './cache.ts'
import { disposeProjectWatchers, getProject } from './get-project.ts'
import {
  type RefreshInvalidationsSinceRequest,
  type RefreshInvalidationsSinceResponse,
  normalizeRefreshCursor,
} from './refresh-notifications.ts'
import {
  clearServerRuntimeProcessEnv,
  notifyServerRuntimeEnvChanged,
  resolveServerRefreshNotificationsEnvOverride,
  setServerHostProcessEnv,
  setServerIdProcessEnv,
  setServerRefreshNotificationsProcessEnv,
  setServerPortProcessEnv,
} from './runtime-env.ts'
import type { ProjectOptions } from './types.ts'
import {
  extractCodeFenceLanguagesFromMarkdown,
  isMarkdownCodeFenceSourcePath,
} from './markdown-code-fence-languages.ts'
import {
  getSharedFileTextPrefix,
  invalidateSharedFileTextPrefixCachePath,
} from './file-text-prefix-cache.ts'

const { SyntaxKind } = getTsMorph()

let currentHighlighter: Promise<Highlighter> | null = null
let resolvedHighlighter: Highlighter | null = null
let activeProjectServers = 0

interface ActiveProjectServerRuntime {
  server: WebSocketServer
  port: string
  id: string
  host: 'localhost' | '127.0.0.1' | '::1'
  emitRefreshNotifications: boolean
}

const activeProjectServerRuntimes: ActiveProjectServerRuntime[] = []

type RefreshNotificationPriority = 'immediate' | 'background'
const REFRESH_NOTIFICATION_PRIORITY_DELAY_MS: Record<
  RefreshNotificationPriority,
  number
> = {
  immediate: 0,
  background: 50,
}
const REFRESH_NOTIFICATION_HISTORY_LIMIT = 250
const IGNORED_REFRESH_PATH_SEGMENTS = new Set([
  '.next',
  '.renoun',
  '.git',
  'node_modules',
  'out',
  'dist',
  'build',
  'coverage',
])
const CODE_FENCE_PREWARM_PRIORITY_DELAY_MS: Record<
  RefreshNotificationPriority,
  number
> = {
  immediate: 0,
  background: 250,
}
const CODE_FENCE_PREWARM_MAX_FILE_COUNT = 200
const CODE_FENCE_PREWARM_MAX_DIRECTORY_COUNT = 1_000
const CODE_FENCE_PREWARM_MAX_LANGUAGE_COUNT = 24
const CODE_FENCE_PREWARM_FILE_READ_MAX_BYTES = 256_000
const CODE_FENCE_PREWARM_FILE_READ_CONCURRENCY = 6
const CODE_FENCE_PREWARM_TOKENIZE_CONCURRENCY = 4
const STARTUP_RUNTIME_PREWARM_TOKENIZE_CONCURRENCY = 4
const STARTUP_RUNTIME_PREWARM_METADATA_CONCURRENCY = 2
const STARTUP_RUNTIME_PREWARM_MAX_LANGUAGE_COUNT = 24
const STARTUP_RUNTIME_PREWARM_FALLBACK_LANGUAGES = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'shell',
  'bash',
  'mdx',
] as const

type StartupRuntimeMetadataWarmupSample = {
  value: string
  language: 'ts' | 'tsx'
  shouldFormat?: boolean
}

const STARTUP_RUNTIME_METADATA_WARMUP_SAMPLES: ReadonlyArray<
  StartupRuntimeMetadataWarmupSample
> = [
  {
    value: `export const answer = 42\n`,
    language: 'ts',
    shouldFormat: false,
  },
  {
    value: `export function Example(){return <div />}\n`,
    language: 'tsx',
    shouldFormat: false,
  },
]

interface ResolveTypeAtLocationRpcRequest {
  filePath: string
  position: number
  kind: TsMorphSyntaxKind
  filter?: TypeFilter | string
  projectOptions?: ProjectOptions
}

export interface CreateServerOptions {
  port?: number
  host?: 'localhost' | '127.0.0.1' | '::1'
  emitRefreshNotifications?: boolean
}

interface RpcValueWithDependenciesResponse<Value> {
  __renounClientRpcDependencies: true
  value: Value
  dependencies: string[]
}

type HighlighterInitializationOptions = Partial<
  Pick<ConfigurationOptions, 'theme' | 'languages'>
>

function toRpcValueWithDependenciesResponse<Value>(
  value: Value,
  dependencies: Iterable<string>
): RpcValueWithDependenciesResponse<Value> {
  const dependencyPaths = new Set<string>()

  for (const dependency of dependencies) {
    if (typeof dependency === 'string' && dependency.length > 0) {
      dependencyPaths.add(dependency)
    }
  }

  return {
    __renounClientRpcDependencies: true,
    value,
    dependencies: Array.from(dependencyPaths.values()),
  }
}

function toFileExportDependencyPaths(
  filePath: string,
  fileExports: ReadonlyArray<{ path?: string }>
): string[] {
  const dependencyPaths = new Set<string>([filePath])

  for (const fileExport of fileExports) {
    if (
      typeof fileExport.path === 'string' &&
      fileExport.path.length > 0
    ) {
      dependencyPaths.add(fileExport.path)
    }
  }

  return Array.from(dependencyPaths.values())
}

function getThemeNamesForCodeFencePrewarm(
  themeConfig: ConfigurationOptions['theme']
): string[] {
  if (!themeConfig) {
    return ['default']
  }

  if (typeof themeConfig === 'string') {
    return [themeConfig]
  }

  if (Array.isArray(themeConfig)) {
    return [themeConfig[0]]
  }

  const themeNames = Object.values(themeConfig).map((themeValue) =>
    typeof themeValue === 'string' ? themeValue : themeValue[0]
  )

  return themeNames.length > 0 ? themeNames : ['default']
}

function normalizeCodeFencePrewarmPath(path: string): string {
  return resolve(path)
}

function applyActiveProjectServerRuntimeToProcessEnv(
  runtime: ActiveProjectServerRuntime
): void {
  setServerPortProcessEnv(runtime.port)
  setServerIdProcessEnv(runtime.id)
  setServerHostProcessEnv(runtime.host)
  setServerRefreshNotificationsProcessEnv(runtime.emitRefreshNotifications)
  notifyServerRuntimeEnvChanged()
}

function registerActiveProjectServerRuntime(
  runtime: ActiveProjectServerRuntime
): void {
  unregisterActiveProjectServerRuntime(runtime.server)
  activeProjectServerRuntimes.push(runtime)
  applyActiveProjectServerRuntimeToProcessEnv(runtime)
}

function unregisterActiveProjectServerRuntime(server: WebSocketServer): void {
  const runtimeIndex = activeProjectServerRuntimes.findIndex((runtime) => {
    return runtime.server === server
  })
  if (runtimeIndex === -1) {
    return
  }

  const wasCurrentRuntime = runtimeIndex === activeProjectServerRuntimes.length - 1
  activeProjectServerRuntimes.splice(runtimeIndex, 1)

  if (!wasCurrentRuntime) {
    return
  }

  const nextCurrentRuntime =
    activeProjectServerRuntimes[activeProjectServerRuntimes.length - 1]
  if (nextCurrentRuntime) {
    applyActiveProjectServerRuntimeToProcessEnv(nextCurrentRuntime)
    return
  }

  clearServerRuntimeProcessEnv()
  notifyServerRuntimeEnvChanged()
}

function toRootRelativeRefreshPath(
  filePath: string,
  rootDirectory: string
): string {
  const relativePath = relative(resolve(rootDirectory), resolve(filePath))
  return relativePath.length === 0 ? '.' : relativePath
}

async function collectMarkdownFilesUnderDirectory(
  rootPath: string,
  limit: number
): Promise<string[]> {
  const files: string[] = []
  const directories: string[] = [rootPath]
  let scannedDirectoryCount = 0

  while (
    directories.length > 0 &&
    files.length < limit &&
    scannedDirectoryCount < CODE_FENCE_PREWARM_MAX_DIRECTORY_COUNT
  ) {
    const directoryPath = directories.shift()
    if (!directoryPath) {
      break
    }
    scannedDirectoryCount += 1

    let entries: Dirent[]
    try {
      entries = await readdir(directoryPath, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (files.length >= limit) {
        break
      }

      const entryName = entry.name
      if (!entryName) {
        continue
      }

      if (IGNORED_REFRESH_PATH_SEGMENTS.has(entryName)) {
        continue
      }

      const entryPath = join(directoryPath, entryName)
      if (entry.isDirectory()) {
        directories.push(entryPath)
        continue
      }

      if (entry.isFile() && isMarkdownCodeFenceSourcePath(entryPath)) {
        files.push(entryPath)
      }
    }
  }

  return files
}

async function readMarkdownCodeFenceLanguages(
  markdownFilePaths: readonly string[]
): Promise<string[]> {
  if (markdownFilePaths.length === 0) {
    return []
  }

  const languageSet = new Set<string>()

  await mapConcurrent(
    markdownFilePaths,
    {
      concurrency: CODE_FENCE_PREWARM_FILE_READ_CONCURRENCY,
    },
    async (filePath) => {
      const sourceTextPrefix = await getSharedFileTextPrefix(
        filePath,
        CODE_FENCE_PREWARM_FILE_READ_MAX_BYTES
      )
      if (sourceTextPrefix === undefined) {
        return
      }

      const languages = extractCodeFenceLanguagesFromMarkdown(sourceTextPrefix)
      for (const language of languages) {
        if (languageSet.size >= CODE_FENCE_PREWARM_MAX_LANGUAGE_COUNT) {
          return
        }

        languageSet.add(language)
      }
    }
  )

  return Array.from(languageSet.values())
}

function getStartupRuntimeWarmupSourceText(language: string): string {
  const normalizedLanguage = String(language).toLowerCase()

  switch (normalizedLanguage) {
    case 'tsx':
      return `export function Example(){return <div />}\n`
    case 'ts':
      return `export const answer: number = 42\n`
    case 'jsx':
      return `export function Example(){return <div />}\n`
    case 'js':
    case 'mjs':
    case 'cjs':
      return `export const answer = 42\n`
    case 'json':
      return `{"answer":42}\n`
    case 'yaml':
    case 'yml':
      return `answer: 42\n`
    case 'html':
      return `<div>Hello</div>\n`
    case 'css':
      return `.example { color: red; }\n`
    case 'md':
    case 'markdown':
      return `# Heading\n`
    case 'mdx':
      return `export const metadata = { title: 'Example' }\n\n# Heading\n`
    case 'shell':
    case 'bash':
    case 'sh':
      return `echo "hello"\n`
    default:
      return `example\n`
  }
}

function shouldIgnoreRefreshPath(filePath: string): boolean {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return true
  }

  const pathSegments = filePath.split(/[/\\]+/)
  for (const pathSegment of pathSegments) {
    if (IGNORED_REFRESH_PATH_SEGMENTS.has(pathSegment)) {
      return true
    }
  }

  return false
}

function parseTypeFilter(filter?: TypeFilter | string): TypeFilter | undefined {
  if (filter === undefined) {
    return undefined
  }

  const parsedFilter =
    typeof filter === 'string' ? parseTypeFilterJson(filter) : filter

  if (!isValidTypeFilter(parsedFilter)) {
    throw new Error(
      '[renoun] Invalid type filter payload. Expected a TypeFilter object or JSON stringified TypeFilter.'
    )
  }

  return parsedFilter
}

function parseTypeFilterJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error('[renoun] Invalid type filter JSON payload.')
  }
}

function isValidTypeFilter(value: unknown): value is TypeFilter {
  if (Array.isArray(value)) {
    return value.every(isValidFilterDescriptor)
  }

  return isValidFilterDescriptor(value)
}

function isValidFilterDescriptor(value: unknown): value is TypeFilter {
  if (!isObject(value)) {
    return false
  }

  const candidate = value as {
    moduleSpecifier?: unknown
    types?: unknown
  }

  if (
    candidate.moduleSpecifier !== undefined &&
    typeof candidate.moduleSpecifier !== 'string'
  ) {
    return false
  }

  if (!Array.isArray(candidate.types)) {
    return false
  }

  for (const typeEntry of candidate.types) {
    if (!isObject(typeEntry)) {
      return false
    }

    const candidateType = typeEntry as {
      name?: unknown
      properties?: unknown
    }

    if (typeof candidateType.name !== 'string') {
      return false
    }

    if (
      candidateType.properties !== undefined &&
      (!Array.isArray(candidateType.properties) ||
        !candidateType.properties.every(
          (property) => typeof property === 'string'
        ))
    ) {
      return false
    }
  }

  return true
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function getProductionRpcMemoizeOptions():
  | false
  | {
      ttlMs: number
      maxEntries: number
    } {
  if (!isProductionEnvironment()) {
    return false
  }

  return {
    ttlMs: 5 * 60_000,
    maxEntries: 2_000,
  }
}

/**
 * Create a WebSocket server that improves the performance of renoun components and
 * utilities by processing type analysis and syntax highlighting in a separate process.
 */
export async function createServer(options?: CreateServerOptions) {
  const server = new WebSocketServer({
    port: options?.port,
    host: options?.host,
  })
  const port = await server.getPort()
  const rootDirectory = getRootDirectory()

  let refreshFlushTimer: NodeJS.Timeout | undefined
  let refreshFlushDelayMs: number | undefined
  const pendingRefreshPaths = new Set<string>()
  const pendingRefreshEventTypes = new Set<string>()
  let refreshCursor = 0
  const refreshHistory: Array<{
    cursor: number
    filePaths: string[]
  }> = []
  let codeFencePrewarmFlushTimer: NodeJS.Timeout | undefined
  let codeFencePrewarmFlushDelayMs: number | undefined
  let codeFencePrewarmInFlight: Promise<void> = Promise.resolve()
  let hasQueuedInitialCodeFencePrewarm = false
  let queuedHighlighterInitialization: NodeJS.Timeout | undefined
  let startupRuntimePrewarmTimer: NodeJS.Timeout | undefined
  let startupRuntimePrewarmQueued = false
  let startupRuntimePrewarmInFlight: Promise<void> = Promise.resolve()
  let latestCodeFencePrewarmThemeNames: string[] = ['default']
  const latestHighlighterInitializationOptions: HighlighterInitializationOptions =
    {}
  const pendingCodeFencePrewarmPathsImmediate = new Set<string>()
  const pendingCodeFencePrewarmPathsBackground = new Set<string>()
  const deferredCodeFencePrewarmPaths = new Set<string>()
  const hasHighlighterInitializationOptions = (
    initOptions: HighlighterInitializationOptions
  ): boolean => {
    return (
      initOptions.theme !== undefined || initOptions.languages !== undefined
    )
  }
  const updateHighlighterInitializationOptions = (
    initOptions: HighlighterInitializationOptions
  ): void => {
    if (initOptions.theme !== undefined) {
      latestHighlighterInitializationOptions.theme = initOptions.theme
    }
    if (initOptions.languages !== undefined) {
      latestHighlighterInitializationOptions.languages = initOptions.languages
    }
  }
  const flushRefreshNotifications = () => {
    refreshFlushTimer = undefined
    refreshFlushDelayMs = undefined
    if (pendingRefreshPaths.size === 0) {
      return
    }

    const filePaths = Array.from(pendingRefreshPaths)
    const eventTypes = Array.from(pendingRefreshEventTypes)
    pendingRefreshPaths.clear()
    pendingRefreshEventTypes.clear()
    refreshCursor += 1

    refreshHistory.push({
      cursor: refreshCursor,
      filePaths,
    })
    if (refreshHistory.length > REFRESH_NOTIFICATION_HISTORY_LIMIT) {
      refreshHistory.splice(
        0,
        refreshHistory.length - REFRESH_NOTIFICATION_HISTORY_LIMIT
      )
    }

    server.sendNotification({
      type: 'refresh',
      data: {
        eventType: eventTypes.length === 1 ? eventTypes[0] : 'batch',
        eventTypes,
        refreshCursor,
        filePath: filePaths[0],
        filePaths,
      },
    })
  }
  const queueRefreshNotification = (
    filePaths: Iterable<string>,
    eventType: string,
    options: {
      priority?: RefreshNotificationPriority
    } = {}
  ) => {
    let hasPath = false

    for (const filePath of filePaths) {
      if (typeof filePath !== 'string' || filePath.length === 0) {
        continue
      }

      pendingRefreshPaths.add(filePath)
      hasPath = true
    }

    if (!hasPath) {
      return
    }

    pendingRefreshEventTypes.add(eventType)
    const priority = options.priority ?? 'immediate'
    const requestedDelayMs =
      REFRESH_NOTIFICATION_PRIORITY_DELAY_MS[priority] ?? 50
    if (
      refreshFlushTimer &&
      refreshFlushDelayMs !== undefined &&
      refreshFlushDelayMs <= requestedDelayMs
    ) {
      return
    }

    if (refreshFlushTimer) {
      clearTimeout(refreshFlushTimer)
    }

    refreshFlushTimer = setTimeout(
      flushRefreshNotifications,
      requestedDelayMs
    )
    refreshFlushDelayMs = requestedDelayMs
    refreshFlushTimer.unref?.()
  }

  const collectMarkdownFilesForCodeFencePrewarm = async (
    paths: readonly string[]
  ): Promise<string[]> => {
    const markdownFiles = new Set<string>()
    let shouldScanRoot = false

    for (const path of paths) {
      const normalizedPath = normalizeCodeFencePrewarmPath(path)
      if (isMarkdownCodeFenceSourcePath(normalizedPath)) {
        markdownFiles.add(normalizedPath)
        continue
      }

      if (normalizedPath === rootDirectory || path === '.') {
        shouldScanRoot = true
      }
    }

    if (
      shouldScanRoot &&
      markdownFiles.size < CODE_FENCE_PREWARM_MAX_FILE_COUNT
    ) {
      const discoveredMarkdownFiles = await collectMarkdownFilesUnderDirectory(
        rootDirectory,
        CODE_FENCE_PREWARM_MAX_FILE_COUNT - markdownFiles.size
      )
      for (const markdownFilePath of discoveredMarkdownFiles) {
        markdownFiles.add(markdownFilePath)
      }
    }

    return Array.from(markdownFiles.values()).slice(
      0,
      CODE_FENCE_PREWARM_MAX_FILE_COUNT
    )
  }

  const ensureHighlighter = async (
    options: HighlighterInitializationOptions
  ): Promise<Highlighter | null> => {
    if (resolvedHighlighter) {
      return resolvedHighlighter
    }

    if (currentHighlighter === null) {
      currentHighlighter = createHighlighter({
        theme: options.theme,
        languages: options.languages,
      })
        .then((highlighter) => {
          resolvedHighlighter = highlighter
          flushDeferredCodeFencePrewarmPaths()
          return highlighter
        })
        .catch((error) => {
          currentHighlighter = null
          resolvedHighlighter = null
          throw error
        })
    }

    try {
      const highlighter = await currentHighlighter
      resolvedHighlighter = highlighter
      return highlighter
    } catch (error) {
      reportBestEffortError('project/server', error)
      return null
    }
  }

  const queueHighlighterInitialization = (
    options: HighlighterInitializationOptions
  ): void => {
    updateHighlighterInitializationOptions(options)
    if (
      resolvedHighlighter ||
      currentHighlighter ||
      queuedHighlighterInitialization
    ) {
      return
    }

    queuedHighlighterInitialization = setTimeout(() => {
      queuedHighlighterInitialization = undefined
      void ensureHighlighter(latestHighlighterInitializationOptions)
    }, 0)
    queuedHighlighterInitialization.unref?.()
  }

  const prewarmCodeFenceLanguages = async (
    paths: readonly string[]
  ): Promise<void> => {
    if (!isDevelopmentEnvironment()) {
      return
    }

    const markdownFilePaths = await collectMarkdownFilesForCodeFencePrewarm(paths)
    if (markdownFilePaths.length === 0) {
      return
    }

    if (!currentHighlighter) {
      for (const path of markdownFilePaths) {
        deferredCodeFencePrewarmPaths.add(path)
      }
      return
    }

    const highlighter = await currentHighlighter.catch(() => null)
    if (!highlighter) {
      return
    }

    const languages = await readMarkdownCodeFenceLanguages(markdownFilePaths)
    if (languages.length === 0) {
      return
    }

    const themeNames = latestCodeFencePrewarmThemeNames.length
      ? latestCodeFencePrewarmThemeNames
      : ['default']

    await mapConcurrent(
      languages.slice(0, CODE_FENCE_PREWARM_MAX_LANGUAGE_COUNT),
      {
        concurrency: CODE_FENCE_PREWARM_TOKENIZE_CONCURRENCY,
      },
      async (language) => {
        try {
          await highlighter.tokenize(' ', language as any, themeNames)
        } catch {
          // Ignore unsupported languages; warm only what this setup can load.
        }
      }
    )
  }

  const flushCodeFenceLanguagePrewarm = () => {
    codeFencePrewarmFlushTimer = undefined
    codeFencePrewarmFlushDelayMs = undefined

    const pendingQueue =
      pendingCodeFencePrewarmPathsImmediate.size > 0
        ? pendingCodeFencePrewarmPathsImmediate
        : pendingCodeFencePrewarmPathsBackground
    if (pendingQueue.size === 0) {
      return
    }

    const paths = collapseInvalidationPaths(pendingQueue)
    pendingQueue.clear()
    if (paths.length === 0) {
      return
    }

    codeFencePrewarmInFlight = codeFencePrewarmInFlight
      .catch(() => {})
      .then(() => prewarmCodeFenceLanguages(paths))
      .catch((error) => {
        reportBestEffortError('project/server', error)
      })
      .finally(() => {
        if (
          pendingCodeFencePrewarmPathsImmediate.size > 0 ||
          pendingCodeFencePrewarmPathsBackground.size > 0
        ) {
          queueCodeFenceLanguagePrewarm([], {
            priority:
              pendingCodeFencePrewarmPathsImmediate.size > 0
                ? 'immediate'
                : 'background',
          })
        }
      })
  }

  const queueCodeFenceLanguagePrewarm = (
    filePaths: Iterable<string>,
    options: {
      priority?: RefreshNotificationPriority
    } = {}
  ) => {
    if (!isDevelopmentEnvironment()) {
      return
    }

    const priority = options.priority ?? 'background'
    const immediateQueue = pendingCodeFencePrewarmPathsImmediate
    const backgroundQueue = pendingCodeFencePrewarmPathsBackground

    for (const filePath of filePaths) {
      if (typeof filePath !== 'string' || filePath.length === 0) {
        continue
      }

      const normalizedPath = normalizeCodeFencePrewarmPath(filePath)
      const rootRelativePath = toRootRelativeRefreshPath(
        normalizedPath,
        rootDirectory
      )
      if (shouldIgnoreRefreshPath(rootRelativePath)) {
        continue
      }
      const isRootScopePath =
        normalizedPath === rootDirectory || rootRelativePath === '.'
      if (
        !isRootScopePath &&
        !isMarkdownCodeFenceSourcePath(normalizedPath)
      ) {
        continue
      }

      if (priority === 'immediate') {
        immediateQueue.add(normalizedPath)
        backgroundQueue.delete(normalizedPath)
        continue
      }

      if (!immediateQueue.has(normalizedPath)) {
        backgroundQueue.add(normalizedPath)
      }
    }

    if (immediateQueue.size === 0 && backgroundQueue.size === 0) {
      return
    }

    const requestedDelayMs =
      CODE_FENCE_PREWARM_PRIORITY_DELAY_MS[priority] ?? 250
    if (
      codeFencePrewarmFlushTimer &&
      codeFencePrewarmFlushDelayMs !== undefined &&
      codeFencePrewarmFlushDelayMs <= requestedDelayMs
    ) {
      return
    }

    if (codeFencePrewarmFlushTimer) {
      clearTimeout(codeFencePrewarmFlushTimer)
    }

    codeFencePrewarmFlushTimer = setTimeout(
      flushCodeFenceLanguagePrewarm,
      requestedDelayMs
    )
    codeFencePrewarmFlushDelayMs = requestedDelayMs
    codeFencePrewarmFlushTimer.unref?.()
  }

  const flushDeferredCodeFencePrewarmPaths = () => {
    if (!resolvedHighlighter) {
      return
    }

    if (!hasQueuedInitialCodeFencePrewarm) {
      hasQueuedInitialCodeFencePrewarm = true
      queueCodeFenceLanguagePrewarm([rootDirectory], {
        priority: 'immediate',
      })
    }
    if (deferredCodeFencePrewarmPaths.size > 0) {
      const deferredPaths = Array.from(deferredCodeFencePrewarmPaths)
      deferredCodeFencePrewarmPaths.clear()
      queueCodeFenceLanguagePrewarm(deferredPaths, {
        priority: 'immediate',
      })
    }
  }

  const prewarmRuntimeAnalysisStartup = async (
    paths: readonly string[]
  ): Promise<void> => {
    if (!isDevelopmentEnvironment()) {
      return
    }

    await prewarmRuntimeAnalysisSession(rootDirectory)

    const project = getProject()
    await mapConcurrent(
      STARTUP_RUNTIME_METADATA_WARMUP_SAMPLES,
      {
        concurrency: STARTUP_RUNTIME_PREWARM_METADATA_CONCURRENCY,
      },
      async (sample) => {
        try {
          await getCachedSourceTextMetadata(project, {
            value: sample.value,
            language: sample.language,
            shouldFormat: sample.shouldFormat ?? false,
            isFormattingExplicit: true,
          })
        } catch {
          // Best-effort startup warmup only.
        }
      }
    )

    const shouldInitializeHighlighter =
      Boolean(resolvedHighlighter) ||
      Boolean(currentHighlighter) ||
      hasHighlighterInitializationOptions(latestHighlighterInitializationOptions)
    if (shouldInitializeHighlighter) {
      await ensureHighlighter(latestHighlighterInitializationOptions)
    }

    const markdownFiles = await collectMarkdownFilesForCodeFencePrewarm(paths)
    const discoveredLanguages = await readMarkdownCodeFenceLanguages(markdownFiles)
    const warmupLanguageSet = new Set<string>(
      STARTUP_RUNTIME_PREWARM_FALLBACK_LANGUAGES
    )

    for (const language of discoveredLanguages) {
      if (warmupLanguageSet.size >= STARTUP_RUNTIME_PREWARM_MAX_LANGUAGE_COUNT) {
        break
      }
      warmupLanguageSet.add(language)
    }

    const warmupLanguages = Array.from(warmupLanguageSet).slice(
      0,
      STARTUP_RUNTIME_PREWARM_MAX_LANGUAGE_COUNT
    )
    if (warmupLanguages.length > 0) {
      const highlighter = resolvedHighlighter
      const themeNames = latestCodeFencePrewarmThemeNames.length
        ? latestCodeFencePrewarmThemeNames
        : ['default']

      if (highlighter) {
        await mapConcurrent(
          warmupLanguages,
          {
            concurrency: STARTUP_RUNTIME_PREWARM_TOKENIZE_CONCURRENCY,
          },
          async (language) => {
            try {
              await highlighter.tokenize(
                getStartupRuntimeWarmupSourceText(language),
                language as any,
                themeNames
              )
            } catch {
              // Ignore unsupported languages during best-effort warmup.
            }
          }
        )
      }
    }

    queueCodeFenceLanguagePrewarm(paths, {
      priority: 'immediate',
    })
  }

  const queueStartupRuntimePrewarm = (paths: readonly string[]): void => {
    if (!isDevelopmentEnvironment() || startupRuntimePrewarmQueued) {
      return
    }

    startupRuntimePrewarmQueued = true
    startupRuntimePrewarmTimer = setTimeout(() => {
      startupRuntimePrewarmTimer = undefined

      startupRuntimePrewarmInFlight = startupRuntimePrewarmInFlight
        .catch(() => {})
        .then(() => prewarmRuntimeAnalysisStartup(paths))
        .catch((error) => {
          reportBestEffortError('project/server', error)
        })
    }, 0)
    startupRuntimePrewarmTimer.unref?.()
  }

  if (isDevelopmentEnvironment()) {
    prewarmSourceTextFormatterRuntime()
    queueCodeFenceLanguagePrewarm([rootDirectory], {
      priority: 'immediate',
    })
    queueStartupRuntimePrewarm([rootDirectory])
  }

  let emitRefreshNotifications = shouldEmitRefreshNotifications(
    options?.emitRefreshNotifications
  )
  let unsubscribeRuntimeAnalysisBackgroundRefresh =
    onRuntimeAnalysisBackgroundRefresh((paths) => {
      if (!emitRefreshNotifications) {
        return
      }

      const refreshPaths = paths.filter((path) => {
        if (typeof path !== 'string' || path.length === 0) {
          return false
        }

        return !shouldIgnoreRefreshPath(
          toRootRelativeRefreshPath(path, rootDirectory)
        )
      })
      if (refreshPaths.length === 0) {
        return
      }

      queueRefreshNotification(
        refreshPaths,
        'runtime-analysis-background-refresh',
        {
          priority: 'background',
        }
      )
    })
  let rootWatcher: FSWatcher | undefined
  if (emitRefreshNotifications) {
    try {
      rootWatcher = watch(
        rootDirectory,
        { recursive: true },
        (eventType, fileName) => {
          if (!fileName) return

          const watchedFileName = String(fileName)
          if (!watchedFileName) {
            return
          }

          if (shouldIgnoreRefreshPath(watchedFileName)) {
            return
          }

          const filePath = join(rootDirectory, watchedFileName)

          if (isFilePathGitIgnored(filePath)) {
            return
          }

          invalidateSharedFileTextPrefixCachePath(filePath)
          queueCodeFenceLanguagePrewarm([filePath], {
            priority: 'immediate',
          })
          queueRefreshNotification([filePath], eventType, {
            priority: 'immediate',
          })
        }
      )
    } catch (error) {
      // Recursive file watching is optional and unavailable on some platforms.
      emitRefreshNotifications = false
      unsubscribeRuntimeAnalysisBackgroundRefresh()
      unsubscribeRuntimeAnalysisBackgroundRefresh = () => {}
      reportBestEffortError('project/server', error)
    }
  }

  activeProjectServers += 1
  registerActiveProjectServerRuntime({
    server,
    port: String(port),
    id: server.getId(),
    host: options?.host ?? 'localhost',
    emitRefreshNotifications,
  })

  const originalCleanup = server.cleanup.bind(server)
  let cleanedUp = false
  server.cleanup = () => {
    if (cleanedUp) {
      return
    }
    cleanedUp = true

    if (rootWatcher) {
      closeWatcher(rootWatcher)
    }
    if (refreshFlushTimer) {
      clearTimeout(refreshFlushTimer)
      refreshFlushTimer = undefined
      refreshFlushDelayMs = undefined
    }
    if (codeFencePrewarmFlushTimer) {
      clearTimeout(codeFencePrewarmFlushTimer)
      codeFencePrewarmFlushTimer = undefined
      codeFencePrewarmFlushDelayMs = undefined
    }
    if (startupRuntimePrewarmTimer) {
      clearTimeout(startupRuntimePrewarmTimer)
      startupRuntimePrewarmTimer = undefined
    }
    if (queuedHighlighterInitialization) {
      clearTimeout(queuedHighlighterInitialization)
      queuedHighlighterInitialization = undefined
    }
    pendingCodeFencePrewarmPathsImmediate.clear()
    pendingCodeFencePrewarmPathsBackground.clear()
    deferredCodeFencePrewarmPaths.clear()
    codeFencePrewarmInFlight = Promise.resolve()
    startupRuntimePrewarmQueued = false
    startupRuntimePrewarmInFlight = Promise.resolve()
    unsubscribeRuntimeAnalysisBackgroundRefresh()
    unregisterActiveProjectServerRuntime(server)
    activeProjectServers = Math.max(0, activeProjectServers - 1)
    if (activeProjectServers === 0) {
      disposeProjectWatchers()
    }

    originalCleanup()
  }

  server.registerMethod(
    'getRefreshInvalidationsSince',
    async function getRefreshInvalidationsSince({
      sinceCursor,
    }: RefreshInvalidationsSinceRequest): Promise<RefreshInvalidationsSinceResponse> {
      const normalizedSinceCursor = normalizeRefreshCursor(sinceCursor)

      if (normalizedSinceCursor === undefined) {
        return {
          nextCursor: refreshCursor,
          fullRefresh: false,
        }
      }

      if (normalizedSinceCursor > refreshCursor) {
        return {
          nextCursor: refreshCursor,
          fullRefresh: true,
          filePath: rootDirectory,
          filePaths: [rootDirectory],
        }
      }

      if (normalizedSinceCursor === refreshCursor) {
        return {
          nextCursor: refreshCursor,
          fullRefresh: false,
        }
      }

      const oldestAvailableCursor = refreshHistory[0]?.cursor
      if (
        oldestAvailableCursor !== undefined &&
        normalizedSinceCursor < oldestAvailableCursor
      ) {
        return {
          nextCursor: refreshCursor,
          fullRefresh: true,
          filePath: rootDirectory,
          filePaths: [rootDirectory],
        }
      }

      const filePaths = new Set<string>()
      for (const entry of refreshHistory) {
        if (entry.cursor <= normalizedSinceCursor) {
          continue
        }

        for (const filePath of entry.filePaths) {
          filePaths.add(filePath)
        }
      }

      const changedPaths = Array.from(filePaths)
      return {
        nextCursor: refreshCursor,
        fullRefresh: false,
        filePath: changedPaths[0],
        filePaths: changedPaths,
      }
    },
    {
      memoize: false,
      concurrency: 8,
    }
  )

  server.registerMethod(
    'getQuickInfoAtPosition',
    async function getQuickInfoAtPositionRpc({
      filePath,
      position,
      projectOptions,
    }: {
      filePath: string
      position: number
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      return getQuickInfoAtPosition({
        project,
        filePath,
        position,
      })
    },
    {
      // Keep development hover data fresh after edits while preserving production performance.
      memoize: getProductionRpcMemoizeOptions(),
      concurrency: 24,
    }
  )

  server.registerMethod(
    'getSourceTextMetadata',
    async function getSourceTextMetadata({
      projectOptions,
      ...options
    }: GetSourceTextMetadataOptions & {
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)

      return getCachedSourceTextMetadata(project, options)
    },
    {
      memoize: true,
      concurrency: 32,
    }
  )

  server.registerMethod(
    'getTokens',
    async function getTokens({
      projectOptions,
      ...options
    }: GetTokensOptions & {
      projectOptions?: ProjectOptions
      languages?: ConfigurationOptions['languages']
      waitForWarmResult?: boolean
    }) {
      const project = getProject(projectOptions)
      latestCodeFencePrewarmThemeNames = getThemeNamesForCodeFencePrewarm(
        options.theme
      )
      queueHighlighterInitialization({
        theme: options.theme,
        languages: options.languages,
      })

      flushDeferredCodeFencePrewarmPaths()

      return getCachedTokens(project, {
        ...options,
        highlighter: resolvedHighlighter,
        highlighterLoader: async () => {
          return ensureHighlighter({
            theme: options.theme,
            languages: options.languages,
          })
        },
      })
    },
    {
      memoize: true,
      concurrency: 28,
    }
  )

  server.registerMethod(
    'resolveTypeAtLocation',
    async function resolveTypeAtLocation({
      projectOptions,
      filter,
      ...options
    }: ResolveTypeAtLocationRpcRequest) {
      const project = getProject(projectOptions)
      const result = await resolveCachedTypeAtLocationWithDependencies(project, {
        filePath: options.filePath,
        position: options.position,
        kind: options.kind,
        filter: parseTypeFilter(filter),
        isInMemoryFileSystem: projectOptions?.useInMemoryFileSystem,
      })

      return result.resolvedType
    },
    {
      memoize: false,
      concurrency: 8,
    }
  )

  server.registerMethod(
    'resolveTypeAtLocationWithDependencies',
    async function resolveTypeAtLocationWithDependencies({
      projectOptions,
      filter,
      ...options
    }: ResolveTypeAtLocationRpcRequest) {
      return getDebugLogger().trackOperation(
        'server.resolveTypeAtLocationWithDependencies',
        async () => {
          const project = getProject(projectOptions)

          getDebugLogger().info('Processing type resolution request', () => ({
            data: {
              filePath: options.filePath,
              position: options.position,
              kind: SyntaxKind[options.kind],
              useInMemoryFileSystem: projectOptions?.useInMemoryFileSystem,
            },
          }))

          return resolveCachedTypeAtLocationWithDependencies(project, {
            filePath: options.filePath,
            position: options.position,
            kind: options.kind,
            filter: parseTypeFilter(filter),
            isInMemoryFileSystem: projectOptions?.useInMemoryFileSystem,
          })
        },
        {
          data: {
            filePath: options.filePath,
            position: options.position,
            kind: SyntaxKind[options.kind],
          },
        }
      )
    },
    {
      memoize: false,
      concurrency: 8,
    }
  )

  server.registerMethod(
    'getFileExports',
    async function getFileExports({
      filePath,
      projectOptions,
      includeClientRpcDependencies,
    }: {
      filePath: string
      projectOptions?: ProjectOptions
      includeClientRpcDependencies?: boolean
    }) {
      const project = getProject(projectOptions)
      const fileExports = await getCachedFileExports(project, filePath)

      if (includeClientRpcDependencies) {
        return toRpcValueWithDependenciesResponse(
          fileExports,
          toFileExportDependencyPaths(filePath, fileExports)
        )
      }

      return fileExports
    },
    {
      memoize: getProductionRpcMemoizeOptions(),
      concurrency: 25,
    }
  )

  server.registerMethod(
    'getOutlineRanges',
    async function getOutlineRanges({
      filePath,
      projectOptions,
    }: {
      filePath: string
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      return getCachedOutlineRanges(project, filePath)
    },
    {
      memoize: getProductionRpcMemoizeOptions(),
      concurrency: 25,
    }
  )

  server.registerMethod(
    'getFileExportMetadata',
    async function getFileExportMetadata({
      name,
      filePath,
      position,
      kind,
      projectOptions,
      includeClientRpcDependencies,
    }: {
      name: string
      filePath: string
      position: number
      kind: TsMorphSyntaxKind
      projectOptions?: ProjectOptions
      includeClientRpcDependencies?: boolean
    }) {
      const project = getProject(projectOptions)
      const metadata = await getCachedFileExportMetadata(project, {
        name,
        filePath,
        position,
        kind,
      })

      if (includeClientRpcDependencies) {
        const fileExports = await getCachedFileExports(project, filePath)
        return toRpcValueWithDependenciesResponse(
          metadata,
          toFileExportDependencyPaths(filePath, fileExports)
        )
      }

      return metadata
    },
    {
      memoize: getProductionRpcMemoizeOptions(),
      concurrency: 25,
    }
  )

  server.registerMethod(
    'getFileExportText',
    async function getFileExportText({
      filePath,
      position,
      kind,
      includeDependencies,
      projectOptions,
    }: {
      filePath: string
      position: number
      kind: TsMorphSyntaxKind
      includeDependencies?: boolean
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      if (includeDependencies) {
        return getFileExportTextResult({
          filePath,
          position,
          kind,
          includeDependencies: true,
          project,
        })
      }

      return getCachedFileExportText(project, {
        filePath,
        position,
        kind,
        includeDependencies: false,
      })
    },
    {
      memoize: getProductionRpcMemoizeOptions(),
      concurrency: 25,
    }
  )

  server.registerMethod(
    'getFileExportStaticValue',
    async function getFileExportStaticValue({
      filePath,
      position,
      kind,
      projectOptions,
      includeClientRpcDependencies,
    }: {
      filePath: string
      position: number
      kind: TsMorphSyntaxKind
      projectOptions?: ProjectOptions
      includeClientRpcDependencies?: boolean
    }) {
      const project = getProject(projectOptions)
      const staticValue = await getCachedFileExportStaticValue(project, {
        filePath,
        position,
        kind,
      })

      if (includeClientRpcDependencies) {
        const dependencyPaths = await getCachedTypeScriptDependencyPaths(
          project,
          filePath
        )
        return toRpcValueWithDependenciesResponse(
          staticValue,
          dependencyPaths
        )
      }

      return staticValue
    },
    {
      memoize: getProductionRpcMemoizeOptions(),
      concurrency: 25,
    }
  )

  server.registerMethod(
    'createSourceFile',
    async function createSourceFile({
      filePath,
      sourceText,
      projectOptions,
    }: {
      filePath: string
      sourceText: string
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      project.createSourceFile(filePath, sourceText, {
        overwrite: true,
      })
      invalidateProjectFileCache(project, filePath)
      invalidateRuntimeAnalysisCachePath(filePath)
      invalidateSharedFileTextPrefixCachePath(filePath)
      queueCodeFenceLanguagePrewarm([filePath], {
        priority: 'immediate',
      })
    },
    {
      memoize: false,
      concurrency: 1,
    }
  )

  server.registerMethod(
    'transpileSourceFile',
    async function transpileSourceFile({
      filePath,
      projectOptions,
    }: {
      filePath: string
      projectOptions?: ProjectOptions
    }) {
      const project = getProject(projectOptions)
      return transpileCachedSourceFile(project, filePath)
    },
    {
      memoize: false,
      concurrency: 25,
    }
  )

  return server
}

function closeWatcher(watcher: FSWatcher): void {
  try {
    watcher.close()
  } catch (error) {
    reportBestEffortError('project/server', error)
  }
}

function shouldEmitRefreshNotifications(
  explicitValue?: boolean
): boolean {
  if (typeof explicitValue === 'boolean') {
    return explicitValue
  }

  const override = resolveServerRefreshNotificationsEnvOverride()
  if (override !== undefined) {
    return override
  }

  // Runtime app mode writes generated artifacts aggressively under the runtime
  // directory; refresh notifications from that tree can create invalidation
  // storms while developing. Keep notifications opt-in there.
  if (isDevelopmentEnvironment()) {
    const normalizedCwd = process.cwd().replace(/\\/g, '/')
    if (
      normalizedCwd.includes('/.renoun/') ||
      normalizedCwd.endsWith('/.renoun')
    ) {
      return false
    }
  }

  return isDevelopmentEnvironment()
}
