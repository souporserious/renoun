#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join, posix, resolve, win32 } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

import { createOutputParser } from './bench-site-build-output.mjs'

export const DEFAULT_FILTER = '@apps/site'
const DEFAULT_COLD_RUNS = 1
const DEFAULT_WARM_RUNS = 2
const DEFAULT_SQLITE_CLEAN_PATHS = [
  '.renoun/cache/fs-cache.sqlite',
  '.renoun/cache/fs-cache.sqlite-shm',
  '.renoun/cache/fs-cache.sqlite-wal',
  '.renoun/cache/fs-cache.sqlite-journal',
]
const DEFAULT_TURBO_REMOTE_CACHE_ENV_KEYS = [
  'TURBO_API',
  'TURBO_CACHE',
  'TURBO_CACHE_DIR',
  'TURBO_LOGIN',
  'TURBO_PREFLIGHT',
  'TURBO_REMOTE_CACHE_READ_ONLY',
  'TURBO_REMOTE_CACHE_SIGNATURE_KEY',
  'TURBO_REMOTE_CACHE_TIMEOUT',
  'TURBO_REMOTE_CACHE_UPLOAD_TIMEOUT',
  'TURBO_REMOTE_ONLY',
  'TURBO_TEAM',
  'TURBO_TEAMID',
  'TURBO_TOKEN',
]
const DEFAULT_WORKSPACE_CLEAN_PATHS = [
  '.turbo',
  ...DEFAULT_SQLITE_CLEAN_PATHS,
]
const DEFAULT_TARGET_CLEAN_PATHS = [
  '.next',
  'out',
  ...DEFAULT_SQLITE_CLEAN_PATHS,
]

function printHelp() {
  console.log(`Usage: node ./scripts/bench-site-build.mjs [options]

Runs deterministic cold/warm workspace builds and prints timing + cache stats.

Options:
  --filter <name>        pnpm filter value (default: ${DEFAULT_FILTER})
  --cold-runs <n>        number of cold runs (default: ${DEFAULT_COLD_RUNS})
  --warm-runs <n>        number of warm runs after cold run(s) (default: ${DEFAULT_WARM_RUNS})
  --clean-path <path>    additional path to remove before each cold run (repeatable; required for non-default filters)
  --cache-stats          enable cache hit/miss parsing via RENOUN_DEBUG=debug (default)
  --no-cache-stats       disable cache hit/miss parsing
  --verbose              stream build output while running
  --dry-run              print planned runs without executing builds
  --json <path>          write full benchmark report as JSON
  --help                 show this message
`)
}

