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
import type { AnalysisOptions } from '../../analysis/types.ts'
import { forEachConcurrent } from '../../utils/concurrency.ts'
import { getDebugLogger } from '../../utils/debug.ts'
import { isJavaScriptLikeExtension } from '../../utils/is-javascript-like-extension.ts'
import type { Highlighter } from '../../utils/create-highlighter.ts'
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
const PREWARM_HIGH_FANOUT_LEAF_ROUTE_SAMPLE_LIMIT = 16
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
  | 'getGitMetadata'
  | 'getSections'

interface WarmFileTask {
  cacheKey: string
  absolutePath: string
  extension?: string
  methods: Set<WarmFileMethod>
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
}

export interface WarmRenounPrewarmTargetsResult {
  fileGetDependencyPathsByRequestKey: Record<string, string[]>
}

type RepositoryModule = typeof import('../../file-system/Repository.ts')
type EntriesModule = Pick<
  typeof import('../../file-system/entries.ts'),
  'Directory' | 'isFile'
>
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
    targets.directoryGetStructure.length > 0
      ? warmDirectoryStructureRequests(targets.directoryGetStructure, {
          analysisOptions: options.analysisOptions,
          logger,
        })
      : Promise.resolve(),
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
            ? collectLeafFilesFromEntries(
                await directory.getEntries({
                  recursive: true,
                  includeDirectoryNamedFiles: true,
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

          for (const { entry, filePath, extension } of sampledEntries) {

            const methods = limitHighFanoutLeafWarmMethods(
              request.methods && request.methods.length > 0
                ? new Set<WarmFileMethod>(request.methods)
                : determineDirectoryWarmMethods(extension),
              {
                leafOnly: request.leafOnly === true,
                fileCount: eligibleFileCount,
              }
            )
            if (methods.size === 0) {
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
                methods,
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
          ? collectLeafFilesFromEntries(
              await new Directory({
                path: absoluteDirectoryPath,
                fileSystem: options.fileSystem,
              }).getEntries({
                recursive: true,
                includeDirectoryNamedFiles: true,
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

        for (const { filePath, extension } of sampledFilePaths) {

          const methods = limitHighFanoutLeafWarmMethods(
            request.methods && request.methods.length > 0
              ? new Set<WarmFileMethod>(request.methods)
              : determineDirectoryWarmMethods(extension),
            {
              leafOnly: request.leafOnly === true,
              fileCount: eligibleFileCount,
            }
          )
          if (methods.size === 0) {
            continue
          }

          mergeWarmTask(
            {
              cacheKey: filePath,
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
  const { Directory } = await loadEntriesModule()

  await forEachConcurrent(
    Array.from(deduplicatedTargets.values()),
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
          const methods = resolveGetFileWarmMethods(request, extension)
          if (methods.size === 0) {
            return
          }

          mergeWarmTask(
            {
              cacheKey: getFileRequestKey(request),
              absolutePath: filePath,
              extension,
              methods,
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

        const methods = resolveGetFileWarmMethods(request, extension)
        if (methods.size === 0) {
          return
        }

        mergeWarmTask(
          {
            cacheKey: getFileRequestKey(request),
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

function collectLeafFilesFromEntries<
  Entry extends {
    absolutePath: string
    getPathname?: () => string
  },
>(
  entries: Entry[],
  isFileEntry: (entry: Entry) => boolean
): Entry[] {
  const descendantPathnames = new Set<string>()
  const pathnamesByEntry = new Map<Entry, string>()

  for (const entry of entries) {
    if (typeof entry.getPathname !== 'function') {
      continue
    }

    const pathname = entry.getPathname()
    pathnamesByEntry.set(entry, pathname)

    let parentPathname = pathname
    while (true) {
      const lastSeparatorIndex = parentPathname.lastIndexOf('/')
      parentPathname =
        lastSeparatorIndex > 0 ? parentPathname.slice(0, lastSeparatorIndex) : '/'

      if (!parentPathname) {
        parentPathname = '/'
      }

      descendantPathnames.add(parentPathname)

      if (parentPathname === '/') {
        break
      }
    }
  }

  const leafFiles: Entry[] = []
  const seenLeafPathnames = new Set<string>()

  for (const entry of entries) {
    if (!isFileEntry(entry)) {
      continue
    }

    const pathname = pathnamesByEntry.get(entry)
    if (!pathname || descendantPathnames.has(pathname)) {
      continue
    }

    if (seenLeafPathnames.has(pathname)) {
      continue
    }

    seenLeafPathnames.add(pathname)
    leafFiles.push(entry)
  }

  return leafFiles
}

function limitHighFanoutLeafWarmMethods(
  methods: Set<WarmFileMethod>,
  options: { leafOnly: boolean; fileCount: number }
): Set<WarmFileMethod> {
  if (
    !options.leafOnly ||
    options.fileCount <= PREWARM_FULL_LEAF_ROUTE_FILE_LIMIT
  ) {
    return methods
  }

  const limitedMethods = new Set(methods)
  limitedMethods.delete('getExportTypes')
  limitedMethods.delete('getSections')
  return limitedMethods
}

function selectHighFanoutLeafWarmSample<Candidate>(
  candidates: Candidate[],
  options: { leafOnly: boolean; fileCount: number },
  getPath: (candidate: Candidate) => string
): Candidate[] {
  if (
    !options.leafOnly ||
    options.fileCount <= PREWARM_FULL_LEAF_ROUTE_FILE_LIMIT
  ) {
    return candidates
  }

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

    if (selected.length >= PREWARM_HIGH_FANOUT_LEAF_ROUTE_SAMPLE_LIMIT) {
      return selected
    }
  }

  for (const candidate of candidates) {
    if (selectedCandidates.has(candidate)) {
      continue
    }

    selected.push(candidate)
    if (selected.length >= PREWARM_HIGH_FANOUT_LEAF_ROUTE_SAMPLE_LIMIT) {
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
        const fileSystem = getEntryWarmFileSystem(
          fileSystemsByTsConfigPath,
          options.analysisOptions
        )
        const directory = new Directory({
          path: request.directoryPath,
          fileSystem,
          ...(request.repository
            ? { repository: request.repository as any }
            : {}),
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

async function resolveWarmRepository(
  repositoryInput: FileRequest['repository'] | DirectoryEntriesRequest['repository'],
  sparsePaths?: string[]
) {
  if (!repositoryInput) {
    return undefined
  }

  const { Repository } = await loadRepositoryModule()
  const repository = Repository.resolve(
    repositoryInput as Parameters<typeof Repository.resolve>[0]
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
    // both export headers and export types for JS-like files.
    methods.add('getExports')
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
    warmFile.methods.has('getExports') ||
    warmFile.methods.has('getExportTypes') ||
    warmFile.methods.has('getGitMetadata')
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
        !warmFile.repositoryTarget &&
        isJavaScriptWarmTask(warmFile)
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
              allowErrors: snippet.allowErrors,
              value: sourceMetadata.value,
              language: sourceMetadata.language,
              filePath: sourceMetadata.filePath,
              highlighter: null,
              showErrors: snippet.showErrors,
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
    (warmFile.methods.has('getExportTypes') ||
      warmFile.methods.has('getGitMetadata')) &&
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
    warmFile.methods.has('getExports') &&
    typeof file.getExports === 'function'
  ) {
    const exports = await file.getExports()
    if (Array.isArray(exports)) {
      fileExports = exports
    }
  }

  if (
    warmFile.methods.has('getExportTypes') &&
    typeof file.getExportTypes === 'function'
  ) {
    await file.getExportTypes()
  }

  if (
    warmFile.methods.has('getGitMetadata') &&
    typeof file.getLastCommitDate === 'function'
  ) {
    await file.getLastCommitDate()

    if (warmFile.methods.has('getExports')) {
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

  if (warmFile.methods.has('getSections')) {
    if (
      isJavaScriptWarmTask(warmFile) &&
      typeof file.getOutlineRanges === 'function'
    ) {
      await file.getOutlineRanges()
    }

    if (
      isMarkdownWarmTask(warmFile) &&
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
