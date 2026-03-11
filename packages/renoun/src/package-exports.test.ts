import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { describe, expect, test } from 'vitest'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const execFile = promisify(execFileCallback)
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const unpublishedArtifactPattern = /\.(?:test|spec|bench)\./
const packageExportsTestTimeoutMs = 60_000

let packedFilesPromise: Promise<string[]> | undefined

interface PackedFile {
  path: string
}

interface PackDryRunResult {
  files: PackedFile[]
}

interface RenounPackageJson {
  exports?: Record<string, unknown>
  imports?: Record<string, unknown>
}

async function getPackedFiles(): Promise<string[]> {
  const npmCacheDirectory = await mkdtemp(join(tmpdir(), 'renoun-npm-cache-'))

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
        maxBuffer: 50 * 1024 * 1024,
      }
    )
    const [result] = JSON.parse(stdout) as PackDryRunResult[]

    return result.files.map((file) => file.path).sort()
  } finally {
    await rm(npmCacheDirectory, { recursive: true, force: true })
  }
}

async function getMemoizedPackedFiles(): Promise<string[]> {
  packedFilesPromise ??= getPackedFiles()
  return packedFilesPromise
}

async function readPackageJson(): Promise<RenounPackageJson> {
  return JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  ) as RenounPackageJson
}

describe('package exports', () => {
  test('resolves source analysis client server modules by default and keeps a dist alias for built output', () => {
    expect(import.meta.resolve('#analysis-client-server')).toBe(
      new URL('./analysis/client.server.ts', import.meta.url).href
    )
    expect(import.meta.resolve('#analysis-client-server-dist')).toBe(
      new URL('../dist/analysis/client.server.js', import.meta.url).href
    )
  })

  test('does not expose analysis or project compatibility entry points', async () => {
    const packageJson = await readPackageJson()

    expect(packageJson.exports?.['./analysis']).toBeUndefined()
    expect(packageJson.exports?.['./project']).toBeUndefined()
  })

  test('keeps source and dist analysis server aliases split in package imports', async () => {
    const packageJson = await readPackageJson()

    expect(packageJson.imports?.['#analysis-client-server']).toEqual({
      source: {
        browser: './src/analysis/client.server.browser.ts',
        default: './src/analysis/client.server.ts',
      },
      browser: './src/analysis/client.server.browser.ts',
      default: './src/analysis/client.server.ts',
    })
    expect(packageJson.imports?.['#analysis-client-server-dist']).toEqual({
      browser: './dist/analysis/client.server.browser.js',
      default: './dist/analysis/client.server.js',
    })
  })

  test(
    'excludes test and bench artifacts from the published tarball',
    async () => {
      const packedFiles = await getMemoizedPackedFiles()

      expect(
        packedFiles.filter((filePath) =>
          unpublishedArtifactPattern.test(filePath)
        )
      ).toEqual([])
    },
    packageExportsTestTimeoutMs
  )
})
