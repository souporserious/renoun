import { describe, expect, test } from 'vitest'

import {
  createProjectFileCache,
  invalidateProjectFileCache,
} from './cache.ts'
import type { Project } from '../utils/ts-morph.ts'

describe('project file cache', () => {
  test('invalidates all file cache entries when a file path is invalidated', async () => {
    const project = {} as unknown as Project
    const filePath = '/project/src/index.ts'
    let calls = 0

    const valueA = await createProjectFileCache(
      project,
      filePath,
      'fileExportsText',
      () => {
        calls += 1
        return `value-${calls}`
      }
    )
    const valueB = await createProjectFileCache(
      project,
      filePath,
      'fileExportsText',
      () => 'should not run'
    )

    expect(valueA).toBe('value-1')
    expect(valueB).toBe('value-1')
    expect(calls).toBe(1)

    invalidateProjectFileCache(project, filePath)

    const valueAfter = await createProjectFileCache(
      project,
      filePath,
      'fileExportsText',
      () => {
        calls += 1
        return `value-${calls}`
      }
    )

    expect(valueAfter).toBe('value-2')
    expect(calls).toBe(2)
  })

  test('invalidates only one cache namespace for a file path', async () => {
    const project = {} as unknown as Project
    const filePath = '/project/src/index.ts'

    let fileExportsCalls = 0
    let fileMetadataCalls = 0

    const fileExportsText = await createProjectFileCache(
      project,
      filePath,
      'fileExportsText',
      () => {
        fileExportsCalls += 1
        return `exports-${fileExportsCalls}`
      }
    )

    const fileMetadata = await createProjectFileCache(
      project,
      filePath,
      'fileMetadata',
      () => {
        fileMetadataCalls += 1
        return `metadata-${fileMetadataCalls}`
      }
    )

    expect(fileExportsText).toBe('exports-1')
    expect(fileMetadata).toBe('metadata-1')
    expect(fileExportsCalls).toBe(1)
    expect(fileMetadataCalls).toBe(1)

    invalidateProjectFileCache(project, filePath, 'fileExportsText')

    const cachedMetadata = await createProjectFileCache(
      project,
      filePath,
      'fileMetadata',
      () => {
        fileMetadataCalls += 1
        return `metadata-${fileMetadataCalls}`
      }
    )
    const refreshedFileExportsText = await createProjectFileCache(
      project,
      filePath,
      'fileExportsText',
      () => {
        fileExportsCalls += 1
        return `exports-${fileExportsCalls}`
      }
    )

    expect(cachedMetadata).toBe('metadata-1')
    expect(refreshedFileExportsText).toBe('exports-2')
    expect(fileMetadataCalls).toBe(1)
    expect(fileExportsCalls).toBe(2)
  })

  test('supports explicit cache-name invalidation through namespace path', async () => {
    const project = {} as unknown as Project

    let firstCalls = 0
    let secondCalls = 0
    let metadataCalls = 0

    await createProjectFileCache(project, '/project/src/index.ts', 'fileExportsText', () => {
      firstCalls += 1
      return `exports-${firstCalls}`
    })
    await createProjectFileCache(project, '/project/src/index.ts', 'fileMetadata', () => {
      metadataCalls += 1
      return `metadata-${metadataCalls}`
    })
    await createProjectFileCache(project, '/project/src/other.ts', 'fileExportsText', () => {
      secondCalls += 1
      return `exports-${secondCalls}`
    })

    expect(firstCalls).toBe(1)
    expect(metadataCalls).toBe(1)
    expect(secondCalls).toBe(1)

    invalidateProjectFileCache(project, 'fileExportsText')

    await createProjectFileCache(project, '/project/src/index.ts', 'fileMetadata', () => {
      metadataCalls += 1
      return `metadata-${metadataCalls}`
    })
    await createProjectFileCache(project, '/project/src/index.ts', 'fileExportsText', () => {
      firstCalls += 1
      return `exports-${firstCalls}`
    })
    await createProjectFileCache(project, '/project/src/other.ts', 'fileExportsText', () => {
      secondCalls += 1
      return `exports-${secondCalls}`
    })

    expect(firstCalls).toBe(2)
    expect(secondCalls).toBe(2)
    expect(metadataCalls).toBe(1)
  })

  test('still supports legacy cache-name-only invalidation syntax', async () => {
    const project = {} as unknown as Project

    await createProjectFileCache(
      project,
      '/project/src/index.ts',
      'fileExportsText',
      () => 'value'
    )

    invalidateProjectFileCache(project, 'fileExportsText')

    const value = await createProjectFileCache(
      project,
      '/project/src/index.ts',
      'fileExportsText',
      () => 'value-2'
    )

    expect(value).toBe('value-2')
  })
})
