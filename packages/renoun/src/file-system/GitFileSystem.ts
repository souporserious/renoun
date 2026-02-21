/**
 * GitFileSystem
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
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import {
  mkdir,
  readdir,
  readFile as fsReadFile,
  rename,
  rm,
  cp,
  writeFile,
  stat,
} from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import os from 'node:os'
import { Writable } from 'node:stream'

import {
  ensureRelativePath,
  joinPaths,
  normalizePathKey,
  normalizeSlashes,
  relativePath,
  trimLeadingDotSlash,
  trimLeadingSlashes,
  trimTrailingSlashes,
} from '../utils/path.ts'
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
  GitMetadata,
  GitExportMetadata,
  GitFileMetadata,
  GitModuleMetadata,
  GitPathMetadata,
  ExportHistoryOptions,
  ExportHistoryReport,
  ExportHistoryProgressEvent,
  ExportHistoryGenerator,
  ExportChange,
} from './types.ts'
import {
  type ExportItem,
  MAX_PARSE_BYTES,
  EXTENSION_PRIORITY,
  INDEX_FILE_CANDIDATES,
  RENAME_SIGNATURE_DICE_MIN_RENAMED_FILE,
  RENAME_SIGNATURE_DICE_MARGIN,
  RENAME_PATH_DICE_MIN,
  parseExportId,
  formatExportId,
  getParserFlavorFromFileName,
  getExportParseCacheKey,
  scanModuleExports,
  isUnderScope,
  mapWithLimit,
  looksLikeFilePath,
  buildExportComparisonMaps,
  detectSameFileRenames,
  detectCrossFileRenames,
  detectSameNameMoves,
  mergeRenameHistory,
  checkAndCollapseOscillation,
  selectEntryFiles,
} from './export-analysis.ts'
import { GIT_HISTORY_CACHE_VERSION } from './cache-key.ts'
import {
  createGitFileSystemPersistentCacheNodeKey,
} from './git-cache-key.ts'
import type { Cache } from './Cache.ts'
import { Session } from './Session.ts'

export interface GitFileSystemOptions extends FileSystemOptions {
  /** Repository source - remote URL or local path. */
  repository: string

  /** The Git reference to use. */
  ref?: string

  /** Sparse checkout directories for large repositories. */
  sparse?: string[]

  /** Shallow clone depth (undefined = full history). */
  depth?: number

  /** The directory to use for cached clones and metadata. */
  cacheDirectory?: string

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

  /** Optional cache provider for this filesystem's internal caches. */
  cache?: Cache
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
  authorName?: string
  authorEmail?: string
  tags?: string[]
}

interface ExportHistoryCommit extends GitLogCommit {
  release?: string
}

interface ReverseReExportGraphPayload {
  generatedAt: string
  commitSha: string
  entries: string[]
  edges: Record<string, string[]>
}

interface NormalizedExportHistoryRefScope {
  source: 'default' | 'end' | 'range' | 'release'
  startRef?: string
  endRef: string
  endRefExplicit: boolean
  targetReleaseTag?: string
  previousReleaseTag?: string
}

const REMOTE_REF_CACHE_TTL_MS = 60_000
const REMOTE_REF_TIMEOUT_MS = 8_000
const REF_IDENTITY_CACHE_TTL_MS = 60_000

type RefIdentity = {
  identity: string
  deterministic: boolean
  checkedAt: number
}

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
    shell: false,
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
      `[GitFileSystem] Refusing to use cache target that exists but is not a git repo: ${target}`
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
      `[GitFileSystem] Unsupported repository spec: ${spec}. ` +
        'Use a local path, an "owner/repo" GitHub shorthand, or a git URL (https://, ssh://, file://, git@).'
    )
  }

  const supportsBackfill = await supportsGitBackfill()

  if (verbose && !supportsBackfill) {
    console.log(
      '[GitFileSystem] git backfill is not available. Falling back to full clone.'
    )
  }

  if (!existsSync(gitDir)) {
    if (verbose) {
      console.log(`[GitFileSystem] Cloning ${spec} into ${target}…`)
    }

    const safeCloneUrl = assertSafeCloneUrl(cloneUrl)
    const safeTarget = assertSafeFsPath(target, 'clone target')
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
          ? ['--depth', String(Math.floor(Math.abs(depth)))]
          : []),
        ...(supportsBackfill ? ['--filter=blob:none'] : []),
        '--no-checkout',
        '--sparse',
        '--',
        safeCloneUrl,
        safeTarget,
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

