import { describe, expect, it } from 'vitest'

import { StreamableBlob, type StreamableContent } from './StreamableBlob.ts'
import { Directory, File, MemoryFileSystem } from './index.tsx'

function createContent(
  data: string,
  calls: Array<[number, number]>
): StreamableContent {
  const encoder = new TextEncoder()
  const encoded = encoder.encode(data)

  return {
    byteLength: encoded.byteLength,
    stream(start, end) {
      calls.push([start, end])
      const slice = encoded.slice(start, end)
      return new ReadableStream({
        start(controller) {
          controller.enqueue(slice)
          controller.close()
        },
      })
    },
  }
}

describe('streaming helpers', () => {
  it('streams and decodes lazily via the Blob surface', async () => {
    const calls: Array<[number, number]> = []
    const blob = new StreamableBlob(createContent('hello world', calls), {
      type: 'text/plain',
    })

    expect(await blob.text()).toBe('hello world')
    expect(await blob.arrayBuffer()).toBeInstanceOf(ArrayBuffer)
    expect(calls).toEqual([
      [0, 11],
      [0, 11],
    ])

    const slice = blob.slice(6)
    expect(await slice.text()).toBe('world')
    expect(calls).toEqual([
      [0, 11],
      [0, 11],
      [6, 11],
    ])
  })
})

describe('File streaming helpers', () => {
  it('wraps filesystem entries as streaming blobs', async () => {
    const fileSystem = new MemoryFileSystem({})
    await fileSystem.writeFile('example.txt', 'stream me')
    const directory = new Directory({ fileSystem })
    const file = new File({ directory, path: 'example.txt' })

    expect(file.type).toBe('text/plain')
    expect(file.size).toBe(9)

    const blob = file.slice()
    expect(blob.size).toBe(9)
    expect(blob.type).toBe('text/plain')
    expect(await blob.text()).toBe('stream me')

    const slice = blob.slice(8)
    expect(await slice.text()).toBe('e')
  })

  it('allows slicing directly from File without explicit Blob creation', async () => {
    const fileSystem = new MemoryFileSystem({})
    await fileSystem.writeFile('range.txt', '0123456789')
    const directory = new Directory({ fileSystem })
    const file = new File({ directory, path: 'range.txt' })

    const slice = file.slice(2, 5)
    expect(await slice.text()).toBe('234')

    const reader = file.stream().getReader()
    const { value } = await reader.read()
    expect(new TextDecoder().decode(value)).toBe('0123456789')
  })

  it('falls back to the raw stream when byte length cannot be inferred', async () => {
    class UnknownSizeMemoryFileSystem extends MemoryFileSystem {
      override getFileByteLengthSync(): number | undefined {
        return undefined
      }
    }

    const fileSystem = new UnknownSizeMemoryFileSystem({})
    await fileSystem.writeFile('mystery.txt', 'streamed without size')
    const directory = new Directory({ fileSystem })
    const file = new File({ directory, path: 'mystery.txt' })

    const arrayBuffer = await file.arrayBuffer()
    expect(new TextDecoder().decode(arrayBuffer)).toBe('streamed without size')

    const reader = file.stream().getReader()
    const chunks: Uint8Array[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
    const combined = new Uint8Array(totalLength)
    let offset = 0

    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.byteLength
    }

    const decoder = new TextDecoder()
    expect(decoder.decode(combined)).toBe('streamed without size')
  })
})
