import { minimatch } from 'minimatch'

import { relative } from './path.js'
import type { DirectoryEntry } from './types.js'

interface FileSystemOptions {
  /** Root path to use when reading files. */
  rootPath?: string

  /** Base path to prepend to all paths. */
  basePath?: string

  /**
   * Path to the tsconfig.json file to use when analyzing types and determining if a file is excluded. */
  tsConfigPath?: string
}

export abstract class FileSystem {
  #rootPath: string
  #basePath?: string
  #tsConfigPath: string
  #tsConfig?: any

  constructor(options: FileSystemOptions = {}) {
    this.#rootPath = options.rootPath || '.'
    this.#basePath = options.basePath
    this.#tsConfigPath = options.tsConfigPath || 'tsconfig.json'
  }

  abstract readFileSync(path: string): string
  abstract readFile(path: string): Promise<string>
  abstract readDirectory(path?: string): Promise<DirectoryEntry[]>
  abstract isFilePathGitIgnored(filePath: string): boolean

  getRootPath() {
    return this.#rootPath
  }

  getBasePath() {
    return this.#basePath
  }

  getUrlPathRelativeTo(path: string) {
    const parsedPath = relative(this.getRootPath(), path)
      // remove leading dot
      .replace(/^\.\//, '')
      // remove trailing slash
      .replace(/\/$/, '')
    const basePath = this.getBasePath()

    if (basePath) {
      return `/${basePath}/${parsedPath}`
    }

    return `/${parsedPath}`
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
}
