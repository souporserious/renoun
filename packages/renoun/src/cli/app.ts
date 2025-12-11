import { watch as watchFs } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rm,
  symlink,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'

import { createServer } from '../project/server.js'
import { getDebugLogger } from '../utils/debug.js'
import { resolveFrameworkBinFile, type Framework } from './framework.js'
import { spawn } from 'node:child_process'

interface AppCommandOptions {
  command: 'dev' | 'build'
  args: string[]
}

interface ResolvedAppPackage {
  name: string
  packageJsonPath: string
  rootDirectory: string
  framework: Framework
}

interface ParsedAppArgs {
  appName?: string
  forwardedArgs: string[]
}

const IGNORED_PROJECT_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  '.output',
  '.renoun',
])

const IGNORED_PROJECT_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lockb',
])

const IGNORED_APP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  '.output',
  '.renoun',
  'dist',
  'out',
])

const FRAMEWORK_HINTS: Record<Framework, readonly string[]> = {
  next: ['next'],
  vite: ['vite'],
  waku: ['waku'],
}

const NEXT_CONFIG_FILES = [
  'next.config.ts',
  'next.config.mts',
  'next.config.js',
  'next.config.mjs',
]

const WAKU_CONFIG_FILES = ['waku.config.ts', 'waku.config.js']

