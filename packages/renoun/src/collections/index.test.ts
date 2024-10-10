import type { ComponentType } from 'react'
import { describe, it, expect } from 'vitest'

import { Collection, CompositeCollection } from './index'

describe('collections', () => {
  it('merges composite collection siblings', async () => {
    const CollectionsCollection = new Collection({
      filePattern: 'src/collections/index.tsx',
      baseDirectory: 'collections',
    })
    const ComponentsCollection = new Collection<{
      [key: string]: ComponentType
    }>({
      filePattern: 'src/components/**/*.{ts,tsx}',
      baseDirectory: 'components',
    })
    const AllCollections = new CompositeCollection(
      CollectionsCollection,
      ComponentsCollection
    )
    const source = AllCollections.getSource('collections/index')!
    const [, nextSource] = await source.getSiblings()

    expect(nextSource).toBeDefined()
  })
})
