import { minimatch } from 'minimatch'

import {
  getFileExports,
  getFileExportMetadata,
  resolveTypeAtLocation,
} from '../project/client.js'
import type { ProjectOptions } from '../project/types.js'
import {
  join,
  relative,
  ensureRelativePath,
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

  /** Whether the file system is virtual. */
  isVirtualFileSystem?: boolean
}

export abstract class FileSystem {
  #rootPath: string
  #tsConfigPath: string
  #tsConfig?: any
  #projectOptions: ProjectOptions

  constructor(options: FileSystemOptions = {}) {
    this.#rootPath = options.rootPath || '.'
    this.#tsConfigPath = options.tsConfigPath || 'tsconfig.json'
    this.#projectOptions = {
      projectId: options.projectId,
      useInMemoryFileSystem: options.isVirtualFileSystem,
      tsConfigFilePath: options.isVirtualFileSystem
        ? undefined
        : this.#tsConfigPath,
    }
  }

  abstract getAbsolutePath(path: string): string
  abstract readFileSync(path: string): string
  abstract readFile(path: string): Promise<string>
  abstract readDirectory(
    path?: string,
    options?: { recursive?: boolean }
  ): Promise<DirectoryEntry[]>
  abstract isFilePathGitIgnored(filePath: string): boolean

  getRootPath() {
    return ensureRelativePath(this.#rootPath)
  }

  getPathRelativeTo(path: string, options: { basePath?: string } = {}) {
    const rootPath = this.getRootPath()
    const relativePath = relative(rootPath, removeOrderPrefixes(path))
      // remove leading dot
      .replace(/^\.\//, '')
      // remove trailing slash
      .replace(/\/$/, '')

    return join('/', options.basePath, relativePath)
  }

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

  isFilePathExcludedFromTsConfig(filePath: string) {
    if (this.#tsConfig === undefined) {
      this.#tsConfig = this.#getTsConfig()
    }

    if (this.#tsConfig === null) {
      return false
    }

    if (this.#tsConfig.exclude?.length) {
      for (const exclude of this.#tsConfig.exclude) {
        if (minimatch(filePath, exclude)) {
          return true
        }
      }
    }

    return false
  }

  getFileExports(filePath: string) {
    return getFileExports(filePath, this.#projectOptions)
  }

  getFileExportMetadata(filePath: string, name: string, position: number) {
    return getFileExportMetadata(filePath, name, position, this.#projectOptions)
  }

  resolveTypeAtLocation(
    filePath: string,
    position: number,
    filter?: SymbolFilter
  ) {
    return resolveTypeAtLocation(
      filePath,
      position,
      filter,
      this.#projectOptions
    )
  }
}
