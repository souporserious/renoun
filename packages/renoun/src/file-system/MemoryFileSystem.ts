import ignore from 'fast-ignore'
import { getTsMorph } from '../utils/ts-morph.js'

import { createSourceFile, transpileSourceFile } from '../project/client.js'
import type { ProjectOptions } from '../project/types.js'
import { isJavaScriptLikeExtension } from '../utils/is-javascript-like-extension.js'
import { joinPaths, normalizePath, normalizeSlashes } from '../utils/path.js'
import { FileSystem } from './FileSystem.js'
import type { DirectoryEntry } from './types.js'

const tsMorph = getTsMorph()

export type MemoryFileTextEntry = {
  kind: 'text'
  content: string
}

export type MemoryFileBinaryEntry = {
  kind: 'binary'
  content: Uint8Array
  encoding?: 'binary' | 'base64'
}

export type MemoryFileEntry = MemoryFileTextEntry | MemoryFileBinaryEntry

export type MemoryFileContent = string | Uint8Array | MemoryFileEntry

/** A file system that stores files in memory. */
export class MemoryFileSystem extends FileSystem {
  #projectOptions: ProjectOptions
  #files: Map<string, MemoryFileEntry>
  #ignore: ReturnType<typeof ignore> | undefined

  constructor(files: { [path: string]: MemoryFileContent }) {
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
        normalizePath(path),
        this.#normalizeContent(content),
      ])
    )

    // Create a TypeScript source file for each JavaScript-like file
    for (const [path, entry] of this.#files) {
      const extension = path.split('.').at(-1)
      if (
        extension &&
        isJavaScriptLikeExtension(extension) &&
        entry.kind === 'text'
      ) {
        const absolutePath = this.getAbsolutePath(path)
        createSourceFile(absolutePath, entry.content, this.#projectOptions)
      }
    }
  }

  #normalizeContent(content: MemoryFileContent): MemoryFileEntry {
    if (typeof content === 'string') {
      return { kind: 'text', content }
    }

    if (content instanceof Uint8Array) {
      return { kind: 'binary', content: content.slice() }
    }

    if (content && typeof content === 'object') {
      if (content.kind === 'text') {
        return { kind: 'text', content: content.content }
      }

      if (content.kind === 'binary') {
        return {
          kind: 'binary',
          content: content.content.slice(),
          encoding: content.encoding,
        }
      }
    }

    throw new Error('[renoun] Unsupported file content provided to MemoryFileSystem')
  }

  createFile(path: string, content: MemoryFileContent): void {
    const normalizedPath = normalizePath(path)
    const entry = this.#normalizeContent(content)
    this.#files.set(normalizedPath, entry)

    const extension = normalizedPath.split('.').pop()
    if (
      extension &&
      isJavaScriptLikeExtension(extension) &&
      entry.kind === 'text'
    ) {
      const absolutePath = this.getAbsolutePath(normalizedPath)
      createSourceFile(absolutePath, entry.content, this.#projectOptions)
    }
  }

  getProjectOptions() {
    return this.#projectOptions
  }

  transpileFile(path: string) {
    path = normalizeSlashes(path)
    return transpileSourceFile(path, this.#projectOptions)
  }

  getAbsolutePath(path: string) {
    path = normalizeSlashes(path)
    if (path.startsWith('/')) {
      return path
    }
    if (path.startsWith('./')) {
      return path.slice(1)
    }
    return joinPaths('/', path)
  }

  getRelativePathToWorkspace(path: string) {
    const normalized = normalizeSlashes(path)
    return normalized.startsWith('./') ? normalized.slice(2) : normalized
  }

  getFiles(): Map<string, MemoryFileEntry> {
    return this.#files
  }

  getFileEntry(path: string): MemoryFileEntry | undefined {
    return this.#files.get(normalizePath(path))
  }

  readDirectorySync(path: string = '.'): DirectoryEntry[] {
    path = normalizePath(path)

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
    const entry = this.#files.get(normalizePath(path))
    if (!entry) {
      throw new Error(`File not found: ${path}`)
    }

    if (entry.kind === 'text') {
      return entry.content
    }

    const buffer = Buffer.from(entry.content)
    return buffer.toString('base64')
  }

  async readFile(path: string): Promise<string> {
    return this.readFileSync(path)
  }

  fileExistsSync(path: string): boolean {
    return this.#files.has(normalizePath(path))
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

          this.#ignore = ignore(gitIgnorePatterns)
        } else {
          return false
        }
      } catch (error) {
        return false
      }
    }

    return this.#ignore(filePath)
  }
}

/** Generate a random project ID. */
function generateProjectId(): string {
  return Math.random().toString(36).slice(2, 9)
}
