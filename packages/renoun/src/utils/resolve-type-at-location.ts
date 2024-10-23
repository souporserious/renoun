import type { Project } from 'ts-morph'
import { statSync } from 'node:fs'

import { waitForRefreshingProjects } from '../project/get-project.js'
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
  filter?: SymbolFilter
) {
  await waitForRefreshingProjects()

  const typeId = `${filePath}:${position}`
  const sourceFile = project.addSourceFileAtPath(filePath)
  const declaration = sourceFile.getDescendantAtPos(position)

  if (!declaration) {
    throw new Error(
      `[renoun] Could not resolve type at position: ${position}. Try restarting the server or file an issue if you continue to encounter this error.`
    )
  }

  const exportDeclaration = declaration.getParentOrThrow()
  const exportDeclarationType = exportDeclaration.getType()
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
