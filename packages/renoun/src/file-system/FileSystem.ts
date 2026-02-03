import { Minimatch } from 'minimatch'
import type { SyntaxKind, ts } from '../utils/ts-morph.ts'

import {
  getFileExports,
  getFileExportMetadata,
  getFileExportText,
  getFileExportStaticValue,
  getOutlineRanges,
  resolveTypeAtLocation,
} from '../project/client.ts'
import type { ProjectOptions } from '../project/types.ts'
import {
  directoryName,
  joinPaths,
  pathLikeToString,
  relativePath,
  removeAllExtensions,
  removeOrderPrefixes,
  type PathLike,
} from '../utils/path.ts'
import { parseJsonWithComments } from '../utils/parse-json-with-comments.ts'
import type { TypeFilter } from '../utils/resolve-type.ts'
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

  constructor(options: FileSystemOptions = {}) {
    this.#tsConfigPath = options.tsConfigPath || 'tsconfig.json'
  }

  abstract getProjectOptions(): ProjectOptions

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

    const resolvedPath = removeAllExtensions(
      removeOrderPrefixes(rootRelativePath)
    )
      // remove leading dot
      .replace(/^\.\//, '')
      // remove trailing slash
      .replace(/\/$/, '')

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
    return getFileExports(filePath, this.getProjectOptions())
  }

  getFileExportMetadata(
    name: string,
    filePath: string,
    position: number,
    kind: SyntaxKind
  ) {
    return getFileExportMetadata(
      name,
      filePath,
      position,
      kind,
      this.getProjectOptions()
    )
  }

  getFileExportText(
    filePath: string,
    position: number,
    kind: SyntaxKind,
    includeDependencies?: boolean
  ) {
    return getFileExportText(
      filePath,
      position,
      kind,
      includeDependencies,
      this.getProjectOptions()
    )
  }

  getOutlineRanges(filePath: string) {
    return getOutlineRanges(filePath, this.getProjectOptions())
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
    return getFileExportStaticValue(
      filePath,
      position,
      kind,
      this.getProjectOptions()
    )
  }

  resolveTypeAtLocation(
    filePath: string,
    position: number,
    kind: SyntaxKind,
    filter?: TypeFilter
  ) {
    return resolveTypeAtLocation(
      filePath,
      position,
      kind,
      filter,
      this.getProjectOptions()
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
