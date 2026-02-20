import type { SyntaxKind, Project } from '../utils/ts-morph.ts'
import { stableStringify } from '../utils/stable-serialization.ts'

import { serializeTypeFilterForCache } from '../file-system/cache-key.ts'
import type { ModuleExport } from '../utils/get-file-exports.ts'
import {
  getFileExports as baseGetFileExports,
  getFileExportMetadata as baseGetFileExportMetadata,
} from '../utils/get-file-exports.ts'
import { getFileExportStaticValue as baseGetFileExportStaticValue } from '../utils/get-file-export-static-value.ts'
import { getFileExportText as baseGetFileExportText } from '../utils/get-file-export-text.ts'
import { getOutlineRanges as baseGetOutlineRanges } from '../utils/get-outline-ranges.ts'
import {
  resolveTypeAtLocationWithDependencies as baseResolveTypeAtLocationWithDependencies,
  type ResolvedTypeAtLocationResult,
} from '../utils/resolve-type-at-location.ts'
import type { TypeFilter } from '../utils/resolve-type.ts'
import { transpileSourceFile as baseTranspileSourceFile } from '../utils/transpile-source-file.ts'
import type { OutlineRange } from '../utils/get-outline-ranges.ts'
import type { ProjectCacheDependency } from './cache.ts'
import { createProjectFileCache } from './cache.ts'

const FILE_EXPORTS_CACHE_NAME = 'fileExports'
const OUTLINE_RANGES_CACHE_NAME = 'outlineRanges'
const FILE_EXPORT_STATIC_VALUE_CACHE_NAME = 'fileExportStaticValue'
const FILE_EXPORT_TEXT_CACHE_NAME = 'fileExportText'
const RESOLVE_TYPE_AT_LOCATION_CACHE_NAME = 'resolveTypeAtLocation'
const TRANSPILE_SOURCE_FILE_CACHE_NAME = 'transpileSourceFile'

function getCompilerOptionsVersion(project: Project): string {
  return stableStringify(project.getCompilerOptions())
}

function toFileExportsDependencies(
  filePath: string,
  fileExports: ModuleExport[]
): ProjectCacheDependency[] {
  const dependencyPaths = new Set<string>([filePath])

  for (const fileExport of fileExports) {
    if (!fileExport.path) {
      continue
    }

    dependencyPaths.add(fileExport.path)
  }

  return Array.from(dependencyPaths.values()).map((path) => ({
    kind: 'file',
    path,
  }))
}

function toFileExportMetadataCacheName(
  name: string,
  position: number,
  kind: SyntaxKind
): string {
  return `fileExportMetadata:${name}:${position}:${kind}`
}

function toFileExportStaticValueCacheName(
  position: number,
  kind: SyntaxKind
): string {
  return `${FILE_EXPORT_STATIC_VALUE_CACHE_NAME}:${position}:${kind}`
}

function toFileExportTextCacheName(position: number, kind: SyntaxKind): string {
  return `${FILE_EXPORT_TEXT_CACHE_NAME}:${position}:${kind}`
}

function toResolvedTypeAtLocationCacheName(
  position: number,
  kind: SyntaxKind,
  filter?: TypeFilter
): string {
  const filterKey = filter ? serializeTypeFilterForCache(filter) : 'none'
  return `${RESOLVE_TYPE_AT_LOCATION_CACHE_NAME}:${position}:${kind}:${filterKey}`
}

export async function getCachedFileExports(
  project: Project,
  filePath: string
): Promise<ModuleExport[]> {
  return createProjectFileCache(
    project,
    filePath,
    FILE_EXPORTS_CACHE_NAME,
    () => baseGetFileExports(filePath, project),
    {
      deps: (fileExports) => toFileExportsDependencies(filePath, fileExports),
    }
  )
}

export async function getCachedOutlineRanges(
  project: Project,
  filePath: string
): Promise<OutlineRange[]> {
  return createProjectFileCache(
    project,
    filePath,
    OUTLINE_RANGES_CACHE_NAME,
    () => baseGetOutlineRanges(filePath, project),
    {
      deps: [
        {
          kind: 'file',
          path: filePath,
        },
      ],
    }
  )
}

