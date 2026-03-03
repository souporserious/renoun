import { afterEach, describe, expect, test, vi } from 'vitest'

function createDeferred<Value>() {
  let resolve!: (value: Value) => void
  let reject!: (error: unknown) => void

  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return {
    promise,
    resolve,
    reject,
  }
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 500
): Promise<void> {
  const startedAt = Date.now()

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('[renoun] Timed out waiting for condition')
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('formatSourceText', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    vi.doUnmock('./load-package.ts')
  })

  test('dedupes concurrent formatter initialization', async () => {
    const format = vi.fn((sourceText: string) => sourceText)
    const resolveConfig = vi.fn(async () => ({}))
    const loadPrettier = vi.fn(async () => ({
      format,
      resolveConfig,
    }))

    vi.doMock('./load-package.ts', () => ({
      loadPrettier,
    }))

    const formatSourceTextModule = await import('./format-source-text.ts')

    await Promise.all([
      formatSourceTextModule.formatSourceText(
        'fixtures/source-one.ts',
        'const one = 1',
        'ts'
      ),
      formatSourceTextModule.formatSourceText(
        'fixtures/source-two.ts',
        'const two = 2',
        'ts'
      ),
    ])

    expect(loadPrettier).toHaveBeenCalledTimes(1)
    expect(resolveConfig).toHaveBeenCalledTimes(1)
  })

  test('prewarms prettier runtime before formatter initialization', async () => {
    const format = vi.fn((sourceText: string) => `formatted:${sourceText}`)
    const resolveConfig = vi.fn(async () => ({}))
    const deferredPrettier = createDeferred<{
      format: (sourceText: string) => string
      resolveConfig: (filePath: string) => Promise<Record<string, unknown>>
    }>()
    const loadPrettier = vi.fn(async () => deferredPrettier.promise)

    vi.doMock('./load-package.ts', () => ({
      loadPrettier,
    }))

    const formatSourceTextModule = await import('./format-source-text.ts')

    formatSourceTextModule.prewarmSourceTextFormatterRuntime()

    await waitFor(() => loadPrettier.mock.calls.length === 1)
    expect(formatSourceTextModule.getSourceTextFormatterStateVersion()).toBe(0)
    expect(resolveConfig).toHaveBeenCalledTimes(0)

    deferredPrettier.resolve({
      format,
      resolveConfig: async (filePath: string) => resolveConfig(filePath),
    })
    await deferredPrettier.promise

    const formattedResult = await formatSourceTextModule.formatSourceText(
      'fixtures/runtime-prewarm.ts',
      'const value = 1',
      'ts'
    )

    expect(formattedResult).toBe('formatted:const value = 1')
    expect(loadPrettier).toHaveBeenCalledTimes(1)
    expect(resolveConfig).toHaveBeenCalledTimes(1)
    expect(formatSourceTextModule.getSourceTextFormatterStateVersion()).toBe(1)
  })

  test('returns immediately in non-blocking mode while formatter initializes', async () => {
    const deferredPrettier = createDeferred<{
      format: (sourceText: string) => string
      resolveConfig: (filePath: string) => Promise<Record<string, unknown>>
    }>()
    const loadPrettier = vi.fn(async () => deferredPrettier.promise)

    vi.doMock('./load-package.ts', () => ({
      loadPrettier,
    }))

    const formatSourceTextModule = await import('./format-source-text.ts')

    const fastResult = await formatSourceTextModule.formatSourceText(
      'fixtures/inline.ts',
      'const value = 1',
      'ts',
      false,
      { nonBlocking: true }
    )

    expect(fastResult).toBe('const value = 1')
    expect(loadPrettier).toHaveBeenCalledTimes(1)
    expect(formatSourceTextModule.getSourceTextFormatterStateVersion()).toBe(0)

    deferredPrettier.resolve({
      format(sourceText: string) {
        return `formatted:${sourceText}`
      },
      async resolveConfig() {
        return {}
      },
    })

    await waitFor(() => {
      return formatSourceTextModule.getSourceTextFormatterStateVersion() === 1
    })

    const formattedResult = await formatSourceTextModule.formatSourceText(
      'fixtures/inline.ts',
      'const value = 2',
      'ts'
    )

    expect(formattedResult).toBe('formatted:const value = 2')
  })

  test('skips formatter loading when language has no parser and formatting is implicit', async () => {
    const loadPrettier = vi.fn(async () => ({
      format(sourceText: string) {
        return `formatted:${sourceText}`
      },
      async resolveConfig() {
        return {}
      },
    }))

    vi.doMock('./load-package.ts', () => ({
      loadPrettier,
    }))

    const formatSourceTextModule = await import('./format-source-text.ts')
    const result = await formatSourceTextModule.formatSourceText(
      'fixtures/script.sh',
      'echo hello',
      'shell'
    )

    expect(result).toBe('echo hello')
    expect(loadPrettier).not.toHaveBeenCalled()
  })
})
