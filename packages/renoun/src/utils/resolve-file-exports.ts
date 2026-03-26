import type { Node, Project, SourceFile } from './ts-morph.ts'

import { getDebugLogger } from './debug.ts'
import { getDeclarationLocation } from './get-declaration-location.ts'
import {
  getFileExportDeclaration,
  getFileExportsWithDependencies,
  type FileExportsWithDependenciesResult,
  type ModuleExport,
} from './get-file-exports.ts'
import { getJsDocMetadata } from './get-js-doc-metadata.ts'
import {
  resolveType,
  type Kind,
  type TypeFilter,
  withTypeResolutionMemoization,
} from './resolve-type.ts'
import { getTsMorph } from './ts-morph.ts'

const tsMorph = getTsMorph()

export interface ResolvedFileExportsResult {
  resolvedTypes: Kind[]
  dependencies: string[]
}

export interface ResolveFileExportsWithDependenciesOptions {
  seedFileExportsByFilePath?: ReadonlyMap<
    string,
    FileExportsWithDependenciesResult
  >
  readFreshResolvedFileExportsByFilePath?: (
    filePath: string
  ) => Promise<ResolvedFileExportsResult | undefined>
}

interface ResolveFileExportContext {
  project: Project
  filter?: TypeFilter
  dependencies: Set<string>
  fileExportsByFilePath: Map<string, FileExportsWithDependenciesResult>
  resolvedFileExportsByFilePath: Map<string, ResolvedFileExportsResult>
  pendingResolvedFileExportsByFilePath: Map<
    string,
    Promise<ResolvedFileExportsResult>
  >
  exportDeclarationsByNodeKey: Map<string, Node>
  resolvedTypesByExportKey: Map<string, Kind | undefined>
  resolvingFilePaths: Set<string>
  resolvingExportKeys: Set<string>
  readFreshResolvedFileExportsByFilePath?: (
    filePath: string
  ) => Promise<ResolvedFileExportsResult | undefined>
}

/**
 * Resolve all file export types in a single analysis pass.
 *
 * This avoids the repeated per-export RPC/cache overhead that large barrel
 * files would otherwise pay when rendering `<Reference source={file} />`.
 */
export async function resolveFileExportsWithDependencies(
  project: Project,
  filePath: string,
  filter?: TypeFilter,
  options?: ResolveFileExportsWithDependenciesOptions
): Promise<ResolvedFileExportsResult> {
  return getDebugLogger().trackOperation(
    'resolve-file-exports-with-dependencies',
    async () => {
      const context: ResolveFileExportContext = {
        project,
        ...(filter ? { filter } : {}),
        dependencies: new Set<string>(),
        fileExportsByFilePath: new Map<string, FileExportsWithDependenciesResult>(
          options?.seedFileExportsByFilePath
        ),
        resolvedFileExportsByFilePath: new Map<
          string,
          ResolvedFileExportsResult
        >(),
        pendingResolvedFileExportsByFilePath: new Map<
          string,
          Promise<ResolvedFileExportsResult>
        >(),
        exportDeclarationsByNodeKey: new Map<string, Node>(),
        resolvedTypesByExportKey: new Map<string, Kind | undefined>(),
        resolvingFilePaths: new Set<string>(),
        resolvingExportKeys: new Set<string>(),
        readFreshResolvedFileExportsByFilePath:
          options?.readFreshResolvedFileExportsByFilePath,
      }

      return withTypeResolutionMemoization(() =>
        resolveResolvedFileExports(filePath, context)
      )
    },
    {
      data: {
        filePath,
      },
    }
  ) as Promise<ResolvedFileExportsResult>
}

