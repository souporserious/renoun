import { cpus } from 'node:os'
import { existsSync } from 'node:fs'
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
} from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeFileSystem } from '../../file-system/NodeFileSystem.ts'
import type { ExportHistoryGenerator } from '../../file-system/types.ts'
import { extractCodeFenceSnippetsFromMarkdown } from '../../analysis/markdown-code-fence-languages.ts'
import type { AnalysisOptions } from '../../analysis/types.ts'
import { forEachConcurrent } from '../../utils/concurrency.ts'
import { getDebugLogger } from '../../utils/debug.ts'
import { isJavaScriptLikeExtension } from '../../utils/is-javascript-like-extension.ts'
import type { Highlighter } from '../../utils/create-highlighter.ts'
import type {
  DirectoryEntriesRequest,
  ExportHistoryRequest,
  FileRequest,
  RenounPrewarmTargets,
} from '../prewarm.ts'

const PREWARM_FILE_CACHE_CONCURRENCY = Math.max(
  8,
  Math.min(32, cpus().length * 2)
)
const PREWARM_EXPORT_HISTORY_CONCURRENCY = Math.max(
  1,
  Math.min(4, Math.ceil(cpus().length / 4))
)
const REPOSITORY_MODULE_SPECIFIER_EXTENSION =
  extname(fileURLToPath(import.meta.url)) === '.js' ? '.js' : '.ts'

const DEFAULT_GET_FILE_EXTENSIONS = [
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'mjsx',
  'cjs',
  'cjsx',
  'mts',
  'mtsx',
  'cts',
  'ctsx',
  'md',
  'mdx',
]

type WarmFileMethod =
  | 'getCodeFenceSourceMetadata'
  | 'getCodeFenceTokens'
  | 'getExportTypes'
  | 'getExports'
  | 'getSections'

interface WarmFileTask {
  absolutePath: string
  extension: string
  methods: Set<WarmFileMethod>
  fileGetRequestKeys?: Set<string>
}

interface WarmRenounPrewarmTargetsOptions {
  analysisOptions?: AnalysisOptions
  isFilePathGitIgnored: (filePath: string) => boolean
}

export interface WarmRenounPrewarmTargetsResult {
  fileGetDependencyPathsByRequestKey: Record<string, string[]>
}

type RepositoryModule = typeof import('../../file-system/Repository.ts')
type EntriesModule = Pick<typeof import('../../file-system/entries.ts'), 'Directory'>
type AnalysisClientServerModule = Pick<
  typeof import('../../analysis/client.server.ts'),
  | 'createHighlighter'
  | 'getCachedSourceTextMetadata'
  | 'getCachedTokens'
  | 'getCachedTypeScriptDependencyPaths'
  | 'getProgram'
>

let repositoryModulePromise: Promise<RepositoryModule> | undefined
let entriesModulePromise: Promise<EntriesModule> | undefined
let analysisClientServerModulePromise:
  | Promise<AnalysisClientServerModule>
  | undefined
let prewarmHighlighterPromise: Promise<Highlighter | null> | undefined

function resolveWarmAnalysisOptions(
  analysisOptions: AnalysisOptions | undefined,
  tsConfigFilePath: string | undefined
): AnalysisOptions | undefined {
  if (!tsConfigFilePath) {
    return analysisOptions
  }

  if (analysisOptions?.tsConfigFilePath === tsConfigFilePath) {
    return analysisOptions
  }

  return {
    ...analysisOptions,
    tsConfigFilePath,
  }
}

