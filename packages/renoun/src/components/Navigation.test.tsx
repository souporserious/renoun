import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const isDirectoryMock = vi.fn((entry: unknown) => {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    (entry as { kind?: string }).kind === 'directory'
  )
})
const isFileMock = vi.fn((entry: unknown) => {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    (entry as { kind?: string }).kind === 'file'
  )
})
const isDevelopmentEnvironmentMock = vi.fn(() => true)

vi.mock('../file-system/index.tsx', () => ({
  isDirectory: (...args: Parameters<typeof isDirectoryMock>) =>
    isDirectoryMock(...args),
  isFile: (...args: Parameters<typeof isFileMock>) => isFileMock(...args),
}))

vi.mock('../utils/env.ts', () => ({
  isDevelopmentEnvironment: (
    ...args: Parameters<typeof isDevelopmentEnvironmentMock>
  ) => isDevelopmentEnvironmentMock(...args),
}))

vi.mock('../utils/best-effort.ts', () => ({
  reportBestEffortError: vi.fn(),
}))

interface FakeFileEntry {
  kind: 'file'
  name: string
  depth: number
  getPathname: () => string
}

interface FakeDirectorySource {
  kind: 'directory'
  getPathname: () => string
  getFilterPatternKind: () => string
  getSession: () => {
    snapshot: {
      onInvalidate: (listener: (path: string) => void) => () => void
    }
  }
  getEntries: (options?: { recursive?: boolean }) => Promise<readonly FakeFileEntry[]>
}

function createFakeFileEntry(name: string, pathname: string): FakeFileEntry {
  return {
    kind: 'file',
    name,
    depth: pathname.split('/').filter(Boolean).length - 1,
    getPathname: () => pathname,
  }
}

describe('Navigation development SWR', () => {
  beforeEach(() => {
    vi.resetModules()
    isDirectoryMock.mockClear()
    isFileMock.mockClear()
    isDevelopmentEnvironmentMock.mockReset()
    isDevelopmentEnvironmentMock.mockReturnValue(true)
  })

  test('returns refreshed entries immediately after invalidation', async () => {
    let invalidateListener: ((path: string) => void) | undefined
    const onInvalidate = vi.fn((listener: (path: string) => void) => {
      invalidateListener = listener
      return () => {}
    })

    let currentEntries: readonly FakeFileEntry[] = [
      createFakeFileEntry('Old Page', '/docs/old-page'),
    ]

    const source: FakeDirectorySource = {
      kind: 'directory',
      getPathname: () => '/docs',
      getFilterPatternKind: () => 'deep',
      getSession: () => ({ snapshot: { onInvalidate } }),
      getEntries: vi.fn(async () => currentEntries),
    }

    const { Navigation } = await import('./Navigation.tsx')

    const firstElement = await Navigation({ source: source as any })
    const firstMarkup = renderToStaticMarkup(<>{firstElement}</>)
    expect(firstMarkup).toContain('Old Page')
    expect(onInvalidate).toHaveBeenCalledTimes(1)
    expect(source.getEntries).toHaveBeenCalledTimes(1)
    expect(invalidateListener).toBeTypeOf('function')

    currentEntries = [createFakeFileEntry('New Page', '/docs/new-page')]
    invalidateListener?.('/docs/new-page.mdx')

    const secondElement = await Navigation({ source: source as any })
    const secondMarkup = renderToStaticMarkup(<>{secondElement}</>)
    expect(source.getEntries).toHaveBeenCalledTimes(2)
    expect(secondMarkup).toContain('New Page')
    expect(secondMarkup).not.toContain('Old Page')
  })

  test('does not refresh unrelated navigation sources after another source invalidates', async () => {
    let firstInvalidateListener: ((path: string) => void) | undefined
    let secondInvalidateListener: ((path: string) => void) | undefined
    const firstOnInvalidate = vi.fn((listener: (path: string) => void) => {
      firstInvalidateListener = listener
      return () => {}
    })
    const secondOnInvalidate = vi.fn((listener: (path: string) => void) => {
      secondInvalidateListener = listener
      return () => {}
    })

    const firstSource: FakeDirectorySource = {
      kind: 'directory',
      getPathname: () => '/docs',
      getFilterPatternKind: () => 'deep',
      getSession: () => ({ snapshot: { onInvalidate: firstOnInvalidate } }),
      getEntries: vi.fn(async () => [
        createFakeFileEntry('Docs Page', '/docs/page'),
      ]),
    }
    const secondSource: FakeDirectorySource = {
      kind: 'directory',
      getPathname: () => '/guides',
      getFilterPatternKind: () => 'deep',
      getSession: () => ({ snapshot: { onInvalidate: secondOnInvalidate } }),
      getEntries: vi.fn(async () => [
        createFakeFileEntry('Guide Page', '/guides/page'),
      ]),
    }

    const { Navigation } = await import('./Navigation.tsx')

    await Navigation({ source: firstSource as any })
    await Navigation({ source: secondSource as any })

    expect(firstSource.getEntries).toHaveBeenCalledTimes(1)
    expect(secondSource.getEntries).toHaveBeenCalledTimes(1)
    expect(firstInvalidateListener).toBeTypeOf('function')
    expect(secondInvalidateListener).toBeTypeOf('function')

    secondInvalidateListener?.('/guides/updated.mdx')

    await Navigation({ source: firstSource as any })
    await Navigation({ source: secondSource as any })

    expect(firstSource.getEntries).toHaveBeenCalledTimes(1)
    expect(secondSource.getEntries).toHaveBeenCalledTimes(2)
  })
})
