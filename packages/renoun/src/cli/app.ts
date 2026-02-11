import { watch, existsSync, cpSync, rmSync } from 'node:fs'
import {
  copyFile,
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'

import { createServer } from '../project/server.ts'
import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.ts'
import { joinPaths } from '../utils/path.ts'
import { getDebugLogger } from '../utils/debug.ts'
import { resolveFrameworkBinFile, type Framework } from './framework.ts'
import { spawn } from 'node:child_process'

function mergeDependencySections(
  appPackageJson: Record<string, unknown>,
  projectPackageJson: Record<string, unknown>
): {
  merged: Record<string, unknown>
  conflicts: Array<{
    name: string
    section:
      | 'dependencies'
      | 'devDependencies'
      | 'optionalDependencies'
      | 'peerDependencies'
    project: string
    app: string
  }>
} {
  const keys = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ] as const

  const merged: Record<string, unknown> = {}
  const conflicts: Array<{
    name: string
    section: (typeof keys)[number]
    project: string
    app: string
  }> = []

  for (const key of keys) {
    const projectSection = projectPackageJson[key]
    const appSection = appPackageJson[key]

    const projectRecord =
      projectSection && typeof projectSection === 'object'
        ? (projectSection as Record<string, unknown>)
        : {}
    const appRecord =
      appSection && typeof appSection === 'object'
        ? (appSection as Record<string, unknown>)
        : {}

    // Merge with app versions taking precedence to avoid claiming a version that
    // isn't actually present in the runtime's `node_modules` (which comes from
    // the app package install graph).
    for (const [name, projectSpec] of Object.entries(projectRecord)) {
      const appSpec = appRecord[name]
      if (
        typeof projectSpec === 'string' &&
        typeof appSpec === 'string' &&
        projectSpec !== appSpec
      ) {
        conflicts.push({
          name,
          section: key,
          project: projectSpec,
          app: appSpec,
        })
      }
    }
    merged[key] = { ...projectRecord, ...appRecord }
  }

  return { merged, conflicts }
}

async function writeMergedRuntimePackageJson(options: {
  projectRoot: string
  runtimeDirectory: string
}): Promise<void> {
  const { projectRoot, runtimeDirectory } = options

  const runtimePackageJsonPath = join(runtimeDirectory, 'package.json')
  const projectPackageJsonPath = join(projectRoot, 'package.json')

  let runtimePackageJson: Record<string, unknown>
  let projectPackageJson: Record<string, unknown>

  try {
    runtimePackageJson = JSON.parse(
      await readFile(runtimePackageJsonPath, 'utf-8')
    )
  } catch {
    // If the app doesn't ship a package.json for some reason, don't attempt merging.
    getDebugLogger().debug(
      'Skipping runtime package.json merge (no runtime package.json)',
      () => ({
        data: { runtimePackageJsonPath },
      })
    )
    return
  }

  try {
    projectPackageJson = JSON.parse(
      await readFile(projectPackageJsonPath, 'utf-8')
    )
  } catch {
    getDebugLogger().debug(
      'Skipping runtime package.json merge (no project package.json)',
      () => ({
        data: { projectPackageJsonPath },
      })
    )
    return
  }

  const { merged: mergedDeps, conflicts } = mergeDependencySections(
    runtimePackageJson,
    projectPackageJson
  )

  const merged: Record<string, unknown> = {
    ...runtimePackageJson,
    ...mergedDeps,
    private: true,
  }

  await writeFile(
    runtimePackageJsonPath,
    JSON.stringify(merged, null, 2) + '\n'
  )

  getDebugLogger().info(
    'Merged project dependencies into runtime package.json',
    () => ({
      data: { runtimePackageJsonPath, projectPackageJsonPath },
    })
  )

  if (conflicts.length > 0) {
    getDebugLogger().warn(
      'Dependency spec mismatch between project and app (app spec wins in runtime package.json)',
      () => ({
        data: {
          conflictCount: conflicts.length,
          conflicts: conflicts.slice(0, 25),
        },
      })
    )
  }
}

