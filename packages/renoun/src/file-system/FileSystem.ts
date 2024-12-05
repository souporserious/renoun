import { minimatch } from 'minimatch'
import type { SyntaxKind } from 'ts-morph'

import {
  getFileExports,
  getFileExportMetadata,
  resolveTypeAtLocation,
} from '../project/client.js'
import type { ProjectOptions } from '../project/types.js'
import {
  directoryName,
  joinPaths,
  relativePath,
  ensureRelativePath,
  removeAllExtensions,
  removeOrderPrefixes,
} from '../utils/path.js'
import type { SymbolFilter } from '../utils/resolve-type.js'
import type { DirectoryEntry } from './types.js'

interface FileSystemOptions {
  /** Root path to use when reading files. */
  rootPath?: string

  /** Path to the tsconfig.json file to use when analyzing types and determining if a file is excluded. */
  tsConfigPath?: string

  /** The unique identifier for the TypeScript project. */
  projectId?: string

  /** Whether or not the file system is in-memory. */
  isMemoryFileSystem?: boolean
}

export abstract class FileSystem {
  #rootPath: string
  #tsConfigPath: string
  #tsConfig?: any
  #projectOptions: ProjectOptions

  constructor(options: FileSystemOptions = {}) {
    this.#rootPath = options.rootPath || '/'
    this.#tsConfigPath = options.tsConfigPath || 'tsconfig.json'
    this.#projectOptions = {
      projectId: options.projectId,
      useInMemoryFileSystem: options.isMemoryFileSystem,
      tsConfigFilePath: options.isMemoryFileSystem
        ? undefined
        : this.#tsConfigPath,
    }
  }

  abstract getAbsolutePath(path: string): string

  getRelativePath(path: string) {
    const rootPath = ensureRelativePath(this.#rootPath)
    return relativePath(rootPath, path)
  }

  getPath(path: string, options: { basePath?: string } = {}) {
    const relativePath = this.getRelativePath(
      removeAllExtensions(removeOrderPrefixes(path))
    )
      // remove leading dot
      .replace(/^\.\//, '')
      // remove trailing slash
      .replace(/\/$/, '')

    return joinPaths('/', options.basePath, relativePath)
  }

  abstract readDirectorySync(
    path?: string,
    options?: { recursive?: boolean }
  ): DirectoryEntry[]

  abstract readDirectory(
    path?: string,
    options?: { recursive?: boolean }
  ): Promise<DirectoryEntry[]>

  abstract readFileSync(path: string): string

  abstract readFile(path: string): Promise<string>

  #getTsConfig() {
    try {
      const tsConfigContents = this.readFileSync(this.#tsConfigPath)
      try {
        const parsedTsConfig = JSON.parse(tsConfigContents)
        return parsedTsConfig
      } catch (error) {
        throw new Error('Failed to parse tsconfig.json', { cause: error })
      }
    } catch (error) {
      return null
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
      this.#tsConfig = this.#getTsConfig()
    }

    if (this.#tsConfig === null) {
      return false
    }

    if (this.#tsConfig.exclude?.length) {
      for (const exclude of this.#tsConfig.exclude) {
        if (minimatch(relativeFilePath, exclude)) {
          return true
        }
      }
    }

    return false
  }

  abstract isFilePathGitIgnored(filePath: string): boolean

  getFileExports(filePath: string) {
    return getFileExports(filePath, this.#projectOptions)
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
      this.#projectOptions
    )
  }

  resolveTypeAtLocation(
    filePath: string,
    position: number,
    kind: SyntaxKind,
    filter?: SymbolFilter
  ) {
    return resolveTypeAtLocation(
      filePath,
      position,
      kind,
      filter,
      this.#projectOptions
    )
  }
}
