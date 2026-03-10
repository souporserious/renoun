import { describe, expect, test } from 'vitest'

import {
  DIST_SPECIFIER,
  SOURCE_SPECIFIER,
  rewriteAnalysisClientImports,
} from './patch-analysis-client-imports.ts'

describe('patch-analysis-client-imports', () => {
  test('rewrites built analysis client imports to the dist-only internal alias', () => {
    const builtClient = `const modules = ${SOURCE_SPECIFIER}`
    const patchedBuiltClient = rewriteAnalysisClientImports(builtClient)

    expect(patchedBuiltClient).toContain(DIST_SPECIFIER)
    expect(patchedBuiltClient).not.toContain(SOURCE_SPECIFIER)
  })

  test('keeps already-patched built analysis client imports stable', () => {
    const builtClient = `const modules = ${DIST_SPECIFIER}`

    expect(rewriteAnalysisClientImports(builtClient)).toBe(builtClient)
  })

  test('throws if the built analysis client no longer contains the expected source alias', () => {
    expect(() =>
      rewriteAnalysisClientImports("const modules = import('#unexpected-alias')")
    ).toThrow(
      `[patch-analysis-client-imports] Expected dist/analysis/client.js to reference ${SOURCE_SPECIFIER}`
    )
  })
})
