import type { Project } from 'ts-morph'
import { SyntaxKind } from 'ts-morph'

import {
  resolveType,
  type ResolvedType,
  type SymbolFilter,
} from './resolve-type.js'

export const resolvedTypeCache = new Map<
  string,
  {
    resolvedType?: ResolvedType
    dependencies: Map<string, number>
  }
>()

/** Process all properties of a given type including their default values. */
export async function resolveTypeAtLocation(
  project: Project,
  filePath: string,
  position: number,
  kind: SyntaxKind,
  filter?: SymbolFilter,
  isMemoryFileSystem = false
) {
  const typeId = `${filePath}:${position}:${kind}`
  const sourceFile = project.addSourceFileAtPath(filePath)

  // TODO: there is a bug in the `getProject` watch implementation and the `waitForRefreshingProjects` utility
  // that currently requires refreshing the file every time
  if (process.env.NODE_ENV === 'development') {
    await sourceFile.refreshFromFileSystem()
  }

  let declaration = sourceFile.getDescendantAtPos(position)

  if (!declaration) {
    throw new Error(
      `[renoun] Could not resolve type for file path "${filePath}" at position "${position}". Try restarting the server or file an issue if you continue to encounter this error.`
    )
  }

  const exportDeclaration = declaration.getFirstAncestorByKind(kind)

  if (!exportDeclaration) {
    throw new Error(
      `[renoun] Could not resolve type for file path "${filePath}" at position "${position}". No ancestor of kind "${SyntaxKind[kind]}" was found starting from: "${declaration.getParentOrThrow().getText()}".`
    )
  }

  const exportDeclarationType = exportDeclaration.getType()

  if (isMemoryFileSystem) {
    // Skip dependency tracking and caching for memory file systems
    return resolveType(
      exportDeclarationType,
      exportDeclaration,
      filter,
      true,
      undefined,
      false
    )
  }

  const { statSync } = await import('node:fs')
  const cacheEntry = resolvedTypeCache.get(typeId)

  if (cacheEntry) {
    let dependenciesChanged = false

    for (const [
      depFilePath,
      cachedDepLastModified,
    ] of cacheEntry.dependencies) {
      let depLastModified: number
      try {
        depLastModified = statSync(depFilePath).mtimeMs
      } catch {
        // File might have been deleted; invalidate the cache
        dependenciesChanged = true
        break
      }
      if (depLastModified !== cachedDepLastModified) {
        dependenciesChanged = true
        break
      }
    }

    if (!dependenciesChanged) {
      return cacheEntry.resolvedType
    }
  }

  const dependencies = new Set<string>([filePath])
  const resolvedType = resolveType(
    exportDeclarationType,
    exportDeclaration,
    filter,
    true,
    undefined,
    false,
    dependencies
  )

  resolvedTypeCache.set(typeId, {
    resolvedType,
    dependencies: new Map(
      Array.from(dependencies).map((filePath) => [
        filePath,
        statSync(filePath).mtimeMs,
      ])
    ),
  })

  dependencies.clear()

  return resolvedType
}
