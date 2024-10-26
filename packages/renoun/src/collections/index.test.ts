import type { ComponentType } from 'react'
import { describe, test, expect } from 'vitest'

import {
  Collection,
  CompositeCollection,
  isFileSystemSource,
  isExportSource,
  type FileSystemSource,
  type ExportSource,
} from './index'

function filterInternalSources(
  source: ExportSource<any> | FileSystemSource<any>
) {
  if (isFileSystemSource(source)) {
    if (source.isFile()) {
      const allInternal = source
        .getExports()
        .every((exportSource) =>
          exportSource.getTags()?.every((tag) => tag.tagName === 'internal')
        )

      if (allInternal) {
        return false
      }
    }
  }

  if (isExportSource(source)) {
    if (source.getTags()?.find((tag) => tag.tagName === 'internal')) {
      return false
    }
  }

  return true
}

describe('collections', () => {
  test('merges composite collection siblings', async () => {
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
    const source = (await AllCollections.getSource('collections/index'))!
    const [, nextSource] = await source.getSiblings()

    expect(nextSource).toBeDefined()
  })

  test('generating tree navigation', async () => {
    const ComponentsCollection = new Collection<{
      [key: string]: ComponentType
    }>({
      filePattern: 'src/components/**/*.{ts,tsx}',
      baseDirectory: 'components',
      filter: filterInternalSources,
    })

    async function buildTreeNavigation(source: FileSystemSource<any>) {
      const sources = await source.getSources({ depth: 1 })
      const path = source.getPath()

      if (sources.length === 0) {
        return path
      }

      return {
        path,
        children: await Promise.all(sources.map(buildTreeNavigation)),
      }
    }

    const sources = await ComponentsCollection.getSources({ depth: 1 })
    const tree = await Promise.all(sources.map(buildTreeNavigation))

    expect(tree).toMatchInlineSnapshot(`
      [
        "/components",
        "/api-reference",
        {
          "children": [
            "/code-block/copy-button",
            "/code-block/line-numbers",
            "/code-block/tokens",
            "/code-block/toolbar",
          ],
          "path": "/code-block",
        },
        "/code-inline",
        "/copyright",
        "/git-provider",
        "/mdx-components",
        "/mdx-content",
        "/package-install",
        "/rendered-html",
      ]
    `)
  })
})