function resolveNearestTsConfigFilePath(
  fileSystem: NodeFileSystem,
  filePath: string,
  cache: Map<string, string | undefined>
): string | undefined {
  let currentDirectory = dirname(fileSystem.getAbsolutePath(filePath))
  const searchedDirectories: string[] = []

  while (true) {
    const cached = cache.get(currentDirectory)
    if (cached !== undefined || cache.has(currentDirectory)) {
      for (const directoryPath of searchedDirectories) {
        cache.set(directoryPath, cached)
      }
      return cached
    }

    searchedDirectories.push(currentDirectory)
    const candidateTsConfigFilePath = join(currentDirectory, 'tsconfig.json')
    let hasCandidateTsConfigFilePath = false
    try {
      hasCandidateTsConfigFilePath =
        fileSystem.fileExistsSync(candidateTsConfigFilePath)
    } catch {
      hasCandidateTsConfigFilePath = existsSync(candidateTsConfigFilePath)
    }

    if (hasCandidateTsConfigFilePath) {
      for (const directoryPath of searchedDirectories) {
        cache.set(directoryPath, candidateTsConfigFilePath)
      }
      return candidateTsConfigFilePath
    }

    const parentDirectory = dirname(currentDirectory)
    if (parentDirectory === currentDirectory) {
      break
    }

    currentDirectory = parentDirectory
  }

  for (const directoryPath of searchedDirectories) {
    cache.set(directoryPath, undefined)
  }

  return undefined
}

export async function warmRenounPrewarmTargets(
  targets: RenounPrewarmTargets,
  options: WarmRenounPrewarmTargetsOptions
): Promise<WarmRenounPrewarmTargetsResult> {
  const logger = getDebugLogger()
  const fileSystem = new NodeFileSystem({
    tsConfigPath: options.analysisOptions?.tsConfigFilePath,
  })
  const warmFilesByPath = new Map<string, WarmFileTask>()

  if (targets.directoryGetEntries.length > 0) {
    logger.debug(
      'Collecting files from Directory#getEntries callsites',
      () => ({
        data: {
          directories: targets.directoryGetEntries.length,
        },
      })
    )
  }

  if (targets.fileGetFile.length > 0) {
    logger.debug('Collecting files from Directory#getFile callsites', () => ({
      data: {
        files: targets.fileGetFile.length,
      },
    }))
  }

  if (targets.exportHistory.length > 0) {
    logger.debug('Collecting Repository#getExportHistory callsites', () => ({
      data: {
        histories: targets.exportHistory.length,
      },
    }))
  }

  const [directoryWarmFiles, fileWarmFiles] = await Promise.all([
    targets.directoryGetEntries.length > 0
      ? collectWarmFilesFromDirectoryTargets(targets.directoryGetEntries, {
          fileSystem,
          isFilePathGitIgnored: options.isFilePathGitIgnored,
          logger,
        })
      : Promise.resolve(new Map<string, WarmFileTask>()),
    targets.fileGetFile.length > 0
      ? collectWarmFilesFromGetFileTargets(targets.fileGetFile, {
          fileSystem,
          isFilePathGitIgnored: options.isFilePathGitIgnored,
          logger,
        })
      : Promise.resolve(new Map<string, WarmFileTask>()),
  ])

  for (const task of directoryWarmFiles.values()) {
    mergeWarmTask(task, warmFilesByPath)
  }

  for (const task of fileWarmFiles.values()) {
    mergeWarmTask(task, warmFilesByPath)
  }

  if (warmFilesByPath.size === 0 && targets.exportHistory.length === 0) {
    logger.debug('No prewarm files were discovered')
    return {
      fileGetDependencyPathsByRequestKey: {},
    }
  }

  logger.debug('Prewarming renoun cache targets', () => ({
    data: {
      files: warmFilesByPath.size,
      exportHistories: targets.exportHistory.length,
    },
  }))

  const [warmResult] = await Promise.all([
    warmFilesByPath.size > 0
      ? warmFiles(Array.from(warmFilesByPath.values()), {
          analysisOptions: options.analysisOptions,
          fileSystem,
          logger,
        })
      : Promise.resolve<WarmRenounPrewarmTargetsResult>({
          fileGetDependencyPathsByRequestKey: {},
        }),
    targets.exportHistory.length > 0
      ? warmExportHistoryRequests(targets.exportHistory, { logger })
      : Promise.resolve(),
  ])

  logger.debug('Finished prewarming renoun cache targets')

  return warmResult
}

