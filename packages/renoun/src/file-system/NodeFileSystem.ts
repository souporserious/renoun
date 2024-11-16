import { readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import ignore from 'ignore'

import { getRootDirectory } from '../utils/get-root-directory.js'
import { FileSystem } from './FileSystem.js'
import type { DirectoryEntry } from './types.js'

let ignoreManager: ReturnType<typeof ignore>

export class NodeFileSystem extends FileSystem {
  async readDirectory(
    path: string = '.',
    options?: { recursive?: boolean }
  ): Promise<DirectoryEntry[]> {
    const entries = await readdir(path, {
      recursive: options?.recursive,
      withFileTypes: true,
    })

    return entries.map((entry) => {
      let entryPath = join(path, entry.name)

      if (!entryPath.startsWith('.')) {
        entryPath = `./${entryPath}`
      }

      return {
        name: entry.name,
        path: entryPath,
        absolutePath: resolve(entryPath),
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      } satisfies DirectoryEntry
    })
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
