/**
 * LocalGitFileSystem
 *
 * A high-performance git-backed file system that:
 * - Reads files directly from git object storage (`git cat-file --batch`)
 * - Provides export-level metadata and history for public APIs
 * - Supports cloning remote repos into a local cache (including sparse checkouts)
 * - Avoids loading file contents during module resolution (extension/index probing)
 * - Reuses parsed exports by blob SHA to avoid repeat parsing
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { mkdir, rename, rm, cp, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import os from 'node:os'
import { Writable } from 'node:stream'

import {
  ensureRelativePath,
  joinPaths,
  normalizeSlashes,
  relativePath,
} from '../utils/path.ts'
import type { GitMetadata as LocalGitMetadata } from '../utils/get-local-git-file-metadata.ts'
import {
  hasJavaScriptLikeExtension,
  type JavaScriptLikeExtension,
} from '../utils/is-javascript-like-extension.ts'
import {
  BaseFileSystem,
  type FileReadableStream,
  type FileSystemOptions,
  type FileSystemWriteFileContent,
  type FileWritableStream,
  type AsyncFileSystem,
  type SyncFileSystem,
  type WritableFileSystem,
} from './FileSystem.ts'
import type {
  DirectoryEntry,
  GitAuthor,
  GitExportMetadata,
  GitFileMetadata,
  GitModuleMetadata,
  GitPathMetadata,
  ExportHistoryOptions,
  ExportHistoryReport,
} from './types.ts'
import {
  type ExportItem,
  MAX_PARSE_BYTES,
  EXTENSION_PRIORITY,
  INDEX_FILE_CANDIDATES,
  RENAME_SIGNATURE_DICE_MIN,
  RENAME_SIGNATURE_DICE_MIN_RENAMED_FILE,
  RENAME_SIGNATURE_DICE_MARGIN,
  RENAME_PATH_DICE_MIN,
  parseExportId,
  formatExportId,
  getExportParseCacheKey,
  scanModuleExports,
  getDiceSimilarity,
  isUnderScope,
  mapWithLimit,
  LRUMap,
  looksLikeFilePath,
  buildExportComparisonMaps,
  detectCrossFileRenames,
  mergeRenameHistory,
  checkAndCollapseOscillation,
} from './export-analysis.ts'

export interface LocalGitFileSystemOptions extends FileSystemOptions {
  /** Repository source - remote URL or local path. */
  repository: string

  /** The Git reference to use. */
  ref?: string

  /** Sparse checkout directories for large repositories. */
  sparse?: string[]

  /** Shallow clone depth (undefined = full history). */
  depth?: number

  /** The directory to use for cached clones and metadata. */
  cacheDir?: string

  /** The transport to use for cloning. */
  transport?: 'https' | 'ssh'

  /** Whether to automatically fetch the repository. */
  autoFetch?: boolean

  /** The remote to fetch from. */
  fetchRemote?: string

  /** Whether to print verbose output. */
  verbose?: boolean

  /** The maximum number of bytes to buffer for Git commands. */
  maxBufferBytes?: number

  /** The maximum depth to traverse for export history. */
  maxDepth?: number
}

interface GitObjectMeta {
  sha: string
  type: string
  size: number
}

interface FileExportIndex {
  builtAt: string
  repoRoot: string
  ref: string
  refCommit: string
  path: string
  headBlobSha: string
  perExport: Record<
    string,
    {
      firstCommitDate?: string
      lastCommitDate?: string
      firstCommitHash?: string
      lastCommitHash?: string
    }
  >
}

interface GitLogCommit {
  sha: string
  unix: number
  tags?: string[]
}

interface ExportHistoryCommit extends GitLogCommit {
  release?: string
}

const FILE_META_CACHE_MAX = 1000
const FILE_INDEX_CACHE_MAX = 1000
const EXPORT_HISTORY_CACHE_MAX = 200
const GIT_LOG_CACHE_MAX = 128
const REMOTE_REF_CACHE_TTL_MS = 60_000
const REMOTE_REF_TIMEOUT_MS = 8_000
const remoteRefCache = new Map<
  string,
  { remoteSha: string | null; checkedAt: number }
>()

interface PrepareRepoOptions {
  spec: string
  cacheDirectory: string
  scopeDirectories?: string[]
  transport?: 'https' | 'ssh'
  depth?: number
  verbose?: boolean
}

let isCachedBackfillSupport: boolean | null = null

/** Detects if git backfill is supported. */
async function supportsGitBackfill(): Promise<boolean> {
  if (isCachedBackfillSupport !== null) {
    return isCachedBackfillSupport
  }

  // `git <cmd> -h` commonly exits with code 129 even when the command exists,
  // so we detect support by looking for the "is not a git command" message.
  const result = await spawnWithResult('git', ['backfill', '-h'], {
    cwd: process.cwd(),
    verbose: false,
  })

  const output = `${result.stdout}\n${result.stderr}`
  const isSupported = !output.includes('is not a git command')
  isCachedBackfillSupport = isSupported
  return isSupported
}

function supportsGitBackfillSync(): boolean {
  if (isCachedBackfillSupport !== null) {
    return isCachedBackfillSupport
  }
  const result = spawnSync('git', ['backfill', '-h'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    encoding: 'utf8',
  })
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  const isSupported = !output.includes('is not a git command')
  isCachedBackfillSupport = isSupported
  return isSupported
}

/**
 * Ensures a local cached git clone exists for a remote spec (owner/repo or URL).
 * Clones if missing and returns the repo root.
 */
export async function ensureCacheClone(
  options: PrepareRepoOptions
): Promise<string> {
  const {
    spec,
    cacheDirectory,
    transport = 'https',
    verbose = false,
    depth,
  } = options

  mkdirSync(cacheDirectory, { recursive: true })

  const safeName = spec.replace(/[^a-zA-Z0-9_-]/g, '__')
  const target = join(cacheDirectory, safeName)
  const gitDir = join(target, '.git')

  if (existsSync(target) && !existsSync(gitDir)) {
    throw new Error(
      `[LocalGitFileSystem] Refusing to use cache target that exists but is not a git repo: ${target}`
    )
  }

  let cloneUrl: string
  if (looksLikeGitHubSpec(spec)) {
    cloneUrl =
      transport === 'ssh'
        ? `git@github.com:${spec}.git`
        : `https://github.com/${spec}.git`
  } else if (looksLikeGitRemoteUrl(spec)) {
    cloneUrl = spec
  } else {
    throw new Error(
      `[LocalGitFileSystem] Unsupported repository spec: ${spec}. ` +
        'Use a local path, an "owner/repo" GitHub shorthand, or a git URL (https://, ssh://, git@).'
    )
  }

  const supportsBackfill = await supportsGitBackfill()

  if (verbose && !supportsBackfill) {
    console.log(
      '[LocalGitFileSystem] git backfill is not available. Falling back to full clone.'
    )
  }

  if (!existsSync(gitDir)) {
    if (verbose) {
      console.log(`[LocalGitFileSystem] Cloning ${spec} into ${target}…`)
    }

    const clone = await spawnWithResult(
      'git',
      [
        'clone',
        // Inject core.fsmonitor and core.sshCommand to prevent config injection RCE
        '-c',
        'core.fsmonitor=',
        '-c',
        'core.sshCommand=',
        ...(typeof depth === 'number' && depth > 0
          ? ['--depth', String(depth)]
          : []),
        ...(supportsBackfill ? ['--filter=blob:none'] : []),
        '--no-checkout',
        '--sparse',
        cloneUrl,
        target,
      ],
      { cwd: process.cwd(), verbose }
    )

    if (clone.status !== 0) {
      const stderr = clone.stderr ? String(clone.stderr).trim() : ''
      throw new Error(`Failed to clone ${spec}${stderr ? `: ${stderr}` : ''}`)
    }
  }

  return target
}

function ensureCacheCloneSync(options: PrepareRepoOptions): string {
  const {
    spec,
    cacheDirectory,
    transport = 'https',
    verbose = false,
    depth,
  } = options

  mkdirSync(cacheDirectory, { recursive: true })

  const safeName = spec.replace(/[^a-zA-Z0-9_-]/g, '__')
  const target = join(cacheDirectory, safeName)
  const gitDir = join(target, '.git')

  if (existsSync(target) && !existsSync(gitDir)) {
    throw new Error(
      `[LocalGitFileSystem] Refusing to use cache target that exists but is not a git repo: ${target}`
    )
  }

  let cloneUrl: string
  if (looksLikeGitHubSpec(spec)) {
    cloneUrl =
      transport === 'ssh'
        ? `git@github.com:${spec}.git`
        : `https://github.com/${spec}.git`
  } else if (looksLikeGitRemoteUrl(spec)) {
    cloneUrl = spec
  } else {
    throw new Error(
      `[LocalGitFileSystem] Unsupported repository spec: ${spec}. ` +
        'Use a local path, an "owner/repo" GitHub shorthand, or a git URL (https://, ssh://, git@).'
    )
  }

  const supportsBackfill = supportsGitBackfillSync()

  if (verbose && !supportsBackfill) {
    console.log(
      '[LocalGitFileSystem] git backfill is not available. Falling back to full clone.'
    )
  }

  if (!existsSync(gitDir)) {
    if (verbose) {
      console.log(`[LocalGitFileSystem] Cloning ${spec} into ${target}…`)
    }

    const cloneArgs = [
      'clone',
      '-c',
      'core.fsmonitor=',
      '-c',
      'core.sshCommand=',
      ...(typeof depth === 'number' && depth > 0
        ? ['--depth', String(depth)]
        : []),
      ...(supportsBackfill ? ['--filter=blob:none'] : []),
      '--no-checkout',
      '--sparse',
      cloneUrl,
      target,
    ]

    const clone = spawnSync('git', cloneArgs, {
      cwd: process.cwd(),
      stdio: 'pipe',
      encoding: 'utf8',
    })

    if (clone.status !== 0) {
      const stderr = clone.stderr ? String(clone.stderr).trim() : ''
      throw new Error(`Failed to clone ${spec}${stderr ? `: ${stderr}` : ''}`)
    }
  }

  return target
}

/** Sets the sparse checkout for the given scope directories. */
async function setSparseCheckout(
  repoRoot: string,
  scopeDirectories: string[],
  verbose: boolean
) {
  const paths = scopeDirectories.length ? scopeDirectories : ['.']
  await spawnWithResult('git', ['sparse-checkout', 'set', '--', ...paths], {
    cwd: repoRoot,
    verbose,
  })
}

function setSparseCheckoutSync(
  repoRoot: string,
  scopeDirectories: string[],
  verbose: boolean
) {
  const paths = scopeDirectories.length ? scopeDirectories : ['.']
  spawnSync('git', ['sparse-checkout', 'set', '--', ...paths], {
    cwd: repoRoot,
    stdio: verbose ? 'inherit' : 'ignore',
  })
}

/** Runs git backfill to populate the sparse checkout. */
async function runGitBackfill(repoRoot: string, verbose: boolean) {
  const result = await spawnWithResult('git', ['backfill', '--sparse'], {
    cwd: repoRoot,
    verbose,
  })
  if (result.status !== 0 && verbose) {
    const stderr = result.stderr ? String(result.stderr).trim() : ''
    console.warn(
      `[LocalGitFileSystem] git backfill --sparse failed (ignored)${
        stderr ? `: ${stderr}` : ''
      }`
    )
  }
}

function runGitBackfillSync(repoRoot: string, verbose: boolean) {
  const result = spawnSync('git', ['backfill', '--sparse'], {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf8',
  })
  if (result.status !== 0 && verbose) {
    const stderr = result.stderr ? String(result.stderr).trim() : ''
    console.warn(
      `[LocalGitFileSystem] git backfill --sparse failed (ignored)${
        stderr ? `: ${stderr}` : ''
      }`
    )
  }
}

/** Normalizes the scope directories to a list of unique directories. */
function normalizeScopeDirectories(scopeDirectories: string[]): string[] {
  const candidates = scopeDirectories.length ? scopeDirectories : ['.']
  const unique = new Set<string>()
  for (const candidate of candidates) {
    const value = String(candidate)
    if (!value) {
      continue
    }
    unique.add(value)
  }
  if (unique.has('.')) {
    return ['.']
  }
  return Array.from(unique)
}

/** Merges the prepared scope directories with the new scope directories. */
function mergeScopeDirectories(
  prepared: Set<string>,
  scopeDirectories: string[]
): { merged: string[]; missing: string[] } {
  const next = normalizeScopeDirectories(scopeDirectories)
  if (prepared.has('.')) {
    return { merged: ['.'], missing: [] }
  }
  if (next.includes('.')) {
    return { merged: ['.'], missing: prepared.has('.') ? [] : ['.'] }
  }

  const mergedSet = new Set(prepared)
  const missing: string[] = []
  for (const path of next) {
    if (!mergedSet.has(path)) {
      mergedSet.add(path)
      missing.push(path)
    }
  }

  return { merged: Array.from(mergedSet).sort(), missing }
}

/** Ensures a cached git repo is prepared and ready to analyze. */
async function ensureCachedScope(
  repoRoot: string,
  scopeDirectories: string[],
  verbose: boolean
) {
  const normalized = normalizeScopeDirectories(scopeDirectories)
  await spawnWithResult('git', ['sparse-checkout', 'init', '--cone'], {
    cwd: repoRoot,
    verbose,
  })
  await setSparseCheckout(repoRoot, normalized, verbose)

  if (await supportsGitBackfill()) {
    await runGitBackfill(repoRoot, verbose)
  }
}

function ensureCachedScopeSync(
  repoRoot: string,
  scopeDirectories: string[],
  verbose: boolean
) {
  const normalized = normalizeScopeDirectories(scopeDirectories)
  spawnSync('git', ['sparse-checkout', 'init', '--cone'], {
    cwd: repoRoot,
    stdio: verbose ? 'inherit' : 'ignore',
  })
  setSparseCheckoutSync(repoRoot, normalized, verbose)

  if (supportsGitBackfillSync()) {
    runGitBackfillSync(repoRoot, verbose)
  }
}

interface SpawnResult {
  status: number | null
  stdout: string
  stderr: string
}

/** Spawns a process and returns status code + output. */
function spawnWithResult(
  command: string,
  args: string[],
  options: {
    cwd: string
    maxBuffer?: number
    verbose?: boolean
    env?: NodeJS.ProcessEnv
    timeoutMs?: number
  }
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    // Always pipe so we can capture output for parsing.
    // When verbose, we also write to process.stdout/stderr.
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: 'pipe',
      env: options.env ?? process.env,
      shell: false,
    })

    let stdout = ''
    let stderr = ''
    const maxBuffer = options.maxBuffer ?? 100 * 1024 * 1024
    let totalBytes = 0
    let settled = false
    const timeoutMs = options.timeoutMs ?? 0
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const finish = (error?: Error, result?: SpawnResult) => {
      if (settled) {
        return
      }
      settled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      if (error) {
        reject(error)
        return
      }
      resolve(result!)
    }

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // ignore
        }
        const timeoutMessage = `Command timed out after ${timeoutMs}ms`
        stderr = stderr ? `${stderr}\n${timeoutMessage}` : timeoutMessage
        finish(undefined, { status: 124, stdout, stderr })
      }, timeoutMs)
    }

    const onData = (chunk: Buffer, isStdout: boolean) => {
      totalBytes += chunk.length
      if (totalBytes > maxBuffer) {
        child.kill()
        finish(
          new Error(
            `maxBuffer exceeded (${maxBuffer} bytes) for: ${command} ${args.join(
              ' '
            )}`
          )
        )
        return
      }
      const text = chunk.toString()
      if (isStdout) {
        stdout += text
        if (options.verbose) {
          process.stdout.write(text)
        }
      } else {
        stderr += text
        if (options.verbose) {
          process.stderr.write(text)
        }
      }
    }
    child.stdout?.on('data', (chunk) => onData(chunk, true))
    child.stderr?.on('data', (chunk) => onData(chunk, false))

    child.on('error', (error) => finish(error))
    child.on('close', (code) =>
      finish(undefined, { status: code, stdout, stderr })
    )
  })
}

