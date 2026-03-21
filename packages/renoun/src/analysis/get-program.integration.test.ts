import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { getCachedFileExports } from './cached-analysis.ts'
import { disposeAnalysisWatchers, getProgram } from './get-program.ts'

describe('analysis getProgram integration', () => {
  afterEach(() => {
    disposeAnalysisWatchers()
  })

  test('uses a filesystem-backed project when tsconfig is missing', async () => {
    const workspacePath = mkdtempSync(join(tmpdir(), 'renoun-get-program-'))
    const filePath = join(workspacePath, 'src', 'index.ts')
    const tsConfigFilePath = join(workspacePath, 'tsconfig.json')

    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, 'export const value = 1\n')

    try {
      const project = getProgram({ tsConfigFilePath })

      const sourceFile = project.addSourceFileAtPath(filePath)
      const exports = await getCachedFileExports(project, filePath)

      expect(sourceFile.getFilePath()).toBe(filePath)
      expect(exports.map((entry) => entry.name)).toContain('value')
    } finally {
      rmSync(workspacePath, { recursive: true, force: true })
    }
  })
})