async function resolveResolvedFileExports(
  filePath: string,
  context: ResolveFileExportContext
): Promise<ResolvedFileExportsResult> {
  const cached = context.resolvedFileExportsByFilePath.get(filePath)

  if (cached) {
    for (const dependencyPath of cached.dependencies) {
      context.dependencies.add(dependencyPath)
    }

    return cached
  }

  const pending = context.pendingResolvedFileExportsByFilePath.get(filePath)

  if (pending) {
    const pendingResult = await pending

    for (const dependencyPath of pendingResult.dependencies) {
      context.dependencies.add(dependencyPath)
    }

    return pendingResult
  }

  if (context.resolvingFilePaths.has(filePath)) {
    return {
      resolvedTypes: [],
      dependencies: [filePath],
    }
  }

  const parentDependencies = context.dependencies
  const promise = (async () => {
    const restored =
      await context.readFreshResolvedFileExportsByFilePath?.(filePath)

    if (restored) {
      context.resolvedFileExportsByFilePath.set(filePath, restored)
      return restored
    }

    context.resolvingFilePaths.add(filePath)
    const fileExportsResult = getCachedFileExportsWithDependencies(
      filePath,
      context
    )
    const fileDependencies = new Set<string>(
      fileExportsResult.dependencies.length > 0
        ? fileExportsResult.dependencies
        : [filePath]
    )
    const fileContext: ResolveFileExportContext = {
      ...context,
      dependencies: fileDependencies,
    }

    try {
      const resolvedTypes: Kind[] = []

      for (const fileExport of fileExportsResult.exports) {
        const resolvedType = await resolveFileExportType(fileExport, fileContext)

        if (resolvedType) {
          resolvedTypes.push(resolvedType)
        }
      }

      const result = {
        resolvedTypes,
        dependencies: Array.from(fileDependencies),
      }

      context.resolvedFileExportsByFilePath.set(filePath, result)
      return result
    } finally {
      context.resolvingFilePaths.delete(filePath)
    }
  })()

  context.pendingResolvedFileExportsByFilePath.set(filePath, promise)

  try {
    const result = await promise

    if (parentDependencies) {
      for (const dependencyPath of result.dependencies) {
        parentDependencies.add(dependencyPath)
      }
    }

    return result
  } finally {
    if (context.pendingResolvedFileExportsByFilePath.get(filePath) === promise) {
      context.pendingResolvedFileExportsByFilePath.delete(filePath)
    }
  }
}

async function resolveFileExportType(
  fileExport: ModuleExport,
  context: ResolveFileExportContext
): Promise<Kind | undefined> {
  const cacheKey = createResolvedExportCacheKey(fileExport)

  if (context.resolvedTypesByExportKey.has(cacheKey)) {
    return context.resolvedTypesByExportKey.get(cacheKey)
  }

  if (context.resolvingExportKeys.has(cacheKey)) {
    return undefined
  }

  context.resolvingExportKeys.add(cacheKey)

  try {
    const exportDeclaration = getCachedFileExportDeclaration(fileExport, context)
    const namespaceType = await resolveNamespaceImportReExport(
      fileExport,
      exportDeclaration,
      context
    )

    if (namespaceType) {
      context.resolvedTypesByExportKey.set(cacheKey, namespaceType)
      return namespaceType
    }

    const resolvedType = resolveType(
      exportDeclaration.getType(),
      exportDeclaration,
      context.filter,
      undefined,
      context.dependencies
    )
    context.resolvedTypesByExportKey.set(cacheKey, resolvedType)
    return resolvedType
  } finally {
    context.resolvingExportKeys.delete(cacheKey)
  }
}

async function resolveNamespaceImportReExport(
  fileExport: ModuleExport,
  exportDeclaration: Node,
  context: ResolveFileExportContext
): Promise<Kind.Namespace | undefined> {
  const namespaceImportSourceFile = getNamespaceImportSourceFile(
    exportDeclaration,
    fileExport.name
  )

  if (!namespaceImportSourceFile) {
    return undefined
  }

  const namespaceFilePath = namespaceImportSourceFile.getFilePath()
  const namespaceResolution = await resolveResolvedFileExports(
    namespaceFilePath,
    context
  )

  return {
    ...getJsDocMetadata(exportDeclaration),
    kind: 'Namespace',
    name: fileExport.name,
    text: exportDeclaration.getText(),
    types: namespaceResolution.resolvedTypes,
    ...getDeclarationLocation(exportDeclaration),
  } satisfies Kind.Namespace
}

