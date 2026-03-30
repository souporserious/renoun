import { resolve } from 'node:path'
import { Minimatch } from 'minimatch'
import type { SyntaxKind, ts } from '../utils/ts-morph.ts'

import {
  getFileExports,
  getFileExportMetadata,
  getFileExportText,
  getFileExportStaticValue,
  getOutlineRanges,
  getReferenceBaseArtifact,
  getReferenceResolvedTypesArtifact,
  getReferenceSectionsArtifact,
  readFreshReferenceBaseArtifact,
  resolveFileExportsWithDependencies,
  resolveTypeAtLocation,
  resolveTypeAtLocationWithDependencies,
} from '../analysis/node-client.ts'
import type { AnalysisOptions } from '../analysis/types.ts'
import type { SlugCasing } from '@renoun/mdx'
import {
  directoryName,
  joinPaths,
  pathLikeToString,
  relativePath,
  removeAllExtensions,
  removeOrderPrefixes,
  trimLeadingDotSlash,
  trimTrailingSlashes,
  type PathLike,
} from '../utils/path.ts'
import { parseJsonWithComments } from '../utils/parse-json-with-comments.ts'
import type { TypeFilter } from '../utils/resolve-type.ts'
import type { ResolvedFileExportsResult } from '../utils/resolve-file-exports.ts'
import type {
  JavaScriptFileReferenceBaseData,
  JavaScriptFileResolvedTypesData,
} from './reference-artifacts.ts'
import type { Section } from './types.ts'
import type { DirectoryEntry } from './types.ts'

export type FileSystemWriteFileContent =
  | string
  | Uint8Array
  | ArrayBuffer
  | ArrayBufferView

export type FileReadableStream = ReadableStream<Uint8Array>

export type FileWritableStream = WritableStream<Uint8Array>

export interface SyncFileSystem {
  readDirectorySync(path?: string): DirectoryEntry[]
  readFileSync(path: string): string
  readFileBinarySync(path: string): Uint8Array
  readFileStream(path: string): FileReadableStream
  /**
   * Get the size of a file in bytes. Implementations should return `undefined`
   * if the file does not exist or the size cannot be determined.
   */
  getFileByteLengthSync(path: string): number | undefined
  /** Check synchronously if a file exists at the given path. */
  fileExistsSync(path: string): boolean
  /**
   * Get the last modified timestamp of a file or directory in milliseconds.
   * Implementations should return `undefined` if the path does not exist or
   * if the timestamp cannot be determined.
   */
  getFileLastModifiedMsSync(path: string): number | undefined
}

export interface AsyncFileSystem {
  readDirectory(path?: string): Promise<DirectoryEntry[]>
  readFile(path: string): Promise<string>
  readFileBinary(path: string): Promise<Uint8Array>
  readFileStream(path: string): FileReadableStream
  /**
   * Get the size of a file in bytes. Implementations should return `undefined`
   * if the file does not exist or the size cannot be determined.
   */
  getFileByteLength(path: string): Promise<number | undefined>
  /** Check if a file exists at the given path. */
  fileExists(path: string): Promise<boolean>
  /**
   * Get the last modified timestamp of a file or directory in milliseconds.
   * Implementations should return `undefined` if the path does not exist or
   * if the timestamp cannot be determined.
   */
  getFileLastModifiedMs(path: string): Promise<number | undefined>
}

export interface WritableFileSystem {
  writeFileSync(path: string, content: FileSystemWriteFileContent): void
  writeFile(path: string, content: FileSystemWriteFileContent): Promise<void>
  writeFileStream(path: string): FileWritableStream
  deleteFileSync(path: string): void
  deleteFile(path: string): Promise<void>
  createDirectory(path: string): Promise<void>
  rename(
    source: string,
    target: string,
    options?: { overwrite?: boolean }
  ): Promise<void>
  copy(
    source: string,
    target: string,
    options?: { overwrite?: boolean }
  ): Promise<void>
}

export type FileSystem = BaseFileSystem &
  SyncFileSystem &
  AsyncFileSystem &
  WritableFileSystem

export interface FileSystemOptions {
  /** Path to the tsconfig.json file to use when analyzing types and determining if a file is excluded. */
  tsConfigPath?: string

  /** Optional base directory for persisted cache files. */
  outputDirectory?: string
}

export interface TsConfig {
  compilerOptions?: ts.CompilerOptions
  include?: string[]
  exclude?: string[]
  extends?: string
  references?: { path: string }[]
  files?: string[]
  [key: string]: unknown
}

export abstract class BaseFileSystem {
  #tsConfigPath: string
  #tsConfig?: TsConfig
  #tsConfigPromise?: Promise<TsConfig | undefined>
  #exclude?: Minimatch[]
  readonly outputDirectory?: string