async function loadRepositoryModule(): Promise<RepositoryModule> {
  if (!repositoryModulePromise) {
    const repositoryModuleUrl = new URL(
      `../../file-system/Repository${REPOSITORY_MODULE_SPECIFIER_EXTENSION}`,
      import.meta.url
    )
    repositoryModulePromise = import(repositoryModuleUrl.href)
  }

  return repositoryModulePromise
}

async function loadAnalysisClientServerModule():
  Promise<AnalysisClientServerModule> {
  if (!analysisClientServerModulePromise) {
    const analysisClientServerModuleUrl = new URL(
      `../../analysis/client.server${REPOSITORY_MODULE_SPECIFIER_EXTENSION}`,
      import.meta.url
    )
    analysisClientServerModulePromise = import(analysisClientServerModuleUrl.href)
  }

  return analysisClientServerModulePromise
}

async function loadEntriesModule(): Promise<EntriesModule> {
  if (!entriesModulePromise) {
    const entriesModuleUrl = new URL(
      `../../file-system/entries${REPOSITORY_MODULE_SPECIFIER_EXTENSION}`,
      import.meta.url
    )
    entriesModulePromise = import(entriesModuleUrl.href)
  }

  return entriesModulePromise
}

async function warmTypeScriptDependencyPaths(
  filePath: string,
  analysisOptions: AnalysisOptions | undefined
): Promise<void> {
  const { getCachedTypeScriptDependencyPaths, getProgram } =
    await loadAnalysisClientServerModule()
  const project = getProgram(analysisOptions)
  await getCachedTypeScriptDependencyPaths(project, filePath)
}

async function getPrewarmHighlighter(): Promise<Highlighter | null> {
  if (!prewarmHighlighterPromise) {
    prewarmHighlighterPromise = loadAnalysisClientServerModule()
      .then((module) => module.createHighlighter({ theme: undefined }))
      .catch(() => null)
  }

  return prewarmHighlighterPromise
}

async function collectWarmFilesFromDirectoryTargets(
  directoryTargets: DirectoryEntriesRequest[],
  options: {
    fileSystem: NodeFileSystem
    isFilePathGitIgnored: (filePath: string) => boolean
    logger: ReturnType<typeof getDebugLogger>
  }
): Promise<Map<string, WarmFileTask>> {
  const warmFilesByPath = new Map<string, WarmFileTask>()

  await forEachConcurrent(
    directoryTargets,
    {
      concurrency: PREWARM_FILE_CACHE_CONCURRENCY,
    },
    async (request) => {
      try {
        const absoluteDirectoryPath = options.fileSystem.getAbsolutePath(
          request.directoryPath
        )

        const filePaths = await collectDirectoryFilePaths(
          options.fileSystem,
          absoluteDirectoryPath,
          {
            recursive: request.recursive,
            includeDirectoryNamedFiles: request.includeDirectoryNamedFiles,
            includeIndexAndReadmeFiles: request.includeIndexAndReadmeFiles,
          }
        )

        for (const filePath of filePaths) {
          if (options.isFilePathGitIgnored(filePath)) {
            continue
          }

          const extension = getFileExtension(filePath)
          if (extension === undefined) {
            continue
          }

          if (
            request.filterExtensions !== null &&
            !request.filterExtensions.has(extension)
          ) {
            continue
          }

          const methods = determineDirectoryWarmMethods(extension)
          if (methods.size === 0) {
            continue
          }

          mergeWarmTask(
            {
              absolutePath: filePath,
              extension,
              methods,
            },
            warmFilesByPath
          )
        }
      } catch (error) {
        options.logger.warn(
          'Skipping renoun Directory#getEntries prewarm target',
          () => ({
            data: {
              directoryPath: request.directoryPath,
              error: formatPrewarmError(error),
            },
          })
        )
      }
    }
  )

  return warmFilesByPath
}

