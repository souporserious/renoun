import ignore from 'fast-ignore'
import { getTsMorph } from '../utils/ts-morph.ts'

import { createSourceFile, transpileSourceFile } from '../project/client.ts'
import type { ProjectOptions } from '../project/types.ts'
import { isJavaScriptLikeExtension } from '../utils/is-javascript-like-extension.ts'
import { joinPaths, normalizePath, normalizeSlashes } from '../utils/path.ts'
import {
  FileSystem,
  type FileReadableStream,
  type FileSystemWriteFileContent,
  type FileWritableStream,
} from './FileSystem.ts'
import type { DirectoryEntry } from './types.ts'

const tsMorph = getTsMorph()

export type MemoryFileTextEntry = {
  kind: 'text'
  content: string
}

export type MemoryFileBinaryEntry = {
  kind: 'binary'
  content: Uint8Array | string
  encoding?: 'binary' | 'base64'
}

export type MemoryFileEntry = MemoryFileTextEntry | MemoryFileBinaryEntry

export type MemoryFileContent =
  | string
  | Uint8Array
  | ArrayBuffer
  | ArrayBufferView
  | MemoryFileEntry

/** A file system that stores files in memory. */
export class MemoryFileSystem extends FileSystem {
  #projectOptions: ProjectOptions
  #files: Map<string, MemoryFileEntry>
  #ignore: ReturnType<typeof ignore> | undefined

