import ignore from 'ignore'
import * as tsMorph from 'ts-morph'

import { createSourceFile, transpileSourceFile } from '../project/client.js'
import type { ProjectOptions } from '../project/types.js'
import { joinPaths } from '../utils/path.js'
import { isJavaScriptLikeExtension } from './is-javascript-like-extension.js'
import { FileSystem } from './FileSystem.js'
import type { DirectoryEntry } from './types.js'

/** A file system that stores files in memory. */
export class MemoryFileSystem extends FileSystem {
  #projectOptions: ProjectOptions
  #files: Map<string, string>
  #ignore: ReturnType<typeof ignore> | undefined

  constructor(files: { [path: string]: string }) {
    const projectId = generateProjectId()

    super()

    this.#projectOptions = {
      projectId: projectId,
      useInMemoryFileSystem: true,
      compilerOptions: {
        module: tsMorph.ts.ModuleKind.CommonJS,
      },
    }
    this.#files = new Map(
      Object.entries(files).map(([path, content]) => [
        path.startsWith('.') ? path : `./${path}`,
        content,
      ])
    )

    // Create a TypeScript source file for each JavaScript-like file
    for (const [path, content] of this.#files) {
      const extension = path.split('.').at(-1)
      if (extension && isJavaScriptLikeExtension(extension)) {
        createSourceFile(path, content, this.#projectOptions)
      }
    }
  }

  getProjectOptions() {
    return this.#projectOptions
  }

  transpileFile(path: string) {
    return transpileSourceFile(path, this.#projectOptions)
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
    const addedPaths = new Set<string>()

    for (const filePath of this.#files.keys()) {
      if (!filePath.startsWith(path)) {
        continue
      }

      let relativePath = filePath.slice(path.length)

      if (relativePath.startsWith('/')) {
        relativePath = relativePath.slice(1)
      }

      const segments = relativePath.split('/').filter(Boolean)

      if (segments.length === 0) {
        continue
      }

      const entryName = segments.at(0)!
      const entryPath = path.endsWith('/')
        ? `${path}${entryName}`
        : `${path}/${entryName}`

      if (addedPaths.has(entryPath)) {
        continue
      }

      if (segments.length === 1) {
        entries.push({
          name: entryName,
          path: entryPath,
          isDirectory: false,
          isFile: true,
        })
      } else {
        entries.push({
          name: entryName,
          path: entryPath,
          isDirectory: true,
          isFile: false,
        })
      }

      addedPaths.add(entryPath)
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
