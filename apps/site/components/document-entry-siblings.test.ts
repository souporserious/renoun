import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Collection, MDXFile } from 'renoun'

import { getDocumentEntrySiblings } from './document-entry-siblings'

describe('getDocumentEntrySiblings', () => {
  const mutableProcessEnv = process.env as Record<string, string | undefined>
  const previousNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    vi.restoreAllMocks()
    if (previousNodeEnv === undefined) {
      delete mutableProcessEnv['NODE_ENV']
    } else {
      mutableProcessEnv['NODE_ENV'] = previousNodeEnv
    }
  })

  it('keeps collection scope for index files in production', async () => {
    mutableProcessEnv['NODE_ENV'] = 'production'

    const collection = {} as Collection<any>
    const siblings: [undefined, undefined] = [undefined, undefined]
    const getSiblings = vi.fn().mockResolvedValue(siblings)
    const file = {
      baseName: 'index',
      getSiblings,
    } as unknown as MDXFile<any>

    await getDocumentEntrySiblings(file, collection)

    expect(getSiblings).toHaveBeenCalledTimes(1)
    expect(getSiblings).toHaveBeenCalledWith({ collection })
  })
})
