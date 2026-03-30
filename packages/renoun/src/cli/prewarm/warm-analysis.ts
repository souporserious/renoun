import { cpus } from 'node:os'
import { existsSync } from 'node:fs'
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeFileSystem } from '../../file-system/NodeFileSystem.ts'
import type { ExportHistoryGenerator } from '../../file-system/types.ts'
import { extractCodeFenceSnippetsFromMarkdown } from '../../analysis/markdown-code-fence-languages.ts'
import { runWithAnalysisRpcRequestPriority } from '../../analysis/request-priority.ts'
import { hasServerRuntimeInProcessEnv } from '../../analysis/runtime-env.ts'
import type { AnalysisOptions } from '../../analysis/types.ts'
import {
  getSourceTextMetadata,
  getTokens,
  getTypeScriptDependencyPaths,
} from '../../analysis/node-client.ts'
import { forEachConcurrent } from '../../utils/concurrency.ts'
import { getDebugLogger } from '../../utils/debug.ts'
import { isProductionEnvironment } from '../../utils/env.ts'
import { isJavaScriptLikeExtension } from '../../utils/is-javascript-like-extension.ts'
import type {
  DirectoryEntriesRequest,
  DirectoryStructureRequest,
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
const PREWARM_STRUCTURE_CONCURRENCY = Math.max(
  1,
  Math.min(4, Math.ceil(cpus().length / 4))
)
const PREWARM_FULL_LEAF_ROUTE_FILE_LIMIT = 96
const PREWARM_SERVER_FULL_LEAF_ROUTE_FILE_LIMIT = 96
const PREWARM_HIGH_FANOUT_LEAF_ROUTE_SAMPLE_LIMIT = 16
const PREWARM_SERVER_HIGH_FANOUT_LEAF_ROUTE_SAMPLE_LIMIT = 32
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
  | 'getReferenceBase'
  | 'getExportTypes'
  | 'getExports'
  | 'getGitMetadata'
  | 'getSections'

interface WarmFileTask {
  cacheKey: string
  absolutePath: string
  extension?: string
  bootstrapMethods: Set<WarmFileMethod>
  backgroundMethods: Set<WarmFileMethod>
  fileGetRequestKeys?: Set<string>
  repositoryTarget?: {
    directoryPath: string
    path: string
    extensions?: string[]
    repository: FileRequest['repository']
    sparsePaths?: string[]
  }
}

interface WarmRenounPrewarmTargetsOptions {
  analysisOptions?: AnalysisOptions
  isFilePathGitIgnored: (filePath: string) => boolean
  startSettledInBackground?: boolean
}

interface RepositoryBootstrapRequest {
  repository: FileRequest['repository'] | DirectoryEntriesRequest['repository']
  sparsePaths?: string[]
}

export interface WarmRenounPrewarmTargetsResult {
  fileGetDependencyPathsByRequestKey: Record<string, string[]>
}

export interface StartedWarmRenounPrewarmTargets {
  ready: Promise<WarmRenounPrewarmTargetsResult>
  settled: Promise<void>
}

type RepositoryModule = typeof import('../../file-system/Repository.ts')
type EntriesModule = Pick<
  typeof import('../../file-system/entries.ts'),
  'Directory' | 'isFile'
>

let repositoryModulePromise: Promise<RepositoryModule> | undefined
let entriesModulePromise: Promise<EntriesModule> | undefined

function shouldSkipWorkspaceGitIgnoredWarmPath(
  filePath: string,
  isRepositoryBacked: boolean,
  options: Pick<WarmRenounPrewarmTargetsOptions, 'isFilePathGitIgnored'>
): boolean {
  if (isRepositoryBacked) {
    return false
  }

  return options.isFilePathGitIgnored(filePath)
}

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

function normalizeWarmValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeWarmValue(item))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, normalizeWarmValue(entryValue)])
    )
  }

  return value
}

function getDirectoryStructureRequestKey(request: DirectoryStructureRequest): string {
  return JSON.stringify({
    directoryPath: request.directoryPath,
    options: normalizeWarmValue(request.options ?? null),
    repository: normalizeWarmValue(request.repository ?? null),
    sparsePaths: request.sparsePaths?.slice().sort() ?? [],
  })
}

function createReadyDirectoryStructureRequest(
  request: DirectoryStructureRequest
): DirectoryStructureRequest {
  return {
    ...request,
    options: {
      ...(request.options ?? {}),
      includeResolvedTypes: false,
      includeSections: false,
      includeGitDates: false,
      includeAuthors: false,
    },
  }
}

function normalizeDirectoryStructureReadyComparisonOptions(
  options: DirectoryStructureRequest['options']
): unknown {
  const normalizedOptions = options ?? {}

  return normalizeWarmValue({
    ...normalizedOptions,
    includeResolvedTypes: normalizedOptions['includeResolvedTypes'] ?? false,
    includeSections: normalizedOptions['includeSections'] ?? false,
    includeGitDates: normalizedOptions['includeGitDates'] ?? false,
    includeAuthors: normalizedOptions['includeAuthors'] ?? false,
  })
}

