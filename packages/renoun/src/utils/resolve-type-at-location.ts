import { serializeTypeFilterForCache } from '../file-system/cache-key.ts'
import { hashString } from './stable-serialization.ts'
import { getTsMorph } from './ts-morph.ts'
import type { Project, SyntaxKind as TsMorphSyntaxKind } from './ts-morph.ts'

import { getDebugLogger } from './debug.ts'
import type { Kind, TypeFilter } from './resolve-type.ts'
import { resolveType } from './resolve-type.ts'
import {
  emitTelemetryCounter,
  emitTelemetryEvent,
  emitTelemetryHistogram,
} from './telemetry.ts'

const { SyntaxKind } = getTsMorph()

export interface ResolvedTypeAtLocationResult {
  resolvedType?: Kind
  dependencies: string[]
}

/** Process all properties of a given type including their default values. */
export async function resolveTypeAtLocationWithDependencies(
  project: Project,
  filePath: string,
  position: number,
  kind: TsMorphSyntaxKind,
  filter?: TypeFilter,
  _isInMemoryFileSystem = false
): Promise<ResolvedTypeAtLocationResult> {
  const filterKey = filter ? serializeTypeFilterForCache(filter) : 'none'
  const typeId = `${filePath}:${position}:${kind}:${filterKey}`
  const startedAt = performance.now()
  const tags = {
    kind: SyntaxKind[kind],
    hasFilter: filter ? 'true' : 'false',
  }

  try {
    const result = await getDebugLogger().trackOperation(
      'resolveTypeAtLocationWithDependencies',
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

        getDebugLogger().logCacheOperation('miss', typeId, {
          filePath,
          position,
          kind: SyntaxKind[kind],
        })

        const dependencies = new Set<string>([filePath])
        const resolvedType = resolveType(
          exportDeclaration.getType(),
          exportDeclaration,
          filter,
          undefined,
          dependencies
        )

        const duration =
          Math.round((performance.now() - startedAt) * 1000) / 1000
        getDebugLogger().logTypeResolution(
          filePath,
          position,
          SyntaxKind[kind],
          duration
        )

        return {
          resolvedType,
          dependencies: Array.from(dependencies),
        }
      },
      {
        data: { filePath, position, kind: SyntaxKind[kind] },
      }
    )

    const durationMs = performance.now() - startedAt
    emitTelemetryHistogram({
      name: 'renoun.analysis.type_resolution_ms',
      value: durationMs,
      tags,
    })
    emitTelemetryEvent({
      name: 'renoun.analysis.type_resolution',
      tags,
      fields: {
        durationMs,
        dependencyCount: result.dependencies.length,
        requestHash: hashString(typeId).slice(0, 12),
      },
    })

    return result
  } catch (error) {
    const durationMs = performance.now() - startedAt
    emitTelemetryCounter({
      name: 'renoun.analysis.type_resolution_error_count',
      tags,
    })
    emitTelemetryEvent({
      name: 'renoun.analysis.type_resolution_error',
      tags,
      fields: {
        durationMs,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      },
    })
    throw error
  }
}
