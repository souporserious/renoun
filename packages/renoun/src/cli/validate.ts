import { readFile, readdir, stat } from 'node:fs/promises'
import {
  extname,
  join,
  normalize as normalizePath,
  relative as relativePath,
  resolve as resolvePath,
} from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  getMDXLinks,
  type LinkPosition,
  type LinkSource,
  type MDXLinkOccurrence,
} from '@renoun/mdx'

import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.ts'
import { getRootDirectory } from '../utils/get-root-directory.ts'
import {
  normalizeSlashes,
  trimLeadingCurrentDirPrefix,
  trimLeadingDotPrefix,
  trimTrailingSlashes,
} from '../utils/path.ts'

const MAX_WAIT_TIME = 30_000
const PING_INTERVAL = 2_000

const MDX_EXTENSIONS = new Set(['.mdx'])
const PROTOCOL_PATTERN = /^[a-zA-Z][a-zA-Z+-.]*:/

interface ParsedValidateArguments {
  showHelp: boolean
  positional?: string
}

interface StaticBrokenLink {
  filePath: string
  url: string
  normalizedUrl: string
  source: LinkSource
  position?: LinkPosition
}

interface StaticSkippedLink {
  filePath: string
  url: string
  source: LinkSource
  position?: LinkPosition
  reason: 'dynamic'
}

interface StaticValidationResult {
  brokenLinks: StaticBrokenLink[]
  skippedLinks: StaticSkippedLink[]
  warnings: string[]
  checkedLinks: number
  externalLinks: number
  totalFiles: number
  totalKnownPaths: number
}

interface StaticCollectionResult {
  validPaths: Set<string>
  fileRouteMap: Map<string, string>
  dynamicRoutePatterns: RegExp[]
}

interface LiveLink {
  url: string
  originUrl: string
  html: string
}

interface LiveBrokenLink {
  url: string
  originUrl: string
  html: string
  status?: number | string
  trace: string[]
}

interface LiveValidationResult {
  brokenLinks: LiveBrokenLink[]
  checkedLinks: number
  visitedPages: number
}

export async function runValidateCommand(rawArgs: string[]) {
  const originalCwd = process.cwd()
  const { positional, showHelp } = parseValidateArguments(rawArgs)

  if (showHelp) {
    printValidateHelp()
    return
  }

  const workspaceRoot = getRootDirectory(originalCwd)
  const normalizedCwd = normalizePath(originalCwd)
  const normalizedRoot = normalizePath(workspaceRoot)

  let exitCode = 0

  if (!positional) {
    // Static validation scoped to the current directory when run from a subdirectory.
    // When run from the workspace root, validate framework projects in the workspace.
    console.log('Static link validation')
    console.log('──────────────────────')
    if (normalizedCwd === normalizedRoot) {
      exitCode = await runWorkspaceStaticAndReport(workspaceRoot)
    } else {
      exitCode = await runStaticAndReport(originalCwd)
    }
  } else if (isLikelyUrl(positional)) {
    // Live validation for provided URL
    console.log('Live link validation')
    console.log('─────────────────────')
    const liveUrl = normalizeBaseUrl(positional)
    try {
      const liveResult = await runLiveValidation(liveUrl)
      console.log(
        `Crawled ${liveResult.visitedPages} page${
          liveResult.visitedPages === 1 ? '' : 's'
        } and checked ${liveResult.checkedLinks} links.`
      )
      if (liveResult.brokenLinks.length === 0) {
        console.log('✅ No broken live links found.')
      } else {
        exitCode = 1
        console.error('❌ Broken live links detected:')
        for (const brokenLink of liveResult.brokenLinks) {
          const status = brokenLink.status ?? 'unknown'
          const trace = brokenLink.trace.join(' → ')
          console.error(
            `  • ${brokenLink.url} (linked from ${brokenLink.originUrl}) [status: ${status}]`
          )
          if (trace.length > 0) {
            console.error(`    Trace: ${trace}`)
          }
        }
      }
    } catch (error) {
      exitCode = 1
      if (error instanceof Error) {
        console.error(`❌ Live validation failed: ${error.message}`)
      } else {
        console.error('❌ Live validation failed with an unknown error.')
      }
    }
  } else {
    // Static validation scoped to a directory
    const targetDirectory = resolvePath(originalCwd, positional)
    console.log('Static link validation')
    console.log('──────────────────────')
    const normalizedTarget = normalizePath(targetDirectory)
    if (normalizedTarget === normalizedRoot) {
      exitCode = await runWorkspaceStaticAndReport(workspaceRoot)
    } else {
      exitCode = await runStaticAndReport(targetDirectory)
    }
  }

  if (exitCode !== 0) {
    process.exitCode = exitCode
  }
}
function parseValidateArguments(rawArgs: string[]): ParsedValidateArguments {
  let showHelp = false
  const positionals: string[] = []

  for (let index = 0; index < rawArgs.length; index++) {
    const arg = rawArgs[index]

    if (arg === '--help' || arg === '-h') {
      showHelp = true
      continue
    }

    if (arg.startsWith('-')) {
      throw new Error(`[renoun] Unknown validate option: ${arg}`)
    }

    positionals.push(arg)
  }

  if (positionals.length > 1) {
    throw new Error(
      '[renoun] Too many arguments. Provide at most one: a directory path or a URL.'
    )
  }

  return { showHelp, positional: positionals[0] }
}