async function collectWarmFilesFromGetFileTargets(
  getFileTargets: FileRequest[],
  options: {
    fileSystem: NodeFileSystem
    isFilePathGitIgnored: (filePath: string) => boolean
    logger: ReturnType<typeof getDebugLogger>
  }
): Promise<Map<string, WarmFileTask>> {
  const warmFilesByPath = new Map<string, WarmFileTask>()
  const deduplicatedTargets = dedupeGetFileTargets(getFileTargets)

  await forEachConcurrent(
    Array.from(deduplicatedTargets.values()),
    {
      concurrency: PREWARM_FILE_CACHE_CONCURRENCY,
    },
    async (request) => {
      try {
        const filePath = await resolveGetFileRequestPath(
          options.fileSystem,
          request
        )

        if (options.isFilePathGitIgnored(filePath)) {
          return
        }

        const extension = getFileExtension(filePath)
        if (extension === undefined) {
          return
        }

        const methods = resolveGetFileWarmMethods(request, extension)
        if (methods.size === 0) {
          return
        }

        mergeWarmTask(
          {
            absolutePath: filePath,
            extension,
            methods,
            fileGetRequestKeys: new Set([getFileRequestKey(request)]),
          },
          warmFilesByPath
        )
      } catch (error) {
        options.logger.warn(
          'Skipping renoun Directory#getFile prewarm target',
          () => ({
            data: {
              directoryPath: request.directoryPath,
              filePath: request.path,
              error: formatPrewarmError(error),
            },
          })
        )
      }
    }
  )

  return warmFilesByPath
}

function dedupeGetFileTargets(
  getFileTargets: FileRequest[]
): Map<string, FileRequest> {
  const uniqueTargets = new Map<string, FileRequest>()

  for (const request of getFileTargets) {
    const key = getFileRequestKey(request)
    const existing = uniqueTargets.get(key)

    if (existing) {
      existing.methods = mergeFileRequestMethods(existing.methods, request.methods)
      continue
    }

    uniqueTargets.set(key, {
      ...request,
      ...(request.methods ? { methods: [...request.methods] } : {}),
    })
  }

  return uniqueTargets
}

function mergeFileRequestMethods(
  left: FileRequest['methods'],
  right: FileRequest['methods']
): FileRequest['methods'] {
  if (!left || left.length === 0) {
    return right && right.length > 0 ? [...right].sort() : undefined
  }

  if (!right || right.length === 0) {
    return [...left].sort()
  }

  return Array.from(new Set([...left, ...right])).sort((a, b) =>
    a.localeCompare(b)
  )
}

function getFileRequestKey(request: FileRequest): string {
  if (!request.extensions || request.extensions.length === 0) {
    return `${request.directoryPath}\0${request.path}\0`
  }

  return `${request.directoryPath}\0${request.path}\0${request.extensions
    .slice()
    .sort()
    .join('\0')}`
}

async function warmExportHistoryRequests(
  requests: ExportHistoryRequest[],
  options: {
    logger: ReturnType<typeof getDebugLogger>
  }
): Promise<void> {
  const uniqueRequests = dedupeExportHistoryRequests(requests)

  await forEachConcurrent(
    Array.from(uniqueRequests.values()),
    {
      concurrency: PREWARM_EXPORT_HISTORY_CONCURRENCY,
    },
    async (request) => {
      try {
        const { Repository } = await loadRepositoryModule()
        const repository = Repository.resolve(
          request.repository as Parameters<typeof Repository.resolve>[0]
        )
        if (!repository) {
          return
        }

        for (const sparsePath of request.sparsePaths ?? []) {
          repository.registerSparsePath(sparsePath)
        }

        await drainExportHistory(repository.getExportHistory(request.options))
      } catch (error) {
        options.logger.warn(
          'Skipping renoun Repository#getExportHistory prewarm target',
          () => ({
            data: {
              repository: formatRepositoryTarget(request.repository),
              sparsePaths: request.sparsePaths ?? [],
              error: formatPrewarmError(error),
            },
          })
        )
      }
    }
  )
}

function dedupeExportHistoryRequests(
  requests: ExportHistoryRequest[]
): Map<string, ExportHistoryRequest> {
  const uniqueRequests = new Map<string, ExportHistoryRequest>()

  for (const request of requests) {
    const key = getExportHistoryRequestKey(request)
    if (uniqueRequests.has(key)) {
      continue
    }

    uniqueRequests.set(key, request)
  }

  return uniqueRequests
}

