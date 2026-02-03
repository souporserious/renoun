import { describe, expect, test } from 'vitest'

import { InMemoryFileSystem } from './InMemoryFileSystem'

describe('BaseFileSystem', () => {
  test('shouldStripInternal respects tsconfig (sync + async)', async () => {
    const fileSystem = new InMemoryFileSystem({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { stripInternal: true },
      }),
    })

    expect(fileSystem.shouldStripInternal()).toBe(true)
    await expect(fileSystem.shouldStripInternalAsync()).resolves.toBe(true)
  })

  test('shouldStripInternal returns false without tsconfig', async () => {
    const fileSystem = new InMemoryFileSystem({})
    expect(fileSystem.shouldStripInternal()).toBe(false)
    await expect(fileSystem.shouldStripInternalAsync()).resolves.toBe(false)
  })

  test('shouldStripInternal returns false when stripInternal is false', async () => {
    const fileSystem = new InMemoryFileSystem({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { stripInternal: false },
      }),
    })

    expect(fileSystem.shouldStripInternal()).toBe(false)
    await expect(fileSystem.shouldStripInternalAsync()).resolves.toBe(false)
  })

  test('throws on invalid tsconfig.json', () => {
    const fileSystem = new InMemoryFileSystem({
      'tsconfig.json': '{ "compilerOptions": ',
    })

    expect(() => fileSystem.shouldStripInternal()).toThrow(
      '[renoun] Failed to parse tsconfig.json'
    )
  })

  test('isFilePathExcludedFromTsConfig matches exclude patterns', async () => {
    const fileSystem = new InMemoryFileSystem({
      'tsconfig.json': JSON.stringify({
        exclude: ['dist/**', 'generated/**', '**/*.test.ts'],
      }),
    })

    expect(fileSystem.isFilePathExcludedFromTsConfig('dist/index.ts')).toBe(
      true
    )
    expect(fileSystem.isFilePathExcludedFromTsConfig('dist', true)).toBe(true)
    expect(fileSystem.isFilePathExcludedFromTsConfig('generated/file.ts')).toBe(
      true
    )
    expect(fileSystem.isFilePathExcludedFromTsConfig('src/app.test.ts')).toBe(
      true
    )
    expect(fileSystem.isFilePathExcludedFromTsConfig('src/app.ts')).toBe(false)

    await expect(
      fileSystem.isFilePathExcludedFromTsConfigAsync('dist/index.ts')
    ).resolves.toBe(true)
    await expect(
      fileSystem.isFilePathExcludedFromTsConfigAsync('src/app.ts')
    ).resolves.toBe(false)
  })
})
