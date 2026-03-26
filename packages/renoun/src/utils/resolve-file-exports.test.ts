import { describe, expect, test, vi } from 'vitest'

import { getTsMorph } from './ts-morph.ts'
import * as getFileExportsModule from './get-file-exports.ts'
import { resolveFileExportsWithDependencies } from './resolve-file-exports.ts'

const { Project, ts } = getTsMorph()

function createJavaScriptProject() {
  return new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true,
      checkJs: true,
    },
  })
}

describe('resolveFileExportsWithDependencies', () => {
  test('resolves relative re-export graphs without losing dependencies', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })

    project.createSourceFile('/project/foo.ts', 'export const foo = 1', {
      overwrite: true,
    })
    project.createSourceFile('/project/bar.ts', 'export const bar = "x"', {
      overwrite: true,
    })
    project.createSourceFile(
      '/project/index.ts',
      "export { foo } from './foo'\nexport * from './bar'\nexport const baz = true",
      {
        overwrite: true,
      }
    )

    const result = await resolveFileExportsWithDependencies(
      project,
      '/project/index.ts'
    )

    const resolvedNames = result.resolvedTypes
      .map((type) => ('name' in type ? type.name : undefined))
      .filter((name): name is string => Boolean(name))
      .sort()

    expect(resolvedNames).toEqual(['bar', 'baz', 'foo'])
    expect(result.dependencies.sort()).toEqual([
      '/project/bar.ts',
      '/project/foo.ts',
      '/project/index.ts',
    ])
  })

  test('resolves namespace-import re-exports as namespaces and preserves dependencies', async () => {
    const project = createJavaScriptProject()

    project.createSourceFile(
      '/project/shared.js',
      'export const shared = "shared"',
      {
        overwrite: true,
        scriptKind: ts.ScriptKind.JS,
      }
    )
    project.createSourceFile(
      '/project/foo.js',
      [
        "export * from './shared.js'",
        'export const alpha = 1',
        'export function beta() { return 2 }',
      ].join('\n'),
      {
        overwrite: true,
        scriptKind: ts.ScriptKind.JS,
      }
    )
    project.createSourceFile(
      '/project/index.js',
      ["import * as Foo from './foo.js'", 'export { Foo }'].join('\n'),
      {
        overwrite: true,
        scriptKind: ts.ScriptKind.JS,
      }
    )

    const result = await resolveFileExportsWithDependencies(
      project,
      '/project/index.js'
    )

    const namespace = result.resolvedTypes.find(
      (type) => type.kind === 'Namespace' && 'name' in type && type.name === 'Foo'
    )

    expect(namespace).toBeDefined()
    expect(namespace?.kind).toBe('Namespace')

    if (!namespace || namespace.kind !== 'Namespace') {
      throw new Error('expected Foo namespace export to resolve')
    }

    const memberNames = namespace.types
      .map((type) => ('name' in type ? type.name : undefined))
      .filter((name): name is string => Boolean(name))
      .sort()

    expect(memberNames).toEqual(['alpha', 'beta', 'shared'])
    expect(result.dependencies.sort()).toEqual([
      '/project/foo.js',
      '/project/index.js',
      '/project/shared.js',
    ])
  })

  test('resolves large barrels with namespace-import re-exports', async () => {
    const project = createJavaScriptProject()
    const exportCount = 250
    const largeModuleText = Array.from(
      { length: exportCount },
      (_, index) => `export const value${index} = ${index};`
    ).join('\n')

    project.createSourceFile('/project/large.js', largeModuleText, {
      overwrite: true,
      scriptKind: ts.ScriptKind.JS,
    })
    project.createSourceFile(
      '/project/index.js',
      [
        "import * as Large from './large.js'",
        'export { Large }',
        "export * from './large.js'",
      ].join('\n'),
      {
        overwrite: true,
        scriptKind: ts.ScriptKind.JS,
      }
    )

    const result = await resolveFileExportsWithDependencies(
      project,
      '/project/index.js'
    )

    const namespace = result.resolvedTypes.find(
      (type) =>
        type.kind === 'Namespace' && 'name' in type && type.name === 'Large'
    )

    expect(result.resolvedTypes).toHaveLength(exportCount + 1)
    expect(namespace).toBeDefined()
    expect(namespace?.kind).toBe('Namespace')

    if (!namespace || namespace.kind !== 'Namespace') {
      throw new Error('expected Large namespace export to resolve')
    }

    expect(namespace.types).toHaveLength(exportCount)
    expect(result.dependencies.sort()).toEqual([
      '/project/index.js',
      '/project/large.js',
    ])
  })

  test('reuses seeded root file exports without rebuilding the barrel graph', async () => {
    const project = new Project({
      useInMemoryFileSystem: true,
    })

    project.createSourceFile('/project/foo.ts', 'export const foo = 1', {
      overwrite: true,
    })
    project.createSourceFile('/project/bar.ts', 'export const bar = "x"', {
      overwrite: true,
    })
    project.createSourceFile(
      '/project/index.ts',
      "export { foo } from './foo'\nexport * from './bar'\nexport const baz = true",
      {
        overwrite: true,
      }
    )

    const seededRootExports =
      getFileExportsModule.getFileExportsWithDependencies(
        '/project/index.ts',
        project
      )
    const fileExportsSpy = vi.spyOn(
      getFileExportsModule,
      'getFileExportsWithDependencies'
    )

    const result = await resolveFileExportsWithDependencies(
      project,
      '/project/index.ts',
      undefined,
      {
        seedFileExportsByFilePath: new Map([
          ['/project/index.ts', seededRootExports],
        ]),
      }
    )

    expect(result.resolvedTypes).toHaveLength(3)
    expect(fileExportsSpy).not.toHaveBeenCalled()

    fileExportsSpy.mockRestore()
  })

  test('reuses fresh child resolved export artifacts for namespace re-exports', async () => {
    const project = createJavaScriptProject()

    project.createSourceFile(
      '/project/foo.js',
      ['export const alpha = 1', 'export function beta() { return 2 }'].join(
        '\n'
      ),
      {
        overwrite: true,
        scriptKind: ts.ScriptKind.JS,
      }
    )
    project.createSourceFile(
      '/project/index.js',
      ["import * as Foo from './foo.js'", 'export { Foo }'].join('\n'),
      {
        overwrite: true,
        scriptKind: ts.ScriptKind.JS,
      }
    )

    const childResult = await resolveFileExportsWithDependencies(
      project,
      '/project/foo.js'
    )
    const fileExportsSpy = vi.spyOn(
      getFileExportsModule,
      'getFileExportsWithDependencies'
    )

    const result = await resolveFileExportsWithDependencies(
      project,
      '/project/index.js',
      undefined,
      {
        readFreshResolvedFileExportsByFilePath: async (filePath) =>
          filePath === '/project/foo.js' ? childResult : undefined,
      }
    )

    const namespace = result.resolvedTypes.find(
      (type) => type.kind === 'Namespace' && 'name' in type && type.name === 'Foo'
    )

    expect(namespace).toBeDefined()
    expect(namespace?.kind).toBe('Namespace')

    if (!namespace || namespace.kind !== 'Namespace') {
      throw new Error('expected Foo namespace export to resolve')
    }

    const memberNames = namespace.types
      .map((type) => ('name' in type ? type.name : undefined))
      .filter((name): name is string => Boolean(name))
      .sort()

    expect(memberNames).toEqual(['alpha', 'beta'])
    expect(fileExportsSpy).toHaveBeenCalledTimes(1)
    expect(fileExportsSpy).toHaveBeenCalledWith('/project/index.js', project)

    fileExportsSpy.mockRestore()
  })
})
