import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { gzipSync } from 'node:zlib'
import { GitHostFileSystem } from './GitHostFileSystem.js'

const SUCCESS_ARCHIVE = makeTar([
  { path: 'root/file.txt', content: 'hello' },
  { path: 'root/dir/a.md', content: '# title' },
])

describe('GitHostFileSystem', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.useRealTimers()
  })

  it('builds encoded URLs for each host and self-hosted GitLab', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({}),
      arrayBuffer: async () => SUCCESS_ARCHIVE,
    })
    globalThis.fetch = mockFetch

    // GitHub
    new GitHostFileSystem({
      repository: 'my.user/repo.name',
      host: 'github',
      ref: 'feature-xy',
    })
    let [url] = mockFetch.mock.calls.at(-1)!
    expect(url).toMatch(/repos\/my\.user\/repo\.name\/tarball\/feature-xy$/)

    // Bitbucket
    new GitHostFileSystem({
      repository: 'my.user/repo.name',
      host: 'bitbucket',
      ref: 'feature-xy',
    })
    ;[url] = mockFetch.mock.calls.at(-1)!
    expect(url).toMatch(
      /repositories\/my\.user\/repo\.name\/src\/feature-xy\?format=tar\.gz$/
    )

    // Self-hosted GitLab (supports nested groups)
    new GitHostFileSystem({
      repository: 'group/sub/project',
      host: 'gitlab',
      baseUrl: 'https://git.example.com',
    })
    ;[url] = mockFetch.mock.calls.at(-1)!
    expect(url).toMatch(
      /^https:\/\/git\.example\.com\/api\/v4\/projects\/group%2Fsub%2Fproject\/repository\/archive\.tar\.gz\?sha=/
    )
  })

  it('enforces PAX header size caps and content-type sanity', async () => {
    // Oversized PAX header chunk: we simulate by crafting a PAX header entry with long content
    const long = 'x'.repeat(300 * 1024)
    const archive = makeTarWithEntries([
      { path: 'root/file.txt', content: 'ok' },
      // PAX extended header typeflag 'x' (0x78)
      { path: 'root/pax', content: long, typeflag: 0x78 },
    ])

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({ 'content-type': 'application/octet-stream' }),
      arrayBuffer: async () => archive,
    })
    globalThis.fetch = mockFetch

    const fs = new GitHostFileSystem({
      repository: 'owner/repo',
      host: 'github',
    })
    await expect(fs.readFile('file.txt')).rejects.toThrow()

    // Content-type sanity: text/html should fail
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({ 'content-type': 'text/html; charset=utf-8' }),
      arrayBuffer: async () => archive,
    } as any)
    await expect(
      new GitHostFileSystem({
        repository: 'owner/repo',
        host: 'github',
      }).readFile('file.txt')
    ).rejects.toThrow('Unexpected content-type')
  })

  it('abort in-flight load on clearCache', async () => {
    const firstArchive = makeTar([{ path: 'root/file.txt', content: 'v1' }])
    const secondArchive = makeTar([{ path: 'root/file.txt', content: 'after' }])

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: createHeaders({ 'content-type': 'application/octet-stream' }),
        arrayBuffer: async () => firstArchive,
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: createHeaders({ 'content-type': 'application/octet-stream' }),
        arrayBuffer: async () => secondArchive,
      } as any)
    globalThis.fetch = mockFetch

    const fs = new GitHostFileSystem({
      repository: 'owner/repo',
      host: 'github',
    })
    await expect(fs.readFile('file.txt')).resolves.toBe('v1')
    fs.clearCache()
    await expect(fs.readFile('file.txt')).resolves.toBe('after')
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('loads archive and reads files (unauthenticated public)', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(SUCCESS_ARCHIVE)
        controller.close()
      },
    })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({ 'content-type': 'application/octet-stream' }),
      body,
    })
    globalThis.fetch = mockFetch

    const fs = new GitHostFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref: 'main',
    })

    // Access without awaiting constructor: triggers init
    expect(await fs.readFile('file.txt')).toBe('hello')
    const dir = await fs.readDirectory('.')
    expect(dir.map((d) => d.name).sort()).toEqual(['dir', 'file.txt'])

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('follows allowed redirect and sends auth to trusted download origin (codeload)', async () => {
    const token = 'secret-token'

    const redirectResponse = {
      ok: false,
      status: 302,
      statusText: 'Found',
      headers: createHeaders({
        location: 'https://codeload.github.com/owner/repo/legacy.tar.gz/main',
      }),
      arrayBuffer: async () => new ArrayBuffer(0),
    }

    const successBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(SUCCESS_ARCHIVE)
        controller.close()
      },
    })
    const successResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({ 'content-type': 'application/octet-stream' }),
      body: successBody,
    }

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse)
      .mockResolvedValueOnce(successResponse)
    globalThis.fetch = mockFetch

    const fs = new GitHostFileSystem({
      repository: 'owner/repo',
      host: 'github',
      token,
    })
    expect(await fs.readFile('file.txt')).toBe('hello')

    expect(mockFetch).toHaveBeenCalledTimes(2)
    const [firstUrl, firstInit] = mockFetch.mock.calls[0]
    const [secondUrl, secondInit] = mockFetch.mock.calls[1]

    expect(firstUrl).toMatch(/^https:\/\/api\.github\.com\//)
    expect(firstInit.headers['Authorization']).toBe(`Bearer ${token}`)
    expect(secondUrl).toMatch(/^https:\/\/codeload\.github\.com\//)
    expect(secondInit.headers['Authorization']).toBe(`Bearer ${token}`)
  })

  it('rejects disallowed redirect origin', async () => {
    const redirectResponse = {
      ok: false,
      status: 302,
      statusText: 'Found',
      headers: createHeaders({ location: 'https://evil.example/repo.tar.gz' }),
      arrayBuffer: async () => new ArrayBuffer(0),
    }

    const mockFetch = vi.fn().mockResolvedValue(redirectResponse)
    globalThis.fetch = mockFetch

    const fs = new GitHostFileSystem({
      repository: 'owner/repo',
      host: 'github',
    })
    await expect(fs.readFile('file.txt')).rejects.toThrow(
      '[renoun] Redirected to disallowed origin'
    )
  })

  it('validates ref: accepts and encodes', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({}),
      arrayBuffer: async () => SUCCESS_ARCHIVE,
    })
    globalThis.fetch = mockFetch

    const ref = 'feature/abc-1.2'
    new GitHostFileSystem({ repository: 'owner/repo', host: 'github', ref })

    const [firstUrl] = mockFetch.mock.calls[0]
    expect(firstUrl).toContain('/tarball/feature%2Fabc-1.2')
  })

  it('validates ref: rejects invalid patterns', () => {
    const invalids = ['bad..ref', 'abc\u0001', '']
    for (const ref of invalids) {
      expect(
        () =>
          new GitHostFileSystem({
            repository: 'owner/repo',
            host: 'github',
            ref,
          })
      ).toThrow('Invalid ref')
    }
  })

  it('throws on invalid tar header checksum', async () => {
    // Create a valid tar, then corrupt header checksum bytes
    const valid = makeTar([{ path: 'root/file.txt', content: 'hello' }])
    const corrupted = Buffer.from(valid)
    for (let i = 0; i < 7; i++) corrupted[148 + i] = '0'.charCodeAt(0)
    corrupted[155] = 0x20

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(corrupted)
        controller.close()
      },
    })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({ 'content-type': 'application/octet-stream' }),
      body,
    })
    globalThis.fetch = mockFetch

    const fs = new GitHostFileSystem({
      repository: 'owner/repo',
      host: 'github',
    })
    await expect(fs.readFile('file.txt')).rejects.toThrow(
      'Invalid tar header checksum'
    )
  })

  it('throws on duplicate paths in archive', async () => {
    const duplicateArchive = makeTar([
      { path: 'root/a.txt', content: 'first' },
      { path: 'root/a.txt', content: 'second' },
    ])
    const dupBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(duplicateArchive)
        controller.close()
      },
    })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({ 'content-type': 'application/octet-stream' }),
      body: dupBody,
    })
    globalThis.fetch = mockFetch

    const fs = new GitHostFileSystem({
      repository: 'owner/repo',
      host: 'github',
    })
    await expect(fs.readFile('a.txt')).rejects.toThrow('Duplicate path')
  })

  it('sets expected GitHub headers when token is provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({}),
      arrayBuffer: async () => SUCCESS_ARCHIVE,
    })
    globalThis.fetch = mockFetch

    const token = 'test-token'

    new GitHostFileSystem({ repository: 'owner/repo', host: 'github', token })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers['Authorization']).toBe(`Bearer ${token}`)
    expect(init.headers['User-Agent']).toBe('renoun')
    expect(init.headers['Accept']).toBe('application/vnd.github.v3+json')
  })

  it('retries after rate limit using Retry-After and then succeeds', async () => {
    vi.useFakeTimers()

    const rateLimitedResponse = {
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: createHeaders({
        'retry-after': '0',
        'x-ratelimit-remaining': '0',
      }),
      arrayBuffer: async () => new ArrayBuffer(0),
    }

    const successResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({}),
      arrayBuffer: async () => SUCCESS_ARCHIVE,
    }

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(rateLimitedResponse)
      .mockResolvedValueOnce(successResponse)
    globalThis.fetch = mockFetch

    const fs = new GitHostFileSystem({
      repository: 'owner/repo',
      host: 'github',
    })

    const readPromise = fs.readFile('file.txt')
    await vi.advanceTimersByTimeAsync(1000)
    await expect(readPromise).resolves.toBe('hello')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('clearCache clears files and reloads on next read', async () => {
    const first = makeTar([{ path: 'root/file.txt', content: 'v1' }])
    const second = makeTar([{ path: 'root/file.txt', content: 'v2' }])

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: createHeaders({}),
        arrayBuffer: async () => first,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: createHeaders({}),
        arrayBuffer: async () => second,
      })
    globalThis.fetch = mockFetch

    const fs = new GitHostFileSystem({
      repository: 'owner/repo',
      host: 'github',
    })
    expect(await fs.readFile('file.txt')).toBe('v1')

    fs.clearCache()
    expect(await fs.readFile('file.txt')).toBe('v2')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('streaming: handles gzipped tar bodies', async () => {
    const gz = gzipSync(SUCCESS_ARCHIVE)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(gz)
        controller.close()
      },
    })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({ 'content-type': 'application/gzip' }),
      body,
    })
    globalThis.fetch = mockFetch

    const fs = new GitHostFileSystem({
      repository: 'owner/repo',
      host: 'github',
    })
    await expect(fs.readFile('file.txt')).resolves.toBe('hello')
  })

  it('streaming: skips overlarge file and keeps smaller ones', async () => {
    const big = Buffer.alloc(8 * 1024 * 1024 + 1024, 1)
    const tar = makeTar([
      { path: 'root/a.txt', content: 'ok' },
      { path: 'root/b.bin', content: big },
      { path: 'root/c.txt', content: 'ok2' },
    ])

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(tar)
        controller.close()
      },
    })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({ 'content-type': 'application/octet-stream' }),
      body,
    })
    globalThis.fetch = mockFetch

    const fs = new GitHostFileSystem({
      repository: 'owner/repo',
      host: 'github',
    })
    await expect(fs.readFile('a.txt')).resolves.toBe('ok')
    await expect(fs.readFile('c.txt')).resolves.toBe('ok2')
    await expect(fs.readFile('b.bin')).rejects.toThrow('File not found')
  })

  it('arrayBuffer fallback: skips overlarge file and keeps smaller ones', async () => {
    const big = Buffer.alloc(8 * 1024 * 1024 + 1024, 1)
    const tar = makeTar([
      { path: 'root/a.txt', content: 'ok' },
      { path: 'root/b.bin', content: big },
      { path: 'root/c.txt', content: 'ok2' },
    ])

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({ 'content-type': 'application/octet-stream' }),
      arrayBuffer: async () => tar,
    })
    globalThis.fetch = mockFetch

    const fs = new GitHostFileSystem({
      repository: 'owner/repo',
      host: 'github',
    })

    await expect(fs.readFile('a.txt')).resolves.toBe('ok')
    await expect(fs.readFile('c.txt')).resolves.toBe('ok2')
    await expect(fs.readFile('b.bin')).rejects.toThrow('File not found')
  })

  it('streaming: caps redirect chain to 2 and errors on 3+', async () => {
    const redirect = {
      ok: false,
      status: 302,
      statusText: 'Found',
      headers: createHeaders({
        location: 'https://codeload.github.com/owner/repo/legacy.tar.gz/main',
      }),
      arrayBuffer: async () => new ArrayBuffer(0),
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(SUCCESS_ARCHIVE)
        controller.close()
      },
    })
    const success = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({ 'content-type': 'application/octet-stream' }),
      body,
    }

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(redirect)
      .mockResolvedValueOnce(redirect)
      .mockResolvedValueOnce(redirect)
      .mockResolvedValueOnce(success)
    globalThis.fetch = mockFetch

    const fs = new GitHostFileSystem({
      repository: 'owner/repo',
      host: 'github',
    })
    await expect(fs.readFile('file.txt')).rejects.toThrow('Too many redirects')
  })
})