async function spawnWithBuffer(
  command: string,
  args: string[],
  options: {
    cwd: string
    maxBuffer?: number
    verbose?: boolean
    env?: NodeJS.ProcessEnv
  }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: 'pipe',
      env: options.env ?? process.env,
      shell: false,
    })

    const maxBuffer = options.maxBuffer ?? 100 * 1024 * 1024
    let totalBytes = 0
    const stdoutChunks: Buffer[] = []
    let stderr = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length
      if (totalBytes > maxBuffer) {
        child.kill()
        reject(
          new Error(
            `maxBuffer exceeded (${maxBuffer} bytes) for: ${command} ${args.join(
              ' '
            )}`
          )
        )
        return
      }
      stdoutChunks.push(chunk)
      if (options.verbose) {
        process.stdout.write(chunk)
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (options.verbose) {
        process.stderr.write(chunk)
      }
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(stderr || `Command failed: ${command} ${args.join(' ')}`)
        )
        return
      }
      resolve(Buffer.concat(stdoutChunks))
    })
  })
}

/** Spawns a process and returns the stdout. */
async function spawnAsync(
  command: string,
  args: string[],
  options: { cwd: string; maxBuffer?: number; verbose?: boolean }
): Promise<string> {
  const result = await spawnWithResult(command, args, options)

  if (result.status !== 0) {
    throw new Error(
      result.stderr ||
        `Git exited with code ${result.status} for: ${command} ${args.join(' ')}`
    )
  }

  return result.stdout
}

