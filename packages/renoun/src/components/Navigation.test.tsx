import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'

interface FakeFileEntry {
  kind: 'file'
  name: string
  depth: number
  getPathname: () => string
}

interface FakeDirectoryEntry {
  kind: 'directory'
  name: string
  depth: number
  getPathname: () => string
}

type FakeEntry = FakeDirectoryEntry | FakeFileEntry

interface FakeNavigationEntry {
  entry: FakeEntry
  children?: FakeNavigationEntry[]
}

interface FakeNavigationSource {
  getTree: () => Promise<readonly FakeNavigationEntry[]>
}

function createFakeDirectoryEntry(pathname: string): FakeDirectoryEntry {
  return {
    kind: 'directory',
    name: pathname.split('/').filter(Boolean).at(-1) ?? '',
    depth: pathname.split('/').filter(Boolean).length - 1,
    getPathname: () => pathname,
  }
}

function createFakeFileEntry(name: string, pathname: string): FakeFileEntry {
  return {
    kind: 'file',
    name,
    depth: pathname.split('/').filter(Boolean).length - 1,
    getPathname: () => pathname,
  }
}

describe('Navigation', () => {
  test('renders entries from a directory source', async () => {
    const source: FakeNavigationSource = {
      getTree: vi.fn(async () => [
        {
          entry: createFakeFileEntry('Guide', '/docs/guide'),
        },
      ]),
    }

    const { Navigation } = await import('./Navigation.tsx')
    const element = await Navigation({ source: source as any })
    const markup = renderToStaticMarkup(<>{element}</>)

    expect(source.getTree).toHaveBeenCalledTimes(1)
    expect(markup).toContain('Guide')
  })

  test('renders entries from a collection source', async () => {
    const source: FakeNavigationSource = {
      getTree: vi.fn(async () => [
        {
          entry: createFakeFileEntry('Quickstart', '/guides/quickstart'),
        },
      ]),
    }

    const { Navigation } = await import('./Navigation.tsx')
    const element = await Navigation({ source: source as any })
    const markup = renderToStaticMarkup(<>{element}</>)

    expect(source.getTree).toHaveBeenCalledTimes(1)
    expect(markup).toContain('Quickstart')
  })

  test('renders nested navigation entries recursively', async () => {
    const guidesDirectory = createFakeDirectoryEntry('/docs/guides')
    const advancedDirectory = createFakeDirectoryEntry('/docs/guides/advanced')
    const nestedEntry = createFakeFileEntry(
      'Deep Dive',
      '/docs/guides/advanced/deep-dive'
    )
    const source: FakeNavigationSource = {
      getTree: vi.fn(async () => [
        {
          entry: guidesDirectory,
          children: [
            {
              entry: advancedDirectory,
              children: [{ entry: nestedEntry }],
            },
          ],
        },
      ]),
    }

    const { Navigation } = await import('./Navigation.tsx')
    const element = await Navigation({ source: source as any })
    const markup = renderToStaticMarkup(<>{element}</>)

    expect(source.getTree).toHaveBeenCalledTimes(1)
    expect(markup).toContain('guides')
    expect(markup).toContain('advanced')
    expect(markup).toContain('Deep Dive')
  })
})
