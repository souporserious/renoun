import type { Node, Project, SourceFile } from './ts-morph.ts'

import { getDebugLogger } from './debug.ts'
import { getDeclarationLocation } from './get-declaration-location.ts'
import {
  getFileExportDeclaration,
  getFileExportsWithDependencies,
  type ModuleExport,
} from './get-file-exports.ts'
import { getJsDocMetadata } from './get-js-doc-metadata.ts'
import { resolveType, type Kind, type TypeFilter } from './resolve-type.ts'
import { getTsMorph } from './ts-morph.ts'

const tsMorph = getTsMorph()

export interface ResolvedFileExportsResult {
  resolvedTypes: Kind[]
  dependencies: string[]
}

interface ResolveFileExportContext {
  project: Project
  filter?: TypeFilter
  dependencies: Set<string>
  resolvedTypesByExportKey: Map<string, Kind | undefined>
  resolvingExportKeys: Set<string>
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
  filter?: TypeFilter
): Promise<ResolvedFileExportsResult> {
  return getDebugLogger().trackOperation(
    'resolve-file-exports-with-dependencies',
    async () => {
      const { exports: fileExports, dependencies: fileDependencies } =
        getFileExportsWithDependencies(filePath, project)
      const dependencies = new Set<string>(
        fileDependencies.length > 0 ? fileDependencies : [filePath]
      )
      const resolvedTypes: Kind[] = []
      const context: ResolveFileExportContext = {
        project,
        filter,
        dependencies,
        resolvedTypesByExportKey: new Map<string, Kind | undefined>(),
        resolvingExportKeys: new Set<string>(),
      }

      for (const fileExport of fileExports) {
        const resolvedType = resolveFileExportType(fileExport, context)

        if (resolvedType) {
          resolvedTypes.push(resolvedType)
        }
      }

      return {
        resolvedTypes,
        dependencies: Array.from(dependencies),
      }
    },
    {
      data: {
        filePath,
      },
    }
  ) as Promise<ResolvedFileExportsResult>
}

function resolveFileExportType(
  fileExport: ModuleExport,
  context: ResolveFileExportContext
): Kind | undefined {
  const cacheKey = createResolvedExportCacheKey(fileExport)

  if (context.resolvedTypesByExportKey.has(cacheKey)) {
    return context.resolvedTypesByExportKey.get(cacheKey)
  }

  if (context.resolvingExportKeys.has(cacheKey)) {
    return undefined
  }

  context.resolvingExportKeys.add(cacheKey)

  try {
    const exportDeclaration = getFileExportDeclaration(
      fileExport.path,
      fileExport.position,
      fileExport.kind,
      context.project
    )
    const namespaceType = resolveNamespaceImportReExport(
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

function resolveNamespaceImportReExport(
  fileExport: ModuleExport,
  exportDeclaration: Node,
  context: ResolveFileExportContext
): Kind.Namespace | undefined {
  const namespaceImportSourceFile = getNamespaceImportSourceFile(
    exportDeclaration,
    fileExport.name
  )

  if (!namespaceImportSourceFile) {
    return undefined
  }

  const namespaceFilePath = namespaceImportSourceFile.getFilePath()
  const {
    exports: namespaceExports,
    dependencies: namespaceDependencies,
  } = getFileExportsWithDependencies(namespaceFilePath, context.project)

  for (const dependencyPath of namespaceDependencies) {
    context.dependencies.add(dependencyPath)
  }

  const types: Kind[] = []

  for (const namespaceExport of namespaceExports) {
    const resolvedType = resolveFileExportType(namespaceExport, context)

    if (resolvedType) {
      types.push(resolvedType)
    }
  }

  return {
    ...getJsDocMetadata(exportDeclaration),
    kind: 'Namespace',
    name: fileExport.name,
    text: exportDeclaration.getText(),
    types,
    ...getDeclarationLocation(exportDeclaration),
  } satisfies Kind.Namespace
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
