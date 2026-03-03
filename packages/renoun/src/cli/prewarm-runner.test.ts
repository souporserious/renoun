import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

import { resolvePrewarmWorkerEntryFilePath } from './prewarm-runner.ts'

describe('resolvePrewarmWorkerEntryFilePath', () => {
  test('falls back to the TypeScript worker in source mode', () => {
    const resolvedWorkerPath = resolvePrewarmWorkerEntryFilePath()
    const jsWorkerPath = fileURLToPath(
      new URL('./prewarm.worker.js', import.meta.url)
    )
    const tsWorkerPath = fileURLToPath(
      new URL('./prewarm.worker.ts', import.meta.url)
    )

    expect(existsSync(tsWorkerPath)).toBe(true)
    expect(resolvedWorkerPath).toBeDefined()

    if (!existsSync(jsWorkerPath)) {
      expect(resolvedWorkerPath).toBe(tsWorkerPath)
    }
  })
})
