import type { ComponentType } from 'react'
import { describe, it, expect } from 'vitest'

import { collection } from './index'

describe('collections', () => {
  it('merges composite collection siblings', async () => {
    const CollectionsCollection = collection({
      filePattern: 'src/collections/index.tsx',
      baseDirectory: 'collections',
    })
    const ComponentsCollection = collection<{
      [key: string]: ComponentType
    }>({
      filePattern: 'src/components/**/*.{ts,tsx}',
      baseDirectory: 'components',
    })
    const AllCollections = collection(
      CollectionsCollection,
      ComponentsCollection
    )
    const source = AllCollections.getSource('collections/index')!
    const [, nextSource] = await source.getSiblings()

    expect(nextSource).toBeDefined()
  })
})