  /**
   * Optional workspace change token used for fast cache revalidation.
   *
   * Implementations should return a deterministic token for a scoped root path
   * or `null` when a token cannot be produced.
   */
  getWorkspaceChangeToken?(rootPath: string): Promise<string | null>

  /**
   * Optional stable identity used to scope persistent cache keys for different
   * file-system backends that may expose the same workspace-relative paths.
   */
  getCacheIdentity?(): unknown

  /**
   * Optional hint indicating whether persisted cache entries are deterministic
   * for the current file-system state.
   *
   * Returning `false` allows callers to skip persistence for cache domains that
   * cannot be safely revalidated (for example moving branch refs).
   */
  isPersistentCacheDeterministic?(): boolean

  /**
   * Optional changed-path resolver used when a workspace token changes.
   *
   * Implementations should return workspace-relative POSIX paths that changed
   * since `previousToken`, scoped to `rootPath`. Return `null` when the change
   * set cannot be determined.
   */
  getWorkspaceChangedPathsSinceToken?(
    rootPath: string,
    previousToken: string
  ): Promise<readonly string[] | null>

  /**
   * Whether this file system should use persistent cache by default.
   *
   * Implementations that represent real and stable storage (for example local
   * disk or git-backed stores) should return `true`. In-memory implementations
   * should return `false`.
   */
  usesPersistentCacheByDefault(): boolean {
    return false
  }

  supportsServerManagedReferenceArtifacts(): boolean {
    return false
  }

  /**
   * Whether directory `mtime` signatures should be tracked for snapshot
   * dependency validation in non-strict hermetic mode.
   */
  usesDirectoryMtimeSnapshotDependencies(): boolean {
    return false
  }

  /**
   * Whether persisted snapshot file dependencies should be validated in
   * non-strict hermetic mode.
   */
  validatesPersistedFileDependenciesByDefault(): boolean {
    return false
  }

  constructor(options: FileSystemOptions = {}) {
    this.#tsConfigPath = options.tsConfigPath || 'tsconfig.json'
    this.outputDirectory =
      typeof options.outputDirectory === 'string' &&
      options.outputDirectory.trim() !== ''
        ? resolve(options.outputDirectory)
        : undefined
  }

  /** Stable analysis metadata used for cache partitioning and snapshot identity. */
  abstract getAnalysisCacheMetadata(): AnalysisOptions

  /**
   * Optional stable analysis scope identity for cache partitioning.
   *
   * Prefer this over reading raw analysis metadata directly.
   */
  getAnalysisScopeId(): string | undefined {
    return this.getAnalysisCacheMetadata().analysisScopeId
  }

  /**
   * Prepare a file path for analysis.
   *
   * Backends may rewrite `filePath` and/or return backend-specific analysis
   * options. Callers that need direct node-client access should use this.
   */
  async prepareAnalysis(filePath: string): Promise<{
    filePath: string
    analysisOptions: AnalysisOptions
  }> {
    return {
      filePath,
      analysisOptions: this.getAnalysisCacheMetadata(),
    }
  }

  abstract getAbsolutePath(path: string): string

  abstract getRelativePathToWorkspace(path: string): string

  getPathname(
    path: PathLike,
    options: { basePath?: string; rootPath?: string } = {}
  ) {
    const normalizedPath = pathLikeToString(path)
    const rootRelativePath = options.rootPath
      ? relativePath(options.rootPath, normalizedPath)
      : normalizedPath

    if (rootRelativePath === '') {
      return joinPaths('/', options.basePath)
    }

    const resolvedPath = trimTrailingSlashes(
      trimLeadingDotSlash(
        removeAllExtensions(removeOrderPrefixes(rootRelativePath))
      )
    )

    return joinPaths('/', options.basePath, resolvedPath)
  }

  /** Whether compilerOptions.stripInternal is enabled in the active tsconfig. */
  shouldStripInternal(): boolean {
    const syncFileSystem = getSyncFileSystem(this)
    if (!syncFileSystem) {
      return false
    }
    if (this.#tsConfig === undefined) {
      this.#tsConfig = this.#getTsConfig(syncFileSystem)
    }
    const flag = this.#tsConfig?.compilerOptions?.stripInternal
    return Boolean(flag)
  }

  async shouldStripInternalAsync(): Promise<boolean> {
    const asyncFileSystem = getAsyncFileSystem(this)
    if (asyncFileSystem) {
      const tsConfig = await this.#getTsConfigAsync(asyncFileSystem)
      return Boolean(tsConfig?.compilerOptions?.stripInternal)
    }

    return this.shouldStripInternal()
  }

