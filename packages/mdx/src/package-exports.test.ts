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

interface PackedFile {
  path: string
}

interface PackDryRunResult {
  files: PackedFile[]
}

interface PackageExportEntry {
  source?: string
}

interface MdxPackageJson {
  exports?: Record<string, PackageExportEntry>
}

function normalizePackagePath(filePath: string): string {
  return filePath.startsWith('./') ? filePath.slice(2) : filePath
}

function getPackedFileMatches(
  filePattern: string,
  packedFiles: string[]
): string[] {
  const normalizedPattern = normalizePackagePath(filePattern)

  if (!normalizedPattern.includes('*')) {
    return packedFiles.filter((filePath) => filePath === normalizedPattern)
  }

  const pattern = normalizedPattern
    .replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replaceAll('*', '[^/]+')

  return packedFiles.filter((filePath) =>
    new RegExp(`^${pattern}$`).test(filePath)
  )
}

async function getPackedFiles(): Promise<string[]> {
  const npmCacheDirectory = await mkdtemp(join(tmpdir(), 'renoun-mdx-npm-cache-'))

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
    const [result] = JSON.parse(stdout) as PackDryRunResult[]

    return result.files.map((file) => file.path).sort()
  } finally {
    await rm(npmCacheDirectory, { recursive: true, force: true })
  }
}

describe('package exports', () => {
  test('publishes raw source files for every source export condition', async () => {
    const [packageJson, packedFiles] = await Promise.all([
      readFile(new URL('../package.json', import.meta.url), 'utf8').then(
        (file) => JSON.parse(file) as MdxPackageJson
      ),
      getPackedFiles(),
    ])

    for (const exportEntry of Object.values(packageJson.exports ?? {})) {
      const sourcePath = exportEntry.source

      expect(exportEntry).toHaveProperty('source')
      expect(sourcePath).toMatch(/^\.\/src\/.+\.ts$/)

      if (!sourcePath) continue

      const matchedFiles = getPackedFileMatches(sourcePath, packedFiles)

      expect(matchedFiles).not.toEqual([])
    }
  })

  test('excludes test and bench artifacts from the published tarball', async () => {
    const packedFiles = await getPackedFiles()

    expect(
      packedFiles.filter((filePath) => unpublishedArtifactPattern.test(filePath))
    ).toEqual([])
  })
})