export async function getCachedFileExportMetadata(
  project: Project,
  options: {
    name: string
    filePath: string
    position: number
    kind: SyntaxKind
  }
): Promise<Awaited<ReturnType<typeof baseGetFileExportMetadata>>> {
  return createProjectFileCache(
    project,
    options.filePath,
    toFileExportMetadataCacheName(options.name, options.position, options.kind),
    () =>
      baseGetFileExportMetadata(
        options.name,
        options.filePath,
        options.position,
        options.kind,
        project
      ),
    {
      deps: [
        {
          kind: 'file',
          path: options.filePath,
        },
        {
          kind: 'cache',
          filePath: options.filePath,
          cacheName: FILE_EXPORTS_CACHE_NAME,
        },
      ],
    }
  )
}

export async function getCachedFileExportStaticValue(
  project: Project,
  options: {
    filePath: string
    position: number
    kind: SyntaxKind
  }
): Promise<Awaited<ReturnType<typeof baseGetFileExportStaticValue>>> {
  return createProjectFileCache(
    project,
    options.filePath,
    toFileExportStaticValueCacheName(options.position, options.kind),
    () =>
      baseGetFileExportStaticValue(
        options.filePath,
        options.position,
        options.kind,
        project
      ),
    {
      deps: [
        {
          kind: 'file',
          path: options.filePath,
        },
        {
          kind: 'cache',
          filePath: options.filePath,
          cacheName: FILE_EXPORTS_CACHE_NAME,
        },
      ],
    }
  )
}

export async function getCachedFileExportText(
  project: Project,
  options: {
    filePath: string
    position: number
    kind: SyntaxKind
    includeDependencies?: boolean
  }
): Promise<string> {
  if (options.includeDependencies) {
    return baseGetFileExportText({
      filePath: options.filePath,
      position: options.position,
      kind: options.kind,
      includeDependencies: true,
      project,
    })
  }

  return createProjectFileCache(
    project,
    options.filePath,
    toFileExportTextCacheName(options.position, options.kind),
    () =>
      baseGetFileExportText({
        filePath: options.filePath,
        position: options.position,
        kind: options.kind,
        includeDependencies: false,
        project,
      }),
    {
      deps: [
        {
          kind: 'file',
          path: options.filePath,
        },
      ],
    }
  )
}

export async function resolveCachedTypeAtLocationWithDependencies(
  project: Project,
  options: {
    filePath: string
    position: number
    kind: SyntaxKind
    filter?: TypeFilter
    isInMemoryFileSystem?: boolean
  }
): Promise<ResolvedTypeAtLocationResult> {
  const compilerOptionsVersion = getCompilerOptionsVersion(project)
  return createProjectFileCache(
    project,
    options.filePath,
    toResolvedTypeAtLocationCacheName(
      options.position,
      options.kind,
      options.filter
    ),
    () =>
      baseResolveTypeAtLocationWithDependencies(
        project,
        options.filePath,
        options.position,
        options.kind,
        options.filter,
        options.isInMemoryFileSystem
      ),
    {
      deps: (result) => {
        const dependencyPaths = new Set<string>([
          options.filePath,
          ...(result.dependencies ?? []),
        ])
        return [
          ...Array.from(dependencyPaths.values()).map((path) => ({
            kind: 'file' as const,
            path,
          })),
          {
            kind: 'const' as const,
            name: 'project:compiler-options',
            version: compilerOptionsVersion,
          },
        ]
      },
    }
  )
}

export async function transpileCachedSourceFile(
  project: Project,
  filePath: string
): Promise<string> {
  return createProjectFileCache(
    project,
    filePath,
    TRANSPILE_SOURCE_FILE_CACHE_NAME,
    () => baseTranspileSourceFile(filePath, project),
    {
      deps: [
        {
          kind: 'file',
          path: filePath,
        },
        {
          kind: 'const',
          name: 'project:compiler-options',
          version: getCompilerOptionsVersion(project),
        },
      ],
    }
  )
}