export class LocalGitFileSystem
  extends BaseFileSystem
  implements AsyncFileSystem, SyncFileSystem, WritableFileSystem
{
  #tsConfigPath: string
  readonly repository: string
  readonly cloneDepth?: number
  readonly repositoryIsRemote: boolean

  repoRoot: string
  readonly ref: string
  readonly cacheDirectory: string
  readonly verbose: boolean
  readonly maxBufferBytes: number
  readonly maxDepth: number
  readonly autoPrepare: boolean
  readonly prepareScopeDirectories: string[]
  readonly prepareTransport: 'https' | 'ssh'
  readonly autoFetch: boolean
  readonly fetchRemote: string

  #git: GitObjectStore | null
  #repoReady = false
  #preparedScope = new Set<string>()
  #repoRootPromise: Promise<string> | null = null
  #closed = false

  // File metadata memoization
  #fileMetaPromises = new Map<string, Promise<GitFileMetadata>>()
  #fileMetaCache = new LRUMap<string, GitFileMetadata>(FILE_META_CACHE_MAX)

  // Lazily resolved commit SHA for `this.ref`
  #refCommit: string | null = null
  #refCommitPromise: Promise<string> | null = null

  // Singleton promise to prevent parallel unshallow operations
  #unshallowPromise: Promise<void> | null = null
  #isShallowChecked = false
  #isShallow = false

  // Parsed exports cache (blob SHA -> scanExports result).
  // Shared by getExportHistory and buildFileExportIndex.
  // Uses LRUMap for O(1) eviction instead of manual pruning.
  #exportParseCache = new LRUMap<string, Map<string, ExportItem>>(10_000)

  // In-memory cache for file export indices (diskPath -> index)
  #fileExportIndexMemory = new LRUMap<string, FileExportIndex>(
    FILE_INDEX_CACHE_MAX
  )

  // In-memory cache for export history reports (diskPath -> report)
  #exportHistoryMemory = new LRUMap<string, ExportHistoryReport>(
    EXPORT_HISTORY_CACHE_MAX
  )

  // Cache git log results (keyed by query) to avoid repeat git invocations in a single process.
  #gitLogCache = new LRUMap<string, Promise<GitLogCommit[]>>(GIT_LOG_CACHE_MAX)

  constructor(options: LocalGitFileSystemOptions) {
    super(options)

    this.#tsConfigPath = options.tsConfigPath || 'tsconfig.json'
    this.repository = String(options.repository)
    this.repoRoot = this.repository
    this.repositoryIsRemote =
      looksLikeGitHubSpec(this.repository) ||
      looksLikeGitRemoteUrl(this.repository)
    this.cloneDepth = options.depth

    this.ref = options.ref ?? 'HEAD'
    assertSafeGitArg(this.ref, 'ref')

    this.cacheDirectory = options.cacheDir
      ? resolve(String(options.cacheDir))
      : resolve(os.homedir(), '.cache', 'renoun-git')

    this.verbose = Boolean(options.verbose)
    this.maxBufferBytes = options.maxBufferBytes ?? 100 * 1024 * 1024
    this.maxDepth = options.maxDepth ?? 25

    this.autoPrepare = this.repositoryIsRemote
    this.prepareScopeDirectories = options.sparse ?? []
    this.prepareTransport = options.transport ?? 'https'
    this.fetchRemote = options.fetchRemote ?? 'origin'
    this.autoFetch =
      options.autoFetch ??
      (this.autoPrepare
        ? true
        : looksLikeCacheClone(this.repoRoot, this.cacheDirectory))

    mkdirSync(this.cacheDirectory, { recursive: true })
    this.#git = null

    if (this.verbose) {
      console.log(
        `[LocalGitFileSystem] initialized for ${this.repoRoot} @ ${this.ref}`
      )
    }
  }

  getProjectOptions() {
    this.#ensureRepoReadySync()
    return {
      tsConfigFilePath: this.getAbsolutePath(this.#tsConfigPath),
    }
  }

  async getGitFileMetadata(path: string): Promise<LocalGitMetadata> {
    const metadata = await this.getFileMetadata(path)
    const firstCommitDate = metadata.firstCommitDate
      ? new Date(metadata.firstCommitDate)
      : undefined
    const lastCommitDate = metadata.lastCommitDate
      ? new Date(metadata.lastCommitDate)
      : undefined
    const authors = metadata.authors
      .map((author) => ({
        ...author,
        firstCommitDate: author.firstCommitDate
          ? new Date(author.firstCommitDate)
          : undefined,
        lastCommitDate: author.lastCommitDate
          ? new Date(author.lastCommitDate)
          : undefined,
      }))
      .filter(
        (author) =>
          author.firstCommitDate instanceof Date &&
          !Number.isNaN(author.firstCommitDate.getTime()) &&
          author.lastCommitDate instanceof Date &&
          !Number.isNaN(author.lastCommitDate.getTime())
      )
      .map((author) => ({
        ...author,
        firstCommitDate: author.firstCommitDate!,
        lastCommitDate: author.lastCommitDate!,
      }))
    return {
      authors,
      firstCommitDate,
      lastCommitDate,
    }
  }

  async getGitExportMetadata(
    path: string,
    _startLine: number,
    _endLine: number
  ): Promise<GitExportMetadata> {
    const metadata = await this.getFileMetadata(path)
    return {
      firstCommitDate: metadata.firstCommitDate
        ? new Date(metadata.firstCommitDate)
        : undefined,
      lastCommitDate: metadata.lastCommitDate
        ? new Date(metadata.lastCommitDate)
        : undefined,
      firstCommitHash: metadata.firstCommitHash ?? undefined,
      lastCommitHash: metadata.lastCommitHash ?? undefined,
    }
  }

  getAbsolutePath(path: string): string {
    const normalized = normalizeSlashes(String(path))
    if (!normalized) {
      return resolve(this.repoRoot)
    }
    if (normalized.startsWith('/')) {
      return resolve(this.repoRoot, `.${normalized}`)
    }
    return resolve(this.repoRoot, normalized)
  }

  getRelativePathToWorkspace(path: string): string {
    const absolutePath = this.getAbsolutePath(path)
    const relativeToRepo = relativePath(this.repoRoot, absolutePath)
    return normalizeSlashes(
      relativeToRepo.startsWith('./') ? relativeToRepo.slice(2) : relativeToRepo
    )
  }

  readDirectorySync(path: string = '.'): DirectoryEntry[] {
    this.#ensureRepoReadySync()
    return this.#readDirectorySyncInternal(path)
  }

  async readDirectory(path: string = '.'): Promise<DirectoryEntry[]> {
    await this.#ensureRepoReady()
    return this.#readDirectoryInternal(path)
  }

  readFileSync(path: string): string {
    this.#ensureRepoReadySync()
    return this.#readFileSyncInternal(path)
  }

  async readFile(path: string): Promise<string> {
    await this.#ensureRepoReady()
    const relativePath = this.#normalizeRepoPath(path)
    const spec = relativePath ? `${this.ref}:${relativePath}` : this.ref
    const object = await this.#git!.getBlobInfo(spec)
    if (!object) {
      throw new Error(`[renoun] File not found: ${path}`)
    }
    return object.content
  }

  readFileBinarySync(path: string): Uint8Array {
    this.#ensureRepoReadySync()
    return this.#readFileBinarySyncInternal(path)
  }

  async readFileBinary(path: string): Promise<Uint8Array> {
    await this.#ensureRepoReady()
    return this.#readFileBinaryInternal(path)
  }

  readFileStream(path: string): FileReadableStream {
    const readBinary = this.readFileBinary.bind(this)
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const data = await readBinary(path)
          controller.enqueue(data)
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })
  }

  getFileByteLengthSync(path: string): number | undefined {
    this.#ensureRepoReadySync()
    const relativePath = this.#normalizeRepoPath(path)
    const spec = relativePath ? `${this.ref}:${relativePath}` : this.ref
    const result = spawnSync('git', ['cat-file', '-s', spec], {
      cwd: this.repoRoot,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      return undefined
    }
    const size = Number(result.stdout?.trim())
    return Number.isFinite(size) ? size : undefined
  }

  async getFileByteLength(path: string): Promise<number | undefined> {
    await this.#ensureRepoReady()
    return this.getFileByteLengthSync(path)
  }

  writeFileSync(path: string, content: FileSystemWriteFileContent): void {
    this.#ensureRepoReadySync()
    const absolutePath = this.#resolveRepoAbsolutePath(path)
    writeFileSync(absolutePath, normalizeWriteContent(content))
  }

  async writeFile(
    path: string,
    content: FileSystemWriteFileContent
  ): Promise<void> {
    await this.#ensureRepoReady()
    const absolutePath = this.#resolveRepoAbsolutePath(path)
    await writeFile(absolutePath, normalizeWriteContent(content))
  }

  writeFileStream(path: string): FileWritableStream {
    this.#ensureRepoReadySync()
    const absolutePath = this.#resolveRepoAbsolutePath(path)
    const stream = createWriteStream(absolutePath, { flags: 'w' })
    return Writable.toWeb(stream) as FileWritableStream
  }

  fileExistsSync(path: string): boolean {
    this.#ensureRepoReadySync()
    const relativePath = this.#normalizeRepoPath(path)
    const spec = relativePath ? `${this.ref}:${relativePath}` : this.ref
    const result = spawnSync('git', ['cat-file', '-e', spec], {
      cwd: this.repoRoot,
      stdio: 'ignore',
    })
    return result.status === 0
  }

  async fileExists(path: string): Promise<boolean> {
    await this.#ensureRepoReady()
    const relativePath = this.#normalizeRepoPath(path)
    const spec = relativePath ? `${this.ref}:${relativePath}` : this.ref
    const meta = await this.#git!.getBlobMeta(spec)
    return meta !== null
  }

  getFileLastModifiedMsSync(path: string): number | undefined {
    this.#ensureRepoReadySync()
    const relativePath = this.#normalizeRepoPath(path)
    const result = spawnSync(
      'git',
      ['log', '-1', '--format=%ct', this.ref, '--', relativePath],
      { cwd: this.repoRoot, stdio: 'pipe', encoding: 'utf8' }
    )
    if (result.status !== 0) {
      return undefined
    }
    const seconds = Number(result.stdout?.trim())
    if (!Number.isFinite(seconds)) {
      return undefined
    }
    return seconds * 1000
  }

  async getFileLastModifiedMs(path: string): Promise<number | undefined> {
    await this.#ensureRepoReady()
    const relativePath = this.#normalizeRepoPath(path)
    const result = await spawnWithResult(
      'git',
      ['log', '-1', '--format=%ct', this.ref, '--', relativePath],
      { cwd: this.repoRoot, maxBuffer: this.maxBufferBytes, verbose: false }
    )
    if (result.status !== 0) {
      return undefined
    }
    const seconds = Number(result.stdout.trim())
    if (!Number.isFinite(seconds)) {
      return undefined
    }
    return seconds * 1000
  }

  deleteFileSync(path: string): void {
    this.#ensureRepoReadySync()
    const absolutePath = this.#resolveRepoAbsolutePath(path)
    rmSync(absolutePath, { force: true })
  }

  async deleteFile(path: string): Promise<void> {
    await this.#ensureRepoReady()
    const absolutePath = this.#resolveRepoAbsolutePath(path)
    await rm(absolutePath, { force: true })
  }

  async createDirectory(path: string): Promise<void> {
    await this.#ensureRepoReady()
    const absolutePath = this.#resolveRepoAbsolutePath(path)
    await mkdir(absolutePath, { recursive: true })
  }

  async rename(
    source: string,
    target: string,
    options?: { overwrite?: boolean }
  ): Promise<void> {
    await this.#ensureRepoReady()
    const sourcePath = this.#resolveRepoAbsolutePath(source)
    const targetPath = this.#resolveRepoAbsolutePath(target)
    if (sourcePath === targetPath) {
      return
    }
    const overwrite = options?.overwrite ?? false
    if (!overwrite && (await this.fileExists(target))) {
      throw new Error(
        `[renoun] Cannot rename because target already exists: ${target}`
      )
    }
    if (overwrite) {
      await rm(targetPath, { recursive: true, force: true })
    }
    const targetDirectory = dirname(targetPath)
    if (targetDirectory && targetDirectory !== '.' && targetDirectory !== '/') {
      await mkdir(targetDirectory, { recursive: true })
    }
    await rename(sourcePath, targetPath)
  }

  async copy(
    source: string,
    target: string,
    options?: { overwrite?: boolean }
  ): Promise<void> {
    await this.#ensureRepoReady()
    const sourcePath = this.#resolveRepoAbsolutePath(source)
    const targetPath = this.#resolveRepoAbsolutePath(target)
    const overwrite = options?.overwrite ?? false
    if (!overwrite && (await this.fileExists(target))) {
      throw new Error(
        `[renoun] Cannot copy because target already exists: ${target}`
      )
    }
    if (overwrite) {
      await rm(targetPath, { recursive: true, force: true })
    }
    const targetDirectory = dirname(targetPath)
    if (targetDirectory && targetDirectory !== '.' && targetDirectory !== '/') {
      await mkdir(targetDirectory, { recursive: true })
    }
    await cp(sourcePath, targetPath, {
      recursive: true,
      force: overwrite,
      errorOnExist: !overwrite,
    })
  }

  isFilePathGitIgnored(filePath: string): boolean {
    this.#ensureRepoReadySync()
    const relativePath = this.#normalizeRepoPath(filePath)
    if (!relativePath) {
      return false
    }
    const result = spawnSync(
      'git',
      ['check-ignore', '-q', '--', relativePath],
      {
        cwd: this.repoRoot,
        stdio: 'ignore',
      }
    )
    return result.status === 0
  }

  close() {
    if (this.#closed) {
      return
    }
    this.#closed = true
    this.#git?.close()
  }

  [Symbol.dispose]() {
    this.close()
  }

  #normalizeRepoPath(path: string): string {
    const normalized = normalizeSlashes(String(path || '')).trim()
    if (!normalized || normalized === '.' || normalized === './') {
      return ''
    }
    let relative = normalized
    if (relative.startsWith('/')) {
      relative = relative.slice(1)
    }
    if (relative.startsWith('./')) {
      relative = relative.slice(2)
    }
    assertSafeRepoPath(relative)
    return relative
  }

  #resolveRepoAbsolutePath(path: string): string {
    const absolutePath = this.getAbsolutePath(path)
    this.#assertWithinRepo(absolutePath)
    return absolutePath
  }

  #assertWithinRepo(path: string) {
    const repoRoot = this.repoRoot
    const absolutePath = resolve(path)
    const relativeToRoot = relativePath(repoRoot, absolutePath)

    if (relativeToRoot.startsWith('..') || relativeToRoot.startsWith('../')) {
      throw new Error(
        `[renoun] Attempted to access a path outside of the repository root.\n` +
          `  Repository root: ${repoRoot}\n` +
          `  Provided path:   ${path}\n` +
          `  Resolved path:   ${absolutePath}\n` +
          'Accessing files outside of the repository is not allowed.'
      )
    }

    const realRepoRoot = realpathSync(repoRoot)
    const realTargetPath = this.#resolveRealPath(absolutePath)
    const realRelative = relative(realRepoRoot, realTargetPath)

    if (realRelative.startsWith('..') || realRelative.startsWith('../')) {
      throw new Error(
        `[renoun] Attempted to access a path outside of the repository root via symlink.\n` +
          `  Repository root: ${repoRoot}\n` +
          `  Provided path:   ${path}\n` +
          `  Resolved path:   ${absolutePath}\n` +
          `  Real target path: ${realTargetPath}\n` +
          'Accessing files outside of the repository is not allowed.'
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

  #readDirectorySyncInternal(path: string): DirectoryEntry[] {
    const relativePath = this.#normalizeRepoPath(path)
    const spec = relativePath ? `${this.ref}:${relativePath}` : this.ref
    const result = spawnSync('git', ['ls-tree', '-z', spec], {
      cwd: this.repoRoot,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      const stderr = result.stderr?.trim()
      throw new Error(
        `[renoun] Failed to read directory "${path}"${
          stderr ? `: ${stderr}` : ''
        }`
      )
    }
    return parseLsTreeOutput(result.stdout || '', relativePath)
  }

  async #readDirectoryInternal(path: string): Promise<DirectoryEntry[]> {
    const relativePath = this.#normalizeRepoPath(path)
    const spec = relativePath ? `${this.ref}:${relativePath}` : this.ref
    const result = await spawnWithResult('git', ['ls-tree', '-z', spec], {
      cwd: this.repoRoot,
      maxBuffer: this.maxBufferBytes,
      verbose: false,
    })
    if (result.status !== 0) {
      const stderr = result.stderr?.trim()
      throw new Error(
        `[renoun] Failed to read directory "${path}"${
          stderr ? `: ${stderr}` : ''
        }`
      )
    }
    return parseLsTreeOutput(result.stdout, relativePath)
  }

  #readFileSyncInternal(path: string): string {
    const relativePath = this.#normalizeRepoPath(path)
    const spec = relativePath ? `${this.ref}:${relativePath}` : this.ref
    const result = spawnSync('git', ['cat-file', '-p', spec], {
      cwd: this.repoRoot,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      const stderr = result.stderr?.trim()
      throw new Error(
        `[renoun] Failed to read file "${path}"${stderr ? `: ${stderr}` : ''}`
      )
    }
    return result.stdout ?? ''
  }

  #readFileBinarySyncInternal(path: string): Uint8Array {
    const relativePath = this.#normalizeRepoPath(path)
    const spec = relativePath ? `${this.ref}:${relativePath}` : this.ref
    const result = spawnSync('git', ['cat-file', '-p', spec], {
      cwd: this.repoRoot,
      stdio: 'pipe',
      encoding: 'buffer',
      maxBuffer: this.maxBufferBytes,
    })
    if (result.status !== 0) {
      const stderr = result.stderr?.toString().trim()
      throw new Error(
        `[renoun] Failed to read file "${path}"${stderr ? `: ${stderr}` : ''}`
      )
    }
    const buffer = result.stdout ?? Buffer.from('')
    return new Uint8Array(buffer)
  }

  async #readFileBinaryInternal(path: string): Promise<Uint8Array> {
    const relativePath = this.#normalizeRepoPath(path)
    const spec = relativePath ? `${this.ref}:${relativePath}` : this.ref
    const buffer = await spawnWithBuffer('git', ['cat-file', '-p', spec], {
      cwd: this.repoRoot,
      maxBuffer: this.maxBufferBytes,
      verbose: false,
    })
    return new Uint8Array(buffer)
  }

  #ensureRepoReadySync(
    scopeDirectories: string[] = this.prepareScopeDirectories
  ) {
    if (this.#repoReady) {
      this.#ensureCachedScopeSync(scopeDirectories)
      if (!this.#git) {
        this.#git = new GitObjectStore(this.repoRoot)
      }
      return this.repoRoot
    }

    if (this.#repoRootPromise) {
      throw new Error(
        '[LocalGitFileSystem] Repository initialization in progress (async).'
      )
    }

    let resolved: string
    let prepared = false
    try {
      resolved = getRepoRootSync(this.repoRoot)
    } catch (error) {
      if (!this.autoPrepare || !this.repositoryIsRemote) {
        throw error
      }
      resolved = ensureCacheCloneSync({
        spec: this.repository,
        cacheDirectory: this.cacheDirectory,
        transport: this.prepareTransport,
        verbose: this.verbose,
        depth: this.cloneDepth,
      })
      prepared = true
    }

    this.repoRoot = resolved
    if (!this.#git) {
      this.#git = new GitObjectStore(this.repoRoot)
    }
    if (!prepared && looksLikeCacheClone(this.repoRoot, this.cacheDirectory)) {
      this.#maybeUpdateCachedRepoForRefSync(this.ref)
    }
    this.#ensureCachedScopeSync(scopeDirectories)
    this.#repoReady = true
    return this.repoRoot
  }

  #ensureCachedScopeSync(scopeDirectories: string[]) {
    if (!looksLikeCacheClone(this.repoRoot, this.cacheDirectory)) {
      return
    }
    if (!scopeDirectories.length && this.#preparedScope.size === 0) {
      return
    }
    const { merged } = mergeScopeDirectories(
      this.#preparedScope,
      scopeDirectories
    )
    ensureCachedScopeSync(this.repoRoot, merged, this.verbose)
    this.#preparedScope = new Set(merged)
  }

  #maybeUpdateCachedRepoForRefSync(ref: string) {
    if (!looksLikeCacheClone(this.repoRoot, this.cacheDirectory)) {
      return
    }
    if (!this.autoFetch || isFullSha(ref)) {
      return
    }

    const localSha = getLocalRefShaSync(this.repoRoot, ref)
    const { remote, ref: remoteRef } = getRemoteRefQuery(ref, this.fetchRemote)
    const remoteSha = getRemoteRefShaSync(this.repoRoot, remote, remoteRef)
    if (!remoteSha || localSha === remoteSha) {
      return
    }

    if (this.verbose) {
      console.log(
        `[LocalGitFileSystem] Cached ref "${ref}" moved; fetching ${remote}…`
      )
    }
    const result = spawnSync('git', ['fetch', '--quiet', remote], {
      cwd: this.repoRoot,
      stdio: 'pipe',
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    if (result.status !== 0 && this.verbose) {
      const msg = result.stderr?.trim() || 'unknown error'
      console.warn(`[LocalGitFileSystem] Fetch failed (${remote}): ${msg}`)
    }
  }

  async #getOrParseExportsForBlob(
    sha: string,
    fileNameForParser: string,
    getContent: () => Promise<string | null>
  ): Promise<Map<string, ExportItem>> {
    assertSafeGitArg(sha, 'sha')

    const cacheKey = getExportParseCacheKey(sha)
    const cached = this.#exportParseCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const content = await getContent()
    if (content == null) {
      return new Map()
    }

    const parsed = scanModuleExports(fileNameForParser, content)
    this.#exportParseCache.set(cacheKey, parsed)
    return parsed
  }

  async #gitLogCached(
    ref: string,
    path: string | string[],
    options: { reverse?: boolean; limit?: number; follow?: boolean } = {}
  ): Promise<GitLogCommit[]> {
    await this.#ensureRepoReady()
    const paths = Array.isArray(path) ? path.join('\x00') : path
    const key = `${ref}\x01${paths}\x01${options.reverse ? 1 : 0}\x01${options.limit ?? ''}\x01${options.follow ? 1 : 0}`

    let cachedLog = this.#gitLogCache.get(key)
    if (!cachedLog) {
      cachedLog = gitLogForPath(this.repoRoot, ref, path, {
        reverse: Boolean(options.reverse),
        limit: options.limit,
        follow: Boolean(options.follow),
        maxBufferBytes: this.maxBufferBytes,
      })
      this.#gitLogCache.set(key, cachedLog)
    }

    return cachedLog
  }

  async #gitRenameNewToOldBetween(
    oldCommit: string,
    newCommit: string,
    scopeDirectories: string[]
  ): Promise<Map<string, string>> {
    const args = [
      'diff',
      '--name-status',
      '-M',
      '--diff-filter=R',
      '-z',
      oldCommit,
      newCommit,
    ]
    if (scopeDirectories.length) {
      args.push('--', ...scopeDirectories)
    }

    let stdout = ''
    try {
      stdout = await spawnAsync('git', args, {
        cwd: this.repoRoot,
        maxBuffer: this.maxBufferBytes,
        verbose: this.verbose,
      })
    } catch {
      return new Map()
    }

    const out = String(stdout)
    if (!out) {
      return new Map()
    }

    const parts = out.split('\0').filter(Boolean)
    const map = new Map<string, string>()

    for (let index = 0; index < parts.length; ) {
      const status = parts[index++]
      if (!status) {
        continue
      }
      if (status.startsWith('R')) {
        const oldPath = parts[index++] ?? ''
        const newPath = parts[index++] ?? ''
        if (oldPath && newPath)
          map.set(normalizePath(newPath), normalizePath(oldPath))
        continue
      }
      index++
    }

    return map
  }

  async #getCommitUnix(commit: string): Promise<number> {
    const out = await spawnAsync(
      'git',
      ['show', '-s', '--format=%at', commit],
      {
        cwd: this.repoRoot,
        maxBuffer: this.maxBufferBytes,
        verbose: this.verbose,
      }
    )
    return Number(out.trim()) || 0
  }

  async #buildCommitReleaseMap(
    contentCommits: ExportHistoryCommit[],
    scopeDirectories: string[],
    startCommit: string | null
  ): Promise<Map<string, string>> {
    // Build commit -> earliest containing release map using git ancestry
    // This correctly handles branches/merges where timestamps don't reflect ancestry
    const commitToRelease = new Map<string, string>()

    // Get set of commits we actually need to map
    const neededCommits = new Set(contentCommits.map((commit) => commit.sha))
    if (startCommit) {
      neededCommits.add(startCommit)
    }

    // Find earliest commit timestamp to skip old tags
    const earliestUnix = Math.min(
      ...contentCommits.map((commit) => commit.unix)
    )

    if (this.verbose) {
      console.log(
        `[LocalGitFileSystem] Building release map for ${neededCommits.size} commits (earliest: ${new Date(earliestUnix * 1000).toISOString()})...`
      )
    }

    // Get release tags with their commit dates to filter
    const tagDateResult = await spawnWithResult(
      'git',
      ['tag', '-l', '--format=%(refname:short) %(creatordate:unix)'],
      { cwd: this.repoRoot, maxBuffer: this.maxBufferBytes }
    )

    const tagDates = new Map<string, number>()
    for (const line of tagDateResult.stdout.trim().split('\n')) {
      const [tag, unix] = line.split(' ')
      const timestamp = Number(unix)
      if (tag && Number.isFinite(timestamp)) {
        tagDates.set(tag, timestamp)
      }
    }

    // Sort by the creation date. If dates are identical, fallback to alphabetical sort for stability.
    const allReleaseTags = Array.from(tagDates.keys()).sort((a, b) => {
      const dateA = tagDates.get(a) ?? 0
      const dateB = tagDates.get(b) ?? 0

      if (dateA !== dateB) {
        return dateA - dateB
      }
      return a.localeCompare(b)
    })

    // Find the first tag that could possibly contain our commits
    // (tag date must be >= earliest commit date, with some buffer for safety)
    const bufferSeconds = 30 * 24 * 60 * 60 // 30 days buffer
    let startIdx = 0
    for (let index = 0; index < allReleaseTags.length; index++) {
      const tagDate = tagDates.get(allReleaseTags[index]) ?? 0
      if (tagDate >= earliestUnix - bufferSeconds) {
        // Start one tag earlier to be safe
        startIdx = Math.max(0, index - 1)
        break
      }
    }

    const releaseTags = allReleaseTags.slice(startIdx)

    if (this.verbose) {
      console.log(
        `[LocalGitFileSystem] Processing ${releaseTags.length}/${allReleaseTags.length} relevant tags (starting from ${releaseTags[0] || 'none'})...`
      )
    }

    // Build tag ranges for parallel processing
    const tagRanges = releaseTags.map((tag, i) => ({
      tag,
      range:
        i > 0
          ? `${releaseTags[i - 1]}..${tag}`
          : startIdx > 0
            ? `${allReleaseTags[startIdx - 1]}..${tag}`
            : tag,
    }))

    // Run git rev-list calls in parallel batches, scoped to our paths
    // This is similar to sparse checkout - only get commits touching our entry paths
    const REV_LIST_BATCH = 30
    const rangeResults: Array<{ tag: string; commits: string[] }> = []

    for (let index = 0; index < tagRanges.length; index += REV_LIST_BATCH) {
      const batch = tagRanges.slice(index, index + REV_LIST_BATCH)
      const batchResults = await Promise.all(
        batch.map(async ({ tag, range }) => {
          try {
            // Add -- <paths> to only get commits that touch our scope directories
            const args = ['rev-list', range, '--', ...scopeDirectories]
            const result = await spawnAsync('git', args, {
              cwd: this.repoRoot,
              maxBuffer: this.maxBufferBytes,
            })
            return {
              tag,
              commits: result.trim().split('\n').filter(Boolean),
            }
          } catch {
            return { tag, commits: [] }
          }
        })
      )
      rangeResults.push(...batchResults)
    }

    // Process results - only store commits we actually need
    let mappedCount = 0
    for (const { tag, commits } of rangeResults) {
      for (const commit of commits) {
        if (neededCommits.has(commit) && !commitToRelease.has(commit)) {
          commitToRelease.set(commit, tag)
          mappedCount++
        }
      }
      // Early exit if we've mapped all needed commits
      if (mappedCount >= neededCommits.size) {
        break
      }
    }

    if (this.verbose) {
      console.log(
        `[LocalGitFileSystem] Release map: ${commitToRelease.size}/${neededCommits.size} commits mapped`
      )
    }

    return commitToRelease
  }

  /** Get the export history of a repository based on a set of entry files. */
  async getExportHistory(
    options: ExportHistoryOptions
  ): Promise<ExportHistoryReport> {
    this.#assertOpen()

    const startRef = options.startRef
    const endRef = options.endRef ?? this.ref

    const entryArgs = Array.isArray(options.entry)
      ? options.entry
      : [options.entry]
    const entrySources = entryArgs.length ? entryArgs : ['.']
    const uniqueEntrySources = Array.from(
      new Set(
        entrySources.map((path) => normalizePath(String(path))).filter(Boolean)
      )
    )

    // Used for cheap per-commit rename detection (git's rename heuristics).
    // We scope to the *directories* of entry files, so renames like `a.js -> b.js` are discoverable.
    const diffScopePaths = Array.from(
      new Set(
        uniqueEntrySources.map((source) =>
          looksLikeFilePath(source) ? dirname(source) : source
        )
      )
    ).filter(Boolean)

    // Strict Validation: Only accept code files as entry points
    for (const source of uniqueEntrySources) {
      if (looksLikeFilePath(source) && !hasJavaScriptLikeExtension(source)) {
        throw new Error(
          `Invalid entry file: "${source}". Only JavaScript/TypeScript source files are allowed.`
        )
      }
    }

    const scopeDirectories = Array.from(
      new Set(
        uniqueEntrySources
          .map((path) =>
            looksLikeFilePath(path) ? dirname(path) : normalizePath(path)
          )
          .map((path) => normalizePath(String(path)))
          .filter(Boolean)
      )
    )

    await this.#ensureRepoReady(scopeDirectories)

    let startCommit: string | null = null
    let endCommit: string
    if (startRef) {
      startCommit = await this.#resolveRefToCommit(startRef)
      if (!startCommit) {
        throw new Error(`[LocalGitFileSystem] Invalid startRef: "${startRef}"`)
      }
    }
    if (options.endRef) {
      const resolved = await this.#resolveRefToCommit(endRef)
      if (!resolved) {
        throw new Error(`[LocalGitFileSystem] Invalid endRef: "${endRef}"`)
      }
      endCommit = resolved
    } else {
      endCommit = await this.#getRefCommit()
    }

    const maxDepth = options.maxDepth ?? this.maxDepth
    const limit = options.limit
    const detectUpdates = options.detectUpdates ?? true
    const updateMode = options.updateMode ?? 'signature'
    const exportHistoryCacheVersion = 10
    const keyObject = {
      cacheVersion: exportHistoryCacheVersion,
      ref: endRef,
      refCommit: endCommit,
      startRef: startRef ?? null,
      startCommit: startCommit ?? null,
      include: scopeDirectories,
      limit,
      maxDepth,
      detectUpdates,
      updateMode,
      entry: uniqueEntrySources,
    }
    const diskKey = JSON.stringify(keyObject)
    const diskPath = this.#cachePath(['public-api'], diskKey)

    // Memory cache first (this also helps subsequent calls in-process)
    const memoryHit = this.#exportHistoryMemory.get(diskPath)
    if (memoryHit) {
      return memoryHit
    }

    const diskHit = this.#readCache(diskPath)
    if (diskHit) {
      this.#exportHistoryMemory.set(diskPath, diskHit)
      return diskHit
    }

    // Fetch content history
    const logRef = startCommit ? `${startCommit}..${endCommit}` : endCommit
    const contentCommits = await this.#gitLogCached(logRef, scopeDirectories, {
      reverse: true, // Oldest to Newest
      limit,
    })

    if (contentCommits.length === 0) {
      throw new Error(
        `No commits found for paths "${scopeDirectories.join(', ')}" in ref "${endRef}".`
      )
    }

    const commitToRelease = await this.#buildCommitReleaseMap(
      contentCommits,
      scopeDirectories,
      startCommit
    )

    function findRelease(commitSha: string): string | undefined {
      return commitToRelease.get(commitSha)
    }

    // Attach release info
    const uniqueCommits: ExportHistoryCommit[] = contentCommits.map(
      (commit) => ({
        ...commit,
        release: commit.tags?.length ? commit.tags[0] : findRelease(commit.sha),
      })
    )

    // Prepare processing
    const latestCommit = uniqueCommits[uniqueCommits.length - 1].sha
    const entryRelatives: string[] = []

    const git = this.#git!
    for (const source of uniqueEntrySources) {
      if (looksLikeFilePath(source)) {
        entryRelatives.push(source)
        continue
      }
      const inferred = await inferEntryFile(git, latestCommit, source)
      if (inferred) {
        entryRelatives.push(inferred)
      }
    }

    const uniqueEntryRelatives = Array.from(new Set(entryRelatives))
    if (uniqueEntryRelatives.length === 0) {
      throw new Error(`Could not resolve any entry files.`)
    }

    // shared parse cache (blob SHA -> parsed exports) so later module metadata does not redo parsing work.
    const blobCache = this.#exportParseCache
    const exports: ExportHistoryReport['exports'] = Object.create(null)
    const parseWarnings: string[] = []

    // Map<ExportName, Map<ExportId, ExportItem>>
    let previousExports: Map<string, Map<string, ExportItem>> | null = null
    let previousCommitHash: string | null = null
    let cacheHits = 0
    let cacheMisses = 0

    const BATCH_SIZE = 8

    async function processCommit(commit: ExportHistoryCommit) {
      let hasEntry = false
      const currentExports = new Map<string, Map<string, ExportItem>>()

      const context: CollectContext = {
        maxDepth,
        blobCache,
        scopeDirectories,
        parseWarnings,
        git,
        commit: commit.sha,
        cacheStats: { hits: 0, misses: 0 },
        metaCache: new Map(),
        resolveCache: new Map(),
      }

      for (const entryRelative of uniqueEntryRelatives) {
        const entryMeta = await getBlobMetaCached(
          context,
          `${commit.sha}:${entryRelative}`
        )
        if (!entryMeta) {
          continue
        }

        hasEntry = true
        const entryExportMap = await collectExportsFromFile(
          context,
          entryRelative,
          0,
          new Set()
        )

        for (const [name, item] of entryExportMap) {
          let itemsForName = currentExports.get(name)
          if (!itemsForName) {
            itemsForName = new Map()
            currentExports.set(name, itemsForName)
          }
          if (!itemsForName.has(item.id)) {
            itemsForName.set(item.id, item)
          }
        }
      }

      return {
        commit,
        hasEntry,
        currentExports,
        stats: {
          hits: context.cacheStats.hits,
          misses: context.cacheStats.misses,
        },
      }
    }

    if (startCommit) {
      const unix = await this.#getCommitUnix(startCommit)
      const baselineCommit = {
        unix,
        sha: startCommit,
        release: findRelease(startCommit),
        tags: [],
      } satisfies ExportHistoryCommit

      const baseline = await processCommit(baselineCommit)
      cacheHits += baseline.stats.hits
      cacheMisses += baseline.stats.misses

      if (baseline.hasEntry) {
        previousExports = baseline.currentExports
        previousCommitHash = baselineCommit.sha
      }
    }

    for (
      let batchStart = 0;
      batchStart < uniqueCommits.length;
      batchStart += BATCH_SIZE
    ) {
      const batch = uniqueCommits.slice(batchStart, batchStart + BATCH_SIZE)
      const results = await Promise.all(batch.map(processCommit))

      for (const result of results) {
        let currentExports = result.currentExports
        cacheHits += result.stats.hits
        cacheMisses += result.stats.misses

        if (!result.hasEntry) {
          if (previousExports) {
            currentExports = previousExports
          } else {
            continue
          }
        }

        const changeBase = {
          sha: result.commit.sha,
          unix: result.commit.unix,
          date: new Date(result.commit.unix * 1000).toISOString(),
          release: result.commit.release,
        }

        if (previousExports !== null) {
          const { previousById, currentById, previousNamesById } =
            buildExportComparisonMaps(previousExports, currentExports)

          const removedIds: string[] = []
          for (const id of previousById.keys()) {
            if (!currentById.has(id)) {
              removedIds.push(id)
            }
          }
          // Rename detection uses a same-file pass first, then an optional
          // cross-file pass for unmatched items within the same commit. The
          // cross-file pass is conservative (requires unique hash matches)
          // to avoid false positives.
          const renamePairs = new Map<string, { oldId: string }>()
          const usedRemovedIds = new Set<string>()

          interface Candidate {
            addedId: string
            removedId: string
            score: number
          }

          const byFileAdded = new Map<string, string[]>()
          const byFileRemoved = new Map<string, string[]>()

          const renamedFileGroups = new Set<string>()
          let fileRenameNewToOld = new Map<string, string>()

          // If there are removed+added exports but *no* file overlap, it's often a file rename.
          // In that case, ask git for rename pairs so we can compare "new file" exports against
          // "old file" exports even when signatures change (e.g. UniformsNode -> UniformArrayNode).
          if (
            previousCommitHash &&
            previousCommitHash !== result.commit.sha &&
            removedIds.length
          ) {
            const removedFiles = new Set<string>()
            for (const removedId of removedIds) {
              const parsed = parseExportId(removedId)
              if (parsed) {
                removedFiles.add(parsed.file)
              }
            }

            let hasNew = false
            let hasOverlap = false
            for (const id of currentById.keys()) {
              if (previousById.has(id)) {
                continue
              }
              const parsed = parseExportId(id)
              if (!parsed) {
                continue
              }
              hasNew = true
              if (removedFiles.has(parsed.file)) {
                hasOverlap = true
                break
              }
            }

            if (hasNew && !hasOverlap) {
              fileRenameNewToOld = await this.#gitRenameNewToOldBetween(
                previousCommitHash,
                result.commit.sha,
                diffScopePaths
              )
            }
          }

          for (const id of currentById.keys()) {
            if (previousById.has(id)) {
              continue
            }
            const parsed = parseExportId(id)
            if (!parsed) {
              continue
            }

            const mapped = fileRenameNewToOld.get(parsed.file)
            const fileKey = mapped ?? parsed.file
            if (mapped) {
              renamedFileGroups.add(fileKey)
            }

            const list = byFileAdded.get(fileKey)
            if (list) {
              list.push(id)
            } else {
              byFileAdded.set(fileKey, [id])
            }
          }

          for (const removedId of removedIds) {
            if (usedRemovedIds.has(removedId)) {
              continue
            }
            const parsed = parseExportId(removedId)
            if (!parsed) {
              continue
            }
            const list = byFileRemoved.get(parsed.file)
            if (list) {
              list.push(removedId)
            } else {
              byFileRemoved.set(parsed.file, [removedId])
            }
          }

          for (const [file, addedIds] of byFileAdded) {
            const removedInFile = byFileRemoved.get(file)
            if (!removedInFile || removedInFile.length === 0) {
              continue
            }

            const candidates: Candidate[] = []

            for (const addedId of addedIds) {
              const addedItem = currentById.get(addedId)
              if (!addedItem) {
                continue
              }

              for (const removedId of removedInFile) {
                if (usedRemovedIds.has(removedId)) {
                  continue
                }
                const removedItem = previousById.get(removedId)
                if (!removedItem) {
                  continue
                }

                // Tier 1: exact signature hash (treat as perfect)
                if (removedItem.signatureHash === addedItem.signatureHash) {
                  candidates.push({ addedId, removedId, score: 1 })
                  continue
                }

                // Tier 2: Dice similarity on signatureText
                if (addedItem.signatureText && removedItem.signatureText) {
                  const score = getDiceSimilarity(
                    addedItem.signatureText,
                    removedItem.signatureText
                  )
                  const min = renamedFileGroups.has(file)
                    ? RENAME_SIGNATURE_DICE_MIN_RENAMED_FILE
                    : RENAME_SIGNATURE_DICE_MIN
                  if (score >= min) {
                    candidates.push({ addedId, removedId, score })
                  }
                }
              }
            }

            if (candidates.length === 0) {
              continue
            }

            // Sort best-first and greedily select non-conflicting pairs.
            candidates.sort(
              (candidateA, candidateB) => candidateB.score - candidateA.score
            )

            const usedAdded = new Set<string>()
            const usedRemovedLocal = new Set<string>()
            const bestByAdded = new Map<string, number>()
            const secondByAdded = new Map<string, number>()

            for (const candidate of candidates) {
              const best = bestByAdded.get(candidate.addedId)
              if (best === undefined) {
                bestByAdded.set(candidate.addedId, candidate.score)
              } else {
                const second = secondByAdded.get(candidate.addedId)
                if (second === undefined && candidate.score < best) {
                  secondByAdded.set(candidate.addedId, candidate.score)
                }
              }
            }

            for (const candidate of candidates) {
              if (usedAdded.has(candidate.addedId)) {
                continue
              }
              if (usedRemovedLocal.has(candidate.removedId)) {
                continue
              }
              if (usedRemovedIds.has(candidate.removedId)) {
                continue
              }

              if (candidate.score < 1) {
                const best =
                  bestByAdded.get(candidate.addedId) ?? candidate.score
                const second = secondByAdded.get(candidate.addedId)
                if (
                  second !== undefined &&
                  best - second < RENAME_SIGNATURE_DICE_MARGIN
                )
                  continue
              }

              renamePairs.set(candidate.addedId, { oldId: candidate.removedId })
              usedAdded.add(candidate.addedId)
              usedRemovedLocal.add(candidate.removedId)
              usedRemovedIds.add(candidate.removedId)
            }
          }

          detectCrossFileRenames(
            previousById,
            currentById,
            removedIds,
            usedRemovedIds,
            renamePairs,
            RENAME_PATH_DICE_MIN,
            RENAME_SIGNATURE_DICE_MARGIN
          )

          const addedIds = new Set<string>()
          const renamedIds = new Set<string>()
          const updatedIds = new Set<string>()
          const deprecatedIds = new Set<string>()

          for (const [name, currentItems] of currentExports) {
            const previousItems = previousExports.get(name)
            for (const [id, currentExportItem] of currentItems) {
              const renameInfo = renamePairs.get(id)
              let history = exports[id]
              if (!history) {
                history = []
                exports[id] = history
              }

              const previousDeprecated = renameInfo?.oldId
                ? previousById.get(renameInfo.oldId)?.deprecated
                : (previousById.get(id)?.deprecated ??
                  previousItems?.get(id)?.deprecated)
              const willDeprecate =
                currentExportItem.deprecated &&
                !previousDeprecated &&
                !deprecatedIds.has(id)

              if (renameInfo) {
                history = mergeRenameHistory(exports, id, renameInfo.oldId)

                if (!renamedIds.has(id)) {
                  // Parse IDs to determine what changed (file, name, or both)
                  const currentParsed = parseExportId(id)
                  const previousParsed = parseExportId(renameInfo.oldId)
                  const oldExportName = previousById.get(renameInfo.oldId)?.name

                  // Only set previousName if the export name actually changed
                  const previousName =
                    oldExportName && oldExportName !== name
                      ? oldExportName
                      : undefined

                  // Only set previousFilePath if the file path actually changed
                  const previousFilePath =
                    currentParsed &&
                    previousParsed &&
                    currentParsed.file !== previousParsed.file
                      ? previousParsed.file
                      : undefined

                  history.push({
                    ...changeBase,
                    kind: 'Renamed',
                    name,
                    filePath: currentParsed!.file,
                    id,
                    previousName,
                    previousFilePath,
                    previousId: renameInfo.oldId,
                  })
                  renamedIds.add(id)
                }
              } else if (!previousItems || !previousItems.has(id)) {
                const previousNames = previousNamesById.get(id)
                if (previousNames && previousNames.size > 0) {
                  if (!renamedIds.has(id)) {
                    // Same ID but different export name - only the alias changed
                    // Get the previous name(s) and pick one that's different from current
                    let actualPreviousName: string | undefined
                    for (const previousName of previousNames) {
                      if (previousName !== name) {
                        actualPreviousName = previousName
                        break
                      }
                    }

                    history.push({
                      ...changeBase,
                      kind: 'Renamed',
                      name,
                      filePath: parseExportId(id)?.file ?? '',
                      id,
                      previousName: actualPreviousName,
                      // previousFilePath is undefined - same ID means same file
                      previousId: id,
                    })
                    renamedIds.add(id)
                  }
                } else if (!addedIds.has(id)) {
                  const collapsed = checkAndCollapseOscillation(
                    history,
                    'Added',
                    changeBase.release
                  )
                  if (!collapsed) {
                    history.push({
                      ...changeBase,
                      kind: 'Added',
                      name,
                      filePath: parseExportId(id)?.file ?? '',
                      id,
                    })
                  }
                  addedIds.add(id)
                }
              } else if (detectUpdates && !willDeprecate) {
                const previousExportItem = previousItems.get(id)!
                const signatureChanged =
                  previousExportItem.signatureHash !==
                  currentExportItem.signatureHash
                const bodyChanged =
                  previousExportItem.bodyHash !== currentExportItem.bodyHash
                const shouldRecord =
                  updateMode === 'signature' ? signatureChanged : bodyChanged
                if (shouldRecord) {
                  if (!updatedIds.has(id)) {
                    history.push({
                      ...changeBase,
                      kind: 'Updated',
                      name,
                      filePath: parseExportId(id)?.file ?? '',
                      id,
                      signature: signatureChanged,
                    })
                    updatedIds.add(id)
                  }
                }
              }
              if (willDeprecate) {
                history.push({
                  ...changeBase,
                  kind: 'Deprecated',
                  name,
                  filePath: parseExportId(id)?.file ?? '',
                  id,
                  message: currentExportItem.deprecatedMessage,
                })
                deprecatedIds.add(id)
              }
            }
          }

          for (const removedId of removedIds) {
            if (usedRemovedIds.has(removedId)) {
              continue
            }
            const history = exports[removedId]
            if (!history) {
              continue
            }
            const removedItem = previousById.get(removedId)
            if (!removedItem) {
              continue
            }
            const collapsed = checkAndCollapseOscillation(
              history,
              'Removed',
              changeBase.release
            )
            if (collapsed && history.length === 0) {
              // History is now empty, remove the export entry entirely
              delete exports[removedId]
            } else if (!collapsed) {
              history.push({
                ...changeBase,
                kind: 'Removed',
                name: removedItem.name,
                filePath: parseExportId(removedId)?.file ?? '',
                id: removedId,
              })
            }
          }
        } else {
          const addedIds = new Set<string>()
          for (const [name, currentItems] of currentExports) {
            for (const [id] of currentItems) {
              let history = exports[id]
              if (!history) {
                history = []
                exports[id] = history
              }
              if (!addedIds.has(id)) {
                history.push({
                  ...changeBase,
                  kind: 'Added',
                  name,
                  filePath: parseExportId(id)?.file ?? '',
                  id,
                })
                addedIds.add(id)
              }
            }
          }
        }

        previousExports = currentExports
        previousCommitHash = result.commit.sha
      }
    }

    const nameToId: Record<string, string[]> = Object.create(null)
    if (previousExports) {
      for (const [name, ids] of previousExports) {
        const sorted = Array.from(ids.keys()).sort()
        if (sorted.length > 0) {
          nameToId[name] = sorted
        }
      }
    }

    const report: ExportHistoryReport = {
      generatedAt: new Date().toISOString(),
      repo: this.repoRoot,
      entryFiles: uniqueEntryRelatives,
      exports,
      nameToId,
      ...(parseWarnings.length ? { parseWarnings } : {}),
    }

    if (this.verbose) {
      const denom = cacheHits + cacheMisses
      const pct = denom ? ((cacheHits / denom) * 100).toFixed(1) : '0.0'
      console.log(
        `[LocalGitFileSystem] public API scan done (parse cache hit rate: ${pct}%)`
      )
      if (parseWarnings.length)
        console.log(
          `[LocalGitFileSystem] parseWarnings=${parseWarnings.length}`
        )
    }

    this.#writeCache(diskPath, report)
    this.#exportHistoryMemory.set(diskPath, report)
    return report
  }

  /** Get metadata for a file or module. */
  async getMetadata<const Path extends string>(
    /** The path to the file or module. */
    filePath: Path
  ): Promise<MetadataForPath<Path>> {
    this.#assertOpen()

    const path = this.#normalizeToRepoPath(filePath)
    const result = hasJavaScriptLikeExtension(path)
      ? await this.getModuleMetadata(path)
      : await this.getFileMetadata(path)

    return result as MetadataForPath<Path>
  }

  /** Get metadata for a file. */
  async getFileMetadata(filePath: string): Promise<GitFileMetadata> {
    this.#assertOpen()
    await this.#ensureRepoReady()

    const refCommit = await this.#getRefCommit()
    const relativePath = this.#normalizeToRepoPath(filePath)

    await this.#ensureNotShallow()

    const key = `${refCommit}|${relativePath}`
    const cached = this.#fileMetaCache.get(key)
    if (cached) {
      return cached
    }

    let promise = this.#fileMetaPromises.get(key)
    if (!promise) {
      promise = this.#buildFileMetadata(refCommit, relativePath)
      this.#fileMetaPromises.set(key, promise)
    }

    try {
      const result = await promise
      this.#fileMetaCache.set(key, result)
      return result
    } finally {
      this.#fileMetaPromises.delete(key)
    }
  }

  /** Get metadata for a JavaScript module file (exports at current ref only). */
  async getModuleMetadata(filePath: string): Promise<GitModuleMetadata> {
    this.#assertOpen()
    await this.#ensureRepoReady()

    const base = await this.getFileMetadata(filePath)
    if (!hasJavaScriptLikeExtension(base.path)) {
      return { ...base, kind: 'module', exports: {} }
    }

    const headMeta = await this.#git!.getBlobMeta(
      `${base.refCommit}:${base.path}`
    )
    if (!headMeta) {
      return { ...base, kind: 'module', exports: {} }
    }

    // Parse HEAD once to determine the set of exports that exist at the current ref.
    // This makes module metadata accurate (no “removed” exports included) and also
    // lets the index builder focus on only these names.
    const headExportsMap = await this.#getOrParseExportsForBlob(
      headMeta.sha,
      base.path,
      () => this.#git!.getBlobContentBySha(headMeta.sha)
    )

    const headExportNames = Array.from(headExportsMap.keys()).filter(
      (name) =>
        !name.startsWith('__STAR__') &&
        !name.startsWith('__FROM__') &&
        !name.startsWith('__NAMESPACE__')
    )

    const headExportSet = new Set(headExportNames)

    const index = await this.#buildFileExportIndex(
      base.refCommit,
      base.path,
      headMeta.sha,
      headExportSet
    )

    const exports: Record<string, GitExportMetadata> = {}
    for (const name of headExportNames.sort()) {
      const meta = index.perExport[name]
      if (!meta) {
        continue
      }
      exports[name] = {
        firstCommitDate: meta.firstCommitDate
          ? new Date(meta.firstCommitDate)
          : undefined,
        lastCommitDate: meta.lastCommitDate
          ? new Date(meta.lastCommitDate)
          : undefined,
        firstCommitHash: meta.firstCommitHash ?? undefined,
        lastCommitHash: meta.lastCommitHash ?? undefined,
      }
    }

    return { ...base, kind: 'module', exports }
  }

  #assertOpen() {
    if (this.#closed) {
      throw new Error('LocalGitFileSystem is closed')
    }
  }

  async #ensureCachedScope(scopeDirectories: string[]): Promise<void> {
    if (!looksLikeCacheClone(this.repoRoot, this.cacheDirectory)) {
      return
    }

    const { merged } = mergeScopeDirectories(
      this.#preparedScope,
      scopeDirectories
    )

    // Always run sparse-checkout + backfill for cache clones.
    // The backfill command is idempotent and ensures blobs are available
    // for all commits in the sparse-checkout scope.
    await ensureCachedScope(this.repoRoot, merged, this.verbose)
    this.#preparedScope = new Set(merged)
  }

  async #ensureRepoReady(
    scopeDirectories: string[] = this.prepareScopeDirectories
  ) {
    if (this.#repoReady) {
      await this.#ensureCachedScope(scopeDirectories)
      return this.repoRoot
    }
    if (this.#repoRootPromise) {
      const repoRoot = await this.#repoRootPromise
      await this.#ensureCachedScope(scopeDirectories)
      return repoRoot
    }

    this.#repoRootPromise = (async () => {
      let resolved: string
      let prepared = false
      try {
        resolved = await getRepoRoot(this.repoRoot)
      } catch (error) {
        if (!this.autoPrepare || !this.repositoryIsRemote) {
          throw error
        }
        resolved = await ensureCacheClone({
          spec: this.repository,
          cacheDirectory: this.cacheDirectory,
          transport: this.prepareTransport,
          verbose: this.verbose,
          depth: this.cloneDepth,
        })
        prepared = true
      }

      this.repoRoot = resolved
      if (!this.#git) {
        this.#git = new GitObjectStore(this.repoRoot)
      }
      if (
        !prepared &&
        looksLikeCacheClone(this.repoRoot, this.cacheDirectory)
      ) {
        await this.#maybeUpdateCachedRepoForRef(this.ref)
      }
      await this.#ensureCachedScope(scopeDirectories)
      this.#repoReady = true
      return this.repoRoot
    })()

    try {
      return await this.#repoRootPromise
    } finally {
      this.#repoRootPromise = null
    }
  }

  async #maybeUpdateCachedRepoForRef(ref: string): Promise<void> {
    if (!looksLikeCacheClone(this.repoRoot, this.cacheDirectory)) {
      return
    }
    if (!this.autoFetch) {
      return
    }
    if (isFullSha(ref)) {
      return
    }

    const localSha = await this.#getLocalRefSha(ref)
    const { remote, ref: remoteRef } = getRemoteRefQuery(ref, this.fetchRemote)
    const remoteSha = await this.#getRemoteRefSha(remote, remoteRef)
    if (!remoteSha) {
      return
    }

    if (localSha !== remoteSha) {
      if (this.verbose) {
        console.log(
          `[LocalGitFileSystem] Cached ref "${ref}" moved; fetching ${remote}…`
        )
      }
      const result = await spawnWithResult(
        'git',
        ['fetch', '--quiet', remote],
        {
          cwd: this.repoRoot,
          maxBuffer: this.maxBufferBytes,
          verbose: this.verbose,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        }
      )
      if (result.status !== 0) {
        if (this.verbose) {
          const msg = result.stderr
            ? String(result.stderr).trim()
            : 'unknown error'
          console.warn(`[LocalGitFileSystem] Fetch failed (${remote}): ${msg}`)
        }
        return
      }
      if (await supportsGitBackfill()) {
        await runGitBackfill(this.repoRoot, this.verbose)
      }
    }
  }

  async #getLocalRefSha(ref: string): Promise<string | null> {
    assertSafeGitArg(ref, 'ref')
    const result = await spawnWithResult(
      'git',
      ['rev-parse', '--verify', `${ref}^{commit}`],
      {
        cwd: this.repoRoot,
        maxBuffer: this.maxBufferBytes,
      }
    )
    if (result.status !== 0) {
      return null
    }
    const trimmed = result.stdout.trim()
    return isFullSha(trimmed) ? trimmed : null
  }

  async #getRemoteRefSha(remote: string, ref: string): Promise<string | null> {
    assertSafeGitArg(remote, 'remote')
    assertSafeGitArg(ref, 'ref')

    const cacheKey = `${this.repoRoot}\x00${remote}\x00${ref}`
    const cached = remoteRefCache.get(cacheKey)
    const now = Date.now()
    if (cached && now - cached.checkedAt < REMOTE_REF_CACHE_TTL_MS) {
      return cached.remoteSha
    }

    const result = await spawnWithResult('git', ['ls-remote', remote, ref], {
      cwd: this.repoRoot,
      maxBuffer: this.maxBufferBytes,
      timeoutMs: REMOTE_REF_TIMEOUT_MS,
    })
    if (result.status !== 0) {
      if (this.verbose) {
        if (result.status === 124) {
          console.warn(
            `[LocalGitFileSystem] ls-remote timed out (${remote} ${ref}); skipping update check.`
          )
        }
        const msg = result.stderr
          ? String(result.stderr).trim()
          : 'unknown error'
        console.warn(
          `[LocalGitFileSystem] ls-remote failed (${remote} ${ref}): ${msg}`
        )
      }
      remoteRefCache.set(cacheKey, { remoteSha: null, checkedAt: now })
      return null
    }

    const remoteSha = parseLsRemoteSha(result.stdout)
    remoteRefCache.set(cacheKey, { remoteSha, checkedAt: now })
    return remoteSha
  }

  async #getRefCommit(): Promise<string> {
    if (this.#refCommit) {
      return this.#refCommit
    }
    if (this.#refCommitPromise) {
      return this.#refCommitPromise
    }

    this.#refCommitPromise = (async () => {
      await this.#ensureRepoReady()
      let resolved = await this.#resolveRefToCommit(this.ref)
      if (resolved && !this.autoFetch) {
        return (this.#refCommit = resolved)
      }

      if (this.autoFetch) {
        if (!this.#unshallowPromise) {
          this.#unshallowPromise = this.#ensureFullHistory()
        }
        await this.#unshallowPromise

        if (!resolved) {
          const inferred = inferRemoteAndBranch(this.ref, this.fetchRemote)
          if (inferred) {
            const ok = await this.#tryFetchBranch(
              inferred.remote,
              inferred.branch
            )
            if (ok) {
              resolved = await this.#resolveRefToCommit(this.ref)
            }
          }
        }
      }

      if (resolved) {
        return (this.#refCommit = resolved)
      }

      const fallbacks = expandRefFallbacks(this.ref)
      for (const candidate of fallbacks) {
        const resolvedCommit = await this.#resolveRefToCommit(candidate)
        if (resolvedCommit) {
          if (this.verbose) {
            console.log(
              `[LocalGitFileSystem] ref fallback: "${this.ref}" -> "${candidate}" (${resolvedCommit.slice(0, 7)})`
            )
          }
          return (this.#refCommit = resolvedCommit)
        }
      }

      const refs = await this.#listRefsBrief()
      throw new Error(
        [
          `[LocalGitFileSystem] Could not resolve ref "${this.ref}" in repo "${this.repoRoot}".`,
          `Known refs (sample): ${refs.length ? refs.join(', ') : '(none)'}`,
          `Tip: pass a branch name ("main") or "origin/main", or enable autoFetch.`,
        ].join('\n')
      )
    })()

    try {
      return await this.#refCommitPromise
    } finally {
      this.#refCommitPromise = null
    }
  }

  async #ensureFullHistory(): Promise<void> {
    try {
      await this.#ensureRepoReady()
      const isShallow = await spawnAsync(
        'git',
        ['rev-parse', '--is-shallow-repository'],
        {
          cwd: this.repoRoot,
        }
      )
        .then((out) => out.trim() === 'true')
        .catch(() => false)

      if (isShallow) {
        if (this.verbose) {
          console.log(
            `[LocalGitFileSystem] Shallow repository detected. Fetching full history from ${this.fetchRemote}...`
          )
        }
        await spawnAsync(
          'git',
          ['fetch', '--unshallow', '--quiet', this.fetchRemote],
          {
            cwd: this.repoRoot,
          }
        )
        if (this.verbose) {
          console.log('[LocalGitFileSystem] Unshallow complete.')
        }
      }
    } catch (err: any) {
      if (this.verbose) {
        console.warn(
          `[LocalGitFileSystem] Failed to unshallow repository: ${err.message}`
        )
      }
    }
  }

  async #ensureNotShallow(): Promise<void> {
    await this.#ensureRepoReady()
    const isShallow = await this.#checkShallow()
    if (!isShallow) {
      return
    }

    // If this store is allowed to fetch, try to unshallow once.
    if (this.autoFetch) {
      if (!this.#unshallowPromise) {
        this.#unshallowPromise = this.#ensureFullHistory()
      }
      await this.#unshallowPromise
      // Re-check after attempting to unshallow
      this.#isShallowChecked = false
      if (!(await this.#checkShallow())) {
        return
      }
    }

    throw new Error(shallowRepoErrorMessage())
  }

  async #checkShallow(): Promise<boolean> {
    await this.#ensureRepoReady()
    if (this.#isShallowChecked) {
      return this.#isShallow
    }
    this.#isShallowChecked = true

    try {
      const out = await spawnAsync(
        'git',
        ['rev-parse', '--is-shallow-repository'],
        { cwd: this.repoRoot }
      )
      this.#isShallow = out.trim() === 'true'
      return this.#isShallow
    } catch {
      this.#isShallow = false
      return false
    }
  }

  async #resolveRefToCommit(ref: string): Promise<string | null> {
    assertSafeGitArg(ref, 'ref')
    try {
      await this.#ensureRepoReady()
      const out = await spawnAsync(
        'git',
        ['rev-parse', '--verify', `${ref}^{commit}`],
        {
          cwd: this.repoRoot,
          maxBuffer: this.maxBufferBytes,
        }
      )
      const trimmed = out.trim()
      return /^[0-9a-f]{40}$/i.test(trimmed) ? trimmed : null
    } catch {
      return null
    }
  }

  async #tryFetchBranch(remote: string, branch: string): Promise<boolean> {
    assertSafeGitArg(remote, 'remote')
    assertSafeGitArg(branch, 'branch')

    const dst = `refs/remotes/${remote}/${branch}`
    const src = `refs/heads/${branch}`
    const args = [
      'fetch',
      '--no-tags',
      '--prune',
      '--quiet',
      remote,
      `+${src}:${dst}`,
    ]

    const result = await spawnWithResult('git', args, {
      cwd: this.repoRoot,
      maxBuffer: this.maxBufferBytes,
    })

    if (result.status !== 0) {
      if (this.verbose) {
        const msg = result.stderr
          ? String(result.stderr).trim()
          : 'unknown error'
        console.warn(
          `[LocalGitFileSystem] autoFetch failed (${remote} ${branch}): ${msg}`
        )
      }
      return false
    }

    if (this.verbose) {
      console.log(`[LocalGitFileSystem] autoFetch ok: ${remote} ${branch}`)
    }
    return true
  }

  async #listRefsBrief(): Promise<string[]> {
    const result = await spawnWithResult(
      'git',
      ['show-ref', '--heads', '--remotes'],
      {
        cwd: this.repoRoot,
        maxBuffer: this.maxBufferBytes,
      }
    )
    if (result.status !== 0) {
      return []
    }
    const lines = String(result.stdout).trim().split('\n').filter(Boolean)
    return lines
      .slice(0, 12)
      .map((line) =>
        line
          .split(' ')
          .slice(1)
          .join(' ')
          .replace(/^refs\//, '')
      )
      .filter(Boolean)
  }

  #cachePath(parts: string[], key: string) {
    const repoKey = sha1(this.repoRoot).slice(0, 12)
    const dir = join(this.cacheDirectory, repoKey, ...parts)
    mkdirSync(dir, { recursive: true })
    const name = sha1(key) + '.json'
    return join(dir, name)
  }

  #readCache(path: string): ExportHistoryReport | null {
    try {
      if (!existsSync(path)) return null
      const raw = readFileSync(path, 'utf8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  #writeCache(path: string, report: ExportHistoryReport) {
    try {
      writeFileSync(path, JSON.stringify(report, null, 2), 'utf8')
    } catch {
      // ignore cache errors
    }
  }

  #normalizeToRepoPath(inputPath: string) {
    const path = String(inputPath)
    const absolutePath = isAbsoluteLike(path) ? resolve(path) : null

    let relativePath = path
    if (absolutePath && isSubPath(absolutePath, this.repoRoot)) {
      relativePath = relative(this.repoRoot, absolutePath)
    }

    relativePath = relativePath.split(sep).join('/')
    relativePath = relativePath.replace(/^\.?\//, '')
    relativePath = normalizePath(relativePath)
    assertSafeRepoPath(relativePath)
    return relativePath
  }

  #readFileMetaCache(path: string): GitFileMetadata | null {
    try {
      if (!existsSync(path)) {
        return null
      }
      const raw = readFileSync(path, 'utf8')
      const parsed = JSON.parse(raw)

      const authors: GitAuthor[] = Array.isArray(parsed.authors)
        ? parsed.authors.map((a: any) => ({
            name: String(a.name ?? ''),
            email: String(a.email ?? ''),
            commitCount: Number(a.commitCount ?? 0) || 0,
            firstCommitDate: a.firstCommitDate
              ? new Date(a.firstCommitDate)
              : undefined,
            lastCommitDate: a.lastCommitDate
              ? new Date(a.lastCommitDate)
              : undefined,
          }))
        : []

      return {
        kind: 'file',
        path: String(parsed.path ?? ''),
        ref: String(parsed.ref ?? this.ref),
        refCommit: String(parsed.refCommit ?? ''),
        firstCommitDate: parsed.firstCommitDate
          ? new Date(parsed.firstCommitDate).toISOString()
          : undefined,
        lastCommitDate: parsed.lastCommitDate
          ? new Date(parsed.lastCommitDate).toISOString()
          : undefined,
        firstCommitHash: parsed.firstCommitHash ?? undefined,
        lastCommitHash: parsed.lastCommitHash ?? undefined,
        authors,
      }
    } catch {
      return null
    }
  }

  #writeFileMetaCache(path: string, meta: GitFileMetadata) {
    try {
      writeFileSync(
        path,
        JSON.stringify(
          {
            ...meta,
            firstCommitDate: meta.firstCommitDate,
            lastCommitDate: meta.lastCommitDate,
            authors: meta.authors.map((author) => ({
              ...author,
              firstCommitDate: author.firstCommitDate?.toISOString(),
              lastCommitDate: author.lastCommitDate?.toISOString(),
            })),
            writtenAt: new Date().toISOString(),
          },
          null,
          2
        ),
        'utf8'
      )
    } catch {
      // ignore cache errors
    }
  }

  async #buildFileMetadata(
    refCommit: string,
    relativePath: string
  ): Promise<GitFileMetadata> {
    const diskKey = `${refCommit}|${relativePath}`
    const diskPath = this.#cachePath(['file-meta'], diskKey)

    const diskHit = this.#readFileMetaCache(diskPath)
    if (diskHit) {
      return diskHit
    }

    // `git log` is newest-first by default
    const args = [
      'log',
      '--format=%H%x00%at%x00%aN%x00%aE',
      '--no-patch',
      '--follow',
      refCommit,
      '--',
      relativePath,
    ]

    try {
      const stdout = await spawnAsync('git', args, {
        cwd: this.repoRoot,
        maxBuffer: this.maxBufferBytes,
      })

      const lines = String(stdout).trim().split('\n').filter(Boolean)
      if (lines.length === 0) {
        return {
          kind: 'file',
          path: relativePath,
          ref: this.ref,
          refCommit,
          authors: [],
        }
      }

      const authorsByEmail = new Map<string, GitAuthor>()
      let newest: { hash: string; unix: number } | null = null
      let oldest: { hash: string; unix: number } | null = null

      for (const line of lines) {
        const [hash, unixRaw, nameRaw, emailRaw] = line.split('\0')
        const unix = Number(unixRaw)
        if (!hash || !Number.isFinite(unix)) continue

        if (!newest) {
          newest = { hash, unix }
        }
        oldest = { hash, unix }

        const name = nameRaw ?? ''
        const email = emailRaw ?? ''
        const key = email || name || 'unknown'
        const stamp = new Date(unix * 1000)

        const existing = authorsByEmail.get(key)
        if (!existing) {
          authorsByEmail.set(key, {
            name,
            email,
            commitCount: 1,
            firstCommitDate: stamp,
            lastCommitDate: stamp,
          })
        } else {
          existing.commitCount += 1
          if (!existing.firstCommitDate || stamp < existing.firstCommitDate) {
            existing.firstCommitDate = stamp
          }
          if (!existing.lastCommitDate || stamp > existing.lastCommitDate) {
            existing.lastCommitDate = stamp
          }
        }
      }

      const authors = Array.from(authorsByEmail.values())
        .filter((author) => author.commitCount > 0)
        .sort((authorA, authorB) => authorB.commitCount - authorA.commitCount)

      const meta: GitFileMetadata = {
        kind: 'file',
        path: relativePath,
        ref: this.ref,
        refCommit,
        firstCommitDate: oldest
          ? new Date(oldest.unix * 1000).toISOString()
          : undefined,
        lastCommitDate: newest
          ? new Date(newest.unix * 1000).toISOString()
          : undefined,
        firstCommitHash: oldest?.hash,
        lastCommitHash: newest?.hash,
        authors,
      }

      this.#writeFileMetaCache(diskPath, meta)
      return meta
    } catch (error: unknown) {
      if (this.verbose) {
        console.warn(
          `[LocalGitFileSystem] git log failed for ${relativePath}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
      return {
        kind: 'file',
        path: relativePath,
        ref: this.ref,
        refCommit,
        authors: [],
      }
    }
  }

  async #buildFileExportIndex(
    refCommit: string,
    relPath: string,
    headSha: string,
    // Limit scanning results to exports that exist at HEAD (accurate + faster).
    headExportNames: Set<string>
  ): Promise<FileExportIndex> {
    const diskKey = `${refCommit}|${relPath}|${headSha}`
    const diskPath = this.#cachePath(['file-index'], diskKey)

    const memoryHit = this.#fileExportIndexMemory.get(diskPath)
    if (memoryHit) {
      return memoryHit
    }

    const diskHit = readFileExportIndex(diskPath)
    if (diskHit) {
      this.#fileExportIndexMemory.set(diskPath, diskHit)
      return diskHit
    }

    if (this.verbose)
      console.log(`[LocalGitFileSystem] building file index for ${relPath}…`)

    const commits = await this.#gitLogCached(refCommit, relPath, {
      reverse: true,
      follow: true,
    })

    // Shared parse cache across operations
    const perExport: FileExportIndex['perExport'] = Object.create(null)

    // Helper to fetch/parse with shared cache
    const getExportsBySha = async (sha: string) => {
      return this.#getOrParseExportsForBlob(sha, relPath, () =>
        this.#git!.getBlobContentBySha(sha)
      )
    }

    for (const commit of commits) {
      const meta = await this.#git!.getBlobMeta(`${commit.sha}:${relPath}`)
      if (!meta) {
        continue
      }
      if (meta.size > MAX_PARSE_BYTES) {
        continue
      }

      const exportsMap = await getExportsBySha(meta.sha)

      const stampDate = new Date(commit.unix * 1000).toISOString()
      for (const [name] of exportsMap) {
        if (name.startsWith('__STAR__')) {
          continue
        }
        if (!headExportNames.has(name)) {
          continue
        }

        const previousExport = perExport[name]
        if (!previousExport) {
          perExport[name] = {
            firstCommitDate: stampDate,
            lastCommitDate: stampDate,
            firstCommitHash: commit.sha,
            lastCommitHash: commit.sha,
          }
        } else {
          previousExport.lastCommitDate = stampDate
          previousExport.lastCommitHash = commit.sha
        }
      }
    }

    const index: FileExportIndex = {
      builtAt: new Date().toISOString(),
      repoRoot: this.repoRoot,
      ref: this.ref,
      refCommit,
      path: relPath,
      headBlobSha: headSha,
      perExport,
    }

    try {
      writeFileSync(diskPath, JSON.stringify(index, null, 2), 'utf8')
    } catch {
      // ignore cache errors
    }

    this.#fileExportIndexMemory.set(diskPath, index)
    return index
  }
}

function readFileExportIndex(path: string): FileExportIndex | null {
  try {
    if (!existsSync(path)) {
      return null
    }
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.path !== 'string') {
      return null
    }
    if (typeof parsed.refCommit !== 'string') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

class GitObjectStore {
  readonly repoPath: string
  #check: GitBatchCheck
  #cat: GitBatchCat

  constructor(repoPath: string) {
    this.repoPath = repoPath
    this.#check = new GitBatchCheck(repoPath)
    this.#cat = new GitBatchCat(repoPath)
  }

  async getBlobMeta(specifier: string): Promise<GitObjectMeta | null> {
    assertSafeGitSpec(specifier)
    return taskQueue.run(() => this.#check.getObjectMeta(specifier))
  }

  async getBlobContentBySha(sha: string): Promise<string | null> {
    assertSafeGitArg(sha, 'sha')
    const object = await taskQueue.run(() => this.#cat.getObject(sha))
    if (!object) {
      return null
    }
    return object.content
  }

  async getBlobInfo(
    specifier: string
  ): Promise<{ sha: string; type: string; content: string } | null> {
    const meta = await this.getBlobMeta(specifier)
    if (!meta) {
      return null
    }
    const content = await this.getBlobContentBySha(meta.sha)
    if (content === null) {
      return null
    }
    return { sha: meta.sha, type: meta.type, content }
  }

  close() {
    this.#check.close()
    this.#cat.close()
  }

  [Symbol.dispose]() {
    this.close()
  }
}

const exitHandlers = new Set<() => void>()
let exitListenerAttached = false

function registerExitHandler(handler: () => void) {
  if (!exitListenerAttached) {
    process.once('exit', () => {
      for (const fn of exitHandlers) {
        fn()
      }
    })
    exitListenerAttached = true
  }
  exitHandlers.add(handler)
  return () => exitHandlers.delete(handler)
}

class GitBatchCheck {
  repoPath: string
  #process: ChildProcess
  #queue: Array<{
    resolve: (value: GitObjectMeta | null) => void
    reject: (error: Error) => void
  }>
  #buffer: Buffer
  #closed: boolean

  constructor(repoPath: string) {
    this.repoPath = repoPath
    this.#process = spawn(
      'git',
      ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
      {
        cwd: repoPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        detached: false,
      }
    )
    this.#queue = []
    this.#buffer = Buffer.alloc(0)
    this.#closed = false

    this.#process.stdin?.on('error', (error) => {
      if (!this.#closed) {
        this.#closed = true
        this.#rejectAll(
          new Error(`Git batch-check stdin error: ${(error as Error).message}`)
        )
      }
    })

    this.#process.stdout?.on('data', (chunk: Buffer) => {
      this.#buffer =
        this.#buffer.length === 0
          ? chunk
          : Buffer.concat(
              [this.#buffer, chunk],
              this.#buffer.length + chunk.length
            )
      this.#processBuffer()
    })

    // Drain stderr to prevent blocking (git may write warnings/errors)
    this.#process.stderr?.on('data', () => {})

    this.#process.on('error', (error) => this.#rejectAll(error))

    const onExit = () => this.close()
    const unregister = registerExitHandler(onExit)
    this.#process.on('close', (code: number) => {
      this.#closed = true
      if (this.#queue.length > 0) {
        this.#rejectAll(
          new Error(`git cat-file --batch-check exited with code ${code}`)
        )
      }
      unregister()
    })
  }

  #rejectAll(error: Error) {
    while (this.#queue.length > 0) {
      const { reject } = this.#queue.shift()!
      reject(error)
    }
  }

  #consume(bytes: number) {
    if (bytes <= 0) {
      return
    }
    if (bytes >= this.#buffer.length) {
      this.#buffer = Buffer.alloc(0)
      return
    }
    this.#buffer = this.#buffer.subarray(bytes)
    // If the buffer is large but only a small part is active, copy it to
    // allow the original large buffer to be garbage collected.
    if (this.#buffer.length < 4096 && this.#buffer.byteOffset > 1024 * 1024) {
      const newBuffer = Buffer.allocUnsafe(this.#buffer.length)
      this.#buffer.copy(newBuffer)
      this.#buffer = newBuffer
    }
  }

  #processBuffer() {
    while (this.#queue.length > 0) {
      const newline = this.#buffer.indexOf(10)
      if (newline === -1) {
        return
      }

      const line = this.#buffer.subarray(0, newline).toString('utf8')
      this.#consume(newline + 1)
      const trimmed = line.trim()

      const { resolve } = this.#queue.shift()!

      if (!trimmed) {
        resolve(null)
        continue
      }

      if (trimmed.endsWith(' missing')) {
        resolve(null)
        continue
      }

      const parts = trimmed.split(/\s+/)
      const sha = parts[0]
      const type = parts[1]
      const size = Number(parts[2])

      if (!sha || !type || !Number.isFinite(size)) {
        resolve(null)
        continue
      }

      resolve({ sha, type, size })
    }
  }

  getObjectMeta(spec: string): Promise<GitObjectMeta | null> {
    return new Promise((resolve, reject) => {
      if (this.#closed) {
        return reject(new Error('Git check process closed'))
      }
      this.#queue.push({ resolve, reject })
      try {
        // Handle backpressure, if write returns false, wait for drain.
        const ok = this.#process.stdin?.write(spec + '\n')
        if (!ok) {
          this.#process.stdin?.once('drain', () => {})
        }
      } catch (error) {
        this.#queue.pop() // Remove the just-added entry
        reject(error)
      }
    })
  }

  close() {
    if (this.#closed) {
      return
    }
    this.#closed = true
    this.#rejectAll(new Error('Git batch process closed'))
    try {
      this.#process.stdin?.end()
      this.#process.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }

  [Symbol.dispose]() {
    this.close()
  }
}

/**
 * Batches git cat-file --batch requests and resolves them in order.
 */
class GitBatchCat {
  repoPath: string
  #process: ChildProcess
  #queue: Array<{
    resolve: (
      value: { sha: string; type: string; content: string } | null
    ) => void
    reject: (error: Error) => void
  }>

  // Parser State
  #state: 'HEADER' | 'CONTENT' = 'HEADER'
  #headerBuffer: Buffer = Buffer.alloc(0)
  #contentBuffer: Buffer[] = []
  #contentBytesRead = 0
  #contentBytesExpected = 0
  #currentSha: string | null = null
  #currentType: string | null = null

  #closed = false

  constructor(repoPath: string) {
    this.repoPath = repoPath
    this.#process = spawn('git', ['cat-file', '--batch'], {
      cwd: repoPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      detached: false,
    })
    this.#queue = []

    this.#process.stdin?.on('error', (error) => {
      if (!this.#closed) {
        this.#closed = true
        this.#rejectAll(
          new Error(`Git batch stdin error: ${(error as Error).message}`)
        )
      }
    })

    this.#process.stdout?.on('data', (chunk: Buffer) => {
      this.#processChunk(chunk)
    })

    // Drain stderr to prevent blocking (git may write warnings/errors)
    this.#process.stderr?.on('data', () => {})

    this.#process.on('error', (error) => this.#rejectAll(error))

    const onExit = () => this.close()
    const unregister = registerExitHandler(onExit)

    this.#process.on('close', (code: number) => {
      this.#closed = true
      if (this.#queue.length > 0) {
        this.#rejectAll(
          new Error(`git cat-file --batch exited with code ${code}`)
        )
      }
      unregister()
    })
  }

  #rejectAll(error: Error) {
    while (this.#queue.length > 0) {
      const { reject } = this.#queue.shift()!
      reject(error)
    }
  }

  #processChunk(chunk: Buffer) {
    let offset = 0

    while (offset < chunk.length) {
      if (this.#queue.length === 0) {
        // Unexpected data (or previous request cancelled/timed out)
        return
      }

      if (this.#state === 'HEADER') {
        const newlineIndex = chunk.indexOf(10, offset) // 10 is \n

        if (newlineIndex !== -1) {
          const headerPart = chunk.subarray(offset, newlineIndex)
          const fullHeader =
            this.#headerBuffer.length > 0
              ? Buffer.concat([this.#headerBuffer, headerPart])
              : headerPart

          this.#headerBuffer = Buffer.alloc(0)
          offset = newlineIndex + 1

          const headerStr = fullHeader.toString('utf8').trim()

          if (headerStr.endsWith(' missing')) {
            this.#queue.shift()?.resolve(null)
            continue
          }

          const parts = headerStr.split(/\s+/)
          const sha = parts[0]
          const type = parts[1]
          const size = parseInt(parts[2], 10)

          if (!sha || !type || isNaN(size)) {
            this.#queue
              .shift()
              ?.reject(new Error(`Invalid git header: ${headerStr}`))
            continue
          }

          this.#state = 'CONTENT'
          this.#contentBytesExpected = size
          this.#contentBytesRead = 0
          this.#contentBuffer = []
          this.#currentSha = sha
          this.#currentType = type
        } else {
          // No newline, accumulate remainder of chunk into headerBuffer
          const remainder = chunk.subarray(offset)
          this.#headerBuffer = Buffer.concat([this.#headerBuffer, remainder])
          offset = chunk.length
        }
      } else if (this.#state === 'CONTENT') {
        const bytesNeeded =
          this.#contentBytesExpected + 1 - this.#contentBytesRead
        const bytesAvailable = chunk.length - offset
        const bytesToTake = Math.min(bytesNeeded, bytesAvailable)

        const contentPart = chunk.subarray(offset, offset + bytesToTake)
        this.#contentBuffer.push(contentPart)

        this.#contentBytesRead += bytesToTake
        offset += bytesToTake

        if (this.#contentBytesRead === this.#contentBytesExpected + 1) {
          const fullContentBuffer = Buffer.concat(this.#contentBuffer)
          const actualContent = fullContentBuffer.subarray(
            0,
            fullContentBuffer.length - 1
          )

          this.#queue.shift()?.resolve({
            sha: this.#currentSha!, // We know these are set because state is CONTENT
            type: this.#currentType!,
            content: actualContent.toString('utf8'),
          })

          // Reset state
          this.#state = 'HEADER'
          this.#contentBuffer = []
          this.#currentSha = null
          this.#currentType = null
        }
      }
    }
  }

  getObject(
    spec: string
  ): Promise<{ sha: string; type: string; content: string } | null> {
    return new Promise((resolve, reject) => {
      if (this.#closed) {
        return reject(new Error('Git cat process closed'))
      }
      this.#queue.push({ resolve, reject })
      try {
        const ok = this.#process.stdin?.write(spec + '\n')
        if (!ok) {
          this.#process.stdin?.once('drain', () => {})
        }
      } catch (error) {
        this.#queue.pop()
        reject(error)
      }
    })
  }

  close() {
    if (this.#closed) {
      return
    }
    this.#closed = true
    this.#rejectAll(new Error('Git batch process closed'))
    try {
      this.#process.stdin?.end()
      this.#process.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }

  [Symbol.dispose]() {
    this.close()
  }
}

interface CollectContext {
  git: GitObjectStore
  commit: string
  maxDepth: number
  blobCache: Map<string, Map<string, ExportItem>>
  scopeDirectories: string[]
  parseWarnings: string[]
  cacheStats: { hits: number; misses: number }
  metaCache: Map<string, GitObjectMeta | null>
  resolveCache: Map<string, string | null>
}

async function getBlobMetaCached(context: CollectContext, specifier: string) {
  const cached = context.metaCache.get(specifier)
  if (cached !== undefined) {
    return cached
  }
  const meta = await context.git.getBlobMeta(specifier)
  context.metaCache.set(specifier, meta)
  return meta
}

/**
 * Collects exports using AST traversal (Fast)
 * Parallelizes module resolution and recursive collection for better performance.
 */
async function collectExportsFromFile(
  context: CollectContext,
  filePath: string,
  depth: number,
  visiting: Set<string>
): Promise<Map<string, ExportItem>> {
  const {
    git,
    commit,
    maxDepth,
    blobCache,
    scopeDirectories,
    parseWarnings,
    cacheStats,
  } = context

  const results = new Map<string, ExportItem>()

  if (depth > maxDepth) {
    parseWarnings.push(
      `[${commit.slice(0, 7)}] Max depth exceeded at ${filePath}`
    )
    return results
  }

  if (visiting.has(filePath)) {
    return results
  }
  const visitingBranch = new Set(visiting)
  visitingBranch.add(filePath)

  const meta = await getBlobMetaCached(context, `${commit}:${filePath}`)
  if (!meta) {
    return results
  }
  if (meta.size > MAX_PARSE_BYTES) {
    return results
  }

  // Get raw exports from cache or parse them
  const cacheKey = getExportParseCacheKey(meta.sha)
  let rawExports = blobCache.get(cacheKey)
  if (rawExports) {
    cacheStats.hits++
  } else {
    cacheStats.misses++
    const content = await git.getBlobContentBySha(meta.sha)
    if (content === null) {
      return results
    }
    rawExports = scanModuleExports(filePath, content)
    blobCache.set(cacheKey, rawExports)
  }

  const fileIdentity = (name: string) => formatExportId(filePath, name)

  // Partition exports by type for parallel processing
  const localExports: Array<[string, ExportItem]> = []
  const fromExports: Array<[string, ExportItem, string]> = [] // [name, item, fromPath]
  const namespaceExports: Array<[string, ExportItem, string]> = []
  const starExports: Array<[string, ExportItem, string]> = []

  for (const [name, rawItem] of rawExports) {
    if (rawItem.id === '__LOCAL__') {
      localExports.push([name, rawItem])
    } else if (rawItem.id.startsWith('__FROM__')) {
      fromExports.push([name, rawItem, rawItem.id.slice(8)]) // '__FROM__'.length = 8
    } else if (rawItem.id.startsWith('__NAMESPACE__')) {
      namespaceExports.push([name, rawItem, rawItem.id.slice(13)]) // '__NAMESPACE__'.length = 13
    } else if (rawItem.id.startsWith('__STAR__')) {
      starExports.push([name, rawItem, rawItem.id.slice(8)]) // '__STAR__'.length = 8
    }
  }

  // Handle local exports synchronously
  for (const [name, rawItem] of localExports) {
    results.set(name, { ...rawItem, id: fileIdentity(name) })
  }

  // Early return if no external exports
  const allExternalExports = [
    ...fromExports,
    ...namespaceExports,
    ...starExports,
  ]
  if (allExternalExports.length === 0) {
    return results
  }

  // Resolve all unique module paths in parallel
  const baseDirectory = dirname(filePath)
  const uniqueFromPaths = [
    ...new Set(allExternalExports.map(([, , fromPath]) => fromPath)),
  ]

  const resolutionResults = await mapWithLimit(
    uniqueFromPaths,
    8,
    async (fromPath) => ({
      fromPath,
      resolved: await resolveModule(context, baseDirectory, fromPath),
    })
  )

  const resolutionMap = new Map<string, string | null>()
  for (const { fromPath, resolved } of resolutionResults) {
    resolutionMap.set(fromPath, resolved)
  }

  // Collect exports from unique resolved paths that need recursive collection
  const pathsNeedingCollection = new Set<string>()
  for (const [, , fromPath] of fromExports) {
    const resolved = resolutionMap.get(fromPath)
    if (resolved) {
      pathsNeedingCollection.add(resolved)
    }
  }
  for (const [, , fromPath] of starExports) {
    const resolved = resolutionMap.get(fromPath)
    if (resolved && isUnderScope(resolved, scopeDirectories)) {
      pathsNeedingCollection.add(resolved)
    }
  }

  const pathsArray = Array.from(pathsNeedingCollection)
  const collectionResults = await mapWithLimit(
    pathsArray,
    5,
    async (resolved) => ({
      resolved,
      exports: await collectExportsFromFile(
        context,
        resolved,
        depth + 1,
        visitingBranch
      ),
    })
  )

  const collectionMap = new Map<string, Map<string, ExportItem>>()
  for (const { resolved, exports } of collectionResults) {
    collectionMap.set(resolved, exports)
  }

  // Process FROM exports (named re-exports)
  for (const [name, rawItem, fromPath] of fromExports) {
    const resolved = resolutionMap.get(fromPath)
    if (!resolved) {
      continue
    }

    const targetExports = collectionMap.get(resolved)
    const sourceName = rawItem.sourceName ?? name
    const targetItem = targetExports?.get(sourceName)

    if (targetItem) {
      results.set(name, targetItem)
    } else {
      results.set(name, {
        ...rawItem,
        id: formatExportId(resolved, sourceName),
      })
    }
  }

  // Process NAMESPACE exports (export * as ns from './y')
  for (const [name, rawItem, fromPath] of namespaceExports) {
    const resolved = resolutionMap.get(fromPath)
    if (!resolved) {
      continue
    }

    results.set(name, {
      ...rawItem,
      id: formatExportId(resolved, '__NAMESPACE__'),
    })
  }

  // Process STAR exports (order matters for precedence, first wins)
  for (const [, , fromPath] of starExports) {
    const resolved = resolutionMap.get(fromPath)
    if (!resolved || !isUnderScope(resolved, scopeDirectories)) {
      continue
    }

    const children = collectionMap.get(resolved)
    if (!children) {
      continue
    }

    for (const [childName, childItem] of children) {
      if (childName !== 'default' && !results.has(childName)) {
        results.set(childName, childItem)
      }
    }
  }

  return results
}

async function resolveModule(
  context: CollectContext,
  baseDir: string,
  specifier: string
) {
  const cacheKey = `${baseDir}|${specifier}`
  if (context.resolveCache.has(cacheKey)) {
    return context.resolveCache.get(cacheKey)!
  }

  const result = await (async () => {
    if (!specifier.startsWith('.')) {
      return null
    }

    const basePath = joinPath(baseDir, specifier)
    const fileCandidates = EXTENSION_PRIORITY.map(
      (extension) => basePath + extension
    )
    const indexCandidates = INDEX_FILE_CANDIDATES.map((indexFile) =>
      joinPath(basePath, indexFile)
    )
    const allCandidates = [...fileCandidates, ...indexCandidates, basePath]

    const probes = allCandidates.map((path) =>
      getBlobMetaCached(context, `${context.commit}:${path}`).then((meta) => ({
        path,
        meta,
      }))
    )

    const results = await Promise.all(probes)

    for (const probeResult of results) {
      if (probeResult.meta && probeResult.meta.type === 'blob') {
        return probeResult.path
      }
    }
    return null
  })()

  context.resolveCache.set(cacheKey, result)
  return result
}

async function getRepoRoot(inputPath: string) {
  const absolutePath = resolve(String(inputPath))
  if (!existsSync(absolutePath)) {
    throw new Error(`Directory does not exist: ${absolutePath}`)
  }
  const stat = statSync(absolutePath)
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${absolutePath}`)
  }
  try {
    const out = await spawnAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd: absolutePath,
    })
    return String(out).trim()
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Directory does not exist: ${absolutePath}`)
    }
    throw new Error(`Not a git repository: ${absolutePath}`)
  }
}

function getRepoRootSync(inputPath: string) {
  const absolutePath = resolve(String(inputPath))
  if (!existsSync(absolutePath)) {
    throw new Error(`Directory does not exist: ${absolutePath}`)
  }
  const stat = statSync(absolutePath)
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${absolutePath}`)
  }
  try {
    const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: absolutePath,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      throw new Error('Not a git repository')
    }
    return String(result.stdout).trim()
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Directory does not exist: ${absolutePath}`)
    }
    throw new Error(`Not a git repository: ${absolutePath}`)
  }
}

async function gitLogForPath(
  repoRoot: string,
  ref: string,
  path: string | string[],
  {
    reverse = false,
    limit,
    follow = false,
    maxBufferBytes = 100 * 1024 * 1024,
  }: {
    reverse?: boolean
    limit?: number
    maxBufferBytes?: number
    includeAuthors?: boolean
    follow?: boolean
  } = {}
): Promise<GitLogCommit[]> {
  // Added %D to get ref names (tags, branches)
  const args = ['log', '--format=%H%x00%at%x00%D']
  if (reverse) {
    args.push('--reverse')
  }
  if (limit) {
    args.push('-n', String(limit))
  }
  if (follow && !Array.isArray(path)) args.push('--follow')
  const paths = Array.isArray(path) ? path : [path]
  args.push(ref, '--', ...paths)

  const child = spawn('git', args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })

  if (!child.stdout) {
    throw new Error(`Failed to spawn git log for: ${args.join(' ')}`)
  }

  const commits: GitLogCommit[] = []
  const maxBuffer = maxBufferBytes
  let totalBytes = 0
  let stderr = ''
  let bufferExceeded = false

  const noteBytes = (chunk: Buffer) => {
    totalBytes += chunk.length
    if (!bufferExceeded && totalBytes > maxBuffer) {
      bufferExceeded = true
      child.kill()
    }
  }

  child.stdout.on('data', (chunk: Buffer) => noteBytes(chunk))
  child.stderr?.on('data', (chunk: Buffer) => {
    noteBytes(chunk)
    stderr += chunk.toString()
  })

  const readLine = createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  })
  const readLineClosed = new Promise<void>((resolve) =>
    readLine.on('close', resolve)
  )

  readLine.on('line', (line) => {
    if (!line) {
      return
    }
    const [sha, unix, refs] = line.split('\0')

    let tags: string[] | undefined
    if (refs) {
      tags = refs
        .split(',')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('tag: '))
        .map((line) => line.replace('tag: ', ''))
    }

    commits.push({
      sha,
      unix: Number(unix),
      tags: tags?.length ? tags : undefined,
    })
  })

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', resolve)
  })

  await readLineClosed

  if (bufferExceeded) {
    throw new Error(
      `maxBuffer exceeded (${maxBuffer} bytes) for: git ${args.join(' ')}`
    )
  }

  if (exitCode !== 0) {
    throw new Error(
      stderr || `Git exited with code ${exitCode} for: git ${args.join(' ')}`
    )
  }

  return commits
}

async function inferEntryFile(
  git: GitObjectStore,
  commit: string,
  scopeDirectory: string
) {
  const candidates = [
    'index.ts',
    'index.tsx',
    'index.js',
    'index.jsx',
    'index.mjs',
  ]
  for (const name of candidates) {
    const path = joinPath(scopeDirectory, name)
    const meta = await git.getBlobMeta(`${commit}:${path}`)
    if (meta) {
      return path
    }
  }
  return null
}

function joinPath(...parts: string[]) {
  return normalizePath(
    join(...parts)
      .split(sep)
      .join('/')
  )
}

function normalizePath(path: string) {
  const normalized = String(path).replace(/\\/g, '/').replace(/\/+/g, '/')
  if (normalized.length > 1 && normalized.endsWith('/'))
    return normalized.slice(0, -1)
  return normalized
}

function sha1(input: string) {
  return createHash('sha1').update(input).digest('hex')
}

function isAbsoluteLike(path: string) {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)
}

function isSubPath(absPath: string, absRoot: string) {
  const resolvedPath = resolve(absPath)
  const resolvedRoot = resolve(absRoot)
  return (
    resolvedPath === resolvedRoot || resolvedPath.startsWith(resolvedRoot + sep)
  )
}

function expandRefFallbacks(ref: string): string[] {
  const out: string[] = []
  const stringRef = String(ref)

  const remoteMatch = stringRef.match(/^refs\/remotes\/([^/]+)\/(.+)$/)
  if (remoteMatch) {
    const remote = remoteMatch[1]
    const branch = remoteMatch[2]
    out.push(`${remote}/${branch}`)
    out.push(branch)
    out.push(`refs/heads/${branch}`)
    return uniqueStrings(out)
  }

  const headMatch = stringRef.match(/^refs\/heads\/(.+)$/)
  if (headMatch) {
    const branch = headMatch[1]
    out.push(branch)
    out.push(`origin/${branch}`)
    out.push(`refs/remotes/origin/${branch}`)
    return uniqueStrings(out)
  }

  const shortRemoteMatch = stringRef.match(/^([^/]+)\/(.+)$/)
  if (shortRemoteMatch) {
    const remote = shortRemoteMatch[1]
    const branch = shortRemoteMatch[2]
    out.push(branch)
    out.push(`refs/heads/${branch}`)
    out.push(`refs/remotes/${remote}/${branch}`)
    return uniqueStrings(out)
  }

  if (stringRef && stringRef !== 'HEAD') {
    out.push(`origin/${stringRef}`)
    out.push(`refs/heads/${stringRef}`)
    out.push(`refs/remotes/origin/${stringRef}`)
  }

  return uniqueStrings(out)
}

function inferRemoteAndBranch(
  ref: string,
  defaultRemote: string
): { remote: string; branch: string } | null {
  const stringRef = String(ref)

  const remoteRefMatch = stringRef.match(/^refs\/remotes\/([^/]+)\/(.+)$/)
  if (remoteRefMatch)
    return { remote: remoteRefMatch[1], branch: remoteRefMatch[2] }

  const remoteBranchMatch = stringRef.match(/^([^/]+)\/(.+)$/)
  if (remoteBranchMatch)
    return { remote: remoteBranchMatch[1], branch: remoteBranchMatch[2] }

  if (!stringRef || stringRef === 'HEAD') {
    return null
  }
  return { remote: defaultRemote, branch: stringRef }
}

function getRemoteRefQuery(
  ref: string,
  defaultRemote: string
): { remote: string; ref: string } {
  const stringRef = String(ref)
  const remoteRefMatch = stringRef.match(/^refs\/remotes\/([^/]+)\/(.+)$/)
  if (remoteRefMatch) {
    return { remote: remoteRefMatch[1], ref: remoteRefMatch[2] }
  }
  if (stringRef.startsWith(`${defaultRemote}/`)) {
    return {
      remote: defaultRemote,
      ref: stringRef.slice(defaultRemote.length + 1),
    }
  }
  return { remote: defaultRemote, ref: stringRef }
}

function parseLsRemoteSha(output: string): string | null {
  const lines = String(output).trim().split('\n').filter(Boolean)
  if (!lines.length) {
    return null
  }

  let direct: string | null = null
  let peeled: string | null = null

  for (const line of lines) {
    const [sha, name] = line.trim().split(/\s+/, 2)
    if (!sha || !isFullSha(sha)) {
      continue
    }
    if (name?.endsWith('^{}')) {
      peeled = sha
    } else if (!direct) {
      direct = sha
    }
  }

  return peeled ?? direct
}

function getLocalRefShaSync(repoRoot: string, ref: string): string | null {
  assertSafeGitArg(ref, 'ref')
  const result = spawnSync(
    'git',
    ['rev-parse', '--verify', `${ref}^{commit}`],
    { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8' }
  )
  if (result.status !== 0) {
    return null
  }
  const trimmed = String(result.stdout).trim()
  return isFullSha(trimmed) ? trimmed : null
}

function getRemoteRefShaSync(
  repoRoot: string,
  remote: string,
  ref: string
): string | null {
  assertSafeGitArg(remote, 'remote')
  assertSafeGitArg(ref, 'ref')

  const cacheKey = `${repoRoot}\x00${remote}\x00${ref}`
  const cached = remoteRefCache.get(cacheKey)
  const now = Date.now()
  if (cached && now - cached.checkedAt < REMOTE_REF_CACHE_TTL_MS) {
    return cached.remoteSha
  }

  const result = spawnSync('git', ['ls-remote', remote, ref], {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    remoteRefCache.set(cacheKey, { remoteSha: null, checkedAt: now })
    return null
  }

  const remoteSha = parseLsRemoteSha(String(result.stdout))
  remoteRefCache.set(cacheKey, { remoteSha, checkedAt: now })
  return remoteSha
}

function isFullSha(value: string): boolean {
  const trimmed = String(value).trim()
  return /^[0-9a-f]{40}$/i.test(trimmed) || /^[0-9a-f]{64}$/i.test(trimmed)
}

function uniqueStrings(xs: string[]) {
  return Array.from(new Set(xs.filter(Boolean)))
}

function parseLsTreeOutput(output: string, basePath: string): DirectoryEntry[] {
  const entries: DirectoryEntry[] = []
  const normalizedBase = normalizeSlashes(basePath || '')
  const base =
    normalizedBase && normalizedBase !== '.'
      ? normalizedBase.replace(/\/$/, '')
      : ''
  const records = String(output).split('\0').filter(Boolean)

  for (const record of records) {
    const tabIndex = record.indexOf('\t')
    if (tabIndex === -1) {
      continue
    }
    const meta = record.slice(0, tabIndex)
    const name = record.slice(tabIndex + 1)
    const parts = meta.split(' ')
    const type = parts[1] ?? ''
    const entryPath = base ? joinPaths(base, name) : name
    entries.push({
      name,
      path: ensureRelativePath(entryPath),
      isDirectory: type === 'tree',
      isFile: type === 'blob',
    })
  }

  return entries
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

type MetadataForPath<P extends string> = string extends P
  ? GitPathMetadata
  : P extends `${string}.${JavaScriptLikeExtension}`
    ? GitModuleMetadata
    : GitFileMetadata

function shallowRepoErrorMessage(): string {
  const message = `[renoun] This repository is shallow cloned so the firstCommitDate and lastCommitDate dates cannot be calculated correctly.`
  const env = globalThis?.process?.env

  if (!env) {
    return (
      `${message}\n` +
      `Fix: fetch full history (e.g. "git fetch --unshallow --tags" or configure your CI checkout to fetch-depth: 0).`
    )
  }

  if ('VERCEL' in env) {
    return `${message} Set the VERCEL_DEEP_CLONE=true environment variable to enable deep cloning.`
  }

  if ('GITHUB_ACTION' in env) {
    return (
      `${message} ` +
      `See https://github.com/actions/checkout#fetch-all-history-for-all-tags-and-branches to fetch the entire git history.`
    )
  }

  if ('GITLAB_CI' in env) {
    return (
      `${message} ` +
      `Fix: set GIT_DEPTH: "0" (or remove GIT_DEPTH) so GitLab fetches the full history.`
    )
  }

  if ('CIRCLECI' in env) {
    return (
      `${message} ` +
      `Fix: disable shallow cloning in CircleCI (set "checkout: { depth: full }" or run "git fetch --unshallow").`
    )
  }

  if ('BUILDKITE' in env) {
    return (
      `${message} ` +
      `Fix: set BUILDKITE_GIT_CLONE_FLAGS="-v" and remove any "--depth" usage, or run "git fetch --unshallow --tags".`
    )
  }

  if ('CI' in env) {
    return (
      `${message}\n` +
      `Fix: configure your CI checkout to fetch full history (fetch-depth: 0) or run "git fetch --unshallow --tags".`
    )
  }

  return (
    `${message}\n` +
    `Fix: run "git fetch --unshallow --tags" (or reclone without --depth) to fetch full history.`
  )
}

