import { cpus } from 'node:os'
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
} from 'node:path'
import { getMDXSections, getMarkdownSections } from '@renoun/mdx/utils'

import { CacheStore } from '../../file-system/Cache.ts'
import { getCacheStorePersistence } from '../../file-system/CacheSqlite.ts'
import {
  FS_ANALYSIS_CACHE_VERSION,
  createCacheNodeKey,
} from '../../file-system/cache-key.ts'
import { NodeFileSystem } from '../../file-system/NodeFileSystem.ts'
import { Repository } from '../../file-system/Repository.ts'
import { FileSystemSnapshot } from '../../file-system/Snapshot.ts'
import { getFileExports, getOutlineRanges } from '../../analysis/node-client.ts'
import type { AnalysisOptions } from '../../analysis/types.ts'
import { getRootDirectory } from '../../utils/get-root-directory.ts'
import { forEachConcurrent } from '../../utils/concurrency.ts'
import { getDebugLogger } from '../../utils/debug.ts'
import { isJavaScriptLikeExtension } from '../../utils/is-javascript-like-extension.ts'
import { normalizePathKey } from '../../utils/path.ts'
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

type WarmFileMethod = 'getExports' | 'getSections'

interface WarmFileTask {
  absolutePath: string
  extension: string
  methods: Set<WarmFileMethod>
}

interface WarmRenounPrewarmTargetsOptions {
  analysisOptions?: AnalysisOptions
  isFilePathGitIgnored: (filePath: string) => boolean
}

export async function warmRenounPrewarmTargets(
  targets: RenounPrewarmTargets,
  options: WarmRenounPrewarmTargetsOptions
): Promise<void> {
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
    return
  }

  logger.debug('Prewarming renoun cache targets', () => ({
    data: {
      files: warmFilesByPath.size,
      exportHistories: targets.exportHistory.length,
    },
  }))

  await Promise.all([
    warmFilesByPath.size > 0
      ? warmFiles(Array.from(warmFilesByPath.values()), {
          analysisOptions: options.analysisOptions,
          fileSystem,
          logger,
        })
      : Promise.resolve(),
    targets.exportHistory.length > 0
      ? warmExportHistoryRequests(targets.exportHistory, { logger })
      : Promise.resolve(),
  ])

  logger.debug('Finished prewarming renoun cache targets')
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

          const methods = determineWarmMethods(extension)
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

        const methods = determineWarmMethods(extension)
        if (methods.size === 0) {
          return
        }

        mergeWarmTask(
          {
            absolutePath: filePath,
            extension,
            methods,
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
    if (uniqueTargets.has(key)) {
      continue
    }

    uniqueTargets.set(key, request)
  }

  return uniqueTargets
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

function determineWarmMethods(extension: string): Set<WarmFileMethod> {
  const methods = new Set<WarmFileMethod>()

  if (isJavaScriptLikeExtension(extension)) {
    methods.add('getExports')
    methods.add('getSections')
    return methods
  }

  if (extension === 'mdx' || extension === 'md') {
    methods.add('getSections')
    return methods
  }

  return methods
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
}

async function warmFiles(
  warmFiles: WarmFileTask[],
  options: {
    analysisOptions?: AnalysisOptions
    fileSystem: NodeFileSystem
    logger: ReturnType<typeof getDebugLogger>
  }
): Promise<void> {
  const runtimeSectionsStore = createRuntimeSectionsWarmStore(
    options.fileSystem
  )

  await forEachConcurrent(
    warmFiles,
    {
      concurrency: PREWARM_FILE_CACHE_CONCURRENCY,
    },
    async (warmFile) => {
      if (warmFile.methods.has('getExports')) {
        try {
          await getFileExports(warmFile.absolutePath, options.analysisOptions)
        } catch (error) {
          options.logger.warn(
            'Skipping renoun getFileExports prewarm target',
            () => ({
              data: {
                filePath: warmFile.absolutePath,
                error: formatPrewarmError(error),
              },
            })
          )
        }
      }

      if (warmFile.methods.has('getSections')) {
        if (isJavaScriptLikeExtension(warmFile.extension)) {
          try {
            await getOutlineRanges(
              warmFile.absolutePath,
              options.analysisOptions
            )
          } catch (error) {
            options.logger.warn(
              'Skipping renoun getOutlineRanges prewarm target',
              () => ({
                data: {
                  filePath: warmFile.absolutePath,
                  error: formatPrewarmError(error),
                },
              })
            )
          }
        } else if (
          warmFile.extension === 'md' ||
          warmFile.extension === 'mdx'
        ) {
          try {
            const warmedRuntimeSections =
              await warmMarkdownSectionsThroughRuntimeCacheStore(
                warmFile,
                runtimeSectionsStore,
                options.fileSystem
              )
            if (!warmedRuntimeSections) {
              const source = await options.fileSystem.readFile(
                warmFile.absolutePath
              )
              if (warmFile.extension === 'md') {
                getMarkdownSections(source)
              } else {
                getMDXSections(source)
              }
            }
          } catch (error) {
            options.logger.warn(
              'Skipping renoun markdown sections prewarm target',
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
    }
  )
}

async function drainExportHistory(
  generator: ReturnType<Repository['getExportHistory']>
): Promise<void> {
  let result = await generator.next()
  while (!result.done) {
    result = await generator.next()
  }
}

function formatPrewarmError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function createRuntimeSectionsWarmStore(fileSystem: NodeFileSystem):
  | {
      store: CacheStore
      snapshotId: string
    }
  | undefined {
  try {
    const snapshot = new FileSystemSnapshot(fileSystem)
    const projectRoot = resolvePrewarmProjectRoot(fileSystem)
    const persistence = projectRoot
      ? getCacheStorePersistence({ projectRoot })
      : getCacheStorePersistence()

    return {
      store: new CacheStore({
        snapshot,
        persistence,
      }),
      snapshotId: snapshot.id,
    }
  } catch {
    return undefined
  }
}

function resolvePrewarmProjectRoot(
  fileSystem: NodeFileSystem
): string | undefined {
  try {
    return getRootDirectory(fileSystem.getAbsolutePath('.'))
  } catch {
    return undefined
  }
}

function createSectionsCacheNodeKey(
  filePath: string,
  extension: 'md' | 'mdx',
  snapshotId: string
): string {
  return createCacheNodeKey(`${extension}.sections`, {
    version: FS_ANALYSIS_CACHE_VERSION,
    snapshot: snapshotId,
    filePath: normalizePathKey(filePath),
  })
}

async function warmMarkdownSectionsThroughRuntimeCacheStore(
  warmFile: WarmFileTask,
  runtimeSectionsStore:
    | {
        store: CacheStore
        snapshotId: string
      }
    | undefined,
  fileSystem: NodeFileSystem
): Promise<boolean> {
  if (
    !runtimeSectionsStore ||
    (warmFile.extension !== 'md' && warmFile.extension !== 'mdx')
  ) {
    return false
  }

  try {
    const nodeKey = createSectionsCacheNodeKey(
      warmFile.absolutePath,
      warmFile.extension,
      runtimeSectionsStore.snapshotId
    )
    await runtimeSectionsStore.store.getOrCompute(
      nodeKey,
      { persist: true },
      async (ctx) => {
        await ctx.recordFileDep(warmFile.absolutePath)
        const source = await fileSystem.readFile(warmFile.absolutePath)
        return warmFile.extension === 'mdx'
          ? getMDXSections(source)
          : getMarkdownSections(source)
      }
    )
    return true
  } catch {
    return false
  }
}
