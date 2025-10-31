import { readFile, readdir } from 'node:fs/promises'
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

import { isFilePathGitIgnored } from '../utils/is-file-path-git-ignored.js'
import { getRootDirectory } from '../utils/get-root-directory.js'

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
  const { positional, showHelp } = parseValidateArguments(rawArgs)

  if (showHelp) {
    printValidateHelp()
    return
  }

  const workspaceRoot = getRootDirectory()
  const normalizedCwd = normalizePath(process.cwd())
  const normalizedRoot = normalizePath(workspaceRoot)

  if (normalizedCwd !== normalizedRoot) {
    process.chdir(workspaceRoot)
  }

  let exitCode = 0

  if (!positional) {
    // Static validation across the entire workspace
    console.log('Static link validation')
    console.log('──────────────────────')
    exitCode = await runStaticAndReport(workspaceRoot)
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
    const targetDirectory = resolvePath(positional)
    console.log('Static link validation')
    console.log('──────────────────────')
    exitCode = await runStaticAndReport(targetDirectory)
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
      `  • Without arguments, runs static MDX link validation across the workspace.\n` +
      `  • With a directory path, validates only MDX files under that directory.\n` +
      `  • With a URL, crawls the running site and validates links.\n` +
      `\n` +
      `Options:\n` +
      `  -h, --help      Show this usage information.`
  )
}
async function runStaticValidation(
  rootDirectory: string
): Promise<StaticValidationResult> {
  const mdxFiles = await collectWorkspaceFiles(rootDirectory, MDX_EXTENSIONS)

  const { validPaths, fileRouteMap } = collectStaticRoutes(
    mdxFiles,
    rootDirectory
  )

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

      if (!validPaths.has(normalized)) {
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

function collectStaticRoutes(
  mdxFiles: string[],
  rootDirectory: string
): StaticCollectionResult {
  const validPaths = new Set<string>()
  const fileRouteMap = new Map<string, string>()

  validPaths.add('/')

  for (const filePath of mdxFiles) {
    const route = computeRouteFromFilePath(filePath, rootDirectory)
    fileRouteMap.set(normalizeFilePath(filePath), route)
    validPaths.add(route)
  }

  return { validPaths, fileRouteMap }
}

function computeRouteFromFilePath(
  filePath: string,
  rootDirectory: string
): string {
  // Create a probable route from file path by removing numeric prefixes and extensions.
  let relative = relativePath(rootDirectory, filePath)
  relative = relative.replace(/\\+/g, '/').replace(/^\.\/?/, '')

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
  normalized = normalized.replace(/\/+$/, '')
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
