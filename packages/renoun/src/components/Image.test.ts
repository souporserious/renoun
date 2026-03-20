import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { __TEST_ONLY__ } from './Image.tsx'

describe('Image figma cache invalidation', () => {
  let cacheDirectory: string | undefined

  afterEach(async () => {
    if (cacheDirectory) {
      await rm(cacheDirectory, { recursive: true, force: true })
      cacheDirectory = undefined
    }
  })

  async function createCacheLocation() {
    cacheDirectory = await mkdtemp(join(tmpdir(), 'renoun-figma-cache-'))
    return __TEST_ONLY__.resolveFigmaCacheLocation(cacheDirectory)
  }

  test('does not reuse cached figma files when the cache key changes', async () => {
    const cacheLocation = await createCacheLocation()
    const cacheOptions = {
      label: 'Docs/Button',
      scale: 1,
    }
    const firstKey = __TEST_ONLY__.getFigmaCacheKey({
      fileId: 'file-id',
      selector: 'Docs/Button',
      options: {
        scale: 1,
        background: undefined,
        useAbsoluteBounds: undefined,
        svgOutlineText: false,
        svgIncludeId: false,
        svgIncludeNodeId: false,
        svgSimplifyStroke: true,
      },
      version: 'v1',
    })
    const secondKey = __TEST_ONLY__.getFigmaCacheKey({
      fileId: 'file-id',
      selector: 'Docs/Button',
      options: {
        scale: 1,
        background: undefined,
        useAbsoluteBounds: undefined,
        svgOutlineText: false,
        svgIncludeId: false,
        svgIncludeNodeId: false,
        svgSimplifyStroke: true,
      },
      version: 'v2',
    })

    await __TEST_ONLY__.writeFigmaCacheFile(
      firstKey,
      'png',
      Uint8Array.from([1, 2, 3]).buffer,
      cacheLocation,
      cacheOptions
    )

    expect(
      await __TEST_ONLY__.readCachedFigmaImage(
        firstKey,
        cacheLocation,
        cacheOptions
      )
    ).toMatchObject({
      format: 'png',
    })

    expect(
      await __TEST_ONLY__.readCachedFigmaImage(
        secondKey,
        cacheLocation,
        cacheOptions
      )
    ).toBeNull()
  })

  test('keeps stale figma files available as a fallback when the exact key misses', async () => {
    const cacheLocation = await createCacheLocation()
    const cacheOptions = {
      label: 'Docs/Button',
      scale: 1,
    }

    await __TEST_ONLY__.writeFigmaCacheFile(
      'exact-key',
      'png',
      Uint8Array.from([1, 2, 3]).buffer,
      cacheLocation,
      cacheOptions
    )

    expect(
      await __TEST_ONLY__.readCachedFigmaImage(
        'different-key',
        cacheLocation,
        cacheOptions
      )
    ).toBeNull()

    expect(
      await __TEST_ONLY__.readAnyCachedFigmaImage(cacheLocation, cacheOptions)
    ).toMatchObject({
      format: 'png',
    })
  })
})
