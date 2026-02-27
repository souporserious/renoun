import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname } from 'node:path'
import { performance } from 'node:perf_hooks'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { Cache } from './Cache.ts'
import { SqliteCacheStorePersistence } from './CacheSqlite.ts'
import { InMemoryFileSystem } from './InMemoryFileSystem.ts'
import { FileSystemSnapshot } from './Snapshot.ts'
import { Session } from './Session.ts'

const DIRECTORY_COUNT = 5_000
const INVALIDATION_PATH_COUNT = 96
const DEFAULT_WARMUP_ITERATIONS = 3
const DEFAULT_MEASURED_ITERATIONS = 16
const DEFAULT_MAX_MEAN_INVALIDATION_MS = 80
const DEFAULT_MAX_P95_INVALIDATION_MS = 140
const DEFAULT_MAX_DRIFT_RATIO = 3
const DEFAULT_MAX_BASELINE_DRIFT_PERCENT = 40
const DEFAULT_COMPARE_WARMUP_ITERATIONS = 1
const DEFAULT_COMPARE_MEASURED_ITERATIONS = 5
const DEFAULT_COMPARE_DIRECTORY_COUNT = 2_500
const DEFAULT_COMPARE_MISSING_METADATA_COUNT = 256
const DEFAULT_COMPARE_INVALIDATION_PATH_COUNT = INVALIDATION_PATH_COUNT

const perfGuardTest =
  process.env['RENOUN_PERF_GUARD'] === 'true' ? test : test.skip
const perfCompareTest =
  process.env['RENOUN_PERF_COMPARE_INVALIDATION'] === 'true' ? test : test.skip

function resolvePositiveIntegerEnv(key: string, fallback: number): number {
  const value = process.env[key]
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function resolvePositiveFloatEnv(key: string, fallback: number): number {
  const value = process.env[key]
  if (!value) {
    return fallback
  }

  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

interface InvalidationPerfMetrics {
  meanInvalidationMs: number
  p95InvalidationMs: number
  p95ToMeanDriftRatio: number
  measuredIterations: number
  warmupIterations: number
}

interface InvalidationComparisonMode {
  name: string
  sqlitePreparedStatementCacheMax: number
  targetedMissingDependencyFallback: boolean
}

interface InvalidationComparisonMetrics extends InvalidationPerfMetrics {
  mode: string
}

function readBaselineMetrics(path: string): InvalidationPerfMetrics | undefined {
  try {
    const rawValue = readFileSync(path, 'utf8')
    const parsed = JSON.parse(rawValue) as Partial<InvalidationPerfMetrics>
    if (
      typeof parsed.meanInvalidationMs !== 'number' ||
      typeof parsed.p95InvalidationMs !== 'number' ||
      typeof parsed.p95ToMeanDriftRatio !== 'number' ||
      typeof parsed.measuredIterations !== 'number' ||
      typeof parsed.warmupIterations !== 'number'
    ) {
      return undefined
    }

    return {
      meanInvalidationMs: parsed.meanInvalidationMs,
      p95InvalidationMs: parsed.p95InvalidationMs,
      p95ToMeanDriftRatio: parsed.p95ToMeanDriftRatio,
      measuredIterations: parsed.measuredIterations,
      warmupIterations: parsed.warmupIterations,
    }
  } catch {
    return undefined
  }
}

function writeMetrics(path: string, metrics: InvalidationPerfMetrics): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(metrics, null, 2), 'utf8')
}

