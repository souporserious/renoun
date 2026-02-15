import {
  readdirSync,
  readFileSync,
  existsSync,
  writeFileSync,
  rmSync,
  createReadStream,
  createWriteStream,
  statSync,
  realpathSync,
  type Dirent,
} from 'node:fs'
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  cp,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { ensureRelativePath, relativePath } from '../utils/path.ts'
import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import {
  BaseFileSystem,
  type FileSystemOptions,
  type FileSystemWriteFileContent,
  type FileWritableStream,
  type FileReadableStream,
  type AsyncFileSystem,
  type SyncFileSystem,
  type WritableFileSystem,
} from './FileSystem.ts'
import type { DirectoryEntry } from './types.ts'

export class NodeFileSystem
  extends BaseFileSystem
  implements AsyncFileSystem, SyncFileSystem, WritableFileSystem
{
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
    this.#assertWithinWorkspacePath(this.getAbsolutePath(path))
  }

  #assertWithinWorkspacePath(absolutePath: string) {
    const rootDirectory = getRootDirectory()
    const relativeToRoot = relativePath(rootDirectory, absolutePath)

    if (relativeToRoot.startsWith('..') || relativeToRoot.startsWith('../')) {
      throw new Error(
        `[renoun] Attempted to access a path outside of the workspace root.\n` +
          `  Workspace root: ${rootDirectory}\n` +
          `  Provided path:  ${absolutePath}\n` +
          `  Resolved path:  ${absolutePath}\n` +
          'Accessing files outside of the workspace is not allowed.'
      )
    }

    const realWorkspaceRoot = realpathSync(rootDirectory)
    const realTargetPath = this.#resolveRealPath(absolutePath)
    const realRelative = relative(realWorkspaceRoot, realTargetPath)

    if (realRelative.startsWith('..') || realRelative.startsWith('../')) {
      throw new Error(
        `[renoun] Attempted to access a path outside of the workspace root via symlink.\n` +
          `  Workspace root:       ${rootDirectory}\n` +
          `  Workspace real path:  ${realWorkspaceRoot}\n` +
          `  Provided path:        ${absolutePath}\n` +
          `  Resolved path:        ${absolutePath}\n` +
          `  Real target path:     ${realTargetPath}\n` +
          'Accessing files outside of the workspace is not allowed.'
      )
    }
  }

  #resolveRealPath(path: string): string {
    const segmentsToAppend: string[] = []
    let currentPath = path

    while (!existsSync(currentPath)) {
      const parentPath = dirname(currentPath)
      if (parentPath === currentPath) {
        break
      }
      segmentsToAppend.unshift(basename(currentPath))
      currentPath = parentPath
    }

    const realExistingPath = realpathSync(currentPath)
    return resolve(realExistingPath, ...segmentsToAppend)
  }

  getAbsolutePath(path: string): string {
    const absolutePath = resolve(path)

    if (process.env['RENOUN_DEBUG_ABS_PATH'] === '1') {
      if (path.includes('tmp-renoun-')) {
        // eslint-disable-next-line no-console
        console.log('[renoun-debug-abs]', {
          input: path,
          absolutePath,
          cwd: process.cwd(),
          normalized: absolutePath,
        })
      }
    }
    return absolutePath
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

      const isAbsolute = entryPath.startsWith('/')
      directoryEntries.push({
        name: entry.name,
        path: isAbsolute ? entryPath : ensureRelativePath(entryPath),
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      } satisfies DirectoryEntry)
    }

    return directoryEntries
  }

  readDirectorySync(path: string = '.'): DirectoryEntry[] {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    const entries = readdirSync(absolutePath, { withFileTypes: true })
    return this.#processDirectoryEntries(entries, path)
  }

  async readDirectory(path: string = '.'): Promise<DirectoryEntry[]> {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    const entries = await readdir(absolutePath, { withFileTypes: true })
    return this.#processDirectoryEntries(entries, path)
  }

  readFileSync(path: string): string {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    return readFileSync(absolutePath, 'utf-8')
  }

  async readFile(path: string): Promise<string> {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    return readFile(absolutePath, 'utf-8')
  }

  readFileBinarySync(path: string): Uint8Array {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    return readFileSync(absolutePath)
  }

  async readFileBinary(path: string): Promise<Uint8Array> {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    return readFile(absolutePath)
  }

  readFileStream(path: string): FileReadableStream {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    const stream = createReadStream(absolutePath)
    return Readable.toWeb(stream) as FileReadableStream
  }

  getFileByteLengthSync(path: string): number | undefined {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    try {
      return statSync(absolutePath).size
    } catch {
      return undefined
    }
  }

  async getFileByteLength(path: string): Promise<number | undefined> {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    try {
      const stats = await stat(absolutePath)
      return stats.size
    } catch {
      return undefined
    }
  }

  writeFileSync(path: string, content: FileSystemWriteFileContent): void {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    writeFileSync(absolutePath, normalizeWriteContent(content))
  }

  async writeFile(
    path: string,
    content: FileSystemWriteFileContent
  ): Promise<void> {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    await writeFile(absolutePath, normalizeWriteContent(content))
  }

  writeFileStream(path: string): FileWritableStream {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    const stream = createWriteStream(absolutePath, { flags: 'w' })
    return Writable.toWeb(stream) as FileWritableStream
  }

  fileExistsSync(path: string): boolean {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    return existsSync(absolutePath)
  }

  async fileExists(path: string): Promise<boolean> {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    try {
      await access(absolutePath)
      return true
    } catch {
      return false
    }
  }

  deleteFileSync(path: string): void {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    rmSync(absolutePath, { force: true })
  }

  async deleteFile(path: string): Promise<void> {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    await rm(absolutePath, { force: true })
  }

  async createDirectory(path: string): Promise<void> {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    await mkdir(absolutePath, { recursive: true })
  }

  async rename(
    source: string,
    target: string,
    options?: { overwrite?: boolean }
  ): Promise<void> {
    const absoluteSource = this.getAbsolutePath(source)
    const absoluteTarget = this.getAbsolutePath(target)

    this.#assertWithinWorkspacePath(absoluteSource)
    this.#assertWithinWorkspacePath(absoluteTarget)

    if (absoluteSource === absoluteTarget) {
      return
    }

    const overwrite = options?.overwrite ?? false

    if (!overwrite && (await this.fileExists(absoluteTarget))) {
      throw new Error(
        `[renoun] Cannot rename because target already exists: ${target}`
      )
    }

    if (overwrite) {
      await rm(absoluteTarget, { recursive: true, force: true })
    }

    const targetDirectory = dirname(absoluteTarget)
    if (targetDirectory && targetDirectory !== '.' && targetDirectory !== '/') {
      await mkdir(targetDirectory, { recursive: true })
    }

    await rename(absoluteSource, absoluteTarget)
  }

  async copy(
    source: string,
    target: string,
    options?: { overwrite?: boolean }
  ): Promise<void> {
    const absoluteSource = this.getAbsolutePath(source)
    const absoluteTarget = this.getAbsolutePath(target)

    this.#assertWithinWorkspacePath(absoluteSource)
    this.#assertWithinWorkspacePath(absoluteTarget)

    const overwrite = options?.overwrite ?? false

    if (absoluteSource === absoluteTarget) {
      return
    }

    if (!overwrite && (await this.fileExists(absoluteTarget))) {
      throw new Error(
        `[renoun] Cannot copy because target already exists: ${target}`
      )
    }

    if (overwrite) {
      await rm(absoluteTarget, { recursive: true, force: true })
    }

    const targetDirectory = dirname(absoluteTarget)
    if (targetDirectory && targetDirectory !== '.' && targetDirectory !== '/') {
      await mkdir(targetDirectory, { recursive: true })
    }

    await cp(absoluteSource, absoluteTarget, {
      recursive: true,
      force: overwrite,
      errorOnExist: !overwrite,
    })
  }

  isFilePathGitIgnored(filePath: string): boolean {
    return isFilePathGitIgnored(filePath)
  }

  getFileLastModifiedMsSync(path: string): number | undefined {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    try {
      return statSync(absolutePath).mtimeMs
    } catch {
      return undefined
    }
  }

  async getFileLastModifiedMs(path: string): Promise<number | undefined> {
    this.#assertWithinWorkspace(path)
    const absolutePath = this.getAbsolutePath(path)
    try {
      const stats = await stat(absolutePath)
      return stats.mtimeMs
    } catch {
      return undefined
    }
  }
}

function normalizeWriteContent(
  content: FileSystemWriteFileContent
): Uint8Array {
  if (typeof content === 'string') {
    return Buffer.from(content)
  }

  if (content instanceof Uint8Array) {
    return content
  }

  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content)
  }

  if (ArrayBuffer.isView(content)) {
    const { buffer, byteOffset, byteLength } = content
    return new Uint8Array(buffer.slice(byteOffset, byteOffset + byteLength))
  }

  throw new Error('[renoun] Unsupported content type for writeFile')
}
