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

export abstract class FileSystem {
  #tsConfigPath: string
  #tsConfig?: TsConfig
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

  abstract readDirectorySync(path?: string): DirectoryEntry[]

  abstract readDirectory(path?: string): Promise<DirectoryEntry[]>

  abstract readFileSync(path: string): string

  abstract readFile(path: string): Promise<string>

  abstract readFileBinarySync(path: string): Uint8Array

  abstract readFileBinary(path: string): Promise<Uint8Array>

  abstract readFileStream(path: string): FileReadableStream

  /**
   * Get the size of a file in bytes. Implementations should return `undefined`
   * if the file does not exist or the size cannot be determined.
   */
  abstract getFileByteLengthSync(path: string): number | undefined

  async getFileByteLength(path: string): Promise<number | undefined> {
    return this.getFileByteLengthSync(path)
  }

  abstract writeFileSync(
    path: string,
    content: FileSystemWriteFileContent
  ): void

  abstract writeFile(
    path: string,
    content: FileSystemWriteFileContent
  ): Promise<void>

  abstract writeFileStream(path: string): FileWritableStream

  /** Check synchronously if a file exists at the given path. */
  abstract fileExistsSync(path: string): boolean

  async fileExists(path: string): Promise<boolean> {
    return this.fileExistsSync(path)
  }

  /**
   * Get the last modified timestamp of a file or directory in milliseconds.
   * Implementations should return `undefined` if the path does not exist or
   * if the timestamp cannot be determined.
   */
  abstract getFileLastModifiedMsSync(path: string): number | undefined

  async getFileLastModifiedMs(path: string): Promise<number | undefined> {
    return this.getFileLastModifiedMsSync(path)
  }

  abstract deleteFileSync(path: string): void

  abstract deleteFile(path: string): Promise<void>

  abstract createDirectory(path: string): Promise<void>

  abstract rename(
    source: string,
    target: string,
    options?: { overwrite?: boolean }
  ): Promise<void>

  abstract copy(
    source: string,
    target: string,
    options?: { overwrite?: boolean }
  ): Promise<void>

  /** Whether compilerOptions.stripInternal is enabled in the active tsconfig. */
  shouldStripInternal(): boolean {
    if (this.#tsConfig === undefined) {
      this.#tsConfig = this.#getTsConfig()
    }
    const flag = this.#tsConfig?.compilerOptions?.stripInternal
    return Boolean(flag)
  }

  #getTsConfig(): TsConfig | undefined {
    if (!this.fileExistsSync(this.#tsConfigPath)) {
      return
    }

    const tsConfigContents = this.readFileSync(this.#tsConfigPath)

    try {
      return parseJsonWithComments<TsConfig>(tsConfigContents)
    } catch (error) {
      throw new Error('[renoun] Failed to parse tsconfig.json', {
        cause: error,
      })
    }
  }

  isFilePathExcludedFromTsConfig(filePath: string, isDirectory = false) {
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
      const tsConfig = this.#getTsConfig()

      this.#tsConfig = tsConfig

      if (Array.isArray(tsConfig?.exclude)) {
        this.#exclude = tsConfig.exclude.map(
          (pattern) => new Minimatch(pattern, { dot: true })
        )
      }
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