async function withEnvOverrides<T>(
  overrides: Record<string, string>,
  run: () => Promise<T>
): Promise<T> {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key])
    process.env[key] = value
  }

  try {
    return await run()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

function computePercentDrift(currentValue: number, baselineValue: number): number {
  if (baselineValue <= 0) {
    return 0
  }

  return ((currentValue - baselineValue) / baselineValue) * 100
}

function createFixtureFiles(directoryCount: number = DIRECTORY_COUNT): Record<string, string> {
  const files: Record<string, string> = {}
  for (let directoryIndex = 0; directoryIndex < directoryCount; directoryIndex += 1) {
    files[`src/feature-${directoryIndex}/index.ts`] = `export const value = ${directoryIndex}`
  }

  return files
}

function createInvalidationPaths(
  invalidationPathCount: number = INVALIDATION_PATH_COUNT
): string[] {
  return Array.from({ length: invalidationPathCount }, (_value, index) => {
    return `src/feature-${index}/nested/file.ts`
  })
}

function createSessionWithDirectorySnapshots(
  files: Record<string, string>,
  directoryCount: number = DIRECTORY_COUNT
): Session {
  const fileSystem = new InMemoryFileSystem(files)
  const session = Session.for(fileSystem)

  for (let directoryIndex = 0; directoryIndex < directoryCount; directoryIndex += 1) {
    const snapshotKey = session.createDirectorySnapshotKey({
      directoryPath: `src/feature-${directoryIndex}`,
      mask: 1,
      filterSignature: 'perf:all',
      sortSignature: 'perf:none',
    })

    session.directorySnapshots.set(snapshotKey, {
      path: `src/feature-${directoryIndex}`,
    } as any)
  }

  return session
}

function computeMean(samples: readonly number[]): number {
  if (samples.length === 0) {
    return 0
  }

  return samples.reduce((sum, sample) => sum + sample, 0) / samples.length
}

function computePercentile(samples: readonly number[], percentile: number): number {
  if (samples.length === 0) {
    return 0
  }

  const sorted = [...samples].sort((first, second) => first - second)
  const clampedPercentile = Math.min(100, Math.max(0, percentile))
  const position = (clampedPercentile / 100) * (sorted.length - 1)
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const lowerValue = sorted[lowerIndex] ?? 0
  const upperValue = sorted[upperIndex] ?? lowerValue

  if (lowerIndex === upperIndex) {
    return lowerValue
  }

  const weight = position - lowerIndex
  return lowerValue + (upperValue - lowerValue) * weight
}

async function createPersistedSession(options: {
  directoryCount: number
  missingMetadataCount: number
  databasePath: string
  snapshotId: string
  targetedMissingDependencyFallback: boolean
}): Promise<Session> {
  const fixtureFiles = createFixtureFiles(options.directoryCount)
  const fileSystem = new InMemoryFileSystem(fixtureFiles)
  const snapshot = new FileSystemSnapshot(fileSystem, options.snapshotId)
  const session = Session.for(
    fileSystem,
    snapshot,
    new Cache({
      targetedMissingDependencyFallback:
        options.targetedMissingDependencyFallback,
      persistence: new SqliteCacheStorePersistence({
        dbPath: options.databasePath,
      }),
    })
  )

  for (
    let directoryIndex = 0;
    directoryIndex < options.directoryCount;
    directoryIndex += 1
  ) {
    const depPath = `src/feature-${directoryIndex}/index.ts`
    const depVersion = await snapshot.contentId(depPath)

    await session.cache.put(
      `analysis:persisted:${directoryIndex}`,
      {
        directoryIndex,
      },
      {
        persist: true,
        deps: [
          {
            depKey: `file:${depPath}`,
            depVersion,
          },
        ],
      }
    )
  }

  for (
    let missingIndex = 0;
    missingIndex < options.missingMetadataCount;
    missingIndex += 1
  ) {
    await session.cache.put(
      `analysis:missing:${missingIndex}`,
      {
        missingIndex,
      },
      {
        persist: true,
        deps: [],
      }
    )
  }

  return session
}

async function measurePersistedInvalidationMode(options: {
  mode: InvalidationComparisonMode
  warmupIterations: number
  measuredIterations: number
  directoryCount: number
  missingMetadataCount: number
  invalidationPaths: string[]
}): Promise<InvalidationComparisonMetrics> {
  const durations: number[] = []
  const totalIterations = options.warmupIterations + options.measuredIterations

  for (let iteration = 0; iteration < totalIterations; iteration += 1) {
    const tmpDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-cache-invalidation-perf-compare-')
    )
    const databasePath = join(tmpDirectory, 'fs-cache.sqlite')

    try {
      const elapsedMs = await withEnvOverrides(
        {
          RENOUN_SQLITE_PREPARED_STATEMENT_CACHE_MAX: String(
            options.mode.sqlitePreparedStatementCacheMax
          ),
        },
        async () => {
          const session = await createPersistedSession({
            directoryCount: options.directoryCount,
            missingMetadataCount: options.missingMetadataCount,
            databasePath,
            snapshotId: `perf-compare:${options.mode.name}:${iteration}`,
            targetedMissingDependencyFallback:
              options.mode.targetedMissingDependencyFallback,
          })

          const startedAt = performance.now()
          session.invalidatePaths(options.invalidationPaths)
          await session.waitForPendingInvalidations()
          return performance.now() - startedAt
        }
      )

      if (iteration >= options.warmupIterations) {
        durations.push(elapsedMs)
      }
    } finally {
      rmSync(tmpDirectory, { recursive: true, force: true })
    }
  }

  const meanInvalidationMs = computeMean(durations)
  const p95InvalidationMs = computePercentile(durations, 95)
  const p95ToMeanDriftRatio =
    p95InvalidationMs / Math.max(meanInvalidationMs, Number.EPSILON)

  return {
    mode: options.mode.name,
    meanInvalidationMs,
    p95InvalidationMs,
    p95ToMeanDriftRatio,
    measuredIterations: options.measuredIterations,
    warmupIterations: options.warmupIterations,
  }
}