function parsePositiveInteger(value, flagName) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for ${flagName}: "${value}"`)
  }
  return parsed
}

function parseArgs(argv) {
  const parsed = {
    filter: DEFAULT_FILTER,
    coldRuns: DEFAULT_COLD_RUNS,
    warmRuns: DEFAULT_WARM_RUNS,
    cleanPaths: [],
    cacheStats: true,
    verbose: false,
    dryRun: false,
    jsonPath: undefined,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--help') {
      printHelp()
      process.exit(0)
    }

    if (arg === '--filter') {
      const value = argv[++index]
      if (!value) {
        throw new Error('Missing value for --filter')
      }
      parsed.filter = value
      continue
    }

    if (arg === '--cold-runs') {
      const value = argv[++index]
      if (!value) {
        throw new Error('Missing value for --cold-runs')
      }
      parsed.coldRuns = parsePositiveInteger(value, '--cold-runs')
      continue
    }

    if (arg === '--warm-runs') {
      const value = argv[++index]
      if (!value) {
        throw new Error('Missing value for --warm-runs')
      }
      parsed.warmRuns = parsePositiveInteger(value, '--warm-runs')
      continue
    }

    if (arg === '--clean-path') {
      const value = argv[++index]
      if (!value) {
        throw new Error('Missing value for --clean-path')
      }
      parsed.cleanPaths.push(value)
      continue
    }

    if (arg === '--cache-stats') {
      parsed.cacheStats = true
      continue
    }

    if (arg === '--no-cache-stats') {
      parsed.cacheStats = false
      continue
    }

    if (arg === '--verbose') {
      parsed.verbose = true
      continue
    }

    if (arg === '--dry-run') {
      parsed.dryRun = true
      continue
    }

    if (arg === '--json') {
      const value = argv[++index]
      if (!value) {
        throw new Error('Missing value for --json')
      }
      parsed.jsonPath = value
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return parsed
}

export async function resolveDefaultCleanPaths({ projectRoot, filter }) {
  if (filter !== DEFAULT_FILTER) {
    throw new Error(
      `Default clean paths are only defined for "${DEFAULT_FILTER}". ` +
        `Pass one or more --clean-path values for "${filter}".`
    )
  }

  return [
    ...DEFAULT_WORKSPACE_CLEAN_PATHS,
    ...DEFAULT_TARGET_CLEAN_PATHS.map((cleanPath) =>
      join('apps/site', cleanPath)
    ),
  ]
}

function average(values) {
  if (values.length === 0) {
    return undefined
  }
  const total = values.reduce((sum, value) => sum + value, 0)
  return total / values.length
}

function median(values) {
  if (values.length === 0) {
    return undefined
  }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

function toFixed(value, digits = 3) {
  if (value === undefined || Number.isNaN(value)) {
    return 'n/a'
  }
  return value.toFixed(digits)
}

function toPercent(value, digits = 1) {
  if (value === undefined || Number.isNaN(value)) {
    return 'n/a'
  }
  return `${value.toFixed(digits)}%`
}

function getPathApi(platform = process.platform) {
  return platform === 'win32' ? win32 : posix
}

export function resolveCleanPathForRemoval({
  projectRoot,
  cleanPath,
  platform = process.platform,
}) {
  const pathApi = getPathApi(platform)
  const resolvedProjectRoot = pathApi.resolve(projectRoot)
  const absolutePath = pathApi.resolve(resolvedProjectRoot, cleanPath)
  const relativeToProjectRoot = pathApi.relative(
    resolvedProjectRoot,
    absolutePath
  )
  const isOutsideProjectRoot =
    relativeToProjectRoot === '..' ||
    relativeToProjectRoot.startsWith(`..${pathApi.sep}`) ||
    pathApi.isAbsolute(relativeToProjectRoot)

  if (
    absolutePath === resolvedProjectRoot ||
    absolutePath === pathApi.parse(absolutePath).root ||
    isOutsideProjectRoot
  ) {
    throw new Error(
      `Refusing to remove clean path outside workspace: ${cleanPath} -> ${absolutePath}`
    )
  }

  return absolutePath
}

async function cleanPaths(projectRoot, cleanPaths) {
  for (const cleanPath of cleanPaths) {
    const absolutePath = resolveCleanPathForRemoval({
      projectRoot,
      cleanPath,
    })
    await rm(absolutePath, { recursive: true, force: true })
  }
}

export function resolveBuildInvocation({
  projectRoot,
  filter,
  platform = process.platform,
}) {
  const pnpmCommand = platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

  if (filter === DEFAULT_FILTER) {
    return {
      command: pnpmCommand,
      args: ['build', `--filter=${filter}`],
    }
  }

  return {
    command: pnpmCommand,
    args: ['--filter', filter, 'build'],
  }
}

export function createBuildEnvironment({
  cacheStats,
  parentEnv = process.env,
}) {
  const env = { ...parentEnv }

  for (const envKey of DEFAULT_TURBO_REMOTE_CACHE_ENV_KEYS) {
    delete env[envKey]
  }

  return {
    ...env,
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    RENOUN_DEBUG: cacheStats ? 'debug' : '0',
    TURBO_CACHE: 'local:rw',
  }
}

async function runBuild({
  projectRoot,
  filter,
  runName,
  cacheStats,
  verbose,
  logsDirectory,
}) {
  const parser = createOutputParser()
  const logPath = join(logsDirectory, `${runName}.log`)
  const logStream = createWriteStream(logPath, { encoding: 'utf8' })
  const { command, args } = resolveBuildInvocation({ projectRoot, filter })
  const env = createBuildEnvironment({ cacheStats })

  const startedAt = performance.now()
  let spawnError

  const result = await new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      parser.write(text)
      logStream.write(text)
      if (verbose) {
        process.stdout.write(text)
      }
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      parser.write(text)
      logStream.write(text)
      if (verbose) {
        process.stderr.write(text)
      }
    })

    child.on('error', (error) => {
      spawnError = error
    })

    child.on('close', (code, signal) => {
      resolvePromise({
        code: code ?? 1,
        signal: signal ?? null,
      })
    })
  })

  logStream.end()

  const wallSeconds = (performance.now() - startedAt) / 1000
  const parsed = parser.finish()
  const totalCacheLookups = parsed.cacheHits + parsed.cacheMisses
  const cacheHitRate =
    totalCacheLookups > 0
      ? (parsed.cacheHits / totalCacheLookups) * 100
      : undefined

  return {
    runName,
    command: `${command} ${args.join(' ')}`,
    wallSeconds,
    compileSeconds: parsed.compileSeconds,
    staticSeconds: parsed.staticSeconds,
    routeTotal: parsed.routeTotal,
    cacheHits: parsed.cacheHits,
    cacheMisses: parsed.cacheMisses,
    cacheSets: parsed.cacheSets,
    cacheClears: parsed.cacheClears,
    cacheHitRate,
    exitCode: result.code,
    signal: result.signal,
    spawnError: spawnError ? String(spawnError) : undefined,
    logPath,
    lastLines: parsed.lastLines,
  }
}

function printRunSummary(run) {
  const parts = [
    `${run.runName}: ${toFixed(run.wallSeconds, 3)}s wall`,
    `compile=${toFixed(run.compileSeconds, 3)}s`,
    `static=${toFixed(run.staticSeconds, 3)}s`,
  ]

  if (run.cacheHits + run.cacheMisses > 0) {
    parts.push(
      `cache=${run.cacheHits}/${run.cacheMisses} hit/miss (${toPercent(
        run.cacheHitRate,
        1
      )})`
    )
  } else {
    parts.push('cache=n/a')
  }

  console.log(`- ${parts.join(' | ')}`)
}

function printFinalSummary(coldRuns, warmRuns) {
  const coldWallMedian = median(coldRuns.map((run) => run.wallSeconds))
  const warmWallMedian = median(warmRuns.map((run) => run.wallSeconds))
  const coldStaticMedian = median(
    coldRuns
      .map((run) => run.staticSeconds)
      .filter((value) => value !== undefined)
  )
  const warmStaticMedian = median(
    warmRuns
      .map((run) => run.staticSeconds)
      .filter((value) => value !== undefined)
  )
  const warmCacheHitRateAverage = average(
    warmRuns
      .map((run) => run.cacheHitRate)
      .filter((value) => value !== undefined)
  )

  const wallDelta =
    coldWallMedian !== undefined && warmWallMedian !== undefined
      ? coldWallMedian - warmWallMedian
      : undefined
  const wallDeltaPercent =
    wallDelta !== undefined && coldWallMedian
      ? (wallDelta / coldWallMedian) * 100
      : undefined
  const staticDelta =
    coldStaticMedian !== undefined && warmStaticMedian !== undefined
      ? coldStaticMedian - warmStaticMedian
      : undefined
  const staticDeltaPercent =
    staticDelta !== undefined && coldStaticMedian
      ? (staticDelta / coldStaticMedian) * 100
      : undefined

  console.log('\nSummary')
  console.log(
    `- Cold median wall: ${toFixed(coldWallMedian, 3)}s | Warm median wall: ${toFixed(
      warmWallMedian,
      3
    )}s | Delta: ${toFixed(wallDelta, 3)}s (${toPercent(wallDeltaPercent, 1)})`
  )
  console.log(
    `- Cold median static: ${toFixed(
      coldStaticMedian,
      3
    )}s | Warm median static: ${toFixed(
      warmStaticMedian,
      3
    )}s | Delta: ${toFixed(staticDelta, 3)}s (${toPercent(staticDeltaPercent, 1)})`
  )
  console.log(
    `- Warm average cache hit rate: ${toPercent(warmCacheHitRateAverage, 1)}`
  )
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const projectRoot = process.cwd()
  const defaultCleanPaths =
    options.filter === DEFAULT_FILTER
      ? await resolveDefaultCleanPaths({
          projectRoot,
          filter: options.filter,
        })
      : []
  if (options.filter !== DEFAULT_FILTER && options.cleanPaths.length === 0) {
    throw new Error(
      `Default clean paths are only defined for "${DEFAULT_FILTER}". ` +
        `Pass one or more --clean-path values for "${options.filter}".`
    )
  }
  const resolvedCleanPaths = Array.from(
    new Set([
      ...defaultCleanPaths,
      ...options.cleanPaths,
    ])
  )

  const logsDirectory = await mkdtemp(
    join(tmpdir(), 'renoun-site-cache-benchmark-')
  )

  console.log('Configuration')
  console.log(`- Workspace: ${projectRoot}`)
  console.log(`- Filter: ${options.filter}`)
  console.log(`- Cold runs: ${options.coldRuns}`)
  console.log(`- Warm runs: ${options.warmRuns}`)
  console.log(`- Clean paths: ${resolvedCleanPaths.join(', ')}`)
  console.log(`- Cache stats: ${options.cacheStats ? 'enabled' : 'disabled'}`)
  console.log(`- Logs: ${logsDirectory}`)
  console.log(`- Dry run: ${options.dryRun ? 'yes' : 'no'}`)

  if (options.dryRun) {
    const plannedRuns = [
      ...Array.from(
        { length: options.coldRuns },
        (_, index) => `cold-${index + 1}`
      ),
      ...Array.from(
        { length: options.warmRuns },
        (_, index) => `warm-${index + 1}`
      ),
    ]
    console.log(`- Planned runs: ${plannedRuns.join(', ')}`)
    return
  }

  const runs = []

  for (let index = 0; index < options.coldRuns; index += 1) {
    const runName = `cold-${index + 1}`
    console.log(`\n[${runName}] Cleaning cache state...`)
    await cleanPaths(projectRoot, resolvedCleanPaths)

    console.log(`[${runName}] Running build...`)
    const run = await runBuild({
      projectRoot,
      filter: options.filter,
      runName,
      cacheStats: options.cacheStats,
      verbose: options.verbose,
      logsDirectory,
    })

    runs.push(run)
    printRunSummary(run)

    if (run.exitCode !== 0) {
      throw new Error(
        `${run.runName} failed (exit ${run.exitCode})\n` +
          `Log: ${run.logPath}\n` +
          `${run.lastLines.slice(-40).join('\n')}`
      )
    }
  }

  for (let index = 0; index < options.warmRuns; index += 1) {
    const runName = `warm-${index + 1}`
    console.log(`\n[${runName}] Running build...`)
    const run = await runBuild({
      projectRoot,
      filter: options.filter,
      runName,
      cacheStats: options.cacheStats,
      verbose: options.verbose,
      logsDirectory,
    })

    runs.push(run)
    printRunSummary(run)

    if (run.exitCode !== 0) {
      throw new Error(
        `${run.runName} failed (exit ${run.exitCode})\n` +
          `Log: ${run.logPath}\n` +
          `${run.lastLines.slice(-40).join('\n')}`
      )
    }
  }

  const coldRuns = runs.filter((run) => run.runName.startsWith('cold-'))
  const warmRuns = runs.filter((run) => run.runName.startsWith('warm-'))
  printFinalSummary(coldRuns, warmRuns)

  const report = {
    generatedAt: new Date().toISOString(),
    workspace: projectRoot,
    options: {
      filter: options.filter,
      coldRuns: options.coldRuns,
      warmRuns: options.warmRuns,
      cacheStats: options.cacheStats,
      cleanPaths: resolvedCleanPaths,
      verbose: options.verbose,
      dryRun: options.dryRun,
      logsDirectory,
    },
    runs,
  }

  if (options.jsonPath) {
    const absoluteJsonPath = resolve(projectRoot, options.jsonPath)
    await mkdir(dirname(absoluteJsonPath), { recursive: true }).catch(() => {})
    await writeFile(absoluteJsonPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(`\nWrote JSON report: ${absoluteJsonPath}`)
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : '[bench] Unexpected benchmark error'
    )
    process.exit(1)
  })
}
