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

  afterAll(() => {
    rmSync(tempDirectory, { recursive: true, force: true })
    for (const directory of outsideDirectories) {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