export async function runAppCommand({ command, args }: AppCommandOptions) {
  const projectRoot = process.cwd()
  const { appName, forwardedArgs } = parseAppArgs(args)
  const projectPackageJsonPath = join(projectRoot, 'package.json')
  const projectPackageJson = JSON.parse(
    await readFile(projectPackageJsonPath, 'utf-8')
  ) as Record<string, unknown>

  const projectRequire = createRequire(projectPackageJsonPath)
  const resolvedExample = await resolveExamplePackage({
    projectRoot,
    projectPackageJson,
    projectRequire,
    appName,
  })

  // Validate the template is configured for static export
  await validateStaticExportConfiguration(resolvedExample)

  const runtimeDirectory = await prepareRuntimeDirectory({
    projectRoot,
    app: resolvedExample,
  })

  const log = (message: string) => {
    process.stdout.write(`[renoun] ${message}\n`)
  }

  log(
    `Running ${resolvedExample.name} (${resolvedExample.framework}) ${command} script...`
  )
  log(`Runtime directory ready at ${runtimeDirectory}`)

  const shadowManager = new ShadowManager({
    projectRoot,
    runtimeDirectory,
  })
  await shadowManager.start()

  const shadowedPaths = shadowManager.getShadowedPaths()
  if (shadowedPaths.length > 0) {
    log(
      `Applied ${shadowedPaths.length} shadow${
        shadowedPaths.length === 1 ? '' : 's'
      }: ${shadowedPaths.join(', ')}`
    )
  } else {
    log('No project shadows detected; using template defaults')
  }

  const previousCwd = process.cwd()
  process.chdir(runtimeDirectory)

  let server: Awaited<ReturnType<typeof createServer>> | undefined
  let subProcess: ReturnType<typeof spawn> | undefined
  let exitCode: number | null = null

  function cleanupAndExit(code: number) {
    getDebugLogger().info('App CLI cleanup initiated', () => ({
      data: {
        exitCode: code,
        hasSubProcess: Boolean(subProcess),
        runtimeDirectory,
      },
    }))

    shadowManager.stop()

    if (server) {
      server.cleanup()
    }

    if (subProcess) {
      const pid = subProcess.pid ?? null
      getDebugLogger().debug('Terminating app subprocess', () => ({
        data: { pid },
      }))
      subProcess.kill('SIGTERM')
    }

    process.chdir(previousCwd)
    process.exit(code)
  }

  try {
    server = await createServer()
    const port = String(await server.getPort())
    const id = server.getId()

    const frameworkBinPath = resolveFrameworkBinFile(resolvedExample.framework)

    const frameworkArgs = [frameworkBinPath, command]
    frameworkArgs.push(...forwardedArgs)

    subProcess = spawn(process.execPath, frameworkArgs, {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: false,
      cwd: runtimeDirectory,
      env: {
        ...process.env,
        RENOUN_RUNTIME_DIRECTORY: runtimeDirectory,
        RENOUN_SERVER_PORT: port,
        RENOUN_SERVER_ID: id,
      },
    })

    const commandLabel = `${resolvedExample.framework} ${command}`
    log(`Starting ${commandLabel}. Awaiting framework output...`)

    getDebugLogger().info('App subprocess spawned', () => ({
      data: {
        pid: subProcess?.pid ?? null,
        command: `${resolvedExample.framework} ${command}`,
        runtimeDirectory,
      },
    }))

    const fatalRE = /(FATAL ERROR|Allocation failed|heap limit)/i
    const urlRE = /(https?:\/\/[^\s]+)/i
    let announcedUrl: string | null = null

    const forwardOutput = (
      stream: NodeJS.WriteStream,
      chunk: Buffer,
      channel: 'stdout' | 'stderr'
    ) => {
      const text = chunk.toString()

      if (channel === 'stderr' && fatalRE.test(text)) {
        getDebugLogger().error(
          'Detected fatal stderr pattern - killing app subprocess'
        )
        subProcess?.kill('SIGKILL')
      }

      if (!announcedUrl) {
        const urlMatch = urlRE.exec(text)
        if (urlMatch?.[1]) {
          announcedUrl = urlMatch[1]
          log(`Framework reported server at ${announcedUrl}`)
        }
      }

      stream.write(chunk)
    }

    subProcess.stdout?.on('data', (buffer) => {
      getDebugLogger().info('App subprocess stdout', () => ({
        data: buffer.toString(),
      }))
      forwardOutput(process.stdout, buffer, 'stdout')
    })

    subProcess.stderr?.on('data', (buffer) => {
      getDebugLogger().error('App subprocess stderr', () => ({
        data: buffer.toString(),
      }))
      forwardOutput(process.stderr, buffer, 'stderr')
    })

    subProcess.on(
      'exit',
      (code: number | null, signal: NodeJS.Signals | null) => {
        exitCode = code

        if ((code ?? 0) !== 0) {
          const formattedSignal = signal ? ` (signal: ${signal})` : ''
          console.error(
            `[renoun] ${commandLabel} exited with code ${code ?? 1}${formattedSignal}. See framework logs above for details.`
          )
        } else if (signal) {
          log(`${commandLabel} received ${signal} and is shutting down.`)
        }

        getDebugLogger().error('App subprocess exit', () => ({
          data: {
            pid: subProcess?.pid ?? null,
            exitCode: code,
            signal,
          },
        }))
      }
    )

    subProcess.on('close', (code: number) => {
      getDebugLogger().info('App subprocess closed', () => ({
        data: { pid: subProcess?.pid ?? null, exitCode: code },
      }))

      if ((exitCode ?? code ?? 0) === 0 && !announcedUrl) {
        log(
          `${commandLabel} finished without reporting a URL. Check the framework output above for access details.`
        )
      }

      cleanupAndExit(code)
    })

    subProcess.on('error', (error: Error) => {
      getDebugLogger().error('App subprocess error', () => ({
        data: { pid: subProcess?.pid ?? null, error: error.message },
      }))

      console.error(
        `[renoun] Failed to launch ${commandLabel}: ${error.message}`
      )
      cleanupAndExit(1)
    })

    process.on('SIGINT', () => {
      getDebugLogger().info('Received SIGINT signal (app)')
      cleanupAndExit(0)
    })

    process.on('SIGTERM', () => {
      getDebugLogger().info('Received SIGTERM signal (app)')
      cleanupAndExit(0)
    })

    process.on('uncaughtException', (error) => {
      getDebugLogger().error('Uncaught exception (app)', () => ({
        data: { error: error.message, stack: error.stack },
      }))
      console.error('Uncaught exception:', error)
      cleanupAndExit(1)
    })

    process.on('unhandledRejection', (reason) => {
      getDebugLogger().error('Unhandled rejection (app)', () => ({
        data: { reason: String(reason) },
      }))
      console.error('Unhandled rejection:', reason)
      cleanupAndExit(1)
    })

    // Wait for the subprocess to complete before returning
    await new Promise<void>((resolve) => {
      subProcess!.on('close', () => {
        resolve()
      })
    })
  } catch (error) {
    shadowManager.stop()
    process.chdir(previousCwd)
    throw error
  }
}

