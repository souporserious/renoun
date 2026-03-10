import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'vitest'

describe('package exports', () => {
  test('keeps renoun/project as a dedicated compatibility entry point', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    ) as {
      exports?: Record<string, unknown>
    }

    expect(packageJson.exports?.['./project']).toEqual({
      types: './dist/project/client.d.ts',
      import: './dist/project/client.js',
      default: './dist/project/client.js',
    })
    expect(packageJson.exports?.['./project']).not.toEqual(
      packageJson.exports?.['./analysis']
    )
  })
})
