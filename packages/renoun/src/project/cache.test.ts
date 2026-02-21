import { describe, expect, test } from 'vitest'

import {
  createProjectFileCache,
  invalidateProjectFileCache,
} from './cache.ts'
import { getProject, invalidateProjectCachesByPath } from './get-project.ts'
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

  test('invalidates file cache entries with const-only dependencies', async () => {
    const project = {} as unknown as Project
    const filePath = '/project/src/index.ts'
    let calls = 0

    const first = await createProjectFileCache(
      project,
      filePath,
      'constOnly',
      () => {
        calls += 1
        return `value-${calls}`
      },
      {
        deps: [
          {
            kind: 'const',
            name: 'schema-version',
            version: '1',
          },
        ],
      }
    )

    invalidateProjectFileCache(project, filePath)

    const second = await createProjectFileCache(
      project,
      filePath,
      'constOnly',
      () => {
        calls += 1
        return `value-${calls}`
      },
      {
        deps: [
          {
            kind: 'const',
            name: 'schema-version',
            version: '1',
          },
        ],
      }
    )

    expect(first).toBe('value-1')
    expect(second).toBe('value-2')
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

  test('evicts least-recently-used entries when cache capacity is exceeded', async () => {
    const previousCapacity = process.env.RENOUN_PROJECT_CACHE_MAX_ENTRIES
    process.env.RENOUN_PROJECT_CACHE_MAX_ENTRIES = '2'

    try {
      const project = {} as unknown as Project
      let alphaCalls = 0
      let betaCalls = 0
      let gammaCalls = 0

      await createProjectFileCache(project, '/project/src/alpha.ts', 'alpha', () => {
        alphaCalls += 1
        return `alpha-${alphaCalls}`
      })
      await createProjectFileCache(project, '/project/src/beta.ts', 'beta', () => {
        betaCalls += 1
        return `beta-${betaCalls}`
      })

      // Touch alpha so beta becomes the least-recently-used entry.
      await createProjectFileCache(project, '/project/src/alpha.ts', 'alpha', () => {
        alphaCalls += 1
        return `alpha-${alphaCalls}`
      })

      await createProjectFileCache(project, '/project/src/gamma.ts', 'gamma', () => {
        gammaCalls += 1
        return `gamma-${gammaCalls}`
      })

      const alphaAfter = await createProjectFileCache(
        project,
        '/project/src/alpha.ts',
        'alpha',
        () => {
          alphaCalls += 1
          return `alpha-${alphaCalls}`
        }
      )
      const betaAfter = await createProjectFileCache(
        project,
        '/project/src/beta.ts',
        'beta',
        () => {
          betaCalls += 1
          return `beta-${betaCalls}`
        }
      )

      expect(alphaAfter).toBe('alpha-1')
      expect(betaAfter).toBe('beta-2')
      expect(alphaCalls).toBe(1)
      expect(betaCalls).toBe(2)
      expect(gammaCalls).toBe(1)
    } finally {
      if (previousCapacity === undefined) {
        delete process.env.RENOUN_PROJECT_CACHE_MAX_ENTRIES
      } else {
        process.env.RENOUN_PROJECT_CACHE_MAX_ENTRIES = previousCapacity
      }
    }
  })

  test('supports explicit cache-name invalidation via cacheName argument', async () => {
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

    invalidateProjectFileCache(project, undefined, 'fileExportsText')

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

  test('does not treat filePath-only invalidation as cache-name invalidation', async () => {
    const project = {} as unknown as Project

    let calls = 0
    await createProjectFileCache(
      project,
      '/project/src/index.ts',
      'fileExportsText',
      () => {
        calls += 1
        return `value-${calls}`
      }
    )

    // File-path invalidation must not remove cache entries by namespace.
    invalidateProjectFileCache(project, 'fileExportsText')

    const value = await createProjectFileCache(
      project,
      '/project/src/index.ts',
      'fileExportsText',
      () => {
        calls += 1
        return `value-${calls}`
      }
    )

    expect(value).toBe('value-1')
    expect(calls).toBe(1)
  })

  test('does not misclassify extensionless dependency paths as cache names', async () => {
    const project = {} as unknown as Project
    const cacheFilePath = '/project/src/index.ts'
    const dependencyPath = 'LICENSE'
    let calls = 0

    const first = await createProjectFileCache(
      project,
      cacheFilePath,
      'fileExportsText',
      () => {
        calls += 1
        return `value-${calls}`
      },
      {
        deps: [
          {
            kind: 'file',
            path: dependencyPath,
          },
        ],
      }
    )
    const second = await createProjectFileCache(
      project,
      cacheFilePath,
      'fileExportsText',
      () => 'should not run',
      {
        deps: [
          {
            kind: 'file',
            path: dependencyPath,
          },
        ],
      }
    )

    expect(first).toBe('value-1')
    expect(second).toBe('value-1')
    expect(calls).toBe(1)

    invalidateProjectFileCache(project, dependencyPath)

    const third = await createProjectFileCache(
      project,
      cacheFilePath,
      'fileExportsText',
      () => {
        calls += 1
        return `value-${calls}`
      },
      {
        deps: [
          {
            kind: 'file',
            path: dependencyPath,
          },
        ],
      }
    )

    expect(third).toBe('value-2')
    expect(calls).toBe(2)
  })

  test('recomputes entries when a structured file dependency is invalidated', async () => {
    const project = {} as unknown as Project
    const cacheFilePath = '/project/src/index.ts'
    const dependencyPath = '/project/src/shared.ts'
    let calls = 0

    const first = await createProjectFileCache(
      project,
      cacheFilePath,
      'fileExportsText',
      () => {
        calls += 1
        return `value-${calls}`
      },
      {
        deps: [
          {
            kind: 'file',
            path: dependencyPath,
          },
        ],
      }
    )
    const second = await createProjectFileCache(
      project,
      cacheFilePath,
      'fileExportsText',
      () => 'should not run',
      {
        deps: [
          {
            kind: 'file',
            path: dependencyPath,
          },
        ],
      }
    )

    expect(first).toBe('value-1')
    expect(second).toBe('value-1')
    expect(calls).toBe(1)

    invalidateProjectFileCache(project, dependencyPath)

    const third = await createProjectFileCache(
      project,
      cacheFilePath,
      'fileExportsText',
      () => {
        calls += 1
        return `value-${calls}`
      },
      {
        deps: [
          {
            kind: 'file',
            path: dependencyPath,
          },
        ],
      }
    )

    expect(third).toBe('value-2')
    expect(calls).toBe(2)
  })

  test('recomputes entries when a structured directory dependency intersects an invalidated file', async () => {
    const project = {} as unknown as Project
    const cacheFilePath = '/project/src/index.ts'
    const directoryDependencyPath = '/project/src/components'
    const changedFilePath = '/project/src/components/button.tsx'
    let calls = 0

    const first = await createProjectFileCache(
      project,
      cacheFilePath,
      'component-index',
      () => {
        calls += 1
        return `value-${calls}`
      },
      {
        deps: [
          {
            kind: 'directory',
            path: directoryDependencyPath,
          },
        ],
      }
    )
    const second = await createProjectFileCache(
      project,
      cacheFilePath,
      'component-index',
      () => 'should not run',
      {
        deps: [
          {
            kind: 'directory',
            path: directoryDependencyPath,
          },
        ],
      }
    )

    expect(first).toBe('value-1')
    expect(second).toBe('value-1')
    expect(calls).toBe(1)

    invalidateProjectFileCache(project, changedFilePath)

    const third = await createProjectFileCache(
      project,
      cacheFilePath,
      'component-index',
      () => {
        calls += 1
        return `value-${calls}`
      },
      {
        deps: [
          {
            kind: 'directory',
            path: directoryDependencyPath,
          },
        ],
      }
    )

    expect(third).toBe('value-2')
    expect(calls).toBe(2)
  })

  test('does not recompute entries when invalidated path does not intersect dependencies', async () => {
    const project = {} as unknown as Project
    const cacheFilePath = '/project/src/index.ts'
    const dependencyPath = '/project/src/shared.ts'
    const unrelatedPath = '/project/src/other.ts'
    let calls = 0

    const first = await createProjectFileCache(
      project,
      cacheFilePath,
      'fileExportsText',
      () => {
        calls += 1
        return `value-${calls}`
      },
      {
        deps: [
          {
            kind: 'file',
            path: dependencyPath,
          },
        ],
      }
    )

    invalidateProjectFileCache(project, unrelatedPath)

    const second = await createProjectFileCache(
      project,
      cacheFilePath,
      'fileExportsText',
      () => {
        calls += 1
        return `value-${calls}`
      },
      {
        deps: [
          {
            kind: 'file',
            path: dependencyPath,
          },
        ],
      }
    )

    expect(first).toBe('value-1')
    expect(second).toBe('value-1')
    expect(calls).toBe(1)
  })

  test('recomputes entries when structured dependency versions change', async () => {
    const project = {} as unknown as Project
    const cacheFilePath = '/project/src/index.ts'
    let calls = 0

    const first = await createProjectFileCache(
      project,
      cacheFilePath,
      'schema',
      () => {
        calls += 1
        return `value-${calls}`
      },
      {
        deps: [
          {
            kind: 'const',
            name: 'schema-version',
            version: '1',
          },
        ],
      }
    )
    const second = await createProjectFileCache(
      project,
      cacheFilePath,
      'schema',
      () => 'should not run',
      {
        deps: [
          {
            kind: 'const',
            name: 'schema-version',
            version: '1',
          },
        ],
      }
    )
    const third = await createProjectFileCache(
      project,
      cacheFilePath,
      'schema',
      () => {
        calls += 1
        return `value-${calls}`
      },
      {
        deps: [
          {
            kind: 'const',
            name: 'schema-version',
            version: '2',
          },
        ],
      }
    )

    expect(first).toBe('value-1')
    expect(second).toBe('value-1')
    expect(third).toBe('value-2')
    expect(calls).toBe(2)
  })

  test('supports dynamic dependency resolution from computed cache values', async () => {
    const project = {} as unknown as Project
    const cacheFilePath = '/project/src/index.ts'
    const dependencyPath = '/project/src/shared.ts'
    let calls = 0

    const first = await createProjectFileCache(
      project,
      cacheFilePath,
      'dynamic-deps',
      () => {
        calls += 1
        return {
          value: `value-${calls}`,
          paths: [dependencyPath],
        }
      },
      {
        deps: (result) => [
          {
            kind: 'file',
            path: cacheFilePath,
          },
          ...result.paths.map((path) => ({
            kind: 'file' as const,
            path,
          })),
        ],
      }
    )
    const second = await createProjectFileCache(
      project,
      cacheFilePath,
      'dynamic-deps',
      () => ({
        value: 'should not run',
        paths: [dependencyPath],
      }),
      {
        deps: (result) => [
          {
            kind: 'file',
            path: cacheFilePath,
          },
          ...result.paths.map((path) => ({
            kind: 'file' as const,
            path,
          })),
        ],
      }
    )

    expect(first.value).toBe('value-1')
    expect(second.value).toBe('value-1')
    expect(calls).toBe(1)

    invalidateProjectFileCache(project, dependencyPath)

    const third = await createProjectFileCache(
      project,
      cacheFilePath,
      'dynamic-deps',
      () => {
        calls += 1
        return {
          value: `value-${calls}`,
          paths: [dependencyPath],
        }
      },
      {
        deps: (result) => [
          {
            kind: 'file',
            path: cacheFilePath,
          },
          ...result.paths.map((path) => ({
            kind: 'file' as const,
            path,
          })),
        ],
      }
    )

    expect(third.value).toBe('value-2')
    expect(calls).toBe(2)
  })

  test('recomputes entries when a cache dependency is invalidated', async () => {
    const project = {} as unknown as Project
    const sourcePath = '/project/src/source.ts'
    const dependentPath = '/project/src/dependent.ts'
    let sourceCalls = 0
    let dependentCalls = 0

    await createProjectFileCache(project, sourcePath, 'metadata', () => {
      sourceCalls += 1
      return `source-${sourceCalls}`
    })

    const firstDependent = await createProjectFileCache(
      project,
      dependentPath,
      'summary',
      () => {
        dependentCalls += 1
        return `dependent-${dependentCalls}`
      },
      {
        deps: [
          {
            kind: 'cache',
            filePath: sourcePath,
            cacheName: 'metadata',
          },
        ],
      }
    )
    const secondDependent = await createProjectFileCache(
      project,
      dependentPath,
      'summary',
      () => 'should not run',
      {
        deps: [
          {
            kind: 'cache',
            filePath: sourcePath,
            cacheName: 'metadata',
          },
        ],
      }
    )

    expect(firstDependent).toBe('dependent-1')
    expect(secondDependent).toBe('dependent-1')
    expect(sourceCalls).toBe(1)
    expect(dependentCalls).toBe(1)

    invalidateProjectFileCache(project, sourcePath, 'metadata')

    const thirdDependent = await createProjectFileCache(
      project,
      dependentPath,
      'summary',
      () => {
        dependentCalls += 1
        return `dependent-${dependentCalls}`
      },
      {
        deps: [
          {
            kind: 'cache',
            filePath: sourcePath,
            cacheName: 'metadata',
          },
        ],
      }
    )

    expect(thirdDependent).toBe('dependent-2')
    expect(dependentCalls).toBe(2)
  })

  test('path invalidation propagates through cache dependencies before source recompute', async () => {
    const project = {} as unknown as Project
    const sourcePath = '/project/src/source.ts'
    const dependentPath = '/project/src/dependent.ts'
    let sourceCalls = 0
    let dependentCalls = 0

    await createProjectFileCache(
      project,
      sourcePath,
      'metadata',
      () => {
        sourceCalls += 1
        return `source-${sourceCalls}`
      },
      {
        deps: [
          {
            kind: 'file',
            path: sourcePath,
          },
        ],
      }
    )

    const firstDependent = await createProjectFileCache(
      project,
      dependentPath,
      'summary',
      () => {
        dependentCalls += 1
        return `dependent-${dependentCalls}`
      },
      {
        deps: [
          {
            kind: 'cache',
            filePath: sourcePath,
            cacheName: 'metadata',
          },
        ],
      }
    )

    invalidateProjectFileCache(project, sourcePath)

    const secondDependent = await createProjectFileCache(
      project,
      dependentPath,
      'summary',
      () => {
        dependentCalls += 1
        return `dependent-${dependentCalls}`
      },
      {
        deps: [
          {
            kind: 'cache',
            filePath: sourcePath,
            cacheName: 'metadata',
          },
        ],
      }
    )

    expect(firstDependent).toBe('dependent-1')
    expect(secondDependent).toBe('dependent-2')
    expect(dependentCalls).toBe(2)
  })

  test('deduplicates concurrent compute work for the same cache key', async () => {
    const project = {} as unknown as Project
    const filePath = '/project/src/index.ts'
    let calls = 0
    let releaseCompute: (() => void) | undefined
    const computeGate = new Promise<void>((resolve) => {
      releaseCompute = resolve
    })

    const first = createProjectFileCache(
      project,
      filePath,
      'fileExportsText',
      async () => {
        calls += 1
        await computeGate
        return `value-${calls}`
      }
    )
    const second = createProjectFileCache(
      project,
      filePath,
      'fileExportsText',
      async () => {
        calls += 1
        return `value-${calls}`
      }
    )

    releaseCompute?.()
    const [firstValue, secondValue] = await Promise.all([first, second])

    expect(firstValue).toBe('value-1')
    expect(secondValue).toBe('value-1')
    expect(calls).toBe(1)
  })

  test('invalidates descendant dependencies when parent paths are invalidated', async () => {
    const project = getProject({
      useInMemoryFileSystem: true,
      projectId: `rename-parent-${Date.now()}`,
    })
    const cacheFilePath = `${process.cwd()}/src/consumer.ts`
    const oldDependencyPath = `${process.cwd()}/src/features/legacy.ts`
    const cacheName = `rename-summary-${Date.now()}`
    let calls = 0

    const first = await createProjectFileCache(
      project,
      cacheFilePath,
      cacheName,
      () => {
        calls += 1
        return `value-${calls}`
      },
      {
        deps: [
          {
            kind: 'file',
            path: oldDependencyPath,
          },
        ],
      }
    )
    const second = await createProjectFileCache(
      project,
      cacheFilePath,
      cacheName,
      () => 'should-not-run',
      {
        deps: [
          {
            kind: 'file',
            path: oldDependencyPath,
          },
        ],
      }
    )

    expect(first).toBe('value-1')
    expect(second).toBe('value-1')
    expect(calls).toBe(1)

    const affectedProjects = invalidateProjectCachesByPath(
      `${process.cwd()}/src/features`
    )
    expect(affectedProjects).toBeGreaterThan(0)

    const third = await createProjectFileCache(
      project,
      cacheFilePath,
      cacheName,
      () => {
        calls += 1
        return `value-${calls}`
      },
      {
        deps: [
          {
            kind: 'file',
            path: oldDependencyPath,
          },
        ],
      }
    )

    expect(third).toBe('value-2')
    expect(calls).toBe(2)
  })

})
