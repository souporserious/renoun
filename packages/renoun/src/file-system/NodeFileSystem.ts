import { readdirSync, readFileSync, existsSync, type Dirent } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { ensureRelativePath, relativePath } from '../utils/path.js'
import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.js'
import { getRootDirectory } from '../utils/get-root-directory.js'
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

  /** Asserts that the provided path is within the workspace root. */
  #assertWithinWorkspace(path: string) {
    const rootDirectory = getRootDirectory()
    const absolutePath = this.getAbsolutePath(path)
    const relativeToRoot = relativePath(rootDirectory, absolutePath)

    if (relativeToRoot.startsWith('..') || relativeToRoot.startsWith('../')) {
      throw new Error(
        `[renoun] Attempted to access a path outside of the workspace root.\n` +
          `  Workspace root: ${rootDirectory}\n` +
          `  Provided path:  ${path}\n` +
          `  Resolved path:  ${absolutePath}\n` +
          'Accessing files outside of the workspace is not allowed.'
      )
    }
  }

  getAbsolutePath(path: string): string {
    return resolve(path)
  }

  getRelativePathToWorkspace(path: string) {
    const rootDirectory = getRootDirectory()
    return relativePath(rootDirectory, this.getAbsolutePath(path))
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
    this.#assertWithinWorkspace(path)
    const entries = readdirSync(path, { withFileTypes: true })
    return this.#processDirectoryEntries(entries, path)
  }

  async readDirectory(path: string = '.'): Promise<DirectoryEntry[]> {
    this.#assertWithinWorkspace(path)
    const entries = await readdir(path, { withFileTypes: true })
    return this.#processDirectoryEntries(entries, path)
  }

  readFileSync(path: string): string {
    this.#assertWithinWorkspace(path)
    return readFileSync(path, 'utf-8')
  }

  async readFile(path: string): Promise<string> {
    this.#assertWithinWorkspace(path)
    return readFile(path, 'utf-8')
  }

  fileExistsSync(path: string): boolean {
    this.#assertWithinWorkspace(path)
    return existsSync(path)
  }

  isFilePathGitIgnored(filePath: string): boolean {
    return isFilePathGitIgnored(filePath)
  }
}
