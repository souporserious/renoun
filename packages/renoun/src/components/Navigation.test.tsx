import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

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

const originalFinalizationRegistry = globalThis.FinalizationRegistry

class MockFinalizationRegistry<HeldValue> {
  static instances: MockFinalizationRegistry<any>[] = []

  readonly #callback: (heldValue: HeldValue) => void
  readonly #heldValues: HeldValue[] = []

  constructor(callback: (heldValue: HeldValue) => void) {
    this.#callback = callback
    MockFinalizationRegistry.instances.push(this)
  }

  register(_target: object, heldValue: HeldValue): void {
    this.#heldValues.push(heldValue)
  }

  cleanupNext(): void {
    const nextHeldValue = this.#heldValues.shift()
    if (nextHeldValue !== undefined) {
      this.#callback(nextHeldValue)
    }
  }

  static reset(): void {
    MockFinalizationRegistry.instances = []
  }
}

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
  getPathname: () => string
  getEntries: (
    options?: { recursive?: boolean }
  ) => Promise<readonly (FakeDirectoryEntry | FakeFileEntry)[]>
  getParent: () => FakeDirectoryEntry
  getSession: () => {
    snapshot: {
      onInvalidate: (listener: (path: string) => void) => () => void
    }
  }
}

interface FakeDirectorySource extends FakeDirectoryEntry {
  getFilterPatternKind: () => 'recursive' | 'shallow' | null
}

interface FakeCollectionSource {
  getEntries: () => Promise<readonly (FakeDirectoryEntry | FakeFileEntry)[]>
  getRootEntries: () => readonly FakeDirectoryEntry[]
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return {
    promise,
    resolve,
    reject,
  }
}