function parseAppArgs(args: string[]): ParsedAppArgs {
  let appName: string | undefined
  const forwardedArgs: string[] = []

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (!value) continue

    // Legacy support: --app / -a flags (deprecated, kept for backwards compat)
    if (value === '--app' || value === '-a') {
      appName = args[index + 1]
      index += 1
      continue
    }

    if (value.startsWith('--app=')) {
      appName = value.slice('--app='.length)
      continue
    }

    // New behaviour: first positional argument is treated as the app package name.
    // Example: `renoun dev @renoun/docs` → appName = '@renoun/docs'
    if (!appName && !value.startsWith('-')) {
      appName = value
      continue
    }

    forwardedArgs.push(value)
  }

  return { appName, forwardedArgs }
}

async function resolveExamplePackage({
  projectRoot,
  projectPackageJson,
  projectRequire,
  appName,
}: {
  projectRoot: string
  projectPackageJson: Record<string, unknown>
  projectRequire: ReturnType<typeof createRequire>
  appName?: string
}): Promise<ResolvedAppPackage> {
  const candidates: { name: string; explicit: boolean }[] = []

  if (appName) {
    candidates.push({ name: appName, explicit: true })
  }

  const dependencySources = [
    projectPackageJson['dependencies'],
    projectPackageJson['devDependencies'],
    projectPackageJson['optionalDependencies'],
    projectPackageJson['peerDependencies'],
  ]

  for (const source of dependencySources) {
    if (!source || typeof source !== 'object') continue
    for (const name of Object.keys(source as Record<string, unknown>)) {
      candidates.push({ name, explicit: false })
    }
  }

  const visited = new Set<string>()

  for (const { name, explicit } of candidates) {
    if (visited.has(name)) {
      continue
    }
    visited.add(name)

    let packageJsonPath: string
    try {
      packageJsonPath = projectRequire.resolve(`${name}/package.json`)
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error.code === 'ERR_MODULE_NOT_FOUND' ||
          error.code === 'MODULE_NOT_FOUND')
      ) {
        if (explicit) {
          throw new Error(
            `[renoun] Could not find the app package "${name}". Ensure it is installed before running app mode.`
          )
        }
        continue
      }

      throw error
    }

    const rawPackageJson = await readFile(packageJsonPath, 'utf-8')
    let parsed: unknown

    try {
      parsed = JSON.parse(rawPackageJson)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`[renoun] Failed to parse ${packageJsonPath}: ${reason}`)
    }

    if (!parsed || typeof parsed !== 'object') {
      continue
    }

    const packageJson = parsed as Record<string, unknown>

    if (!hasRenounDependency(packageJson)) {
      if (explicit) {
        throw new Error(
          `[renoun] App package "${name}" must list renoun as a dependency to participate in app mode.`
        )
      }
      continue
    }

    const framework = determineFrameworkFromPackageJson(packageJson, {
      packageName: name,
      isExplicit: explicit,
    })

    if (!framework) {
      continue
    }

    return {
      name,
      packageJsonPath,
      rootDirectory: dirname(packageJsonPath),
      framework,
    }
  }

  const messageLines = [
    '[renoun] Could not determine which app package to use for app mode.',
    '',
    'How to fix:',
    '  • Install a renoun-aware app package (e.g. @renoun/blog) and ensure it is listed in dependencies.',
    '  • Or run `renoun dev <package-name>` to select an installed app explicitly.',
    '',
    `Current working directory: ${projectRoot}`,
  ]

  throw new Error(messageLines.join('\n'))
}

function hasRenounDependency(packageJson: Record<string, unknown>): boolean {
  const dependencySources = [
    packageJson['dependencies'],
    packageJson['devDependencies'],
    packageJson['optionalDependencies'],
    packageJson['peerDependencies'],
  ]

  for (const source of dependencySources) {
    if (!source || typeof source !== 'object') {
      continue
    }

    const record = source as Record<string, unknown>
    if ('renoun' in record) {
      return true
    }
  }

  return false
}