function looksLikeCacheClone(repoRoot: string, metaCacheDir: string) {
  const normalizedRepoRoot = normalizePath(repoRoot)
  const homeCache = normalizePath(join(os.homedir(), '.cache'))
  const temporaryDirectory = normalizePath(os.tmpdir())
  const normalizedMetaCache = normalizePath(metaCacheDir)

  return (
    normalizedRepoRoot.startsWith(homeCache + '/') ||
    normalizedRepoRoot.startsWith(temporaryDirectory + '/') ||
    normalizedRepoRoot.startsWith(normalizedMetaCache + '/')
  )
}

function looksLikeGitHubSpec(value: string) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(value))
}

function looksLikeGitRemoteUrl(value: string) {
  const stringValue = String(value)
  return (
    /^(https?|git|ssh):\/\//.test(stringValue) || stringValue.startsWith('git@')
  )
}

function assertSafeGitArg(value: string, label: string) {
  const stringValue = String(value)
  if (!stringValue) {
    throw new Error(`[LocalGitFileSystem] Missing ${label}`)
  }
  if (
    stringValue.includes('\0') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r')
  ) {
    throw new Error(
      `[LocalGitFileSystem] Invalid ${label}: contains newline/NUL`
    )
  }
  if (stringValue.startsWith('-')) {
    throw new Error(
      `[LocalGitFileSystem] Invalid ${label}: must not start with "-"`
    )
  }
}

