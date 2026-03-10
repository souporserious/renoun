import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { describe, expect, test } from 'vitest'
import ts from 'typescript'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url))
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

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => workspaceRoot,
    getNewLine: () => '\n',
  })
}

function typecheckProject(tsConfigPath: string): void {
  const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile)
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(tsConfigPath)
  )
  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  })
  const diagnostics = ts.getPreEmitDiagnostics(program)

  if (diagnostics.length > 0) {
    throw new Error(formatDiagnostics(diagnostics))
  }
}

async function expectSourceConsumerToTypecheck(): Promise<void> {
  const consumerDirectory = await mkdtemp(join(workspaceRoot, 'tmp-mdx-consumer-'))

  try {
    await mkdir(join(consumerDirectory, 'node_modules', '@renoun'), {
      recursive: true,
    })
    await symlink(
      packageRoot,
      join(consumerDirectory, 'node_modules', '@renoun', 'mdx'),
      'junction'
    )
    await Promise.all([
      writeFile(
        join(consumerDirectory, 'tsconfig.json'),
        JSON.stringify(
          {
            compilerOptions: {
              module: 'ESNext',
              moduleResolution: 'Bundler',
              target: 'ES2022',
              jsx: 'react-jsx',
              noEmit: true,
              skipLibCheck: true,
              customConditions: ['source'],
            },
          },
          null,
          2
        )
      ),
      writeFile(
        join(consumerDirectory, 'index.ts'),
        [
          "import { rehypePlugins } from '@renoun/mdx'",
          "import { createSlug } from '@renoun/mdx/utils'",
          "import addSections from '@renoun/mdx/remark/add-sections'",
          'void rehypePlugins',
          'void createSlug',
          'void addSections',
          '',
        ].join('\n')
      ),
    ])

    typecheckProject(join(consumerDirectory, 'tsconfig.json'))
  } finally {
    await rm(consumerDirectory, { recursive: true, force: true })
  }
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

  test('typechecks for consumers that opt into the source condition', async () => {
    await expectSourceConsumerToTypecheck()
  })

  test('excludes test and bench artifacts from the published tarball', async () => {
    const packedFiles = await getPackedFiles()

    expect(
      packedFiles.filter((filePath) => unpublishedArtifactPattern.test(filePath))
    ).toEqual([])
  })
})