function partitionDirectoryStructureRequests(
  requests: DirectoryStructureRequest[]
): {
  readyRequests: DirectoryStructureRequest[]
  settledRequests: DirectoryStructureRequest[]
} {
  const readyRequests = new Map<string, DirectoryStructureRequest>()
  const settledRequests = new Map<string, DirectoryStructureRequest>()

  for (const request of requests) {
    const readyRequest = createReadyDirectoryStructureRequest(request)
    readyRequests.set(getDirectoryStructureRequestKey(readyRequest), readyRequest)

    if (
      JSON.stringify(
        normalizeDirectoryStructureReadyComparisonOptions(request.options)
      ) ===
      JSON.stringify(
        normalizeDirectoryStructureReadyComparisonOptions(readyRequest.options)
      )
    ) {
      continue
    }

    settledRequests.set(getDirectoryStructureRequestKey(request), request)
  }

  return {
    readyRequests: Array.from(readyRequests.values()),
    settledRequests: Array.from(settledRequests.values()),
  }
}

export async function warmRenounPrewarmTargets(
  targets: RenounPrewarmTargets,
  options: WarmRenounPrewarmTargetsOptions
): Promise<WarmRenounPrewarmTargetsResult> {
  const handle = startWarmRenounPrewarmTargets(targets, options)
  const warmResult = await handle.ready
  await handle.settled
  return warmResult
}

