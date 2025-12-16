import { getTsMorph } from './ts-morph.ts'
import type { Project, SyntaxKind as TsMorphSyntaxKind } from './ts-morph.ts'

import { getDebugLogger } from './debug.ts'
import type { Kind, TypeFilter } from './resolve-type.ts'
import { resolveType, resetTypeResolutionCaches } from './resolve-type.ts'
import {
  initDiskCache,
  getDiskCacheEntry,
  setDiskCacheEntry,
} from './resolve-type-disk-cache.ts'

const { SyntaxKind } = getTsMorph()

// Track if disk cache has been initialized for this project
let diskCacheInitialized = false

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
  kind: TsMorphSyntaxKind,
  filter?: TypeFilter,
  isMemoryFileSystem = false
) {
  const typeId = `${filePath}:${position}:${kind}`
  const startTime = performance.now()

  return getDebugLogger().trackOperation(
    'resolveTypeAtLocation',
    async () => {
      const sourceFile = project.addSourceFileAtPath(filePath)

      const declaration = sourceFile.getDescendantAtPos(position)

      if (!declaration) {
        throw new Error(
          `[renoun] Could not resolve type for file path "${filePath}" at position "${position}". Try restarting the server or file an issue if you continue to encounter this error.`
        )
      }

      const exportDeclaration =
        declaration.getKind() === kind
          ? declaration
          : declaration.getFirstAncestorByKind(kind)

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
        getDebugLogger().logTypeResolution(
          filePath,
          position,
          SyntaxKind[kind],
          duration
        )

        return result
      }

      const { statSync } = await import('node:fs')

      // Initialize disk cache on first use (in the consuming project, not the analyzed project)
      if (!diskCacheInitialized) {
        initDiskCache(process.cwd())
        diskCacheInitialized = true
      }

      // Check memory cache first (fastest)
      const memoryCacheEntry = resolvedTypeCache.get(typeId)

      if (memoryCacheEntry) {
        let dependenciesChanged = false

        for (const [
          depFilePath,
          cachedDepLastModified,
        ] of memoryCacheEntry.dependencies) {
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
          getDebugLogger().logCacheOperation('hit', typeId, {
            filePath,
            position,
            kind: SyntaxKind[kind],
          })
          const duration =
            Math.round((performance.now() - startTime) * 1000) / 1000
          getDebugLogger().logTypeResolution(
            filePath,
            position,
            SyntaxKind[kind],
            duration
          )
          return memoryCacheEntry.resolvedType
        }
      }

      // Check disk cache if memory cache missed
      if (!memoryCacheEntry && diskCacheInitialized) {
        const diskEntry = getDiskCacheEntry(typeId)
        if (diskEntry) {
          // Load into memory cache
          const deps = new Map(Object.entries(diskEntry.dependencies))
          resolvedTypeCache.set(typeId, {
            resolvedType: diskEntry.resolvedType,
            dependencies: deps,
          })
          const duration =
            Math.round((performance.now() - startTime) * 1000) / 1000
          getDebugLogger().logTypeResolution(
            filePath,
            position,
            SyntaxKind[kind],
            duration
          )
          return diskEntry.resolvedType
        }
      }

      getDebugLogger().logCacheOperation('miss', typeId, {
        filePath,
        position,
        kind: SyntaxKind[kind],
      })

      const dependencies = new Set<string>([filePath])

      // Reset internal caches before each type resolution
      resetTypeResolutionCaches()

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

      // Store in memory cache
      resolvedTypeCache.set(typeId, {
        resolvedType,
        dependencies: dependencyTimestamps,
      })

      // Store in disk cache (async, debounced)
      if (diskCacheInitialized) {
        setDiskCacheEntry(typeId, resolvedType, dependencyTimestamps)
      }

      const duration = Math.round((performance.now() - startTime) * 1000) / 1000
      getDebugLogger().logTypeResolution(
        filePath,
        position,
        SyntaxKind[kind],
        duration
      )

      return resolvedType
    },
    {
      data: { filePath, position, kind: SyntaxKind[kind] },
    }
  )
}
