import { minimatch } from 'minimatch'

import type { DirectoryEntry } from './types'

export abstract class FileSystem {
  #tsConfig?: any

  constructor(tsConfigFilePath?: string) {
    if (tsConfigFilePath) {
      this.#tsConfig = this.#getTsConfig(tsConfigFilePath)
    }
  }

  abstract readFile(path: string): Promise<string>
  abstract readDirectory(path?: string): Promise<DirectoryEntry[]>

  #getTsConfig = async (tsConfigFilePath: string) => {
    const tsConfigContents = await this.readFile(tsConfigFilePath)
    try {
      const parsedTsConfig = JSON.parse(tsConfigContents)
      return parsedTsConfig
    } catch (error) {
      throw new Error(`Failed to parse tsconfig.json`, { cause: error })
    }
  }

  isFilePathExcludedFromTsConfig(filePath: string) {
    if (!this.#tsConfig) {
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
