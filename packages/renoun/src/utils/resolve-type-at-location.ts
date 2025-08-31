import type { Project } from 'ts-morph'
import { SyntaxKind } from 'ts-morph'

import { debug } from './debug.js'
import type { Kind, TypeFilter } from './resolve-type.js'
import { resolveType } from './resolve-type.js'

export const resolvedTypeCache = new Map<
  string,
  {
    resolvedType?: Kind
    dependencies: Map<string, number>
  }
>()

/** Process all properties of a given type including their default values. */
export async function resolveTypeAtLocation(
  project: Project,
  filePath: string,
  position: number,
  kind: SyntaxKind,
  filter?: TypeFilter,
  isMemoryFileSystem = false
) {
  const typeId = `${filePath}:${position}:${kind}`
  const startTime = performance.now()

  return debug.trackOperation(
    'resolveTypeAtLocation',
    async () => {
      const sourceFile = project.addSourceFileAtPath(filePath)

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
        const result = resolveType(
          exportDeclarationType,
          exportDeclaration,
          filter,
          undefined
        )

        const duration =
          Math.round((performance.now() - startTime) * 1000) / 1000
        debug.logTypeResolution(filePath, position, SyntaxKind[kind], duration)

        return result
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
          debug.logCacheOperation('hit', typeId, {
            filePath,
            position,
            kind: SyntaxKind[kind],
          })
          const duration =
            Math.round((performance.now() - startTime) * 1000) / 1000
          debug.logTypeResolution(
            filePath,
            position,
            SyntaxKind[kind],
            duration
          )
          return cacheEntry.resolvedType
        }
      }

      debug.logCacheOperation('miss', typeId, {
        filePath,
        position,
        kind: SyntaxKind[kind],
      })

      const dependencies = new Set<string>([filePath])
      const resolvedType = resolveType(
        exportDeclarationType,
        exportDeclaration,
        filter,
        undefined,
        dependencies
      )
      const dependencyTimestamps = new Map<string, number>()

      for (const depFilePath of dependencies) {
        try {
          const depLastModified = statSync(depFilePath).mtimeMs
          dependencyTimestamps.set(depFilePath, depLastModified)
        } catch {
          // File might have been deleted; skip it
        }
      }

      resolvedTypeCache.set(typeId, {
        resolvedType,
        dependencies: dependencyTimestamps,
      })

      const duration = Math.round((performance.now() - startTime) * 1000) / 1000
      debug.logTypeResolution(filePath, position, SyntaxKind[kind], duration)

      return resolvedType
    },
    {
      data: { filePath, position, kind: SyntaxKind[kind] },
    }
  )
}
