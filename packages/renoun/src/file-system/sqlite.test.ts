import { expect, test } from 'vitest'

import {
  loadSqliteModule,
  shouldSuppressSqliteExperimentalWarning,
} from './sqlite.ts'

test('suppresses only the first exact sqlite experimental warning', () => {
  expect(
    shouldSuppressSqliteExperimentalWarning([
      'SQLite is an experimental feature and might change at any time',
      'ExperimentalWarning',
    ])
  ).toBe(true)

  expect(
    shouldSuppressSqliteExperimentalWarning(
      [
        'SQLite is an experimental feature and might change at any time',
        'ExperimentalWarning',
      ],
      { alreadySuppressed: true }
    )
  ).toBe(false)
})

test('does not suppress unrelated warnings', () => {
  expect(
    shouldSuppressSqliteExperimentalWarning([
      'Something else is experimental',
      'ExperimentalWarning',
    ])
  ).toBe(false)

  expect(
    shouldSuppressSqliteExperimentalWarning([
      'SQLite is an experimental feature and might change at any time',
      'DeprecationWarning',
    ])
  ).toBe(false)
})

test('restores process.emitWarning after loading sqlite module', async () => {
  const originalEmitWarning = process.emitWarning

  await loadSqliteModule()

  expect(process.emitWarning).toBe(originalEmitWarning)
})