function writeOctalField(
  target: Buffer,
  offset: number,
  length: number,
  value: number
) {
  const str = Math.max(0, value).toString(8)
  const field = Buffer.alloc(length, 0x30) // '0' padding
  const start = Math.max(0, length - 2 - str.length)
  Buffer.from(str).copy(field, start)
  field[length - 2] = 0 // null
  field[length - 1] = 0x20 // space
  field.copy(target, offset)
}

function createTarHeader(
  name: string,
  size: number,
  typeflag: number = 0x30
): Buffer {
  const header = Buffer.alloc(512, 0)

  // name (100)
  Buffer.from(name).copy(header, 0, 0, Math.min(100, Buffer.byteLength(name)))

  // mode (8), uid (8), gid (8)
  writeOctalField(header, 100, 8, 0o777)
  writeOctalField(header, 108, 8, 0)
  writeOctalField(header, 116, 8, 0)

  // size (12) and mtime (12)
  writeOctalField(header, 124, 12, size)
  writeOctalField(header, 136, 12, Math.floor(Date.now() / 1000))

  // chksum (8) - set spaces for calculation
  for (let i = 0; i < 8; i++) header[148 + i] = 0x20

  // typeflag (1)
  header[156] = typeflag

  // magic (6) + version (2) -> 'ustar\0' + '00'
  Buffer.from('ustar\0').copy(header, 257)
  Buffer.from('00').copy(header, 263)

  // Compute checksum: sum of all bytes of header
  let sum = 0
  for (let i = 0; i < 512; i++) sum += header[i]
  const chksumOctal = sum.toString(8)
  const chksumField = Buffer.alloc(8, 0x30) // '0' padding
  Buffer.from(chksumOctal).copy(chksumField, 8 - 1 - chksumOctal.length - 1)
  chksumField[6] = 0 // null
  chksumField[7] = 0x20 // space
  chksumField.copy(header, 148)

  return header
}