export function ensureCacheCloneSync(options: PrepareRepoOptions): string {
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
      `[GitFileSystem] Refusing to use cache target that exists but is not a git repo: ${target}`
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
      `[GitFileSystem] Unsupported repository spec: ${spec}. ` +
        'Use a local path, an "owner/repo" GitHub shorthand, or a git URL (https://, ssh://, file://, git@).'
    )
  }

  const supportsBackfill = supportsGitBackfillSync()

  if (verbose && !supportsBackfill) {
    console.log(
      '[GitFileSystem] git backfill is not available. Falling back to full clone.'
    )
  }

  if (!existsSync(gitDir)) {
    if (verbose) {
      console.log(`[GitFileSystem] Cloning ${spec} into ${target}…`)
    }

    const safeCloneUrl = assertSafeCloneUrl(cloneUrl)
    const safeTarget = assertSafeFsPath(target, 'clone target')
    const cloneArgs = [
      'clone',
      '-c',
      'core.fsmonitor=',
      '-c',
      'core.sshCommand=',
      ...(typeof depth === 'number' && depth > 0
        ? ['--depth', String(Math.floor(Math.abs(depth)))]
        : []),
      ...(supportsBackfill ? ['--filter=blob:none'] : []),
      '--no-checkout',
      '--sparse',
      '--',
      safeCloneUrl,
      safeTarget,
    ]

    const clone = spawnSync('git', cloneArgs, {
      cwd: process.cwd(),
      stdio: 'pipe',
      encoding: 'utf8',
      shell: false,
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
    shell: false,
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
      `[GitFileSystem] git backfill --sparse failed (ignored)${
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
    shell: false,
  })
  if (result.status !== 0 && verbose) {
    const stderr = result.stderr ? String(result.stderr).trim() : ''
    console.warn(
      `[GitFileSystem] git backfill --sparse failed (ignored)${
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
    shell: false,
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

export class GitFileSystem
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

  // Lazily resolved commit SHA for `this.ref`
  #refCommit: string | null = null
  #refCommitPromise: Promise<string> | null = null
  readonly #refIsExplicit: boolean
  readonly #worktreeEnabled: boolean
  #worktreeRootChecked = false
  #worktreeRootExists = false

  // Singleton promise to prevent parallel unshallow operations
  #unshallowPromise: Promise<void> | null = null
  #isShallowChecked = false
  #isShallow = false

  #cache?: Cache
  #session?: Session
  #historyWarmupInFlight = new Set<string>()

  constructor(options: GitFileSystemOptions) {
    super(options)

    this.#tsConfigPath = options.tsConfigPath || 'tsconfig.json'
    this.repository = String(options.repository)
    this.repoRoot = this.repository
    this.repositoryIsRemote =
      looksLikeGitHubSpec(this.repository) ||
      looksLikeGitRemoteUrl(this.repository)
    this.cloneDepth = options.depth

    this.ref = options.ref ?? 'HEAD'
    this.#refIsExplicit = options.ref !== undefined
    this.#worktreeEnabled = !this.repositoryIsRemote && !this.#refIsExplicit
    assertSafeGitArg(this.ref, 'ref')

    this.cacheDirectory = options.cacheDirectory
      ? resolve(String(options.cacheDirectory))
      : resolve(os.homedir(), '.cache', 'renoun-git')

    this.verbose = Boolean(options.verbose)
    this.maxBufferBytes = options.maxBufferBytes ?? 100 * 1024 * 1024
    this.maxDepth = options.maxDepth ?? 25

    this.autoPrepare = this.repositoryIsRemote
    this.prepareScopeDirectories = options.sparse ?? []
    this.prepareTransport = options.transport ?? 'https'
    this.fetchRemote = options.fetchRemote ?? 'origin'
    this.#cache = options.cache
    this.autoFetch =
      options.autoFetch ??
      (this.autoPrepare
        ? true
        : looksLikeCacheClone(this.repoRoot, this.cacheDirectory))

    mkdirSync(this.cacheDirectory, { recursive: true })
    this.#git = null

    if (this.verbose) {
      console.log(
        `[GitFileSystem] initialized for ${this.repoRoot} @ ${this.ref}`
      )
    }
  }

  getProjectOptions() {
    this.#ensureRepoReadySync()
    return {
      tsConfigFilePath: this.getAbsolutePath(this.#tsConfigPath),
    }
  }

  async getGitFileMetadata(path: string): Promise<GitMetadata> {
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
    const normalizedPath = normalizeSlashes(String(path))
    const isAlreadyAbsolutePath =
      normalizedPath.startsWith('/') ||
      /^[A-Za-z]:\//.test(normalizedPath) ||
      normalizedPath.startsWith('//')
    const absolutePath = isAlreadyAbsolutePath
      ? resolve(normalizedPath)
      : this.getAbsolutePath(path)
    const relativeToRepo = relativePath(this.repoRoot, absolutePath)
    return trimLeadingDotSlash(relativeToRepo)
  }

  async getWorkspaceChangeToken(rootPath: string): Promise<string | null> {
    try {
      await this.#ensureRepoReady()

      const headResult = await spawnWithResult('git', ['rev-parse', 'HEAD'], {
        cwd: this.repoRoot,
        maxBuffer: this.maxBufferBytes,
        verbose: false,
      })
      if (headResult.status !== 0) {
        return null
      }

      const headCommit = headResult.stdout.trim()
      if (!headCommit) {
        return null
      }

      const relativeRoot = this.#normalizeRepoPath(rootPath)
      const statusScope = relativeRoot || '.'
      const statusResult = await spawnWithResult(
        'git',
        [
          'status',
          '--porcelain=1',
          '--untracked-files=all',
          '--ignored=matching',
          '--ignore-submodules=all',
          '--',
          statusScope,
        ],
        {
          cwd: this.repoRoot,
          maxBuffer: this.maxBufferBytes,
          verbose: false,
        }
      )
      if (statusResult.status !== 0) {
        return null
      }

      const statusLines = statusResult.stdout
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0)
        .sort((first, second) => first.localeCompare(second))
      const ignoredOnly =
        statusLines.length > 0 &&
        statusLines.every((line) => line.startsWith('!! '))
      const dirtyDigest = createHash('sha1')
        .update(statusLines.join('\n'))
        .digest('hex')

      return `head:${headCommit};dirty:${dirtyDigest};count:${statusLines.length};ignored-only:${ignoredOnly ? 1 : 0}`
    } catch {
      return null
    }
  }

  async getWorkspaceChangedPathsSinceToken(
    rootPath: string,
    previousToken: string
  ): Promise<readonly string[] | null> {
    try {
      await this.#ensureRepoReady()

      const previousHead = this.#extractHeadFromWorkspaceToken(previousToken)
      if (!previousHead) {
        return null
      }
      const previousDirtyDigest =
        this.#extractDirtyDigestFromWorkspaceToken(previousToken)

      const headResult = await spawnWithResult('git', ['rev-parse', 'HEAD'], {
        cwd: this.repoRoot,
        maxBuffer: this.maxBufferBytes,
        verbose: false,
      })
      if (headResult.status !== 0) {
        return null
      }

      const currentHead = headResult.stdout.trim()
      if (!currentHead) {
        return null
      }

      const relativeRoot = this.#normalizeRepoPath(rootPath)
      const statusScope = relativeRoot || '.'
      const changedPaths = new Set<string>()

      if (currentHead !== previousHead) {
        const diffResult = await spawnWithResult(
          'git',
          [
            'diff',
            '--name-only',
            '--no-renames',
            `${previousHead}..${currentHead}`,
            '--',
            statusScope,
          ],
          {
            cwd: this.repoRoot,
            maxBuffer: this.maxBufferBytes,
            verbose: false,
          }
        )
        if (diffResult.status !== 0) {
          return null
        }

        for (const line of diffResult.stdout
          .split(/\r?\n/)
          .map((entry) => normalizeSlashes(entry.trim()))
          .filter((entry) => entry.length > 0)) {
          changedPaths.add(line)
        }
      }

      const statusResult = await spawnWithResult(
        'git',
        [
          'status',
          '--porcelain=1',
          '--untracked-files=all',
          '--ignored=matching',
          '--ignore-submodules=all',
          '--',
          statusScope,
        ],
        {
          cwd: this.repoRoot,
          maxBuffer: this.maxBufferBytes,
          verbose: false,
        }
      )
      if (statusResult.status !== 0) {
        return null
      }

      const statusLines = statusResult.stdout
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0)
        .sort((first, second) => first.localeCompare(second))
      const currentDirtyDigest = createHash('sha1')
        .update(statusLines.join('\n'))
        .digest('hex')

      if (
        currentHead === previousHead &&
        previousDirtyDigest === currentDirtyDigest
      ) {
        return []
      }

      for (const path of this.#extractChangedPathsFromStatusOutput(
        statusResult.stdout
      )) {
        const normalizedPath = normalizeSlashes(path)
        if (normalizedPath.length > 0) {
          changedPaths.add(normalizedPath)
        }
      }

      return Array.from(changedPaths)
        .map((path) =>
          normalizePathKey(
            this.getRelativePathToWorkspace(this.#resolveRepoAbsolutePath(path))
          )
        )
        .sort((first, second) => first.localeCompare(second))
    } catch {
      return null
    }
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
    const worktreePath = this.#resolveWorktreePath(relativePath, 'any')
    if (worktreePath) {
      return fsReadFile(worktreePath, 'utf-8')
    }

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
    const worktreePath = this.#resolveWorktreePath(relativePath, 'any')
    if (worktreePath) {
      try {
        const stats = statSync(worktreePath)
        if (!stats.isFile() && !stats.isSymbolicLink()) {
          return undefined
        }
        return stats.size
      } catch {
        return undefined
      }
    }

    const spec = assertSafeGitSpec(
      relativePath ? `${this.ref}:${relativePath}` : this.ref
    )
    const result = spawnSync('git', ['cat-file', '-s', spec], {
      cwd: this.repoRoot,
      stdio: 'pipe',
      encoding: 'utf8',
      shell: false,
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

  async getContentId(path: string): Promise<string | undefined> {
    await this.#ensureRepoReady()
    const relativePath = this.#normalizeRepoPath(path)
    const worktreePath = this.#resolveWorktreePath(relativePath, 'any')

    // Prefer filesystem metadata/content hashing for live worktree files.
    if (worktreePath) {
      return undefined
    }

    const spec = relativePath ? `${this.ref}:${relativePath}` : this.ref
    const blobMeta = await this.#git!.getBlobMeta(spec)

    if (!blobMeta) {
      return undefined
    }

    return `git-blob:${blobMeta.sha}`
  }

  writeFileSync(path: string, content: FileSystemWriteFileContent): void {
    this.#ensureRepoReadySync()
    const absolutePath = this.#resolveRepoAbsolutePath(path)
    writeFileSync(absolutePath, normalizeWriteContent(content))
    this.#invalidateSessionPaths([path])
  }

  async writeFile(
    path: string,
    content: FileSystemWriteFileContent
  ): Promise<void> {
    await this.#ensureRepoReady()
    const absolutePath = this.#resolveRepoAbsolutePath(path)
    await writeFile(absolutePath, normalizeWriteContent(content))
    this.#invalidateSessionPaths([path])
  }

  writeFileStream(path: string): FileWritableStream {
    this.#ensureRepoReadySync()
    const absolutePath = this.#resolveRepoAbsolutePath(path)
    const stream = createWriteStream(absolutePath, { flags: 'w' })
    stream.on('finish', () => {
      this.#invalidateSessionPaths([path])
    })
    return Writable.toWeb(stream) as FileWritableStream
  }

  fileExistsSync(path: string): boolean {
    this.#ensureRepoReadySync()
    const relativePath = this.#normalizeRepoPath(path)
    const worktreePath = this.#resolveWorktreePath(relativePath, 'any')
    if (worktreePath) {
      return true
    }

    const spec = assertSafeGitSpec(
      relativePath ? `${this.ref}:${relativePath}` : this.ref
    )
    const result = spawnSync('git', ['cat-file', '-e', spec], {
      cwd: this.repoRoot,
      stdio: 'ignore',
      shell: false,
    })
    return result.status === 0
  }

  async fileExists(path: string): Promise<boolean> {
    await this.#ensureRepoReady()
    const relativePath = this.#normalizeRepoPath(path)
    const worktreePath = this.#resolveWorktreePath(relativePath, 'any')
    if (worktreePath) {
      return true
    }

    const spec = relativePath ? `${this.ref}:${relativePath}` : this.ref
    const meta = await this.#git!.getBlobMeta(spec)
    return meta !== null
  }

  getFileLastModifiedMsSync(path: string): number | undefined {
    this.#ensureRepoReadySync()
    const relativePath = this.#normalizeRepoPath(path)
    const worktreePath = this.#resolveWorktreePath(relativePath)
    if (worktreePath) {
      try {
        const stats = statSync(worktreePath)
        return stats.mtimeMs
      } catch {
        return undefined
      }
    }

    const safeRef = assertSafeGitArg(this.ref, 'ref')
    const result = spawnSync(
      'git',
      ['log', '-1', '--format=%ct', safeRef, '--', relativePath],
      { cwd: this.repoRoot, stdio: 'pipe', encoding: 'utf8', shell: false }
    )
    if (result.status !== 0) {
      return undefined
    }
    const trimmed = result.stdout?.trim()
    if (!trimmed) {
      return undefined
    }
    const seconds = Number(trimmed)
    if (!Number.isFinite(seconds)) {
      return undefined
    }
    return seconds * 1000
  }

  async getFileLastModifiedMs(path: string): Promise<number | undefined> {
    await this.#ensureRepoReady()
    const relativePath = this.#normalizeRepoPath(path)
    const worktreePath = this.#resolveWorktreePath(relativePath)
    if (worktreePath) {
      try {
        const stats = await stat(worktreePath)
        return stats.mtimeMs
      } catch {
        return undefined
      }
    }

    const safeRef = assertSafeGitArg(this.ref, 'ref')
    const result = await spawnWithResult(
      'git',
      ['log', '-1', '--format=%ct', safeRef, '--', relativePath],
      { cwd: this.repoRoot, maxBuffer: this.maxBufferBytes, verbose: false }
    )
    if (result.status !== 0) {
      return undefined
    }
    const trimmed = result.stdout.trim()
    if (!trimmed) {
      return undefined
    }
    const seconds = Number(trimmed)
    if (!Number.isFinite(seconds)) {
      return undefined
    }
    return seconds * 1000
  }

  deleteFileSync(path: string): void {
    this.#ensureRepoReadySync()
    const absolutePath = this.#resolveRepoAbsolutePath(path)
    rmSync(absolutePath, { force: true })
    this.#invalidateSessionPaths([path])
  }

  async deleteFile(path: string): Promise<void> {
    await this.#ensureRepoReady()
    const absolutePath = this.#resolveRepoAbsolutePath(path)
    await rm(absolutePath, { force: true })
    this.#invalidateSessionPaths([path])
  }

  async createDirectory(path: string): Promise<void> {
    await this.#ensureRepoReady()
    const absolutePath = this.#resolveRepoAbsolutePath(path)
    await mkdir(absolutePath, { recursive: true })
    this.#invalidateSessionPaths([path])
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
    this.#invalidateSessionPaths([source, target])
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
    this.#invalidateSessionPaths([source, target])
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
        shell: false,
      }
    )
    return result.status === 0
  }

  close() {
    if (this.#closed) {
      return
    }
    this.#closed = true
    this.#historyWarmupInFlight.clear()
    if (this.#session) {
      Session.reset(this, this.#session.snapshot.id)
      this.#session = undefined
    } else {
      Session.reset(this)
    }
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

  #extractHeadFromWorkspaceToken(token: string): string | null {
    const match = /^head:([^;]+);/.exec(token)
    return match?.[1] ?? null
  }

  #extractDirtyDigestFromWorkspaceToken(token: string): string | null {
    const match = /;dirty:([^;]+);/.exec(token)
    return match?.[1] ?? null
  }

  #decodeGitStatusPath(path: string): string {
    const trimmed = path.trim()
    if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) {
      return normalizeSlashes(trimmed)
    }

    const unquoted = trimmed
      .slice(1, -1)
      .replace(/\\\"/g, '"')
      .replace(/\\\\/g, '\\')

    return normalizeSlashes(unquoted)
  }

  #extractChangedPathsFromStatusOutput(output: string): string[] {
    const changedPaths: string[] = []
    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0)

    for (const line of lines) {
      if (line.length <= 3) {
        continue
      }

      const rawPath = line.slice(3).trim()
      if (!rawPath) {
        continue
      }

      if (rawPath.includes(' -> ')) {
        const [fromPath, toPath] = rawPath.split(' -> ')
        if (fromPath) {
          changedPaths.push(this.#decodeGitStatusPath(fromPath))
        }
        if (toPath) {
          changedPaths.push(this.#decodeGitStatusPath(toPath))
        }
        continue
      }

      changedPaths.push(this.#decodeGitStatusPath(rawPath))
    }

    return changedPaths
  }

  #hasWorktreeRoot(): boolean {
    if (!this.#worktreeEnabled) {
      return false
    }

    if (!this.#worktreeRootChecked) {
      this.#worktreeRootChecked = true
      this.#worktreeRootExists = existsSync(join(this.repoRoot, '.git'))
    }

    return this.#worktreeRootExists
  }

  #resolveWorktreePath(
    relativePath: string,
    kind: 'file' | 'directory' | 'any' = 'file'
  ): string | undefined {
    if (!this.#hasWorktreeRoot()) {
      return undefined
    }

    const absolutePath = this.#resolveRepoAbsolutePath(relativePath)

    try {
      const stats = statSync(absolutePath)
      if (kind === 'directory' && !stats.isDirectory()) {
        return undefined
      }
      if (kind === 'file' && !stats.isFile() && !stats.isSymbolicLink()) {
        return undefined
      }
    } catch {
      return undefined
    }

    return absolutePath
  }

  #shouldIncludeWorktreeEntry(relativePath: string): boolean {
    if (!relativePath) {
      return true
    }

    if (relativePath === '.git' || relativePath.startsWith('.git/')) {
      return false
    }

    if (relativePath === '.renoun' || relativePath.startsWith('.renoun/')) {
      return false
    }

    return true
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
    const worktreePath = this.#resolveWorktreePath(relativePath, 'directory')
    if (worktreePath) {
      return this.#readDirectoryFromFsSync(relativePath, worktreePath)
    }

    const spec = assertSafeGitSpec(
      relativePath ? `${this.ref}:${relativePath}` : this.ref
    )
    const result = spawnSync('git', ['ls-tree', '-z', spec], {
      cwd: this.repoRoot,
      stdio: 'pipe',
      encoding: 'utf8',
      shell: false,
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
    const worktreePath = this.#resolveWorktreePath(relativePath, 'directory')
    if (worktreePath) {
      return this.#readDirectoryFromFs(relativePath, worktreePath)
    }

    const spec = assertSafeGitSpec(
      relativePath ? `${this.ref}:${relativePath}` : this.ref
    )
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

  /** Read directory using Node fs (worktree overlay). */
  #readDirectoryFromFsSync(
    relativePath: string,
    absolutePath: string
  ): DirectoryEntry[] {
    const entries = readdirSync(absolutePath, { withFileTypes: true })
    const directoryEntries: DirectoryEntry[] = []
    const base =
      relativePath && relativePath !== '.'
        ? trimTrailingSlashes(normalizeSlashes(relativePath))
        : ''

    for (const entry of entries) {
      const entryPath = base ? joinPaths(base, entry.name) : entry.name
      if (!this.#shouldIncludeWorktreeEntry(entryPath)) {
        continue
      }
      directoryEntries.push({
        name: entry.name,
        path: ensureRelativePath(entryPath),
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile() || entry.isSymbolicLink(),
      })
    }

    return directoryEntries
  }

  /** Read directory using Node fs (worktree overlay). */
  async #readDirectoryFromFs(
    relativePath: string,
    absolutePath: string
  ): Promise<DirectoryEntry[]> {
    const entries = await readdir(absolutePath, { withFileTypes: true })
    const directoryEntries: DirectoryEntry[] = []
    const base =
      relativePath && relativePath !== '.'
        ? trimTrailingSlashes(normalizeSlashes(relativePath))
        : ''

    for (const entry of entries) {
      const entryPath = base ? joinPaths(base, entry.name) : entry.name
      if (!this.#shouldIncludeWorktreeEntry(entryPath)) {
        continue
      }
      directoryEntries.push({
        name: entry.name,
        path: ensureRelativePath(entryPath),
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile() || entry.isSymbolicLink(),
      })
    }

    return directoryEntries
  }

  #readFileSyncInternal(path: string): string {
    const relativePath = this.#normalizeRepoPath(path)
    const worktreePath = this.#resolveWorktreePath(relativePath)
    if (worktreePath) {
      return readFileSync(worktreePath, 'utf-8')
    }

    const spec = assertSafeGitSpec(
      relativePath ? `${this.ref}:${relativePath}` : this.ref
    )
    const result = spawnSync('git', ['cat-file', '-p', spec], {
      cwd: this.repoRoot,
      stdio: 'pipe',
      encoding: 'utf8',
      shell: false,
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
    const worktreePath = this.#resolveWorktreePath(relativePath)
    if (worktreePath) {
      const buffer = readFileSync(worktreePath)
      return new Uint8Array(buffer)
    }

    const spec = assertSafeGitSpec(
      relativePath ? `${this.ref}:${relativePath}` : this.ref
    )
    const result = spawnSync('git', ['cat-file', '-p', spec], {
      cwd: this.repoRoot,
      stdio: 'pipe',
      encoding: 'buffer',
      maxBuffer: this.maxBufferBytes,
      shell: false,
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
    const worktreePath = this.#resolveWorktreePath(relativePath)
    if (worktreePath) {
      const buffer = await fsReadFile(worktreePath)
      return new Uint8Array(buffer)
    }

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
        '[GitFileSystem] Repository initialization in progress (async).'
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

    this.#refreshSessionAfterRootChange(this.repoRoot, resolved)
    this.repoRoot = resolved
    this.#worktreeRootChecked = false
    this.#worktreeRootExists = false
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

  #refreshSessionAfterRootChange(
    previousRepoRoot: string,
    resolvedRepoRoot: string
  ) {
    const previousResolved = resolve(previousRepoRoot)
    const nextResolved = resolve(resolvedRepoRoot)

    if (previousResolved === nextResolved) {
      return
    }

    Session.reset(this)
    this.#session = undefined
  }

  #ensureCachedScopeSync(scopeDirectories: string[]) {
    if (!looksLikeCacheClone(this.repoRoot, this.cacheDirectory)) {
      return
    }
    if (!scopeDirectories.length && this.#preparedScope.size === 0) {
      return
    }
    const { merged, missing } = mergeScopeDirectories(
      this.#preparedScope,
      scopeDirectories
    )
    if (missing.length === 0) {
      return
    }
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
    if (remoteSha && localSha === remoteSha) {
      return
    }

    if (this.verbose) {
      console.log(
        `[GitFileSystem] Cached ref "${ref}" moved; fetching ${remote}…`
      )
    }
    const safeRemote = assertSafeGitArg(remote, 'remote')
    const baseEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    let result = spawnSync('git', ['fetch', '--quiet', safeRemote], {
      cwd: this.repoRoot,
      stdio: 'pipe',
      encoding: 'utf8',
      env: baseEnv,
      shell: false,
    })
    if (result.status !== 0) {
      const stderr = result.stderr?.trim() || ''
      if (/protocol.*file/i.test(stderr) || /file.*not allowed/i.test(stderr)) {
        result = spawnSync(
          'git',
          ['-c', 'protocol.file.allow=always', 'fetch', '--quiet', safeRemote],
          {
            cwd: this.repoRoot,
            stdio: 'pipe',
            encoding: 'utf8',
            env: baseEnv,
            shell: false,
          }
        )
      }
    }
    if (result.status !== 0) {
      if (this.verbose) {
        const msg = result.stderr?.trim() || 'unknown error'
        console.warn(`[GitFileSystem] Fetch failed (${safeRemote}): ${msg}`)
      }
      return
    }

    if (remoteSha) {
      const refName = remoteRef.replace(/^refs\/heads\//, '')
      const safeTrackingRef = assertSafeGitArg(
        `refs/remotes/${safeRemote}/${refName}`,
        'trackingRef'
      )
      const safeRemoteSha = assertSafeGitArg(remoteSha, 'remoteSha')
      spawnSync('git', ['update-ref', safeTrackingRef, safeRemoteSha], {
        cwd: this.repoRoot,
        stdio: 'ignore',
        shell: false,
      })
    }
  }

  #getSession(): Session {
    if (!this.#session) {
      this.#session = Session.for(this, undefined, this.#cache)
    }

    return this.#session
  }

  #invalidateSessionPaths(paths: readonly string[]): void {
    const session = Session.for(this, undefined, this.#cache)
    for (const path of paths) {
      const normalizedPath = this.#normalizeRepoPath(path)
      if (!normalizedPath) {
        continue
      }
      session.invalidatePath(normalizedPath)

      const parentDirectory = dirname(normalizedPath)
      if (
        parentDirectory &&
        parentDirectory !== '.' &&
        parentDirectory !== '/'
      ) {
        session.invalidatePath(parentDirectory)
      }
    }
  }

  #clearRefCaches(reason: string): void {
    void reason
    this.#refCommit = null
    this.#refCommitPromise = null
    this.#historyWarmupInFlight.clear()

    const session = this.#session
    if (session) {
      this.#session = undefined
      Session.reset(this, session.snapshot.id)
    } else {
      Session.reset(this)
    }
  }

  #createPersistentCacheNodeKey(scope: string, payload: unknown): string {
    return createGitFileSystemPersistentCacheNodeKey({
      domainVersion: GIT_HISTORY_CACHE_VERSION,
      repository: this.repository,
      repoRoot: this.repoRoot,
      namespace: scope,
      payload,
    })
  }

  async #replacePersistentNode<Value>(
    session: Session,
    nodeKey: string,
    value: Value
  ): Promise<void> {
    await session.cache.put(nodeKey, value, {
      persist: true,
      deps: [
        {
          depKey: `const:git-file-system-cache:${GIT_HISTORY_CACHE_VERSION}`,
          depVersion: GIT_HISTORY_CACHE_VERSION,
        },
      ],
    })
  }

  async #getRefCacheIdentity(ref: string): Promise<{
    identity: string
    deterministic: boolean
  }>
  async #getRefCacheIdentity(
    ref: string,
    options: { forceRefresh?: boolean }
  ): Promise<{
    identity: string
    deterministic: boolean
  }>
  async #getRefCacheIdentity(
    ref: string,
    options: { forceRefresh?: boolean } = {}
  ): Promise<{
    identity: string
    deterministic: boolean
  }> {
    const normalizedRef = ref.trim()
    const now = Date.now()
    const forceRefresh = options.forceRefresh === true
    const nodeKey = this.#createPersistentCacheNodeKey('ref-identity', {
      ref: normalizedRef,
    })
    const session = this.#getSession()
    const cached = await session.cache.get<RefIdentity>(nodeKey)

    if (!forceRefresh && cached && now - cached.checkedAt < REF_IDENTITY_CACHE_TTL_MS) {
      return {
        identity: cached.identity,
        deterministic: cached.deterministic,
      }
    }

    const next = await this.#resolveRefCacheIdentity(normalizedRef, cached)
    await this.#getSession().cache.put(nodeKey, next, {
      persist: false,
    })

    return {
      identity: next.identity,
      deterministic: next.deterministic,
    }
  }

  async #resolveRefCacheIdentity(
    ref: string,
    cached?: RefIdentity
  ): Promise<RefIdentity> {
    let identity = ref
    let deterministic = false

    try {
      const resolved = await this.#resolveRefToCommit(ref)
      if (resolved) {
        identity = resolved
        deterministic = true
      }
    } catch {
      if (cached !== undefined) {
        return {
          identity: cached.identity,
          deterministic: cached.deterministic,
          checkedAt: Date.now(),
        }
      }
    }

    const next: RefIdentity = {
      identity,
      deterministic,
      checkedAt: Date.now(),
    }

    if (cached && cached.identity !== next.identity) {
      this.#clearRefCaches(
        '[renoun] Git ref identity changed; clearing in-memory ref caches.'
      )
    }

    return next
  }

  async #getGitLogRefCacheIdentity(ref: string): Promise<{
    identity: string
    deterministic: boolean
  }> {
    const rangeMatch = ref.match(/^(.+?)(\.\.\.?)(.+)$/)
    if (!rangeMatch) {
      return this.#getRefCacheIdentity(ref)
    }

    const left = await this.#getRefCacheIdentity(rangeMatch[1].trim())
    const right = await this.#getRefCacheIdentity(rangeMatch[3].trim())

    return {
      identity: `${left.identity}${rangeMatch[2]}${right.identity}`,
      deterministic: left.deterministic && right.deterministic,
    }
  }

  async #getAncestorBarrelEntryCandidates(
    filePath: string,
    commitSha: string
  ): Promise<string[]> {
    const git = this.#git
    if (!git) {
      return []
    }

    const normalizedFilePath = normalizePath(filePath)
    const candidates: string[] = []
    const visitedDirectories = new Set<string>()
    let currentDirectory = normalizePath(dirname(normalizedFilePath))

    while (currentDirectory && !visitedDirectories.has(currentDirectory)) {
      visitedDirectories.add(currentDirectory)

      for (const indexFile of INDEX_FILE_CANDIDATES) {
        const candidate =
          currentDirectory === '.'
            ? normalizePath(indexFile)
            : joinPath(currentDirectory, indexFile)

        if (candidate === normalizedFilePath) {
          continue
        }
        if (!hasJavaScriptLikeExtension(candidate)) {
          continue
        }

        const meta = await git.getBlobMeta(`${commitSha}:${candidate}`)
        if (meta?.type === 'blob') {
          candidates.push(candidate)
          break
        }
      }

      if (currentDirectory === '.') {
        break
      }

      const parentDirectory = normalizePath(dirname(currentDirectory))
      if (parentDirectory === currentDirectory) {
        break
      }
      currentDirectory = parentDirectory || '.'
    }

    return Array.from(new Set(candidates))
  }

  async #getOrBuildReverseReExportGraph(options: {
    commitSha: string
    entryFiles: string[]
    scopeDirectories: string[]
    maxDepth: number
  }): Promise<Map<string, Set<string>>> {
    const sortedEntries = [
      ...new Set(options.entryFiles.map(normalizePath)),
    ].sort()
    if (sortedEntries.length === 0) {
      return new Map()
    }

    const sortedScopeDirectories = [
      ...new Set(options.scopeDirectories.map(normalizePath)),
    ].sort()
    const session = this.#getSession()
    const nodeKey = this.#createPersistentCacheNodeKey(
      'reverse-reexport-graph',
      {
        commitSha: options.commitSha,
        entries: sortedEntries,
        scopeDirectories: sortedScopeDirectories,
        maxDepth: options.maxDepth,
      }
    )

    const payload =
      await session.cache.getOrCompute<ReverseReExportGraphPayload>(
        nodeKey,
        {
          persist: true,
          constDeps: [
            {
              name: 'git-file-system-cache',
              version: GIT_HISTORY_CACHE_VERSION,
            },
          ],
        },
        async (ctx) => {
          ctx.recordConstDep('git-file-system-cache', GIT_HISTORY_CACHE_VERSION)

          const reverseGraph = new Map<string, Set<string>>()
          const graphParseWarnings: string[] = []
          const git = this.#git!
          const sharedMetaCache = new Map<string, GitObjectMeta | null>()
          const sharedResolveCache = new Map<string, string | null>()
          const sharedBlobCache = new Map<string, Map<string, ExportItem>>()
          const sharedBlobShaResolveCache = new Map<string, string>()
          const sharedCacheStats = { hits: 0, misses: 0 }
          const getOrParseBlobExports = async (
            sha: string,
            filePathForParser: string
          ) =>
            this.#getOrParseExportsForBlob(sha, filePathForParser, async () => {
              return git.repoPath
                ? readBlobSync(git.repoPath, sha)
                : git.getBlobContentBySha(sha)
            })

          await mapWithLimit(sortedEntries, 3, async (entryFile) => {
            const context: CollectContext = {
              git,
              commit: options.commitSha,
              maxDepth: options.maxDepth,
              blobCache: sharedBlobCache,
              getOrParseBlobExports,
              scopeDirectories: sortedScopeDirectories,
              parseWarnings: graphParseWarnings,
              cacheStats: sharedCacheStats,
              metaCache: sharedMetaCache,
              resolveCache: sharedResolveCache,
              blobShaResolveCache: sharedBlobShaResolveCache,
              repoPath: git.repoPath,
              reverseReExportGraph: reverseGraph,
            }

            await collectExportsFromFile(context, entryFile, 0, new Set())
          })

          return {
            generatedAt: new Date().toISOString(),
            commitSha: options.commitSha,
            entries: sortedEntries,
            edges: serializeReverseReExportGraph(reverseGraph),
          }
        }
      )

    return deserializeReverseReExportGraph(payload.edges)
  }

  #getRelatedBarrelEntries(
    filePath: string,
    reverseGraph: Map<string, Set<string>>,
    barrelCandidates: string[]
  ): string[] {
    const normalizedFilePath = normalizePath(filePath)
    const barrelSet = new Set(
      barrelCandidates.map((entry) => normalizePath(entry))
    )
    const relatedEntries = new Set<string>()
    const queue = [normalizedFilePath]
    const visited = new Set<string>()

    while (queue.length > 0) {
      const currentPath = queue.shift()!
      if (visited.has(currentPath)) {
        continue
      }
      visited.add(currentPath)

      const parents = reverseGraph.get(currentPath)
      if (!parents) {
        continue
      }

      for (const parent of parents) {
        if (barrelSet.has(parent)) {
          relatedEntries.add(parent)
        }
        if (!visited.has(parent)) {
          queue.push(parent)
        }
      }
    }

    return Array.from(relatedEntries).sort()
  }

  async #scheduleRelatedBarrelHistoryWarmup(options: {
    entryFiles: string[]
    commitSha: string
    scopeDirectories: string[]
    ref: ExportHistoryOptions['ref']
    limit?: number
    maxDepth: number
    detectUpdates: boolean
    updateMode: 'body' | 'signature'
  }): Promise<void> {
    if (options.entryFiles.length !== 1) {
      return
    }

    const sourceEntryFile = normalizePath(options.entryFiles[0] ?? '')
    if (!sourceEntryFile || !looksLikeFilePath(sourceEntryFile)) {
      return
    }

    const barrelCandidates = await this.#getAncestorBarrelEntryCandidates(
      sourceEntryFile,
      options.commitSha
    )

    if (barrelCandidates.length === 0) {
      return
    }

    const warmupScopeDirectories = Array.from(
      new Set([
        ...options.scopeDirectories.map((path) => normalizePath(path)),
        ...barrelCandidates.map((entry) => normalizePath(dirname(entry))),
      ])
    ).sort()

    const reverseGraph = await this.#getOrBuildReverseReExportGraph({
      commitSha: options.commitSha,
      entryFiles: barrelCandidates,
      scopeDirectories: warmupScopeDirectories,
      maxDepth: options.maxDepth,
    })
    const relatedEntries = this.#getRelatedBarrelEntries(
      sourceEntryFile,
      reverseGraph,
      barrelCandidates
    )
      .filter((entry) => entry !== sourceEntryFile)
      .slice(0, 2)

    if (relatedEntries.length === 0) {
      return
    }

    for (const relatedEntry of relatedEntries) {
      const warmupKey = this.#createPersistentCacheNodeKey(
        'public-api-warmup',
        {
          commitSha: options.commitSha,
          entry: relatedEntry,
          ref: options.ref ?? null,
          limit: options.limit ?? null,
          maxDepth: options.maxDepth,
          detectUpdates: options.detectUpdates,
          updateMode: options.updateMode,
        }
      )

      if (this.#historyWarmupInFlight.has(warmupKey)) {
        continue
      }

      this.#historyWarmupInFlight.add(warmupKey)
      queueMicrotask(() => {
        void (async () => {
          if (this.#closed) {
            return
          }

          const warmupGenerator = this.getExportHistory({
            entry: relatedEntry,
            ref: options.ref,
            limit: options.limit,
            maxDepth: options.maxDepth,
            detectUpdates: options.detectUpdates,
            updateMode: options.updateMode,
            __skipWarmup: true,
          } as ExportHistoryOptions & { __skipWarmup: true })

          await drainExportHistoryGenerator(warmupGenerator)
        })()
          .catch(() => {
            // Warmup is opportunistic; ignore failures.
          })
          .finally(() => {
            this.#historyWarmupInFlight.delete(warmupKey)
          })
      })
    }
  }

  async #getOrParseExportsForBlob(
    sha: string,
    fileNameForParser: string,
    getContent: () => Promise<string | null>
  ): Promise<Map<string, ExportItem>> {
    assertSafeGitArg(sha, 'sha')

    const parserFlavor = getParserFlavorFromFileName(fileNameForParser)
    const session = this.#getSession()
    const nodeKey = this.#createPersistentCacheNodeKey('blob-exports', {
      sha,
      parserFlavor,
    })
    const persistedPayload =
      await session.cache.get<Record<string, ExportItem>>(nodeKey)
    if (persistedPayload !== undefined) {
      return deserializeExportItemMap(persistedPayload)
    }

    const content = await getContent()
    if (content == null) {
      // Treat missing content as a transient miss and avoid persisting an empty payload.
      return new Map()
    }

    const parsedPayload = await session.cache.getOrCompute<
      Record<string, ExportItem>
    >(
      nodeKey,
      {
        persist: true,
        constDeps: [
          {
            name: 'git-file-system-cache',
            version: GIT_HISTORY_CACHE_VERSION,
          },
        ],
      },
      async (ctx) => {
        ctx.recordConstDep('git-file-system-cache', GIT_HISTORY_CACHE_VERSION)
        return serializeExportItemMap(
          scanModuleExports(fileNameForParser, content)
        )
      }
    )
    return deserializeExportItemMap(parsedPayload)
  }

  async #gitLogCached(
    ref: string,
    path: string | string[],
    options: { reverse?: boolean; limit?: number; follow?: boolean } = {}
  ): Promise<GitLogCommit[]> {
    await this.#ensureRepoReady()
    const normalizedPath = Array.isArray(path)
      ? Array.from(
          new Set(
            path.map((entry) => normalizePath(String(entry))).filter(Boolean)
          )
        ).sort()
      : normalizePath(String(path))
    const { identity: refIdentity, deterministic } =
      await this.#getGitLogRefCacheIdentity(ref)
    const pathsKey = Array.isArray(normalizedPath)
      ? normalizedPath.join('\x00')
      : normalizedPath
    const key = `${refIdentity}\x01${pathsKey}\x01${options.reverse ? 1 : 0}\x01${options.limit ?? ''}\x01${options.follow ? 1 : 0}`
    const nodeKey = this.#createPersistentCacheNodeKey('git-log', {
      refIdentity,
      key,
      path: normalizedPath,
      reverse: Boolean(options.reverse),
      limit: options.limit ?? null,
      follow: Boolean(options.follow),
    })

    return this.#getSession().cache.getOrCompute(
      nodeKey,
      {
        persist: deterministic,
        constDeps: [
          {
            name: 'git-file-system-cache',
            version: GIT_HISTORY_CACHE_VERSION,
          },
        ],
      },
      async (ctx) => {
        ctx.recordConstDep('git-file-system-cache', GIT_HISTORY_CACHE_VERSION)

        return gitLogForPath(this.repoRoot, ref, normalizedPath, {
          reverse: Boolean(options.reverse),
          limit: options.limit,
          follow: Boolean(options.follow),
          maxBufferBytes: this.maxBufferBytes,
        })
      }
    )
  }

  async #gitRenameNewToOldBetween(
    oldCommit: string,
    newCommit: string,
    scopeDirectories: string[]
  ): Promise<Map<string, string>> {
    const safeOldCommit = assertSafeGitArg(oldCommit, 'oldCommit')
    const safeNewCommit = assertSafeGitArg(newCommit, 'newCommit')
    const args = [
      'diff',
      '--name-status',
      '-M',
      '--diff-filter=R',
      '-z',
      safeOldCommit,
      safeNewCommit,
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

  async #gitIsAncestorCommit(
    ancestorCommit: string,
    descendantCommit: string
  ): Promise<boolean> {
    const safeAncestor = assertSafeGitArg(ancestorCommit, 'ancestorCommit')
    const safeDescendant = assertSafeGitArg(
      descendantCommit,
      'descendantCommit'
    )
    try {
      await spawnAsync(
        'git',
        ['merge-base', '--is-ancestor', safeAncestor, safeDescendant],
        {
          cwd: this.repoRoot,
          maxBuffer: this.maxBufferBytes,
          verbose: this.verbose,
        }
      )
      return true
    } catch {
      return false
    }
  }

  async #getCommitUnix(commit: string): Promise<number> {
    const safeCommit = assertSafeGitArg(commit, 'commit')
    const out = await spawnAsync(
      'git',
      ['show', '-s', '--format=%at', safeCommit],
      {
        cwd: this.repoRoot,
        maxBuffer: this.maxBufferBytes,
        verbose: this.verbose,
      }
    )
    return Number(out.trim()) || 0
  }

  async #getReleaseTagTimeline(): Promise<
    Array<{ tag: string; unix: number }>
  > {
    const tagDateResult = await spawnWithResult(
      'git',
      ['tag', '-l', '--format=%(refname:short) %(creatordate:unix)'],
      { cwd: this.repoRoot, maxBuffer: this.maxBufferBytes }
    )

    const timeline: Array<{ tag: string; unix: number }> = []
    const raw = tagDateResult.stdout.trim()
    if (!raw) {
      return timeline
    }

    for (const line of raw.split('\n')) {
      const [tag, unix] = line.split(' ')
      const timestamp = Number(unix)
      if (tag && Number.isFinite(timestamp)) {
        timeline.push({ tag, unix: timestamp })
      }
    }

    timeline.sort((a, b) =>
      a.unix === b.unix ? a.tag.localeCompare(b.tag) : a.unix - b.unix
    )
    return timeline
  }

  async #tagExists(tag: string): Promise<boolean> {
    const safeTag = assertSafeGitArg(tag, 'tag')
    const result = await spawnWithResult(
      'git',
      ['show-ref', '--verify', '--quiet', `refs/tags/${safeTag}`],
      {
        cwd: this.repoRoot,
        maxBuffer: this.maxBufferBytes,
      }
    )

    return result.status === 0
  }

  async #resolveReleaseWindow(release: string): Promise<{
    targetTag: string
    previousTag?: string
  }> {
    const normalized = release.trim()
    if (!normalized) {
      throw new Error('[GitFileSystem] Invalid release: expected a tag name.')
    }

    const timeline = await this.#getReleaseTagTimeline()
    if (timeline.length === 0) {
      throw new Error('[GitFileSystem] No release tags found in repository.')
    }

    const targetIndex =
      normalized === 'latest'
        ? timeline.length - 1
        : timeline.findIndex((entry) => entry.tag === normalized)

    if (targetIndex < 0) {
      throw new Error(`[GitFileSystem] Invalid release: "${release}"`)
    }

    const targetTag = timeline[targetIndex]!.tag
    const safeTargetTag = assertSafeGitArg(targetTag, 'release')
    const mergedResult = await spawnWithResult(
      'git',
      ['tag', '--merged', safeTargetTag],
      {
        cwd: this.repoRoot,
        maxBuffer: this.maxBufferBytes,
      }
    )
    const mergedTags = new Set(
      mergedResult.stdout
        .split('\n')
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
    const previousTag = timeline
      .slice(0, targetIndex)
      .reverse()
      .find((entry) => mergedTags.has(entry.tag))?.tag

    return {
      targetTag,
      previousTag,
    }
  }

  async #normalizeExportHistoryRefScope(
    ref: ExportHistoryOptions['ref']
  ): Promise<NormalizedExportHistoryRefScope> {
    if (ref === undefined) {
      return {
        source: 'default',
        endRef: this.ref,
        endRefExplicit: false,
      }
    }

    if (typeof ref === 'string') {
      const normalized = ref.trim()
      if (!normalized) {
        throw new Error(
          '[GitFileSystem] Invalid ref: expected a non-empty string.'
        )
      }

      if (normalized === 'latest') {
        const releaseWindow = await this.#resolveReleaseWindow(normalized)
        return {
          source: 'release',
          startRef: releaseWindow.previousTag,
          endRef: releaseWindow.targetTag,
          endRefExplicit: true,
          targetReleaseTag: releaseWindow.targetTag,
          previousReleaseTag: releaseWindow.previousTag,
        }
      }

      const isTag = await this.#tagExists(normalized)
      if (isTag) {
        const releaseWindow = await this.#resolveReleaseWindow(normalized)
        return {
          source: 'release',
          startRef: releaseWindow.previousTag,
          endRef: releaseWindow.targetTag,
          endRefExplicit: true,
          targetReleaseTag: releaseWindow.targetTag,
          previousReleaseTag: releaseWindow.previousTag,
        }
      }

      return {
        source: 'end',
        endRef: normalized,
        endRefExplicit: true,
      }
    }

    const rawStart = ref.start
    const rawEnd = ref.end
    const startRef = rawStart === undefined ? undefined : rawStart.trim()
    const explicitEnd = rawEnd === undefined ? undefined : rawEnd.trim()

    if (rawStart !== undefined && !startRef) {
      throw new Error(
        '[GitFileSystem] Invalid ref.start: expected a non-empty string.'
      )
    }
    if (rawEnd !== undefined && !explicitEnd) {
      throw new Error(
        '[GitFileSystem] Invalid ref.end: expected a non-empty string.'
      )
    }
    if (!startRef && !explicitEnd) {
      throw new Error(
        '[GitFileSystem] Invalid ref: expected "start" and/or "end".'
      )
    }

    return {
      source: startRef ? 'range' : 'end',
      startRef,
      endRef: explicitEnd ?? this.ref,
      endRefExplicit: Boolean(explicitEnd),
    }
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
        `[GitFileSystem] Building release map for ${neededCommits.size} commits (earliest: ${new Date(earliestUnix * 1000).toISOString()})...`
      )
    }

    const releaseTimeline = await this.#getReleaseTagTimeline()
    const allReleaseTags = releaseTimeline.map((entry) => entry.tag)
    const tagDates = new Map(
      releaseTimeline.map((entry) => [entry.tag, entry.unix] as const)
    )

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
        `[GitFileSystem] Processing ${releaseTags.length}/${allReleaseTags.length} relevant tags (starting from ${releaseTags[0] || 'none'})...`
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
        `[GitFileSystem] Release map: ${commitToRelease.size}/${neededCommits.size} commits mapped`
      )
    }

    return commitToRelease
  }

  /** Get the export history of a repository based on a set of entry files. */
  async *getExportHistory(
    options: ExportHistoryOptions = {}
  ): ExportHistoryGenerator {
    const _startMs = Date.now()
    this.#assertOpen()
    const internalOptions = options as ExportHistoryOptions & {
      __skipWarmup?: boolean
    }
    const skipWarmup = internalOptions.__skipWarmup === true

    yield {
      type: 'progress',
      phase: 'start',
      elapsedMs: 0,
    } satisfies ExportHistoryProgressEvent

    const entryArgs = Array.isArray(options.entry)
      ? options.entry
      : options.entry
        ? [options.entry]
        : []
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

    yield {
      type: 'progress',
      phase: 'ensureRepoReady',
      elapsedMs: Date.now() - _startMs,
    } satisfies ExportHistoryProgressEvent

    const normalizedRefScope = await this.#normalizeExportHistoryRefScope(
      options.ref
    )
    const objectEndRefProvided =
      typeof options.ref === 'object' &&
      options.ref !== null &&
      options.ref.end !== undefined
    const startRef = normalizedRefScope.startRef
    const endRef = normalizedRefScope.endRef
    const targetReleaseTag = normalizedRefScope.targetReleaseTag
    const previousReleaseTag = normalizedRefScope.previousReleaseTag

    let startCommit: string | null = null
    let endCommit: string
    if (startRef) {
      startCommit = await this.#resolveRefToCommit(startRef)
      if (!startCommit) {
        if (normalizedRefScope.source === 'range') {
          throw new Error(`[GitFileSystem] Invalid ref.start: "${startRef}"`)
        }
        throw new Error(`[GitFileSystem] Invalid ref: "${startRef}"`)
      }
    }

    if (normalizedRefScope.endRefExplicit || targetReleaseTag) {
      const resolved = await this.#resolveRefToCommit(endRef)
      if (!resolved) {
        if (normalizedRefScope.source === 'range' || objectEndRefProvided) {
          throw new Error(`[GitFileSystem] Invalid ref.end: "${endRef}"`)
        }
        throw new Error(`[GitFileSystem] Invalid ref: "${endRef}"`)
      }
      endCommit = resolved
    } else {
      endCommit = await this.#getRefCommit()
    }

    if (startCommit) {
      const isAncestor = await this.#gitIsAncestorCommit(startCommit, endCommit)
      if (!isAncestor) {
        throw new Error(
          `[GitFileSystem] Invalid ref range: start "${startRef}" is not an ancestor of end "${endRef}".`
        )
      }
    }

    yield {
      type: 'progress',
      phase: 'resolveHead',
      elapsedMs: Date.now() - _startMs,
    } satisfies ExportHistoryProgressEvent

    const maxDepth = options.maxDepth ?? this.maxDepth
    const limit = options.limit
    const detectUpdates = options.detectUpdates ?? true
    const updateMode = options.updateMode ?? 'signature'
    const git = this.#git!
    const canonicalEntries: string[] = []

    for (const source of uniqueEntrySources) {
      if (looksLikeFilePath(source)) {
        canonicalEntries.push(normalizePath(source))
        continue
      }

      const inferred = await inferEntryFile(
        this.repoRoot,
        git,
        endCommit,
        source
      )
      if (inferred.length > 0) {
        canonicalEntries.push(...inferred.map((entry) => normalizePath(entry)))
      }
    }

    const uniqueEntryRelatives = Array.from(new Set(canonicalEntries))
    if (uniqueEntryRelatives.length === 0) {
      throw new Error(`Could not resolve any entry files.`)
    }

    const session = this.#getSession()
    const sortedScopeDirectories = [...scopeDirectories].sort()
    const sortedEntryRelatives = [...uniqueEntryRelatives].sort()
    const keyObject = {
      ref: options.ref ?? null,
      refScope: normalizedRefScope.source,
      endRef,
      refCommit: endCommit,
      release: targetReleaseTag ?? null,
      startRef: startRef ?? null,
      startCommit: startCommit ?? null,
      include: sortedScopeDirectories,
      limit,
      maxDepth,
      detectUpdates,
      updateMode,
      entry: sortedEntryRelatives,
    }
    type ExportHistoryLatestPointer = {
      reportNodeKey: string
      lastCommitSha: string
    }
    const reportNodeKey = this.#createPersistentCacheNodeKey(
      'public-api-report',
      keyObject
    )
    const baseKeyObject = { ...keyObject, refCommit: null, startCommit: null }
    const latestNodeKey = this.#createPersistentCacheNodeKey(
      'public-api-latest',
      baseKeyObject
    )

    const cachedReport = await session.cache.get<ExportHistoryReport>(reportNodeKey)
    if (cachedReport) {
      return cachedReport
    }

    if (!skipWarmup) {
      void this.#scheduleRelatedBarrelHistoryWarmup({
        entryFiles: uniqueEntryRelatives,
        commitSha: endCommit,
        scopeDirectories: sortedScopeDirectories,
        ref: options.ref,
        limit,
        maxDepth,
        detectUpdates,
        updateMode,
      }).catch(() => {
        // Warmup is opportunistic; ignore failures.
      })
    }

    let resumeReport: ExportHistoryReport | null = null
    let resumeCommit: string | null = null
    let resumeSnapshot: ExportHistoryReport['lastExportSnapshot'] | null = null

    const latestPointer =
      await session.cache.get<ExportHistoryLatestPointer>(latestNodeKey)
    if (latestPointer?.reportNodeKey && latestPointer.lastCommitSha) {
      const previousReport = await session.cache.get<ExportHistoryReport>(
        latestPointer.reportNodeKey
      )
      const hasSameEntrySelection = Array.isArray(previousReport?.entryFiles)
        ? previousReport.entryFiles.length === sortedEntryRelatives.length &&
          [...previousReport.entryFiles]
            .sort()
            .every(
              (entryFile, index) => entryFile === sortedEntryRelatives[index]
            )
        : false
      if (
        previousReport?.repo === this.repoRoot &&
        hasSameEntrySelection &&
        previousReport.lastCommitSha &&
        previousReport.lastExportSnapshot &&
        previousReport.lastCommitSha === latestPointer.lastCommitSha
      ) {
        const isAncestor = await this.#gitIsAncestorCommit(
          previousReport.lastCommitSha,
          endCommit
        )
        if (isAncestor) {
          resumeReport = previousReport
          resumeCommit = previousReport.lastCommitSha
          resumeSnapshot = previousReport.lastExportSnapshot
        }
      }
    }

    // Fetch content history
    const logStartCommit = resumeCommit ?? startCommit
    const logRef = logStartCommit
      ? `${logStartCommit}..${endCommit}`
      : endCommit
    const contentCommits = await this.#gitLogCached(logRef, scopeDirectories, {
      reverse: true, // Oldest to Newest
      limit,
    })

    if (contentCommits.length === 0) {
      if (resumeReport) {
        await this.#replacePersistentNode(session, reportNodeKey, resumeReport)
        if (resumeReport.lastCommitSha) {
          await this.#replacePersistentNode(session, latestNodeKey, {
            reportNodeKey,
            lastCommitSha: resumeReport.lastCommitSha,
          })
        }
        return resumeReport
      }
      throw new Error(
        `No commits found for paths "${scopeDirectories.join(', ')}" in ref "${endRef}".`
      )
    }

    yield {
      type: 'progress',
      phase: 'gitLogCached',
      elapsedMs: Date.now() - _startMs,
      totalCommits: contentCommits.length,
    } satisfies ExportHistoryProgressEvent

    let findRelease: (commitSha: string) => string | undefined
    if (targetReleaseTag) {
      findRelease = () => targetReleaseTag
    } else {
      const commitToRelease = await this.#buildCommitReleaseMap(
        contentCommits,
        scopeDirectories,
        startCommit
      )
      findRelease = (commitSha: string) => commitToRelease.get(commitSha)
    }

    yield {
      type: 'progress',
      phase: 'buildCommitReleaseMap',
      elapsedMs: Date.now() - _startMs,
      totalCommits: contentCommits.length,
    } satisfies ExportHistoryProgressEvent

    // Attach release info
    const uniqueCommits: ExportHistoryCommit[] = contentCommits.map(
      (commit) => ({
        ...commit,
        release: targetReleaseTag
          ? targetReleaseTag
          : commit.tags?.length
            ? commit.tags[0]
            : findRelease(commit.sha),
      })
    )

    // Prepare processing
    const latestCommit = uniqueCommits[uniqueCommits.length - 1].sha

    yield {
      type: 'progress',
      phase: 'resolveEntries',
      elapsedMs: Date.now() - _startMs,
      totalCommits: uniqueCommits.length,
    } satisfies ExportHistoryProgressEvent

    // Shared per-run parse cache (blob SHA -> parsed exports) so later
    // module metadata work does not redo parsing in this run.
    const blobCache = new Map<string, Map<string, ExportItem>>()
    const exports: ExportHistoryReport['exports'] =
      resumeReport?.exports ?? Object.create(null)
    const parseWarnings: string[] = resumeReport?.parseWarnings
      ? [...resumeReport.parseWarnings]
      : []

    // Map<ExportName, Map<ExportId, ExportItem>>
    let previousExports: Map<string, Map<string, ExportItem>> | null = null
    let previousCommitHash: string | null = null
    let previousResolvedPaths: Map<string, string | null> | null = null
    let cacheHits = 0
    let cacheMisses = 0
    const getOrParseBlobExports = async (
      sha: string,
      filePathForParser: string
    ) =>
      this.#getOrParseExportsForBlob(sha, filePathForParser, async () => {
        return git.repoPath
          ? readBlobSync(git.repoPath, sha)
          : git.getBlobContentBySha(sha)
      })

    if (resumeSnapshot) {
      previousExports = deserializeExportSnapshot(resumeSnapshot)
      previousCommitHash = resumeCommit
    }

    const BATCH_SIZE = 8

    async function processCommit(
      commit: ExportHistoryCommit,
      commitTree?: Map<string, GitObjectMeta>
    ) {
      let hasEntry = false
      const currentExports = new Map<string, Map<string, ExportItem>>()

      // IMPORTANT: metaCache, resolveCache, and blobShaResolveCache MUST be
      // created fresh per commit. Sharing these across commits causes stale
      // cross-commit resolution where file renames/moves between commits are
      // missed, resulting in collapsed "big commit" changes instead of
      // granular per-commit tracking. The blobCache (export parse cache)
      // is safe to share because it is keyed by blob SHA (content-addressed).
      // See: https://github.com/souporserious/renoun/issues/XXX
      const context: CollectContext = {
        maxDepth,
        blobCache,
        getOrParseBlobExports,
        scopeDirectories,
        parseWarnings,
        git,
        commit: commit.sha,
        cacheStats: { hits: 0, misses: 0 },
        metaCache: new Map(),
        resolveCache: new Map(),
        blobShaResolveCache: new Map(),
        repoPath: git.repoPath,
      }

      if (commitTree) {
        for (const [path, meta] of commitTree) {
          context.metaCache.set(`${commit.sha}:${path}`, meta)
        }
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
        metaCache: context.metaCache,
        stats: {
          hits: context.cacheStats.hits,
          misses: context.cacheStats.misses,
        },
      }
    }

    function extractResolvedPaths(
      metaCache: Map<string, GitObjectMeta | null>
    ): Map<string, string | null> {
      const paths = new Map<string, string | null>()
      for (const [specifier, meta] of metaCache) {
        const colonIdx = specifier.indexOf(':')
        if (colonIdx !== -1) {
          paths.set(specifier.substring(colonIdx + 1), meta?.sha ?? null)
        }
      }
      return paths
    }

    function serializeExportSnapshot(
      exportMap: Map<string, Map<string, ExportItem>>
    ): Record<string, Record<string, ExportItem>> {
      const snapshot: Record<
        string,
        Record<string, ExportItem>
      > = Object.create(null)
      for (const [name, items] of exportMap) {
        const serialized: Record<string, ExportItem> = Object.create(null)
        for (const [id, item] of items) {
          serialized[id] = item
        }
        if (Object.keys(serialized).length) {
          snapshot[name] = serialized
        }
      }
      return snapshot
    }

    function deserializeExportSnapshot(
      snapshot: Record<string, Record<string, ExportItem>>
    ): Map<string, Map<string, ExportItem>> {
      const exportMap = new Map<string, Map<string, ExportItem>>()
      for (const [name, items] of Object.entries(snapshot)) {
        const mapped = new Map<string, ExportItem>()
        for (const [id, item] of Object.entries(items)) {
          mapped.set(id, item)
        }
        exportMap.set(name, mapped)
      }
      return exportMap
    }

    function fingerprintMatches(
      tree: Map<string, GitObjectMeta>,
      previousPaths: Map<string, string | null>
    ): boolean {
      for (const [path, prevSha] of previousPaths) {
        const currentMeta = tree.get(path)
        const currentSha = currentMeta?.sha ?? null
        if (currentSha !== prevSha) return false
      }
      return true
    }

    type ProcessCommitResult = Awaited<ReturnType<typeof processCommit>>

    const handleCommitResult = async (
      result: ProcessCommitResult
    ): Promise<boolean> => {
      previousResolvedPaths = extractResolvedPaths(result.metaCache)

      let currentExports = result.currentExports
      cacheHits += result.stats.hits
      cacheMisses += result.stats.misses

      if (!result.hasEntry) {
        if (previousExports) {
          currentExports = previousExports
        } else {
          globalCommitsProcessed++
          return false
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

        const { renamePairs, usedRemovedIds } = detectSameFileRenames({
          previousById,
          currentById,
          removedIds,
          preGrouped: { byFileAdded, byFileRemoved },
          renamedFileGroups,
          renamedFileThreshold: RENAME_SIGNATURE_DICE_MIN_RENAMED_FILE,
          marginThreshold: RENAME_SIGNATURE_DICE_MARGIN,
        })

        detectCrossFileRenames(
          previousById,
          currentById,
          removedIds,
          usedRemovedIds,
          renamePairs,
          RENAME_PATH_DICE_MIN,
          RENAME_SIGNATURE_DICE_MARGIN
        )

        // Detect re-export moves: same public name, different defining file.
        // This catches barrel-file reorganizations that other passes miss
        // (e.g. `timerGlobal` moving from TimerNode.js to Timer.js).
        detectSameNameMoves(
          previousExports,
          currentExports,
          previousById,
          currentById,
          removedIds,
          usedRemovedIds,
          renamePairs
        )

        const addedIds = new Set<string>()
        const renamedIds = new Set<string>()
        const updatedIds = new Set<string>()
        const deprecatedIds = new Set<string>()

        for (const [name, currentItems] of currentExports) {
          const previousItems = previousExports.get(name)
          for (const [id, currentExportItem] of currentItems) {
            const renameInfo = renamePairs.get(id)
            const history = mergeRenameHistory(
              exports,
              id,
              renameInfo?.oldId ?? id
            )

            const previousDeprecated = renameInfo?.oldId
              ? previousById.get(renameInfo.oldId)?.deprecated
              : (previousById.get(id)?.deprecated ??
                previousItems?.get(id)?.deprecated)
            const willDeprecate =
              currentExportItem.deprecated &&
              !previousDeprecated &&
              !deprecatedIds.has(id)

            if (renameInfo) {
              if (!renamedIds.has(id)) {
                const currentParsed = parseExportId(id)
                const previousParsed = parseExportId(renameInfo.oldId)
                const oldExportName = previousById.get(renameInfo.oldId)?.name

                history.push({
                  ...changeBase,
                  kind: 'Renamed',
                  name,
                  localName: currentExportItem.localName,
                  filePath: currentParsed?.file ?? '',
                  id,
                  previousName:
                    oldExportName && oldExportName !== name
                      ? oldExportName
                      : undefined,
                  previousFilePath:
                    currentParsed &&
                    previousParsed &&
                    currentParsed.file !== previousParsed.file
                      ? previousParsed.file
                      : undefined,
                  previousId: renameInfo.oldId,
                } as ExportChange)
                renamedIds.add(id)
              }
            } else if (!previousItems || !previousItems.has(id)) {
              const previousNames = previousNamesById.get(id)
              if (previousNames && previousNames.size > 0) {
                if (!renamedIds.has(id)) {
                  let actualPreviousName: string | undefined
                  for (const prevName of previousNames) {
                    if (prevName !== name) {
                      actualPreviousName = prevName
                      break
                    }
                  }
                  history.push({
                    ...changeBase,
                    kind: 'Renamed',
                    name,
                    localName: currentExportItem.localName,
                    filePath: parseExportId(id)?.file ?? '',
                    id,
                    previousName: actualPreviousName,
                    previousId: id,
                  } as ExportChange)
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
                    localName: currentExportItem.localName,
                    filePath: parseExportId(id)?.file ?? '',
                    id,
                  } as ExportChange)
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
              if (shouldRecord && !updatedIds.has(id)) {
                history.push({
                  ...changeBase,
                  kind: 'Updated',
                  name,
                  localName: currentExportItem.localName,
                  filePath: parseExportId(id)?.file ?? '',
                  id,
                  signature: signatureChanged,
                } as ExportChange)
                updatedIds.add(id)
              }
            }

            if (willDeprecate) {
              history.push({
                ...changeBase,
                kind: 'Deprecated',
                name,
                localName: currentExportItem.localName,
                filePath: parseExportId(id)?.file ?? '',
                id,
                message: currentExportItem.deprecatedMessage,
              } as ExportChange)
              deprecatedIds.add(id)
            }
          }
        }

        for (const removedId of removedIds) {
          if (usedRemovedIds.has(removedId)) continue
          let history = exports[removedId]
          if (!history) continue
          const removedItem = previousById.get(removedId)
          if (!removedItem) continue

          const collapsed = checkAndCollapseOscillation(
            history,
            'Removed',
            changeBase.release
          )
          if (collapsed && history.length === 0) {
            delete exports[removedId]
          } else if (!collapsed) {
            history.push({
              ...changeBase,
              kind: 'Removed',
              name: removedItem.name,
              localName: removedItem.localName,
              filePath: parseExportId(removedId)?.file ?? '',
              id: removedId,
            } as ExportChange)
          }
        }
      } else {
        // First commit where the entry file exists and no startRef baseline
        // was provided. When startRef IS provided, the baseline is
        // established from that commit (handled earlier), so silently
        // absorbing is correct — the user said "only show changes after
        // startRef". Without startRef, emit "Added" for every export so
        // the initial appearance is recorded in the history.
        if (!startCommit) {
          for (const [name, items] of currentExports) {
            for (const [id, item] of items) {
              let history = exports[id]
              if (!history) {
                history = []
                exports[id] = history
              }
              history.push({
                ...changeBase,
                kind: 'Added',
                name,
                localName: item.localName,
                filePath: parseExportId(id)?.file ?? '',
                id,
              })
            }
          }
        }
      }

      previousExports = currentExports
      previousCommitHash = result.commit.sha

      globalCommitsProcessed++
      return true
    }

    let globalCommitsProcessed = 0

    // Yield progress approximately 20 times during batch processing.
    // Each yield creates a React Suspense boundary, and hundreds of
    // boundaries add significant RSC serialisation overhead (~0.4 s each).
    // Yielding ~20 times keeps streaming responsive without the cumulative
    // overhead that causes multi-minute page loads.
    const yieldInterval = Math.max(1, Math.ceil(uniqueCommits.length / 20))

    let initialBatchStart = 0

    if (startCommit) {
      const unix = await this.#getCommitUnix(startCommit)
      const baselineRelease = targetReleaseTag
        ? previousReleaseTag
        : findRelease(startCommit)
      const baselineCommit = {
        unix,
        sha: startCommit,
        release: baselineRelease,
        tags: [],
      } satisfies ExportHistoryCommit

      const baselineTree = loadCommitTreeSync(git.repoPath, startCommit)
      const firstBatch = uniqueCommits.slice(0, BATCH_SIZE)
      const firstBatchTrees = new Map<string, Map<string, GitObjectMeta>>()
      for (const commit of firstBatch) {
        const tree = loadCommitTreeSync(git.repoPath, commit.sha)
        if (tree) {
          firstBatchTrees.set(commit.sha, tree)
        }
      }

      const [baselineResult, ...firstBatchResults] = await Promise.all([
        processCommit(baselineCommit, baselineTree ?? undefined),
        ...firstBatch.map((commit) =>
          processCommit(commit, firstBatchTrees.get(commit.sha))
        ),
      ])

      cacheHits += baselineResult.stats.hits
      cacheMisses += baselineResult.stats.misses
      previousResolvedPaths = extractResolvedPaths(baselineResult.metaCache)

      if (baselineResult.hasEntry) {
        previousExports = baselineResult.currentExports
        previousCommitHash = baselineCommit.sha
      }

      const firstBatchStart = 0
      for (const result of firstBatchResults) {
        const shouldYield = await handleCommitResult(result)
        if (shouldYield) {
          const isLastCommit = globalCommitsProcessed >= uniqueCommits.length
          if (isLastCommit || globalCommitsProcessed % yieldInterval === 0) {
            yield {
              type: 'progress',
              phase: 'batch',
              elapsedMs: Date.now() - _startMs,
              batchStart: firstBatchStart,
              batchSize: yieldInterval,
              totalCommits: uniqueCommits.length,
              commitsProcessed: globalCommitsProcessed,
              exports: { ...exports },
            } satisfies ExportHistoryProgressEvent
          }
        }
      }

      initialBatchStart = BATCH_SIZE
    }

    for (
      let batchStart = initialBatchStart;
      batchStart < uniqueCommits.length;
      batchStart += BATCH_SIZE
    ) {
      const batch = uniqueCommits.slice(batchStart, batchStart + BATCH_SIZE)

      // Pre-load commit trees synchronously (bypasses event loop congestion).
      // Each `git ls-tree -r -l` is ~5ms, so 8 commits = ~40ms of blocking.
      // Returns null for commits whose tree objects aren't available locally
      // (e.g. partial clones); those fall back to the async path.
      const batchTrees = new Map<string, Map<string, GitObjectMeta>>()
      for (const commit of batch) {
        const tree = loadCommitTreeSync(git.repoPath, commit.sha)
        if (tree) {
          batchTrees.set(commit.sha, tree)
        }
      }

      for (const commit of batch) {
        const tree = batchTrees.get(commit.sha)
        if (
          previousResolvedPaths &&
          tree &&
          fingerprintMatches(tree, previousResolvedPaths)
        ) {
          if (previousExports) {
            previousCommitHash = commit.sha
          }

          globalCommitsProcessed++

          const isLastCommit = globalCommitsProcessed >= uniqueCommits.length
          if (isLastCommit || globalCommitsProcessed % yieldInterval === 0) {
            yield {
              type: 'progress',
              phase: 'batch',
              elapsedMs: Date.now() - _startMs,
              batchStart,
              batchSize: yieldInterval,
              totalCommits: uniqueCommits.length,
              commitsProcessed: globalCommitsProcessed,
              exports: { ...exports },
            } satisfies ExportHistoryProgressEvent
          }
          continue
        }

        const result = await processCommit(commit, tree)
        const shouldYield = await handleCommitResult(result)
        if (shouldYield) {
          // Yield progress periodically rather than per-commit.
          // Yielding per-commit creates hundreds of React Suspense boundaries,
          // each adding RSC serialisation overhead. Yielding ~20 times is enough
          // for smooth streaming progress without the cumulative cost.
          const isLastCommit = globalCommitsProcessed >= uniqueCommits.length
          if (isLastCommit || globalCommitsProcessed % yieldInterval === 0) {
            yield {
              type: 'progress',
              phase: 'batch',
              elapsedMs: Date.now() - _startMs,
              batchStart,
              batchSize: yieldInterval,
              totalCommits: uniqueCommits.length,
              commitsProcessed: globalCommitsProcessed,
              exports: { ...exports },
            } satisfies ExportHistoryProgressEvent
          }
        }
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

    const lastExportSnapshot = previousExports
      ? serializeExportSnapshot(previousExports)
      : undefined
    const report: ExportHistoryReport = {
      generatedAt: new Date().toISOString(),
      repo: this.repoRoot,
      entryFiles: uniqueEntryRelatives,
      exports,
      nameToId,
      lastCommitSha: latestCommit,
      ...(lastExportSnapshot ? { lastExportSnapshot } : {}),
      ...(parseWarnings.length ? { parseWarnings } : {}),
    }

    if (this.verbose) {
      const denom = cacheHits + cacheMisses
      const pct = denom ? ((cacheHits / denom) * 100).toFixed(1) : '0.0'
      console.log(
        `[GitFileSystem] public API scan done (parse cache hit rate: ${pct}%)`
      )
      if (parseWarnings.length)
        console.log(`[GitFileSystem] parseWarnings=${parseWarnings.length}`)
    }

    await this.#replacePersistentNode(session, reportNodeKey, report)
    await this.#replacePersistentNode(session, latestNodeKey, {
      reportNodeKey,
      lastCommitSha: latestCommit,
    })
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

    try {
      return await this.#buildFileMetadata(refCommit, relativePath)
    } catch (error: unknown) {
      if (this.verbose) {
        console.warn(
          `[GitFileSystem] git log failed for ${relativePath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }

      // Do not cache fallback metadata so transient git failures can recover.
      return {
        kind: 'file',
        path: relativePath,
        ref: this.ref,
        refCommit,
        authors: [],
      } satisfies GitFileMetadata
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
      throw new Error('GitFileSystem is closed')
    }
  }

  async #ensureCachedScope(scopeDirectories: string[]): Promise<void> {
    if (!looksLikeCacheClone(this.repoRoot, this.cacheDirectory)) {
      return
    }

    const { merged, missing } = mergeScopeDirectories(
      this.#preparedScope,
      scopeDirectories
    )

    if (missing.length === 0) {
      return
    }

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

      this.#refreshSessionAfterRootChange(this.repoRoot, resolved)
      this.repoRoot = resolved
      this.#worktreeRootChecked = false
      this.#worktreeRootExists = false
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
    const safeRemote = assertSafeGitArg(remote, 'remote')
    const remoteSha = await this.#getRemoteRefSha(safeRemote, remoteRef)
    if (!remoteSha || localSha !== remoteSha) {
      if (this.verbose) {
        console.log(
          `[GitFileSystem] Cached ref "${ref}" moved; fetching ${safeRemote}…`
        )
      }
      const baseEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      let result = await spawnWithResult(
        'git',
        ['fetch', '--quiet', safeRemote],
        {
          cwd: this.repoRoot,
          maxBuffer: this.maxBufferBytes,
          verbose: this.verbose,
          env: baseEnv,
        }
      )
      if (result.status !== 0) {
        const stderr = result.stderr ? String(result.stderr).trim() : ''
        if (
          /protocol.*file/i.test(stderr) ||
          /file.*not allowed/i.test(stderr)
        ) {
          result = await spawnWithResult(
            'git',
            [
              '-c',
              'protocol.file.allow=always',
              'fetch',
              '--quiet',
              safeRemote,
            ],
            {
              cwd: this.repoRoot,
              maxBuffer: this.maxBufferBytes,
              verbose: this.verbose,
              env: baseEnv,
            }
          )
        }
      }
      if (result.status !== 0) {
        if (this.verbose) {
          const msg = result.stderr
            ? String(result.stderr).trim()
            : 'unknown error'
          console.warn(`[GitFileSystem] Fetch failed (${safeRemote}): ${msg}`)
        }
        return
      }
      if (await supportsGitBackfill()) {
        await runGitBackfill(this.repoRoot, this.verbose)
      }
    }
  }

  async #getLocalRefSha(ref: string): Promise<string | null> {
    const safeRef = assertSafeGitArg(ref, 'ref')
    const result = await spawnWithResult(
      'git',
      ['rev-parse', '--verify', `${safeRef}^{commit}`],
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
    const safeRemote = assertSafeGitArg(remote, 'remote')
    const safeRef = assertSafeGitArg(ref, 'ref')
    const session = this.#getSession()
    const nodeKey = this.#createPersistentCacheNodeKey('remote-ref', {
      remote: safeRemote,
      ref: safeRef,
    })
    const cached = await session.cache.get<{
      remoteSha: string | null
      checkedAt: number
    }>(nodeKey)
    const now = Date.now()
    if (cached && now - cached.checkedAt < REMOTE_REF_CACHE_TTL_MS) {
      return cached.remoteSha
    }

    const result = await spawnWithResult(
      'git',
      ['ls-remote', safeRemote, safeRef],
      {
        cwd: this.repoRoot,
        maxBuffer: this.maxBufferBytes,
        timeoutMs: REMOTE_REF_TIMEOUT_MS,
      }
    )
    if (result.status !== 0) {
      if (this.verbose) {
        if (result.status === 124) {
          console.warn(
            `[GitFileSystem] ls-remote timed out (${remote} ${ref}); skipping update check.`
          )
        }
        const msg = result.stderr
          ? String(result.stderr).trim()
          : 'unknown error'
        console.warn(
          `[GitFileSystem] ls-remote failed (${remote} ${ref}): ${msg}`
        )
      }
      await session.cache.put(
        nodeKey,
        { remoteSha: null, checkedAt: now },
        { persist: false }
      )
      return null
    }

    let remoteSha = parseLsRemoteSha(result.stdout)
    if (!remoteSha && !safeRef.startsWith('refs/')) {
      const headRef = `refs/heads/${safeRef}`
      const headResult = await spawnWithResult(
        'git',
        ['ls-remote', safeRemote, headRef],
        {
          cwd: this.repoRoot,
          maxBuffer: this.maxBufferBytes,
          timeoutMs: REMOTE_REF_TIMEOUT_MS,
        }
      )
      if (headResult.status === 0) {
        remoteSha = parseLsRemoteSha(headResult.stdout)
      }

      if (!remoteSha) {
        const tagRef = `refs/tags/${safeRef}`
        const tagResult = await spawnWithResult(
          'git',
          ['ls-remote', safeRemote, tagRef],
          {
            cwd: this.repoRoot,
            maxBuffer: this.maxBufferBytes,
            timeoutMs: REMOTE_REF_TIMEOUT_MS,
          }
        )
        if (tagResult.status === 0) {
          remoteSha = parseLsRemoteSha(tagResult.stdout)
        }
      }
    }
    await session.cache.put(
      nodeKey,
      { remoteSha, checkedAt: now },
      { persist: false }
    )
    return remoteSha
  }

  async #getRefCommit(): Promise<string> {
    if (this.#refCommit) {
      const { identity, deterministic } = await this.#getRefCacheIdentity(
        this.ref,
        { forceRefresh: true }
      )
      if (deterministic && identity === this.#refCommit) {
        return this.#refCommit
      }
      if (!deterministic) {
        return this.#refCommit
      }
      this.#clearRefCaches(
        '[renoun] Ref commit changed in git; invalidating cached in-memory ref data.'
      )
    }
    if (this.#refCommitPromise) {
      return this.#refCommitPromise
    }

    this.#refCommitPromise = (async () => {
      await this.#ensureRepoReady()
      const { identity, deterministic } = await this.#getRefCacheIdentity(
        this.ref,
        { forceRefresh: true }
      )
      let resolved = deterministic
        ? identity
        : await this.#resolveRefToCommit(this.ref)
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
              `[GitFileSystem] ref fallback: "${this.ref}" -> "${candidate}" (${resolvedCommit.slice(0, 7)})`
            )
          }
          return (this.#refCommit = resolvedCommit)
        }
      }

      const refs = await this.#listRefsBrief()
      throw new Error(
        [
          `[GitFileSystem] Could not resolve ref "${this.ref}" in repo "${this.repoRoot}".`,
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
            `[GitFileSystem] Shallow repository detected. Fetching full history from ${this.fetchRemote}...`
          )
        }
        const safeFetchRemote = assertSafeGitArg(
          this.fetchRemote,
          'fetchRemote'
        )
        await spawnAsync(
          'git',
          ['fetch', '--unshallow', '--quiet', safeFetchRemote],
          {
            cwd: this.repoRoot,
          }
        )
        if (this.verbose) {
          console.log('[GitFileSystem] Unshallow complete.')
        }
      }
    } catch (err: any) {
      if (this.verbose) {
        console.warn(
          `[GitFileSystem] Failed to unshallow repository: ${err.message}`
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
    const safeRef = assertSafeGitArg(ref, 'ref')
    try {
      await this.#ensureRepoReady()
      const out = await spawnAsync(
        'git',
        ['rev-parse', '--verify', `${safeRef}^{commit}`],
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
    const safeRemote = assertSafeGitArg(remote, 'remote')
    const safeBranch = assertSafeGitArg(branch, 'branch')

    const dst = `refs/remotes/${safeRemote}/${safeBranch}`
    const src = `refs/heads/${safeBranch}`
    const args = [
      'fetch',
      '--no-tags',
      '--prune',
      '--quiet',
      safeRemote,
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
          `[GitFileSystem] autoFetch failed (${remote} ${branch}): ${msg}`
        )
      }
      return false
    }

    if (this.verbose) {
      console.log(`[GitFileSystem] autoFetch ok: ${remote} ${branch}`)
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

  #normalizeToRepoPath(inputPath: string) {
    const path = String(inputPath)
    const absolutePath = isAbsoluteLike(path) ? resolve(path) : null

    let relativePath = path
    if (absolutePath && isSubPath(absolutePath, this.repoRoot)) {
      relativePath = relative(this.repoRoot, absolutePath)
    }

    relativePath = relativePath.split(sep).join('/')
    relativePath = trimLeadingSlashes(trimLeadingDotSlash(relativePath))
    relativePath = normalizePath(relativePath)
    assertSafeRepoPath(relativePath)
    return relativePath
  }

  async #buildFileMetadata(
    refCommit: string,
    relativePath: string
  ): Promise<GitFileMetadata> {
    const session = this.#getSession()
    const nodeKey = this.#createPersistentCacheNodeKey('file-meta', {
      refCommit,
      path: relativePath,
    })

    return session.cache.getOrCompute(
      nodeKey,
      {
        persist: true,
        constDeps: [
          {
            name: 'git-file-system-cache',
            version: GIT_HISTORY_CACHE_VERSION,
          },
        ],
      },
      async (ctx) => {
        ctx.recordConstDep('git-file-system-cache', GIT_HISTORY_CACHE_VERSION)

        const commits = await this.#gitLogCached(refCommit, relativePath, {
          reverse: true,
          follow: true,
        })

        if (commits.length === 0) {
          return {
            kind: 'file',
            path: relativePath,
            ref: this.ref,
            refCommit,
            authors: [],
          } satisfies GitFileMetadata
        }

        const authorsByEmail = new Map<string, GitAuthor>()
        const oldest = commits[0]
        const newest = commits[commits.length - 1]

        for (const commit of commits) {
          if (!commit.sha || !Number.isFinite(commit.unix)) {
            continue
          }

          const name = commit.authorName ?? ''
          const email = commit.authorEmail ?? ''
          const key = email || name || 'unknown'
          const stamp = new Date(commit.unix * 1000)

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

        return {
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
          firstCommitHash: oldest?.sha,
          lastCommitHash: newest?.sha,
          authors,
        } satisfies GitFileMetadata
      }
    )
  }

  async #buildFileExportIndex(
    refCommit: string,
    relPath: string,
    headSha: string,
    // Limit scanning results to exports that exist at HEAD (accurate + faster).
    headExportNames: Set<string>
  ): Promise<FileExportIndex> {
    const sortedHeadExportNames = Array.from(headExportNames).sort()
    const nodeKey = this.#createPersistentCacheNodeKey('file-index', {
      refCommit,
      path: relPath,
      headSha,
      headExportNames: sortedHeadExportNames,
    })

    const session = this.#getSession()
    return session.cache.getOrCompute(
      nodeKey,
      {
        persist: true,
        constDeps: [
          {
            name: 'git-file-system-cache',
            version: GIT_HISTORY_CACHE_VERSION,
          },
        ],
      },
      async (ctx) => {
        ctx.recordConstDep('git-file-system-cache', GIT_HISTORY_CACHE_VERSION)

        if (this.verbose) {
          console.log(`[GitFileSystem] building file index for ${relPath}…`)
        }

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

        return {
          builtAt: new Date().toISOString(),
          repoRoot: this.repoRoot,
          ref: this.ref,
          refCommit,
          path: relPath,
          headBlobSha: headSha,
          perExport,
        } satisfies FileExportIndex
      }
    )
  }
}

/**
 * Pre-loads the full file tree for a given commit using `git ls-tree -r -l`.
 * Returns a Map of path → { sha, type, size } so that `getBlobMeta` calls
 * can be resolved with a simple Map lookup (zero I/O).
 */
function loadCommitTreeSync(
  repoPath: string,
  commitSha: string
): Map<string, GitObjectMeta> | null {
  const safeCommitSha = assertSafeGitArg(commitSha, 'commitSha')
  // Use `ls-tree -r` WITHOUT `-l` (long format). The `-l` flag forces git
  // to resolve every blob to obtain its size, which triggers lazy-fetch
  // attempts in `--filter=blob:none` partial clones — those fetches may
  // hang or fail on repos with a stale commit-graph.
  // Without `-l`, ls-tree only reads tree objects (always local).
  const result = spawnSync('git', ['ls-tree', '-r', safeCommitSha], {
    cwd: repoPath,
    encoding: 'utf8',
    maxBuffer: 200 * 1024 * 1024,
    shell: false,
  })
  if (result.status !== 0) {
    // Partial clones / promisor remotes may have commits whose tree
    // objects haven't been fetched yet.  Return null so callers fall
    // back to the async GitBatchCheck/GitBatchCat path which handles
    // missing objects gracefully.
    return null
  }

  const tree = new Map<string, GitObjectMeta>()
  const output = result.stdout
  let start = 0

  while (start < output.length) {
    const newline = output.indexOf('\n', start)
    const end = newline === -1 ? output.length : newline
    const line = output.substring(start, end)
    start = end + 1

    if (line.length === 0) continue

    // Format without -l: "<mode> <type> <sha>\t<path>"
    const tabIndex = line.indexOf('\t')
    if (tabIndex === -1) continue

    const metaPart = line.substring(0, tabIndex)
    const path = line.substring(tabIndex + 1)

    // Split meta on whitespace: mode, type, sha
    const parts = metaPart.split(/\s+/)
    if (parts.length < 3) continue

    const type = parts[1]
    const sha = parts[2]

    // Size is unknown (-1) since we skipped -l to avoid blob fetches.
    // The MAX_PARSE_BYTES guard is skipped for entries with unknown size;
    // the content read itself has a maxBuffer limit.
    tree.set(path, { sha, type, size: -1 })
  }

  return tree
}

/**
 * Synchronous blob content read using `git cat-file blob <sha>`.
 * Bypasses the event loop entirely.
 */
function readBlobSync(repoPath: string, sha: string): string | null {
  const safeSha = assertSafeGitArg(sha, 'sha')
  const result = spawnSync('git', ['cat-file', 'blob', safeSha], {
    cwd: repoPath,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    shell: false,
  })
  if (result.status !== 0) {
    return null
  }
  return result.stdout
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
    const safeSpecifier = assertSafeGitSpec(specifier)
    return taskQueue.run(() => this.#check.getObjectMeta(safeSpecifier))
  }

  async getBlobContentBySha(sha: string): Promise<string | null> {
    const safeSha = assertSafeGitArg(sha, 'sha')
    const object = await taskQueue.run(() => this.#cat.getObject(safeSha))
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
  getOrParseBlobExports?: (
    sha: string,
    filePath: string
  ) => Promise<Map<string, ExportItem>>
  scopeDirectories: string[]
  parseWarnings: string[]
  cacheStats: { hits: number; misses: number }
  metaCache: Map<string, GitObjectMeta | null>
  resolveCache: Map<string, string | null>
  /** Blob-SHA keyed resolve cache for within-commit reuse. Must NOT be shared across commits. */
  blobShaResolveCache: Map<string, string>
  /** Repo path for sync blob reads (bypasses event loop). */
  repoPath?: string
  /** Optional reverse edge map: source file -> re-exporting file(s). */
  reverseReExportGraph?: Map<string, Set<string>>
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
  // size === -1 means unknown (from ls-tree without -l); skip guard
  if (meta.size >= 0 && meta.size > MAX_PARSE_BYTES) {
    return results
  }

  // Get raw exports from cache or parse them
  const parserFlavor = getParserFlavorFromFileName(filePath)
  const cacheKey = getExportParseCacheKey(meta.sha, parserFlavor)
  let rawExports = blobCache.get(cacheKey)
  if (rawExports) {
    cacheStats.hits++
  } else {
    cacheStats.misses++
    if (context.getOrParseBlobExports) {
      rawExports = await context.getOrParseBlobExports(meta.sha, filePath)
    } else {
      // Prefer sync read when repoPath is available (bypasses event loop)
      const content = context.repoPath
        ? readBlobSync(context.repoPath, meta.sha)
        : await git.getBlobContentBySha(meta.sha)
      if (content === null) {
        return results
      }
      rawExports = scanModuleExports(filePath, content)
    }
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

  if (context.reverseReExportGraph) {
    for (const [, , fromPath] of allExternalExports) {
      const resolved = resolutionMap.get(fromPath)
      if (!resolved) {
        continue
      }

      let parents = context.reverseReExportGraph.get(resolved)
      if (!parents) {
        parents = new Set<string>()
        context.reverseReExportGraph.set(resolved, parents)
      }
      parents.add(filePath)
    }
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
  // Cache key includes commit SHA for correctness (resolveCache is per-commit,
  // but including commit in the key guards against accidental future sharing).
  const cacheKey = `${context.commit}|${baseDir}|${specifier}`
  if (context.resolveCache.has(cacheKey)) {
    return context.resolveCache.get(cacheKey)!
  }

  const result = await (async () => {
    if (!specifier.startsWith('.')) {
      return null
    }

    const basePath = joinPath(baseDir, specifier)

    // Blob-SHA resolve cache: if we already resolved this specifier from
    // the same directory within the current commit, reuse the result
    // with a single existence probe instead of trying all candidates.
    const blobCacheKey = `${baseDir}|${specifier}`
    const blobCached = context.blobShaResolveCache.get(blobCacheKey)
    if (blobCached) {
      const targetMeta = await getBlobMetaCached(
        context,
        `${context.commit}:${blobCached}`
      )
      if (targetMeta && targetMeta.type === 'blob') {
        return blobCached
      }
    }

    // Fast path: try the bare path first (handles imports like './Foo.js')
    const bareMeta = await getBlobMetaCached(
      context,
      `${context.commit}:${basePath}`
    )
    if (bareMeta && bareMeta.type === 'blob') {
      context.blobShaResolveCache.set(blobCacheKey, basePath)
      return basePath
    }

    // Fast path: if specifier has no extension, try the most common extensions
    // sequentially before falling back to the full parallel probe
    const hasExtension = /\.[a-z]+$/i.test(specifier)
    if (!hasExtension) {
      for (const ext of ['.ts', '.js', '.tsx', '.jsx']) {
        const candidate = basePath + ext
        const meta = await getBlobMetaCached(
          context,
          `${context.commit}:${candidate}`
        )
        if (meta && meta.type === 'blob') {
          context.blobShaResolveCache.set(blobCacheKey, candidate)
          return candidate
        }
      }
    }

    // Full fallback: try all remaining candidates in parallel
    const triedFast = hasExtension
      ? new Set([basePath])
      : new Set([
          basePath,
          basePath + '.ts',
          basePath + '.js',
          basePath + '.tsx',
          basePath + '.jsx',
        ])

    const remainingCandidates = [
      ...EXTENSION_PRIORITY.map((ext) => basePath + ext),
      ...INDEX_FILE_CANDIDATES.map((indexFile) =>
        joinPath(basePath, indexFile)
      ),
    ].filter((c) => !triedFast.has(c))

    if (remainingCandidates.length > 0) {
      const probes = remainingCandidates.map((path) =>
        getBlobMetaCached(context, `${context.commit}:${path}`).then(
          (meta) => ({ path, meta })
        )
      )
      const results = await Promise.all(probes)
      for (const probeResult of results) {
        if (probeResult.meta && probeResult.meta.type === 'blob') {
          context.blobShaResolveCache.set(blobCacheKey, probeResult.path)
          return probeResult.path
        }
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
      shell: false,
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
    follow?: boolean
  } = {}
): Promise<GitLogCommit[]> {
  const safeRef = assertSafeGitArg(ref, 'ref')
  // Include author identity + %D for ref names (tags, branches).
  const args = ['log', '--format=%H%x00%at%x00%aN%x00%aE%x00%D']
  if (reverse) {
    args.push('--reverse')
  }
  if (limit) {
    args.push('-n', String(limit))
  }
  if (follow && !Array.isArray(path)) args.push('--follow')
  const paths = Array.isArray(path) ? path : [path]
  args.push(safeRef, '--', ...paths)

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
    const [sha, unix, authorName, authorEmail, refs] = line.split('\0')

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
      authorName: authorName || undefined,
      authorEmail: authorEmail || undefined,
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

async function listDirectoryEntriesAtCommit(
  repoRoot: string,
  commit: string,
  scopeDirectory: string
): Promise<DirectoryEntry[]> {
  const safeCommit = assertSafeGitArg(commit, 'commit')
  const normalizedScope = normalizePath(scopeDirectory || '.')
  const spec = assertSafeGitSpec(
    normalizedScope && normalizedScope !== '.'
      ? `${safeCommit}:${normalizedScope}`
      : safeCommit
  )
  try {
    const result = await spawnWithResult('git', ['ls-tree', '-z', spec], {
      cwd: repoRoot,
      maxBuffer: 10 * 1024 * 1024,
      verbose: false,
    })
    if (result.status !== 0) {
      return []
    }
    return parseLsTreeOutput(result.stdout, normalizedScope)
  } catch {
    return []
  }
}

async function inferEntryFile(
  repoRoot: string,
  git: GitObjectStore,
  commit: string,
  scopeDirectory: string
): Promise<string[]> {
  const normalizedScope = normalizePath(scopeDirectory || '.')
  const entries = await listDirectoryEntriesAtCommit(
    repoRoot,
    commit,
    normalizedScope
  )
  if (entries.length === 0) {
    return []
  }

  return selectEntryFiles({
    scopeDirectory: normalizedScope,
    entries,
    readContent: async (path) => {
      const meta = await git.getBlobMeta(`${commit}:${path}`)
      if (!meta || meta.type !== 'blob' || meta.size > MAX_PARSE_BYTES) {
        return null
      }
      return git.getBlobContentBySha(meta.sha)
    },
  })
}

function serializeExportItemMap(
  map: Map<string, ExportItem>
): Record<string, ExportItem> {
  const record: Record<string, ExportItem> = Object.create(null)

  for (const [name, item] of map) {
    record[name] = item
  }

  return record
}

function deserializeExportItemMap(
  record: Record<string, ExportItem>
): Map<string, ExportItem> {
  return new Map<string, ExportItem>(Object.entries(record))
}

function serializeReverseReExportGraph(
  graph: Map<string, Set<string>>
): Record<string, string[]> {
  const payload: Record<string, string[]> = Object.create(null)

  for (const [sourceFile, reExportingFiles] of graph) {
    payload[sourceFile] = Array.from(reExportingFiles).sort()
  }

  return payload
}

function deserializeReverseReExportGraph(
  payload: Record<string, string[]>
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>()

  for (const [sourceFile, reExportingFiles] of Object.entries(payload)) {
    graph.set(sourceFile, new Set(reExportingFiles))
  }

  return graph
}

async function drainExportHistoryGenerator(
  generator: ExportHistoryGenerator
): Promise<ExportHistoryReport> {
  let result = await generator.next()
  while (!result.done) {
    result = await generator.next()
  }
  return result.value
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
  const safeRef = assertSafeGitArg(ref, 'ref')
  const result = spawnSync(
    'git',
    ['rev-parse', '--verify', `${safeRef}^{commit}`],
    { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8', shell: false }
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
  const safeRemote = assertSafeGitArg(remote, 'remote')
  const safeRef = assertSafeGitArg(ref, 'ref')

  const result = spawnSync('git', ['ls-remote', safeRemote, safeRef], {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf8',
    shell: false,
  })
  if (result.status !== 0) {
    return null
  }

  let remoteSha = parseLsRemoteSha(String(result.stdout))
  if (!remoteSha && !safeRef.startsWith('refs/')) {
    const headResult = spawnSync(
      'git',
      ['ls-remote', safeRemote, `refs/heads/${safeRef}`],
      {
        cwd: repoRoot,
        stdio: 'pipe',
        encoding: 'utf8',
        shell: false,
      }
    )
    if (headResult.status === 0) {
      remoteSha = parseLsRemoteSha(String(headResult.stdout))
    }

    if (!remoteSha) {
      const tagResult = spawnSync(
        'git',
        ['ls-remote', safeRemote, `refs/tags/${safeRef}`],
        {
          cwd: repoRoot,
          stdio: 'pipe',
          encoding: 'utf8',
          shell: false,
        }
      )
      if (tagResult.status === 0) {
        remoteSha = parseLsRemoteSha(String(tagResult.stdout))
      }
    }
  }
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
      ? trimTrailingSlashes(normalizedBase)
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

function looksLikeCacheClone(repoRoot: string, metaCacheDirectory: string) {
  const normalizedRepoRoot = normalizePath(repoRoot)
  const homeCache = normalizePath(join(os.homedir(), '.cache'))
  const temporaryDirectory = normalizePath(os.tmpdir())
  const normalizedMetaCache = normalizePath(metaCacheDirectory)

  // First check without symlink resolution (fast path)
  if (
    normalizedRepoRoot.startsWith(homeCache + '/') ||
    normalizedRepoRoot.startsWith(temporaryDirectory + '/') ||
    normalizedRepoRoot.startsWith(normalizedMetaCache + '/')
  ) {
    return true
  }

  // On macOS, /var is a symlink to /private/var. The git rev-parse --show-toplevel
  // command returns the real path, so we need to resolve symlinks for the cacheDirectory
  // comparison to handle cached clones correctly.
  try {
    const realRepoRoot = normalizePath(realpathSync(repoRoot))
    const realMetaCache = normalizePath(realpathSync(metaCacheDirectory))
    if (realRepoRoot.startsWith(realMetaCache + '/')) {
      return true
    }
  } catch {
    // If realpath fails, fall through to return false
  }

  return false
}

function looksLikeGitHubSpec(value: string) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(value))
}

function looksLikeGitRemoteUrl(value: string) {
  const stringValue = String(value)
  return (
    /^(https?|git|ssh|file):\/\//.test(stringValue) ||
    stringValue.startsWith('git@')
  )
}

/**
 * Allowlist for git arguments (refs, remotes, SHAs, etc.).
 * Covers: alphanumeric, `.`, `_`, `-`, `/`, `^`, `{`, `}`, `~`, `@`, `+`
 */
const SAFE_GIT_ARG_RE = /^[a-zA-Z0-9._\-\/^{}~@+]+$/

/**
 * Validates a git argument (ref, remote name, sha, etc.) and returns it.
 * Rejects values that don't match a strict character allowlist, preventing
 * command injection via `--upload-pack` or similar git option smuggling.
 *
 * Returns the validated string so callers can use the sanitised reference
 * in place of the original (required for static-analysis tools like CodeQL
 * to recognise the data-flow barrier).
 */
function assertSafeGitArg(value: string, label: string): string {
  const stringValue = String(value)
  if (!stringValue) {
    throw new Error(`[GitFileSystem] Missing ${label}`)
  }
  if (!SAFE_GIT_ARG_RE.test(stringValue)) {
    throw new Error(
      `[GitFileSystem] Invalid ${label}: contains disallowed characters`
    )
  }
  return stringValue
}

/**
 * Allowlist for repo-relative paths. Broader than git args because file
 * names may contain spaces and other characters, but still rejects
 * control characters, colons, and traversal.
 */
const SAFE_REPO_PATH_RE = /^[^\0\n\r:]+$/

/**
 * Validates a repo-relative file path. Rejects NUL/newline, colons (Windows
 * drive-letter or git-spec ambiguity), `..` traversal, and leading dashes.
 */
function assertSafeRepoPath(relativePath: string): string {
  const stringPath = String(relativePath)
  if (!stringPath) {
    throw new Error('[GitFileSystem] Invalid path: empty')
  }
  if (!SAFE_REPO_PATH_RE.test(stringPath)) {
    throw new Error(
      '[GitFileSystem] Invalid path: contains disallowed characters'
    )
  }
  if (stringPath.startsWith('-')) {
    throw new Error('[GitFileSystem] Invalid path: must not start with "-"')
  }
  const segments = stringPath.split('/')
  if (segments.some((segment) => segment === '..')) {
    throw new Error(
      `[GitFileSystem] Invalid repo path "${stringPath}": ".." segments are not allowed`
    )
  }
  return stringPath
}

/**
 * Allowlist for git specifiers (`<ref>:<path>` or bare ref).
 * Same as the git-arg allowlist plus `:` (ref/path separator) and
 * common path characters (spaces, parens, brackets, etc.).
 */
const SAFE_GIT_SPEC_RE =
  /^[a-zA-Z0-9._\-\/^{}~@+:][a-zA-Z0-9._\-\/^{}~@+: ()\[\]#%!&=,]*$/

/**
 * Validates a git specifier like `<ref>:<path>` or a bare ref and returns it.
 * Rejects NUL/newline, leading dashes, and dangerous embedded git options.
 */
function assertSafeGitSpec(specifier: string): string {
  const stringSpecifier = String(specifier)
  if (!stringSpecifier) {
    throw new Error('[GitFileSystem] Invalid git spec: empty')
  }
  if (!SAFE_GIT_SPEC_RE.test(stringSpecifier)) {
    throw new Error(
      '[GitFileSystem] Invalid git spec: contains disallowed characters'
    )
  }
  return stringSpecifier
}

/**
 * Allowlist for git clone URLs.  Accepts recognised git URL schemes
 * (`https://`, `ssh://`, `git://`, `file://`, `git@…`) and rejects
 * control characters and leading dashes.
 */
const SAFE_CLONE_URL_RE =
  /^(https?:\/\/|git:\/\/|ssh:\/\/|file:\/\/|git@)[^\0\n\r]+$/

function assertSafeCloneUrl(url: string): string {
  const s = String(url)
  if (!s || !SAFE_CLONE_URL_RE.test(s)) {
    throw new Error('[GitFileSystem] Invalid clone URL')
  }
  return s
}

/**
 * Allowlist for local filesystem paths used as clone targets or `cwd`.
 * Must not start with `-` and must not contain NUL/newline.
 */
const SAFE_FS_PATH_RE = /^[^\0\n\r-][^\0\n\r]*$/

function assertSafeFsPath(value: string, label: string): string {
  const s = String(value)
  if (!s || !SAFE_FS_PATH_RE.test(s)) {
    throw new Error(`[GitFileSystem] Invalid ${label}`)
  }
  return s
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