function printValidateHelp() {
  console.log(
    `Usage: renoun validate [directory_path|url]\n\n` +
      `Description:\n` +
      `  • Without arguments, runs static MDX link validation for the current directory.\n` +
      `    (If you run it from a workspace root, it validates detected projects in that workspace.)\n` +
      `  • With a directory path, validates only MDX files under that directory (resolved from your current directory).\n` +
      `  • With a URL, crawls the running site and validates links.\n` +
      `\n` +
      `Options:\n` +
      `  -h, --help      Show this usage information.`
  )
}

type FrameworkKind = 'next' | 'vite' | 'waku'

type DependencyMap = Record<string, string>

type PackageJson = {
  name?: string
  dependencies?: DependencyMap
  devDependencies?: DependencyMap
  peerDependencies?: DependencyMap
  optionalDependencies?: DependencyMap
}

function detectFrameworksFromPackageJson(pkg: PackageJson): FrameworkKind[] {
  const deps: DependencyMap = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
    ...(pkg.peerDependencies ?? {}),
    ...(pkg.optionalDependencies ?? {}),
  }

  const frameworks: FrameworkKind[] = []

  if (deps['next']) {
    frameworks.push('next')
  }
  if (deps['vite']) {
    frameworks.push('vite')
  }
  // Waku is typically published as "waku".
  if (deps['waku']) {
    frameworks.push('waku')
  }

  return frameworks
}

async function tryReadPackageJson(
  projectRoot: string
): Promise<PackageJson | null> {
  try {
    const raw = await readFile(join(projectRoot, 'package.json'), 'utf-8')
    return JSON.parse(raw) as PackageJson
  } catch {
    return null
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    await readdir(path)
    return true
  } catch {
    return false
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isFile()
  } catch {
    return false
  }
}