async function getInstalledPackageVersion(options: {
  packageName: string
  fromDirectory: string
}): Promise<{ version: string; packageJsonPath: string }> {
  const { packageName, fromDirectory } = options
  const requireFromDirectory = createRequire(
    join(fromDirectory, 'package.json')
  )
  const packageJsonPath = requireFromDirectory.resolve(
    `${packageName}/package.json`
  )
  const raw = await readFile(packageJsonPath, 'utf-8')
  const parsed = JSON.parse(raw) as { version?: unknown }
  if (typeof parsed.version !== 'string' || parsed.version.length === 0) {
    throw new Error(
      `[renoun] Failed to determine installed version for "${packageName}" from ${packageJsonPath}`
    )
  }
  return { version: parsed.version, packageJsonPath }
}

interface AppCommandOptions {
  /** The framework command to run. */
  command: 'dev' | 'build'

  /** Arguments to pass to the framework command. */
  args: string[]

  /** When true, auto-detects app from dependencies. Do not parse app name from args. */
  autoDetect?: boolean
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

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.cache',
  '.next',
  '.output',
  '.renoun',
  '.turbo',
  '.vite',
  'dist',
  'node_modules',
  'out',
])

const IGNORED_PROJECT_FILES = new Set([
  'bun.lockb',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
])

/**
 * Summarizes an array of file paths by grouping them by top-level directory.
 * e.g., ["components/Box/Box.tsx", "components/Button/Button.tsx", "hooks/index.ts"]
 * becomes "components/ (2 files), hooks/ (1 file)"
 */
function summarizeOverriddenPaths(paths: string[]): string {
  const groups = new Map<string, number>()

  for (const path of paths) {
    const topLevel = path.includes('/') ? path.split('/')[0] : path
    groups.set(topLevel, (groups.get(topLevel) || 0) + 1)
  }

  return Array.from(groups.entries())
    .map(([dir, count]) => {
      if (count === 1) {
        // For single files, show the full path
        const fullPath = paths.find((p) => p === dir || p.startsWith(dir + '/'))
        return fullPath || dir
      }
      return `${dir}/ (${count} files)`
    })
    .join(', ')
}

const FRAMEWORK_HINTS: Record<Framework, readonly string[]> = {
  next: ['next'],
  vite: ['vite'],
  waku: ['waku'],
}

/** Output directory name for each framework's static build */
const FRAMEWORK_OUTPUT_DIRECTORIES: Record<Framework, string> = {
  next: 'out',
  vite: 'dist',
  waku: 'dist',
}

const NEXT_CONFIG_FILES = [
  'next.config.ts',
  'next.config.mts',
  'next.config.ts',
  'next.config.mjs',
]

const WAKU_CONFIG_FILES = ['waku.config.ts', 'waku.config.ts']

/**
 * Copies the build output from the runtime directory to the project root.
 * This makes the static output easily accessible for deployment.
 * Uses synchronous operations to ensure completion before process exit.
 */
function copyBuildOutput(options: {
  runtimeDirectory: string
  projectRoot: string
  framework: Framework
  log: (message: string) => void
}): void {
  const { runtimeDirectory, projectRoot, framework, log } = options
  const outputDirName = FRAMEWORK_OUTPUT_DIRECTORIES[framework]
  const sourceOutputDir = join(runtimeDirectory, outputDirName)
  const targetOutputDir = join(projectRoot, outputDirName)

  // Check if the output directory exists in the runtime directory
  if (!existsSync(sourceOutputDir)) {
    getDebugLogger().debug('No build output directory found', () => ({
      data: { sourceOutputDir },
    }))
    return
  }

  // Remove existing output directory in project root if it exists
  try {
    rmSync(targetOutputDir, { recursive: true, force: true })
  } catch {
    // Ignore errors if directory doesn't exist
  }

  // Copy the output directory to the project root
  cpSync(sourceOutputDir, targetOutputDir, { recursive: true })

  log(`Build output copied to ./${outputDirName}/`)

  // For Next.js, also copy `.next` directory since Vercel expects it for routes manifest
  if (framework === 'next') {
    const sourceNextDir = join(runtimeDirectory, '.next')
    const targetNextDir = join(projectRoot, '.next')

    if (existsSync(sourceNextDir)) {
      try {
        rmSync(targetNextDir, { recursive: true, force: true })
      } catch {
        // Ignore errors if directory doesn't exist
      }

      cpSync(sourceNextDir, targetNextDir, { recursive: true })
      log('Build metadata copied to ./.next/')
    }
  }
}

