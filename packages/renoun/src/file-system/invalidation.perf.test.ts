import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { performance } from 'node:perf_hooks'

import { describe, expect, test } from 'vitest'

import { InMemoryFileSystem } from './InMemoryFileSystem.ts'
import { Session } from './Session.ts'

const DIRECTORY_COUNT = 5_000
const INVALIDATION_PATH_COUNT = 96
const DEFAULT_WARMUP_ITERATIONS = 3
const DEFAULT_MEASURED_ITERATIONS = 16
const DEFAULT_MAX_MEAN_INVALIDATION_MS = 80
const DEFAULT_MAX_P95_INVALIDATION_MS = 140
const DEFAULT_MAX_DRIFT_RATIO = 3
const DEFAULT_MAX_BASELINE_DRIFT_PERCENT = 40

const perfGuardTest =
  process.env['RENOUN_PERF_GUARD'] === 'true' ? test : test.skip

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

function computePercentDrift(currentValue: number, baselineValue: number): number {
  if (baselineValue <= 0) {
    return 0
  }

  return ((currentValue - baselineValue) / baselineValue) * 100
}

function createFixtureFiles(): Record<string, string> {
  const files: Record<string, string> = {}
  for (let directoryIndex = 0; directoryIndex < DIRECTORY_COUNT; directoryIndex += 1) {
    files[`src/feature-${directoryIndex}/index.ts`] = `export const value = ${directoryIndex}`
  }

  return files
}

function createInvalidationPaths(): string[] {
  return Array.from({ length: INVALIDATION_PATH_COUNT }, (_value, index) => {
    return `src/feature-${index}/nested/file.ts`
  })
}

function createSessionWithDirectorySnapshots(files: Record<string, string>): Session {
  const fileSystem = new InMemoryFileSystem(files)
  const session = Session.for(fileSystem)

  for (let directoryIndex = 0; directoryIndex < DIRECTORY_COUNT; directoryIndex += 1) {
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