function normalizeWorkspaceGlob(pattern: string): string {
  let normalized = pattern.trim()
  normalized = normalized.replace(/^['"]|['"]$/g, '')
  normalized = normalized.replace(/\\/g, '/')
  return normalized
}

async function readWorkspacePackageGlobs(
  workspaceRoot: string
): Promise<string[] | null> {
  // pnpm
  try {
    const raw = await readFile(
      join(workspaceRoot, 'pnpm-workspace.yaml'),
      'utf-8'
    )
    const patterns: string[] = []
    let inPackagesSection = false

    for (const line of raw.split(/\r?\n/)) {
      if (!inPackagesSection) {
        if (/^\s*packages\s*:\s*$/.test(line)) {
          inPackagesSection = true
        }
        continue
      }

      // Stop when another top-level key begins.
      if (/^\S/.test(line) && !/^\s*-\s+/.test(line)) {
        break
      }

      const match = line.match(/^\s*-\s+(.+?)\s*$/)
      if (!match) {
        continue
      }

      const value = normalizeWorkspaceGlob(match[1])
      if (value.length === 0 || value.startsWith('!')) {
        continue
      }

      patterns.push(value)
    }

    if (patterns.length > 0) {
      return patterns
    }
  } catch {
    // fall through
  }

  // npm/yarn
  const rootPkg = await tryReadPackageJson(workspaceRoot)
  const workspaces = (rootPkg as unknown as { workspaces?: unknown })
    ?.workspaces

  if (Array.isArray(workspaces)) {
    return workspaces
      .map((p) => (typeof p === 'string' ? normalizeWorkspaceGlob(p) : ''))
      .filter((p) => p.length > 0 && !p.startsWith('!'))
  }

  if (
    workspaces &&
    typeof workspaces === 'object' &&
    Array.isArray((workspaces as { packages?: unknown }).packages)
  ) {
    return (workspaces as { packages: unknown[] }).packages
      .map((p) => (typeof p === 'string' ? normalizeWorkspaceGlob(p) : ''))
      .filter((p) => p.length > 0 && !p.startsWith('!'))
  }

  return null
}

async function listWorkspacePackageRootsFromGlobs(
  workspaceRoot: string,
  globs: string[]
): Promise<string[]> {
  const roots = new Set<string>()

  for (const rawPattern of globs) {
    const pattern = normalizeWorkspaceGlob(rawPattern)

    if (pattern === '.' || pattern === './') {
      roots.add(workspaceRoot)
      continue
    }

    // Support the common workspace form: "path/*".
    if (pattern.endsWith('/*') && !pattern.includes('**')) {
      const baseRelative = pattern.slice(0, -2)
      const baseAbsolute = join(workspaceRoot, baseRelative)

      if (!(await directoryExists(baseAbsolute))) {
        continue
      }

      let entries
      try {
        entries = await readdir(baseAbsolute, { withFileTypes: true })
      } catch {
        continue
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue
        }

        const projectRoot = join(baseAbsolute, entry.name.toString())
        if (isFilePathGitIgnored(projectRoot + '/')) {
          continue
        }

        const pkg = await tryReadPackageJson(projectRoot)
        if (!pkg) {
          continue
        }

        roots.add(projectRoot)
      }

      continue
    }

    // Fallback: treat as a direct directory.
    const direct = join(workspaceRoot, pattern)
    if (isFilePathGitIgnored(direct + '/')) {
      continue
    }

    const pkg = await tryReadPackageJson(direct)
    if (!pkg) {
      continue
    }

    roots.add(direct)
  }

  return Array.from(roots).sort((a, b) => a.localeCompare(b))
}

async function collectPackageRootsBySearching(
  workspaceRoot: string,
  maxDepth: number
): Promise<string[]> {
  const roots = new Set<string>()

  async function walk(current: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      return
    }

    if (isFilePathGitIgnored(current + '/')) {
      return
    }

    // Skip common large directories even if they aren't ignored.
    const baseName = current.split('/').pop() ?? ''
    if (
      baseName === 'node_modules' ||
      baseName === '.git' ||
      baseName === '.next'
    ) {
      return
    }

    const pkg = await tryReadPackageJson(current)
    if (pkg) {
      roots.add(current)
      // Do not early-return; nested workspaces exist in the wild.
    }

    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }

      await walk(join(current, entry.name.toString()), depth + 1)
    }
  }

  await walk(workspaceRoot, 0)
  return Array.from(roots).sort((a, b) => a.localeCompare(b))
}

async function detectFrameworksForProject(
  projectRoot: string,
  pkg: PackageJson | null
): Promise<FrameworkKind[]> {
  const frameworks = pkg ? detectFrameworksFromPackageJson(pkg) : []

  const hasNextStructure =
    (await directoryExists(join(projectRoot, 'app'))) ||
    (await directoryExists(join(projectRoot, 'pages'))) ||
    (await directoryExists(join(projectRoot, 'src', 'app'))) ||
    (await directoryExists(join(projectRoot, 'src', 'pages')))

  const hasViteStructure =
    (await fileExists(join(projectRoot, 'index.html'))) ||
    (await fileExists(join(projectRoot, 'vite.config.ts'))) ||
    (await fileExists(join(projectRoot, 'vite.config.js'))) ||
    (await fileExists(join(projectRoot, 'vite.config.mjs'))) ||
    (await fileExists(join(projectRoot, 'vite.config.cjs')))

  const hasWakuConfig =
    (await fileExists(join(projectRoot, 'waku.config.ts'))) ||
    (await fileExists(join(projectRoot, 'waku.config.js'))) ||
    (await fileExists(join(projectRoot, 'waku.config.mjs'))) ||
    (await fileExists(join(projectRoot, 'waku.config.cjs')))

  const finalFrameworks: FrameworkKind[] = []

  // Next: require route structure to avoid false positives in tool/workspace roots.
  if (hasNextStructure || frameworks.includes('next')) {
    if (hasNextStructure) {
      finalFrameworks.push('next')
    }
  }

  // Vite: require a typical Vite entry/config.
  if (frameworks.includes('vite') && hasViteStructure) {
    finalFrameworks.push('vite')
  }

  // Waku: require a config file.
  if (frameworks.includes('waku') && hasWakuConfig) {
    finalFrameworks.push('waku')
  }

  return finalFrameworks
}