function determineFrameworkFromPackageJson(
  packageJson: Record<string, unknown>,
  {
    packageName,
    isExplicit,
  }: {
    packageName: string
    isExplicit: boolean
  }
): Framework | null {
  const dependencyNames = new Set<string>()

  const dependencySources = [
    packageJson['dependencies'],
    packageJson['devDependencies'],
    packageJson['optionalDependencies'],
    packageJson['peerDependencies'],
  ]

  for (const source of dependencySources) {
    if (!source || typeof source !== 'object') continue
    for (const name of Object.keys(source as Record<string, unknown>)) {
      dependencyNames.add(name)
    }
  }

  const matches: Framework[] = []

  for (const framework of Object.keys(FRAMEWORK_HINTS) as Framework[]) {
    const hints = FRAMEWORK_HINTS[framework]
    if (hints.some((hint) => dependencyNames.has(hint))) {
      matches.push(framework)
    }
  }

  if (matches.length === 0) {
    if (isExplicit) {
      throw new Error(
        `[renoun] Package "${packageName}" does not declare a supported framework dependency. Install Next.js, Vite, or Waku to continue.`
      )
    }
    return null
  }

  if (matches.length > 1) {
    throw new Error(
      `[renoun] Package "${packageName}" declares multiple framework dependencies (${matches.join(', ')}). Application mode requires exactly one framework.`
    )
  }

  return matches[0]
}

async function prepareRuntimeDirectory({
  projectRoot,
  app,
}: {
  projectRoot: string
  app: ResolvedAppPackage
}): Promise<string> {
  const runtimeRoot = join(
    projectRoot,
    '.renoun',
    'app',
    sanitizeAppName(app.name)
  )

  await rm(runtimeRoot, { recursive: true, force: true })
  await mkdir(runtimeRoot, { recursive: true })

  // Create symlinks to example files instead of copying
  await symlinkAppContents(app.rootDirectory, runtimeRoot)

  return runtimeRoot
}

async function symlinkAppContents(
  appRoot: string,
  runtimeRoot: string
): Promise<void> {
  await recursiveSymlinkDirectory(appRoot, runtimeRoot)
}

/**
 * Recursively create directory structure.
 * - ALL source files are COPIED so imports resolve from runtime directory
 * - Non-source files (images, css, etc.) are symlinked for efficiency
 * - node_modules is always symlinked
 */
async function recursiveSymlinkDirectory(
  sourceDir: string,
  targetDir: string
): Promise<void> {
  const entries = await readdir(sourceDir, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name)
    const targetPath = join(targetDir, entry.name)

    if (entry.isDirectory()) {
      // Skip ignored directories entirely
      if (IGNORED_APP_DIRECTORIES.has(entry.name)) {
        // Special case: symlink node_modules so dependencies resolve
        if (entry.name === 'node_modules') {
          const symlinkType = process.platform === 'win32' ? 'junction' : 'dir'
          await symlink(sourcePath, targetPath, symlinkType)
        }
        continue
      }

      // Create real directory and recurse into it
      await mkdir(targetPath, { recursive: true })
      await recursiveSymlinkDirectory(sourcePath, targetPath)
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      // Copy ALL files to the runtime directory
      // Symlinking non-source files (images, ico, css) causes issues with Next.js Turbopack
      // during production build as it doesn't follow symlinks for static assets
      await copyFile(sourcePath, targetPath)
    }
  }
}

/**
 * Check if a file is a source file that may have relative imports.
 * These need to be copied (not symlinked) so bundlers resolve imports
 * from the runtime directory.
 */
function isSourceFile(filename: string): boolean {
  const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
  return sourceExtensions.some((ext) => filename.endsWith(ext))
}

function sanitizeAppName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-{2,}/g, '-')
}

/**
 * Validates that the template is configured for static export.
 *
 * App mode currently requires static output because:
 * - The runtime directory only exists during build
 * - Deployed servers don't have access to the app source files
 * - Dynamic rendering would fail when trying to access files at request time
 */
