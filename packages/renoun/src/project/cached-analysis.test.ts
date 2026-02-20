import { describe, expect, test } from 'vitest'

import { getTsMorph } from '../utils/ts-morph.ts'
import { getFileExports } from '../utils/get-file-exports.ts'
import { invalidateProjectFileCache } from './cache.ts'
import {
  getCachedFileExportStaticValue,
  getCachedFileExportText,
  resolveCachedTypeAtLocationWithDependencies,
} from './cached-analysis.ts'

const { Project } = getTsMorph()

describe('project cached analysis', () => {
  test('recomputes cached static export values after file invalidation', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const filePath = '/project/src/index.ts'

    project.createSourceFile(filePath, 'export const value = 1', {
      overwrite: true,
    })

    const [fileExport] = getFileExports(filePath, project)
    if (!fileExport) {
      throw new Error('[renoun] Expected a file export in cached-analysis test')
    }

    const first = await getCachedFileExportStaticValue(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })
    const second = await getCachedFileExportStaticValue(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })

    expect(first).toBe(1)
    expect(second).toBe(1)

    project.createSourceFile(filePath, 'export const value = 2', {
      overwrite: true,
    })
    invalidateProjectFileCache(project, filePath)

    const refreshed = await getCachedFileExportStaticValue(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })

    expect(refreshed).toBe(2)
  })

  test('recomputes cached file export text after file invalidation', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const filePath = '/project/src/index.ts'

    project.createSourceFile(filePath, 'export const value = 1', {
      overwrite: true,
    })

    const [fileExport] = getFileExports(filePath, project)
    if (!fileExport) {
      throw new Error('[renoun] Expected a file export in cached-analysis test')
    }

    const first = await getCachedFileExportText(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })
    const second = await getCachedFileExportText(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })

    expect(first).toContain('value = 1')
    expect(second).toContain('value = 1')

    project.createSourceFile(filePath, 'export const value = 2', {
      overwrite: true,
    })
    invalidateProjectFileCache(project, filePath)

    const refreshed = await getCachedFileExportText(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })

    expect(refreshed).toContain('value = 2')
  })

  test('tracks dependency files for cached type resolution and refreshes after dependency invalidation', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const filePath = '/project/src/index.ts'
    const dependencyPath = '/project/src/types.ts'

    project.createSourceFile(
      dependencyPath,
      'export interface Data { title: string }',
      {
        overwrite: true,
      }
    )
    project.createSourceFile(
      filePath,
      "import type { Data } from './types'\nexport const value: Data = { title: 'hello' }",
      {
        overwrite: true,
      }
    )

    const [fileExport] = getFileExports(filePath, project)
    if (!fileExport) {
      throw new Error('[renoun] Expected a file export in cached-analysis test')
    }

    const first = await resolveCachedTypeAtLocationWithDependencies(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })

    expect(first.dependencies).toContain(filePath)
    expect(first.dependencies).toContain(dependencyPath)
    expect(first.resolvedType).toBeDefined()

    project.createSourceFile(
      dependencyPath,
      'export interface Data { title: string; count: number }',
      {
        overwrite: true,
      }
    )
    invalidateProjectFileCache(project, dependencyPath)

    const refreshed = await resolveCachedTypeAtLocationWithDependencies(project, {
      filePath,
      position: fileExport.position,
      kind: fileExport.kind,
    })

    expect(refreshed.dependencies).toContain(dependencyPath)
    expect(refreshed.resolvedType).toBeDefined()
  })
})