export async function runAppCommand({
  command,
  args,
  autoDetect,
}: AppCommandOptions) {
  const projectRoot = process.cwd()
  const { appName, forwardedArgs } = parseAppArgs(args, autoDetect)
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

  const overrideManager = new OverrideManager({
    projectRoot,
    runtimeDirectory,
  })
  await overrideManager.start()

  const overriddenPaths = overrideManager.getOverriddenPaths()
  if (overriddenPaths.length > 0) {
    // Summarize overrides by top-level directory for cleaner output
    const summary = summarizeOverriddenPaths(overriddenPaths)
    log(
      `Applied ${overriddenPaths.length} override${
        overriddenPaths.length === 1 ? '' : 's'
      }: ${summary}`
    )
  } else {
    log('No project overrides detected; using template defaults')
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

    overrideManager.stop()

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

    if (resolvedExample.framework === 'next') {
      const runtimeNext = await getInstalledPackageVersion({
        packageName: 'next',
        fromDirectory: runtimeDirectory,
      })

      let projectNext: Awaited<
        ReturnType<typeof getInstalledPackageVersion>
      > | null = null

      try {
        projectNext = await getInstalledPackageVersion({
          packageName: 'next',
          fromDirectory: projectRoot,
        })
      } catch {
        projectNext = null
      }

      if (projectNext && projectNext.version !== runtimeNext.version) {
        getDebugLogger().error(
          'Next.js version mismatch detected (app mode)',
          () => ({
            data: {
              projectNext,
              runtimeNext,
              projectRoot,
              runtimeDirectory,
            },
          })
        )
        throw new Error(
          `[renoun] Next.js version mismatch detected.\n\n` +
            `This project resolves:\n` +
            `  next@${projectNext.version}\n` +
            `  (${projectNext.packageJsonPath})\n\n` +
            `But the selected app package resolves:\n` +
            `  next@${runtimeNext.version}\n` +
            `  (${runtimeNext.packageJsonPath})\n\n` +
            `Fix options:\n` +
            `  • Align versions (recommended): install next@${runtimeNext.version} in your project.\n` +
            `  • Or remove your project's direct "next" dependency and let the app package provide Next.\n` +
            ``
        )
      }
    }

    const frameworkBinPath = resolveFrameworkBinFile(
      resolvedExample.framework,
      {
        fromDirectory: runtimeDirectory,
      }
    )

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

      // For successful builds, copy the output directory to the project root before cleanup
      const buildSucceeded = (exitCode ?? code ?? 0) === 0
      if (command === 'build' && buildSucceeded) {
        try {
          copyBuildOutput({
            runtimeDirectory,
            projectRoot,
            framework: resolvedExample.framework,
            log,
          })
        } catch (error) {
          console.error(`[renoun] Failed to copy build output: ${error}`)
        }
        cleanupAndExit(code)
      } else {
        cleanupAndExit(code)
      }
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
    overrideManager.stop()
    process.chdir(previousCwd)
    throw error
  }
}

