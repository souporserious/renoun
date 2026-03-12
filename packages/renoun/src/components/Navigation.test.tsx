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

vi.mock('../file-system/index.tsx', () => ({
  isDirectory: (...args: Parameters<typeof isDirectoryMock>) =>
    isDirectoryMock(...args),
  isFile: (...args: Parameters<typeof isFileMock>) => isFileMock(...args),
}))

interface FakeFileEntry {
  kind: 'file'
  name: string
  depth: number
  getPathname: () => string
  getParent: () => FakeDirectoryEntry
}

interface FakeDirectoryEntry {
  kind: 'directory'
  name: string
  depth: number
  workspacePath: string
  getPathname: () => string
  getEntries: (options?: {
    recursive?: boolean
  }) => Promise<readonly (FakeDirectoryEntry | FakeFileEntry)[]>
  getParent: () => FakeDirectoryEntry
}

interface FakeDirectorySource extends FakeDirectoryEntry {
  getFilterPatternKind: () => 'recursive' | 'shallow' | null
}

interface FakeCollectionSource {
  getEntries: () => Promise<readonly (FakeDirectoryEntry | FakeFileEntry)[]>
}

function createFakeDirectoryEntry(
  pathname: string,
  options?: {
    parent?: FakeDirectoryEntry
    getEntries?: (options?: {
      recursive?: boolean
    }) => Promise<readonly (FakeDirectoryEntry | FakeFileEntry)[]>
    getFilterPatternKind?: () => 'recursive' | 'shallow' | null
  }
): FakeDirectorySource {
  return {
    kind: 'directory',
    name: pathname.split('/').filter(Boolean).at(-1) ?? '',
    depth: pathname.split('/').filter(Boolean).length - 1,
    workspacePath: pathname.replace(/^\/+/, '') || '.',
    getPathname: () => pathname,
    getFilterPatternKind: options?.getFilterPatternKind ?? (() => 'recursive'),
    getEntries: options?.getEntries ?? (async () => []),
    getParent: () => {
      if (options?.parent) {
        return options.parent
      }

      throw new Error('The root directory does not have a parent directory.')
    },
  }
}

function createFakeFileEntry(
  name: string,
  pathname: string,
  parent: FakeDirectoryEntry
): FakeFileEntry {
  return {
    kind: 'file',
    name,
    depth: pathname.split('/').filter(Boolean).length - 1,
    getPathname: () => pathname,
    getParent: () => parent,
  }
}

