import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

function getRestoreKeys(actionSource: string): string[] {
  const lines = actionSource.split('\n')
  const restoreKeysLineIndex = lines.findIndex(
    (line) => line.trim() === 'restore-keys: |'
  )

  expect(restoreKeysLineIndex).toBeGreaterThan(-1)

  const restoreKeyLines = lines.slice(restoreKeysLineIndex + 1)
  const firstRestoreKeyLine = restoreKeyLines.find(
    (line) => line.trim().length > 0
  )

  if (!firstRestoreKeyLine) return []

  const restoreKeyIndentation =
    firstRestoreKeyLine.length - firstRestoreKeyLine.trimStart().length
  const restoreKeys: string[] = []

  for (const line of restoreKeyLines) {
    if (line.trim().length === 0) continue

    const indentation = line.length - line.trimStart().length
    if (indentation < restoreKeyIndentation) break

    restoreKeys.push(line.trim())
  }

  return restoreKeys
}

function getPrimaryKey(actionSource: string): string {
  const keyLine = actionSource
    .split('\n')
    .find((line) => line.trimStart().startsWith('key:'))

  expect(keyLine).toBeDefined()

  return keyLine!.trim()
}

describe('restore-renoun-cache action', () => {
  test('uses restore-only cache action to avoid redundant save attempts', () => {
    const actionSource = readFileSync(
      '.github/actions/restore-renoun-cache/action.yml',
      'utf8'
    )

    expect(actionSource).toContain(
      'uses: actions/cache/restore@cdf6c1fa76f9f475f3d7449005a359c84ca0f306'
    )
    expect(actionSource).not.toContain(
      'uses: actions/cache@cdf6c1fa76f9f475f3d7449005a359c84ca0f306'
    )
  })

  test('uses a commit-scoped cache key (incremental, no per-run identifiers)', () => {
    const actionSource = readFileSync(
      '.github/actions/restore-renoun-cache/action.yml',
      'utf8'
    )
    const key = getPrimaryKey(actionSource)

    expect(key).toContain("${{ steps.renoun-cache-token.outputs.token }}")
    expect(key).toContain("${{ hashFiles('pnpm-lock.yaml') }}")
    expect(key).toContain('${{ github.sha }}')
    expect(key).not.toContain('github.run_id')
    expect(key).not.toContain('github.run_attempt')
  })

  test('keeps restore keys scoped to the lockfile hash and key prefix', () => {
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
  })
})
