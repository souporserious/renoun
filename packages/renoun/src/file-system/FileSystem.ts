import { Minimatch } from 'minimatch'
import type { SyntaxKind } from 'ts-morph'

import {
  getFileExports,
  getFileExportMetadata,
  getFileExportText,
  resolveTypeAtLocation,
} from '../project/client.js'
import type { ProjectOptions } from '../project/types.js'
import {
  directoryName,
  joinPaths,
  relativePath,
  removeAllExtensions,
  removeOrderPrefixes,
} from '../utils/path.js'
import type { SymbolFilter } from '../utils/resolve-type.js'
import type { DirectoryEntry } from './types.js'

export interface FileSystemOptions {
  /** Path to the tsconfig.json file to use when analyzing types and determining if a file is excluded. */
  tsConfigPath?: string
}

export abstract class FileSystem {
  #tsConfigPath: string
  #tsConfig?: Record<string, unknown>
  #exclude?: Minimatch[]

  constructor(options: FileSystemOptions = {}) {
    this.#tsConfigPath = options.tsConfigPath || 'tsconfig.json'
  }

  abstract getProjectOptions(): ProjectOptions

  abstract getAbsolutePath(path: string): string

  abstract getRelativePathToWorkspace(path: string): string

  getPathname(
    path: string,
    options: { basePath?: string; rootPath?: string } = {}
  ) {
    const rootRelativePath = options.rootPath
      ? relativePath(options.rootPath, path)
      : path

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

  #getTsConfig() {
    try {
      const tsConfigContents = this.readFileSync(this.#tsConfigPath)
      try {
        const parsedTsConfig = JSON.parse(tsConfigContents) as Record<
          string,
          unknown
        >
        return parsedTsConfig
      } catch (error) {
        throw new Error('Failed to parse tsconfig.json', { cause: error })
      }
    } catch (error) {
      return
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
          (pattern: string) => new Minimatch(pattern, { dot: true })
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
      this.getProjectOptions()
    )
  }
}