describe('Navigation', () => {
  beforeEach(() => {
    vi.resetModules()
    isDirectoryMock.mockClear()
    isFileMock.mockClear()
  })

  test('renders entries from a directory source', async () => {
    const rootDirectory = createFakeDirectoryEntry('/docs')
    const source = createFakeDirectoryEntry('/docs', {
      getEntries: vi.fn(async () => [
        createFakeFileEntry('Guide', '/docs/guide', rootDirectory),
      ]),
    })

    const { Navigation } = await import('./Navigation.tsx')
    const element = await Navigation({ source: source as any })
    const markup = renderToStaticMarkup(<>{element}</>)

    expect(source.getEntries).toHaveBeenCalledTimes(1)
    expect(markup).toContain('Guide')
  })

  test('renders entries from a collection source', async () => {
    const rootDirectory = createFakeDirectoryEntry('/guides')
    const source: FakeCollectionSource = {
      getEntries: vi.fn(async () => [
        createFakeFileEntry('Quickstart', '/guides/quickstart', rootDirectory),
      ]),
    }

    const { Navigation } = await import('./Navigation.tsx')
    const element = await Navigation({ source: source as any })
    const markup = renderToStaticMarkup(<>{element}</>)

    expect(source.getEntries).toHaveBeenCalledTimes(1)
    expect(markup).toContain('Quickstart')
  })

  test('renders nested directory entries recursively', async () => {
    const rootDirectory = createFakeDirectoryEntry('/docs')
    const guidesDirectory = createFakeDirectoryEntry('/docs/guides', {
      parent: rootDirectory,
    })
    const nestedEntry = createFakeFileEntry(
      'Deep Dive',
      '/docs/guides/deep-dive',
      guidesDirectory
    )

    guidesDirectory.getEntries = vi.fn(async () => [nestedEntry])
    rootDirectory.getEntries = vi.fn(async () => [guidesDirectory])

    const { Navigation } = await import('./Navigation.tsx')
    const element = await Navigation({ source: rootDirectory as any })
    const markup = renderToStaticMarkup(<>{element}</>)

    expect(rootDirectory.getEntries).toHaveBeenCalledWith()
    expect(guidesDirectory.getEntries).toHaveBeenCalledWith()
    expect(markup).toContain('guides')
    expect(markup).toContain('Deep Dive')
  })

  test('keeps synthesized predicate-filtered ancestors scoped to filtered children', async () => {
    const rootDirectory = createFakeDirectoryEntry('/docs', {
      getFilterPatternKind: () => null,
    })
    const guidesDirectory = createFakeDirectoryEntry('/docs/guides', {
      parent: rootDirectory,
    })
    const advancedDirectory = createFakeDirectoryEntry(
      '/docs/guides/advanced',
      {
        parent: guidesDirectory,
      }
    )
    const draftsDirectory = createFakeDirectoryEntry('/docs/guides/drafts', {
      parent: guidesDirectory,
    })
    const nestedEntry = createFakeFileEntry(
      'Deep Dive',
      '/docs/guides/advanced/deep-dive',
      advancedDirectory
    )

    guidesDirectory.getEntries = vi.fn(async () => [
      advancedDirectory,
      draftsDirectory,
    ])
    advancedDirectory.getEntries = vi.fn(async () => [nestedEntry])
    rootDirectory.getEntries = vi.fn(
      async (options?: { recursive?: boolean }) =>
        options?.recursive ? [nestedEntry] : []
    )

    const { Navigation } = await import('./Navigation.tsx')
    const element = await Navigation({ source: rootDirectory as any })
    const markup = renderToStaticMarkup(<>{element}</>)

    expect(rootDirectory.getEntries).toHaveBeenCalledWith()
    expect(rootDirectory.getEntries).toHaveBeenCalledWith({ recursive: true })
    expect(guidesDirectory.getEntries).not.toHaveBeenCalled()
    expect(advancedDirectory.getEntries).not.toHaveBeenCalled()
    expect(markup).toContain('guides')
    expect(markup).toContain('advanced')
    expect(markup).toContain('Deep Dive')
    expect(markup).not.toContain('drafts')
  })

  test('keeps synthesized predicate-filtered ancestors in the recursive sort order', async () => {
    const rootDirectory = createFakeDirectoryEntry('/docs', {
      getFilterPatternKind: () => null,
    })
    const alphaDirectory = createFakeDirectoryEntry('/docs/a', {
      parent: rootDirectory,
    })
    const nestedDirectory = createFakeDirectoryEntry('/docs/a/nested', {
      parent: alphaDirectory,
    })
    const synthesizedDescendant = createFakeFileEntry(
      'Alpha Deep Dive',
      '/docs/a/nested/alpha-deep-dive',
      nestedDirectory
    )
    const directEntry = createFakeFileEntry('Zed', '/docs/z', rootDirectory)

    rootDirectory.getEntries = vi.fn(
      async (options?: { recursive?: boolean }) =>
        options?.recursive
          ? [synthesizedDescendant, directEntry]
          : [directEntry]
    )

    const { Navigation } = await import('./Navigation.tsx')
    const element = await Navigation({ source: rootDirectory as any })
    const markup = renderToStaticMarkup(<>{element}</>)

    expect(markup.indexOf('href="/docs/a"')).toBeLessThan(
      markup.indexOf('href="/docs/z"')
    )
  })

  test('reuses the precomputed recursive tree without rescanning directories', async () => {
    const rootDirectory = createFakeDirectoryEntry('/docs', {
      getFilterPatternKind: () => null,
    })
    const guidesDirectory = createFakeDirectoryEntry('/docs/guides', {
      parent: rootDirectory,
    })
    const advancedDirectory = createFakeDirectoryEntry(
      '/docs/guides/advanced',
      {
        parent: guidesDirectory,
      }
    )
    const draftsDirectory = createFakeDirectoryEntry('/docs/guides/drafts', {
      parent: guidesDirectory,
    })
    const emptyDirectory = createFakeDirectoryEntry('/docs/empty', {
      parent: rootDirectory,
    })
    const nestedEntry = createFakeFileEntry(
      'Deep Dive',
      '/docs/guides/advanced/deep-dive',
      advancedDirectory
    )

    guidesDirectory.getEntries = vi.fn(async () => [advancedDirectory])
    advancedDirectory.getEntries = vi.fn(async () => [nestedEntry])
    draftsDirectory.getEntries = vi.fn(async () => [])
    emptyDirectory.getEntries = vi.fn(async () => [])
    rootDirectory.getEntries = vi.fn(
      async (options?: { recursive?: boolean }) =>
        options?.recursive
          ? [guidesDirectory, advancedDirectory, nestedEntry]
          : [guidesDirectory, emptyDirectory]
    )

    const { Navigation } = await import('./Navigation.tsx')
    const element = await Navigation({ source: rootDirectory as any })
    const markup = renderToStaticMarkup(<>{element}</>)

    expect(rootDirectory.getEntries).toHaveBeenCalledWith()
    expect(rootDirectory.getEntries).toHaveBeenCalledWith({ recursive: true })
    expect(guidesDirectory.getEntries).not.toHaveBeenCalled()
    expect(advancedDirectory.getEntries).not.toHaveBeenCalled()
    expect(markup).toContain('guides')
    expect(markup).toContain('advanced')
    expect(markup).toContain('empty')
    expect(markup).toContain('Deep Dive')
    expect(markup).not.toContain('drafts')
  })
})