  #getTsConfig(syncFileSystem: SyncFileSystem): TsConfig | undefined {
    if (!syncFileSystem.fileExistsSync(this.#tsConfigPath)) {
      return
    }

    const tsConfigContents = syncFileSystem.readFileSync(this.#tsConfigPath)

    try {
      return parseJsonWithComments<TsConfig>(tsConfigContents)
    } catch (error) {
      throw new Error('[renoun] Failed to parse tsconfig.json', {
        cause: error,
      })
    }
  }

  async #getTsConfigAsync(
    asyncFileSystem: AsyncFileSystem
  ): Promise<TsConfig | undefined> {
    if (this.#tsConfig !== undefined) {
      return this.#tsConfig
    }

    if (this.#tsConfigPromise) {
      return this.#tsConfigPromise
    }

    const loadPromise = (async () => {
      const exists = await asyncFileSystem.fileExists(this.#tsConfigPath)
      if (!exists) {
        return undefined
      }

      const tsConfigContents = await asyncFileSystem.readFile(
        this.#tsConfigPath
      )

      try {
        return parseJsonWithComments<TsConfig>(tsConfigContents)
      } catch (error) {
        throw new Error('[renoun] Failed to parse tsconfig.json', {
          cause: error,
        })
      }
    })()

    this.#tsConfigPromise = loadPromise

    try {
      const result = await loadPromise
      this.#tsConfig = result
      return result
    } finally {
      if (this.#tsConfigPromise === loadPromise) {
        this.#tsConfigPromise = undefined
      }
    }
  }

  #ensureExcludeMatchers(tsConfig?: TsConfig) {
    if (this.#exclude !== undefined) {
      return
    }

    if (Array.isArray(tsConfig?.exclude)) {
      this.#exclude = tsConfig.exclude.map(
        (pattern) => new Minimatch(pattern, { dot: true })
      )
    }
  }

  isFilePathExcludedFromTsConfig(filePath: string, isDirectory = false) {
    const syncFileSystem = getSyncFileSystem(this)
    if (!syncFileSystem) {
      return false
    }
    const absoluteFilePath = this.getAbsolutePath(filePath)
    const absoluteTsConfigDirectory = directoryName(
      this.getAbsolutePath(this.#tsConfigPath)
    )
    let relativeFilePath = relativePath(
      absoluteTsConfigDirectory,
      absoluteFilePath
    )

    if (isDirectory) {
      relativeFilePath = joinPaths(relativeFilePath, '/')
    }

    if (this.#tsConfig === undefined) {
      const tsConfig = this.#getTsConfig(syncFileSystem)

      this.#tsConfig = tsConfig

      this.#ensureExcludeMatchers(tsConfig)
    }

    if (this.#exclude) {
      for (const matcher of this.#exclude) {
        if (matcher.match(relativeFilePath)) {
          return true
        }
      }
    }

    return false
  }

  async isFilePathExcludedFromTsConfigAsync(
    filePath: string,
    isDirectory = false
  ): Promise<boolean> {
    const asyncFileSystem = getAsyncFileSystem(this)
    if (!asyncFileSystem) {
      return this.isFilePathExcludedFromTsConfig(filePath, isDirectory)
    }

    const absoluteFilePath = this.getAbsolutePath(filePath)
    const absoluteTsConfigDirectory = directoryName(
      this.getAbsolutePath(this.#tsConfigPath)
    )
    let relativeFilePath = relativePath(
      absoluteTsConfigDirectory,
      absoluteFilePath
    )

    if (isDirectory) {
      relativeFilePath = joinPaths(relativeFilePath, '/')
    }

    if (this.#tsConfig === undefined) {
      const tsConfig = await this.#getTsConfigAsync(asyncFileSystem)
      this.#tsConfig = tsConfig
      this.#ensureExcludeMatchers(tsConfig)
    } else {
      this.#ensureExcludeMatchers(this.#tsConfig)
    }

    if (this.#exclude) {
      for (const matcher of this.#exclude) {
        if (matcher.match(relativeFilePath)) {
          return true
        }
      }
    }

    return false
  }

  abstract isFilePathGitIgnored(filePath: string): boolean

  getFileExports(filePath: string) {
    return this.prepareAnalysis(filePath).then(
      async ({ filePath: preparedFilePath, analysisOptions }) => {
        if (this.supportsServerManagedReferenceArtifacts()) {
          return (
            await getReferenceBaseArtifact(
              preparedFilePath,
              false,
              analysisOptions
            )
          ).exportMetadata
        }

        return getFileExports(preparedFilePath, analysisOptions)
      }
    )
  }

  readFreshReferenceBaseArtifact(filePath: string, stripInternal: boolean) {
    return this.prepareAnalysis(filePath).then(
      ({ filePath: preparedFilePath, analysisOptions }) =>
        readFreshReferenceBaseArtifact(
          preparedFilePath,
          stripInternal,
          analysisOptions
        )
    )
  }

  getCachedReferenceBaseArtifact(filePath: string, stripInternal: boolean) {
    return this.prepareAnalysis(filePath).then(
      ({ filePath: preparedFilePath, analysisOptions }) =>
        getReferenceBaseArtifact(
          preparedFilePath,
          stripInternal,
          analysisOptions
        )
    ) as Promise<JavaScriptFileReferenceBaseData>
  }

  getCachedReferenceResolvedTypesArtifact(filePath: string) {
    return this.prepareAnalysis(filePath).then(
      ({ filePath: preparedFilePath, analysisOptions }) =>
        getReferenceResolvedTypesArtifact(preparedFilePath, analysisOptions)
    ) as Promise<JavaScriptFileResolvedTypesData>
  }

  getCachedReferenceSectionsArtifact(
    filePath: string,
    options: {
      stripInternal: boolean
      slugCasing: SlugCasing
    }
  ) {
    return this.prepareAnalysis(filePath).then(
      ({ filePath: preparedFilePath, analysisOptions }) =>
        getReferenceSectionsArtifact(
          preparedFilePath,
          options,
          analysisOptions
        )
    ) as Promise<Section[]>
  }

  resolveFileExportsWithDependencies(
    filePath: string,
    filter?: TypeFilter
  ): Promise<ResolvedFileExportsResult> {
    return this.prepareAnalysis(filePath).then(
      ({ filePath: preparedFilePath, analysisOptions }) =>
        resolveFileExportsWithDependencies(
          preparedFilePath,
          filter,
          analysisOptions
        )
    )
  }

  getFileExportMetadata(
    name: string,
    filePath: string,
    position: number,
    kind: SyntaxKind
  ) {
    return this.prepareAnalysis(filePath).then(
      ({ filePath: preparedFilePath, analysisOptions }) =>
        getFileExportMetadata(
          name,
          preparedFilePath,
          position,
          kind,
          analysisOptions
        )
    )
  }

  getFileExportText(
    filePath: string,
    position: number,
    kind: SyntaxKind,
    includeDependencies?: boolean
  ) {
    return this.prepareAnalysis(filePath).then(
      ({ filePath: preparedFilePath, analysisOptions }) =>
        getFileExportText(
          preparedFilePath,
          position,
          kind,
          includeDependencies,
          analysisOptions
        )
    )
  }

  getOutlineRanges(filePath: string) {
    return this.prepareAnalysis(filePath).then(
      ({ filePath: preparedFilePath, analysisOptions }) =>
        getOutlineRanges(preparedFilePath, analysisOptions)
    )
  }

  async getFoldingRanges(filePath: string) {
    return this.getOutlineRanges(filePath).then((outlineRanges) => {
      // filter out single-line ranges
      return outlineRanges.filter(
        (range) => range.position.end.line > range.position.start.line
      )
    })
  }

  async getFileExportStaticValue(
    filePath: string,
    position: number,
    kind: SyntaxKind
  ) {
    return this.prepareAnalysis(filePath).then(
      ({ filePath: preparedFilePath, analysisOptions }) =>
        getFileExportStaticValue(
          preparedFilePath,
          position,
          kind,
          analysisOptions
        )
    )
  }

  resolveTypeAtLocationWithDependencies(
    filePath: string,
    position: number,
    kind: SyntaxKind,
    filter?: TypeFilter
  ) {
    return this.prepareAnalysis(filePath).then(
      ({ filePath: preparedFilePath, analysisOptions }) =>
        resolveTypeAtLocationWithDependencies(
          preparedFilePath,
          position,
          kind,
          filter,
          analysisOptions
        )
    )
  }

  /** @deprecated Use `resolveTypeAtLocationWithDependencies` for dependency-aware results. */
  resolveTypeAtLocation(
    filePath: string,
    position: number,
    kind: SyntaxKind,
    filter?: TypeFilter
  ) {
    return this.prepareAnalysis(filePath).then(
      ({ filePath: preparedFilePath, analysisOptions }) =>
        resolveTypeAtLocation(
          preparedFilePath,
          position,
          kind,
          filter,
          analysisOptions
        )
    )
  }
}

function getSyncFileSystem(
  fileSystem: BaseFileSystem
): (BaseFileSystem & SyncFileSystem) | null {
  const candidate = fileSystem as Partial<SyncFileSystem>
  if (
    typeof candidate.fileExistsSync !== 'function' ||
    typeof candidate.readFileSync !== 'function'
  ) {
    return null
  }
  return fileSystem as BaseFileSystem & SyncFileSystem
}

function getAsyncFileSystem(
  fileSystem: BaseFileSystem
): (BaseFileSystem & AsyncFileSystem) | null {
  const candidate = fileSystem as Partial<AsyncFileSystem>
  if (
    typeof candidate.fileExists !== 'function' ||
    typeof candidate.readFile !== 'function'
  ) {
    return null
  }
  return fileSystem as BaseFileSystem & AsyncFileSystem
}