describe('cache invalidation perf guard', () => {
  perfGuardTest(
    'invalidates indexed directory snapshots within p95/mean guardrails',
    () => {
      const fixtureFiles = createFixtureFiles()
      const invalidationPaths = createInvalidationPaths()
      const warmupIterations = resolvePositiveIntegerEnv(
        'RENOUN_PERF_GUARD_WARMUP_ITERATIONS',
        DEFAULT_WARMUP_ITERATIONS
      )
      const measuredIterations = resolvePositiveIntegerEnv(
        'RENOUN_PERF_GUARD_ITERATIONS',
        DEFAULT_MEASURED_ITERATIONS
      )

      const measuredDurations: number[] = []
      const totalIterations = warmupIterations + measuredIterations

      for (let iteration = 0; iteration < totalIterations; iteration += 1) {
        const session = createSessionWithDirectorySnapshots(fixtureFiles)

        const startedAt = performance.now()
        session.invalidatePaths(invalidationPaths)
        const elapsedMs = performance.now() - startedAt

        expect(session.directorySnapshots.size).toBeLessThan(DIRECTORY_COUNT)

        if (iteration >= warmupIterations) {
          measuredDurations.push(elapsedMs)
        }
      }

      const meanInvalidationMs = computeMean(measuredDurations)
      const p95InvalidationMs = computePercentile(measuredDurations, 95)
      const p95ToMeanDriftRatio =
        p95InvalidationMs / Math.max(meanInvalidationMs, Number.EPSILON)
      const metrics: InvalidationPerfMetrics = {
        meanInvalidationMs,
        p95InvalidationMs,
        p95ToMeanDriftRatio,
        measuredIterations,
        warmupIterations,
      }

      const maxMeanInvalidationMs = resolvePositiveFloatEnv(
        'RENOUN_PERF_GUARD_MAX_MEAN_MS',
        DEFAULT_MAX_MEAN_INVALIDATION_MS
      )
      const maxP95InvalidationMs = resolvePositiveFloatEnv(
        'RENOUN_PERF_GUARD_MAX_P95_MS',
        DEFAULT_MAX_P95_INVALIDATION_MS
      )
      const maxDriftRatio = resolvePositiveFloatEnv(
        'RENOUN_PERF_GUARD_MAX_DRIFT_RATIO',
        DEFAULT_MAX_DRIFT_RATIO
      )
      const metricsOutputPath = process.env['RENOUN_PERF_GUARD_METRICS_PATH']
      if (metricsOutputPath) {
        writeMetrics(metricsOutputPath, metrics)
      }

      const baselinePath = process.env['RENOUN_PERF_GUARD_BASELINE_PATH']
      if (baselinePath) {
        const baselineMetrics = readBaselineMetrics(baselinePath)
        if (baselineMetrics) {
          const maxBaselineDriftPercent = resolvePositiveFloatEnv(
            'RENOUN_PERF_GUARD_MAX_BASELINE_DRIFT_PERCENT',
            DEFAULT_MAX_BASELINE_DRIFT_PERCENT
          )
          const meanDriftPercent = computePercentDrift(
            meanInvalidationMs,
            baselineMetrics.meanInvalidationMs
          )
          const p95DriftPercent = computePercentDrift(
            p95InvalidationMs,
            baselineMetrics.p95InvalidationMs
          )

          expect(meanDriftPercent).toBeLessThan(maxBaselineDriftPercent)
          expect(p95DriftPercent).toBeLessThan(maxBaselineDriftPercent)
        }
      }

      expect(meanInvalidationMs).toBeLessThan(maxMeanInvalidationMs)
      expect(p95InvalidationMs).toBeLessThan(maxP95InvalidationMs)
      expect(p95ToMeanDriftRatio).toBeLessThan(maxDriftRatio)
    },
    120_000
  )
})

