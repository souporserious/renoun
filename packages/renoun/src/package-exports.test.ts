import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { describe, expect, test } from 'vitest'
import ts from 'typescript'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const packageTsConfigPath = fileURLToPath(new URL('../tsconfig.json', import.meta.url))
const execFile = promisify(execFileCallback)
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const unpublishedArtifactPattern = /\.(?:test|spec|bench)\./

interface PackedFile {
  path: string
}

interface PackDryRunResult {
  files: PackedFile[]
}

async function emitPackageClientDeclarations() {
  const configFile = ts.readConfigFile(packageTsConfigPath, ts.sys.readFile)
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    packageRoot
  )
  const outDir = await mkdtemp(join(tmpdir(), 'renoun-client-dts-'))

  try {
    const rootNames = [
      fileURLToPath(new URL('./analysis/client.ts', import.meta.url)),
      fileURLToPath(new URL('./project/client.ts', import.meta.url)),
    ]
    const program = ts.createProgram({
      rootNames,
      options: {
        ...parsedConfig.options,
        outDir,
        declaration: true,
        emitDeclarationOnly: true,
        noEmitOnError: false,
      },
    })

    program.emit()

    const [analysisDeclarations, projectDeclarations] = await Promise.all([
      readFile(join(outDir, 'analysis/client.d.ts'), 'utf8'),
      readFile(join(outDir, 'project/client.d.ts'), 'utf8'),
    ])

    return { analysisDeclarations, projectDeclarations }
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
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

describe('package exports', () => {
  test('resolves source analysis client server modules by default and keeps a dist alias for built output', () => {
    expect(import.meta.resolve('#analysis-client-server')).toBe(
      new URL('./analysis/client.server.ts', import.meta.url).href
    )
    expect(import.meta.resolve('#analysis-client-server-dist')).toBe(
      new URL('../dist/analysis/client.server.js', import.meta.url).href
    )
  })

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

  test('keeps renoun/analysis and renoun/project declaration entry points public', async () => {
    const { analysisDeclarations, projectDeclarations } =
      await emitPackageClientDeclarations()

    expect(analysisDeclarations).toContain(
      'export declare function getQuickInfoAtPosition'
    )
    expect(analysisDeclarations).toContain(
      'export declare function getTokens'
    )
    expect(analysisDeclarations).toContain(
      'export declare function getFileExports'
    )

    expect(projectDeclarations).toContain(
      'export declare function getQuickInfoAtPosition'
    )
    expect(projectDeclarations).toContain(
      'export declare function getTokens'
    )
    expect(projectDeclarations).toContain(
      'export declare function getFileExports'
    )
  })

  test('keeps the built analysis client pointed at the dist-only internal alias', async () => {
    const builtClient = await readFile(
      new URL('../dist/analysis/client.js', import.meta.url),
      'utf8'
    )

    expect(builtClient).toContain("import('#analysis-client-server-dist')")
    expect(builtClient).not.toContain("import('#analysis-client-server')")
  })

  test('excludes test and bench artifacts from the published tarball', async () => {
    const packedFiles = await getPackedFiles()

    expect(
      packedFiles.filter((filePath) => unpublishedArtifactPattern.test(filePath))
    ).toEqual([])
  })
})
