import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

const SITE_PACKAGE_JSON_PATH = fileURLToPath(
  new URL('../../../../apps/site/package.json', import.meta.url)
)

describe('workspace site scripts', () => {
  test('run the built renoun CLI directly for local Node 20 compatibility', async () => {
    const packageJson = JSON.parse(
      await readFile(SITE_PACKAGE_JSON_PATH, 'utf-8')
    ) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.dev).toBe(
      'node ../../packages/renoun/dist/cli/index.js next dev --webpack'
    )
    expect(packageJson.scripts?.build).toBe(
      'node ../../packages/renoun/dist/cli/index.js next build --webpack'
    )
  })
})