function parseAppArgs(args: string[], autoDetect?: boolean): ParsedAppArgs {
  let appName: string | undefined
  const forwardedArgs: string[] = []

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (!value) continue

    // When autoDetect is true, don't try to parse app name from positional args.
    // The first positional argument is treated as the app package name only in
    // explicit app mode (e.g., `renoun @renoun/blog dev`).
    if (
      !autoDetect &&
      !appName &&
      !value.startsWith('-') &&
      /^[@a-zA-Z]/.test(value)
    ) {
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

  // Symlink node_modules so dependencies can be resolved from the runtime directory.
  // The strategy differs based on how the app package is installed:
  //
  // 1. Local development (monorepo): app.rootDirectory has its own node_modules
  //    from the package manager install - we symlink that.
  //
  // 2. pnpm: Dependencies are in a virtual store at .pnpm/<pkg>/node_modules/.
  //    The app package's parent directory contains all its dependencies as symlinks.
  //    We detect this by checking if app.rootDirectory is inside .pnpm/.
  //
  // 3. npm/yarn with hoisting: Dependencies are in the project's root node_modules.
  //    We symlink the project's node_modules.
  const runtimeNodeModules = join(runtimeRoot, 'node_modules')

  // Remove any existing node_modules symlink (may point to app's empty node_modules)
  try {
    const existingStat = await lstat(runtimeNodeModules)
    if (existingStat.isSymbolicLink() || existingStat.isDirectory()) {
      await rm(runtimeNodeModules, { recursive: true, force: true })
    }
  } catch {
    // Doesn't exist, that's fine
  }

  // Determine which node_modules to use
  let nodeModulesSource: string | null = null

  // Check if app is in pnpm's virtual store (.pnpm directory)
  // The app's rootDirectory will be something like:
  //   node_modules/.pnpm/@renoun+blog@x.x.x.../node_modules/@renoun/blog
  // And the virtual store's node_modules (with all dependencies) is:
  //   node_modules/.pnpm/@renoun+blog@x.x.x.../node_modules/
  // For scoped packages (@scope/name), we need to go up 2 levels.
  // For non-scoped packages, we need to go up 1 level.
  if (app.rootDirectory.includes('.pnpm')) {
    // Determine how many levels up we need to go
    // Scoped packages: @scope/name -> go up 2 levels
    // Non-scoped: name -> go up 1 level
    const isScoped = app.name.startsWith('@')
    const pnpmVirtualNodeModules = isScoped
      ? dirname(dirname(app.rootDirectory))
      : dirname(app.rootDirectory)

    try {
      await lstat(pnpmVirtualNodeModules)
      nodeModulesSource = pnpmVirtualNodeModules
      getDebugLogger().debug(
        'Using pnpm virtual store node_modules for runtime',
        () => ({
          data: { pnpmVirtualNodeModules, isScoped },
        })
      )
    } catch {
      // Fall through to other options
    }
  }

  // If not pnpm, check if the app's own node_modules exists (workspace case)
  // In a monorepo with workspace links, the app package has its own node_modules
  // with all its dependencies installed.
  if (!nodeModulesSource) {
    const appNodeModules = join(app.rootDirectory, 'node_modules')
    try {
      const appNmStat = await lstat(appNodeModules)
      if (appNmStat.isDirectory()) {
        nodeModulesSource = appNodeModules
      }
    } catch {
      // App doesn't have its own node_modules, fall through
    }
  }

  // If still no source, fall back to project's node_modules
  if (!nodeModulesSource) {
    const projectNodeModules = join(projectRoot, 'node_modules')
    try {
      await lstat(projectNodeModules)
      nodeModulesSource = projectNodeModules
    } catch {
      getDebugLogger().warn(
        'No node_modules found - dependencies may not resolve',
        () => ({
          data: {
            runtimeRoot,
            projectRoot,
            appRootDirectory: app.rootDirectory,
          },
        })
      )
    }
  }

  // Create the symlink
  if (nodeModulesSource) {
    const symlinkType = process.platform === 'win32' ? 'junction' : 'dir'
    await symlink(nodeModulesSource, runtimeNodeModules, symlinkType)
  }

  // Merge the user's dependencies into the runtime `package.json` so the mental
  // model is consistent: app filesystem + project overrides + project deps.
  // Note: this does not change the install graph; resolution still depends on
  // `node_modules` (runtime first, then parent directories).
  await writeMergedRuntimePackageJson({
    projectRoot,
    runtimeDirectory: runtimeRoot,
  })

  return runtimeRoot
}

async function symlinkAppContents(
  appRoot: string,
  runtimeRoot: string
): Promise<void> {
  await recursiveSymlinkDirectory(appRoot, runtimeRoot, appRoot)
}

async function assertPathInsideRoot(path: string, root: string, label: string) {
  const [resolvedPath, resolvedRoot] = await Promise.all([
    realpath(path),
    realpath(root),
  ])

  if (
    resolvedPath !== resolvedRoot &&
    !resolvedPath.startsWith(`${resolvedRoot}/`)
  ) {
    throw new Error(
      `[renoun] Refusing to process ${label} outside the project root: ${path}`
    )
  }

  return resolvedPath
}

/**
 * Recursively create directory structure.
 * - ALL source files are COPIED so imports resolve from runtime directory
 * - Non-source files (images, css, etc.) are symlinked for efficiency
 * - node_modules is always symlinked
 */
async function recursiveSymlinkDirectory(
  sourceDir: string,
  targetDir: string,
  rootDir: string
): Promise<void> {
  const entries = await readdir(sourceDir, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name)
    const targetPath = join(targetDir, entry.name)

    if (entry.isDirectory()) {
      // Skip ignored directories entirely
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        // Special case: symlink node_modules so dependencies resolve
        if (entry.name === 'node_modules') {
          const symlinkType = process.platform === 'win32' ? 'junction' : 'dir'
          await symlink(sourcePath, targetPath, symlinkType)
        }
        continue
      }

      // Create real directory and recurse into it
      await mkdir(targetPath, { recursive: true })
      await recursiveSymlinkDirectory(sourcePath, targetPath, rootDir)
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      const resolvedSourcePath = entry.isSymbolicLink()
        ? await assertPathInsideRoot(sourcePath, rootDir, 'symlink target')
        : sourcePath

      const sourceStat = await stat(resolvedSourcePath)
      if (sourceStat.isDirectory()) {
        await mkdir(targetPath, { recursive: true })
        await recursiveSymlinkDirectory(resolvedSourcePath, targetPath, rootDir)
        continue
      }

      // Copy ALL files to the runtime directory
      // Symlinking non-source files (images, ico, css) causes issues with Next.js Turbopack
      // during production build as it doesn't follow symlinks for static assets
      await copyFile(resolvedSourcePath, targetPath)
    }
  }
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