  constructor(files: { [path: string]: MemoryFileContent }) {
    const projectId = crypto.randomUUID()

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

    if (content instanceof ArrayBuffer) {
      return { kind: 'binary', content: new Uint8Array(content) }
    }

    if (ArrayBuffer.isView(content)) {
      const { buffer, byteOffset, byteLength } = content
      return {
        kind: 'binary',
        content: new Uint8Array(
          buffer.slice(byteOffset, byteOffset + byteLength)
        ),
      }
    }

    if (content && typeof content === 'object') {
      if (content.kind === 'text') {
        return { kind: 'text', content: content.content }
      }

      if (content.kind === 'binary') {
        if (content.encoding === 'base64') {
          // Provided as base64 string
          if (typeof content.content === 'string') {
            return {
              kind: 'binary',
              content: base64ToBytes(content.content),
              encoding: 'base64',
            }
          }

          // Provided as bytes but marked base64
          if (content.content instanceof Uint8Array) {
            return {
              kind: 'binary',
              content: content.content.slice(),
              encoding: 'base64',
            }
          }
        }
        // Treat as raw binary
        else if (content.content instanceof Uint8Array) {
          return {
            kind: 'binary',
            content: content.content.slice(),
            encoding: content.encoding,
          }
        }
      }
    }

    throw new Error(
      '[renoun] Unsupported file content provided to MemoryFileSystem'
    )
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
    const normalized = normalizeSlashes(path)
    return transpileSourceFile(normalized, this.#projectOptions)
  }

  getAbsolutePath(path: string) {
    const normalizedPath = normalizeSlashes(path)
    if (normalizedPath.startsWith('/')) {
      return normalizedPath
    }
    if (normalizedPath.startsWith('./')) {
      return normalizedPath.slice(1)
    }
    return joinPaths('/', normalizedPath)
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
    const normalizedDirectoryPath = normalizePath(path)

    const entries: DirectoryEntry[] = []
    const addedPaths = new Set<string>()

    for (const filePath of this.#files.keys()) {
      if (!filePath.startsWith(normalizedDirectoryPath)) {
        continue
      }

      let relativePath = filePath.slice(normalizedDirectoryPath.length)

      if (relativePath.startsWith('/')) {
        relativePath = relativePath.slice(1)
      }

      const segments = relativePath.split('/').filter(Boolean)

      if (segments.length === 0) {
        continue
      }

      const entryName = segments.at(0)!
      const entryPath = normalizedDirectoryPath.endsWith('/')
        ? `${normalizedDirectoryPath}${entryName}`
        : `${normalizedDirectoryPath}/${entryName}`

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
    const normalizedPath = normalizePath(path)
    const entry = this.#files.get(normalizedPath)
    if (!entry) {
      throw new Error(`File not found: ${normalizedPath}`)
    }

    if (entry.kind === 'text') {
      return entry.content
    }

    if (typeof entry.content === 'string') {
      return entry.content
    }

    return bytesToBase64(entry.content)
  }

  async readFile(path: string): Promise<string> {
    return this.readFileSync(path)
  }

  readFileBinarySync(path: string): Uint8Array {
    const normalizedPath = normalizePath(path)
    const entry = this.#files.get(normalizedPath)

    if (!entry) {
      throw new Error(`File not found: ${normalizedPath}`)
    }

    if (entry.kind === 'text') {
      return new TextEncoder().encode(entry.content)
    }

    if (typeof entry.content === 'string') {
      return base64ToBytes(entry.content)
    }

    return entry.content.slice()
  }

  async readFileBinary(path: string): Promise<Uint8Array> {
    return this.readFileBinarySync(path)
  }

  readFileStream(path: string): FileReadableStream {
    const data = this.readFileBinarySync(path)

    let position = 0
    const total = data.byteLength

    return new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (position >= total) {
            controller.close()
            return
          }
          const end = Math.min(position + CHUNK_SIZE, total)
          controller.enqueue(data.subarray(position, end))
          position = end
        },
        cancel() {
          position = total
        },
      },
      {
        highWaterMark: 1,
        size(chunk) {
          return chunk.byteLength
        },
      } as QueuingStrategy<Uint8Array>
    )
  }

  getFileByteLengthSync(path: string): number | undefined {
    try {
      const content = this.readFileBinarySync(path)
      return content.byteLength
    } catch {
      return undefined
    }
  }

  writeFileSync(path: string, content: FileSystemWriteFileContent): void {
    const normalizedPath = normalizePath(path)
    const entry = this.#normalizeContent(content as MemoryFileContent)
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

  async writeFile(
    path: string,
    content: FileSystemWriteFileContent
  ): Promise<void> {
    this.writeFileSync(path, content)
  }

  writeFileStream(path: string): FileWritableStream {
    const normalizedPath = normalizePath(path)
    const chunks: Uint8Array[] = []
    const fileSystem = this

    return new WritableStream<Uint8Array>(
      {
        write(chunk) {
          chunks.push(chunk.slice())
        },
        close() {
          const combined = concatenateUint8Arrays(chunks)
          try {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(
              combined
            )
            fileSystem.writeFileSync(normalizedPath, text)
          } catch {
            fileSystem.writeFileSync(normalizedPath, combined)
          }
        },
        abort() {
          chunks.length = 0
        },
      },
      {
        highWaterMark: 16,
        size(chunk) {
          return chunk.byteLength
        },
      } as QueuingStrategy<Uint8Array>
    )
  }

  fileExistsSync(path: string): boolean {
    return this.#files.has(normalizePath(path))
  }

  async fileExists(path: string): Promise<boolean> {
    return this.fileExistsSync(path)
  }

  deleteFileSync(path: string): void {
    this.#files.delete(normalizePath(path))
  }

  async deleteFile(path: string): Promise<void> {
    this.deleteFileSync(path)
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

    const normalized = normalizeSlashes(filePath).replace(/^\.\//, '')
    return this.#ignore(normalized)
  }

  getFileLastModifiedMsSync(_path: string): number | undefined {
    // Memory file systems do not have real modification timestamps.
    // Callers should treat `undefined` as "unknown" and avoid relying on it
    // for cache invalidation.
    return undefined
  }

  async getFileLastModifiedMs(path: string): Promise<number | undefined> {
    return this.getFileLastModifiedMsSync(path)
  }
}

/** Concatenate Uint8Arrays into a single Uint8Array. */
function concatenateUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce(
    (length, chunk) => length + chunk.byteLength,
    0
  )
  const result = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }

  return result
}

/** The chunk size for converting bytes to base64. */
const CHUNK_SIZE = 0x8000

/** Convert a Uint8Array to a base64 string. */
function bytesToBase64(u8: Uint8Array) {
  let bin = ''
  for (let index = 0; index < u8.length; index += CHUNK_SIZE) {
    bin += String.fromCharCode(...u8.subarray(index, index + CHUNK_SIZE))
  }
  return globalThis.btoa(bin)
}

/** Convert a base64 string to a Uint8Array. */
function base64ToBytes(b64: string) {
  const bin = globalThis.atob(b64)
  const out = new Uint8Array(bin.length)
  for (let index = 0; index < bin.length; index++) {
    out[index] = bin.charCodeAt(index)
  }
  return out
}