describe('cache invalidation optimization comparison', () => {
  perfCompareTest(
    'reports persisted invalidation performance by optimization mode',
    async () => {
      const warmupIterations = resolvePositiveIntegerEnv(
        'RENOUN_PERF_COMPARE_WARMUP_ITERATIONS',
        DEFAULT_COMPARE_WARMUP_ITERATIONS
      )
      const measuredIterations = resolvePositiveIntegerEnv(
        'RENOUN_PERF_COMPARE_ITERATIONS',
        DEFAULT_COMPARE_MEASURED_ITERATIONS
      )
      const directoryCount = resolvePositiveIntegerEnv(
        'RENOUN_PERF_COMPARE_DIRECTORY_COUNT',
        DEFAULT_COMPARE_DIRECTORY_COUNT
      )
      const missingMetadataCount = resolvePositiveIntegerEnv(
        'RENOUN_PERF_COMPARE_MISSING_METADATA_COUNT',
        DEFAULT_COMPARE_MISSING_METADATA_COUNT
      )
      const compareInvalidationPathCount = resolvePositiveIntegerEnv(
        'RENOUN_PERF_COMPARE_INVALIDATION_PATH_COUNT',
        DEFAULT_COMPARE_INVALIDATION_PATH_COUNT
      )

      const invalidationPaths = createInvalidationPaths(
        Math.min(compareInvalidationPathCount, directoryCount)
      )

      const comparisonModes: InvalidationComparisonMode[] = [
        {
          name: 'baseline',
          targetedMissingDependencyFallback: false,
          sqlitePreparedStatementCacheMax: 1,
        },
        {
          name: 'prepared_statement_lru',
          targetedMissingDependencyFallback: false,
          sqlitePreparedStatementCacheMax: 128,
        },
        {
          name: 'targeted_missing_metadata',
          targetedMissingDependencyFallback: true,
          sqlitePreparedStatementCacheMax: 1,
        },
        {
          name: 'all_optimizations',
          targetedMissingDependencyFallback: true,
          sqlitePreparedStatementCacheMax: 128,
        },
      ]

      const modeMetrics: InvalidationComparisonMetrics[] = []
      for (const mode of comparisonModes) {
        modeMetrics.push(
          await measurePersistedInvalidationMode({
            mode,
            warmupIterations,
            measuredIterations,
            directoryCount,
            missingMetadataCount,
            invalidationPaths,
          })
        )
      }

      const baselineMetrics = modeMetrics.find(
        (metrics) => metrics.mode === 'baseline'
      )
      if (!baselineMetrics) {
        throw new Error('missing baseline metrics')
      }

      const comparisonSummary = modeMetrics.map((metrics) => {
        const meanImprovementPercent =
          baselineMetrics.meanInvalidationMs <= 0
            ? 0
            : ((baselineMetrics.meanInvalidationMs - metrics.meanInvalidationMs) /
                baselineMetrics.meanInvalidationMs) *
              100
        const p95ImprovementPercent =
          baselineMetrics.p95InvalidationMs <= 0
            ? 0
            : ((baselineMetrics.p95InvalidationMs - metrics.p95InvalidationMs) /
                baselineMetrics.p95InvalidationMs) *
              100

        return {
          ...metrics,
          meanImprovementPercent,
          p95ImprovementPercent,
        }
      })

      const metricsOutputPath = process.env['RENOUN_PERF_COMPARE_METRICS_PATH']
      if (metricsOutputPath) {
        mkdirSync(dirname(metricsOutputPath), { recursive: true })
        writeFileSync(
          metricsOutputPath,
          JSON.stringify({ modes: comparisonSummary }, null, 2),
          'utf8'
        )
      }

      // eslint-disable-next-line no-console
      console.log(
        '[renoun-perf] cache invalidation optimization comparison',
        JSON.stringify(comparisonSummary, null, 2)
      )

      expect(modeMetrics.length).toBe(comparisonModes.length)
      expect(modeMetrics.every((metrics) => metrics.meanInvalidationMs > 0)).toBe(
        true
      )
    },
    420_000
  )
})