class OverrideManager {
  #projectRoot: string
  #runtimeRoot: string
  #overriddenPaths: Set<string> = new Set()
  #watchers: Map<string, ReturnType<typeof watch>> = new Map()
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
    await this.#syncOverrides()
  }

  stop() {
    for (const watcher of this.#watchers.values()) {
      watcher.close()
    }
    this.#watchers.clear()
  }

  getOverriddenPaths(): string[] {
    return Array.from(this.#overriddenPaths).sort()
  }

  #scheduleSync() {
    if (this.#syncScheduled) {
      this.#pendingSync = true
      return
    }

    this.#syncScheduled = true
    setTimeout(() => {
      this.#syncScheduled = false
      this.#syncOverrides().catch((error) => {
        getDebugLogger().error('Failed to synchronize app overrides', () => ({
          data: {
            error: error instanceof Error ? error.message : String(error),
          },
        }))
      })
    }, 50)
  }

  async #syncOverrides() {
    if (this.#isSyncing) {
      this.#pendingSync = true
      return
    }

    this.#isSyncing = true
    this.#pendingSync = false

    try {
      const absoluteDirectories = new Set<string>()
      const directoryOverrides = new Set<string>()
      const fileOverrides = new Set<string>()

      await this.#collectProjectEntries(
        '.',
        absoluteDirectories,
        directoryOverrides,
        fileOverrides
      )

      const validOverrides = await this.#applyOverrides(fileOverrides)
      this.#cleanupObsoleteOverrides(validOverrides)
      this.#cleanupObsoleteWatchers(absoluteDirectories)
    } finally {
      this.#isSyncing = false

      if (this.#pendingSync) {
        this.#pendingSync = false
        await this.#syncOverrides()
      }
    }
  }

  async #collectProjectEntries(
    relativeDirectory: string,
    absoluteDirectories: Set<string>,
    directoryOverrides: Set<string>,
    fileOverrides: Set<string>
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

      const normalizedRelativePath = joinPaths(entryRelativePath)

      if (entry.isDirectory()) {
        if (normalizedRelativePath) {
          directoryOverrides.add(normalizedRelativePath)
        }
        await this.#collectProjectEntries(
          entryRelativePath,
          absoluteDirectories,
          directoryOverrides,
          fileOverrides
        )
        continue
      }

      if (entry.isSymbolicLink()) {
        continue
      }

      if (entry.isFile()) {
        if (normalizedRelativePath) {
          fileOverrides.add(normalizedRelativePath)
        }
      }
    }
  }

  #shouldIgnore(relativePath: string, isDirectory: boolean): boolean {
    if (relativePath === '.renoun' || relativePath.startsWith('.renoun/')) {
      return true
    }

    if (isDirectory && IGNORED_DIRECTORIES.has(basename(relativePath))) {
      return true
    }

    if (!isDirectory && IGNORED_PROJECT_FILES.has(basename(relativePath))) {
      return true
    }

    return isFilePathGitIgnored(join(this.#projectRoot, relativePath))
  }

  #ensureWatcher(directory: string) {
    if (this.#watchers.has(directory)) {
      return
    }

    try {
      const watcher = watch(directory, { persistent: false }, () => {
        this.#scheduleSync()
      })
      this.#watchers.set(directory, watcher)
    } catch (error) {
      getDebugLogger().warn(
        'Failed to watch directory for app overrides',
        () => ({
          data: {
            directory,
            error: error instanceof Error ? error.message : String(error),
          },
        })
      )
    }
  }

  async #applyOverrides(fileOverrides: Set<string>): Promise<Set<string>> {
    const validPaths = new Set<string>()

    // Use hard links for all files - Turbopack has issues with dynamic imports
    // from symlinked directories, so we avoid directory symlinks entirely.
    const sortedFiles = Array.from(fileOverrides).sort((a, b) =>
      a.localeCompare(b)
    )

    for (const relativePath of sortedFiles) {
      await this.#ensureFileOverride(relativePath)
      validPaths.add(relativePath)
    }

    return validPaths
  }

  async #ensureFileOverride(relativePath: string) {
    const sourcePath = join(this.#projectRoot, relativePath)
    const resolvedProjectSource = await assertPathInsideRoot(
      sourcePath,
      this.#projectRoot,
      'override file'
    )
    const sourceStat = await stat(resolvedProjectSource)
    if (!sourceStat.isFile()) {
      return
    }

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

    // Check if existing file is already a hard link to the source (same inode)
    // This prevents unnecessary recreation which triggers file watchers
    if (existingTarget && existingTarget.isFile()) {
      try {
        if (existingTarget.ino === sourceStat.ino) {
          // Already a hard link to the source, skip recreation
          this.#overriddenPaths.add(relativePath)
          return
        }
      } catch {
        // Fall through to recreate
      }
    }

    // Remove existing target (old symlink, stale copy, or different hard link)
    if (existingTarget) {
      await rm(targetPath, {
        recursive: existingTarget.isDirectory(),
        force: true,
      })
    }

    // Use hard links instead of symlinks - Turbopack has issues resolving
    // dynamic imports when target files are symlinks. Hard links preserve
    // file metadata (mtime, etc.) since they reference the same inode.
    try {
      await link(resolvedProjectSource, targetPath)
    } catch (error) {
      // Fall back to copy if hard link fails (e.g., cross-filesystem)
      if (error instanceof Error && 'code' in error && error.code === 'EXDEV') {
        await copyFile(resolvedProjectSource, targetPath)
      } else {
        throw error
      }
    }
    this.#overriddenPaths.add(relativePath)
  }

  #cleanupObsoleteOverrides(validPaths: Set<string>) {
    for (const path of Array.from(this.#overriddenPaths)) {
      if (validPaths.has(path)) {
        continue
      }

      const targetPath = join(this.#runtimeRoot, path)
      rm(targetPath, { force: true }).catch(() => {})
      this.#overriddenPaths.delete(path)
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
}
