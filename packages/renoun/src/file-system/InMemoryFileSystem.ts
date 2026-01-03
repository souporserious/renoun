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

export interface InMemoryFileTextEntry {
  kind: 'Text'
  content: string
}

export interface InMemoryFileBinaryEntry {
  kind: 'Binary'
  content: Uint8Array | string
  encoding?: 'binary' | 'base64'
}

export type InMemoryFileEntry = InMemoryFileTextEntry | InMemoryFileBinaryEntry

export interface InMemoryDirectoryEntry {
  kind: 'Directory'
}

export type InMemoryEntry = InMemoryFileEntry | InMemoryDirectoryEntry

export type InMemoryFileContent =
  | string
  | Uint8Array
  | ArrayBuffer
  | ArrayBufferView
  | InMemoryFileEntry

/** A file system that stores files in memory. */
export class InMemoryFileSystem extends FileSystem {
  #projectOptions: ProjectOptions
  #files: Map<string, InMemoryEntry>
  #ignore: ReturnType<typeof ignore> | undefined

  constructor(files: { [path: string]: InMemoryFileContent }) {
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
        this.#normalizeFileContent(content),
      ])
    )

    // Create a TypeScript source file for each JavaScript-like file
    for (const [path, entry] of this.#files) {
      this.#maybeCreateSourceFile(path, entry)
    }
  }

  #normalizeFileContent(content: InMemoryFileContent): InMemoryFileEntry {
    if (typeof content === 'string') {
      return { kind: 'Text', content }
    }

    if (content instanceof Uint8Array) {
      return { kind: 'Binary', content: content.slice() }
    }

    if (content instanceof ArrayBuffer) {
      return { kind: 'Binary', content: new Uint8Array(content) }
    }

    if (ArrayBuffer.isView(content)) {
      const { buffer, byteOffset, byteLength } = content
      return {
        kind: 'Binary',
        content: new Uint8Array(
          buffer.slice(byteOffset, byteOffset + byteLength)
        ),
      }
    }

    if (content && typeof content === 'object') {
      if (content.kind === 'Text') {
        return { kind: 'Text', content: content.content }
      }

      if (content.kind === 'Binary') {
        if (content.encoding === 'base64') {
          // Provided as base64 string
          if (typeof content.content === 'string') {
            return {
              kind: 'Binary',
              content: base64ToBytes(content.content),
              encoding: 'base64',
            }
          }

          // Provided as bytes but marked base64
          if (content.content instanceof Uint8Array) {
            return {
              kind: 'Binary',
              content: content.content.slice(),
              encoding: 'base64',
            }
          }
        }
        // Treat as raw binary
        else if (content.content instanceof Uint8Array) {
          return {
            kind: 'Binary',
            content: content.content.slice(),
            encoding: content.encoding,
          }
        }
      }
    }

    throw new Error(
      '[renoun] Unsupported file content provided to InMemoryFileSystem'
    )
  }

  #maybeCreateSourceFile(path: string, entry: InMemoryEntry) {
    if (entry.kind !== 'Text') {
      return
    }

    const extension = path.split('.').at(-1)
    if (extension && isJavaScriptLikeExtension(extension)) {
      const absolutePath = this.getAbsolutePath(path)
      createSourceFile(absolutePath, entry.content, this.#projectOptions)
    }
  }

  #ensureDirectoryPlaceholders(path: string) {
    const normalizedPath = normalizePath(path)
    if (normalizedPath === '.' || normalizedPath === '') {
      return
    }

    const segments = normalizedPath.split('/')
    let current = ''

    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment
      const existing = this.#files.get(current)
      if (!existing) {
        this.#files.set(current, { kind: 'Directory' })
        continue
      }

      if (existing.kind !== 'Directory') {
        throw new Error(
          `[renoun] Cannot create directory because a file exists at ${current}`
        )
      }
    }
  }

  #collectEntriesUnderPath(path: string) {
    const normalizedPath = normalizePath(path)
    const entries: Array<[string, InMemoryEntry]> = []

    for (const [entryPath, entry] of this.#files) {
      if (
        entryPath === normalizedPath ||
        entryPath.startsWith(`${normalizedPath}/`)
      ) {
        entries.push([entryPath, entry])
      }
    }

    return entries
  }

  #deleteTree(path: string) {
    const normalizedPath = normalizePath(path)

    for (const entryPath of Array.from(this.#files.keys())) {
      if (
        entryPath === normalizedPath ||
        entryPath.startsWith(`${normalizedPath}/`)
      ) {
        this.#files.delete(entryPath)
      }
    }
  }

  #cloneEntry(entry: InMemoryEntry): InMemoryEntry {
    if (entry.kind === 'Directory') {
      return { kind: 'Directory' }
    }

    if (entry.kind === 'Text') {
      return { kind: 'Text', content: entry.content }
    }

    if (typeof entry.content === 'string') {
      return {
        kind: 'Binary',
        content: entry.content,
        encoding: entry.encoding,
      }
    }

    return {
      kind: 'Binary',
      content: entry.content.slice(),
      encoding: entry.encoding,
    }
  }

  #getParentPath(path: string): string {
    const normalizedPath = normalizePath(path)
    const segments = normalizedPath.split('/').filter(Boolean)

    if (segments.length === 0) {
      return '.'
    }

    segments.pop()
    if (segments.length === 0) {
      return '.'
    }

    return segments.join('/')
  }

  createFile(path: string, content: InMemoryFileContent): void {
    const normalizedPath = normalizePath(path)
    this.#ensureDirectoryPlaceholders(this.#getParentPath(normalizedPath))
    const entry = this.#normalizeFileContent(content)
    this.#files.set(normalizedPath, entry)
    this.#maybeCreateSourceFile(normalizedPath, entry)
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

  getFiles(): Map<string, InMemoryEntry> {
    return this.#files
  }

  getFileEntry(path: string): InMemoryEntry | undefined {
    return this.#files.get(normalizePath(path))
  }

  readDirectorySync(path: string = '.'): DirectoryEntry[] {
    const normalizedDirectoryPath = normalizePath(path)
    const basePath =
      normalizedDirectoryPath === '.' ? '' : normalizedDirectoryPath

    const entries: DirectoryEntry[] = []
    const addedPaths = new Set<string>()

    for (const [entryPath, entry] of this.#files) {
      // When basePath is empty or root ('./', '.'), include all entries.
      // When basePath is a subdirectory, only include entries that are children
      // of the directory (start with basePath + '/'), not sibling files that
      // happen to share the same prefix (e.g., 'integrations.mdx' should not
      // be included when reading the 'integrations/' directory).
      const isRootDirectory = !basePath || basePath === './' || basePath === '.'
      if (!isRootDirectory) {
        const prefix = basePath.endsWith('/') ? basePath : `${basePath}/`
        if (!entryPath.startsWith(prefix)) {
          continue
        }
      }

      let relativePath = entryPath.slice(basePath.length)

      if (relativePath.startsWith('/')) {
        relativePath = relativePath.slice(1)
      }

      const segments = relativePath.split('/').filter(Boolean)

      if (segments.length === 0) {
        continue
      }

      const entryName = segments.at(0)!
      const normalizedEntryPath = basePath
        ? `${basePath.replace(/\/$/, '')}/${entryName}`
        : entryName

      if (addedPaths.has(normalizedEntryPath)) {
        continue
      }

      const isLeafDirectory =
        segments.length > 1 ||
        (entry.kind === 'Directory' && segments.length > 0)

      entries.push({
        name: entryName,
        path: normalizedEntryPath,
        isDirectory: isLeafDirectory,
        isFile: !isLeafDirectory,
      })

      addedPaths.add(normalizedEntryPath)
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

    if (entry.kind === 'Directory') {
      throw new Error(`Cannot read directory: ${normalizedPath}`)
    }

    if (entry.kind === 'Text') {
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

    if (entry.kind === 'Directory') {
      throw new Error(`Cannot read directory: ${normalizedPath}`)
    }

    if (entry.kind === 'Text') {
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
    this.#ensureDirectoryPlaceholders(this.#getParentPath(normalizedPath))
    const entry = this.#normalizeFileContent(content as InMemoryFileContent)
    this.#files.set(normalizedPath, entry)
    this.#maybeCreateSourceFile(normalizedPath, entry)
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

  async createDirectory(path: string): Promise<void> {
    this.#ensureDirectoryPlaceholders(path)
  }

  async rename(
    source: string,
    target: string,
    options?: { overwrite?: boolean }
  ): Promise<void> {
    const normalizedSource = normalizePath(source)
    const normalizedTarget = normalizePath(target)

    if (normalizedSource === normalizedTarget) {
      return
    }

    if (normalizedTarget.startsWith(`${normalizedSource}/`)) {
      throw new Error('[renoun] Cannot rename a path into its own subtree')
    }

    const entriesToMove = this.#collectEntriesUnderPath(normalizedSource)

    if (entriesToMove.length === 0) {
      throw new Error(`File not found: ${normalizedSource}`)
    }

    const overwrite = options?.overwrite ?? false

    if (!overwrite) {
      for (const existingPath of this.#files.keys()) {
        if (
          existingPath === normalizedTarget ||
          existingPath.startsWith(`${normalizedTarget}/`)
        ) {
          throw new Error(
            `[renoun] Cannot rename because target already exists: ${normalizedTarget}`
          )
        }
      }
    } else {
      this.#deleteTree(normalizedTarget)
    }

    this.#ensureDirectoryPlaceholders(this.#getParentPath(normalizedTarget))

    for (const [entryPath] of entriesToMove) {
      this.#files.delete(entryPath)
    }

    for (const [entryPath, entry] of entriesToMove) {
      const suffix = entryPath.slice(normalizedSource.length)
      const nextPath = suffix
        ? `${normalizedTarget}${suffix.startsWith('/') ? '' : '/'}${suffix}`
        : normalizedTarget
      this.#files.set(nextPath, entry)
      this.#maybeCreateSourceFile(nextPath, entry)
    }
  }

  async copy(
    source: string,
    target: string,
    options?: { overwrite?: boolean }
  ): Promise<void> {
    const normalizedSource = normalizePath(source)
    const normalizedTarget = normalizePath(target)

    if (normalizedSource === normalizedTarget) {
      return
    }

    if (normalizedTarget.startsWith(`${normalizedSource}/`)) {
      throw new Error('[renoun] Cannot copy a path into its own subtree')
    }

    const entriesToCopy = this.#collectEntriesUnderPath(normalizedSource)

    if (entriesToCopy.length === 0) {
      throw new Error(`File not found: ${normalizedSource}`)
    }

    const overwrite = options?.overwrite ?? false

    if (!overwrite) {
      for (const existingPath of this.#files.keys()) {
        if (
          existingPath === normalizedTarget ||
          existingPath.startsWith(`${normalizedTarget}/`)
        ) {
          throw new Error(
            `[renoun] Cannot copy because target already exists: ${normalizedTarget}`
          )
        }
      }
    } else {
      this.#deleteTree(normalizedTarget)
    }

    this.#ensureDirectoryPlaceholders(this.#getParentPath(normalizedTarget))

    for (const [entryPath, entry] of entriesToCopy) {
      const suffix = entryPath.slice(normalizedSource.length)
      const nextPath = suffix
        ? `${normalizedTarget}${suffix.startsWith('/') ? '' : '/'}${suffix}`
        : normalizedTarget
      const cloned = this.#cloneEntry(entry)
      this.#files.set(nextPath, cloned)
      this.#maybeCreateSourceFile(nextPath, cloned)
    }
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
