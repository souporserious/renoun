import type { SyntaxKind, Project } from '../utils/ts-morph.ts'

import type { ModuleExport } from '../utils/get-file-exports.ts'
import {
  getFileExports as baseGetFileExports,
  getFileExportMetadata as baseGetFileExportMetadata,
} from '../utils/get-file-exports.ts'
import { getFileExportStaticValue as baseGetFileExportStaticValue } from '../utils/get-file-export-static-value.ts'
import { getOutlineRanges as baseGetOutlineRanges } from '../utils/get-outline-ranges.ts'
import { transpileSourceFile as baseTranspileSourceFile } from '../utils/transpile-source-file.ts'
import type { OutlineRange } from '../utils/get-outline-ranges.ts'
import type { ProjectCacheDependency } from './cache.ts'
import { createProjectFileCache } from './cache.ts'

const FILE_EXPORTS_CACHE_NAME = 'fileExports'
const OUTLINE_RANGES_CACHE_NAME = 'outlineRanges'
const FILE_EXPORT_STATIC_VALUE_CACHE_NAME = 'fileExportStaticValue'
const TRANSPILE_SOURCE_FILE_CACHE_NAME = 'transpileSourceFile'

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

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