async function validateStaticExportConfiguration(
  app: ResolvedAppPackage
): Promise<void> {
  const { framework, rootDirectory, name } = app

  switch (framework) {
    case 'next':
      await validateNextStaticExport(rootDirectory, name)
      break
    case 'vite':
      // Vite builds are static by default - no validation needed
      break
    case 'waku':
      await validateWakuStaticExport(rootDirectory, name)
      break
  }
}

async function validateNextStaticExport(
  rootDirectory: string,
  appName: string
): Promise<void> {
  let configPath: string | null = null
  let configContent: string | null = null

  // Find the Next.js config file
  for (const configFile of NEXT_CONFIG_FILES) {
    const fullPath = join(rootDirectory, configFile)
    try {
      configContent = await readFile(fullPath, 'utf-8')
      configPath = fullPath
      break
    } catch {
      // File doesn't exist, try next
    }
  }

  if (!configPath || !configContent) {
    throw new Error(
      `[renoun] Could not find a Next.js configuration file in "${appName}".\n\n` +
        `App mode requires the app to have a next.config.ts (or .js/.mjs) file ` +
        `with \`output: 'export'\` configured for static site generation.\n\n` +
        `Expected one of: ${NEXT_CONFIG_FILES.join(', ')}`
    )
  }

  // Check for output: 'export' in the config
  // This is a simple text-based check - it handles most common patterns
  const hasStaticExport =
    /output\s*:\s*['"`]export['"`]/.test(configContent) ||
    /output\s*=\s*['"`]export['"`]/.test(configContent)

  if (!hasStaticExport) {
    throw new Error(
      `[renoun] App "${appName}" is not configured for static export.\n\n` +
        `App mode currently requires static site generation because the runtime ` +
        `directory only exists during build. Dynamic rendering would fail when deployed ` +
        `because the server cannot access the app source files.\n\n` +
        `To fix this, add \`output: 'export'\` to your Next.js configuration:\n\n` +
        `  // ${basename(configPath)}\n` +
        `  export default {\n` +
        `    output: 'export',\n` +
        `    // ... other options\n` +
        `  }\n\n` +
        `If you need dynamic rendering, consider using the app directly without app mode.`
    )
  }
}

async function validateWakuStaticExport(
  rootDirectory: string,
  appName: string
): Promise<void> {
  // Waku uses per-page render configuration rather than a global setting.
  // We check for a waku.config file to confirm it's a valid Waku project,
  // but we can't easily validate that all pages use render: 'static'.
  // For now, we warn the user about the requirement.

  let hasConfig = false
  for (const configFile of WAKU_CONFIG_FILES) {
    const fullPath = join(rootDirectory, configFile)
    try {
      await readFile(fullPath, 'utf-8')
      hasConfig = true
      break
    } catch {
      // File doesn't exist, try next
    }
  }

  if (!hasConfig) {
    // No config file found - this might still be a valid Waku project
    // Just proceed with a warning
    process.stderr.write(
      `[renoun] Warning: Could not find a Waku configuration file in "${appName}".\n` +
        `App mode requires all pages to use \`render: 'static'\` in their getConfig.\n` +
        `If you encounter issues, ensure your Waku pages are configured for static rendering.\n\n`
    )
    return
  }

  // Waku config exists - warn about the per-page requirement
  process.stderr.write(
    `[renoun] Note: Waku uses per-page render configuration.\n` +
      `Ensure all pages in "${appName}" export getConfig with \`render: 'static'\`.\n` +
      `Dynamic pages (render: 'dynamic') are not compatible with app mode.\n\n`
  )
}

class ShadowManager {
  #projectRoot: string
  #runtimeRoot: string
  #shadowedPaths: Set<string> = new Set()
  #watchers: Map<string, ReturnType<typeof watchFs>> = new Map()
  #syncScheduled = false
  #isSyncing = false
  #pendingSync = false

  constructor({
    projectRoot,
    runtimeDirectory,
  }: {
    projectRoot: string
    runtimeDirectory: string
  }) {
    this.#projectRoot = projectRoot
    this.#runtimeRoot = runtimeDirectory
  }

  async start() {
    await this.#syncShadows()
  }

  stop() {
    for (const watcher of this.#watchers.values()) {
      watcher.close()
    }
    this.#watchers.clear()
  }

  getShadowedPaths(): string[] {
    return Array.from(this.#shadowedPaths).sort()
  }

  #scheduleSync() {
    if (this.#syncScheduled) {
      this.#pendingSync = true
      return
    }

    this.#syncScheduled = true
    setTimeout(() => {
      this.#syncScheduled = false
      this.#syncShadows().catch((error) => {
        getDebugLogger().error('Failed to synchronize app shadows', () => ({
          data: {
            error: error instanceof Error ? error.message : String(error),
          },
        }))
      })
    }, 50)
  }

  async #syncShadows() {
    if (this.#isSyncing) {
      this.#pendingSync = true
      return
    }

    this.#isSyncing = true
    this.#pendingSync = false

    try {
      const absoluteDirectories = new Set<string>()
      const directoryShadows = new Set<string>()
      const fileShadows = new Set<string>()

      await this.#collectProjectEntries(
        '.',
        absoluteDirectories,
        directoryShadows,
        fileShadows
      )

      const validShadows = await this.#applyShadows(
        directoryShadows,
        fileShadows
      )
      this.#cleanupObsoleteShadows(validShadows)
      this.#cleanupObsoleteWatchers(absoluteDirectories)
    } finally {
      this.#isSyncing = false

      if (this.#pendingSync) {
        this.#pendingSync = false
        await this.#syncShadows()
      }
    }
  }

  async #collectProjectEntries(
    relativeDirectory: string,
    absoluteDirectories: Set<string>,
    directoryShadows: Set<string>,
    fileShadows: Set<string>
  ) {
    const absoluteDirectory = join(this.#projectRoot, relativeDirectory)
    absoluteDirectories.add(absoluteDirectory)

    this.#ensureWatcher(absoluteDirectory)

    const entries = await readdir(absoluteDirectory, { withFileTypes: true })

    for (const entry of entries) {
      const entryRelativePath =
        relativeDirectory === '.'
          ? entry.name
          : join(relativeDirectory, entry.name)

      if (this.#shouldIgnore(entryRelativePath, entry.isDirectory())) {
        continue
      }

      const normalizedRelativePath = normalizeRelativePath(entryRelativePath)

      if (entry.isDirectory()) {
        if (normalizedRelativePath) {
          directoryShadows.add(normalizedRelativePath)
        }
        await this.#collectProjectEntries(
          entryRelativePath,
          absoluteDirectories,
          directoryShadows,
          fileShadows
        )
        continue
      }

      if (entry.isFile() || entry.isSymbolicLink()) {
        if (normalizedRelativePath) {
          fileShadows.add(normalizedRelativePath)
        }
      }
    }
  }

  #shouldIgnore(relativePath: string, isDirectory: boolean): boolean {
    const normalizedPath = relativePath.replace(/^\.\//, '')
    const segments = normalizedPath.split(/[\\/]/).filter(Boolean)

    if (segments.length === 0) {
      return false
    }

    const [firstSegment] = segments

    if (IGNORED_PROJECT_DIRECTORIES.has(firstSegment) && isDirectory) {
      return true
    }

    if (IGNORED_PROJECT_FILES.has(basename(normalizedPath)) && !isDirectory) {
      return true
    }

    return false
  }

  #ensureWatcher(directory: string) {
    if (this.#watchers.has(directory)) {
      return
    }

    try {
      const watcher = watchFs(directory, { persistent: false }, () => {
        this.#scheduleSync()
      })
      this.#watchers.set(directory, watcher)
    } catch (error) {
      getDebugLogger().warn(
        'Failed to watch directory for app shadowing',
        () => ({
          data: {
            directory,
            error: error instanceof Error ? error.message : String(error),
          },
        })
      )
    }
  }

  async #applyShadows(
    directoryShadows: Set<string>,
    fileShadows: Set<string>
  ): Promise<Set<string>> {
    const validPaths = new Set<string>()

    const sortedDirectories = Array.from(directoryShadows).sort((a, b) => {
      const aDepth = a.split(/[\\/]/).length
      const bDepth = b.split(/[\\/]/).length
      if (aDepth === bDepth) {
        return a.localeCompare(b)
      }
      return aDepth - bDepth
    })

    for (const relativePath of sortedDirectories) {
      if (!relativePath) {
        continue
      }

      if (this.#isShadowedByParent(relativePath, validPaths)) {
        continue
      }

      await this.#ensureDirectoryShadow(relativePath)
      validPaths.add(relativePath)
    }

    const sortedFiles = Array.from(fileShadows).sort((a, b) =>
      a.localeCompare(b)
    )

    for (const relativePath of sortedFiles) {
      if (this.#isShadowedByParent(relativePath, validPaths)) {
        continue
      }

      await this.#ensureFileShadow(relativePath)
      validPaths.add(relativePath)
    }

    return validPaths
  }

  async #ensureFileShadow(relativePath: string) {
    const sourcePath = join(this.#projectRoot, relativePath)
    const targetPath = join(this.#runtimeRoot, relativePath)
    const targetDirectory = dirname(targetPath)

    await mkdir(targetDirectory, { recursive: true })

    let existingTarget: Awaited<ReturnType<typeof lstat>> | null = null

    try {
      existingTarget = await lstat(targetPath)
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        existingTarget = null
      } else {
        throw error
      }
    }

    if (existingTarget) {
      if (existingTarget.isSymbolicLink()) {
        try {
          const existingLink = await readlink(targetPath)
          const resolvedExisting = resolve(dirname(targetPath), existingLink)
          if (resolvedExisting === resolve(sourcePath)) {
            this.#shadowedPaths.add(relativePath)
            return
          }
        } catch {
          // fall through to re-link
        }
      }

      await rm(targetPath, {
        recursive: existingTarget.isDirectory(),
        force: true,
      })
    }

    await symlink(sourcePath, targetPath, 'file')
    this.#shadowedPaths.add(relativePath)
  }

  async #ensureDirectoryShadow(relativePath: string) {
    const sourcePath = join(this.#projectRoot, relativePath)
    const targetPath = join(this.#runtimeRoot, relativePath)
    const targetDirectory = dirname(targetPath)

    await mkdir(targetDirectory, { recursive: true })

    let existingTarget: Awaited<ReturnType<typeof lstat>> | null = null

    try {
      existingTarget = await lstat(targetPath)
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        existingTarget = null
      } else {
        throw error
      }
    }

    if (existingTarget) {
      if (existingTarget.isSymbolicLink()) {
        try {
          const existingLink = await readlink(targetPath)
          const resolvedExisting = resolve(dirname(targetPath), existingLink)
          if (resolvedExisting === resolve(sourcePath)) {
            this.#shadowedPaths.add(relativePath)
            return
          }
        } catch {
          // fall through to re-link
        }
      }

      await rm(targetPath, { recursive: true, force: true })
    }

    const symlinkType = process.platform === 'win32' ? 'junction' : 'dir'
    await symlink(sourcePath, targetPath, symlinkType)
    this.#shadowedPaths.add(relativePath)
  }

  #cleanupObsoleteShadows(validPaths: Set<string>) {
    for (const path of Array.from(this.#shadowedPaths)) {
      if (validPaths.has(path)) {
        continue
      }

      const targetPath = join(this.#runtimeRoot, path)
      rm(targetPath, { force: true }).catch(() => {})
      this.#shadowedPaths.delete(path)
    }
  }

  #cleanupObsoleteWatchers(validDirectories: Set<string>) {
    for (const [directory, watcher] of this.#watchers.entries()) {
      if (validDirectories.has(directory)) {
        continue
      }

      watcher.close()
      this.#watchers.delete(directory)
    }
  }

  #isShadowedByParent(relativePath: string, shadowed: Set<string>): boolean {
    const segments = relativePath.split('/')

    while (segments.length > 1) {
      segments.pop()
      const candidate = segments.join('/')
      if (shadowed.has(candidate)) {
        return true
      }
    }

    return false
  }
}

function normalizeRelativePath(path: string): string {
  return path
    .replace(/^[./\\]+/, '')
    .split(/[\\/]/)
    .filter(Boolean)
    .join('/')
}