function makeTar(
  entries: { path: string; content: string | Buffer }[]
): Buffer {
  const parts: Buffer[] = []
  for (const entry of entries) {
    const contentBuf = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content, 'utf8')
    const header = createTarHeader(entry.path, contentBuf.length)
    parts.push(header)
    parts.push(contentBuf)
    const pad = (512 - (contentBuf.length % 512)) % 512
    if (pad) parts.push(Buffer.alloc(pad, 0))
  }
  // Two 512-byte zero blocks at the end of the archive
  parts.push(Buffer.alloc(1024, 0))
  return Buffer.concat(parts)
}

function makeTarWithEntries(
  entries: { path: string; content: string | Buffer; typeflag?: number }[]
): Buffer {
  const parts: Buffer[] = []
  for (const entry of entries) {
    const contentBuf = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content, 'utf8')
    const header = createTarHeader(
      entry.path,
      contentBuf.length,
      entry.typeflag
    )
    parts.push(header)
    parts.push(contentBuf)
    const pad = (512 - (contentBuf.length % 512)) % 512
    if (pad) parts.push(Buffer.alloc(pad, 0))
  }
  parts.push(Buffer.alloc(1024, 0))
  return Buffer.concat(parts)
}

function createHeaders(init?: Record<string, string>) {
  const map = new Map<string, string>()
  if (init) {
    for (const [key, value] of Object.entries(init)) {
      map.set(key.toLowerCase(), value)
    }
  }
  return {
    get: (key: string) => map.get(key.toLowerCase()) ?? null,
  }
}
