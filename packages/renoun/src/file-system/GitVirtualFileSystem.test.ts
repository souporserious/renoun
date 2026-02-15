import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GitVirtualFileSystem } from './GitVirtualFileSystem.ts'
import { disposeDefaultCacheStorePersistence } from './CacheStoreSqlite.ts'
import { FileSystemSnapshot } from './Snapshot.ts'
import { Session } from './Session.ts'
import type { ExportHistoryGenerator, ExportHistoryReport } from './types.ts'
import { Directory } from './index.tsx'
import * as exportAnalysis from './export-analysis.ts'

/** Drain a generator to get the final report. */
async function drain(
  gen: ExportHistoryGenerator
): Promise<ExportHistoryReport> {
  let result = await gen.next()
  while (!result.done) result = await gen.next()
  return result.value
}

const SUCCESS_ARCHIVE = makeTar([
  { path: 'root/file.txt', content: 'hello' },
  { path: 'root/dir/a.md', content: '# title' },
])

describe('GitVirtualFileSystem', () => {
  const originalFetch = globalThis.fetch
  let previousCacheDbPath: string | undefined
  let cacheDbDirectory: string | undefined

  beforeEach(() => {
    vi.useRealTimers()

    previousCacheDbPath = process.env.RENOUN_FS_CACHE_DB_PATH
    cacheDbDirectory = mkdtempSync(
      join(tmpdir(), 'renoun-git-virtual-cache-test-')
    )

    process.env.RENOUN_FS_CACHE_DB_PATH = join(
      cacheDbDirectory,
      '.cache',
      'renoun',
      'fs-cache.sqlite'
    )

    disposeDefaultCacheStorePersistence()
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
    const githubFs = new GitVirtualFileSystem({
      repository: 'my.user/repo.name',
      host: 'github',
      ref: 'feature-xy',
    })
    await githubFs.readFile('file.txt')
    let [url] = mockFetch.mock.calls.at(-1)!
    expect(url).toMatch(/repos\/my\.user\/repo\.name\/tarball\/feature-xy$/)

    // Bitbucket
    const bitbucketFs = new GitVirtualFileSystem({
      repository: 'my.user/repo.name',
      host: 'bitbucket',
      ref: 'feature-xy',
    })
    await bitbucketFs.readFile('file.txt')
    ;[url] = mockFetch.mock.calls.at(-1)!
    expect(url).toMatch(
      /repositories\/my\.user\/repo\.name\/src\/feature-xy\?format=tar\.gz$/
    )

    // Self-hosted GitLab (supports nested groups)
    const gitlabFs = new GitVirtualFileSystem({
      repository: 'group/sub/project',
      host: 'gitlab',
      baseUrl: 'https://git.example.com',
      ref: 'main',
    })
    await gitlabFs.readFile('file.txt')
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

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      token: 'token',
      ref: 'main',
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
      new GitVirtualFileSystem({
        repository: 'owner/repo',
        host: 'github',
        ref: 'main',
      }).readFile('file.txt')
    ).rejects.toThrow('Unexpected content-type')
  })

  it('keeps fetch failures consistent in development and production', async () => {
    const archiveRequest = '/repos/owner/env-consistency/tarball/main'
    const requestFailure = async (nodeEnv: string) => {
      const previousNodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = nodeEnv

      const mockFetch = vi.fn(async (input: unknown) => {
        const url = String(input)

        if (url.includes(archiveRequest)) {
          return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            headers: createHeaders({}),
            json: async () => ({}),
          } as Response
        }

        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: createHeaders({}),
          json: async () => ({}),
        } as Response
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      try {
        const fs = new GitVirtualFileSystem({
          repository: 'owner/env-consistency',
          host: 'github',
          ref: 'main',
        })

        try {
          await fs.readFile('file.txt')
          throw new Error('Expected read failure')
        } catch (error) {
          return {
            message: error instanceof Error ? error.message : String(error),
            calls: mockFetch.mock.calls.length,
          }
        }
      } finally {
        process.env.NODE_ENV = previousNodeEnv
      }
    }

    const development = await requestFailure('development')
    const production = await requestFailure('production')

    expect(production.message).toBe(development.message)
    expect(development.calls).toBeGreaterThan(0)
    expect(production.calls).toBeGreaterThan(0)
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

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref: 'main',
    })
    await expect(fs.readFile('file.txt')).resolves.toBe('v1')
    fs.clearCache()
    await expect(fs.readFile('file.txt')).resolves.toBe('after')
  })

  it('clearCache invalidates branch-scoped session cache entries', async () => {
    const archive = makeTar([
      { path: 'root/.keep', content: `` },
      { path: 'root/src/index.ts', content: `export const a = 1` },
    ])

    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (url.includes('/repos/owner/clear-cache-repo/tarball/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(archive).buffer,
        } as Response
      }

      if (url.includes('/repos/owner/clear-cache-repo/commits/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({ sha: 'c2' }),
        } as Response
      }

      if (
        url.includes('/repos/owner/clear-cache-repo/commits?sha=main') &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [
            {
              sha: 'c2',
              commit: {
                author: { date: '2024-02-01T00:00:00Z' },
              },
            },
            {
              sha: 'c1',
              commit: {
                author: { date: '2024-01-01T00:00:00Z' },
              },
            },
          ],
        } as Response
      }

      if (
        url.includes('raw.githubusercontent.com/owner/clear-cache-repo/c1/') &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export const a = 1`,
        } as Response
      }

      if (
        url.includes('raw.githubusercontent.com/owner/clear-cache-repo/c2/') &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export const a = 1; export const b = 2`,
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        text: async () => '',
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const fs = new GitVirtualFileSystem({
      repository: 'owner/clear-cache-repo',
      host: 'github',
      ref: 'main',
    })

    await drain(
      fs.getExportHistory({
        entry: 'src/index.ts',
        detectUpdates: false,
      })
    )

    fs.clearCache()

    await drain(
      fs.getExportHistory({
        entry: 'src/index.ts',
        detectUpdates: false,
      })
    )

    const commitHistoryCalls = mockFetch.mock.calls.filter(([request]) =>
      String(request).includes('/repos/owner/clear-cache-repo/commits?sha=main')
    ).length

    expect(commitHistoryCalls).toBe(2)
  })

  it('recomputes export parsing after ref fallback switches branches', async () => {
    let defaultBranch = 'develop'
    const developArchive = makeTar([
      { path: 'root/index.ts', content: 'export const developValue = 1' },
    ])
    const mainArchive = makeTar([
      { path: 'root/index.ts', content: 'export const mainValue = 2' },
    ])

    const getArchive = (branch: string) => {
      if (branch === 'develop') {
        return developArchive
      }
      if (branch === 'main') {
        return mainArchive
      }
      return undefined
    }

    const mockFetch = vi.fn().mockImplementation(async (input: unknown) => {
      const url = String(input)

      if (url === 'https://api.github.com/repos/owner/fallback-reparse') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({ default_branch: defaultBranch }),
        } as Response
      }

      if (url.includes('/repos/owner/fallback-reparse/commits?sha=')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [],
        } as Response
      }

      if (url.includes('/repos/owner/fallback-reparse/tarball/')) {
        const ref = url.split('/tarball/')[1]
        const archive = getArchive(ref)

        if (!archive) {
          return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
            headers: createHeaders({}),
            text: async () => '',
          } as Response
        }

        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => archive,
        } as unknown as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        json: async () => ({}),
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const fs = new GitVirtualFileSystem({
      repository: 'owner/fallback-reparse',
      host: 'github',
    })

    const scanSpy = vi.spyOn(exportAnalysis, 'scanModuleExports')

    await expect(
      drain(
        fs.getExportHistory({
          entry: 'index.ts',
          detectUpdates: false,
        })
      )
    ).resolves.toEqual(
      expect.objectContaining({
        exports: expect.objectContaining({
          './index.ts::developValue': expect.any(Array),
        }),
      })
    )

    fs.clearCache()

    defaultBranch = 'main'
    await expect(
      drain(
        fs.getExportHistory({
          entry: 'index.ts',
          detectUpdates: false,
        })
      )
    ).resolves.toEqual(
      expect.objectContaining({
        exports: expect.objectContaining({
          './index.ts::mainValue': expect.any(Array),
        }),
      })
    )

    expect(scanSpy).toHaveBeenCalledTimes(2)
    expect(fs.getCacheIdentity().ref).toBe('main')
  })

  it('prevents stale export parse reuse when fallback ref changes during concurrent export queries', async () => {
    let resolveMainArchive:
      | ((response: Response | PromiseLike<Response>) => void)
      | undefined
    const mainArchive = new Promise<Response>((resolve) => {
      resolveMainArchive = resolve
    })
    const masterArchive = makeTar([
      { path: 'root/index.ts', content: 'export const masterValue = 2' },
    ])

    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (url === 'https://api.github.com/repos/owner/concurrent-ref-switch') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({ default_branch: 'main' }),
        } as Response
      }

      if (url.includes('/repos/owner/concurrent-ref-switch/commits?sha=')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [],
        } as Response
      }

      if (url.includes('/repos/owner/concurrent-ref-switch/tarball/main')) {
        return mainArchive
      }

      if (url.includes('/repos/owner/concurrent-ref-switch/tarball/master')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(masterArchive).buffer,
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        json: async () => ({}),
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const sessionResetSpy = vi.spyOn(Session, 'reset')
    const scanSpy = vi.spyOn(exportAnalysis, 'scanModuleExports')

    const fs = new GitVirtualFileSystem({
      repository: 'owner/concurrent-ref-switch',
      host: 'github',
    })

    const first = drain(
      fs.getExportHistory({
        entry: 'index.ts',
        detectUpdates: false,
      })
    )
    const second = drain(
      fs.getExportHistory({
        entry: 'index.ts',
        detectUpdates: false,
      })
    )

    await Promise.resolve()

    if (!resolveMainArchive) {
      throw new Error(
        'Expected pending main archive request to be initialized.'
      )
    }

    resolveMainArchive({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: createHeaders({}),
      json: async () => ({}),
    } as Response)

    const [firstReport, secondReport] = await Promise.all([first, second])

    expect(firstReport.exports).toEqual(
      expect.objectContaining({
        './index.ts::masterValue': expect.any(Array),
      })
    )
    expect(secondReport.exports).toEqual(
      expect.objectContaining({
        './index.ts::masterValue': expect.any(Array),
      })
    )
    expect(scanSpy).toHaveBeenCalledTimes(1)
    expect(fs.getCacheIdentity().ref).toBe('master')
    expect(sessionResetSpy.mock.calls.some((call) => call[0] === fs)).toBe(true)
  })

  it('clearCache force-resets all session families', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({
        'content-type': 'application/octet-stream',
      }),
      arrayBuffer: async () => SUCCESS_ARCHIVE,
    } as unknown as Response)
    globalThis.fetch = mockFetch as unknown as typeof fetch

    const sessionResetSpy = vi.spyOn(Session, 'reset')

    const fs = new GitVirtualFileSystem({
      repository: 'owner/clear-cache-force',
      host: 'github',
      ref: 'main',
    })

    await fs.readFile('file.txt')

    const activeSession = Session.for(fs)
    const alternateSnapshot = new FileSystemSnapshot(
      fs,
      `${activeSession.snapshot.id}:clear-cache-force-alt`
    )
    const alternateSession = Session.for(fs, alternateSnapshot)

    const activeClear = vi.spyOn(activeSession.cache, 'clearMemory')
    const alternateClear = vi.spyOn(alternateSession.cache, 'clearMemory')

    fs.clearCache()

    expect(sessionResetSpy).toHaveBeenCalledTimes(1)
    const [resetFileSystem, resetFamilyId] = sessionResetSpy.mock.calls[0] ?? []
    expect(resetFileSystem).toBe(fs)
    expect(resetFamilyId).toBeUndefined()

    expect(activeClear).toHaveBeenCalledTimes(1)
    expect(alternateClear).toHaveBeenCalledTimes(1)
  })

  it('resets existing sessions when ref fallback switches branches', async () => {
    let resolveMainArchive:
      | ((response: Response | PromiseLike<Response>) => void)
      | undefined
    const mainArchive = new Promise<Response>((resolve) => {
      resolveMainArchive = resolve
    })
    const masterArchive = makeTar([
      { path: 'root/file.txt', content: 'fallback' },
    ])

    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (url.includes('/repos/owner/ref-fallback/tarball/main')) {
        return mainArchive
      }

      if (url.includes('/repos/owner/ref-fallback/tarball/master')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(masterArchive).buffer,
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        json: async () => ({}),
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const sessionResetSpy = vi.spyOn(Session, 'reset')
    const fs = new GitVirtualFileSystem({
      repository: 'owner/ref-fallback',
      host: 'github',
      ref: 'main',
    })
    const directory = new Directory({ fileSystem: fs })
    const entriesPromise = directory.getEntries({
      includeIndexAndReadmeFiles: true,
    })

    await Promise.resolve()

    if (!resolveMainArchive) {
      throw new Error(
        'Expected pending main archive request to be initialized.'
      )
    }

    resolveMainArchive({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: createHeaders({}),
      json: async () => ({}),
    } as Response)

    await expect(entriesPromise).resolves.toBeDefined()
    expect(fs.getCacheIdentity().ref).toBe('master')
    expect(sessionResetSpy.mock.calls.some((call) => call[0] === fs)).toBe(true)
  })

  it('clearCache settles in-flight GitHub blame requests', async () => {
    const archive = makeTar([{ path: 'root/file.txt', content: 'hello' }])
    let graphQlCalls = 0

    const mockFetch = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input)

      if (url.includes('/repos/owner/clear-cache-blame/tarball/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(archive).buffer,
        } as Response
      }

      if (url === 'https://api.github.com/graphql') {
        graphQlCalls += 1

        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal

          if (signal?.aborted) {
            reject(new Error('aborted'))
            return
          }

          signal?.addEventListener(
            'abort',
            () => {
              reject(new Error('aborted'))
            },
            { once: true }
          )
        })
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        json: async () => ({}),
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const fs = new GitVirtualFileSystem({
      repository: 'owner/clear-cache-blame',
      host: 'github',
      token: 'token',
      ref: 'main',
    })

    vi.spyOn(fs, 'getGitFileMetadata').mockResolvedValue({
      authors: [],
      firstCommitDate: new Date('2024-01-01T00:00:00Z'),
      lastCommitDate: new Date('2024-02-01T00:00:00Z'),
    })

    await fs.readFile('file.txt')

    const inFlight = fs.getGitExportMetadata('/file.txt', 1, 1)
    for (let attempt = 0; attempt < 20 && graphQlCalls === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }

    fs.clearCache()

    const settled = await Promise.race([
      inFlight.then(
        () => 'resolved',
        () => 'rejected'
      ),
      new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), 200)
      ),
    ])

    expect(graphQlCalls).toBeGreaterThan(0)
    expect(settled).not.toBe('timeout')
  })

  it('creates distinct session snapshots per repository for cache isolation', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({ 'content-type': 'application/octet-stream' }),
      arrayBuffer: async () => SUCCESS_ARCHIVE,
    })
    globalThis.fetch = mockFetch as unknown as typeof fetch

    const first = new GitVirtualFileSystem({
      repository: 'owner/snapshot-a',
      host: 'github',
      ref: 'main',
    })
    const second = new GitVirtualFileSystem({
      repository: 'owner/snapshot-b',
      host: 'github',
      ref: 'main',
    })

    const firstSnapshotId = new FileSystemSnapshot(first).id
    const secondSnapshotId = new FileSystemSnapshot(second).id

    expect(firstSnapshotId).not.toBe(secondSnapshotId)

    await Promise.all([first.readFile('file.txt'), second.readFile('file.txt')])
  })

  it('isolates persisted gitlab cache entries by baseUrl', async () => {
    const deterministicRef = 'a'.repeat(40)
    const archive = makeTar([
      { path: 'root/.keep', content: `` },
      { path: 'root/src/index.ts', content: `export const value = 1` },
    ])
    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (
        url.includes(
          `/api/v4/projects/group%2Fcached-repo/repository/archive.tar.gz?sha=${deterministicRef}`
        )
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(archive).buffer,
        } as Response
      }

      if (
        url.startsWith(
          'https://gitlab.one/api/v4/projects/group%2Fcached-repo/repository/commits?'
        ) &&
        url.includes('path=src%2Findex.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [
            {
              id: 'one',
              committed_date: '2024-01-01T00:00:00Z',
              author_name: 'One',
              author_email: 'one@example.com',
            },
          ],
        } as Response
      }

      if (
        url.startsWith(
          'https://gitlab.two/api/v4/projects/group%2Fcached-repo/repository/commits?'
        ) &&
        url.includes('path=src%2Findex.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [
            {
              id: 'two',
              committed_date: '2024-02-01T00:00:00Z',
              author_name: 'Two',
              author_email: 'two@example.com',
            },
          ],
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        json: async () => ({}),
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const firstFs = new GitVirtualFileSystem({
      repository: 'group/cached-repo',
      host: 'gitlab',
      baseUrl: 'https://gitlab.one',
      ref: deterministicRef,
    })
    const secondFs = new GitVirtualFileSystem({
      repository: 'group/cached-repo',
      host: 'gitlab',
      baseUrl: 'https://gitlab.two',
      ref: deterministicRef,
    })

    const firstMetadata = await firstFs.getGitFileMetadata('src/index.ts')
    const secondMetadata = await secondFs.getGitFileMetadata('src/index.ts')

    expect(firstMetadata.firstCommitDate?.toISOString()).toBe(
      '2024-01-01T00:00:00.000Z'
    )
    expect(secondMetadata.firstCommitDate?.toISOString()).toBe(
      '2024-02-01T00:00:00.000Z'
    )

    const firstHostCommitCalls = mockFetch.mock.calls.filter(([request]) =>
      String(request).startsWith(
        'https://gitlab.one/api/v4/projects/group%2Fcached-repo/repository/commits?'
      )
    ).length
    const secondHostCommitCalls = mockFetch.mock.calls.filter(([request]) =>
      String(request).startsWith(
        'https://gitlab.two/api/v4/projects/group%2Fcached-repo/repository/commits?'
      )
    ).length

    expect(firstHostCommitCalls).toBe(1)
    expect(secondHostCommitCalls).toBe(1)
  })

  it('does not cache failed file metadata fetches', async () => {
    const archive = makeTar([
      { path: 'root/.keep', content: `` },
      { path: 'root/src/index.ts', content: `export const value = 1` },
    ])

    let metadataAttempts = 0
    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (url.includes('/repos/owner/metadata-retry/tarball/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(archive).buffer,
        } as Response
      }

      if (url.includes('/repos/owner/metadata-retry/commits/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({ sha: 'c2' }),
        } as Response
      }

      if (
        url.includes('/repos/owner/metadata-retry/commits?sha=main') &&
        url.includes('src%2Findex.ts')
      ) {
        metadataAttempts += 1

        if (metadataAttempts <= 3) {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: createHeaders({}),
            json: async () => ({}),
          } as Response
        }

        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [
            {
              sha: 'c2',
              commit: {
                author: { date: '2024-02-01T00:00:00Z' },
                committer: { date: '2024-02-01T00:00:00Z' },
              },
            },
            {
              sha: 'c1',
              commit: {
                author: { date: '2024-01-01T00:00:00Z' },
                committer: { date: '2024-01-01T00:00:00Z' },
              },
            },
          ],
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        json: async () => ({}),
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const fs = new GitVirtualFileSystem({
      repository: 'owner/metadata-retry',
      host: 'github',
      ref: 'main',
    })

    const firstMetadata = await fs.getGitFileMetadata('src/index.ts')
    const secondMetadata = await fs.getGitFileMetadata('src/index.ts')

    expect(firstMetadata.authors).toEqual([])
    expect(secondMetadata.authors.length).toBeGreaterThan(0)
    expect(metadataAttempts).toBe(4)
  })

  it('reuses cached directory structure for deterministic refs across instances', async () => {
    const deterministicRef = 'f'.repeat(40)
    const archive = makeTar([{ path: 'root/file.txt', content: 'hello' }])

    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (
        url.includes(`/repos/owner/structure-cache/tarball/${deterministicRef}`)
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(archive).buffer,
        } as Response
      }

      if (
        url.includes('/repos/owner/structure-cache/commits?sha=') &&
        url.includes('file.txt')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [
            {
              sha: deterministicRef,
              commit: {
                author: { date: '2024-01-01T00:00:00Z' },
              },
            },
          ],
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        json: async () => ({}),
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const firstFs = new GitVirtualFileSystem({
      repository: 'owner/structure-cache',
      host: 'github',
      ref: deterministicRef,
    })
    const firstDirectory = new Directory({ fileSystem: firstFs })

    const firstStructure = await firstDirectory.getStructure()
    const firstPaths = firstStructure
      .filter((entry) => entry.kind === 'File')
      .map((entry) => entry.relativePath)
      .sort()

    expect(firstPaths).toEqual(['file.txt'])

    const archiveCallsAfterFirstRun = mockFetch.mock.calls.filter(([request]) =>
      String(request).includes(
        `/repos/owner/structure-cache/tarball/${deterministicRef}`
      )
    ).length
    expect(archiveCallsAfterFirstRun).toBe(1)

    const commitCallsAfterFirstRun = mockFetch.mock.calls.filter(([request]) =>
      String(request).includes('/repos/owner/structure-cache/commits?sha=')
    ).length
    expect(commitCallsAfterFirstRun).toBe(1)

    const secondFs = new GitVirtualFileSystem({
      repository: 'owner/structure-cache',
      host: 'github',
      ref: deterministicRef,
    })
    const callsBeforeSecondStructure = mockFetch.mock.calls.length
    const secondDirectory = new Directory({ fileSystem: secondFs })

    const secondStructure = await secondDirectory.getStructure()
    const secondPaths = secondStructure
      .filter((entry) => entry.kind === 'File')
      .map((entry) => entry.relativePath)
      .sort()

    expect(secondPaths).toEqual(firstPaths)
    expect(mockFetch.mock.calls.length).toBe(callsBeforeSecondStructure)
  })

  it('reuses cached directory structure for deterministic refs across instances in production', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    const deterministicRef = 'e'.repeat(40)
    const archive = makeTar([{ path: 'root/file.txt', content: 'hello' }])

    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (
        url.includes(
          `/repos/owner/production-structure-cache/tarball/${deterministicRef}`
        )
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(archive).buffer,
        } as Response
      }

      if (
        url.includes('/repos/owner/production-structure-cache/commits?sha=') &&
        url.includes('file.txt')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [
            {
              sha: deterministicRef,
              commit: {
                author: { date: '2024-01-01T00:00:00Z' },
              },
            },
          ],
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        json: async () => ({}),
      } as Response
    })

    process.env.NODE_ENV = 'production'
    globalThis.fetch = mockFetch as unknown as typeof fetch

    try {
      const firstFs = new GitVirtualFileSystem({
        repository: 'owner/production-structure-cache',
        host: 'github',
        ref: deterministicRef,
      })
      const firstDirectory = new Directory({ fileSystem: firstFs })

      const firstStructure = await firstDirectory.getStructure()
      const firstPaths = firstStructure
        .filter((entry) => entry.kind === 'File')
        .map((entry) => entry.relativePath)
        .sort()

      expect(firstPaths).toEqual(['file.txt'])

      const archiveCallsAfterFirstRun = mockFetch.mock.calls.filter(
        ([request]) =>
          String(request).includes(
            `/repos/owner/production-structure-cache/tarball/${deterministicRef}`
          )
      ).length
      expect(archiveCallsAfterFirstRun).toBe(1)

      const commitCallsAfterFirstRun = mockFetch.mock.calls.filter(
        ([request]) =>
          String(request).includes(
            '/repos/owner/production-structure-cache/commits?sha='
          )
      ).length
      expect(commitCallsAfterFirstRun).toBe(1)

      const secondFs = new GitVirtualFileSystem({
        repository: 'owner/production-structure-cache',
        host: 'github',
        ref: deterministicRef,
      })
      const callsBeforeSecondStructure = mockFetch.mock.calls.length
      const secondDirectory = new Directory({ fileSystem: secondFs })

      const secondStructure = await secondDirectory.getStructure()
      const secondPaths = secondStructure
        .filter((entry) => entry.kind === 'File')
        .map((entry) => entry.relativePath)
        .sort()

      expect(secondPaths).toEqual(firstPaths)
      expect(mockFetch.mock.calls.length).toBe(callsBeforeSecondStructure)
    } finally {
      process.env.NODE_ENV = previousNodeEnv
    }
  })

  it('does not cache failed GitHub blame responses', async () => {
    const blameDate = '2024-01-15T00:00:00Z'
    let graphQlAttempts = 0
    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (url.includes('/repos/owner/blame-retry/tarball/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => SUCCESS_ARCHIVE,
        } as unknown as Response
      }

      if (url === 'https://api.github.com/graphql') {
        graphQlAttempts += 1

        if (graphQlAttempts === 1) {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: createHeaders({}),
            json: async () => ({}),
          } as Response
        }

        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({
            data: {
              repository: {
                f0: {
                  blame: {
                    ranges: [
                      {
                        startingLine: 1,
                        endingLine: 1,
                        commit: { oid: 'abc123', committedDate: blameDate },
                      },
                    ],
                  },
                },
              },
            },
          }),
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        json: async () => ({}),
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const fs = new GitVirtualFileSystem({
      repository: 'owner/blame-retry',
      host: 'github',
      token: 'token',
      ref: 'main',
    })

    vi.spyOn(fs, 'getGitFileMetadata').mockResolvedValue({
      authors: [],
      firstCommitDate: new Date('2024-01-01T00:00:00Z'),
      lastCommitDate: new Date('2024-02-01T00:00:00Z'),
    })

    const firstMetadata = await fs.getGitExportMetadata('/file.txt', 1, 1)
    const secondMetadata = await fs.getGitExportMetadata('/file.txt', 1, 1)

    expect(firstMetadata.firstCommitDate?.toISOString()).toBe(
      '2024-01-01T00:00:00.000Z'
    )
    expect(firstMetadata.lastCommitDate?.toISOString()).toBe(
      '2024-02-01T00:00:00.000Z'
    )
    expect(secondMetadata.firstCommitDate?.toISOString()).toBe(
      '2024-01-15T00:00:00.000Z'
    )
    expect(secondMetadata.lastCommitDate?.toISOString()).toBe(
      '2024-01-15T00:00:00.000Z'
    )
    expect(graphQlAttempts).toBe(2)
  })

  it('does not persist failed file-at-commit fetches', async () => {
    const archive = makeTar([
      { path: 'root/.keep', content: `` },
      { path: 'root/src/index.ts', content: `export const a = 1` },
    ])

    let c1FetchAttempts = 0
    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (url.includes('/repos/owner/blob-retry/tarball/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(archive).buffer,
        } as Response
      }

      if (url.includes('/repos/owner/blob-retry/commits/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({ sha: 'c2' }),
        } as Response
      }

      if (
        url.includes('/repos/owner/blob-retry/commits?sha=main') &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [
            {
              sha: 'c2',
              commit: {
                author: { date: '2024-02-01T00:00:00Z' },
              },
            },
            {
              sha: 'c1',
              commit: {
                author: { date: '2024-01-01T00:00:00Z' },
              },
            },
          ],
        } as Response
      }

      if (
        url.includes('raw.githubusercontent.com/owner/blob-retry/c1/') &&
        url.includes('index.ts')
      ) {
        c1FetchAttempts += 1

        if (c1FetchAttempts === 1) {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            headers: createHeaders({}),
            text: async () => '',
          } as Response
        }

        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export const a = 1`,
        } as Response
      }

      if (
        url.includes('raw.githubusercontent.com/owner/blob-retry/c2/') &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export const a = 1; export const b = 2`,
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        text: async () => '',
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const fs = new GitVirtualFileSystem({
      repository: 'owner/blob-retry',
      host: 'github',
      ref: 'main',
    })

    await drain(
      fs.getExportHistory({
        entry: 'src/index.ts',
        detectUpdates: false,
      })
    )
    await drain(
      fs.getExportHistory({
        entry: 'src/index.ts',
        detectUpdates: true,
      })
    )

    expect(c1FetchAttempts).toBe(2)
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
    disposeDefaultCacheStorePersistence()

    if (cacheDbDirectory) {
      rmSync(cacheDbDirectory, { recursive: true, force: true })
      cacheDbDirectory = undefined
    }

    if (previousCacheDbPath === undefined) {
      delete process.env.RENOUN_FS_CACHE_DB_PATH
    } else {
      process.env.RENOUN_FS_CACHE_DB_PATH = previousCacheDbPath
    }
  })

  it('infers base-name entry files when entry is a directory', async () => {
    const archive = makeTar([
      { path: 'root/.keep', content: `` },
      { path: 'root/src/foo/index.ts', content: `export const fromIndex = 1` },
      { path: 'root/src/foo/Foo.ts', content: `export const fromFoo = 1` },
      { path: 'root/src/foo/Local.ts', content: `export const local = 1` },
    ])

    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (url.includes('/repos/owner/repo/tarball/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(archive).buffer,
          redirected: false,
          type: 'basic',
          url: url,
          clone() {
            throw new Error('Not implemented')
          },
          body: null,
          bodyUsed: false,
        } as unknown as Response
      }

      if (url.includes('/repos/owner/repo/commits?sha=main&per_page=1')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [
            {
              sha: 'abc123',
              commit: {
                author: { date: '2024-01-01T00:00:00Z' },
              },
            },
          ],
        } as Response
      }

      if (url.endsWith('/abc123/src/foo/Foo.ts')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export const fromFoo = 1`,
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        text: async () => '',
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref: 'main',
    })

    const report = await drain(
      fs.getExportHistory({
        entry: 'src/foo',
        limit: 1,
        detectUpdates: false,
      })
    )

    expect(report.entryFiles).toEqual(['src/foo/index.ts', 'src/foo/Foo.ts'])
    expect(report.entryFiles).not.toContain('src/foo/Local.ts')
  })

  it('scopes export history to a specific release tag', async () => {
    const archive = makeTar([
      { path: 'root/.keep', content: `` },
      { path: 'root/src/index.ts', content: `export const foo = 1` },
    ])

    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (url.includes('/repos/owner/repo/tarball/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(archive).buffer,
        } as Response
      }

      if (url.includes('/repos/owner/repo/tags?per_page=100')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [
            { name: 'r2', commit: { sha: 'tag-r2' } },
            { name: 'r1', commit: { sha: 'tag-r1' } },
          ],
        } as Response
      }

      if (url.includes('/repos/owner/repo/compare/r1...r2')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({
            status: 'ahead',
            commits: [{ sha: 'c2' }],
          }),
        } as Response
      }

      if (
        url.includes('/repos/owner/repo/commits?sha=r2&per_page=100') &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [
            {
              sha: 'c2',
              commit: {
                author: { date: '2024-02-01T00:00:00Z' },
              },
            },
            {
              sha: 'c1',
              commit: {
                author: { date: '2024-01-01T00:00:00Z' },
              },
            },
          ],
        } as Response
      }

      if (
        url.includes('raw.githubusercontent.com/owner/repo/r1/') &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export const foo = 1`,
        } as Response
      }

      if (
        url.includes('raw.githubusercontent.com/owner/repo/c2/') &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export const foo = 1; export const bar = 2`,
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        text: async () => '',
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref: 'main',
    })

    const report = await drain(
      fs.getExportHistory({
        entry: 'src/index.ts',
        ref: 'r2',
        detectUpdates: false,
      })
    )
    expect(report.entryFiles).toHaveLength(1)
    expect(report.entryFiles[0]).toContain('src/index.ts')

    const fooId = report.nameToId['foo']?.[0]
    expect(fooId).toBeDefined()
    expect(
      report.exports[fooId!]?.find((change) => change.kind === 'Added')
    ).toBeUndefined()

    const barId = report.nameToId['bar']?.[0]
    expect(barId).toBeDefined()
    const barHistory = report.exports[barId!]
    expect(barHistory).toHaveLength(1)
    expect(barHistory[0]).toMatchObject({
      kind: 'Added',
      sha: 'c2',
      release: 'r2',
    })
    expect(
      Object.values(report.exports)
        .flat()
        .every((change) => change.release === 'r2')
    ).toBe(true)

    const rangeReport = await drain(
      fs.getExportHistory({
        entry: 'src/index.ts',
        ref: { start: 'r1', end: 'r2' },
        detectUpdates: false,
      })
    )
    const rangeBarId = rangeReport.nameToId['bar']?.[0]
    expect(rangeBarId).toBeDefined()
    expect(
      rangeReport.exports[rangeBarId!]?.some(
        (change) => change.kind === 'Added'
      )
    ).toBe(true)
  })

  it('throws when ref range object is empty', async () => {
    const archive = makeTar([
      { path: 'root/.keep', content: `` },
      { path: 'root/src/index.ts', content: `export const a = 1` },
    ])

    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)
      if (url.includes('/repos/owner/repo/tarball/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(archive).buffer,
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        text: async () => '',
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref: 'main',
    })

    await expect(
      drain(
        fs.getExportHistory({
          entry: 'src/index.ts',
          ref: {} as any,
        } as any)
      )
    ).rejects.toThrow(/start.*end/)
  })

  it('supports commit ref strings and { end } ref objects', async () => {
    const archive = makeTar([
      { path: 'root/.keep', content: `` },
      { path: 'root/src/index.ts', content: `export const a = 1` },
    ])

    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (url.includes('/repos/owner/repo/tarball/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(archive).buffer,
        } as Response
      }

      if (
        url.includes('/repos/owner/repo/commits?sha=c2&per_page=100') &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [
            {
              sha: 'c2',
              commit: {
                author: { date: '2024-02-01T00:00:00Z' },
              },
            },
            {
              sha: 'c1',
              commit: {
                author: { date: '2024-01-01T00:00:00Z' },
              },
            },
          ],
        } as Response
      }

      if (
        url.includes('raw.githubusercontent.com/owner/repo/c1/') &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export const a = 1`,
        } as Response
      }

      if (
        url.includes('raw.githubusercontent.com/owner/repo/c2/') &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export const a = 1; export const b = 2`,
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        text: async () => '',
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref: 'main',
    })

    const byString = await drain(
      fs.getExportHistory({
        entry: 'src/index.ts',
        ref: 'c2',
        detectUpdates: false,
      })
    )

    const byObject = await drain(
      fs.getExportHistory({
        entry: 'src/index.ts',
        ref: { end: 'c2' },
        detectUpdates: false,
      })
    )

    const stringBId = byString.nameToId['b']?.[0]
    const objectBId = byObject.nameToId['b']?.[0]
    expect(stringBId).toBeDefined()
    expect(objectBId).toBeDefined()
    expect(byString.exports[stringBId!]?.[0]?.sha).toBe('c2')
    expect(byObject.exports[objectBId!]?.[0]?.sha).toBe('c2')
  })

  it('recomputes branch commit history while reusing immutable blob lookups across instances', async () => {
    const commitTwo = 'c2abcdefffffffffffffffffffffffffffffffff'
    const commitOne = 'c1abcdefffffffffffffffffffffffffffffffff'
    const archive = makeTar([
      { path: 'root/.keep', content: `` },
      { path: 'root/src/index.ts', content: `export const a = 1` },
    ])

    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (url.includes('/repos/owner/incremental-cache/tarball/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(archive).buffer,
        } as Response
      }

      if (url.includes('/repos/owner/incremental-cache/commits/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({ sha: commitTwo }),
        } as Response
      }

      if (
        url.includes('/repos/owner/incremental-cache/commits?sha=main') &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [
            {
              sha: commitTwo,
              commit: {
                author: { date: '2024-02-01T00:00:00Z' },
              },
            },
            {
              sha: commitOne,
              commit: {
                author: { date: '2024-01-01T00:00:00Z' },
              },
            },
          ],
        } as Response
      }

      if (
        url.includes(
          `raw.githubusercontent.com/owner/incremental-cache/${commitOne}/`
        ) &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export const a = 1`,
        } as Response
      }

      if (
        url.includes(
          `raw.githubusercontent.com/owner/incremental-cache/${commitTwo}/`
        ) &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export const a = 1; export const b = 2`,
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        text: async () => '',
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const firstFs = new GitVirtualFileSystem({
      repository: 'owner/incremental-cache',
      host: 'github',
      ref: 'main',
    })

    const firstReport = await drain(
      firstFs.getExportHistory({
        entry: 'src/index.ts',
        detectUpdates: false,
      })
    )

    const secondFs = new GitVirtualFileSystem({
      repository: 'owner/incremental-cache',
      host: 'github',
      ref: 'main',
    })

    const secondReport = await drain(
      secondFs.getExportHistory({
        entry: 'src/index.ts',
        detectUpdates: false,
      })
    )

    expect(secondReport.nameToId).toEqual(firstReport.nameToId)
    expect(secondReport.exports).toEqual(firstReport.exports)

    const commitHistoryCalls = mockFetch.mock.calls.filter(([request]) =>
      String(request).includes(
        '/repos/owner/incremental-cache/commits?sha=main'
      )
    ).length
    const rawBlobCalls = mockFetch.mock.calls.filter(([request]) => {
      const url = String(request)
      return (
        url.includes('raw.githubusercontent.com/owner/incremental-cache/') &&
        url.includes('index.ts')
      )
    }).length

    expect(commitHistoryCalls).toBe(2)
    expect(rawBlobCalls).toBe(2)
  })

  it('does not persist commit-history cache for abbreviated commit refs', async () => {
    const shortRef = 'c2abcde'
    const commitTwo = 'c2abcdefffffffffffffffffffffffffffffffff'
    const commitOne = 'c1abcdefffffffffffffffffffffffffffffffff'
    const archive = makeTar([
      { path: 'root/.keep', content: `` },
      { path: 'root/src/index.ts', content: `export const a = 1` },
    ])

    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (url.includes(`/repos/owner/abbrev-cache/tarball/${shortRef}`)) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(archive).buffer,
        } as Response
      }

      if (url.includes(`/repos/owner/abbrev-cache/commits/${shortRef}`)) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({ sha: commitTwo }),
        } as Response
      }

      if (
        url.includes(`/repos/owner/abbrev-cache/commits?sha=${shortRef}`) &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [
            {
              sha: commitTwo,
              commit: {
                author: { date: '2024-02-01T00:00:00Z' },
              },
            },
            {
              sha: commitOne,
              commit: {
                author: { date: '2024-01-01T00:00:00Z' },
              },
            },
          ],
        } as Response
      }

      if (
        url.includes(
          `raw.githubusercontent.com/owner/abbrev-cache/${commitOne}/`
        ) &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export const a = 1`,
        } as Response
      }

      if (
        url.includes(
          `raw.githubusercontent.com/owner/abbrev-cache/${commitTwo}/`
        ) &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export const a = 1; export const b = 2`,
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        text: async () => '',
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const firstFs = new GitVirtualFileSystem({
      repository: 'owner/abbrev-cache',
      host: 'github',
      ref: shortRef,
    })
    await drain(
      firstFs.getExportHistory({
        entry: 'src/index.ts',
        detectUpdates: false,
      })
    )

    const secondFs = new GitVirtualFileSystem({
      repository: 'owner/abbrev-cache',
      host: 'github',
      ref: shortRef,
    })
    await drain(
      secondFs.getExportHistory({
        entry: 'src/index.ts',
        detectUpdates: false,
      })
    )

    const commitHistoryCalls = mockFetch.mock.calls.filter(([request]) =>
      String(request).includes(
        `/repos/owner/abbrev-cache/commits?sha=${shortRef}`
      )
    ).length

    expect(commitHistoryCalls).toBe(2)
  })

  it('does not persist file-at-commit cache for non-deterministic start refs', async () => {
    const commitTwo = 'c2abcdefffffffffffffffffffffffffffffffff'
    const archive = makeTar([
      { path: 'root/.keep', content: `` },
      { path: 'root/src/index.ts', content: `export const a = 1` },
    ])
    let mainRefVersion = 1
    let rawMainFetches = 0

    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (url.includes('/repos/owner/start-ref-cache/tarball/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(archive).buffer,
        } as Response
      }

      if (
        url.includes(`/repos/owner/start-ref-cache/commits?sha=${commitTwo}`) &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [
            {
              sha: commitTwo,
              commit: {
                author: { date: '2024-02-01T00:00:00Z' },
              },
            },
          ],
        } as Response
      }

      if (
        url.includes(`/repos/owner/start-ref-cache/compare/main...${commitTwo}`)
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({
            status: 'ahead',
            commits: [{ sha: commitTwo }],
          }),
        } as Response
      }

      if (
        url.includes('raw.githubusercontent.com/owner/start-ref-cache/main/') &&
        url.includes('index.ts')
      ) {
        rawMainFetches += 1
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () =>
            mainRefVersion === 1
              ? `export const a = 1`
              : `export const a = 1; export const b = 2`,
        } as Response
      }

      if (
        url.includes(
          `raw.githubusercontent.com/owner/start-ref-cache/${commitTwo}/`
        ) &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export const a = 1; export const b = 2`,
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        text: async () => '',
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const firstFs = new GitVirtualFileSystem({
      repository: 'owner/start-ref-cache',
      host: 'github',
      ref: 'main',
    })
    const firstReport = await drain(
      firstFs.getExportHistory({
        entry: 'src/index.ts',
        ref: { start: 'main', end: commitTwo },
        detectUpdates: false,
      })
    )

    const firstBId = firstReport.nameToId['b']?.[0]
    expect(firstBId).toBeDefined()
    expect(
      firstReport.exports[firstBId!]?.some((change) => change.kind === 'Added')
    ).toBe(true)

    mainRefVersion = 2

    const secondFs = new GitVirtualFileSystem({
      repository: 'owner/start-ref-cache',
      host: 'github',
      ref: 'main',
    })
    const secondReport = await drain(
      secondFs.getExportHistory({
        entry: 'src/index.ts',
        ref: { start: 'main', end: commitTwo },
        detectUpdates: false,
      })
    )

    const secondBId = secondReport.nameToId['b']?.[0]
    expect(secondBId).toBeDefined()
    expect(
      secondReport.exports[secondBId!]?.some(
        (change) => change.kind === 'Added'
      ) ?? false
    ).toBe(false)
    expect(rawMainFetches).toBe(2)
  })

  it('does not persist recursive file-at-commit cache for non-deterministic start refs', async () => {
    const commitTwo = 'c2abcdefffffffffffffffffffffffffffffffff'
    const archive = makeTar([
      { path: 'root/.keep', content: `` },
      { path: 'root/src/index.ts', content: `export * from './child'` },
      { path: 'root/src/child.ts', content: `export const a = 1` },
    ])
    let mainChildVersion = 1
    let rawMainChildFetches = 0

    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (url.includes('/repos/owner/start-ref-recursive-cache/tarball/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => Uint8Array.from(archive).buffer,
        } as Response
      }

      if (
        url.includes(
          `/repos/owner/start-ref-recursive-cache/commits?sha=${commitTwo}`
        ) &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => [
            {
              sha: commitTwo,
              commit: {
                author: { date: '2024-02-01T00:00:00Z' },
              },
            },
          ],
        } as Response
      }

      if (
        url.includes(
          `/repos/owner/start-ref-recursive-cache/compare/main...${commitTwo}`
        )
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({
            status: 'ahead',
            commits: [{ sha: commitTwo }],
          }),
        } as Response
      }

      if (
        url.includes(
          'raw.githubusercontent.com/owner/start-ref-recursive-cache/main/'
        ) &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export * from './child'`,
        } as Response
      }

      if (
        url.includes(
          'raw.githubusercontent.com/owner/start-ref-recursive-cache/main/'
        ) &&
        url.includes('child.ts')
      ) {
        rawMainChildFetches += 1
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () =>
            mainChildVersion === 1
              ? `export const a = 1`
              : `export const a = 1; export const b = 2`,
        } as Response
      }

      if (
        url.includes(
          `raw.githubusercontent.com/owner/start-ref-recursive-cache/${commitTwo}/`
        ) &&
        url.includes('index.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export * from './child'`,
        } as Response
      }

      if (
        url.includes(
          `raw.githubusercontent.com/owner/start-ref-recursive-cache/${commitTwo}/`
        ) &&
        url.includes('child.ts')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          text: async () => `export const a = 1; export const b = 2`,
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        text: async () => '',
      } as Response
    })

    globalThis.fetch = mockFetch as unknown as typeof fetch

    const firstFs = new GitVirtualFileSystem({
      repository: 'owner/start-ref-recursive-cache',
      host: 'github',
      ref: 'main',
    })
    const firstReport = await drain(
      firstFs.getExportHistory({
        entry: 'src/index.ts',
        ref: { start: 'main', end: commitTwo },
        detectUpdates: false,
      })
    )

    const firstBId = firstReport.nameToId['b']?.[0]
    expect(firstBId).toBeDefined()
    expect(
      firstReport.exports[firstBId!]?.some((change) => change.kind === 'Added')
    ).toBe(true)

    mainChildVersion = 2

    const secondFs = new GitVirtualFileSystem({
      repository: 'owner/start-ref-recursive-cache',
      host: 'github',
      ref: 'main',
    })
    const secondReport = await drain(
      secondFs.getExportHistory({
        entry: 'src/index.ts',
        ref: { start: 'main', end: commitTwo },
        detectUpdates: false,
      })
    )

    const secondBId = secondReport.nameToId['b']?.[0]
    expect(secondBId).toBeDefined()
    expect(
      secondReport.exports[secondBId!]?.some(
        (change) => change.kind === 'Added'
      ) ?? false
    ).toBe(false)
    expect(rawMainChildFetches).toBe(2)
  })

  it('fetches git metadata for files when using GitVirtualFileSystem', async () => {
    const commitHistory = [
      {
        sha: '3',
        commit: {
          author: {
            name: 'Bob',
            email: 'bob@example.com',
            date: '2022-03-15T12:00:00Z',
          },
        },
      },
      {
        sha: '2',
        commit: {
          author: {
            name: 'Alice',
            email: 'alice@example.com',
            date: '2021-01-01T08:00:00Z',
          },
        },
      },
      {
        sha: '1',
        commit: {
          author: {
            name: 'Alice',
            email: 'alice@example.com',
            date: '2020-06-01T08:00:00Z',
          },
        },
      },
    ]

    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input)

      if (url.includes('/repos/owner/repo/tarball/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => SUCCESS_ARCHIVE,
          url: 'https://codeload.github.com/owner/repo/tarball/main',
        } as unknown as Response
      }

      if (url.includes('/repos/owner/repo/commits/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({ sha: 'c0ffee' }),
        } as Response
      }

      if (url.includes('/repos/owner/repo/commits')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => commitHistory,
          url: 'https://api.github.com/repos/owner/repo/commits',
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        text: async () => '',
      } as Response
    })

    globalThis.fetch = mockFetch

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref: 'main',
    })

    const directory = new Directory({ fileSystem: fs })
    const file = await directory.getFile('dir/a.md')

    const firstCommitDate = await file.getFirstCommitDate()
    const lastCommitDate = await file.getLastCommitDate()
    const authors = await file.getAuthors()

    expect(mockFetch).toHaveBeenCalledTimes(3)
    const commitRequest = mockFetch.mock.calls.find(([request]) =>
      String(request).includes('/repos/owner/repo/commits?')
    )![0]
    expect(commitRequest).toContain('/repos/owner/repo/commits')
    expect(commitRequest).toContain('path=dir%2Fa.md')

    expect(firstCommitDate?.toISOString()).toBe('2020-06-01T08:00:00.000Z')
    expect(lastCommitDate?.toISOString()).toBe('2022-03-15T12:00:00.000Z')

    expect(authors).toHaveLength(2)
    expect(authors[0]).toMatchObject({
      name: 'Alice',
      commitCount: 2,
    })
    expect(authors[0]?.firstCommitDate?.toISOString()).toBe(
      '2020-06-01T08:00:00.000Z'
    )
    expect(authors[0]?.lastCommitDate?.toISOString()).toBe(
      '2021-01-01T08:00:00.000Z'
    )
    expect(authors[1]).toMatchObject({ name: 'Bob', commitCount: 1 })
  })

  it('uses ranged blame queries for export metadata when authenticated', async () => {
    const blameDate = '2024-02-01T00:00:00Z'
    const mockFetch = vi.fn(async (input: unknown, init: any = {}) => {
      const url = String(input)
      const body = init?.body

      if (url.includes('/repos/owner/repo/commits/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({ sha: 'c0ffee' }),
        } as Response
      }

      if (String(url).endsWith('/repos/owner/repo/tarball/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => SUCCESS_ARCHIVE,
        } as unknown as Response
      }

      if (
        typeof body === 'string' &&
        body.includes('blame(startLine: $start0, endLine: $end0)')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({
            data: {
              repository: {
                f0: {
                  blame: {
                    ranges: [
                      {
                        startingLine: 5,
                        endingLine: 6,
                        commit: { oid: 'abc123', committedDate: blameDate },
                      },
                    ],
                  },
                },
              },
            },
          }),
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        text: async () => '',
      } as Response
    })

    globalThis.fetch = mockFetch
    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      token: 'token',
      ref: 'main',
    })

    vi.spyOn(fs, 'getGitFileMetadata').mockResolvedValue({
      authors: [],
      firstCommitDate: undefined,
      lastCommitDate: new Date('2024-02-10T00:00:00Z'),
    })

    vi.useFakeTimers()
    const metadataPromise = fs.getGitExportMetadata('/file.txt', 5, 6)
    await vi.runAllTimersAsync()
    const metadata = await metadataPromise
    vi.useRealTimers()

    const graphqlCall = mockFetch.mock.calls.find((call): boolean => {
      const body = call[1] as { body?: string }
      return typeof body?.body === 'string' && body.body.includes('blame(')
    })![1]
    const requestBody = JSON.parse(graphqlCall.body as string)

    expect(requestBody.query).toContain(
      'blame(startLine: $start0, endLine: $end0)'
    )
    expect(requestBody.variables).toMatchObject({ start0: 5, end0: 6 })
    expect(metadata.firstCommitDate?.toISOString()).toBe(
      '2024-02-01T00:00:00.000Z'
    )
  })

  it('reuses cached superset blame ranges for nested export requests', async () => {
    const blameDate = '2024-02-02T00:00:00Z'
    const mockFetch = vi.fn(async (input: unknown, init: any = {}) => {
      const url = String(input)
      const body = init?.body

      if (url.includes('/repos/owner/repo/commits/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({ sha: 'c0ffee' }),
        } as Response
      }

      if (String(url).endsWith('/repos/owner/repo/tarball/main')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({
            'content-type': 'application/octet-stream',
          }),
          arrayBuffer: async () => SUCCESS_ARCHIVE,
        } as unknown as Response
      }

      if (
        typeof body === 'string' &&
        body.includes('blame(startLine: $start0, endLine: $end0)')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({
            data: {
              repository: {
                f0: {
                  blame: {
                    ranges: [
                      {
                        startingLine: 1,
                        endingLine: 10,
                        commit: { oid: 'def456', committedDate: blameDate },
                      },
                    ],
                  },
                },
              },
            },
          }),
        } as Response
      }

      if (
        typeof body === 'string' &&
        body.includes('blame(startLine: $start1, endLine: $end1)')
      ) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: createHeaders({}),
          json: async () => ({
            data: {
              repository: {
                f0: {
                  blame: {
                    ranges: [
                      {
                        startingLine: 1,
                        endingLine: 10,
                        commit: { oid: 'def456', committedDate: blameDate },
                      },
                    ],
                  },
                },
              },
            },
          }),
        } as Response
      }

      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: createHeaders({}),
        text: async () => '',
      } as Response
    })

    globalThis.fetch = mockFetch
    vi.useFakeTimers()

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      token: 'token',
      ref: 'main',
    })

    vi.spyOn(fs, 'getGitFileMetadata').mockResolvedValue({
      authors: [],
      firstCommitDate: undefined,
      lastCommitDate: undefined,
    })

    const initialMetadataPromise = fs.getGitExportMetadata('/file.txt', 1, 10)
    await vi.runAllTimersAsync()
    await initialMetadataPromise

    const nestedMetadataPromise = fs.getGitExportMetadata('/file.txt', 3, 4)
    await vi.runAllTimersAsync()
    const nestedMetadata = await nestedMetadataPromise

    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(nestedMetadata.firstCommitDate?.toISOString()).toBe(
      '2024-02-02T00:00:00.000Z'
    )
  })

  it('uses file-level git metadata when the file was created and last touched in one commit', async () => {
    const firstCommitDate = new Date('2024-03-01T00:00:00Z')
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: createHeaders({ 'content-type': 'application/octet-stream' }),
      arrayBuffer: async () => SUCCESS_ARCHIVE,
    })

    globalThis.fetch = mockFetch

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref: 'main',
    })

    const fileMetadataSpy = vi
      .spyOn(fs, 'getGitFileMetadata')
      .mockResolvedValue({
        authors: [],
        firstCommitDate,
        lastCommitDate: new Date(firstCommitDate.getTime()),
      })

    const metadata = await fs.getGitExportMetadata('/file.txt', 1, 5)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(fileMetadataSpy).toHaveBeenCalledWith('/file.txt')
    expect(metadata).toEqual({
      firstCommitDate,
      lastCommitDate: firstCommitDate,
    })
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

    const fs = new GitVirtualFileSystem({
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

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      token,
      ref: 'main',
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

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref: 'main',
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
    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref,
    })
    await fs.readFile('file.txt')

    const [firstUrl] = mockFetch.mock.calls[0]
    expect(firstUrl).toContain('/tarball/feature%2Fabc-1.2')
  })

  it('validates ref: rejects invalid patterns', () => {
    const invalids = ['bad..ref', 'abc\u0001', '']
    for (const ref of invalids) {
      expect(
        () =>
          new GitVirtualFileSystem({
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

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref: 'main',
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

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref: 'main',
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

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      token,
      ref: 'main',
    })
    await fs.readFile('file.txt')

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

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref: 'main',
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

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref: 'main',
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

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref: 'main',
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

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref: 'main',
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

    const fs = new GitVirtualFileSystem({
      repository: 'owner/repo',
      host: 'github',
      ref: 'main',
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
    globalThis.fetch = mockFetch

    const fs = new GitVirtualFileSystem({
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
