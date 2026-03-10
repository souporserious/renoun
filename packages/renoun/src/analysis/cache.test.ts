import { resolve } from 'node:path'

import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  configureAnalysisCacheRuntime,
  createProgramFileCache,
  invalidateProgramFileCache,
  invalidateProgramFileCachePaths,
  resetAnalysisCacheRuntimeConfiguration,
} from './cache.ts'
import { CacheStore } from '../file-system/Cache.ts'
import {
  disposeAnalysisWatchers,
  getProgram,
  invalidateProgramCachesByPath,
} from './get-program.ts'
import type { Project } from '../utils/ts-morph.ts'

describe('project file cache', () => {
  afterEach(() => {
    resetAnalysisCacheRuntimeConfiguration()
    vi.restoreAllMocks()
  })

  test('invalidates all file cache entries when a file path is invalidated', async () => {
    const project = {} as unknown as Project
    const filePath = '/project/src/index.ts'
    let calls = 0

    const valueA = await createProgramFileCache(
      project,
      filePath,
      'fileExportsText',
      () => {
        calls += 1
        return `value-${calls}`
      }
    )
    const valueB = await createProgramFileCache(
      project,
      filePath,
      'fileExportsText',
      () => 'should not run'
    )

    expect(valueA).toBe('value-1')
    expect(valueB).toBe('value-1')
    expect(calls).toBe(1)

    invalidateProgramFileCache(project, filePath)

    const valueAfter = await createProgramFileCache(
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

  test('eagerly deletes absolute-path cache entries from the underlying store on targeted invalidation', async () => {
    const project = {} as unknown as Project
    const filePath = '/project/src/index.ts'
    const cacheName = `absolute-delete-${Date.now()}`
    const deleteManySpy = vi.spyOn(CacheStore.prototype, 'deleteMany')

    await createProgramFileCache(project, filePath, cacheName, () => 'value')

    invalidateProgramFileCache(project, filePath)
    await Promise.resolve()

    expect(deleteManySpy).toHaveBeenCalledTimes(1)
    expect(deleteManySpy.mock.calls[0]?.[0]).toEqual([
      `program-cache:project/src/index.ts:${cacheName}`,
    ])
  })

  test('invalidates file cache entries with const-only dependencies', async () => {
    const project = {} as unknown as Project
    const filePath = '/project/src/index.ts'
    let calls = 0

    const first = await createProgramFileCache(
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

    invalidateProgramFileCache(project, filePath)

    const second = await createProgramFileCache(
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

  test('invalidates multiple file paths in a single batch', async () => {
    const project = {} as unknown as Project
    const firstPath = '/project/src/first.ts'
    const secondPath = '/project/src/second.ts'
    let firstCalls = 0
    let secondCalls = 0

    await createProgramFileCache(project, firstPath, 'fileExportsText', () => {
      firstCalls += 1
      return `first-${firstCalls}`
    })
    await createProgramFileCache(project, secondPath, 'fileExportsText', () => {
      secondCalls += 1
      return `second-${secondCalls}`
    })

    invalidateProgramFileCachePaths(project, [firstPath, secondPath])

    const firstValue = await createProgramFileCache(
      project,
      firstPath,
      'fileExportsText',
      () => {
        firstCalls += 1
        return `first-${firstCalls}`
      }
    )
    const secondValue = await createProgramFileCache(
      project,
      secondPath,
      'fileExportsText',
      () => {
        secondCalls += 1
        return `second-${secondCalls}`
      }
    )

    expect(firstValue).toBe('first-2')
    expect(secondValue).toBe('second-2')
  })

  test('invalidates descendant file cache entries when a directory path is invalidated', async () => {
    const project = {} as unknown as Project
    const firstPath = '/project/src/components/button.ts'
    const secondPath = '/project/src/components/input.ts'
    let firstCalls = 0
    let secondCalls = 0

    await createProgramFileCache(project, firstPath, 'summary', () => {
      firstCalls += 1
      return `first-${firstCalls}`
    })
    await createProgramFileCache(project, secondPath, 'summary', () => {
      secondCalls += 1
      return `second-${secondCalls}`
    })

    invalidateProgramFileCache(project, '/project/src/components')

    const firstValue = await createProgramFileCache(
      project,
      firstPath,
      'summary',
      () => {
        firstCalls += 1
        return `first-${firstCalls}`
      }
    )
    const secondValue = await createProgramFileCache(
      project,
      secondPath,
      'summary',
      () => {
        secondCalls += 1
        return `second-${secondCalls}`
      }
    )

    expect(firstValue).toBe('first-2')
    expect(secondValue).toBe('second-2')
  })

  test('invalidates only one cache namespace for a file path', async () => {
    const project = {} as unknown as Project
    const filePath = '/project/src/index.ts'

    let fileExportsCalls = 0
    let fileMetadataCalls = 0

    const fileExportsText = await createProgramFileCache(
      project,
      filePath,
      'fileExportsText',
      () => {
        fileExportsCalls += 1
        return `exports-${fileExportsCalls}`
      }
    )

    const fileMetadata = await createProgramFileCache(
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

    invalidateProgramFileCache(project, filePath, 'fileExportsText')

    const cachedMetadata = await createProgramFileCache(
      project,
      filePath,
      'fileMetadata',
      () => {
        fileMetadataCalls += 1
        return `metadata-${fileMetadataCalls}`
      }
    )
    const refreshedFileExportsText = await createProgramFileCache(
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

  test('uses runtime cache capacity override', async () => {
    configureAnalysisCacheRuntime({ maxEntries: 2 })

    const project = {} as unknown as Project
    let alphaCalls = 0
    let betaCalls = 0
    let gammaCalls = 0

    await createProgramFileCache(project, '/project/src/alpha.ts', 'alpha', () => {
      alphaCalls += 1
      return `alpha-${alphaCalls}`
    })
    await createProgramFileCache(project, '/project/src/beta.ts', 'beta', () => {
      betaCalls += 1
      return `beta-${betaCalls}`
    })
    await createProgramFileCache(project, '/project/src/alpha.ts', 'alpha', () => {
      alphaCalls += 1
      return `alpha-${alphaCalls}`
    })
    await createProgramFileCache(project, '/project/src/gamma.ts', 'gamma', () => {
      gammaCalls += 1
      return `gamma-${gammaCalls}`
    })

    const alphaAfter = await createProgramFileCache(
      project,
      '/project/src/alpha.ts',
      'alpha',
      () => {
        alphaCalls += 1
        return `alpha-${alphaCalls}`
      }
    )
    const betaAfter = await createProgramFileCache(
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
  })

  test('evicts least-recently-used entries when cache capacity is exceeded', async () => {
    configureAnalysisCacheRuntime({ maxEntries: 2 })
    const project = {} as unknown as Project
    let alphaCalls = 0
    let betaCalls = 0
    let gammaCalls = 0

    await createProgramFileCache(project, '/project/src/alpha.ts', 'alpha', () => {
      alphaCalls += 1
      return `alpha-${alphaCalls}`
    })
    await createProgramFileCache(project, '/project/src/beta.ts', 'beta', () => {
      betaCalls += 1
      return `beta-${betaCalls}`
    })

    await createProgramFileCache(project, '/project/src/alpha.ts', 'alpha', () => {
      alphaCalls += 1
      return `alpha-${alphaCalls}`
    })

    await createProgramFileCache(project, '/project/src/gamma.ts', 'gamma', () => {
      gammaCalls += 1
      return `gamma-${gammaCalls}`
    })

    const alphaAfter = await createProgramFileCache(
      project,
      '/project/src/alpha.ts',
      'alpha',
      () => {
        alphaCalls += 1
        return `alpha-${alphaCalls}`
      }
    )
    const betaAfter = await createProgramFileCache(
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
  })

  test('supports explicit cache-name invalidation via cacheName argument', async () => {
    const project = {} as unknown as Project

    let firstCalls = 0
    let secondCalls = 0
    let metadataCalls = 0

    await createProgramFileCache(
      project,
      '/project/src/index.ts',
      'fileExportsText',
      () => {
        firstCalls += 1
        return `exports-${firstCalls}`
      }
    )
    await createProgramFileCache(
      project,
      '/project/src/index.ts',
      'fileMetadata',
      () => {
        metadataCalls += 1
        return `metadata-${metadataCalls}`
      }
    )
    await createProgramFileCache(
      project,
      '/project/src/other.ts',
      'fileExportsText',
      () => {
        secondCalls += 1
        return `exports-${secondCalls}`
      }
    )

    expect(firstCalls).toBe(1)
    expect(metadataCalls).toBe(1)
    expect(secondCalls).toBe(1)

    invalidateProgramFileCache(project, undefined, 'fileExportsText')

    await createProgramFileCache(
      project,
      '/project/src/index.ts',
      'fileMetadata',
      () => {
        metadataCalls += 1
        return `metadata-${metadataCalls}`
      }
    )
    await createProgramFileCache(
      project,
      '/project/src/index.ts',
      'fileExportsText',
      () => {
        firstCalls += 1
        return `exports-${firstCalls}`
      }
    )
    await createProgramFileCache(
      project,
      '/project/src/other.ts',
      'fileExportsText',
      () => {
        secondCalls += 1
        return `exports-${secondCalls}`
      }
    )

    expect(firstCalls).toBe(2)
    expect(secondCalls).toBe(2)
    expect(metadataCalls).toBe(1)
  })

  test('does not treat filePath-only invalidation as cache-name invalidation', async () => {
    const project = {} as unknown as Project

    let calls = 0
    await createProgramFileCache(
      project,
      '/project/src/index.ts',
      'fileExportsText',
      () => {
        calls += 1
        return `value-${calls}`
      }
    )

    invalidateProgramFileCache(project, 'fileExportsText')

    const value = await createProgramFileCache(
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

    const first = await createProgramFileCache(
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
    const second = await createProgramFileCache(
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

    invalidateProgramFileCache(project, dependencyPath)

    const third = await createProgramFileCache(
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

    const first = await createProgramFileCache(
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
    const second = await createProgramFileCache(
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

    invalidateProgramFileCache(project, dependencyPath)

    const third = await createProgramFileCache(
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

    const first = await createProgramFileCache(
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
    const second = await createProgramFileCache(
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

    invalidateProgramFileCache(project, changedFilePath)

    const third = await createProgramFileCache(
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

    const first = await createProgramFileCache(
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

    invalidateProgramFileCache(project, unrelatedPath)

    const second = await createProgramFileCache(
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

    const first = await createProgramFileCache(
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
    const second = await createProgramFileCache(
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
    const third = await createProgramFileCache(
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

    const first = await createProgramFileCache(
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
    const second = await createProgramFileCache(
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

    invalidateProgramFileCache(project, dependencyPath)

    const third = await createProgramFileCache(
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

    await createProgramFileCache(project, sourcePath, 'metadata', () => {
      sourceCalls += 1
      return `source-${sourceCalls}`
    })

    const firstDependent = await createProgramFileCache(
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
    const secondDependent = await createProgramFileCache(
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

    invalidateProgramFileCache(project, sourcePath, 'metadata')

    const thirdDependent = await createProgramFileCache(
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

    await createProgramFileCache(
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

    const firstDependent = await createProgramFileCache(
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

    invalidateProgramFileCache(project, sourcePath)

    const secondDependent = await createProgramFileCache(
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

    const first = createProgramFileCache(
      project,
      filePath,
      'fileExportsText',
      async () => {
        calls += 1
        await computeGate
        return `value-${calls}`
      }
    )
    const second = createProgramFileCache(
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
    const project = getProgram({
      useInMemoryFileSystem: true,
      analysisScopeId: `rename-parent-${Date.now()}`,
    })
    const cacheFilePath = `${process.cwd()}/src/consumer.ts`
    const oldDependencyPath = `${process.cwd()}/src/features/legacy.ts`
    const cacheName = `rename-summary-${Date.now()}`
    let calls = 0

    const first = await createProgramFileCache(
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
    const second = await createProgramFileCache(
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

    const affectedProjects = invalidateProgramCachesByPath(
      `${process.cwd()}/src/features`
    )
    expect(affectedProjects).toBeGreaterThan(0)

    const third = await createProgramFileCache(
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

  test('invalidates relative cache entries when invalidating with absolute paths', async () => {
    const project = {} as unknown as Project
    const relativeFilePath = 'src/relative-entry.ts'
    const cacheName = `relative-path-invalidation-${Date.now()}`
    let calls = 0

    const first = await createProgramFileCache(
      project,
      relativeFilePath,
      cacheName,
      () => {
        calls += 1
        return `value-${calls}`
      }
    )
    const second = await createProgramFileCache(
      project,
      relativeFilePath,
      cacheName,
      () => 'should-not-run'
    )

    expect(first).toBe('value-1')
    expect(second).toBe('value-1')
    expect(calls).toBe(1)

    invalidateProgramFileCachePaths(project, [resolve(process.cwd())])

    const third = await createProgramFileCache(
      project,
      relativeFilePath,
      cacheName,
      () => {
        calls += 1
        return `value-${calls}`
      }
    )

    expect(third).toBe('value-2')
    expect(calls).toBe(2)
  })

  test('treats dot invalidation as a global program cache invalidation', async () => {
    const uniqueId = Date.now()
    const projectPath = `${process.cwd()}/src/dot-invalidation-${uniqueId}.ts`
    const cacheName = `dot-invalidation-${uniqueId}`
    const project = getProgram({
      useInMemoryFileSystem: true,
      analysisScopeId: `dot-invalidation-${uniqueId}`,
    })
    let calls = 0

    const first = await createProgramFileCache(project, projectPath, cacheName, () => {
      calls += 1
      return `value-${calls}`
    })
    const second = await createProgramFileCache(
      project,
      projectPath,
      cacheName,
      () => 'should-not-run'
    )

    expect(first).toBe('value-1')
    expect(second).toBe('value-1')
    expect(calls).toBe(1)

    const affectedProjects = invalidateProgramCachesByPath('.')
    expect(affectedProjects).toBeGreaterThan(0)

    const third = await createProgramFileCache(project, projectPath, cacheName, () => {
      calls += 1
      return `value-${calls}`
    })

    expect(third).toBe('value-2')
    expect(calls).toBe(2)
  })

  test('does not reuse in-memory project cache values across analysisScopeId changes', async () => {
    const uniqueId = Date.now()
    const filePath = `/virtual-project-id-${uniqueId}.ts`
    const cacheName = `project-id-isolation-${uniqueId}`
    const projectA = getProgram({
      useInMemoryFileSystem: true,
      analysisScopeId: `project-a-${uniqueId}`,
    })

    projectA.createSourceFile(filePath, 'export const value = 1', {
      overwrite: true,
    })

    const firstValue = await createProgramFileCache(
      projectA,
      filePath,
      cacheName,
      () => 'value-from-project-a'
    )

    expect(firstValue).toBe('value-from-project-a')

    const projectB = getProgram({
      useInMemoryFileSystem: true,
      analysisScopeId: `project-b-${uniqueId}`,
    })

    expect(projectB).not.toBe(projectA)

    projectB.createSourceFile(filePath, 'export const value = 2', {
      overwrite: true,
    })

    const secondValue = await createProgramFileCache(
      projectB,
      filePath,
      cacheName,
      () => 'value-from-project-b'
    )

    expect(secondValue).toBe('value-from-project-b')

    const firstValueAgain = await createProgramFileCache(
      projectA,
      filePath,
      cacheName,
      () => 'value-from-project-a-updated'
    )

    expect(firstValueAgain).toBe('value-from-project-a')
  })

  test('clears tracked programs when disposing analysis watchers', async () => {
    const uniqueId = Date.now()
    const projectRoot = `/virtual-project-registry-${uniqueId}`
    const tsConfigPath = `${projectRoot}/tsconfig.json`
    const projectPath = `${projectRoot}/src/example.ts`
    const project = getProgram({
      useInMemoryFileSystem: true,
      analysisScopeId: `watcher-dispose-${uniqueId}`,
      tsConfigFilePath: tsConfigPath,
    })

    await createProgramFileCache(project, projectPath, `entry-${uniqueId}`, () => {
      return 'value'
    })

    expect(invalidateProgramCachesByPath(projectPath)).toBeGreaterThan(0)

    disposeAnalysisWatchers()

    expect(invalidateProgramCachesByPath(projectPath)).toBe(0)

    const recreatedProject = getProgram({
      useInMemoryFileSystem: true,
      analysisScopeId: `watcher-dispose-${uniqueId}`,
      tsConfigFilePath: tsConfigPath,
    })

    expect(recreatedProject).not.toBe(project)
  })
})
