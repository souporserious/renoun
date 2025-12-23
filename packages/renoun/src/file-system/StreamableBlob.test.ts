import { describe, expect, it } from 'vitest'

import { StreamableBlob, type StreamableContent } from './StreamableBlob.ts'
import { Directory, File, InMemoryFileSystem } from './index.tsx'

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
    const fileSystem = new InMemoryFileSystem({})
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

  it('handles zero-length files without hanging', async () => {
    const fileSystem = new InMemoryFileSystem({})
    await fileSystem.writeFile('empty.txt', '')
    const directory = new Directory({ fileSystem })
    const file = new File({ directory, path: 'empty.txt' })

    expect(file.size).toBe(0)
    await expect(file.text()).resolves.toBe('')
    await expect(file.arrayBuffer()).resolves.toBeInstanceOf(ArrayBuffer)
  })

  it('allows slicing directly from File without explicit Blob creation', async () => {
    const fileSystem = new InMemoryFileSystem({})
    await fileSystem.writeFile('range.txt', '0123456789')
    const directory = new Directory({ fileSystem })
    const file = new File({ directory, path: 'range.txt' })

    const slice = file.slice(2, 5)
    expect(await slice.text()).toBe('234')

    const reader = file.stream().getReader()
    const { value } = await reader.read()
    expect(new TextDecoder().decode(value)).toBe('0123456789')
  })

  it('throws when byte length cannot be inferred', async () => {
    class UnknownSizeInMemoryFileSystem extends InMemoryFileSystem {
      override getFileByteLengthSync(): number | undefined {
        return undefined
      }
    }

    const fileSystem = new UnknownSizeInMemoryFileSystem({})
    await fileSystem.writeFile('mystery.txt', 'streamed without size')
    const directory = new Directory({ fileSystem })
    expect(() => new File({ directory, path: 'mystery.txt' })).toThrow(
      /Unable to determine size/
    )
  })
})
