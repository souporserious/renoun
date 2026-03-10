import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

const relativeTypeScriptSpecifierPattern =
  /(?:from\s+|import\s+)(['"])(\.\.?\/[^'"]+\.(?:cts|mts|ts|tsx))\1/g

async function collectPublishedSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const filePath = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectPublishedSourceFiles(filePath)))
      continue
    }

    if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts')
    ) {
      files.push(filePath)
    }
  }

  return files
}

describe('source exports', () => {
  test('published source files do not reference relative TypeScript modules', async () => {
    const sourceDirectory = fileURLToPath(new URL('.', import.meta.url))
    const sourceFiles = await collectPublishedSourceFiles(sourceDirectory)
    const offenders: string[] = []

    for (const sourceFile of sourceFiles) {
      const source = await readFile(sourceFile, 'utf8')
      const matches = Array.from(
        source.matchAll(relativeTypeScriptSpecifierPattern)
      )

      for (const match of matches) {
        offenders.push(
          `${relative(sourceDirectory, sourceFile)} -> ${match[2]}`
        )
      }
    }

    expect(offenders).toEqual([])
  })
})
