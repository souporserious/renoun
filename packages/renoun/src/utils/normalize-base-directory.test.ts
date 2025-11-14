import { join, sep } from 'node:path'

import { describe, expect, test } from 'vitest'

import { getRootDirectory } from './get-root-directory.js'
import { normalizeBaseDirectory } from './normalize-base-directory.js'

function normalizePath(path: string | undefined) {
  return path?.split(sep).join('/')
}

describe('normalizeBaseDirectory', () => {
  test('returns undefined when base directory is not provided', () => {
    expect(normalizeBaseDirectory()).toBeUndefined()
  })

  test('normalizes file URL objects to a directory pathname', () => {
    const directory = normalizeBaseDirectory(
      new URL('file:///tmp/example/project/src/file.ts')
    )

    expect(directory).toBe('/tmp/example/project/src')
  })

  test('normalizes file URL strings to a directory pathname', () => {
    const directory = normalizeBaseDirectory(
      'file:///tmp/example/project/src/file.ts'
    )

    expect(directory).toBe('/tmp/example/project/src')
  })

  test('resolves workspace scheme inputs against the repository root', () => {
    const rootDirectory = getRootDirectory()
    const directory = normalizeBaseDirectory(
      'workspace:/packages/renoun/src/utils/file.ts'
    )

    expect(normalizePath(directory)).toBe(
      normalizePath(join(rootDirectory, 'packages/renoun/src/utils'))
    )
  })

  test('returns plain relative paths unchanged', () => {
    expect(normalizeBaseDirectory('./docs/examples/')).toBe('./docs/examples/')
  })

  test('uses import.meta.url inputs to resolve the containing directory', () => {
    const directory = normalizeBaseDirectory(import.meta.url)
    const expected = new URL('.', import.meta.url)

    expect(normalizePath(directory)).toBe(
      normalizePath(expected.pathname.replace(/\/$/, ''))
    )
  })
})