export function startWarmRenounPrewarmTargets(
  targets: RenounPrewarmTargets,
  options: WarmRenounPrewarmTargetsOptions
): StartedWarmRenounPrewarmTargets {
  const logger = getDebugLogger()
  const fileSystem = new NodeFileSystem({
    tsConfigPath: options.analysisOptions?.tsConfigFilePath,
  })
  const warmFilesByPath = new Map<string, WarmFileTask>()
  let backgroundWarmFiles: WarmFileTask[] = []
  let settledDirectoryStructureRequests: DirectoryStructureRequest[] = []
  let settledExportHistoryRequests: ExportHistoryRequest[] = []

  const ready = (async () => {
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

    if (targets.directoryGetStructure.length > 0) {
      logger.debug('Collecting Directory#getStructure callsites', () => ({
        data: {
          directories: targets.directoryGetStructure.length,
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

    if (
      warmFilesByPath.size === 0 &&
      targets.directoryGetStructure.length === 0 &&
      targets.exportHistory.length === 0
    ) {
      logger.debug('No prewarm files were discovered')
      return {
        fileGetDependencyPathsByRequestKey: {},
      }
    }

    logger.debug('Prewarming renoun cache targets', () => ({
      data: {
        files: warmFilesByPath.size,
        directoryStructures: targets.directoryGetStructure.length,
        exportHistories: targets.exportHistory.length,
      },
    }))

    const repositoryBootstrapRequests = collectRepositoryBootstrapRequests(
      targets,
      warmFilesByPath
    )

    if (repositoryBootstrapRequests.length > 0) {
      logger.debug('Bootstrapping repository-backed analysis roots', () => ({
        data: {
          repositories: repositoryBootstrapRequests.length,
        },
      }))

      await bootstrapRepositoryAnalysisRoots(repositoryBootstrapRequests, {
        logger,
      })
    }

    const blockingWarmFiles = Array.from(warmFilesByPath.values()).filter(
      (warmFile) => warmFile.bootstrapMethods.size > 0
    )
    backgroundWarmFiles = Array.from(warmFilesByPath.values()).filter(
      (warmFile) => warmFile.backgroundMethods.size > 0
    )

    const {
      readyRequests: readyDirectoryStructureRequests,
      settledRequests: nextSettledDirectoryStructureRequests,
    } = partitionDirectoryStructureRequests(targets.directoryGetStructure)
    settledDirectoryStructureRequests = nextSettledDirectoryStructureRequests
    settledExportHistoryRequests = targets.exportHistory.slice()

    const [warmResult] = await Promise.all([
      blockingWarmFiles.length > 0
        ? warmFiles(blockingWarmFiles, {
            analysisOptions: options.analysisOptions,
            fileSystem,
            logger,
            phase: 'bootstrap',
          })
        : Promise.resolve<WarmRenounPrewarmTargetsResult>({
            fileGetDependencyPathsByRequestKey: {},
          }),
      readyDirectoryStructureRequests.length > 0
        ? warmDirectoryStructureRequests(readyDirectoryStructureRequests, {
            analysisOptions: options.analysisOptions,
            logger,
          })
        : Promise.resolve(),
    ])

    logger.debug('Finished ready renoun cache prewarm targets')

    return warmResult
  })()

  const settled = ready.then(async () => {
    if (options.startSettledInBackground === false) {
      return
    }

    const backgroundTasks: Array<Promise<void>> = []

    if (backgroundWarmFiles.length > 0) {
      logger.debug('Scheduling background renoun file prewarm tasks', () => ({
        data: {
          files: backgroundWarmFiles.length,
        },
      }))

      backgroundTasks.push(
        runWithAnalysisRpcRequestPriority('background', async () =>
          warmFiles(backgroundWarmFiles, {
            analysisOptions: options.analysisOptions,
            fileSystem,
            logger,
            phase: 'background',
          })
        )
          .then(() => undefined)
          .catch((error) => {
            logger.warn('Background renoun file prewarm target failed', () => ({
              data: {
                error: formatPrewarmError(error),
              },
            }))
          })
      )
    }

    if (settledDirectoryStructureRequests.length > 0) {
      logger.debug(
        'Scheduling background renoun directory structure prewarm tasks',
        () => ({
          data: {
            directories: settledDirectoryStructureRequests.length,
          },
        })
      )

      backgroundTasks.push(
        runWithAnalysisRpcRequestPriority('background', async () =>
          warmDirectoryStructureRequests(settledDirectoryStructureRequests, {
            analysisOptions: options.analysisOptions,
            logger,
          })
        )
          .then(() => undefined)
          .catch((error) => {
            logger.warn(
              'Background renoun directory structure prewarm target failed',
              () => ({
                data: {
                  error: formatPrewarmError(error),
                },
              })
            )
          })
      )
    }

    if (settledExportHistoryRequests.length > 0) {
      logger.debug(
        'Scheduling background renoun export history prewarm tasks',
        () => ({
          data: {
            histories: settledExportHistoryRequests.length,
          },
        })
      )

      backgroundTasks.push(
        runWithAnalysisRpcRequestPriority('background', async () =>
          warmExportHistoryRequests(settledExportHistoryRequests, { logger })
        )
          .then(() => undefined)
          .catch((error) => {
            logger.warn(
              'Background renoun export history prewarm target failed',
              () => ({
                data: {
                  error: formatPrewarmError(error),
                },
              })
            )
          })
      )
    }

    await Promise.all(backgroundTasks)

    logger.debug('Finished settled renoun cache prewarm targets')
  })

  return {
    ready,
    settled,
  }
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
  await getTypeScriptDependencyPaths(filePath, analysisOptions)
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
  const { Directory, isFile } = await loadEntriesModule()

  await forEachConcurrent(
    directoryTargets,
    {
      concurrency: PREWARM_FILE_CACHE_CONCURRENCY,
    },
    async (request) => {
      try {
        if (request.repository) {
          const repository = await resolveWarmRepository(
            request.repository,
            request.sparsePaths
          )
          if (!repository) {
            return
          }

          const directory = new Directory({
            path: request.directoryPath,
            repository: repository as any,
          })
          const entries = request.leafOnly
            ? collectLeafFilesFromNavigationTree(
                await directory.getTree({
                  includeIndexAndReadmeFiles:
                    request.includeIndexAndReadmeFiles,
                }),
                isFile
              )
            : await directory.getEntries({
                recursive: request.recursive,
                includeDirectoryNamedFiles: request.includeDirectoryNamedFiles,
                includeIndexAndReadmeFiles:
                  request.includeIndexAndReadmeFiles,
              })

          const eligibleEntries: Array<{
            entry: Awaited<typeof entries>[number]
            filePath: string
            extension: string
          }> = []

          for (const entry of entries) {
            if (!isFile(entry)) {
              continue
            }

            const filePath = entry.absolutePath
            if (
              shouldSkipWorkspaceGitIgnoredWarmPath(filePath, true, options)
            ) {
              continue
            }

            const extension = entry.extension
            if (
              request.filterExtensions !== null &&
              !request.filterExtensions.has(extension)
            ) {
              continue
            }

            eligibleEntries.push({ entry, filePath, extension })
          }

          const eligibleFileCount = eligibleEntries.length
          const sampledEntries = selectHighFanoutLeafWarmSample(
            eligibleEntries,
            {
              leafOnly: request.leafOnly === true,
              fileCount: eligibleFileCount,
            },
            ({ entry, filePath }) =>
              typeof entry.getPathname === 'function'
                ? entry.getPathname()
                : filePath
          )
          const sampledEntriesSet = new Set(sampledEntries)

          for (const candidate of eligibleEntries) {
            const { entry, filePath, extension } = candidate
            const { bootstrapMethods, backgroundMethods } = partitionWarmMethods(
              request.methods && request.methods.length > 0
                ? new Set<WarmFileMethod>(request.methods)
                : determineDirectoryWarmMethods(extension),
              {
                extension,
                leafOnly: request.leafOnly === true,
                fileCount: eligibleFileCount,
              }
            )
            if (!sampledEntriesSet.has(candidate)) {
              backgroundMethods.clear()
            } else if (
              !shouldUseBackgroundHighFanoutLeafWarm({
                leafOnly: request.leafOnly === true,
                fileCount: eligibleFileCount,
              })
            ) {
              for (const method of backgroundMethods) {
                bootstrapMethods.add(method)
              }
              backgroundMethods.clear()
            }

            if (
              bootstrapMethods.size === 0 &&
              backgroundMethods.size === 0
            ) {
              continue
            }

            mergeWarmTask(
              {
                cacheKey: JSON.stringify({
                  directoryPath: request.directoryPath,
                  path: entry.relativePath,
                  extension,
                  repository: normalizePrewarmKeyValue(
                    request.repository ?? null
                  ),
                  sparsePaths: request.sparsePaths?.slice().sort() ?? [],
                }),
                absolutePath: filePath,
                extension,
                bootstrapMethods,
                backgroundMethods,
                repositoryTarget: {
                  directoryPath: request.directoryPath,
                  path: entry.relativePath,
                  repository: request.repository,
                  sparsePaths: request.sparsePaths,
                },
              },
              warmFilesByPath
            )
          }

          return
        }

        const absoluteDirectoryPath = options.fileSystem.getAbsolutePath(
          request.directoryPath
        )
        const filePaths = request.leafOnly
          ? collectLeafFilesFromNavigationTree(
              await new Directory({
                path: absoluteDirectoryPath,
                fileSystem: options.fileSystem,
              }).getTree({
                includeIndexAndReadmeFiles:
                  request.includeIndexAndReadmeFiles,
              }),
              isFile
            ).map((entry) => entry.absolutePath)
          : await collectDirectoryFilePaths(
              options.fileSystem,
              absoluteDirectoryPath,
              {
                recursive: request.recursive,
                includeDirectoryNamedFiles:
                  request.includeDirectoryNamedFiles,
                includeIndexAndReadmeFiles:
                  request.includeIndexAndReadmeFiles,
              }
            )

        const eligibleFilePaths: Array<{ filePath: string; extension: string }> = []

        for (const filePath of filePaths) {
          if (
            shouldSkipWorkspaceGitIgnoredWarmPath(filePath, false, options)
          ) {
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

          eligibleFilePaths.push({ filePath, extension })
        }

        const eligibleFileCount = eligibleFilePaths.length
        const sampledFilePaths = selectHighFanoutLeafWarmSample(
          eligibleFilePaths,
          {
            leafOnly: request.leafOnly === true,
            fileCount: eligibleFileCount,
          },
          ({ filePath }) => relative(absoluteDirectoryPath, filePath)
        )
        const sampledFilePathsSet = new Set(sampledFilePaths)

        for (const candidate of eligibleFilePaths) {
          const { filePath, extension } = candidate
          const { bootstrapMethods, backgroundMethods } = partitionWarmMethods(
            request.methods && request.methods.length > 0
              ? new Set<WarmFileMethod>(request.methods)
              : determineDirectoryWarmMethods(extension),
            {
              extension,
              leafOnly: request.leafOnly === true,
              fileCount: eligibleFileCount,
            }
          )
          if (!sampledFilePathsSet.has(candidate)) {
            backgroundMethods.clear()
          } else if (
            !shouldUseBackgroundHighFanoutLeafWarm({
              leafOnly: request.leafOnly === true,
              fileCount: eligibleFileCount,
            })
          ) {
            for (const method of backgroundMethods) {
              bootstrapMethods.add(method)
            }
            backgroundMethods.clear()
          }

          if (
            bootstrapMethods.size === 0 &&
            backgroundMethods.size === 0
          ) {
            continue
          }

          mergeWarmTask(
            {
              cacheKey: filePath,
              absolutePath: filePath,
              extension,
              bootstrapMethods,
              backgroundMethods,
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
  const deduplicatedRequests = Array.from(deduplicatedTargets.values())
  const sampledGetFileRequestKeys = new Set(
    selectHighFanoutLeafWarmSample(
      deduplicatedRequests,
      {
        leafOnly: true,
        fileCount: deduplicatedRequests.length,
      },
      (request) => `${request.directoryPath}/${request.path}`
    ).map((request) => getFileRequestKey(request))
  )
  const { Directory } = await loadEntriesModule()

  await forEachConcurrent(
    deduplicatedRequests,
    {
      concurrency: PREWARM_FILE_CACHE_CONCURRENCY,
    },
    async (request) => {
      try {
        if (request.repository) {
          const repository = await resolveWarmRepository(
            request.repository,
            request.sparsePaths
          )
          if (!repository) {
            return
          }

          const directory = new Directory({
            path: request.directoryPath,
            repository: repository as any,
          })
          const file = request.extensions && request.extensions.length > 0
            ? await directory.getFile(request.path, request.extensions as any)
            : await directory.getFile(request.path as any)
          const filePath = file.absolutePath

          if (
            shouldSkipWorkspaceGitIgnoredWarmPath(filePath, true, options)
          ) {
            return
          }

          const extension = file.extension
          const { bootstrapMethods, backgroundMethods } = partitionWarmMethods(
            resolveGetFileWarmMethods(request, extension),
            {
              extension,
              leafOnly: true,
              fileCount: deduplicatedRequests.length,
            }
          )
          if (!sampledGetFileRequestKeys.has(getFileRequestKey(request))) {
            backgroundMethods.clear()
          } else if (
            !shouldUseBackgroundHighFanoutLeafWarm({
              leafOnly: true,
              fileCount: deduplicatedRequests.length,
            })
          ) {
            for (const method of backgroundMethods) {
              bootstrapMethods.add(method)
            }
            backgroundMethods.clear()
          }

          if (
            bootstrapMethods.size === 0 &&
            backgroundMethods.size === 0
          ) {
            return
          }

          mergeWarmTask(
            {
              cacheKey: getFileRequestKey(request),
              absolutePath: filePath,
              extension,
              bootstrapMethods,
              backgroundMethods,
              fileGetRequestKeys: new Set([getFileRequestKey(request)]),
              repositoryTarget: {
                directoryPath: request.directoryPath,
                path: request.path,
                extensions: request.extensions,
                repository: request.repository,
                sparsePaths: request.sparsePaths,
              },
            },
            warmFilesByPath
          )
          return
        }

        const filePath = await resolveGetFileRequestPath(
          options.fileSystem,
          request
        )

        if (
          shouldSkipWorkspaceGitIgnoredWarmPath(filePath, false, options)
        ) {
          return
        }

        const extension = getFileExtension(filePath)
        if (extension === undefined) {
          return
        }

        const { bootstrapMethods, backgroundMethods } = partitionWarmMethods(
          resolveGetFileWarmMethods(request, extension),
          {
            extension,
            leafOnly: true,
            fileCount: deduplicatedRequests.length,
          }
        )
        if (!sampledGetFileRequestKeys.has(getFileRequestKey(request))) {
          backgroundMethods.clear()
        } else if (
          !shouldUseBackgroundHighFanoutLeafWarm({
            leafOnly: true,
            fileCount: deduplicatedRequests.length,
          })
        ) {
          for (const method of backgroundMethods) {
            bootstrapMethods.add(method)
          }
          backgroundMethods.clear()
        }

        if (
          bootstrapMethods.size === 0 &&
          backgroundMethods.size === 0
        ) {
          return
        }

        mergeWarmTask(
          {
            cacheKey: getFileRequestKey(request),
            absolutePath: filePath,
            extension,
            bootstrapMethods,
            backgroundMethods,
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

function collectLeafFilesFromNavigationTree<
  Entry extends {
    absolutePath: string
    getPathname?: () => string
  },
>(
  entries: Array<NavigationTreeEntry<Entry>>,
  isFileEntry: (entry: Entry) => boolean
): Entry[] {
  const leafFiles: Entry[] = []

  const visit = (currentEntries: Array<NavigationTreeEntry<Entry>>) => {
    for (const { entry, children } of currentEntries) {
      if (children && children.length > 0) {
        visit(children)
        continue
      }

      if (isFileEntry(entry)) {
        leafFiles.push(entry)
      }
    }
  }

  visit(entries)

  return leafFiles
}

type NavigationTreeEntry<Entry> = {
  entry: Entry
  children?: Array<NavigationTreeEntry<Entry>>
}

function limitHighFanoutLeafWarmMethods(
  methods: Set<WarmFileMethod>,
  options: { leafOnly: boolean; fileCount: number }
): Set<WarmFileMethod> {
  if (
    !options.leafOnly ||
    options.fileCount <= getHighFanoutLeafFullWarmLimit()
  ) {
    return methods
  }

  if (hasServerRuntimeInProcessEnv()) {
    return methods
  }

  const limitedMethods = new Set(methods)
  limitedMethods.delete('getExportTypes')
  limitedMethods.delete('getSections')
  return limitedMethods
}

function getHighFanoutLeafFullWarmLimit(): number {
  if (hasServerRuntimeInProcessEnv()) {
    return PREWARM_SERVER_FULL_LEAF_ROUTE_FILE_LIMIT
  }

  return PREWARM_FULL_LEAF_ROUTE_FILE_LIMIT
}

function getHighFanoutLeafWarmSampleLimit(): number {
  if (hasServerRuntimeInProcessEnv()) {
    return PREWARM_SERVER_HIGH_FANOUT_LEAF_ROUTE_SAMPLE_LIMIT
  }

  return PREWARM_HIGH_FANOUT_LEAF_ROUTE_SAMPLE_LIMIT
}

function shouldSplitHighFanoutLeafWarm(options: {
  leafOnly: boolean
  fileCount: number
}): boolean {
  return (
    hasServerRuntimeInProcessEnv() &&
    options.leafOnly &&
    options.fileCount > getHighFanoutLeafFullWarmLimit()
  )
}

function shouldUseBackgroundHighFanoutLeafWarm(options: {
  leafOnly: boolean
  fileCount: number
}): boolean {
  return (
    shouldSplitHighFanoutLeafWarm(options) && isProductionEnvironment()
  )
}

function shouldBackgroundReferenceSectionsWarm(options: {
  isJavaScriptTarget: boolean
}): boolean {
  return (
    hasServerRuntimeInProcessEnv() &&
    isProductionEnvironment() &&
    options.isJavaScriptTarget
  )
}

function shouldBackgroundReferenceMetadataWarm(options: {
  isJavaScriptTarget: boolean
}): boolean {
  return (
    hasServerRuntimeInProcessEnv() &&
    isProductionEnvironment() &&
    options.isJavaScriptTarget
  )
}

function hasJavaScriptWarmMethods(methods: ReadonlySet<WarmFileMethod>): boolean {
  return (
    methods.has('getReferenceBase') ||
    methods.has('getExports') ||
    methods.has('getExportTypes') ||
    methods.has('getGitMetadata') ||
    methods.has('getSections')
  )
}

export function partitionWarmMethods(
  methods: Set<WarmFileMethod>,
  options: {
    extension?: string
    leafOnly: boolean
    fileCount: number
  }
): {
  bootstrapMethods: Set<WarmFileMethod>
  backgroundMethods: Set<WarmFileMethod>
} {
  const limitedMethods = limitHighFanoutLeafWarmMethods(methods, {
    leafOnly: options.leafOnly,
    fileCount: options.fileCount,
  })
  const bootstrapMethods = new Set(limitedMethods)
  const backgroundMethods = new Set<WarmFileMethod>()
  const isJavaScriptTarget =
    typeof options.extension === 'string'
      ? isJavaScriptLikeExtension(options.extension)
      : hasJavaScriptWarmMethods(limitedMethods)

  if (
    shouldBackgroundReferenceSectionsWarm({
      isJavaScriptTarget,
    }) &&
    bootstrapMethods.delete('getSections')
  ) {
    backgroundMethods.add('getSections')
  }

  if (
    shouldBackgroundReferenceMetadataWarm({
      isJavaScriptTarget,
    })
  ) {
    if (bootstrapMethods.delete('getGitMetadata')) {
      backgroundMethods.add('getGitMetadata')
    }

    if (bootstrapMethods.delete('getExportTypes')) {
      backgroundMethods.add('getExportTypes')
    }
  }

  if (
    backgroundMethods.size > 0 &&
    !bootstrapMethods.has('getExports') &&
    (limitedMethods.has('getReferenceBase') ||
      limitedMethods.has('getGitMetadata') ||
      limitedMethods.has('getExportTypes') ||
      limitedMethods.has('getSections'))
  ) {
    bootstrapMethods.add('getExports')
  }

  if (
    !shouldSplitHighFanoutLeafWarm({
      leafOnly: options.leafOnly,
      fileCount: options.fileCount,
    })
  ) {
    return {
      bootstrapMethods,
      backgroundMethods,
    }
  }

  if (!isJavaScriptTarget) {
    return {
      bootstrapMethods,
      backgroundMethods,
    }
  }

  if (bootstrapMethods.delete('getReferenceBase')) {
    backgroundMethods.add('getReferenceBase')
  }

  if (bootstrapMethods.delete('getGitMetadata')) {
    backgroundMethods.add('getGitMetadata')
  }

  if (bootstrapMethods.delete('getExportTypes')) {
    backgroundMethods.add('getExportTypes')
  }

  if (bootstrapMethods.delete('getSections')) {
    backgroundMethods.add('getSections')
  }

  if (
    shouldUseBackgroundHighFanoutLeafWarm({
      leafOnly: options.leafOnly,
      fileCount: options.fileCount,
    }) &&
    bootstrapMethods.delete('getExports')
  ) {
    backgroundMethods.add('getExports')
  }

  return {
    bootstrapMethods,
    backgroundMethods,
  }
}

function selectHighFanoutLeafWarmSample<Candidate>(
  candidates: Candidate[],
  options: { leafOnly: boolean; fileCount: number },
  getPath: (candidate: Candidate) => string
): Candidate[] {
  if (
    !options.leafOnly ||
    options.fileCount <= getHighFanoutLeafFullWarmLimit()
  ) {
    return candidates
  }

  const sampleLimit = getHighFanoutLeafWarmSampleLimit()
  const selected: Candidate[] = []
  const seenTopLevelSegments = new Set<string>()
  const selectedCandidates = new Set<Candidate>()

  for (const candidate of candidates) {
    const segments = getPath(candidate).split('/').filter(Boolean)
    const topLevelSegment = segments[0] ?? ''

    if (seenTopLevelSegments.has(topLevelSegment)) {
      continue
    }

    seenTopLevelSegments.add(topLevelSegment)
    selected.push(candidate)
    selectedCandidates.add(candidate)

    if (selected.length >= sampleLimit) {
      return selected
    }
  }

  for (const candidate of candidates) {
    if (selectedCandidates.has(candidate)) {
      continue
    }

    selected.push(candidate)
    if (selected.length >= sampleLimit) {
      break
    }
  }

  return selected
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
  return JSON.stringify({
    directoryPath: request.directoryPath,
    path: request.path,
    extensions: request.extensions?.slice().sort() ?? [],
    repository: normalizePrewarmKeyValue(request.repository ?? null),
    sparsePaths: request.sparsePaths?.slice().sort() ?? [],
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
        .map(([key, entryValue]) => [key, normalizePrewarmKeyValue(entryValue)])
    )
  }

  return value
}

async function warmDirectoryStructureRequests(
  requests: DirectoryStructureRequest[],
  options: {
    analysisOptions: AnalysisOptions | undefined
    logger: ReturnType<typeof getDebugLogger>
  }
): Promise<void> {
  const { Directory } = await loadEntriesModule()
  const fileSystemsByTsConfigPath = new Map<string, NodeFileSystem>()

  await forEachConcurrent(
    requests,
    {
      concurrency: PREWARM_STRUCTURE_CONCURRENCY,
    },
    async (request) => {
      try {
        const repository = request.repository
          ? await resolveWarmRepository(request.repository, request.sparsePaths)
          : undefined
        const fileSystem = repository
          ? undefined
          : getEntryWarmFileSystem(
              fileSystemsByTsConfigPath,
              options.analysisOptions
            )
        const directory = new Directory({
          path: request.directoryPath,
          ...(fileSystem ? { fileSystem } : {}),
          ...(repository ? { repository: repository as any } : {}),
        })

        await directory.getStructure(request.options as any)
      } catch (error) {
        options.logger.warn(
          'Skipping renoun Directory#getStructure prewarm target',
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
        const repository = Repository.resolveUnsafe(
          request.repository as Parameters<typeof Repository.resolveUnsafe>[0]
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

function collectRepositoryBootstrapRequests(
  targets: RenounPrewarmTargets,
  warmFilesByPath?: Map<string, WarmFileTask>
): RepositoryBootstrapRequest[] {
  const uniqueRequests = new Map<string, RepositoryBootstrapRequest>()

  const addRequest = (
    repository:
      | FileRequest['repository']
      | DirectoryEntriesRequest['repository']
      | undefined,
    sparsePaths?: string[]
  ) => {
    if (!repository) {
      return
    }

    const request: RepositoryBootstrapRequest = {
      repository,
      ...(sparsePaths && sparsePaths.length > 0
        ? { sparsePaths: [...sparsePaths].sort() }
        : {}),
    }
    const key = JSON.stringify({
      repository: normalizePrewarmKeyValue(repository),
      sparsePaths: request.sparsePaths ?? [],
    })

    if (!uniqueRequests.has(key)) {
      uniqueRequests.set(key, request)
    }
  }

  for (const request of targets.directoryGetEntries) {
    addRequest(request.repository, request.sparsePaths)
  }

  for (const request of targets.fileGetFile) {
    addRequest(request.repository, request.sparsePaths)
  }

  for (const request of targets.directoryGetStructure) {
    addRequest(request.repository, request.sparsePaths)
  }

  for (const request of targets.exportHistory) {
    addRequest(request.repository, request.sparsePaths)
  }

  if (warmFilesByPath) {
    for (const warmFile of warmFilesByPath.values()) {
      addRequest(
        warmFile.repositoryTarget?.repository,
        warmFile.repositoryTarget?.sparsePaths
      )
    }
  }

  return Array.from(uniqueRequests.values())
}

async function bootstrapRepositoryAnalysisRoots(
  requests: RepositoryBootstrapRequest[],
  options: {
    logger: ReturnType<typeof getDebugLogger>
  }
): Promise<void> {
  await forEachConcurrent(
    requests,
    {
      concurrency: PREWARM_STRUCTURE_CONCURRENCY,
    },
    async (request) => {
      try {
        const repository = await resolveWarmRepository(
          request.repository,
          request.sparsePaths
        )
        const fileSystem =
          repository && typeof (repository as { getFileSystem?: unknown }).getFileSystem === 'function'
            ? (
                repository as {
                  getFileSystem: () => {
                    prepareAnalysisRoot?: () => Promise<unknown>
                  }
                }
              ).getFileSystem()
            : undefined

        if (
          fileSystem &&
          typeof fileSystem.prepareAnalysisRoot === 'function'
        ) {
          await fileSystem.prepareAnalysisRoot()
        }
      } catch (error) {
        options.logger.warn(
          'Skipping renoun repository analysis bootstrap target',
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

export async function bootstrapRenounPrewarmTargetRepositories(
  targets: RenounPrewarmTargets
): Promise<void> {
  const requests = collectRepositoryBootstrapRequests(targets)

  if (requests.length === 0) {
    return
  }

  await bootstrapRepositoryAnalysisRoots(requests, {
    logger: getDebugLogger(),
  })
}

async function resolveWarmRepository(
  repositoryInput: FileRequest['repository'] | DirectoryEntriesRequest['repository'],
  sparsePaths?: string[]
) {
  if (!repositoryInput) {
    return undefined
  }

  const { Repository } = await loadRepositoryModule()
  const repository = Repository.resolveUnsafe(
    repositoryInput as Parameters<typeof Repository.resolveUnsafe>[0]
  )
  if (!repository) {
    return undefined
  }

  for (const sparsePath of sparsePaths ?? []) {
    repository.registerSparsePath(sparsePath)
  }

  return repository
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
    // both the reference render path and deep analysis for JS-like files.
    methods.add('getExports')
    methods.add('getReferenceBase')
    methods.add('getExportTypes')
    methods.add('getGitMetadata')
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
  const existing = warmFilesByPath.get(task.cacheKey)

  if (!existing) {
    warmFilesByPath.set(task.cacheKey, task)
    return
  }

  for (const method of task.bootstrapMethods) {
    existing.bootstrapMethods.add(method)
  }

  for (const method of task.backgroundMethods) {
    existing.backgroundMethods.add(method)
  }

  if (task.fileGetRequestKeys) {
    if (!existing.fileGetRequestKeys) {
      existing.fileGetRequestKeys = new Set<string>()
    }

    for (const requestKey of task.fileGetRequestKeys) {
      existing.fileGetRequestKeys.add(requestKey)
    }
  }

  if (task.repositoryTarget && !existing.repositoryTarget) {
    existing.repositoryTarget = task.repositoryTarget
  }

  if (!existing.extension && task.extension) {
    existing.extension = task.extension
  }
}

function isJavaScriptWarmTask(warmFile: WarmFileTask): boolean {
  if (typeof warmFile.extension === 'string') {
    return isJavaScriptLikeExtension(warmFile.extension)
  }

  return (
    warmFile.bootstrapMethods.has('getReferenceBase') ||
    warmFile.bootstrapMethods.has('getExports') ||
    warmFile.bootstrapMethods.has('getExportTypes') ||
    warmFile.bootstrapMethods.has('getGitMetadata') ||
    warmFile.backgroundMethods.has('getReferenceBase') ||
    warmFile.backgroundMethods.has('getExports') ||
    warmFile.backgroundMethods.has('getExportTypes') ||
    warmFile.backgroundMethods.has('getGitMetadata')
  )
}

function isMarkdownWarmTask(warmFile: WarmFileTask): boolean {
  return warmFile.extension === 'md' || warmFile.extension === 'mdx'
}

async function warmFiles(
  warmFiles: WarmFileTask[],
  options: {
    analysisOptions?: AnalysisOptions
    fileSystem: NodeFileSystem
    logger: ReturnType<typeof getDebugLogger>
    phase: 'bootstrap' | 'background'
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
      const methods =
        options.phase === 'background'
          ? warmFile.backgroundMethods
          : warmFile.bootstrapMethods
      if (methods.size === 0) {
        return
      }

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
        options.phase === 'bootstrap' &&
        warmFile.fileGetRequestKeys &&
        warmFile.fileGetRequestKeys.size > 0 &&
        !warmFile.repositoryTarget &&
        isJavaScriptWarmTask(warmFile)
      ) {
        try {
          const dependencyPaths = await getNormalizedTypeScriptDependencyPaths(
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
          methods,
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
        (methods.has('getCodeFenceSourceMetadata') ||
          methods.has('getCodeFenceTokens')) &&
        isMarkdownWarmTask(warmFile)
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
            const sourceMetadata = await getSourceTextMetadata({
              ...(snippetPath ? { filePath: snippetPath } : {}),
              ...(snippetBaseDirectory
                ? { baseDirectory: snippetBaseDirectory }
                : {}),
              value: snippet.value,
              language: snippet.language as any,
              shouldFormat: snippet.shouldFormat,
              isFormattingExplicit: true,
              virtualizeFilePath: snippetPath !== undefined,
              analysisOptions: snippetAnalysisOptions,
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

            if (!methods.has('getCodeFenceTokens')) {
              continue
            }

            await getTokens({
              allowErrors: snippet.allowErrors,
              value: sourceMetadata.value,
              language: sourceMetadata.language,
              filePath: sourceMetadata.filePath,
              showErrors: snippet.showErrors,
              theme: undefined,
              waitForWarmResult: true,
              analysisOptions: snippetAnalysisOptions,
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

async function getNormalizedTypeScriptDependencyPaths(
  filePath: string,
  analysisOptions: AnalysisOptions | undefined
): Promise<string[]> {
  const dependencyPaths = await getTypeScriptDependencyPaths(
    filePath,
    analysisOptions
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
  getCachedReferenceBaseData?: () => Promise<unknown>
  getCachedReferenceData?: () => Promise<unknown>
  getCachedGitExportMetadataByName?: () => Promise<unknown>
  getAuthors?: () => Promise<unknown>
  getFirstCommitDate?: () => Promise<unknown>
  getExportTypes?: () => Promise<unknown>
  getExports?: () => Promise<unknown>
  getLastCommitDate?: () => Promise<unknown>
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
    methods: ReadonlySet<WarmFileMethod>
  }
): Promise<void> {
  const { Directory } = await loadEntriesModule()
  const file = await (async () => {
    if (warmFile.repositoryTarget?.repository) {
      const repository = await resolveWarmRepository(
        warmFile.repositoryTarget.repository,
        warmFile.repositoryTarget.sparsePaths
      )
      if (!repository) {
        throw new Error(
          `Failed to resolve repository for prewarm target "${warmFile.absolutePath}".`
        )
      }

      const directory = new Directory({
        path: warmFile.repositoryTarget.directoryPath,
        repository: repository as any,
      })

      if (
        warmFile.repositoryTarget.extensions &&
        warmFile.repositoryTarget.extensions.length > 0
      ) {
        return directory.getFile(
          warmFile.repositoryTarget.path,
          warmFile.repositoryTarget.extensions as any
        ) as Promise<WarmEntryFile>
      }

      return directory.getFile(warmFile.repositoryTarget.path as any) as Promise<WarmEntryFile>
    }

    const fileSystem = getEntryWarmFileSystem(
      options.fileSystemsByTsConfigPath,
      options.analysisOptions
    )
    const directory = new Directory({
      path: dirname(warmFile.absolutePath),
      fileSystem,
    })

    return directory.getFile(
      removeAllExtensions(basename(warmFile.absolutePath)),
      warmFile.extension
    ) as Promise<WarmEntryFile>
  })()
  const canWarmReferenceBaseData =
    isJavaScriptWarmTask(warmFile) &&
    (options.methods.has('getReferenceBase') ||
      options.methods.has('getExportTypes') ||
      options.methods.has('getGitMetadata') ||
      options.methods.has('getSections')) &&
    (typeof file.getCachedReferenceBaseData === 'function' ||
      typeof file.getCachedReferenceData === 'function')
  let fileExports: unknown[] | undefined

  if (canWarmReferenceBaseData) {
    if (typeof file.getCachedReferenceBaseData === 'function') {
      await file.getCachedReferenceBaseData()
    } else {
      await file.getCachedReferenceData!()
    }
  }

  if (
    options.methods.has('getExports') &&
    typeof file.getExports === 'function'
  ) {
    const exports = await file.getExports()
    if (Array.isArray(exports)) {
      fileExports = exports
    }
  }

  if (
    options.methods.has('getExportTypes') &&
    typeof file.getExportTypes === 'function'
  ) {
    await file.getExportTypes()
  }

  if (
    options.methods.has('getGitMetadata') &&
    typeof file.getLastCommitDate === 'function'
  ) {
    await file.getLastCommitDate()

    if (options.methods.has('getExports')) {
      if (typeof file.getCachedGitExportMetadataByName === 'function') {
        await file.getCachedGitExportMetadataByName()
      } else if (fileExports && fileExports.length > 0) {
        await Promise.all(
          fileExports.map(async (entry) => {
            if (
              entry &&
              typeof entry === 'object' &&
              typeof (entry as { getFirstCommitDate?: unknown })
                .getFirstCommitDate === 'function'
            ) {
              await (
                entry as { getFirstCommitDate: () => Promise<unknown> }
              ).getFirstCommitDate()
            }
          })
        )
      }
    }
  }

  if (options.methods.has('getSections')) {
    if (
      isJavaScriptWarmTask(warmFile) &&
      typeof file.getOutlineRanges === 'function'
    ) {
      await file.getOutlineRanges()
    }

    if (typeof file.getSections === 'function') {
      await file.getSections()
    }

    if (isMarkdownWarmTask(warmFile)) {
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
