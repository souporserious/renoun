import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'
import ts from 'typescript'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const packageTsConfigPath = fileURLToPath(new URL('../tsconfig.json', import.meta.url))

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

describe('package exports', () => {
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
})