function getExportHistoryRequestKey(request: ExportHistoryRequest): string {
  return JSON.stringify({
    repository: normalizePrewarmKeyValue(request.repository),
    sparsePaths: [...(request.sparsePaths ?? [])].sort(),
    options: normalizePrewarmKeyValue(request.options ?? null),
  })
}

function normalizePrewarmKeyValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizePrewarmKeyValue(item))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [
          key,
          normalizePrewarmKeyValue(entryValue),
        ])
    )
  }

  return value
}

function formatRepositoryTarget(repository: unknown): string {
  if (typeof repository === 'string') {
    return repository
  }

  if (repository && typeof repository === 'object') {
    const path: string | undefined =
      typeof (repository as Record<string, unknown>)['path'] === 'string'
        ? ((repository as Record<string, unknown>)['path'] as string)
        : undefined
    const baseUrl: string | undefined =
      typeof (repository as Record<string, unknown>)['baseUrl'] === 'string'
        ? ((repository as Record<string, unknown>)['baseUrl'] as string)
        : undefined

    if (path) {
      return path
    }

    if (baseUrl) {
      return baseUrl
    }
  }

  return 'unknown'
}

async function collectDirectoryFilePaths(
  fileSystem: NodeFileSystem,
  directoryPath: string,
  options: {
    recursive: boolean
    includeDirectoryNamedFiles: boolean
    includeIndexAndReadmeFiles: boolean
  }
): Promise<string[]> {
  const entries = await fileSystem.readDirectory(directoryPath)
  const files: string[] = []

  for (const entry of entries) {
    if (entry.isDirectory) {
      if (options.recursive) {
        const nestedFiles = await collectDirectoryFilePaths(
          fileSystem,
          entry.path,
          {
            recursive: true,
            includeDirectoryNamedFiles: options.includeDirectoryNamedFiles,
            includeIndexAndReadmeFiles: options.includeIndexAndReadmeFiles,
          }
        )
        files.push(...nestedFiles)
      }
      continue
    }

    if (!entry.isFile) {
      continue
    }

    const absolutePath = fileSystem.getAbsolutePath(entry.path)
    const fileBaseName = removeAllExtensions(
      basename(absolutePath)
    ).toLowerCase()

    if (
      !options.includeIndexAndReadmeFiles &&
      (fileBaseName === 'index' || fileBaseName === 'readme')
    ) {
      continue
    }

    if (!options.includeDirectoryNamedFiles) {
      const parentName = basename(dirname(absolutePath)).toLowerCase()
      if (fileBaseName === parentName) {
        continue
      }
    }

    files.push(absolutePath)
  }

  return files
}

async function resolveGetFileRequestPath(
  fileSystem: NodeFileSystem,
  request: FileRequest
): Promise<string> {
  const absoluteDirectoryPath = fileSystem.getAbsolutePath(
    request.directoryPath
  )
  const requestedPath = isAbsolute(request.path)
    ? request.path
    : resolve(absoluteDirectoryPath, request.path)
  const candidates = buildGetFileCandidates(requestedPath, request.extensions)

  for (const candidate of candidates) {
    if (await canReadFile(fileSystem, candidate)) {
      return fileSystem.getAbsolutePath(candidate)
    }
  }

  throw new Error(
    `[renoun] Failed to resolve prewarm getFile target "${request.path}" in directory "${request.directoryPath}".`
  )
}

function buildGetFileCandidates(
  requestedPath: string,
  extensions?: string[]
): string[] {
  const candidates = new Set<string>()
  const normalizedPath = resolve(requestedPath)
  const hasExplicitExtension = getFileExtension(normalizedPath) !== undefined
  const normalizedExtensions =
    extensions
      ?.map(normalizeExtension)
      .filter((value): value is string => !!value) ?? []

  candidates.add(normalizedPath)

  if (hasExplicitExtension) {
    return Array.from(candidates)
  }

  const candidateExtensions =
    normalizedExtensions.length > 0
      ? normalizedExtensions
      : DEFAULT_GET_FILE_EXTENSIONS

  for (const extension of candidateExtensions) {
    candidates.add(`${normalizedPath}.${extension}`)
    candidates.add(join(normalizedPath, `index.${extension}`))
    candidates.add(join(normalizedPath, `readme.${extension}`))
  }

  return Array.from(candidates)
}