async function discoverFrameworkProjects(
  workspaceRoot: string
): Promise<Array<{ root: string; name: string; frameworks: FrameworkKind[] }>> {
  const candidates: Array<{
    root: string
    name: string
    frameworks: FrameworkKind[]
  }> = []
  const workspaceRelative = (path: string) =>
    trimLeadingCurrentDirPrefix(relativePath(workspaceRoot, path))

  const workspaceGlobs = await readWorkspacePackageGlobs(workspaceRoot)
  const roots = workspaceGlobs
    ? await listWorkspacePackageRootsFromGlobs(workspaceRoot, workspaceGlobs)
    : await collectPackageRootsBySearching(workspaceRoot, 4)

  for (const projectRoot of roots) {
    if (isFilePathGitIgnored(projectRoot + '/')) {
      continue
    }

    const pkg = await tryReadPackageJson(projectRoot)
    const frameworks = await detectFrameworksForProject(projectRoot, pkg)

    if (frameworks.length === 0) {
      continue
    }

    candidates.push({
      root: projectRoot,
      name: pkg?.name ?? workspaceRelative(projectRoot),
      frameworks,
    })
  }

  // Stable output order.
  candidates.sort((a, b) => a.root.localeCompare(b.root))
  return candidates
}

async function runWorkspaceStaticAndReport(
  workspaceRoot: string
): Promise<number> {
  const projects = await discoverFrameworkProjects(workspaceRoot)

  if (projects.length === 0) {
    // Fallback to prior behavior.
    return runStaticAndReport(workspaceRoot)
  }

  let exitCode = 0
  let totalBroken = 0
  let totalChecked = 0
  let totalFiles = 0

  for (const project of projects) {
    const relativeProject = relativePath(workspaceRoot, project.root)
    const frameworkLabel = project.frameworks.join(', ')

    console.log(`${relativeProject} (${frameworkLabel})`)
    console.log('──────────────────────')

    try {
      const result = await runStaticValidation(project.root)

      totalChecked += result.checkedLinks
      totalFiles += result.totalFiles
      totalBroken += result.brokenLinks.length

      console.log(
        `Checked ${result.checkedLinks} internal links across ${result.totalFiles} MDX files.`
      )
      console.log(
        `Discovered ${result.totalKnownPaths} internal routes from MDX files.`
      )

      if (result.externalLinks > 0) {
        console.log(`Skipped ${result.externalLinks} external links.`)
      }

      if (result.skippedLinks.length > 0) {
        console.log(
          `Skipped ${result.skippedLinks.length} dynamic link${
            result.skippedLinks.length === 1 ? '' : 's'
          } that could not be resolved statically.`
        )
      }

      for (const warning of result.warnings) {
        console.warn(`⚠️  ${warning}`)
      }

      if (result.brokenLinks.length === 0) {
        console.log('✅ No broken internal links found.\n')
      } else {
        exitCode = 1
        console.error('❌ Broken internal links detected:')
        for (const brokenLink of result.brokenLinks) {
          const relativeFile = relativePath(project.root, brokenLink.filePath)
          const position = formatLinkPosition(brokenLink.position)
          console.error(
            `  • ${relativeFile}${position}: ${brokenLink.url} → ${brokenLink.normalizedUrl}`
          )
        }
        console.error('')
      }
    } catch (error) {
      exitCode = 1
      if (error instanceof Error) {
        console.error(`❌ Static validation failed: ${error.message}`)
      } else {
        console.error('❌ Static validation failed with an unknown error.')
      }
      console.error('')
    }
  }

  console.log('Workspace summary')
  console.log('─────────────────')
  console.log(
    `Checked ${totalChecked} internal links across ${totalFiles} MDX files in ${projects.length} project${
      projects.length === 1 ? '' : 's'
    }.`
  )
  if (totalBroken === 0) {
    console.log('✅ No broken internal links found.\n')
  } else {
    console.error(
      `❌ Found ${totalBroken} broken internal link${totalBroken === 1 ? '' : 's'}.\n`
    )
  }

  return exitCode
}
async function runStaticValidation(
  rootDirectory: string
): Promise<StaticValidationResult> {
  const mdxFiles = await collectWorkspaceFiles(rootDirectory, MDX_EXTENSIONS)

  const { validPaths, fileRouteMap, dynamicRoutePatterns } =
    await collectStaticRoutes(mdxFiles, rootDirectory)

  const brokenLinks: StaticBrokenLink[] = []
  const skippedLinks: StaticSkippedLink[] = []
  const warnings: string[] = []
  let checkedLinks = 0
  let externalLinks = 0

  for (const filePath of mdxFiles) {
    let source: string

    try {
      source = await readFile(filePath, 'utf-8')
    } catch (error) {
      warnings.push(
        `[static] Failed to read MDX file at ${relativePath(rootDirectory, filePath)}: ${String(
          error
        )}`
      )
      continue
    }

    let occurrences: MDXLinkOccurrence[]
    try {
      occurrences = getMDXLinks(source, filePath)
    } catch (error) {
      warnings.push(
        `[static] Failed to parse MDX file at ${relativePath(rootDirectory, filePath)}: ${error instanceof Error ? error.message : String(error)}`
      )
      continue
    }

    for (const occurrence of occurrences) {
      const resolution = resolveLinkTarget(occurrence, fileRouteMap)

      if (resolution.status === 'external') {
        externalLinks += 1
        continue
      }

      if (resolution.status === 'anchor' || resolution.status === 'empty') {
        continue
      }

      if (resolution.status === 'dynamic') {
        skippedLinks.push({
          filePath: occurrence.filePath,
          url: occurrence.url,
          source: occurrence.source,
          position: occurrence.position,
          reason: 'dynamic',
        })
        continue
      }

      if (resolution.status === 'unknown-base-route') {
        warnings.push(
          `[static] Unable to resolve route for relative link "${occurrence.url}" in ${relativePath(
            rootDirectory,
            occurrence.filePath
          )}`
        )
        continue
      }

      if (resolution.status !== 'internal') {
        continue
      }

      checkedLinks += 1
      const normalized = resolution.normalized

      const matchesDynamicRoute = dynamicRoutePatterns.some((pattern) =>
        pattern.test(normalized)
      )

      if (!validPaths.has(normalized) && !matchesDynamicRoute) {
        brokenLinks.push({
          filePath: occurrence.filePath,
          url: occurrence.url,
          normalizedUrl: normalized,
          source: occurrence.source,
          position: occurrence.position,
        })
      }
    }
  }

  return {
    brokenLinks,
    skippedLinks,
    warnings,
    checkedLinks,
    externalLinks,
    totalFiles: mdxFiles.length,
    totalKnownPaths: validPaths.size,
  }
}

