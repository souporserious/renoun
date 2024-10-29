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
      filePattern: 'collections/*.tsx',
      baseDirectory: 'src',
      filter: filterInternalSources,
    })
    const ComponentsCollection = new Collection<{
      [key: string]: ComponentType
    }>({
      filePattern: 'components/**/*.{ts,tsx}',
      baseDirectory: 'src',
      filter: filterInternalSources,
    })
    const AllCollections = new CompositeCollection(
      CollectionsCollection,
      ComponentsCollection
    )
    const source = (await AllCollections.getSource(
      'components'
    )) as FileSystemSource<any>
    const [previousSource] = await source.getSiblings()

    expect(previousSource).toBeDefined()
  })

  test('generating tree navigation', async () => {
    const ComponentsCollection = new Collection<{
      [key: string]: ComponentType
    }>({
      filePattern: '**/*.{ts,tsx}',
      baseDirectory: 'src/components',
      filter: filterInternalSources,
    })

    async function buildTreeNavigation(source: FileSystemSource<any>) {
      const path = source.getPath()
      const sources = await source.getSources({ depth: 1 })

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
