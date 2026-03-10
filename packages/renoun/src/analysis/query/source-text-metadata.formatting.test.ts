import { afterEach, describe, expect, test, vi } from 'vitest'

import { getTsMorph } from '../../utils/ts-morph.ts'

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

const { Project } = getTsMorph()

describe('getSourceTextMetadata formatting', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    vi.doUnmock('../../utils/env.ts')
    vi.doUnmock('../../utils/load-package.ts')
  })

  test('waits for implicit formatting on the first development render', async () => {
    const deferredPrettier = createDeferred<{
      format: (sourceText: string) => string
      resolveConfig: (filePath: string) => Promise<Record<string, unknown>>
    }>()
    const loadPrettier = vi.fn(async () => deferredPrettier.promise)

    vi.doMock('../../utils/env.ts', async () => {
      const actual = await vi.importActual<typeof import('../../utils/env.ts')>(
        '../../utils/env.ts'
      )

      return {
        ...actual,
        isProductionEnvironment: () => false,
        isTestEnvironment: () => false,
        isVitestRuntime: () => false,
      }
    })

    vi.doMock('../../utils/load-package.ts', () => ({
      loadPrettier,
    }))

    const { getSourceTextMetadata } = await import('./source-text-metadata.ts')
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    let didResolve = false

    const metadataPromise = getSourceTextMetadata({
      project,
      value: 'export const answer={value:1}\n',
      language: 'ts',
    }).then((result) => {
      didResolve = true
      return result
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(didResolve).toBe(false)
    expect(loadPrettier).toHaveBeenCalledTimes(1)

    deferredPrettier.resolve({
      format(sourceText: string) {
        return `formatted:${sourceText}`
      },
      async resolveConfig() {
        return {}
      },
    })

    const result = await metadataPromise

    expect(result.value).toContain('formatted:export const answer={value:1}\n')
  })
})
