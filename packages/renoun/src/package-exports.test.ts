import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { describe, expect, test } from 'vitest'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const execFile = promisify(execFileCallback)
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const unpublishedArtifactPattern = /\.(?:test|spec|bench)\./

interface PackedFile {
  path: string
}

interface PackDryRunResult {
  files: PackedFile[]
}

let packedFilesPromise: Promise<string[]> | undefined

function parsePackDryRunResults(stdout: string): PackDryRunResult[] {
  const jsonMatch = stdout.match(/\[\s*\{[\s\S]*\}\s*\]\s*$/)

  if (!jsonMatch) {
    throw new Error(`Failed to parse npm pack JSON output:\n${stdout}`)
  }

  return JSON.parse(jsonMatch[0]) as PackDryRunResult[]
}

async function getPackedFiles(): Promise<string[]> {
  if (!packedFilesPromise) {
    packedFilesPromise = (async () => {
      const npmCacheDirectory = await mkdtemp(
        join(tmpdir(), 'renoun-npm-cache-')
      )

      try {
        const { stdout } = await execFile(
          npmCommand,
          ['pack', '--dry-run', '--json'],
          {
            cwd: packageRoot,
            env: {
              ...process.env,
              npm_config_cache: npmCacheDirectory,
            },
            maxBuffer: 10 * 1024 * 1024,
          }
        )
        const [result] = parsePackDryRunResults(stdout)

        return result.files.map((file) => file.path).sort()
      } finally {
        await rm(npmCacheDirectory, { recursive: true, force: true })
      }
    })()
  }

  return packedFilesPromise
}

describe('package exports', () => {
  test(
    'excludes test and bench artifacts from the published tarball',
    async () => {
      const packedFiles = await getPackedFiles()

      expect(
        packedFiles.filter((filePath) => unpublishedArtifactPattern.test(filePath))
      ).toEqual([])
    },
    30_000
  )

  test(
    'does not publish stale legacy project build artifacts',
    async () => {
      const packedFiles = await getPackedFiles()

      expect(
        packedFiles.filter((filePath) => filePath.startsWith('dist/project/'))
      ).toEqual([])
    },
    30_000
  )
})
