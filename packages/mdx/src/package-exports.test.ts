import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'vitest'

describe('package exports', () => {
  test('does not expose source conditions for unpublished raw source files', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    ) as {
      exports?: Record<string, Record<string, unknown>>
    }

    for (const exportEntry of Object.values(packageJson.exports ?? {})) {
      expect(exportEntry).not.toHaveProperty('source')
    }
  })
})