async function canReadFile(
  fileSystem: NodeFileSystem,
  filePath: string
): Promise<boolean> {
  if (!(await fileSystem.fileExists(filePath))) {
    return false
  }

  try {
    await fileSystem.readDirectory(filePath)
    return false
  } catch {
    return true
  }
}

function normalizeExtension(extension: string): string | undefined {
  const normalized = extension.replace(/^\./, '').toLowerCase()
  return normalized.length > 0 ? normalized : undefined
}

function getFileExtension(path: string): string | undefined {
  const extension = extname(path).toLowerCase()
  if (!extension) {
    return undefined
  }

  return extension.slice(1)
}

function removeAllExtensions(name: string): string {
  return name.replace(/\.[^.]+/g, '')
}

function determineDirectoryWarmMethods(extension: string): Set<WarmFileMethod> {
  const methods = new Set<WarmFileMethod>()

  if (isJavaScriptLikeExtension(extension)) {
    methods.add('getExports')
    methods.add('getSections')
    return methods
  }

  if (extension === 'mdx' || extension === 'md') {
    methods.add('getCodeFenceSourceMetadata')
    methods.add('getCodeFenceTokens')
    methods.add('getSections')
    return methods
  }

  return methods
}

function determineGetFileWarmMethods(extension: string): Set<WarmFileMethod> {
  const methods = new Set<WarmFileMethod>()

  if (isJavaScriptLikeExtension(extension)) {
    // When getFile() usage escapes precise collection, fall back to warming
    // both export headers and export types for JS-like files.
    methods.add('getExports')
    methods.add('getExportTypes')
    methods.add('getSections')
    return methods
  }

  if (extension === 'mdx' || extension === 'md') {
    methods.add('getCodeFenceSourceMetadata')
    methods.add('getCodeFenceTokens')
    methods.add('getSections')
    return methods
  }

  return methods
}

function resolveGetFileWarmMethods(
  request: FileRequest,
  extension: string
): Set<WarmFileMethod> {
  if (request.methods && request.methods.length > 0) {
    return new Set<WarmFileMethod>(request.methods)
  }

  return determineGetFileWarmMethods(extension)
}

function mergeWarmTask(
  task: WarmFileTask,
  warmFilesByPath: Map<string, WarmFileTask>
): void {
  const existing = warmFilesByPath.get(task.absolutePath)

  if (!existing) {
    warmFilesByPath.set(task.absolutePath, task)
    return
  }

  for (const method of task.methods) {
    existing.methods.add(method)
  }

  if (task.fileGetRequestKeys) {
    if (!existing.fileGetRequestKeys) {
      existing.fileGetRequestKeys = new Set<string>()
    }

    for (const requestKey of task.fileGetRequestKeys) {
      existing.fileGetRequestKeys.add(requestKey)
    }
  }
}

