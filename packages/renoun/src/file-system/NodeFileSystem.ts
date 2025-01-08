import { readdirSync, readFileSync, type Dirent } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { ensureRelativePath } from '../utils/path.js'
import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.js'
import { FileSystem, type FileSystemOptions } from './FileSystem.js'
import type { DirectoryEntry } from './types.js'

export class NodeFileSystem extends FileSystem {
  #tsConfigPath: string

  constructor(options: FileSystemOptions = {}) {
    super(options)
    this.#tsConfigPath = options.tsConfigPath || 'tsconfig.json'
  }

  getProjectOptions() {
    return {
      tsConfigFilePath: this.#tsConfigPath,
    }
  }

  getAbsolutePath(path: string): string {
    return resolve(path)
  }

  #processDirectoryEntries(
    entries: Dirent[],
    basePath: string
  ): DirectoryEntry[] {
    const directoryEntries: DirectoryEntry[] = []

    for (const entry of entries) {
      const entryPath = join(basePath, entry.name)

      directoryEntries.push({
        name: entry.name,
        path: ensureRelativePath(entryPath),
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      } satisfies DirectoryEntry)
    }

    return directoryEntries
  }

  readDirectorySync(path: string = '.'): DirectoryEntry[] {
    const entries = readdirSync(path, { withFileTypes: true })
    return this.#processDirectoryEntries(entries, path)
  }

  async readDirectory(path: string = '.'): Promise<DirectoryEntry[]> {
    const entries = await readdir(path, { withFileTypes: true })
    return this.#processDirectoryEntries(entries, path)
  }

  readFileSync(path: string): string {
    return readFileSync(path, 'utf-8')
  }

  async readFile(path: string): Promise<string> {
    return readFile(path, 'utf-8')
  }

  isFilePathGitIgnored(filePath: string): boolean {
    return isFilePathGitIgnored(filePath)
  }
}
