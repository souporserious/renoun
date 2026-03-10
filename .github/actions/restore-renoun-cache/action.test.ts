import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

function getIndentedBlock(actionSource: string, field: string): string[] {
  const lines = actionSource.split('\n')
  const fieldLineIndex = lines.findIndex((line) => line.trim() === `${field}: |`)

  expect(fieldLineIndex).toBeGreaterThan(-1)

  const fieldLines = lines.slice(fieldLineIndex + 1)
  const firstFieldLine = fieldLines.find((line) => line.trim().length > 0)

  if (!firstFieldLine) return []

  const fieldIndentation =
    firstFieldLine.length - firstFieldLine.trimStart().length
  const values: string[] = []

  for (const line of fieldLines) {
    if (line.trim().length === 0) continue

    const indentation = line.length - line.trimStart().length
    if (indentation < fieldIndentation) break

    values.push(line.trim())
  }

  return values
}

function getRestoreKeys(actionSource: string): string[] {
  return getIndentedBlock(actionSource, 'restore-keys')
}

function getCachePaths(actionSource: string): string[] {
  return getIndentedBlock(actionSource, 'path')
}

function getPrimaryKey(actionSource: string): string {
  const keyLine = actionSource
    .split('\n')
    .find(
      (line) =>
        line.trimStart().startsWith('key:') && line.includes('renoun-cache-')
    )

  expect(keyLine).toBeDefined()

  return keyLine!.trim()
}

describe('restore-renoun-cache action', () => {
  test('resolves cache token from the dedicated cache-token command', () => {
    const actionSource = readFileSync(
      '.github/actions/restore-renoun-cache/action.yml',
      'utf8'
    )

    expect(actionSource).toContain('node packages/renoun/src/cli/cache-token.ts')
    expect(actionSource).not.toContain(
      'node packages/renoun/src/cli/index.ts cache-token'
    )
  })

  test('uses cache action so CI restores now and saves during post-job', () => {
    const actionSource = readFileSync(
      '.github/actions/restore-renoun-cache/action.yml',
      'utf8'
    )

    expect(actionSource).toContain(
      'uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306'
    )
    expect(actionSource).not.toContain(
      'uses: actions/cache/restore@cdf6c1fa76f9f475f3d7449005a359c84ca0f306'
    )
  })

  test('caches repo and workspace SQLite databases used by app and example builds', () => {
    const actionSource = readFileSync(
      '.github/actions/restore-renoun-cache/action.yml',
      'utf8'
    )
    const cachePaths = getCachePaths(actionSource)

    expect(cachePaths).toContain('.renoun/cache/fs-cache.sqlite*')
    expect(cachePaths).toContain('apps/*/.renoun/cache/fs-cache.sqlite*')
    expect(cachePaths).toContain('examples/*/.renoun/cache/fs-cache.sqlite*')
  })

  test('uses a job-scoped save key built from a commit-scoped prefix', () => {
    const actionSource = readFileSync(
      '.github/actions/restore-renoun-cache/action.yml',
      'utf8'
    )
    const key = getPrimaryKey(actionSource)

    expect(key).toContain("${{ steps.renoun-cache-token.outputs.token }}")
    expect(key).toContain("${{ hashFiles('pnpm-lock.yaml') }}")
    expect(key).toContain('${{ github.sha }}')
    expect(key).toContain('${{ github.workflow }}')
    expect(key).toContain('${{ github.job }}')
    expect(key).not.toContain('github.run_id')
    expect(key).not.toContain('github.run_attempt')
  })

  test('keeps restore keys scoped to the lockfile hash and commit prefix', () => {
    const actionSource = readFileSync(
      '.github/actions/restore-renoun-cache/action.yml',
      'utf8'
    )
    const key = getPrimaryKey(actionSource).replace(/^key:\s*/, '')
    const restoreKeys = getRestoreKeys(actionSource)

    expect(restoreKeys.length).toBeGreaterThan(0)

    for (const restoreKey of restoreKeys) {
      expect(restoreKey).toContain("${{ hashFiles('pnpm-lock.yaml') }}")
      expect(restoreKey.endsWith('-')).toBe(true)
      expect(key.startsWith(restoreKey)).toBe(true)
    }

    expect(restoreKeys[0]).toContain('${{ github.sha }}')
  })
})
