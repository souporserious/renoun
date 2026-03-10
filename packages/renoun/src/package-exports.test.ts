import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { describe, expect, test } from 'vitest'
import ts from 'typescript'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const packageTsConfigPath = fileURLToPath(new URL('../tsconfig.json', import.meta.url))
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

interface RenounPackageJson {
  exports?: Record<string, unknown>
  imports?: Record<string, unknown>
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

function emitPackageDeclarations(outDir: string): void {
  const configFile = ts.readConfigFile(packageTsConfigPath, ts.sys.readFile)
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    packageRoot
  )
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
}

async function emitPackageClientDeclarations() {
  const outDir = await mkdtemp(join(tmpdir(), 'renoun-client-dts-'))

  try {
    emitPackageDeclarations(outDir)

    const [
      analysisDeclarations,
      projectDeclarations,
      createHighlighterDeclarations,
      getTokensDeclarations,
    ] = await Promise.all([
      readFile(join(outDir, 'analysis/client.d.ts'), 'utf8'),
      readFile(join(outDir, 'project/client.d.ts'), 'utf8'),
      readFile(join(outDir, 'utils/create-highlighter.d.ts'), 'utf8'),
      readFile(join(outDir, 'utils/get-tokens.d.ts'), 'utf8'),
    ])

    return {
      analysisDeclarations,
      projectDeclarations,
      createHighlighterDeclarations,
      getTokensDeclarations,
    }
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}

async function expectPackageConsumerToTypecheck(): Promise<void> {
  const packageDirectory = await mkdtemp(
    join(workspaceRoot, 'tmp-renoun-package-')
  )
  const consumerDirectory = await mkdtemp(
    join(workspaceRoot, 'tmp-renoun-analysis-consumer-')
  )

  try {
    emitPackageDeclarations(join(packageDirectory, 'dist'))
    await Promise.all([
      writeFile(
        join(packageDirectory, 'package.json'),
        JSON.stringify(
          {
            name: 'renoun',
            type: 'module',
            exports: {
              './analysis': {
                types: './dist/analysis/client.d.ts',
                default: './dist/analysis/client.js',
              },
              './project': {
                types: './dist/project/client.d.ts',
                default: './dist/project/client.js',
              },
            },
          },
          null,
          2
        )
      ),
      writeFile(
        join(packageDirectory, 'dist/utils/ts-morph.d.ts'),
        [
          'export interface ProjectOptions {',
          '  compilerOptions?: unknown',
          '  tsConfigFilePath?: string',
          '  useInMemoryFileSystem?: boolean',
          '}',
          'export type Project = unknown',
          'export type SourceFile = unknown',
          'export type Node = unknown',
          'export type Symbol = unknown',
          'export type Type = unknown',
          'export type Diagnostic<T = unknown> = T',
          'export type SyntaxKind = number',
          'export declare namespace ts {',
          '  interface Diagnostic {}',
          '  interface TextSpan {',
          '    start: number',
          '    length: number',
          '  }',
          '  interface SymbolDisplayPart {',
          '    kind: string',
          '    text: string',
          '  }',
          '  type OutliningSpanKind = string',
          '}',
          '',
        ].join('\n')
      ),
      writeFile(
        join(packageDirectory, 'dist/utils/create-tokenizer.d.ts'),
        [
          'export interface TextMateThemeRaw {',
          '  name?: string',
          '  type?: string',
          '  colors?: Record<string, string>',
          '  settings?: unknown[]',
          '  tokenColors?: unknown[]',
          '}',
          'export declare class Tokenizer<ScopeName extends string = string> {}',
          '',
        ].join('\n')
      ),
      writeFile(join(packageDirectory, 'dist/analysis/client.js'), 'export {}\n'),
      writeFile(join(packageDirectory, 'dist/project/client.js'), 'export {}\n'),
    ])

    await mkdir(join(consumerDirectory, 'node_modules'), { recursive: true })
    await symlink(
      packageDirectory,
      join(consumerDirectory, 'node_modules', 'renoun'),
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
            },
          },
          null,
          2
        )
      ),
      writeFile(
        join(consumerDirectory, 'index.ts'),
        [
          "import { getTokens as getAnalysisTokens } from 'renoun/analysis'",
          "import { getTokens as getProjectTokens } from 'renoun/project'",
          'void getAnalysisTokens',
          'void getProjectTokens',
          '',
        ].join('\n')
      ),
    ])

    typecheckProject(join(consumerDirectory, 'tsconfig.json'))
  } finally {
    await Promise.all([
      rm(consumerDirectory, { recursive: true, force: true }),
      rm(packageDirectory, { recursive: true, force: true }),
    ])
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

  test('keeps renoun/project as a dedicated compatibility entry point', async () => {
    const packageJson = await readPackageJson()

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
    const {
      analysisDeclarations,
      projectDeclarations,
      createHighlighterDeclarations,
      getTokensDeclarations,
    } =
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
    expect(analysisDeclarations).not.toContain('ConfigurationOptions')
    expect(analysisDeclarations).not.toContain('../components/Config/types.ts')

    expect(projectDeclarations).toContain(
      'export declare function getQuickInfoAtPosition'
    )
    expect(projectDeclarations).toContain(
      'export declare function getTokens'
    )
    expect(projectDeclarations).toContain(
      'export declare function getFileExports'
    )
    expect(projectDeclarations).not.toContain('ConfigurationOptions')
    expect(projectDeclarations).not.toContain('../components/Config/types.ts')
    expect(createHighlighterDeclarations).not.toContain('ConfigurationOptions')
    expect(createHighlighterDeclarations).not.toContain(
      '../components/Config/types.ts'
    )
    expect(getTokensDeclarations).not.toContain('ConfigurationOptions')
    expect(getTokensDeclarations).not.toContain(
      '../components/Config/types.ts'
    )
  })

  test('typechecks for consumers that import renoun/analysis and renoun/project', async () => {
    await expectPackageConsumerToTypecheck()
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

  test('excludes test and bench artifacts from the published tarball', async () => {
    const packedFiles = await getPackedFiles()

    expect(
      packedFiles.filter((filePath) => unpublishedArtifactPattern.test(filePath))
    ).toEqual([])
  })
})