async function runStaticAndReport(rootOrDir: string): Promise<number> {
  let exitCode = 0
  try {
    const staticResult = await runStaticValidation(rootOrDir)

    console.log(
      `Checked ${staticResult.checkedLinks} internal links across ${staticResult.totalFiles} MDX files.`
    )
    console.log(
      `Discovered ${staticResult.totalKnownPaths} internal routes from MDX files.`
    )

    if (staticResult.externalLinks > 0) {
      console.log(`Skipped ${staticResult.externalLinks} external links.`)
    }

    if (staticResult.skippedLinks.length > 0) {
      console.log(
        `Skipped ${staticResult.skippedLinks.length} dynamic link${
          staticResult.skippedLinks.length === 1 ? '' : 's'
        } that could not be resolved statically.`
      )
    }

    for (const warning of staticResult.warnings) {
      console.warn(`⚠️  ${warning}`)
    }

    if (staticResult.brokenLinks.length === 0) {
      console.log('✅ No broken internal links found.\n')
    } else {
      exitCode = 1
      console.error('❌ Broken internal links detected:')
      for (const brokenLink of staticResult.brokenLinks) {
        const relativeFile = relativePath(rootOrDir, brokenLink.filePath)
        const position = formatLinkPosition(brokenLink.position)
        console.error(
          `  • ${relativeFile}${position}: ${brokenLink.url} → ${brokenLink.normalizedUrl}`
        )
      }
      console.error('')
    }
  } catch (error) {
    exitCode = 1
    if (error instanceof Error) {
      console.error(`❌ Static validation failed: ${error.message}`)
    } else {
      console.error('❌ Static validation failed with an unknown error.')
    }
    console.error('')
  }
  return exitCode
}
async function collectWorkspaceFiles(
  rootDirectory: string,
  extensions: Set<string>
): Promise<string[]> {
  const results: string[] = []
  const queue: string[] = [rootDirectory]

  while (queue.length > 0) {
    const currentDirectory = queue.pop()!
    let directoryEntries

    try {
      directoryEntries = await readdir(currentDirectory, {
        withFileTypes: true,
      })
    } catch {
      continue
    }

    for (const entry of directoryEntries) {
      const entryName = entry.name.toString()
      const entryPath = join(currentDirectory, entryName)

      if (entry.isDirectory()) {
        // Skip directories that are gitignored
        if (isFilePathGitIgnored(entryPath + '/')) {
          continue
        }
        queue.push(entryPath)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      if (isFilePathGitIgnored(entryPath)) {
        continue
      }

      const extension = extname(entryName).toLowerCase()
      if (!extensions.has(extension)) {
        continue
      }

      if (
        entryName.endsWith('.d.ts') ||
        entryName.endsWith('.d.tsx') ||
        entryName.endsWith('.d.mts') ||
        entryName.endsWith('.d.cts')
      ) {
        continue
      }

      results.push(entryPath)
    }
  }

  return results
}

async function collectStaticRoutes(
  mdxFiles: string[],
  rootDirectory: string
): Promise<StaticCollectionResult> {
  const validPaths = new Set<string>()
  const fileRouteMap = new Map<string, string>()
  const dynamicRoutePatterns: RegExp[] = []

  validPaths.add('/')

  // If this directory looks like a Next.js app, include routes inferred from `app/**/page.*`
  const nextRoutes = await collectNextAppRoutes(rootDirectory)
  for (const path of nextRoutes.staticPaths) {
    validPaths.add(path)
  }
  dynamicRoutePatterns.push(...nextRoutes.dynamicRoutePatterns)

  for (const filePath of mdxFiles) {
    const route = computeRouteFromFilePath(filePath, rootDirectory)
    fileRouteMap.set(normalizeFilePath(filePath), route)
    validPaths.add(route)
  }

  return { validPaths, fileRouteMap, dynamicRoutePatterns }
}

function computeRouteFromFilePath(
  filePath: string,
  rootDirectory: string
): string {
  // Create a probable route from file path by removing numeric prefixes and extensions.
  let relative = relativePath(rootDirectory, filePath)
  relative = trimLeadingDotPrefix(normalizeSlashes(relative))

  const segments = relative
    .split('/')
    .filter(Boolean)
    .map((segment, index, arr) => {
      // For the last segment, drop extension
      let name = segment
      if (index === arr.length - 1) {
        name = name.replace(/\.(md|mdx)$/i, '')
      }
      // Remove ordered numeric prefixes like 01.
      name = name.replace(/^\d+\./, '')
      // Match Directory's default behavior (kebab-cased slugs).
      name = toKebabCase(name)
      return name
    })

  // If the last segment is index or readme, drop it to map to the directory
  if (segments.length > 0) {
    const last = segments[segments.length - 1].toLowerCase()
    if (last === 'index' || last === 'readme') {
      segments.pop()
    }
  }

  const routePath = '/' + segments.join('/')
  return normalizeRoutePath(routePath)
}

function toKebabCase(value: string) {
  return (
    value
      .replace(/[_\s]+/g, '-')
      // Split on lower->upper boundaries: "RootProvider" -> "Root-Provider"
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      // Split acronym boundaries: "MDXLink" -> "MDX-Link"
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
      .toLowerCase()
  )
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripAppRouteGroup(segment: string) {
  return segment.startsWith('(') && segment.endsWith(')')
}

async function collectNextAppRoutes(rootDirectory: string): Promise<{
  staticPaths: Set<string>
  dynamicRoutePatterns: RegExp[]
}> {
  const appDir = join(rootDirectory, 'app')
  const staticPaths = new Set<string>()
  const dynamicRoutePatterns: RegExp[] = []

  // If there is no app directory, bail quickly.
  try {
    await readdir(appDir)
  } catch {
    return { staticPaths, dynamicRoutePatterns }
  }

  const queue: string[] = [appDir]
  const pageFiles: string[] = []

  while (queue.length > 0) {
    const currentDirectory = queue.pop()!
    let entries
    try {
      entries = await readdir(currentDirectory, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const entryPath = join(currentDirectory, entry.name.toString())

      if (entry.isDirectory()) {
        if (isFilePathGitIgnored(entryPath + '/')) {
          continue
        }
        queue.push(entryPath)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      const fileName = entry.name.toString()
      if (
        fileName === 'page.tsx' ||
        fileName === 'page.ts' ||
        fileName === 'page.jsx' ||
        fileName === 'page.js'
      ) {
        if (!isFilePathGitIgnored(entryPath)) {
          pageFiles.push(entryPath)
        }
      }
    }
  }

  for (const pageFile of pageFiles) {
    const rel = normalizePath(relativePath(appDir, pageFile)).replace(
      /\\+/g,
      '/'
    )
    const segments = rel.split('/').filter(Boolean)

    // Drop the trailing "page.*"
    segments.pop()

    const urlSegments = segments
      .filter((segment) => !stripAppRouteGroup(segment))
      .map((segment) => segment.trim())

    const hasCatchAll = urlSegments.some(
      (segment) => segment.startsWith('[...') || segment.startsWith('[[...')
    )

    // Static route (no dynamic segments)
    const hasDynamic = urlSegments.some((segment) => segment.startsWith('['))
    if (!hasDynamic) {
      const route = normalizeRoutePath('/' + urlSegments.join('/'))
      staticPaths.add(route)
      continue
    }

    // For catch-all routes, accept any deeper path under the base prefix.
    if (hasCatchAll) {
      const baseSegments: string[] = []
      for (const segment of urlSegments) {
        if (segment.startsWith('[')) {
          break
        }
        baseSegments.push(segment)
      }
      const base = normalizeRoutePath('/' + baseSegments.join('/'))
      // Match "/base/..." (at least one segment)
      dynamicRoutePatterns.push(new RegExp(`^${escapeRegExp(base)}/.+$`))
      continue
    }

    // Single-segment dynamic routes: "/foo/[bar]" -> "/foo/<any>"
    const regexParts = urlSegments.map((segment) => {
      if (segment.startsWith('[') && segment.endsWith(']')) {
        return '[^/]+'
      }
      return escapeRegExp(segment)
    })
    const regex = new RegExp(`^/${regexParts.join('/')}$`)
    dynamicRoutePatterns.push(regex)
  }

  return { staticPaths, dynamicRoutePatterns }
}

type LinkResolution =
  | {
      status: 'internal'
      normalized: string
    }
  | {
      status: 'external' | 'anchor' | 'empty' | 'dynamic' | 'unknown-base-route'
    }

function resolveLinkTarget(
  occurrence: MDXLinkOccurrence,
  routeMap: Map<string, string>
): LinkResolution {
  if (occurrence.kind === 'dynamic') {
    return { status: 'dynamic' }
  }

  const trimmed = occurrence.url.trim()

  if (trimmed.length === 0) {
    return { status: 'empty' }
  }

  if (trimmed.startsWith('#')) {
    return { status: 'anchor' }
  }

  if (trimmed.startsWith('//') || PROTOCOL_PATTERN.test(trimmed)) {
    return { status: 'external' }
  }

  const withoutHash = trimmed.split('#')[0]
  const withoutQuery = withoutHash.split('?')[0]

  if (withoutQuery.length === 0) {
    return { status: 'empty' }
  }

  if (withoutQuery.startsWith('/')) {
    return { status: 'internal', normalized: normalizeRoutePath(withoutQuery) }
  }

  const baseRoute = routeMap.get(normalizeFilePath(occurrence.filePath))
  if (!baseRoute) {
    return { status: 'unknown-base-route' }
  }

  const baseForUrl = baseRoute.endsWith('/') ? baseRoute : `${baseRoute}/`

  try {
    const { pathname } = new URL(
      withoutQuery,
      `https://renoun.local${baseForUrl}`
    )
    return { status: 'internal', normalized: normalizeRoutePath(pathname) }
  } catch {
    return { status: 'unknown-base-route' }
  }
}
function normalizeRoutePath(path: string) {
  if (!path) {
    return '/'
  }
  let normalized = path.replace(/\/+/g, '/').trim()
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`
  }
  normalized = trimTrailingSlashes(normalized)
  if (normalized === '') {
    normalized = '/'
  }
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

function normalizeFilePath(filePath: string) {
  return normalizePath(resolvePath(filePath))
}

function normalizeBaseUrl(url: string) {
  const parsed = new URL(url)
  parsed.hash = ''
  return parsed.toString()
}

function isLikelyUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function formatLinkPosition(position?: LinkPosition) {
  if (
    !position ||
    (position.line === undefined && position.column === undefined)
  ) {
    return ''
  }

  const line = position.line ?? 0
  const column = position.column ?? 0
  return `:${line}:${column}`
}

async function runLiveValidation(
  baseUrl: string
): Promise<LiveValidationResult> {
  await waitForServerReady(baseUrl)

  const visitedPages = new Set<string>()
  const checkedLinks = new Set<string>()
  const brokenLinks: LiveBrokenLink[] = []
  const baseOrigin = new URL(baseUrl).origin

  async function crawl(url: string, trace: string[]): Promise<void> {
    const normalizedUrl = normalizeBaseUrl(url)
    if (visitedPages.has(normalizedUrl)) {
      return
    }

    visitedPages.add(normalizedUrl)
    const currentTrace = [...trace, normalizedUrl]

    try {
      const response = await fetch(normalizedUrl)
      if (!response.ok) {
        brokenLinks.push({
          url: normalizedUrl,
          originUrl: trace.at(-1) ?? normalizedUrl,
          html: '',
          status: response.status,
          trace: currentTrace,
        })
        return
      }

      const resolvedUrl = normalizeBaseUrl(response.url)
      if (!visitedPages.has(resolvedUrl)) {
        visitedPages.add(resolvedUrl)
      }

      const html = await response.text()
      const links = extractLinksFromHtml(html, resolvedUrl)

      const internalLinks = links.filter((link) =>
        isSameOrigin(link.url, baseOrigin)
      )
      await Promise.all(
        links.map((link) =>
          checkLiveLink(link, checkedLinks, brokenLinks, currentTrace)
        )
      )

      for (const link of internalLinks) {
        await crawl(link.url, currentTrace)
      }
    } catch (error) {
      brokenLinks.push({
        url: normalizedUrl,
        originUrl: trace.at(-1) ?? normalizedUrl,
        html: '',
        status: error instanceof Error ? error.message : 'network error',
        trace: currentTrace,
      })
    }
  }

  await crawl(baseUrl, [])

  return {
    brokenLinks,
    checkedLinks: checkedLinks.size,
    visitedPages: visitedPages.size,
  }
}

async function waitForServerReady(baseUrl: string) {
  const deadline = Date.now() + MAX_WAIT_TIME

  while (Date.now() <= deadline) {
    try {
      const response = await fetch(baseUrl, { method: 'GET' })
      if (response.ok) {
        return
      }
    } catch {
      // ignore
    }
    await delay(PING_INTERVAL)
  }

  throw new Error(
    `Server at ${baseUrl} did not respond within ${MAX_WAIT_TIME / 1000}s`
  )
}

function extractLinksFromHtml(html: string, originUrl: string): LiveLink[] {
  const links: LiveLink[] = []
  const anchorPattern = /<a[^>]*href=("|')(.*?)(\1)[^>]*>(.*?)<\/a>/gis
  let match: RegExpExecArray | null

  while ((match = anchorPattern.exec(html)) !== null) {
    const href = match[2]?.trim()
    if (!href || href.startsWith('#')) {
      continue
    }

    const hrefLower = href.toLowerCase()
    if (
      hrefLower.startsWith('javascript:') ||
      hrefLower.startsWith('data:') ||
      hrefLower.startsWith('vbscript:') ||
      hrefLower.startsWith('mailto:') ||
      hrefLower.startsWith('tel:')
    ) {
      continue
    }

    let absoluteUrl: string
    try {
      absoluteUrl = new URL(href, originUrl).toString()
    } catch {
      continue
    }

    links.push({
      url: absoluteUrl,
      originUrl,
      html: match[0] ?? '',
    })
  }

  return links
}

async function checkLiveLink(
  link: LiveLink,
  checked: Set<string>,
  brokenLinks: LiveBrokenLink[],
  trace: string[]
) {
  const normalized = normalizeBaseUrl(link.url)
  if (checked.has(normalized)) {
    return
  }
  checked.add(normalized)

  try {
    const response = await fetch(normalized)
    if (!response.ok) {
      brokenLinks.push({
        url: normalized,
        originUrl: link.originUrl,
        html: link.html,
        status: response.status,
        trace,
      })
    }
  } catch (error) {
    brokenLinks.push({
      url: normalized,
      originUrl: link.originUrl,
      html: link.html,
      status: error instanceof Error ? error.message : 'network error',
      trace,
    })
  }
}

function isSameOrigin(url: string, baseOrigin: string) {
  try {
    return new URL(url).origin === baseOrigin
  } catch {
    return false
  }
}