function createFakeDirectoryEntry(
  pathname: string,
  options?: {
    parent?: FakeDirectoryEntry
    onInvalidate?: (listener: (path: string) => void) => () => void
    getEntries?: (
      options?: { recursive?: boolean }
    ) => Promise<readonly (FakeDirectoryEntry | FakeFileEntry)[]>
    getFilterPatternKind?: () => 'recursive' | 'shallow' | null
  }
): FakeDirectorySource {
  return {
    kind: 'directory',
    name: pathname.split('/').filter(Boolean).at(-1) ?? '',
    depth: pathname.split('/').filter(Boolean).length - 1,
    getPathname: () => pathname,
    getFilterPatternKind: options?.getFilterPatternKind ?? (() => 'recursive'),
    getSession: () => ({
      snapshot: {
        onInvalidate: options?.onInvalidate ?? (() => () => {}),
      },
    }),
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

describe('Navigation development SWR', () => {
  beforeEach(() => {
    vi.resetModules()
    isDirectoryMock.mockClear()
    isFileMock.mockClear()
    isDevelopmentEnvironmentMock.mockReset()
    isDevelopmentEnvironmentMock.mockReturnValue(true)
    MockFinalizationRegistry.reset()
    ;(globalThis as { FinalizationRegistry?: typeof FinalizationRegistry })
      .FinalizationRegistry =
      MockFinalizationRegistry as unknown as typeof FinalizationRegistry
  })

  afterEach(() => {
    ;(globalThis as { FinalizationRegistry?: typeof FinalizationRegistry })
      .FinalizationRegistry = originalFinalizationRegistry
  })

  test('returns refreshed entries immediately after invalidation', async () => {
    let invalidateListener: ((path: string) => void) | undefined
    const onInvalidate = vi.fn((listener: (path: string) => void) => {
      invalidateListener = listener
      return () => {}
    })

    let currentEntries: readonly FakeFileEntry[] = [
      createFakeFileEntry(
        'Old Page',
        '/docs/old-page',
        createFakeDirectoryEntry('/docs')
      ),
    ]

    const source = createFakeDirectoryEntry('/docs', {
      onInvalidate,
      getEntries: vi.fn(async () => currentEntries),
    })

    const { Navigation } = await import('./Navigation.tsx')

    const firstElement = await Navigation({ source: source as any })
    const firstMarkup = renderToStaticMarkup(<>{firstElement}</>)
    expect(firstMarkup).toContain('Old Page')
    expect(onInvalidate).toHaveBeenCalledTimes(1)
    expect(source.getEntries).toHaveBeenCalledTimes(1)
    expect(invalidateListener).toBeTypeOf('function')

    currentEntries = [
      createFakeFileEntry(
        'New Page',
        '/docs/new-page',
        createFakeDirectoryEntry('/docs')
      ),
    ]
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

    const firstSource = createFakeDirectoryEntry('/docs', {
      onInvalidate: firstOnInvalidate,
      getEntries: vi.fn(async () => [
        createFakeFileEntry(
          'Docs Page',
          '/docs/page',
          createFakeDirectoryEntry('/docs')
        ),
      ]),
    })
    const secondSource = createFakeDirectoryEntry('/guides', {
      onInvalidate: secondOnInvalidate,
      getEntries: vi.fn(async () => [
        createFakeFileEntry(
          'Guide Page',
          '/guides/page',
          createFakeDirectoryEntry('/guides')
        ),
      ]),
    })

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

  test('does not mark a slow refresh as current when another invalidation lands mid-flight', async () => {
    let invalidateListener: ((path: string) => void) | undefined
    const onInvalidate = vi.fn((listener: (path: string) => void) => {
      invalidateListener = listener
      return () => {}
    })

    const rootDirectory = createFakeDirectoryEntry('/docs')
    const oldEntries = [
      createFakeFileEntry('Old Page', '/docs/old-page', rootDirectory),
    ] as const
    const firstEditEntries = [
      createFakeFileEntry('First Edit', '/docs/first-edit', rootDirectory),
    ] as const
    const secondEditEntries = [
      createFakeFileEntry('Second Edit', '/docs/second-edit', rootDirectory),
    ] as const
    const slowRefresh = createDeferred<readonly FakeFileEntry[]>()
    let getEntriesCallCount = 0

    const source = createFakeDirectoryEntry('/docs', {
      onInvalidate,
      getEntries: vi.fn(async () => {
        getEntriesCallCount += 1

        if (getEntriesCallCount === 1) {
          return oldEntries
        }

        if (getEntriesCallCount === 2) {
          return slowRefresh.promise
        }

        return secondEditEntries
      }),
    })

    const { Navigation } = await import('./Navigation.tsx')

    const firstElement = await Navigation({ source: source as any })
    const firstMarkup = renderToStaticMarkup(<>{firstElement}</>)
    expect(firstMarkup).toContain('Old Page')
    expect(invalidateListener).toBeTypeOf('function')

    invalidateListener?.('/docs/first-edit.mdx')
    const secondNavigationPromise = Navigation({ source: source as any })
    await Promise.resolve()
    expect(source.getEntries).toHaveBeenCalledTimes(2)

    invalidateListener?.('/docs/second-edit.mdx')
    slowRefresh.resolve(firstEditEntries)

    const secondElement = await secondNavigationPromise
    const secondMarkup = renderToStaticMarkup(<>{secondElement}</>)
    expect(secondMarkup).toContain('First Edit')
    expect(secondMarkup).not.toContain('Second Edit')

    const thirdElement = await Navigation({ source: source as any })
    const thirdMarkup = renderToStaticMarkup(<>{thirdElement}</>)
    expect(source.getEntries).toHaveBeenCalledTimes(3)
    expect(thirdMarkup).toContain('Second Edit')
    expect(thirdMarkup).not.toContain('First Edit')
  })

  test('unsubscribes invalidation listeners when a source is finalized', async () => {
    const unsubscribe = vi.fn()
    const onInvalidate = vi.fn((_listener: (path: string) => void) => {
      return unsubscribe
    })

    const source = createFakeDirectoryEntry('/docs', {
      onInvalidate,
      getEntries: vi.fn(async () => [
        createFakeFileEntry(
          'Docs Page',
          '/docs/page',
          createFakeDirectoryEntry('/docs')
        ),
      ]),
    })

    const { Navigation } = await import('./Navigation.tsx')

    await Navigation({ source: source as any })

    expect(onInvalidate).toHaveBeenCalledTimes(1)
    expect(unsubscribe).not.toHaveBeenCalled()
    expect(MockFinalizationRegistry.instances).toHaveLength(1)

    MockFinalizationRegistry.instances[0]?.cleanupNext()

    expect(unsubscribe).toHaveBeenCalledTimes(1)

    MockFinalizationRegistry.instances[0]?.cleanupNext()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  test('refreshes collection-backed navigation when a tracked root gains its first entry', async () => {
    let invalidateListener: ((path: string) => void) | undefined
    const onInvalidate = vi.fn((listener: (path: string) => void) => {
      invalidateListener = listener
      return () => {}
    })
    const originalNodeEnv = process.env.NODE_ENV

    const rootDirectory = createFakeDirectoryEntry('/guides', {
      onInvalidate,
    })
    let currentEntries: readonly FakeFileEntry[] = []

    const source: FakeCollectionSource = {
      getRootEntries: () => [rootDirectory],
      getEntries: vi.fn(async () => currentEntries),
    }

    process.env.NODE_ENV = 'production'

    try {
      const { Navigation } = await import('./Navigation.tsx')

      const firstElement = await Navigation({ source: source as any })
      const firstList = (firstElement as React.ReactElement<any>).props
        .children as React.ReactElement<any>
      expect(React.Children.count(firstList.props.children)).toBe(0)
      expect(onInvalidate).toHaveBeenCalledTimes(1)
      expect(source.getEntries).toHaveBeenCalledTimes(1)
      expect(invalidateListener).toBeTypeOf('function')

      currentEntries = [
        createFakeFileEntry('Quickstart', '/guides/quickstart', rootDirectory),
      ]
      invalidateListener?.('/guides/quickstart.mdx')

      const secondElement = await Navigation({ source: source as any })
      const secondList = (secondElement as React.ReactElement<any>).props
        .children as React.ReactElement<any>
      const [secondItem] = React.Children.toArray(
        secondList.props.children
      ) as React.ReactElement<any>[]

      expect(source.getEntries).toHaveBeenCalledTimes(2)
      expect(secondItem?.props.entry.name).toBe('Quickstart')
    } finally {
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  test('builds ancestor directories for recursive predicate-filtered entries', async () => {
    const rootDirectory = createFakeDirectoryEntry('/docs', {
      getFilterPatternKind: () => null,
    })
    const guidesDirectory = createFakeDirectoryEntry('/docs/guides', {
      parent: rootDirectory,
    })
    const advancedDirectory = createFakeDirectoryEntry('/docs/guides/advanced', {
      parent: guidesDirectory,
    })
    const nestedEntry = createFakeFileEntry(
      'Deep Dive',
      '/docs/guides/advanced/deep-dive',
      advancedDirectory
    )
    rootDirectory.getEntries = vi.fn(async (options?: { recursive?: boolean }) =>
      options?.recursive ? [nestedEntry] : []
    )

    const { Navigation } = await import('./Navigation.tsx')

    const element = await Navigation({ source: rootDirectory as any })
    const markup = renderToStaticMarkup(<>{element}</>)

    expect(rootDirectory.getEntries).toHaveBeenCalledWith({ recursive: true })
    expect(markup).toContain('guides')
    expect(markup).toContain('advanced')
    expect(markup).toContain('Deep Dive')
  })
})
