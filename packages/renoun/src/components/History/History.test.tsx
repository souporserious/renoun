import React from 'react'
import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type {
  ExportHistoryReport,
  RepositoryExportHistoryOptions,
} from '../../file-system/index.tsx'

const originalNodeEnv = process.env.NODE_ENV

function restoreNodeEnv() {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = originalNodeEnv
  }
}

function isAbortError(error: unknown): boolean {
  return String(error).toLowerCase().includes('abort')
}

async function renderShellToString(
  element: React.ReactElement,
  marker: string,
  timeoutMs = 500
) {
  return new Promise<string>((resolve, reject) => {
    const stream = new PassThrough()
    let html = ''
    let settled = false
    let shellReady = false

    const finish = (value?: string, error?: unknown) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      stream.destroy()

      if (error) {
        reject(error)
      } else {
        resolve(value ?? html)
      }
    }

    const { pipe, abort } = renderToPipeableStream(element, {
      onShellReady() {
        shellReady = true
        pipe(stream)
      },
      onShellError(error) {
        finish(undefined, error)
      },
      onError(error) {
        if (!settled && !isAbortError(error)) {
          finish(undefined, error)
        }
      },
    })

    stream.setEncoding('utf8')
    stream.on('data', (chunk: string) => {
      html += chunk
      if (html.includes(marker)) {
        try {
          abort()
        } catch {
          // ignore
        }
        finish(html)
      }
    })
    stream.on('error', (error) => {
      if (!settled && !isAbortError(error)) {
        finish(undefined, error)
      }
    })
    stream.on('end', () => finish(html))

    const timeout = setTimeout(() => {
      try {
        abort()
      } catch {
        // ignore
      }

      if (shellReady) {
        finish(html)
      } else {
        finish(
          undefined,
          new Error(`renderShellToString timed out after ${timeoutMs}ms`)
        )
      }
    }, timeoutMs)
  })
}

async function renderToStringAsync(
  element: React.ReactElement,
  timeoutMs = 30_000
) {
  return new Promise<string>((resolve, reject) => {
    const stream = new PassThrough()
    const chunks: Buffer[] = []
    let settled = false

    const finish = (error?: unknown) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)

      if (error) {
        reject(error)
      } else {
        resolve(Buffer.concat(chunks).toString('utf8'))
      }
    }

    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    stream.on('error', (error) => finish(error))
    stream.on('end', () => finish())

    const { pipe, abort } = renderToPipeableStream(element, {
      onAllReady() {
        pipe(stream)
      },
      onShellError(error) {
        finish(error)
      },
      onError(error) {
        finish(error)
      },
    })

    const timeout = setTimeout(() => {
      try {
        abort()
      } catch {
        // ignore
      }
      finish(new Error(`renderToStringAsync timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })
}

afterEach(() => {
  restoreNodeEnv()
  vi.resetModules()
})

describe('History', () => {
  test('renders progress fallback in the shell before the first history event resolves', async () => {
    const { History } = await import('./History.tsx')

    async function* createBlockedHistory() {
      await new Promise(() => {})
      return {
        generatedAt: new Date(0).toISOString(),
        repo: 'repo',
        entryFiles: [],
        exports: {},
        nameToId: {},
        lastCommitSha: 'head',
      } satisfies ExportHistoryReport
    }

    const html = await renderShellToString(
      <History
        source={createBlockedHistory()}
        components={{
          Progress: () => <p>Loading history...</p>,
        }}
      />,
      'Loading history...'
    )

    expect(html).toContain('Loading history...')
  }, 5_000)

  test('accepts repository-like sources and forwards sourceOptions', async () => {
    const { History } = await import('./History.tsx')
    const report: ExportHistoryReport = {
      generatedAt: new Date(0).toISOString(),
      repo: 'repo',
      entryFiles: ['src/index.ts'],
      exports: {
        'src/index.ts::Foo': [
          {
            kind: 'Added',
            sha: 'abc123',
            unix: 0,
            date: new Date(0).toISOString(),
            release: 'v1.0.0',
            name: 'Foo',
            filePath: 'src/index.ts',
            id: 'src/index.ts::Foo',
          },
        ],
      },
      nameToId: {
        Foo: ['src/index.ts::Foo'],
      },
      lastCommitSha: 'abc123',
    }

    const getExportHistory = vi.fn(
      (options?: RepositoryExportHistoryOptions) =>
        (async function* () {
          expect(options).toEqual({ entry: 'src/index.ts' })
          return report
        })()
    )

    const html = await renderToStringAsync(
      <History
        source={{ getExportHistory }}
        sourceOptions={{ entry: 'src/index.ts' }}
        components={{
          Complete: ({ exportCount }) => <p>Exports: {exportCount}</p>,
        }}
      />
    )

    expect(getExportHistory).toHaveBeenCalled()
    expect(html).toMatch(/Exports:\s*<!-- -->1/)
  })
})
