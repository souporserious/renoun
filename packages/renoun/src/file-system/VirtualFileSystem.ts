import ignore from 'ignore'

import { createSourceFile, transpileSourceFile } from '../project/client.js'
import { joinPaths } from '../utils/path.js'
import { isJavaScriptLikeExtension } from './is-javascript-like-extension.js'
import { FileSystem } from './FileSystem.js'
import type { DirectoryEntry } from './types.js'

/** A virtual file system that stores files in memory. */
export class VirtualFileSystem extends FileSystem {
  #projectId: string
  #files: Map<string, string>
  #ignore: ReturnType<typeof ignore> | undefined

  constructor(files: { [path: string]: string }) {
    const projectId = generateProjectId()

    super({
      projectId,
      isVirtualFileSystem: true,
    })

    this.#projectId = projectId
    this.#files = new Map(
      Object.entries(files).map(([path, content]) => [
        path.startsWith('.') ? path : `./${path}`,
        content,
      ])
    )

    // Create a TypeScript source file for each file
    for (const [path, content] of this.#files) {
      const extension = path.split('.').at(-1)
      if (extension && isJavaScriptLikeExtension(extension)) {
        createSourceFile(path, content, {
          projectId: projectId,
          useInMemoryFileSystem: true,
        })
      }
    }
  }

  transpileFile(path: string) {
    return transpileSourceFile(path, {
      projectId: this.#projectId,
      useInMemoryFileSystem: true,
    })
  }

  getAbsolutePath(path: string) {
    if (path.startsWith('/')) {
      return path
    }
    if (path.startsWith('./')) {
      return path.slice(1)
    }
    return joinPaths('/', path)
  }

  getFiles() {
    return this.#files
  }

  readDirectorySync(path: string = '.'): DirectoryEntry[] {
    if (!path.startsWith('.')) {
      path = `./${path}`
    }

    const entries: DirectoryEntry[] = []
    const directories = new Set<string>()

    for (const filePath of this.#files.keys()) {
      if (filePath.startsWith(path)) {
        let relativePath = filePath.slice(path.length)

        if (relativePath.startsWith('/')) {
          relativePath = relativePath.slice(1)
        }

        const segments = relativePath.split('/').filter(Boolean)

        if (segments.length === 0) {
          continue
        }

        if (segments.length === 1) {
          entries.push({
            name: segments.at(-1)!,
            path: filePath,
            isDirectory: false,
            isFile: true,
          })
        }

        const subDirectoryPath = path.endsWith('/')
          ? `${path}${segments.at(0)}`
          : `${path}/${segments.at(0)}`
        directories.add(subDirectoryPath)
      }
    }

    for (const directoryPath of directories) {
      if (!entries.some((entry) => entry.path === directoryPath)) {
        const segments = directoryPath.split('/').filter(Boolean)

        entries.push({
          name: segments.at(-1)!,
          path: directoryPath,
          isDirectory: true,
          isFile: false,
        })
      }
    }

    return entries
  }

  async readDirectory(path: string = '.'): Promise<DirectoryEntry[]> {
    return this.readDirectorySync(path)
  }

  readFileSync(path: string): string {
    if (!path.startsWith('.')) {
      path = `./${path}`
    }
    const content = this.#files.get(path)
    if (content === undefined) {
      throw new Error(`File not found: ${path}`)
    }
    return content
  }

  async readFile(path: string): Promise<string> {
    return this.readFileSync(path)
  }

  isFilePathGitIgnored(filePath: string) {
    if (!this.#ignore) {
      try {
        const contents = this.readFileSync('.gitignore')

        if (contents) {
          const gitIgnorePatterns = contents
            .split('\n')
            .map((line) => line.trim())
            // Filter out comments and empty lines
            .filter((line) => line && !line.startsWith('#'))

          this.#ignore = ignore()
          this.#ignore.add(gitIgnorePatterns)
        } else {
          return false
        }
      } catch (error) {
        return false
      }
    }

    return this.#ignore.ignores(filePath)
  }
}

/** Generate a random project ID. */
function generateProjectId(): string {
  return Math.random().toString(36).slice(2, 9)
}
