import ignore from 'ignore'

import { createSourceFile } from '../project/client.js'
import { isJavaScriptLikeExtension } from './is-javascript-like-extension.js'
import { FileSystem } from './FileSystem.js'
import type { DirectoryEntry } from './types.js'

// TODO: generate an identifier that can be associated with each file system instance

export class VirtualFileSystem extends FileSystem {
  #files: Map<string, string>
  #ignore: ReturnType<typeof ignore> | undefined

  constructor(files: { [path: string]: string }) {
    super()
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
        createSourceFile(path, content, { useInMemoryFileSystem: true })
      }
    }
  }

  getFiles() {
    return this.#files
  }

  async readDirectory(path: string = '.'): Promise<DirectoryEntry[]> {
    const entries: DirectoryEntry[] = []
    const directories = new Set<string>()

    for (const filePath of this.#files.keys()) {
      if (filePath.startsWith(path)) {
        const relativePath = filePath.slice(path.length).replace(/^\//, '')
        const segments = relativePath.split('/').filter(Boolean)

        // Store all directories in the path
        let currentPath = path
        for (let index = 0; index < segments.length - 1; index++) {
          currentPath += `/${segments[index]}`
          directories.add(currentPath)
        }

        entries.push({
          name: segments.at(-1)!,
          isFile: true,
          isDirectory: false,
          path: filePath,
          absolutePath: filePath,
        })
      }
    }

    for (const directoryPath of directories) {
      if (!entries.some((entry) => entry.path === directoryPath)) {
        const segments = directoryPath.split('/').filter(Boolean)

        entries.push({
          name: segments.at(-1)!,
          isFile: false,
          isDirectory: true,
          path: directoryPath,
          absolutePath: directoryPath,
        })
      }
    }

    return entries
  }

  readFileSync(path: string): string {
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