async function warmFiles(
  warmFiles: WarmFileTask[],
  options: {
    analysisOptions?: AnalysisOptions
    fileSystem: NodeFileSystem
    logger: ReturnType<typeof getDebugLogger>
  }
): Promise<WarmRenounPrewarmTargetsResult> {
  const nearestTsConfigFilePathByDirectory = new Map<string, string | undefined>()
  const entryFileSystemByTsConfigPath = new Map<string, NodeFileSystem>()
  const fileGetDependencyPathsByRequestKey: Record<string, string[]> = {}

  await forEachConcurrent(
    warmFiles,
    {
      concurrency: PREWARM_FILE_CACHE_CONCURRENCY,
    },
    async (warmFile) => {
      let cachedSourceText: string | undefined
      const readSourceText = async () => {
        if (cachedSourceText === undefined) {
          cachedSourceText = await options.fileSystem.readFile(
            warmFile.absolutePath
          )
        }

        return cachedSourceText
      }

      const warmAnalysisOptions = resolveWarmAnalysisOptions(
        options.analysisOptions,
        resolveNearestTsConfigFilePath(
          options.fileSystem,
          warmFile.absolutePath,
          nearestTsConfigFilePathByDirectory
        )
      )

      if (
        warmFile.fileGetRequestKeys &&
        warmFile.fileGetRequestKeys.size > 0 &&
        isJavaScriptLikeExtension(warmFile.extension)
      ) {
        try {
          const dependencyPaths = await getTypeScriptDependencyPaths(
            warmFile.absolutePath,
            warmAnalysisOptions
          )

          for (const requestKey of warmFile.fileGetRequestKeys) {
            fileGetDependencyPathsByRequestKey[requestKey] = dependencyPaths
          }
        } catch (error) {
          options.logger.warn(
            'Skipping renoun getFile dependency prewarm target',
            () => ({
              data: {
                filePath: warmFile.absolutePath,
                error: formatPrewarmError(error),
              },
            })
          )
        }
      }

      try {
        await warmEntryFileCaches(warmFile, {
          analysisOptions: warmAnalysisOptions,
          fileSystemsByTsConfigPath: entryFileSystemByTsConfigPath,
        })
      } catch (error) {
        options.logger.warn(
          'Skipping renoun file entry cache prewarm target',
          () => ({
            data: {
              filePath: warmFile.absolutePath,
              error: formatPrewarmError(error),
            },
          })
        )
      }

      if (
        (warmFile.methods.has('getCodeFenceSourceMetadata') ||
          warmFile.methods.has('getCodeFenceTokens')) &&
        (warmFile.extension === 'md' || warmFile.extension === 'mdx')
      ) {
        try {
          const source = await readSourceText()
          const codeFenceSnippets = extractCodeFenceSnippetsFromMarkdown(source)

          for (const snippet of codeFenceSnippets) {
            const snippetPath =
              typeof snippet.path === 'string' && snippet.path.length > 0
                ? snippet.path
                : undefined
            const snippetBaseDirectory = snippetPath
              ? dirname(warmFile.absolutePath)
              : undefined
            const snippetAnalysisOptions = resolveWarmAnalysisOptions(
              options.analysisOptions,
              resolveNearestTsConfigFilePath(
                options.fileSystem,
                snippetPath
                  ? resolve(snippetBaseDirectory!, snippetPath)
                  : warmFile.absolutePath,
                nearestTsConfigFilePathByDirectory
              )
            )
            const analysisClientServer = await loadAnalysisClientServerModule()
            const project =
              analysisClientServer.getProgram(snippetAnalysisOptions)
            const sourceMetadata =
              await analysisClientServer.getCachedSourceTextMetadata(project, {
              ...(snippetPath ? { filePath: snippetPath } : {}),
              ...(snippetBaseDirectory
                ? { baseDirectory: snippetBaseDirectory }
                : {}),
              value: snippet.value,
              language: snippet.language as any,
              shouldFormat: snippet.shouldFormat,
              isFormattingExplicit: true,
              virtualizeFilePath: snippetPath !== undefined,
            })

            if (
              sourceMetadata.filePath &&
              typeof sourceMetadata.language === 'string' &&
              isJavaScriptLikeExtension(sourceMetadata.language)
            ) {
              try {
                await warmTypeScriptDependencyPaths(
                  sourceMetadata.filePath,
                  snippetAnalysisOptions
                )
              } catch (error) {
                options.logger.warn(
                  'Skipping renoun markdown TypeScript dependency prewarm target',
                  () => ({
                    data: {
                      filePath: sourceMetadata.filePath,
                      error: formatPrewarmError(error),
                    },
                  })
                )
              }
            }

            if (!warmFile.methods.has('getCodeFenceTokens')) {
              continue
            }

            await analysisClientServer.getCachedTokens(project, {
              value: sourceMetadata.value,
              language: sourceMetadata.language,
              filePath: sourceMetadata.filePath,
              highlighter: null,
              theme: undefined,
              waitForWarmResult: true,
              highlighterLoader: getPrewarmHighlighter,
            })
          }
        } catch (error) {
          options.logger.warn(
            'Skipping renoun markdown code fence analysis prewarm target',
            () => ({
              data: {
                filePath: warmFile.absolutePath,
                error: formatPrewarmError(error),
              },
            })
          )
        }
      }
    }
  )

  return {
    fileGetDependencyPathsByRequestKey,
  }
}

