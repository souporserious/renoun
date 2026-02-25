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
import { createHash } from 'node:crypto'
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
import {
  ensureRelativePath,
  normalizePathKey,
  normalizeSlashes,
  relativePath,
  trimLeadingDotSlash,
} from '../utils/path.ts'
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
import {
  parseGitStatusPorcelainV1Z,
  parseNullTerminatedGitPathList,
} from './git-status.ts'
import { spawnWithResult, type SpawnResult } from './spawn.ts'
import type { DirectoryEntry } from './types.ts'
import {
  createWorkspaceCacheKey,
  createWorkspaceChangedPathsCacheKey,
} from './workspace-cache-key.ts'

const GIT_MAX_BUFFER_BYTES = 100 * 1024 * 1024

export class NodeFileSystem
  extends BaseFileSystem
  implements AsyncFileSystem, SyncFileSystem, WritableFileSystem
{
  #tsConfigPath: string
  readonly #gitRootCache = new Map<string, string | null>()
  readonly #workspaceChangeTokenInFlight = new Map<
    string,
    Promise<string | null>
  >()
  readonly #workspaceChangedPathsInFlight = new Map<
    string,
    Promise<readonly string[] | null>
  >()

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

  #findGitRoot(startPath: string): string | null {
    let currentPath = startPath
    const visitedPaths: string[] = []

    while (true) {
      if (this.#gitRootCache.has(currentPath)) {
        const cached = this.#gitRootCache.get(currentPath) ?? null
        for (const path of visitedPaths) {
          this.#gitRootCache.set(path, cached)
        }
        return cached
      }

      visitedPaths.push(currentPath)

      if (existsSync(join(currentPath, '.git'))) {
        for (const path of visitedPaths) {
          this.#gitRootCache.set(path, currentPath)
        }
        return currentPath
      }

      const parentPath = dirname(currentPath)
      if (parentPath === currentPath) {
        break
      }
      currentPath = parentPath
    }

    for (const path of visitedPaths) {
      this.#gitRootCache.set(path, null)
    }
    return null
  }

  #extractHeadFromWorkspaceToken(token: string): string | null {
    const match = /^head:([^;]+);/.exec(token)
    return match?.[1] ?? null
  }

  #extractDirtyDigestFromWorkspaceToken(token: string): string | null {
    const match = /;dirty:([^;]+);/.exec(token)
    return match?.[1] ?? null
  }

  async #createWorkspaceStatusDigest(
    gitRoot: string,
    entries: ReturnType<typeof parseGitStatusPorcelainV1Z>
  ) {
    const pathSignatureCache = new Map<string, Promise<string>>()
    const digestLines = await Promise.all(
      entries.map(async (entry) => {
        const normalizedPaths = entry.paths.map((path) => normalizeSlashes(path))
        const signatures = await Promise.all(
          normalizedPaths.map((path) => {
            const cachedSignature = pathSignatureCache.get(path)
            if (cachedSignature) {
              return cachedSignature
            }

            const signaturePromise = this.#createWorkspaceStatusPathSignature(
              gitRoot,
              path
            )
            pathSignatureCache.set(path, signaturePromise)
            return signaturePromise
          })
        )

        return `${entry.status} ${normalizedPaths.join('\u0001')} ${signatures.join('\u0001')}`
      })
    )
    digestLines.sort((first, second) => first.localeCompare(second))
    const ignoredOnly =
      entries.length > 0 && entries.every((entry) => entry.status === '!!')
    const digest = createHash('sha1')
      .update(digestLines.join('\n'))
      .digest('hex')

    return {
      digest,
      ignoredOnly,
      count: entries.length,
    }
  }

  async #createWorkspaceStatusPathSignature(
    gitRoot: string,
    relativePath: string
  ): Promise<string> {
    const absolutePath = resolve(gitRoot, relativePath)

    try {
      this.#assertWithinWorkspacePath(absolutePath)
      const stats = await stat(absolutePath)
      return `${stats.mode}:${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}`
    } catch {
      return 'missing'
    }
  }

  #toGitStatusScopePath(relativeRootPath: string): string {
    if (!relativeRootPath || relativeRootPath === '.') {
      return '.'
    }

    return relativeRootPath
  }

  async #shouldIncludeIgnoredStatus(
    gitRoot: string,
    scopePath: string
  ): Promise<boolean> {
    if (scopePath === '.') {
      return false
    }

    const ignoredResult = await spawnWithResult(
      'git',
      ['check-ignore', '-q', '--', scopePath],
      {
        cwd: gitRoot,
        maxBuffer: GIT_MAX_BUFFER_BYTES,
        shell: false,
      }
    )

    return ignoredResult.status === 0
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
    return trimLeadingDotSlash(
      relativePath(rootDirectory, this.getAbsolutePath(path))
    )
  }

  async getWorkspaceChangeToken(rootPath: string): Promise<string | null> {
    try {
      const absoluteRootPath = this.getAbsolutePath(rootPath)
      const inflightKey = createWorkspaceCacheKey(absoluteRootPath)

      const existingInflight =
        this.#workspaceChangeTokenInFlight.get(inflightKey)
      if (existingInflight) {
        return await existingInflight
      }

      const lookupPromise =
        this.#getWorkspaceChangeTokenByAbsolutePath(absoluteRootPath)
      this.#workspaceChangeTokenInFlight.set(inflightKey, lookupPromise)

      try {
        return await lookupPromise
      } finally {
        const latest = this.#workspaceChangeTokenInFlight.get(inflightKey)
        if (latest === lookupPromise) {
          this.#workspaceChangeTokenInFlight.delete(inflightKey)
        }
      }
    } catch {
      return null
    }
  }

  #getWorkspaceChangeTokenByAbsolutePath(
    absoluteRootPath: string
  ): Promise<string | null> {
    return (async () => {
      const gitRoot = this.#findGitRoot(absoluteRootPath)
      if (!gitRoot) {
        return null
      }

      const relativeRootPath = relativePath(gitRoot, absoluteRootPath)
      if (relativeRootPath === '..' || relativeRootPath.startsWith('../')) {
        return null
      }

      const scopePath = this.#toGitStatusScopePath(relativeRootPath)
      const includeIgnoredStatuses = await this.#shouldIncludeIgnoredStatus(
        gitRoot,
        scopePath
      )

      const headResult = await spawnWithResult('git', ['rev-parse', 'HEAD'], {
        cwd: gitRoot,
        maxBuffer: GIT_MAX_BUFFER_BYTES,
        shell: false,
      })
      if (headResult.status !== 0) {
        return null
      }

      const headCommit = headResult.stdout.trim()
      if (!headCommit) {
        return null
      }

      const statusResult = await spawnWithResult(
        'git',
        [
          'status',
          '--porcelain=1',
          '-z',
          '--untracked-files=all',
          ...(includeIgnoredStatuses ? ['--ignored=matching'] : []),
          '--ignore-submodules=all',
          '--',
          scopePath,
        ],
        {
          cwd: gitRoot,
          maxBuffer: GIT_MAX_BUFFER_BYTES,
          shell: false,
        }
      )
      if (statusResult.status !== 0) {
        return null
      }

      const statusEntries = parseGitStatusPorcelainV1Z(statusResult.stdout)
      const statusDigest = await this.#createWorkspaceStatusDigest(
        gitRoot,
        statusEntries
      )

      return `head:${headCommit};dirty:${statusDigest.digest};count:${statusDigest.count};ignored-only:${statusDigest.ignoredOnly ? 1 : 0}`
    })().catch(() => null)
  }

  async getWorkspaceChangedPathsSinceToken(
    rootPath: string,
    previousToken: string
  ): Promise<readonly string[] | null> {
    try {
      const absoluteRootPath = this.getAbsolutePath(rootPath)
      const inflightKey = createWorkspaceChangedPathsCacheKey(
        absoluteRootPath,
        previousToken
      )
      const existingInflight =
        this.#workspaceChangedPathsInFlight.get(inflightKey)
      if (existingInflight) {
        return existingInflight
      }

      const lookupPromise =
        this.#getWorkspaceChangedPathsSinceTokenByAbsolutePath(
          absoluteRootPath,
          previousToken
        )
      this.#workspaceChangedPathsInFlight.set(inflightKey, lookupPromise)

      try {
        return await lookupPromise
      } finally {
        const latest = this.#workspaceChangedPathsInFlight.get(inflightKey)
        if (latest === lookupPromise) {
          this.#workspaceChangedPathsInFlight.delete(inflightKey)
        }
      }
    } catch {
      return null
    }
  }

  #getWorkspaceChangedPathsSinceTokenByAbsolutePath(
    absoluteRootPath: string,
    previousToken: string
  ): Promise<readonly string[] | null> {
    return (async () => {
      const previousHead = this.#extractHeadFromWorkspaceToken(previousToken)
      if (!previousHead) {
        return null
      }

      const previousDirtyDigest =
        this.#extractDirtyDigestFromWorkspaceToken(previousToken)

      const gitRoot = this.#findGitRoot(absoluteRootPath)
      if (!gitRoot) {
        return null
      }

      const relativeRootPath = relativePath(gitRoot, absoluteRootPath)
      if (relativeRootPath === '..' || relativeRootPath.startsWith('../')) {
        return null
      }

      const scopePath = this.#toGitStatusScopePath(relativeRootPath)
      const includeIgnoredStatuses = await this.#shouldIncludeIgnoredStatus(
        gitRoot,
        scopePath
      )

      const headResult = await spawnWithResult('git', ['rev-parse', 'HEAD'], {
        cwd: gitRoot,
        maxBuffer: GIT_MAX_BUFFER_BYTES,
        shell: false,
      })
      if (headResult.status !== 0) {
        return null
      }

      const currentHead = headResult.stdout.trim()
      if (!currentHead) {
        return null
      }

      const changedPaths = new Set<string>()
      const diffResultPromise =
        currentHead !== previousHead
          ? spawnWithResult(
              'git',
              [
                'diff',
                '--name-only',
                '--no-renames',
                '-z',
                `${previousHead}..${currentHead}`,
                '--',
                scopePath,
              ],
              {
                cwd: gitRoot,
                maxBuffer: GIT_MAX_BUFFER_BYTES,
                shell: false,
              }
            )
          : Promise.resolve<SpawnResult | null>(null)
      const statusResultPromise = spawnWithResult(
        'git',
        [
          'status',
          '--porcelain=1',
          '-z',
          '--untracked-files=all',
          ...(includeIgnoredStatuses ? ['--ignored=matching'] : []),
          '--ignore-submodules=all',
          '--',
          scopePath,
        ],
        {
          cwd: gitRoot,
          maxBuffer: GIT_MAX_BUFFER_BYTES,
          shell: false,
        }
      )
      const [statusResult, diffResult] = await Promise.all([
        statusResultPromise,
        diffResultPromise,
      ])

      if (statusResult.status !== 0) {
        return null
      }

      if (currentHead !== previousHead) {
        if (!diffResult || diffResult.status !== 0) {
          return null
        }

        const diffPaths = parseNullTerminatedGitPathList(diffResult.stdout)
          .map((line) => normalizeSlashes(line))
          .filter((line) => line.length > 0)

        for (const diffPath of diffPaths) {
          changedPaths.add(diffPath)
        }
      }

      const statusEntries = parseGitStatusPorcelainV1Z(statusResult.stdout)
      const statusDigest = await this.#createWorkspaceStatusDigest(
        gitRoot,
        statusEntries
      )

      if (
        currentHead === previousHead &&
        previousDirtyDigest === statusDigest.digest
      ) {
        return []
      }

      for (const statusEntry of statusEntries) {
        for (const statusPath of statusEntry.paths) {
          const normalizedStatusPath = normalizeSlashes(statusPath)
          if (normalizedStatusPath.length > 0) {
            changedPaths.add(normalizedStatusPath)
          }
        }
      }

      const workspaceRelativePaths = Array.from(changedPaths)
        .map((path) =>
          normalizePathKey(
            this.getRelativePathToWorkspace(resolve(gitRoot, path))
          )
        )
        .sort((first, second) => first.localeCompare(second))

      return workspaceRelativePaths
    })().catch(() => null)
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
