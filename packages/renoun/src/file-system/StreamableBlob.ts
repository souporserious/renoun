export type StreamableChunk =
  | Uint8Array
  | ArrayBuffer
  | ArrayBufferView
  | string

type StreamableUint8Array = Uint8Array<ArrayBuffer>

export interface StreamableContent {
  /** Total length of the resource in bytes. */
  byteLength: number

  /**
   * Provide a stream of data for the specified byte range. The `start` index is inclusive
   * and `end` is exclusive, matching the `Blob.slice` semantics used by the Web File API.
   */
  stream(start: number, end: number): ReadableStream<StreamableChunk>
}

const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

export function createRangeLimitedStream(
  streamFactory: () => ReadableStream<StreamableChunk>,
  start: number,
  end: number
): ReadableStream<StreamableUint8Array> {
  const reader = streamFactory().getReader()
  let position = 0

  return new ReadableStream<StreamableUint8Array>({
    async pull(controller) {
      while (position < end) {
        const { done, value } = await reader.read()
        if (done) {
          controller.close()
          return
        }

        const chunk = normalizeChunk(value)
        const chunkEnd = position + chunk.byteLength

        if (chunkEnd <= start) {
          position = chunkEnd
          continue
        }

        const sliceStart = start > position ? start - position : 0
        const sliceEnd = Math.min(chunk.byteLength, end - position)

        if (sliceStart < sliceEnd) {
          controller.enqueue(
            chunk.subarray(sliceStart, sliceEnd) as StreamableUint8Array
          )
        }

        position = chunkEnd

        if (position >= end) {
          await reader.cancel()
          controller.close()
          return
        }
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

export class StreamableBlob extends Blob {
  #content: StreamableContent

  constructor(content: StreamableContent, options?: BlobPropertyBag) {
    super([], options)
    this.#content = content
  }

  override get size(): number {
    return this.#content.byteLength
  }

  override stream(): ReadableStream<StreamableUint8Array> {
    return createUint8Stream(this.#content, 0, this.size)
  }

  override async arrayBuffer(): Promise<ArrayBuffer> {
    const buffer = await readStreamToUint8Array(this.stream())
    return buffer.buffer
  }

  override async text(): Promise<string> {
    const buffer = await readStreamToUint8Array(this.stream())
    return textDecoder.decode(buffer)
  }

  override slice(start?: number, end?: number, contentType?: string): Blob {
    const range = normalizeRange(this.size, start, end)
    const sliceContent: StreamableContent = {
      byteLength: range.length,
      stream: (sliceStart, sliceEnd) =>
        createUint8Stream(
          this.#content,
          range.start + sliceStart,
          range.start + sliceEnd
        ),
    }

    return new StreamableBlob(sliceContent, { type: contentType ?? this.type })
  }
}

function createUint8Stream(
  content: StreamableContent,
  start: number,
  end: number
): ReadableStream<StreamableUint8Array> {
  const source = content.stream(start, end).getReader()

  return new ReadableStream<StreamableUint8Array>({
    async pull(controller) {
      const { done, value } = await source.read()
      if (done) {
        controller.close()
        return
      }

      controller.enqueue(normalizeChunk(value))
    },
    cancel(reason) {
      return source.cancel(reason)
    },
  })
}

function normalizeChunk(chunk: StreamableChunk): StreamableUint8Array {
  if (chunk instanceof Uint8Array) {
    return new Uint8Array(chunk)
  }

  if (chunk instanceof ArrayBuffer) {
    return new Uint8Array(chunk)
  }

  if (ArrayBuffer.isView(chunk)) {
    const { buffer, byteOffset, byteLength } = chunk
    const copy = new Uint8Array(byteLength)
    copy.set(new Uint8Array(buffer, byteOffset, byteLength))
    return copy
  }

  return textEncoder.encode(String(chunk))
}

async function readStreamToUint8Array(
  stream: ReadableStream<StreamableUint8Array>
) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let totalLength = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    const normalized = normalizeChunk(value)
    chunks.push(normalized)
    totalLength += normalized.byteLength
  }

  const combined = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }

  return combined
}

function normalizeRange(size: number, start?: number, end?: number) {
  const relativeStart = start ?? 0
  const relativeEnd = end ?? size

  const clampedStart =
    relativeStart < 0
      ? Math.max(size + relativeStart, 0)
      : Math.min(relativeStart, size)

  const clampedEnd =
    relativeEnd < 0
      ? Math.max(size + relativeEnd, 0)
      : Math.min(relativeEnd, size)

  const finalStart = Math.min(clampedStart, clampedEnd)
  const finalEnd = Math.max(clampedEnd, clampedStart)

  return {
    start: finalStart,
    end: finalEnd,
    length: Math.max(finalEnd - finalStart, 0),
  }
}
