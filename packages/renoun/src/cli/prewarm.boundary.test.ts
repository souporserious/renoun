import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import * as ts from 'typescript'

const ENTRYPOINTS = [
  fileURLToPath(new URL('./index.ts', import.meta.url)),
  fileURLToPath(new URL('./app.ts', import.meta.url)),
  fileURLToPath(new URL('./prewarm.ts', import.meta.url)),
]

const RESOLUTION_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.mtsx',
  '.cts',
  '.ctsx',
  '.js',
  '.jsx',
  '.mjs',
  '.mjsx',
  '.cjs',
  '.cjsx',
]

describe('CLI prewarm import boundary', () => {
  test('does not reach component or tsx runtime modules', async () => {
    const reachableFiles = await collectReachableFiles(ENTRYPOINTS)
    const disallowedFiles = Array.from(reachableFiles).filter((filePath) => {
      const normalizedPath = normalizeSlashes(filePath)

      return (
        normalizedPath.includes('/src/components/') ||
        normalizedPath.endsWith('.tsx')
      )
    })

    expect(disallowedFiles).toEqual([])
  })
})

async function collectReachableFiles(entrypoints: string[]): Promise<Set<string>> {
  const reachable = new Set<string>()
  const pending = [...entrypoints]

  while (pending.length > 0) {
    const filePath = pending.pop()
    if (!filePath) {
      continue
    }

    const absolutePath = resolve(filePath)
    if (reachable.has(absolutePath)) {
      continue
    }

    reachable.add(absolutePath)

    const source = await readFile(absolutePath, 'utf-8')
    const specifiers = getRuntimeImportSpecifiers(source, absolutePath)

    for (const specifier of specifiers) {
      const resolvedSpecifier = resolveLocalSpecifier(absolutePath, specifier)
      if (resolvedSpecifier) {
        pending.push(resolvedSpecifier)
      }
    }
  }

  return reachable
}

function getRuntimeImportSpecifiers(sourceText: string, filePath: string): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const specifiers: string[] = []

  const visitNode = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      if (!node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier)) {
        specifiers.push(node.moduleSpecifier.text)
      }
    } else if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        specifiers.push(node.moduleSpecifier.text)
      }
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const firstArgument = node.arguments[0]
      if (firstArgument && ts.isStringLiteralLike(firstArgument)) {
        specifiers.push(firstArgument.text)
      }
    }

    ts.forEachChild(node, visitNode)
  }

  visitNode(sourceFile)

  return specifiers
}

function resolveLocalSpecifier(
  sourcePath: string,
  specifier: string
): string | undefined {
  if (!specifier.startsWith('.')) {
    return undefined
  }

  const sourceDirectory = dirname(sourcePath)
  const candidatePath = resolve(sourceDirectory, specifier)
  const candidateExtension = extname(candidatePath)

  if (candidateExtension && existsSync(candidatePath)) {
    return candidatePath
  }

  for (const extension of RESOLUTION_EXTENSIONS) {
    const withExtension = `${candidatePath}${extension}`
    if (existsSync(withExtension)) {
      return withExtension
    }
  }

  for (const extension of RESOLUTION_EXTENSIONS) {
    const asIndex = resolve(candidatePath, `index${extension}`)
    if (existsSync(asIndex)) {
      return asIndex
    }
  }

  return undefined
}

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/')
}
