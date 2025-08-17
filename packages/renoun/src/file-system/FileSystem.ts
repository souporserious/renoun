import { Minimatch } from 'minimatch'
import type { SyntaxKind, ts } from 'ts-morph'

import {
  getFileExports,
  getFileExportMetadata,
  getFileExportText,
  getFileExportStaticValue,
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
import { parseJsonWithComments } from '../utils/parse-json-with-comments.js'
import type { TypeFilter } from '../utils/resolve-type.js'
import type { DirectoryEntry } from './types.js'

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

  /** Check synchronously if a file exists at the given path. */
  abstract fileExistsSync(path: string): boolean

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