function assertSafeRepoPath(relativePath: string) {
  const stringPath = String(relativePath)
  if (!stringPath) {
    throw new Error('[LocalGitFileSystem] Invalid path: empty')
  }
  if (
    stringPath.includes('\0') ||
    stringPath.includes('\n') ||
    stringPath.includes('\r')
  ) {
    throw new Error('[LocalGitFileSystem] Invalid path: contains newline/NUL')
  }
  if (stringPath.includes(':')) {
    throw new Error(
      `[LocalGitFileSystem] Invalid repo path "${stringPath}": ":" is not supported in paths`
    )
  }
  const segments = stringPath.split('/')
  if (segments.some((segment) => segment === '..')) {
    throw new Error(
      `[LocalGitFileSystem] Invalid repo path "${stringPath}": ".." segments are not allowed`
    )
  }
}

function assertSafeGitSpec(specifier: string) {
  const stringSpecifier = String(specifier)
  if (
    stringSpecifier.includes('\0') ||
    stringSpecifier.includes('\n') ||
    stringSpecifier.includes('\r')
  ) {
    throw new Error(
      '[LocalGitFileSystem] Invalid git spec: contains newline/NUL'
    )
  }
}

class TaskQueue {
  concurrency: number
  running = 0
  queue: (() => void)[] = []

  constructor(concurrency: number) {
    if (concurrency < 1) throw new Error('Concurrency must be at least 1')
    this.concurrency = concurrency
  }

  run<Type>(task: () => Promise<Type>): Promise<Type> {
    return new Promise((resolve, reject) => {
      const runTask = async () => {
        this.running++
        try {
          resolve(await task())
        } catch (error) {
          reject(error)
        } finally {
          this.running--
          if (this.queue.length > 0) {
            // Schedule next task asynchronously to avoid deep recursion
            const next = this.queue.shift()!
            queueMicrotask(next)
          }
        }
      }

      if (this.running < this.concurrency) {
        runTask()
      } else {
        this.queue.push(runTask)
      }
    })
  }
}

const taskQueue = new TaskQueue(10)
