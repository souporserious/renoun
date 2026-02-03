import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'

import { getRootDirectory } from '../utils/get-root-directory.ts'
import { NodeFileSystem } from './NodeFileSystem'

async function readStream(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []

  try {
    let result = await reader.read()
    while (!result.done) {
      chunks.push(result.value.slice())
      result = await reader.read()
    }
  } finally {
    reader.releaseLock()
  }

  return concatenate(chunks)
}

function concatenate(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const combined = new Uint8Array(size)
  let offset = 0

  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }

  return combined
}

describe('NodeFileSystem', () => {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const rootDirectory = getRootDirectory()
  const baseTmpDirectory = join(rootDirectory, 'tmp-tests')
  mkdirSync(baseTmpDirectory, { recursive: true })
  const tempDirectory = mkdtempSync(join(baseTmpDirectory, 'node-fs-'))
  const outsideDirectories: string[] = []
  const fileSystem = new NodeFileSystem()

  const textFilePath = join(tempDirectory, 'text.txt')
  const binaryFilePath = join(tempDirectory, 'binary.bin')
  const streamFilePath = join(tempDirectory, 'stream.txt')

  test('supports binary read and write operations', async () => {
    await fileSystem.writeFile(textFilePath, 'Hello World')

    expect(await fileSystem.readFile(textFilePath)).toBe('Hello World')
    expect(decoder.decode(await fileSystem.readFileBinary(textFilePath))).toBe(
      'Hello World'
    )

    fileSystem.writeFileSync(binaryFilePath, new Uint8Array([1, 2, 3]))

    expect(Array.from(fileSystem.readFileBinarySync(binaryFilePath))).toEqual([
      1, 2, 3,
    ])
  })

  test('supports streaming writes and reads', async () => {
    const writer = fileSystem.writeFileStream(streamFilePath).getWriter()
    await writer.write(encoder.encode('chunk-1 '))
    await writer.write(encoder.encode('chunk-2'))
    await writer.close()

    const streamContents = await readStream(
      fileSystem.readFileStream(streamFilePath)
    )

    expect(decoder.decode(streamContents)).toBe('chunk-1 chunk-2')
    expect(await fileSystem.readFile(streamFilePath)).toBe('chunk-1 chunk-2')
  })

  test('deleteFile removes files and fileExists reflects state', async () => {
    await fileSystem.writeFile(binaryFilePath, encoder.encode('data'))

    expect(await fileSystem.fileExists(binaryFilePath)).toBe(true)
    await fileSystem.deleteFile(binaryFilePath)
    expect(await fileSystem.fileExists(binaryFilePath)).toBe(false)
  })

  test('prevents path traversal via symlinks escaping the workspace', async () => {
    const outsideDirectory = mkdtempSync(join(rootDirectory, '..', 'node-fs-'))
    outsideDirectories.push(outsideDirectory)

    const outsideFilePath = join(outsideDirectory, 'secret.txt')
    writeFileSync(outsideFilePath, 'classified data')

    const traversalDirectory = join(tempDirectory, 'escape')
    symlinkSync(outsideDirectory, traversalDirectory, 'dir')

    const traversalPath = join(traversalDirectory, 'secret.txt')
    await expect(fileSystem.readFile(traversalPath)).rejects.toThrow(
      /outside of the workspace root/i
    )
  })

  test('rename and copy respect overwrite options', async () => {
    const source = join(tempDirectory, 'source.txt')
    const target = join(tempDirectory, 'target.txt')
    await fileSystem.writeFile(source, 'alpha')
    await fileSystem.writeFile(target, 'beta')

    await expect(fileSystem.rename(source, target)).rejects.toThrow(
      /target already exists/
    )

    await fileSystem.rename(source, target, { overwrite: true })
    expect(await fileSystem.readFile(target)).toBe('alpha')
    expect(await fileSystem.fileExists(source)).toBe(false)

    const copySource = join(tempDirectory, 'copy-source.txt')
    const copyTarget = join(tempDirectory, 'copy-target.txt')
    await fileSystem.writeFile(copySource, 'copy')
    await fileSystem.writeFile(copyTarget, 'existing')

    await expect(fileSystem.copy(copySource, copyTarget)).rejects.toThrow(
      /target already exists/
    )
    await fileSystem.copy(copySource, copyTarget, { overwrite: true })
    expect(await fileSystem.readFile(copyTarget)).toBe('copy')
    expect(await fileSystem.fileExists(copySource)).toBe(true)
  })

  test('copy supports recursive directories', async () => {
    const sourceDir = join(tempDirectory, 'dir')
    const nestedDir = join(sourceDir, 'sub')
    mkdirSync(nestedDir, { recursive: true })
    const nestedFile = join(nestedDir, 'file.txt')
    writeFileSync(nestedFile, 'nested')

    const targetDir = join(tempDirectory, 'dir-copy')
    await fileSystem.copy(sourceDir, targetDir)

    expect(await fileSystem.readFile(join(targetDir, 'sub', 'file.txt'))).toBe(
      'nested'
    )
  })

  test('metadata helpers return undefined for missing paths', async () => {
    const existingPath = join(tempDirectory, 'meta.txt')
    await fileSystem.writeFile(existingPath, 'hello')

    expect(fileSystem.getFileByteLengthSync(existingPath)).toBe(5)
    await expect(fileSystem.getFileByteLength(existingPath)).resolves.toBe(5)

    const mtimeSync = fileSystem.getFileLastModifiedMsSync(existingPath)
    expect(typeof mtimeSync).toBe('number')
    expect(mtimeSync).toBeGreaterThan(0)
    const mtimeAsync = await fileSystem.getFileLastModifiedMs(existingPath)
    expect(typeof mtimeAsync).toBe('number')
    expect(mtimeAsync).toBeGreaterThan(0)

    const missingPath = join(tempDirectory, 'missing-meta.txt')
    expect(fileSystem.getFileByteLengthSync(missingPath)).toBeUndefined()
    await expect(fileSystem.getFileByteLength(missingPath)).resolves.toBe(
      undefined
    )
    expect(fileSystem.getFileLastModifiedMsSync(missingPath)).toBeUndefined()
    await expect(fileSystem.getFileLastModifiedMs(missingPath)).resolves.toBe(
      undefined
    )
  })

  afterAll(() => {
    rmSync(tempDirectory, { recursive: true, force: true })
    for (const directory of outsideDirectories) {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
