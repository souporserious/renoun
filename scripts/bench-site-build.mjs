#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'

const DEFAULT_FILTER = 'site'
const DEFAULT_COLD_RUNS = 1
const DEFAULT_WARM_RUNS = 2
const DEFAULT_CLEAN_PATHS = [
  '.renoun',
  'apps/site/.next',
  'apps/site/out',
  'apps/site/.renoun',
]

function printHelp() {
  console.log(`Usage: node ./scripts/bench-site-build.mjs [options]

Runs deterministic cold/warm @apps/site builds and prints timing + cache stats.

Options:
  --filter <name>        pnpm filter value (default: ${DEFAULT_FILTER})
  --cold-runs <n>        number of cold runs (default: ${DEFAULT_COLD_RUNS})
  --warm-runs <n>        number of warm runs after cold run(s) (default: ${DEFAULT_WARM_RUNS})
  --clean-path <path>    additional path to remove before each cold run (repeatable)
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
    cleanPaths: [...DEFAULT_CLEAN_PATHS],
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

function stripAnsi(value) {
  return value.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]/g,
    ''
  )
}

function createOutputParser() {
  let buffer = ''
  const lines = []
  let compileSeconds
  let staticSeconds
  let routeTotal
  let cacheHits = 0
  let cacheMisses = 0
  let cacheSets = 0
  let cacheClears = 0

  function processLine(rawLine) {
    const line = stripAnsi(rawLine).replace(/\u0008/g, '').trimEnd()
    if (line.length === 0) {
      return
    }

    lines.push(line)
    if (lines.length > 250) {
      lines.shift()
    }

    const compileMatch = line.match(/Compiled successfully in (\d+(?:\.\d+)?)s/i)
    if (compileMatch) {
      compileSeconds = Number.parseFloat(compileMatch[1])
    }

    const staticMatch = line.match(
      /Generating static pages(?:.*?)in (\d+(?:\.\d+)?)s/i
    )
    if (staticMatch) {
      staticSeconds = Number.parseFloat(staticMatch[1])
    }

    const routeMatch = line.match(/Generating static pages .*?\((\d+)\/(\d+)\)/i)
    if (routeMatch) {
      routeTotal = Number.parseInt(routeMatch[2], 10)
    }

    if (/\[cache\]\s+Cache hit\b/i.test(line)) {
      cacheHits += 1
    } else if (/\[cache\]\s+Cache miss\b/i.test(line)) {
      cacheMisses += 1
    } else if (/\[cache\]\s+Cache set\b/i.test(line)) {
      cacheSets += 1
    } else if (/\[cache\]\s+Cache clear\b/i.test(line)) {
      cacheClears += 1
    }
  }

  return {
    write(text) {
      const normalized = text.replace(/\r/g, '\n')
      buffer += normalized
      while (true) {
        const newlineIndex = buffer.indexOf('\n')
        if (newlineIndex === -1) {
          break
        }

        const line = buffer.slice(0, newlineIndex)
        processLine(line)
        buffer = buffer.slice(newlineIndex + 1)
      }
    },
    finish() {
      if (buffer.length > 0) {
        processLine(buffer)
        buffer = ''
      }

      return {
        compileSeconds,
        staticSeconds,
        routeTotal,
        cacheHits,
        cacheMisses,
        cacheSets,
        cacheClears,
        lastLines: [...lines],
      }
    },
  }
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

async function cleanPaths(projectRoot, cleanPaths) {
  for (const relativePath of cleanPaths) {
    const absolutePath = resolve(projectRoot, relativePath)
    await rm(absolutePath, { recursive: true, force: true })
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
  const command = 'pnpm'
  const args = ['--filter', filter, 'build']
  const env = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    RENOUN_DEBUG: cacheStats ? 'debug' : '0',
  }

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
    totalCacheLookups > 0 ? (parsed.cacheHits / totalCacheLookups) * 100 : undefined

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
    coldRuns.map((run) => run.staticSeconds).filter((value) => value !== undefined)
  )
  const warmStaticMedian = median(
    warmRuns.map((run) => run.staticSeconds).filter((value) => value !== undefined)
  )
  const warmCacheHitRateAverage = average(
    warmRuns.map((run) => run.cacheHitRate).filter((value) => value !== undefined)
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
  console.log(`- Warm average cache hit rate: ${toPercent(warmCacheHitRateAverage, 1)}`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const projectRoot = process.cwd()

  const logsDirectory = await mkdtemp(
    join(tmpdir(), 'renoun-site-cache-benchmark-')
  )

  console.log('Configuration')
  console.log(`- Workspace: ${projectRoot}`)
  console.log(`- Filter: ${options.filter}`)
  console.log(`- Cold runs: ${options.coldRuns}`)
  console.log(`- Warm runs: ${options.warmRuns}`)
  console.log(`- Cache stats: ${options.cacheStats ? 'enabled' : 'disabled'}`)
  console.log(`- Logs: ${logsDirectory}`)
  console.log(`- Dry run: ${options.dryRun ? 'yes' : 'no'}`)

  if (options.dryRun) {
    const plannedRuns = [
      ...Array.from({ length: options.coldRuns }, (_, index) => `cold-${index + 1}`),
      ...Array.from({ length: options.warmRuns }, (_, index) => `warm-${index + 1}`),
    ]
    console.log(`- Planned runs: ${plannedRuns.join(', ')}`)
    return
  }

  const runs = []

  for (let index = 0; index < options.coldRuns; index += 1) {
    const runName = `cold-${index + 1}`
    console.log(`\n[${runName}] Cleaning cache state...`)
    await cleanPaths(projectRoot, options.cleanPaths)

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
      cleanPaths: options.cleanPaths,
      verbose: options.verbose,
      dryRun: options.dryRun,
      logsDirectory,
    },
    runs,
  }

  if (options.jsonPath) {
    const absoluteJsonPath = resolve(projectRoot, options.jsonPath)
    await mkdir(dirname(absoluteJsonPath), { recursive: true }).catch(
      () => {}
    )
    await writeFile(absoluteJsonPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(`\nWrote JSON report: ${absoluteJsonPath}`)
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : '[bench] Unexpected benchmark error'
  )
  process.exit(1)
})
