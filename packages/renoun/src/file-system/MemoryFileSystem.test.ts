import { describe, expect, test } from 'vitest'
import { Buffer } from 'node:buffer'

import { MemoryFileSystem } from './MemoryFileSystem'

describe('MemoryFileSystem', () => {
  test('stores binary file content safely and returns base64 string when read', () => {
    const binary = new Uint8Array([0, 1, 2, 3])
    const fileSystem = new MemoryFileSystem({ 'binary.bin': binary })

    const entry = fileSystem.getFileEntry('binary.bin')
    expect(entry?.kind).toBe('binary')
    if (!entry || entry.kind !== 'binary') {
      throw new Error('Expected binary entry')
    }
    expect(entry.content).not.toBe(binary)
    expect(Array.from(entry.content)).toEqual([0, 1, 2, 3])

    binary[0] = 255

    expect(Array.from(entry.content)).toEqual([0, 1, 2, 3])

    const base64 = fileSystem.readFileSync('binary.bin')
    expect(base64).toBe(Buffer.from([0, 1, 2, 3]).toString('base64'))
  })

  test('normalizes provided binary entries and preserves encoding metadata', () => {
    const entry = {
      kind: 'binary' as const,
      content: new Uint8Array([4, 5, 6]),
      encoding: 'base64' as const,
    }

    const fileSystem = new MemoryFileSystem({ 'buffer.dat': entry })
    const stored = fileSystem.getFileEntry('buffer.dat')

    expect(stored?.kind).toBe('binary')
    if (!stored || stored.kind !== 'binary') {
      throw new Error('Expected binary entry')
    }
    expect(stored.encoding).toBe('base64')
    expect(Array.from(stored.content)).toEqual([4, 5, 6])

    const freshEntry = {
      kind: 'binary' as const,
      content: new Uint8Array([7, 8, 9]),
      encoding: 'binary' as const,
    }

    fileSystem.createFile('fresh.dat', freshEntry)
    const created = fileSystem.getFileEntry('fresh.dat')

    expect(created?.kind).toBe('binary')
    if (!created || created.kind !== 'binary') {
      throw new Error('Expected binary entry')
    }
    expect(created.encoding).toBe('binary')
    expect(Array.from(created.content)).toEqual([7, 8, 9])
    expect(created.content).not.toBe(freshEntry.content)
  })

  test('reads text files and reports existence correctly', async () => {
    const fileSystem = new MemoryFileSystem({ 'readme.txt': 'hello' })

    expect(fileSystem.fileExistsSync('readme.txt')).toBe(true)
    expect(fileSystem.readFileSync('readme.txt')).toBe('hello')
    await expect(fileSystem.readFile('readme.txt')).resolves.toBe('hello')
  })

  test('supports binary reads, streaming writes, and deletion', async () => {
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const fileSystem = new MemoryFileSystem({})

    await fileSystem.writeFile('text.txt', 'hello world')
    expect(decoder.decode(await fileSystem.readFileBinary('text.txt'))).toBe(
      'hello world'
    )

    const input = new Uint8Array([9, 8, 7])
    await fileSystem.writeFile('binary.dat', input)
    const binary = await fileSystem.readFileBinary('binary.dat')
    expect(Array.from(binary)).toEqual([9, 8, 7])
    expect(binary).not.toBe(input)

    const writer = fileSystem.writeFileStream('stream.txt').getWriter()
    await writer.write(encoder.encode('chunk-1 '))
    await writer.write(encoder.encode('chunk-2'))
    await writer.close()

    const stream = fileSystem.readFileStream('stream.txt')
    const reader = stream.getReader()
    const first = await reader.read()
    expect(first.done).toBe(false)
    expect(decoder.decode(first.value!)).toBe('chunk-1 chunk-2')
    expect((await reader.read()).done).toBe(true)
    reader.releaseLock()

    expect(await fileSystem.readFile('stream.txt')).toBe('chunk-1 chunk-2')

    await fileSystem.deleteFile('stream.txt')
    expect(await fileSystem.fileExists('stream.txt')).toBe(false)
  })

  test('readDirectorySync lists files and directories at a path', () => {
    const fileSystem = new MemoryFileSystem({
      'a/b/c.txt': '1',
      'a/d.txt': '2',
      'z.txt': '3',
    })

    const entries = fileSystem.readDirectorySync('a')
    const names = entries.map((e) => e.name)

    expect(names).toContain('b')
    expect(names).toContain('d.txt')

    const dirB = entries.find((e) => e.name === 'b')!
    const fileD = entries.find((e) => e.name === 'd.txt')!

    expect(dirB.isDirectory).toBe(true)
    expect(dirB.isFile).toBe(false)
    expect(fileD.isDirectory).toBe(false)
    expect(fileD.isFile).toBe(true)
  })

  test('isFilePathGitIgnored respects .gitignore patterns', () => {
    const fileSystem = new MemoryFileSystem({
      '.gitignore': 'dist/\n# comment\n*.log\n',
      'dist/app.js': 'console.log(1)',
      'debug.log': new Uint8Array([1, 2, 3]),
    })

    expect(fileSystem.isFilePathGitIgnored('dist/app.js')).toBe(true)
    expect(fileSystem.isFilePathGitIgnored('src/app.js')).toBe(false)
    expect(fileSystem.isFilePathGitIgnored('debug.log')).toBe(true)
  })

  test('transpiles TypeScript files via transpileFile', async () => {
    const fileSystem = new MemoryFileSystem({
      'src/add.ts': 'export const add = (a: number, b: number) => a + b',
    })

    const absolute = fileSystem.getAbsolutePath('src/add.ts')
    const js = await fileSystem.transpileFile(absolute)

    expect(typeof js).toBe('string')
    expect(js).toContain('a + b')
  })

  test('throws on unsupported content provided to constructor', () => {
    expect(() => new MemoryFileSystem({ bad: 123 as unknown as any })).toThrow(
      '[renoun] Unsupported file content provided to MemoryFileSystem'
    )
  })
})
