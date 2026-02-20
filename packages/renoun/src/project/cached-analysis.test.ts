import { describe, expect, test, vi } from 'vitest'

import { getTsMorph } from '../utils/ts-morph.ts'
import { getFileExports } from '../utils/get-file-exports.ts'
import {
  collectTypeScriptMetadata,
  type GetTokensOptions,
} from '../utils/get-tokens.ts'
import { invalidateProjectFileCache } from './cache.ts'
import {
  getCachedFileExportStaticValue,
  getCachedFileExportText,
  getCachedSourceTextMetadata,
  getCachedTokens,
  resolveCachedTypeAtLocationWithDependencies,
} from './cached-analysis.ts'

const { Project } = getTsMorph()

function createTextMateToken(value: string) {
  const isWhiteSpace = /^\s+$/.test(value)
  return {
    value,
    start: 0,
    end: value.length,
    style: {
      color: '',
      backgroundColor: '',
      fontStyle: '',
      fontWeight: '',
      textDecoration: '',
    },
    hasTextStyles: false,
    isBaseColor: true,
    isWhiteSpace,
  }
}

describe('project cached analysis', () => {
  test('reuses cached source text metadata for identical inputs', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })

    const createSourceFileSpy = vi.spyOn(project, 'createSourceFile')
    const source = `const cachedMetadataValue = ${Date.now()}`

    const first = await getCachedSourceTextMetadata(project, {
      value: source,
      language: 'ts',
      shouldFormat: false,
    })
    const second = await getCachedSourceTextMetadata(project, {
      value: source,
      language: 'ts',
      shouldFormat: false,
    })

    expect(first.value).toBe(second.value)
    expect(first.filePath).toBe(second.filePath)
    expect(createSourceFileSpy).toHaveBeenCalledTimes(1)
  })

  test('reuses cached tokens for identical inputs', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })
    const filePath = `/project/src/token-cache-${Date.now()}.ts`
    const source = 'const value = 1'

    project.createSourceFile(filePath, source, {
      overwrite: true,
    })

    const highlighter: GetTokensOptions['highlighter'] = {
      async tokenize() {
        return [[createTextMateToken(source)]]
      },
      async *stream() {
        yield [createTextMateToken(source)]
      },
    }

    let metadataCalls = 0
    const metadataCollector: GetTokensOptions['metadataCollector'] = async (
      ...args
    ) => {
      metadataCalls += 1
      return collectTypeScriptMetadata(...args)
    }

    await getCachedTokens(project, {
      value: source,
      language: 'ts',
      filePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
    })
    await getCachedTokens(project, {
      value: source,
      language: 'ts',
      filePath,
      theme: 'default',
      allowErrors: true,
      highlighter,
      metadataCollector,
    })

    expect(metadataCalls).toBe(1)
  })

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