function getCachedFileExportsWithDependencies(
  filePath: string,
  context: ResolveFileExportContext
): FileExportsWithDependenciesResult {
  const cached = context.fileExportsByFilePath.get(filePath)
  if (cached) {
    return cached
  }

  const fileExports = getFileExportsWithDependencies(filePath, context.project)
  context.fileExportsByFilePath.set(filePath, fileExports)
  return fileExports
}

function getCachedFileExportDeclaration(
  fileExport: ModuleExport,
  context: ResolveFileExportContext
): Node {
  const cacheKey = createExportDeclarationCacheKey(fileExport)
  const cached = context.exportDeclarationsByNodeKey.get(cacheKey)

  if (cached) {
    return cached
  }

  const exportDeclaration = getFileExportDeclaration(
    fileExport.path,
    fileExport.position,
    fileExport.kind,
    context.project
  )
  context.exportDeclarationsByNodeKey.set(cacheKey, exportDeclaration)
  return exportDeclaration
}

function getNamespaceImportSourceFile(
  exportDeclaration: Node,
  exportName: string
): SourceFile | undefined {
  if (!tsMorph.Node.isExportSpecifier(exportDeclaration)) {
    if (!tsMorph.Node.isExportDeclaration(exportDeclaration)) {
      return undefined
    }

    const namespaceExport = exportDeclaration.getNamespaceExport()

    if (namespaceExport) {
      if (namespaceExport.getName() !== exportName) {
        return undefined
      }

      return getExportDeclarationModuleSourceFile(exportDeclaration)
    }

    for (const exportSpecifier of exportDeclaration.getNamedExports()) {
      const exportedName =
        exportSpecifier.getAliasNode()?.getText() ??
        exportSpecifier.getNameNode().getText()

      if (exportedName !== exportName) {
        continue
      }

      const sourceFile = getNamespaceImportSourceFile(
        exportSpecifier,
        exportName
      )

      if (sourceFile) {
        return sourceFile
      }
    }

    return undefined
  }

  for (const declaration of exportDeclaration.getLocalTargetDeclarations()) {
    if (!tsMorph.Node.isNamespaceImport(declaration)) {
      continue
    }

    const sourceFile = getNamespaceImportModuleSourceFile(declaration)
    if (sourceFile) {
      return sourceFile
    }
  }

  return undefined
}

function getNamespaceImportModuleSourceFile(
  namespaceImport: Node
): SourceFile | undefined {
  if (!tsMorph.Node.isNamespaceImport(namespaceImport)) {
    return undefined
  }

  const importDeclaration = namespaceImport.getFirstAncestorByKind(
    tsMorph.SyntaxKind.ImportDeclaration
  )

  if (!importDeclaration) {
    return undefined
  }

  try {
    return importDeclaration.getModuleSpecifierSourceFile() ?? undefined
  } catch {
    return undefined
  }
}

function getExportDeclarationModuleSourceFile(
  exportDeclaration: Node
): SourceFile | undefined {
  if (!tsMorph.Node.isExportDeclaration(exportDeclaration)) {
    return undefined
  }

  try {
    return exportDeclaration.getModuleSpecifierSourceFile() ?? undefined
  } catch {
    return undefined
  }
}

function createResolvedExportCacheKey(fileExport: ModuleExport): string {
  return `${fileExport.path}:${fileExport.position}:${fileExport.kind}:${fileExport.name}`
}

function createExportDeclarationCacheKey(fileExport: ModuleExport): string {
  return `${fileExport.path}:${fileExport.position}:${fileExport.kind}`
}
