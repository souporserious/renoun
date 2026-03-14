import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

function getIndentedBlock(actionSource: string, field: string): string[] {
  const lines = actionSource.split('\n')
  const fieldLineIndex = lines.findIndex(
    (line) => line.trim() === `${field}: |`
  )

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

describe('save-renoun-cache action', () => {
  test('resolves cache token from the dedicated cache-token command', () => {
    const actionSource = readFileSync(
      '.github/actions/save-renoun-cache/action.yml',
      'utf8'
    )

    expect(actionSource).toContain(
      'token="$(node --experimental-strip-types packages/renoun/src/cli/index.ts cache-token)"'
    )
    expect(actionSource).toContain('echo "token=$token" >> "$GITHUB_OUTPUT"')
  })

  test('truncates the WAL before saving the cache', () => {
    const actionSource = readFileSync(
      '.github/actions/save-renoun-cache/action.yml',
      'utf8'
    )

    expect(actionSource).toContain(
      'run: bash .github/scripts/truncate-renoun-cache.sh'
    )
    expect(actionSource).toContain(
      'uses: actions/cache/save@cdf6c1fa76f9f475f3d7449005a359c84ca0f306'
    )
  })

  test('caches repo and workspace SQLite databases used by app and example builds', () => {
    const actionSource = readFileSync(
      '.github/actions/save-renoun-cache/action.yml',
      'utf8'
    )
    const cachePaths = getCachePaths(actionSource)

    expect(cachePaths).toContain('.renoun/cache/fs-cache.sqlite*')
    expect(cachePaths).toContain('apps/*/.renoun/cache/fs-cache.sqlite*')
    expect(cachePaths).toContain('examples/*/.renoun/cache/fs-cache.sqlite*')
  })

  test('uses the same workflow and job scoped cache key as restore', () => {
    const actionSource = readFileSync(
      '.github/actions/save-renoun-cache/action.yml',
      'utf8'
    )
    const key = getPrimaryKey(actionSource)

    expect(key).toContain('${{ github.workflow }}')
    expect(key).toContain('${{ github.job }}')
    expect(key).toContain('${{ steps.renoun-cache-token.outputs.token }}')
    expect(key).toContain("${{ hashFiles('pnpm-lock.yaml') }}")
    expect(key).toContain('${{ github.sha }}')
  })
})