async function getTypeScriptDependencyPaths(
  filePath: string,
  analysisOptions: AnalysisOptions | undefined
): Promise<string[]> {
  const { getCachedTypeScriptDependencyPaths, getProgram } =
    await loadAnalysisClientServerModule()
  const project = getProgram(analysisOptions)
  const dependencyPaths = await getCachedTypeScriptDependencyPaths(
    project,
    filePath
  )
  const normalizedPaths = new Set<string>([resolve(filePath)])

  for (const dependencyPath of dependencyPaths) {
    if (typeof dependencyPath === 'string' && dependencyPath.length > 0) {
      normalizedPaths.add(resolve(dependencyPath))
    }
  }

  return Array.from(normalizedPaths.values()).sort((left, right) =>
    left.localeCompare(right)
  )
}

type WarmEntryFile = {
  getExportTypes?: () => Promise<unknown>
  getExports?: () => Promise<unknown>
  getOutlineRanges?: () => Promise<unknown>
  getSections?: () => Promise<unknown>
  getStaticExportValue?: (name: string) => Promise<unknown>
}

function getEntryWarmFileSystem(
  fileSystemsByTsConfigPath: Map<string, NodeFileSystem>,
  analysisOptions: AnalysisOptions | undefined
): NodeFileSystem {
  const key = analysisOptions?.tsConfigFilePath ?? '__default__'
  const existing = fileSystemsByTsConfigPath.get(key)
  if (existing) {
    return existing
  }

  const created = new NodeFileSystem({
    ...(analysisOptions?.tsConfigFilePath
      ? { tsConfigPath: analysisOptions.tsConfigFilePath }
      : {}),
  })
  fileSystemsByTsConfigPath.set(key, created)
  return created
}

async function warmEntryFileCaches(
  warmFile: WarmFileTask,
  options: {
    analysisOptions: AnalysisOptions | undefined
    fileSystemsByTsConfigPath: Map<string, NodeFileSystem>
  }
): Promise<void> {
  const { Directory } = await loadEntriesModule()
  const fileSystem = getEntryWarmFileSystem(
    options.fileSystemsByTsConfigPath,
    options.analysisOptions
  )
  const directory = new Directory({
    path: dirname(warmFile.absolutePath),
    fileSystem,
  })
  const file = (await directory.getFile(
    removeAllExtensions(basename(warmFile.absolutePath)),
    warmFile.extension
  )) as WarmEntryFile

  if (
    warmFile.methods.has('getExportTypes') &&
    typeof file.getExportTypes === 'function'
  ) {
    await file.getExportTypes()
  }

  if (
    warmFile.methods.has('getExports') &&
    typeof file.getExports === 'function'
  ) {
    await file.getExports()
  }

  if (warmFile.methods.has('getSections')) {
    if (
      isJavaScriptLikeExtension(warmFile.extension) &&
      typeof file.getOutlineRanges === 'function'
    ) {
      await file.getOutlineRanges()
    }

    if (
      (warmFile.extension === 'md' || warmFile.extension === 'mdx') &&
      typeof file.getSections === 'function'
    ) {
      await file.getSections()

      if (typeof file.getStaticExportValue === 'function') {
        await file.getStaticExportValue('metadata').catch(() => undefined)
      }
    }
  }
}

async function drainExportHistory(
  generator: ExportHistoryGenerator
): Promise<void> {
  let result = await generator.next()
  while (!result.done) {
    result = await generator.next()
  }
}

function formatPrewarmError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
