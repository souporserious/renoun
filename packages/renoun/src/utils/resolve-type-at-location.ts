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
  const startTime = Date.now()

  return debug.trackAsyncOperation(
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
        const result = await resolveType(
          exportDeclarationType,
          exportDeclaration,
          filter,
          undefined
        )

        const duration = Date.now() - startTime
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
          const duration = Date.now() - startTime
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
      const resolvedType = await resolveType(
        exportDeclarationType,
        exportDeclaration,
        filter,
        undefined,
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

      debug.logCacheOperation('set', typeId, {
        filePath,
        position,
        kind: SyntaxKind[kind],
      })

      dependencies.clear()

      const duration = Date.now() - startTime
      debug.logTypeResolution(filePath, position, SyntaxKind[kind], duration)

      return resolvedType
    },
    { data: { filePath, position, kind: SyntaxKind[kind], isMemoryFileSystem } }
  )
}
