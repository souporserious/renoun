import { readdirSync, readFileSync, type Dirent } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import ignore from 'ignore'

import { getRootDirectory } from '../utils/get-root-directory.js'
import { ensureRelativePath } from '../utils/path.js'
import { FileSystem, type FileSystemOptions } from './FileSystem.js'
import type { DirectoryEntry } from './types.js'

let ignoreManager: ReturnType<typeof ignore>

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
    const relativePath = relative(getRootDirectory(), filePath)

    if (!ignoreManager) {
      const gitignorePatterns = getGitIgnorePatterns()
      ignoreManager = ignore().add(gitignorePatterns)
    }

    return ignoreManager.ignores(relativePath)
  }
}

function getGitIgnorePatterns(): string[] {
  const gitignorePath = join(getRootDirectory(), '.gitignore')

  try {
    const gitignoreContent = readFileSync(gitignorePath, 'utf-8')

    return (
      gitignoreContent
        .split('\n')
        .map((line) => line.trim())
        // Filter out comments and empty lines
        .filter((line) => line && !line.startsWith('#'))
    )
  } catch (error) {
    // If .gitignore is not found, return an empty array
    return []
  }
}
