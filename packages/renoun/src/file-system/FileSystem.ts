import { minimatch } from 'minimatch'

import type { DirectoryEntry } from './types.js'

interface FileSystemOptions {
  /** Base path to use when reading files. */
  basePath?: string

  /**
   * Path to the tsconfig.json file to use when analyzing types and determining if a file is excluded. */
  tsConfigPath?: string
}

export abstract class FileSystem {
  #basePath: string
  #tsConfigPath: string
  #tsConfig?: any

  constructor(options: FileSystemOptions = {}) {
    this.#basePath = options.basePath || '.'
    this.#tsConfigPath = options.tsConfigPath || 'tsconfig.json'
  }

  abstract readFileSync(path: string): string
  abstract readFile(path: string): Promise<string>
  abstract readDirectory(path?: string): Promise<DirectoryEntry[]>
  abstract isFilePathGitIgnored(filePath: string): boolean

  getPath() {
    return this.#basePath
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
