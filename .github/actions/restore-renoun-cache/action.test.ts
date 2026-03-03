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

describe('restore-renoun-cache action', () => {
  test('keeps restore keys scoped to the lockfile hash', () => {
    const actionSource = readFileSync(
      '.github/actions/restore-renoun-cache/action.yml',
      'utf8'
    )
    const restoreKeys = getRestoreKeys(actionSource)

    expect(restoreKeys.length).toBeGreaterThan(0)

    for (const restoreKey of restoreKeys) {
      expect(restoreKey).toContain("${{ hashFiles('pnpm-lock.yaml') }}")
    }
  })
})
